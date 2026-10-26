import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { seedStarterDefinitions } from '@/features/definitions/starterDefinitions';
import { MetaRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

import { AppText } from './AppText';
import { Badge } from './Badge';
import { Button } from './Button';
import { Screen } from './Screen';
import { useDatabase } from '@/db';

/**
 * 数据库门禁：初始化完成前不渲染业务界面。
 *
 * 迁移失败时**不降级、不重建数据文件**，而是把错误显式呈现给用户并提供重试。
 */
export function DatabaseGate({ children }: { children: ReactNode }) {
  const { status, connection, error, retry } = useDatabase();
  const [bootWarning, setBootWarning] = useState<string | null>(null);

  /*
    启动时该做的事：① 记账（安装时间 / 启动次数，写 app_meta）；
    ② **只在数据库刚创建时**内置一个参考模板事件（见 features/definitions/starterDefinitions.ts）。

    两件事都属于「便利」，失败**不阻断启动**，只在顶部挂一条黄色警告横幅。
  */
  useEffect(() => {
    if (status !== 'ready' || !connection) {
      return;
    }
    let cancelled = false;
    const repository = new MetaRepository(connection.db);
    repository
      .ensureInstalledAt()
      .then(() => repository.incrementLaunchCount())
      .then(() => seedStarterDefinitions(connection.db, { freshDatabase: connection.migration.from === 0 }))
      .catch((cause: unknown) => {
        if (!cancelled) {
          setBootWarning(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, connection]);

  if (status === 'opening') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={palette.primary} />
          <AppText variant="body" color={palette.textMuted} style={styles.loadingText}>
            正在准备本地数据库…
          </AppText>
        </View>
      </Screen>
    );
  }

  if (status === 'error' || !connection) {
    return (
      <Screen scroll contentStyle={styles.errorContent}>
        <Badge label="数据库不可用" tone="danger" />
        <AppText variant="title" style={styles.errorTitle}>
          本地数据库初始化失败
        </AppText>
        <AppText variant="body" color={palette.textMuted}>
          为了不覆盖已有数据，LifeTrack
          不会自动重建数据库文件。请重试；若持续失败，请把下面的错误信息反馈给开发者。
        </AppText>

        <View style={styles.errorBox}>
          <AppText variant="label">错误码：{error?.code ?? 'UNKNOWN'}</AppText>
          <AppText variant="mono" selectable style={styles.errorMessage}>
            {error?.message ?? '未知错误'}
          </AppText>
        </View>

        <Button label="重试" onPress={retry} style={styles.retry} />
      </Screen>
    );
  }

  return (
    <>
      {bootWarning ? (
        <View style={styles.warning}>
          <AppText variant="caption" color={palette.warning}>
            启动初始化未完成（不影响使用）：{bootWarning}
          </AppText>
        </View>
      ) : null}
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
  },
  errorContent: {
    paddingTop: spacing.xl,
  },
  errorTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  errorBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: spacing.sm,
  },
  errorMessage: {
    color: palette.danger,
  },
  retry: {
    marginTop: spacing.lg,
  },
  warning: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: palette.warningSoft,
  },
});
