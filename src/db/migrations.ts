/**
 * 版本化数据库迁移机制。
 *
 * 设计要点：
 * - 版本号记录在 SQLite 自带的 `PRAGMA user_version` 上，不额外建表、无鸡生蛋问题。
 * - 每个迁移在**独占事务**中执行：SQL + 版本号提升要么一起成功，要么一起回滚。
 * - 数据库版本高于应用支持的版本时**拒绝启动**（抛出 MigrationError），
 *   绝不自动降级、绝不删除重建文件 —— 这是「不静默覆盖用户数据」的硬约束。
 */

import { isAppError, MigrationError } from '@/domain/errors';

export type SqlValue = string | number | null;

/** 迁移所需的最小数据库能力，便于用内存 SQLite 做单元测试。 */
export interface MigrationDatabase {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
  withExclusiveTransactionAsync(task: (txn: MigrationDatabase) => Promise<void>): Promise<void>;
}

export interface Migration {
  /** 从 1 开始，必须连续递增 */
  version: number;
  name: string;
  /** 按顺序执行的 SQL 语句 */
  statements?: readonly string[];
  /** 需要搬运数据时使用的回调，与 statements 二选一或并用 */
  up?: (db: MigrationDatabase) => Promise<void>;
}

export interface MigrationResult {
  /** 迁移前的版本 */
  from: number;
  /** 迁移后的版本 */
  to: number;
  /** 本次实际执行的版本号列表 */
  applied: readonly number[];
}

const USER_VERSION_SQL = 'PRAGMA user_version';

/** 迁移列表本身出错属于开发期错误，早失败好过带着坏迁移上线。 */
export function validateMigrations(migrations: readonly Migration[]): void {
  let expected = 1;
  for (const migration of migrations) {
    if (migration.version !== expected) {
      throw new MigrationError(
        `迁移版本号必须从 1 开始且连续递增：期望 ${expected}，实际 ${migration.version}`,
        { details: { migration: migration.name } },
      );
    }
    if (!migration.name) {
      throw new MigrationError(`迁移 v${migration.version} 缺少名称`);
    }
    const hasStatements = (migration.statements?.length ?? 0) > 0;
    if (!hasStatements && !migration.up) {
      throw new MigrationError(`迁移 v${migration.version} (${migration.name}) 没有可执行内容`);
    }
    expected += 1;
  }
}

/** 读取当前数据库 schema 版本，0 表示全新数据库。 */
export async function readSchemaVersion(db: MigrationDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(USER_VERSION_SQL);
  const value = row?.user_version ?? 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new MigrationError(`无法解析数据库版本号：${String(value)}`);
  }
  return value;
}

/**
 * 按顺序应用所有未执行的迁移。
 * 失败时抛出 MigrationError，调用方必须中断启动流程（不得继续使用该连接）。
 */
export async function runMigrations(
  db: MigrationDatabase,
  migrations: readonly Migration[],
): Promise<MigrationResult> {
  validateMigrations(migrations);

  const from = await readSchemaVersion(db);
  const target = migrations.length === 0 ? 0 : (migrations[migrations.length - 1]?.version ?? 0);

  if (from > target) {
    throw new MigrationError(
      `数据库版本（${from}）高于当前应用支持的版本（${target}）。` +
        `请升级应用；本应用不会自动降级，也不会删除或重建数据库文件。`,
      { details: { databaseVersion: from, appVersion: target } },
    );
  }

  const pending = migrations.filter((migration) => migration.version > from);
  const applied: number[] = [];

  for (const migration of pending) {
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const statement of migration.statements ?? []) {
          await txn.execAsync(statement);
        }
        if (migration.up) {
          await migration.up(txn);
        }
        await txn.execAsync(`${USER_VERSION_SQL} = ${migration.version}`);
      });
      applied.push(migration.version);
    } catch (error) {
      if (isAppError(error) && error.code === 'MIGRATION') {
        throw error;
      }
      throw new MigrationError(
        `迁移 v${migration.version} (${migration.name}) 执行失败：${describe(error)}`,
        {
          cause: error,
          details: { migration: migration.name, version: migration.version, from },
        },
      );
    }
  }

  return { from, to: target, applied };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
