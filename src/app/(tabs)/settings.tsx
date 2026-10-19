import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, Screen } from '@/components';
import { readSchemaVersion, useReadyDatabase, type MigrationResult } from '@/db';
import type { MetaEntry } from '@/repositories';
import { MetaRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

interface Diagnostics {
  loading: boolean;
  error: string | null;
  schemaVersion: number | null;
  migration: MigrationResult;
  databasePath: string;
  entries: MetaEntry[];
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" color={palette.textMuted} style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant={mono ? 'mono' : 'body'} selectable style={styles.rowValue}>
        {value}
      </AppText>
    </View>
  );
}

export default function SettingsScreen() {
  const { db, databasePath, migration } = useReadyDatabase();
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({
    loading: true,
    error: null,
    schemaVersion: null,
    migration,
    databasePath,
    entries: [],
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const repository = new MetaRepository(db);

      Promise.all([readSchemaVersion(db), repository.getAll()])
        .then(([version, entries]) => {
          if (cancelled) {
            return;
          }
          setDiagnostics({
            loading: false,
            error: null,
            schemaVersion: version,
            migration,
            databasePath,
            entries,
          });
        })
        .catch((cause: unknown) => {
          if (cancelled) {
            return;
          }
          setDiagnostics((previous) => ({
            ...previous,
            loading: false,
            error: cause instanceof Error ? cause.message : String(cause),
          }));
        });

      return () => {
        cancelled = true;
      };
    }, [db, databasePath, migration]),
  );

  const version = Constants.expoConfig?.version ?? '未知';
  const sdkVersion = Constants.expoConfig?.sdkVersion ?? '未知';
  const runtime = String(Constants.executionEnvironment ?? '未知');
  const migrationSummary =
    diagnostics.migration.applied.length === 0
      ? `无（已是最新 v${diagnostics.migration.to}）`
      : `${diagnostics.migration.from} → ${diagnostics.migration.to}（应用 v${diagnostics.migration.applied.join(', v')}）`;

  return (
    <Screen scroll contentStyle={{ paddingTop: spacing.lg }}>
      <Card title="应用信息">
        <Row label="应用版本" value={version} />
        <Row label="Expo SDK" value={sdkVersion} />
        <Row label="运行环境" value={runtime} />
      </Card>

      <Card title="本地数据库" subtitle="SQLite（expo-sqlite）" style={styles.spaced}>
        <View style={styles.badgeRow}>
          <Badge label="已连接" tone="success" />
          <Badge
            label={diagnostics.loading ? '读取中…' : `schema v${diagnostics.schemaVersion ?? '?'}`}
            tone="primary"
          />
        </View>
        <Row label="文件路径" value={diagnostics.databasePath} mono />
        <Row label="本次迁移" value={migrationSummary} />
        {diagnostics.error ? <Row label="读取错误" value={diagnostics.error} /> : null}
      </Card>

      <Card title="app_meta 表内容" subtitle="启动次数用于验证跨重启持久化" style={styles.spaced}>
        {diagnostics.entries.length === 0 ? (
          <AppText color={palette.textMuted}>暂无数据</AppText>
        ) : (
          diagnostics.entries.map((entry) => <Row key={entry.key} label={entry.key} value={entry.value} />)
        )}
      </Card>

      <Card title="数据安全约定" style={styles.spaced}>
        <AppText color={palette.textMuted}>
          迁移失败或版本高于应用支持时，LifeTrack
          会拒绝启动并保留原数据文件，不会删除或重建数据库。永久删除操作在此后阶段也会要求二次确认。
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowLabel: {
    marginBottom: 2,
  },
  rowValue: {
    color: palette.text,
  },
});
