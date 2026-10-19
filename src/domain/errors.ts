/**
 * 统一错误类型。
 *
 * 全应用只抛/只处理 AppError 及其子类，`code` 用于在 UI 层做分支，
 * 避免上层去解析 error.message 字符串。
 */

export type AppErrorCode =
  | 'VALIDATION' // 输入/领域规则不合法
  | 'NOT_FOUND' // 目标实体不存在
  | 'CONFLICT' // 唯一性/状态冲突
  | 'STORAGE' // SQLite 读写失败
  | 'MIGRATION' // 数据库迁移失败
  | 'IMPORT' // 导入/恢复失败
  | 'UNKNOWN'; // 兜底

export interface AppErrorOptions {
  /** 原始错误，便于日志排查 */
  cause?: unknown;
  /** 结构化上下文，例如 { table: 'events' } */
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('VALIDATION', message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('NOT_FOUND', message, options);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('CONFLICT', message, options);
  }
}

export class StorageError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('STORAGE', message, options);
  }
}

export class MigrationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('MIGRATION', message, options);
  }
}

export class ImportError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('IMPORT', message, options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** 把任意异常归一为 AppError，保证上层只需要处理一种类型。 */
export function toAppError(error: unknown, fallbackMessage = '发生未知错误'): AppError {
  if (isAppError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError('UNKNOWN', error.message, { cause: error });
  }
  return new AppError('UNKNOWN', fallbackMessage, { cause: error });
}
