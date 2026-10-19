import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventRecord } from '@/domain/models';
import { describeRecord } from '@/features/records/format';
import { RecordRow } from '@/features/records/RecordRow';
import { UndoBar } from '@/features/records/UndoBar';
import { EventRecordRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

const RECENT_LIMIT = 100;

export default function TimelineScreen() {
  const { db } = useReadyDatabase();

  const [records, setRecords] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 最近一次被软删除的记录：有值时显示「撤销」提示条
  const [undoTarget, setUndoTarget] = useState<EventRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(
    (showSpinner: boolean) => {
      let cancelled = false;
      if (showSpinner) {
        setLoading(true);
      }
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
    },
    [db],
  );

  // 每次回到这个标签页都重新读一次，这样从记录页返回后能立刻看到新记录
  useFocusEffect(
    useCallback(() => {
      return load(true);
    }, [load]),
  );

  const remove = (record: EventRecord) => {
    setDeletingId(record.id);
    setError(null);
    new EventRecordRepository(db)
      .softDelete(record.id)
      .then(() => {
        setUndoTarget(record);
        load(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setDeletingId(null);
      });
  };

  const undoRemove = () => {
    if (!undoTarget) {
      return;
    }
    setRestoring(true);
    setError(null);
    new EventRecordRepository(db)
      .restore(undoTarget.id)
      .then(() => {
        setUndoTarget(null);
        load(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setRestoring(false);
      });
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      {error ? (
        <Card title="操作失败" style={styles.spaced}>
          <AppText variant="body" color={palette.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}

      {undoTarget ? (
        <UndoBar
          message={`已删除：${describeRecord(undoTarget)}`}
          onUndo={undoRemove}
          onDismiss={() => setUndoTarget(null)}
          busy={restoring}
        />
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
            <RecordRow
              key={record.id}
              record={record}
              onDelete={() => remove(record)}
              deleting={deletingId === record.id}
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
