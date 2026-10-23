import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, EmptyState } from '@/components';
import { META_KEYS, useReadyDatabase } from '@/db';
import { recordAttributes, type EventDefinition, type EventRecord } from '@/domain/models';
import { groupRecordsByDefinition, type RecordGroup } from '@/features/records/groupRecords';
import { RecordGroupRow } from '@/features/records/RecordGroupRow';
import { RecordRow } from '@/features/records/RecordRow';
import {
  DEFAULT_TIMELINE_VIEW_MODE,
  parseTimelineViewMode,
  type TimelineViewMode,
} from '@/features/records/timelineView';
import { EventDefinitionRepository, EventRecordRepository, MetaRepository } from '@/repositories';
import { palette, radius, spacing } from '@/theme';

const RECENT_LIMIT = 100;

/** 列表里的一项：逐条视图是一条记录，合并视图是一个事件的多次记录。 */
type TimelineItem = { type: 'record'; record: EventRecord } | { type: 'group'; group: RecordGroup };

/** 传给 RecordRow / RecordGroupRow 的【+1】开关，四种状态互斥。 */
interface RepeatProps {
  onRepeat?: () => void;
  repeatBlockedReason?: string;
  definitionGone?: boolean;
}

export default function TimelineScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [records, setRecords] = useState<EventRecord[]>([]);
  const [definitions, setDefinitions] = useState<ReadonlyMap<string, EventDefinition>>(new Map());
  const [definitionsLoaded, setDefinitionsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<TimelineViewMode>(DEFAULT_TIMELINE_VIEW_MODE);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);

  const load = useCallback(
    (showSpinner: boolean) => {
      let cancelled = false;
      if (showSpinner) {
        setLoading(true);
      }
      Promise.all([
        new EventRecordRepository(db).list({ limit: RECENT_LIMIT }),
        new EventDefinitionRepository(db).list({ includeArchived: true }),
      ])
        .then(([loadedRecords, loadedDefinitions]) => {
          if (!cancelled) {
            setRecords(loadedRecords);
            setDefinitions(new Map(loadedDefinitions.map((definition) => [definition.id, definition])));
            setDefinitionsLoaded(true);
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

  // 每次回到这个标签页都重新读一次，这样从记录页/详情页返回后能立刻看到变化
  useFocusEffect(
    useCallback(() => {
      return load(true);
    }, [load]),
  );

  // 显示方式每次回到这个标签页都重读一次：开关现在收在「设置 → 偏好设置」里，
  // 改完切回来必须立刻生效（挂载时只读一次的话，得重启才更新）。
  // 读到之前先用默认的合并视图；读失败只是「偏好没记住」，不值得弹错误卡片打扰人。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      new MetaRepository(db)
        .get(META_KEYS.timelineView)
        .then((stored) => {
          if (!cancelled) {
            setViewMode(parseTimelineViewMode(stored));
          }
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  /**
   * 【+1】：以这条记录的取值「现在」再记一条（来源记为快捷）。
   *
   * 记完就完事——**不弹确认、也不再给撤销条**：这一下就是「快」，
   * 记错了进这条记录的详情页改或删（那页底部的「更多操作」里有）。
   * 事件记录没有指向定义的外键，所以定义没了的历史也可能出现在列表里，这里要分开处置。
   */
  const repeat = (record: EventRecord) => {
    setRepeatingId(record.id);
    setError(null);
    new EventRecordRepository(db)
      .record({
        definitionId: record.definitionId,
        value: record.value,
        attributes: recordAttributes(record),
        source: 'quick',
      })
      .then(() => {
        load(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setRepeatingId(null);
      });
  };

  const repeatProps = (definitionId: string, onRepeat: () => void): RepeatProps => {
    if (!definitionsLoaded) {
      return {};
    }
    const definition = definitions.get(definitionId);
    if (!definition) {
      return { definitionGone: true };
    }
    if (definition.isArchived) {
      return { onRepeat, repeatBlockedReason: '已归档' };
    }
    return { onRepeat };
  };

  const toggleGroup = (definitionId: string) => {
    setExpandedGroups((current) =>
      current.includes(definitionId)
        ? current.filter((item) => item !== definitionId)
        : [...current, definitionId],
    );
  };

  const groups = useMemo(() => groupRecordsByDefinition(records), [records]);

  const items: TimelineItem[] = useMemo(
    () =>
      viewMode === 'merged'
        ? groups.map((group) => ({ type: 'group' as const, group }))
        : records.map((record) => ({ type: 'record' as const, record })),
    [groups, records, viewMode],
  );

  const openDetail = (record: EventRecord) =>
    router.push({ pathname: '/records/[id]', params: { id: record.id } });

  const renderRecordRow = (record: EventRecord, divider: boolean) => (
    <RecordRow
      key={record.id}
      record={record}
      divider={divider}
      onPress={() => openDetail(record)}
      repeating={repeatingId === record.id}
      {...repeatProps(record.definitionId, () => repeat(record))}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <FlatList
        data={items}
        keyExtractor={(item) => (item.type === 'group' ? item.group.definitionId : item.record.id)}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            {item.type === 'group' ? (
              <RecordGroupRow
                group={item.group}
                expanded={expandedGroups.includes(item.group.definitionId)}
                onToggle={() => toggleGroup(item.group.definitionId)}
                repeating={repeatingId === item.group.latest.id}
                {...repeatProps(item.group.latest.definitionId, () => repeat(item.group.latest))}
              >
                {item.group.records.map((record, index) =>
                  renderRecordRow(record, index < item.group.records.length - 1),
                )}
              </RecordGroupRow>
            ) : (
              renderRecordRow(item.record, false)
            )}
          </View>
        )}
        ListHeaderComponent={
          <View>
            {error ? (
              <Card title="操作失败" style={styles.spaced}>
                <AppText variant="body" color={palette.danger}>
                  {error}
                </AppText>
              </Card>
            ) : null}

            <View style={styles.headerRow}>
              <AppText variant="caption" color={palette.textMuted} style={styles.headerHint}>
                {records.length > 0
                  ? viewMode === 'merged'
                    ? `最近 ${records.length} 条，合并为 ${groups.length} 个事件（最多 ${RECENT_LIMIT} 条）`
                    : `最近 ${records.length} 条，按发生时间倒序（最多 ${RECENT_LIMIT} 条）`
                  : '软删除的记录会进回收站'}
              </AppText>
              <Button
                label="回收站"
                tone="secondary"
                size="sm"
                onPress={() => router.push('/records/deleted')}
              />
            </View>

            <AppText variant="caption" color={palette.textMuted} style={styles.tapHint}>
              {viewMode === 'merged'
                ? '点行就地展开逐条，点【+1】按同样的取值再记一条（显示方式可在「设置」里改）'
                : '点行看详情，点【+1】按同样的取值再记一条（显示方式可在「设置」里改）'}
            </AppText>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : (
            <EmptyState
              title="还没有任何记录"
              description="到「事件」标签点按一个事件即可记录。计数型如「喝水 +1」，数量型如「跑步 5 公里」。"
              footnote="记录会保存当时的事件快照，之后改定义也不会篡改历史。列表上的【+1】会按那条记录的取值再记一条。"
            />
          )
        }
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  spaced: {
    marginTop: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  headerHint: {
    flexShrink: 1,
  },
  tapHint: {
    marginBottom: spacing.sm,
  },
  itemCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
});
