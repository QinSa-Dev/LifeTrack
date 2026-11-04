import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * 返回上一层。
 *
 * 深链（通知 / 备份链接）可能直接把二级页面打开，此时栈里没有上一层——
 * `router.back()` 会什么都不做，用户会以为「返回键坏了」。这种情况下退回时间轴。
 */
export function useGoBack(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);
}
