/**
 * 测试用的内存 SQLite 执行器（node:sqlite，Node 22.5+ 内置）。
 *
 * 为什么值得这么做：迁移与 Repository 里的 SQL 能在单元测试中**真的被执行**，
 * 语法错误、约束冲突、PRAGMA 行为都能被测出来，而不是只对 mock 断言调用顺序。
 *
 * 注意：它只用于测试。设备/模拟器上仍然由 expo-sqlite 提供服务，
 * 因此 SQL 方言版本可能略有差异，端到端验证仍以真机/模拟器运行为准。
 */

import { DatabaseSync } from 'node:sqlite';

import type { SqlExecutor, SqlParam, SqlRunResult } from '../types';

export interface TestDatabase extends SqlExecutor {
  /** 直接执行 SQL（测试断言用） */
  rawExec(source: string): void;
  /** 直接查询（测试断言用） */
  rawGet<T>(source: string, ...params: SqlParam[]): T | null;
  rawAll<T>(source: string, ...params: SqlParam[]): T[];
  /** 当前事务深度，用于验证事务是否真的开过 */
  transactionDepth(): number;
  close(): void;
}

export function createTestDatabase(filename = ':memory:'): TestDatabase {
  const native = new DatabaseSync(filename);
  let depth = 0;

  const executor: SqlExecutor = {
    async execAsync(source: string): Promise<void> {
      native.exec(source);
    },
    async runAsync(source: string, ...params: SqlParam[]): Promise<SqlRunResult> {
      const result = native.prepare(source).run(...params);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    async getFirstAsync<T>(source: string, ...params: SqlParam[]): Promise<T | null> {
      const row = native.prepare(source).get(...params);
      return (row ?? null) as T | null;
    },
    async getAllAsync<T>(source: string, ...params: SqlParam[]): Promise<T[]> {
      return native.prepare(source).all(...params) as T[];
    },
    async withExclusiveTransactionAsync(task: (txn: SqlExecutor) => Promise<void>): Promise<void> {
      depth += 1;
      native.exec('BEGIN IMMEDIATE');
      try {
        await task(executor);
        native.exec('COMMIT');
      } catch (error) {
        try {
          native.exec('ROLLBACK');
        } catch {
          // 回滚失败时保留原始错误
        }
        throw error;
      } finally {
        depth -= 1;
      }
    },
  };

  return {
    ...executor,
    rawExec: (source: string) => native.exec(source),
    rawGet: <T>(source: string, ...params: SqlParam[]) =>
      (native.prepare(source).get(...params) ?? null) as T | null,
    rawAll: <T>(source: string, ...params: SqlParam[]) => native.prepare(source).all(...params) as T[],
    transactionDepth: () => depth,
    close: () => native.close(),
  };
}
