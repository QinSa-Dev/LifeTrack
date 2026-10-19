import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { toAppError, type AppError } from '@/domain/errors';

import { getDatabase, type DatabaseConnection } from './client';

export type DatabaseStatus = 'opening' | 'ready' | 'error';

export interface DatabaseContextValue {
  status: DatabaseStatus;
  connection: DatabaseConnection | null;
  error: AppError | null;
  /** 打开失败后重试（不会清理既有数据文件） */
  retry: () => void;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<DatabaseStatus>('opening');
  const [connection, setConnection] = useState<DatabaseConnection | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getDatabase()
      .then((opened) => {
        if (cancelled) {
          return;
        }
        setConnection(opened);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(toAppError(cause, '数据库初始化失败'));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    // 状态重置放在事件回调里，而不是 effect 体内（避免级联渲染）
    setStatus('opening');
    setConnection(null);
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo<DatabaseContextValue>(
    () => ({ status, connection, error, retry }),
    [status, connection, error, retry],
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): DatabaseContextValue {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase 必须在 <DatabaseProvider> 内部使用');
  }
  return context;
}

/** 在确定数据库已就绪的界面中使用，直接拿到连接。 */
export function useReadyDatabase(): DatabaseConnection {
  const { status, connection } = useDatabase();
  if (status !== 'ready' || !connection) {
    throw new Error('数据库尚未就绪，请先判断 useDatabase().status');
  }
  return connection;
}
