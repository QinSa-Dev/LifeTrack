/**
 * 数据库执行器的结构化接口。
 *
 * 之所以不直接用 `SQLiteDatabase` 类型：Repository / 迁移逻辑只依赖下面这几个方法，
 * 这样既能在设备上用 expo-sqlite，也能在单元测试里用真实的内存 SQLite（node:sqlite）跑同一套 SQL。
 */

export type SqlParam = string | number | null;

export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SqlExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlParam[]): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, ...params: SqlParam[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: SqlParam[]): Promise<T[]>;
  withExclusiveTransactionAsync(task: (txn: SqlExecutor) => Promise<void>): Promise<void>;
}
