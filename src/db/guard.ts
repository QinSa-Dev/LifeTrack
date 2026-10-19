import { isAppError, StorageError } from '@/domain/errors';

/**
 * 把底层（SQLite / 平台）异常统一收敛为 StorageError，
 * 让上层只处理 AppError 一种类型，同时保留原始错误便于排查。
 */
export async function guard<T>(operation: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw new StorageError(`${operation}失败：${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
      details: { operation },
    });
  }
}
