import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Header, ListRow, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventRecord } from '@/domain/models';
import { formatOccurredAt, formatRecordValue, sourceLabel } from '@/features/records/format';
import { EventRecordRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

/** 回收站里一行的副标题：发生时间 · 来源 · 删除时间。 */
function deletedSubtitle(record: EventRecord): string {
  const deleted = record.deletedAt ? `删除于 ${formatOccurredAt(record.deletedAt)}` : '已删除';
  return `${formatOccurredAt(record.occurredAt)} · ${sourceLabel(record.source)} · ${deleted}`;
}

/**
 * 回收站：软删除的记录在这里，可以「恢复」或「永久删除」。
 *
 * 时间轴上的删除是软删除（可撤销），撤销机会只在当次提示条里；
 * 关掉提示条后记录仍留在库里，来这里决定恢复还是真删。
 * —— 这样「软删除 → 撤销 → 永久删除」的每一步都有明确入口，不会留下无主数据。
 */
export default function DeletedRecordsScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [records, setRecords] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    new EventRecordRepository(db)
      .list({ onlyDeleted: true })
      .then((loaded) => {
        if (!cancelled) {
          setRecords(loaded);
          setError(null);
        }
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

  useFocusEffect(useCallback(() => load(), [load]));

  const restore = (record: EventRecord) => {
    setBusyId(record.id);
    setError(null);
    new EventRecordRepository(db)
      .restore(record.id)
      .then(() => load())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusyId(null);
      });
  };

  const confirmRemove = (record: EventRecord) => {
    Alert.alert('永久删除记录', `「${record.snapshot.name}」的记录将被彻底删除，无法恢复。此操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: () => {
          setBusyId(record.id);
          setError(null);
          new EventRecordRepository(db)
            .remove(record.id)
            .then(() => load())
            .catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : String(cause));
            })
            .finally(() => {
              setBusyId(null);
            });
        },
      },
    ]);
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header title="回收站" onBack={() => router.back()} />

      <AppText variant="caption" color={palette.textMuted} style={styles.hint}>
        删除记录是「软删除」，会先放进这里；可以恢复，也可以永久删除。永久删除不可撤销。
      </AppText>

      {error ? (
        <Card title="操作失败" style={styles.spaced}>
          <AppText variant="body" color={palette.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : records.length === 0 ? (
        <EmptyState
          title="回收站是空的"
          description="在时间轴删除记录后，它会出现在这里，等你决定恢复还是永久删除。"
        />
      ) : (
        <Card title="已删除的记录" subtitle={`${records.length} 条，按删除时间倒序`} style={styles.spaced}>
          {records.map((record) => (
            <ListRow
              key={record.id}
              title={record.snapshot.name}
              subtitle={deletedSubtitle(record)}
              right={
                <>
                  <AppText variant="subtitle">{formatRecordValue(record)}</AppText>
                  <Button
                    label="恢复"
                    tone="secondary"
                    size="sm"
                    onPress={() => restore(record)}
                    disabled={busyId === record.id}
                  />
                  <Button
                    label="永久删除"
                    tone="danger"
                    size="sm"
                    onPress={() => confirmRemove(record)}
                    disabled={busyId === record.id}
                  />
                </>
              }
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  hint: {
    marginBottom: spacing.sm,
  },
  spaced: {
    marginTop: spacing.md,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
});
