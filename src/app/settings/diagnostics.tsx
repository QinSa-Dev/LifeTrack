import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, Header, Screen } from '@/components';
import { readSchemaVersion, useReadyDatabase, type MigrationResult } from '@/db';
import { useGoBack } from '@/features/common/useGoBack';
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

/** 数据与诊断：数据库连接状态、迁移记录和 app_meta 明细，平时不用看。 */
export default function DiagnosticsScreen() {
  const goBack = useGoBack();
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

  const migrationSummary =
    diagnostics.migration.applied.length === 0
      ? `无（已是最新 v${diagnostics.migration.to}）`
      : `${diagnostics.migration.from} → ${diagnostics.migration.to}（应用 v${diagnostics.migration.applied.join(', v')}）`;

  return (
    <Screen scroll header={<Header title="数据与诊断" onBack={goBack} />} contentStyle={styles.content}>
      <Card title="本地数据库" subtitle="SQLite（expo-sqlite）">
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

      <Card title="app_meta 表内容" style={styles.spaced}>
        {diagnostics.entries.length === 0 ? (
          <AppText color={palette.textMuted}>暂无数据</AppText>
        ) : (
          diagnostics.entries.map((entry) => <Row key={entry.key} label={entry.key} value={entry.value} />)
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
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
