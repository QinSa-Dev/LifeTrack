import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { META_KEYS, useReadyDatabase } from '@/db';
import { MetaRepository } from '@/repositories';

import {
  defaultNavigationPreferences,
  parseNavigationPreferences,
  serializeNavigationPreferences,
  type NavigationPreferences,
} from './navigationPreferences';

interface NavigationPreferencesContextValue {
  preferences: NavigationPreferences;
  /** 首次读取完成前为 true；标签栏会先盖一层背景，避免闪一下默认顺序 */
  loading: boolean;
  /** 读取 / 写入偏好失败的原因；偏好本身仍按默认值工作 */
  error: string | null;
  /** 先改本地（界面立刻生效），再写 `app_meta`；写失败只记录，不影响浏览 */
  update: (next: NavigationPreferences) => void;
}

const NavigationPreferencesContext = createContext<NavigationPreferencesContextValue | null>(null);

/**
 * 把「底部导航顺序 / 默认页」读一次放在 Context 里。
 *
 * 标签栏需要顺序，设置页需要改它；两者隔着 Tabs，用 Context 比各自读库更省事，
 * 也让改完顺序后标签栏**立刻**跟着换位（不用等下次启动）。
 */
export function NavigationPreferencesProvider({ children }: { children: ReactNode }) {
  const { db } = useReadyDatabase();
  const [preferences, setPreferences] = useState<NavigationPreferences>(defaultNavigationPreferences);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    new MetaRepository(db)
      .get(META_KEYS.navigation)
      .then((stored) => {
        if (cancelled) {
          return;
        }
        setPreferences(parseNavigationPreferences(stored));
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  const update = useCallback(
    (next: NavigationPreferences) => {
      setPreferences(next);
      setError(null);
      new MetaRepository(db)
        .set(META_KEYS.navigation, serializeNavigationPreferences(next))
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    },
    [db],
  );

  const value = useMemo(
    () => ({ preferences, loading, error, update }),
    [preferences, loading, error, update],
  );

  return (
    <NavigationPreferencesContext.Provider value={value}>{children}</NavigationPreferencesContext.Provider>
  );
}

export function useNavigationPreferences(): NavigationPreferencesContextValue {
  const value = useContext(NavigationPreferencesContext);
  if (!value) {
    throw new Error('useNavigationPreferences 必须在 NavigationPreferencesProvider 内使用');
  }
  return value;
}
