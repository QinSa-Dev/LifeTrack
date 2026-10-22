import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Header, ListRow, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { DeletedCycleEntry, EventRecord } from '@/domain/models';
import { formatOccurredAt, formatRecordValue, sourceLabel } from '@/features/records/format';
import { CycleEntryRepository, EventRecordRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

/** 回收站里一行的副标题：发生时间 · 来源 · 删除时间。 */
function deletedSubtitle(record: EventRecord): string {
  const deleted = record.deletedAt ? `删除于 ${formatOccurredAt(record.deletedAt)}` : '已删除';
  return `${formatOccurredAt(record.occurredAt)} · ${sourceLabel(record.source)} · ${deleted}`;
}

/** 周期记录那一行：属于哪个周期的哪一天 · 删除时间。 */
function deletedEntrySubtitle(item: DeletedCycleEntry): string {
  const range = `${item.instanceStartDate} ~ ${item.instanceEndDate ?? '进行中'}`;
  const deleted = item.entry.deletedAt ? `删除于 ${formatOccurredAt(item.entry.deletedAt)}` : '已删除';
  return `${item.definitionName} · ${range} · ${deleted}`;
}

/**
 * 回收站：软删除的记录在这里，可以「恢复」或「永久删除」。
 *
 * 时间轴上的删除是软删除（可撤销），撤销机会只在当次提示条里；
 * 关掉提示条后记录仍留在库里，来这里决定恢复还是真删。
 * —— 这样「软删除 → 撤销 → 永久删除」的每一步都有明确入口，不会留下无主数据。
 *
 * 这里管**两种**记录：时间轴的事件记录，和周期里的每日记录（v5 起后者也能软删除）。
 * 它们共用同一个页面而不是各做一个，是因为对用户来说「删了的东西在回收站」是一件事。
 */
export default function DeletedRecordsScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [records, setRecords] = useState<EventRecord[]>([]);
  const [entries, setEntries] = useState<DeletedCycleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      new EventRecordRepository(db).list({ onlyDeleted: true }),
      new CycleEntryRepository(db).listDeleted(),
    ])
      .then(([loadedRecords, loadedEntries]) => {
        if (!cancelled) {
          setRecords(loadedRecords);
          setEntries(loadedEntries);
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

  /** 恢复一件事（两种记录都是同一个流程，区别只在调用哪个仓储）。 */
  const run = (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    action()
      .then(() => load())
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusyId(null);
      });
  };

  const restore = (record: EventRecord) =>
    run(record.id, () => new EventRecordRepository(db).restore(record.id));

  const restoreEntry = (item: DeletedCycleEntry) =>
    run(item.entry.id, () => new CycleEntryRepository(db).restore(item.entry.id));

  /**
   * 永久删除必须二次确认：这是整条链路上唯一不可撤销的一步。
   *
   * 弹窗按钮说「彻底删除」而不是「永久删除」：列表里每行已经有一个「永久删除」按钮，
   * 两处同名会让「点的是哪一个」变得不可分辨（无障碍朗读与自动化都分不开）。
   * 按钮文字与正文里的「将被彻底删除」对上，也把「这一步不可逆」讲得更直白。
   */
  const confirmRemove = (id: string, message: string, action: () => Promise<unknown>) => {
    Alert.alert('彻底删除记录', message, [
      { text: '取消', style: 'cancel' },
      { text: '彻底删除', style: 'destructive', onPress: () => run(id, action) },
    ]);
  };

  const removeRecord = (record: EventRecord) =>
    confirmRemove(
      record.id,
      `「${record.snapshot.name}」的记录将被彻底删除，无法恢复。此操作不可撤销。`,
      () => new EventRecordRepository(db).remove(record.id),
    );

  const removeEntry = (item: DeletedCycleEntry) =>
    confirmRemove(
      item.entry.id,
      `「${item.definitionName}」里 ${item.entry.date} 的记录将被彻底删除，无法恢复。此操作不可撤销。`,
      () => new CycleEntryRepository(db).remove(item.entry.id),
    );

  const empty = records.length === 0 && entries.length === 0;

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
      ) : empty ? (
        <EmptyState
          title="回收站是空的"
          description="在时间轴或周期里删除记录后，它会出现在这里，等你决定恢复还是永久删除。"
        />
      ) : (
        <>
          {records.length > 0 ? (
            <Card
              title="已删除的记录"
              subtitle={`${records.length} 条，按删除时间倒序`}
              style={styles.spaced}
            >
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
                        onPress={() => removeRecord(record)}
                        disabled={busyId === record.id}
                      />
                    </>
                  }
                />
              ))}
            </Card>
          ) : null}

          {entries.length > 0 ? (
            <Card
              title="已删除的周期记录"
              subtitle={`${entries.length} 条，按删除时间倒序`}
              style={styles.spaced}
            >
              {entries.map((item) => (
                <ListRow
                  key={item.entry.id}
                  title={item.entry.date}
                  subtitle={deletedEntrySubtitle(item)}
                  right={
                    <>
                      <Button
                        label="恢复"
                        tone="secondary"
                        size="sm"
                        onPress={() => restoreEntry(item)}
                        disabled={busyId === item.entry.id}
                      />
                      <Button
                        label="永久删除"
                        tone="danger"
                        size="sm"
                        onPress={() => removeEntry(item)}
                        disabled={busyId === item.entry.id}
                      />
                    </>
                  }
                />
              ))}
              <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
                周期记录的日期必须落在它所属周期的区间内：如果这段周期的边界已经缩到不包含这一天，
                恢复会被拒绝并说明原因——先改回边界，或者彻底删除它。
              </AppText>
            </Card>
          ) : null}
        </>
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
  spacedTop: {
    marginTop: spacing.md,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
});
