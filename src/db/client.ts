/**
 * 数据库连接的唯一入口。
 *
 * 硬约束（对应「不得静默创建空数据库覆盖旧数据」）：
 * 打开失败或迁移失败时，只关闭连接并抛出错误，
 * 既不 delete 也不重建 .db 文件，让用户数据保持原样，交由上层提示与重试。
 */

import * as SQLite from 'expo-sqlite';

import { isAppError, StorageError } from '@/domain/errors';

import { runMigrations, type MigrationResult } from './migrations';
import { MIGRATIONS } from './schema';

export const DATABASE_NAME = 'lifetrack.db';

/** 连接级 PRAGMA，集中在打开时设置一次 */
const CONNECTION_PRAGMAS = [
  // WAL：读写并发更好，异常退出后可从日志恢复
  'PRAGMA journal_mode = WAL;',
  // SQLite 默认关闭外键，必须显式打开
  'PRAGMA foreign_keys = ON;',
  // 短暂锁竞争时自动等待，而不是立刻抛 SQLITE_BUSY
  'PRAGMA busy_timeout = 5000;',
];

export interface DatabaseConnection {
  db: SQLite.SQLiteDatabase;
  /** 数据库文件绝对路径，用于「数据位置」这类诊断展示 */
  databasePath: string;
  /** 本次打开时执行的迁移结果 */
  migration: MigrationResult;
  /** 打开后的 schema 版本 */
  schemaVersion: number;
}

let connectionPromise: Promise<DatabaseConnection> | null = null;

export async function openDatabase(): Promise<DatabaseConnection> {
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    for (const pragma of CONNECTION_PRAGMAS) {
      await db.execAsync(pragma);
    }

    const migration = await runMigrations(db, MIGRATIONS);

    return {
      db,
      databasePath: db.databasePath,
      migration,
      schemaVersion: migration.to,
    };
  } catch (error) {
    if (db) {
      // 关掉半开的连接；数据文件保持原样
      await db.closeAsync().catch(() => undefined);
    }
    if (isAppError(error)) {
      throw error;
    }
    throw new StorageError(`数据库初始化失败：${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
      details: { database: DATABASE_NAME },
    });
  }
}

/**
 * 进程内单例。失败不缓存，允许 UI 层「重试」。
 */
export function getDatabase(): Promise<DatabaseConnection> {
  if (!connectionPromise) {
    const pending = openDatabase();
    pending.catch(() => {
      if (connectionPromise === pending) {
        connectionPromise = null;
      }
    });
    connectionPromise = pending;
  }
  return connectionPromise;
}

export async function closeDatabase(): Promise<void> {
  const pending = connectionPromise;
  connectionPromise = null;
  if (!pending) {
    return;
  }
  const connection = await pending.catch(() => null);
  if (connection) {
    await connection.db.closeAsync();
  }
}

/** 仅供测试重置单例状态 */
export function __resetDatabaseCacheForTests(): void {
  connectionPromise = null;
}
