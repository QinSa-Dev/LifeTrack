import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, EmptyState, ListRow, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventRecord } from '@/domain/models';
import { formatOccurredAt, formatRecordValue, isBackfilled, sourceLabel } from '@/features/records/format';
import { EventRecordRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

const RECENT_LIMIT = 100;

export default function TimelineScreen() {
  const { db } = useReadyDatabase();

  const [records, setRecords] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      new EventRecordRepository(db)
        .list({ limit: RECENT_LIMIT })
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
    }, [db]),
  );

  return (
    <Screen scroll contentStyle={styles.content}>
      {error ? (
        <Card title="读取失败" style={styles.spaced}>
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
          title="还没有任何记录"
          description="到「事件」标签点按一个事件即可记录。计数型如「喝水 +1」，数量型如「跑步 5 公里」。"
          footnote="记录会保存当时的事件快照，之后改定义也不会篡改历史。"
        />
      ) : (
        <Card title="时间轴" subtitle={`最近 ${records.length} 条，按发生时间倒序`} style={styles.spaced}>
          {records.map((record) => (
            <ListRow
              key={record.id}
              title={record.snapshot.name}
              subtitle={`${formatOccurredAt(record.occurredAt)} · ${sourceLabel(record.source)}`}
              right={
                <>
                  {isBackfilled(record) ? <Badge label="补录" tone="warning" /> : null}
                  <AppText variant="subtitle">{formatRecordValue(record)}</AppText>
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
    paddingTop: spacing.lg,
  },
  spaced: {
    marginTop: spacing.md,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
});
