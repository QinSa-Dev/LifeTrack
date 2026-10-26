import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, EmptyState } from '@/components';
import { META_KEYS, useReadyDatabase } from '@/db';
import { recordAttributes, type EventDefinition, type EventGroup, type EventRecord } from '@/domain/models';
import { groupRecordsByDefinition, type RecordGroup } from '@/features/records/groupRecords';
import { RecordGroupRow } from '@/features/records/RecordGroupRow';
import { RecordRow } from '@/features/records/RecordRow';
import { TimelineQueryPanel } from '@/features/records/TimelineQueryPanel';
import {
  DEFAULT_TIMELINE_QUERY,
  DEFAULT_TIMELINE_SORT,
  describeTimelineQuery,
  formatTimelineQuery,
  isFilterActive,
  parseTimelineQuery,
  selectedGroupName,
  toRecordFilterOptions,
  type TimelineQuery,
} from '@/features/records/timelineQuery';
import { sortTimelineGroups, sortTimelineRecords } from '@/features/records/timelineSort';
import {
  DEFAULT_TIMELINE_VIEW_MODE,
  parseTimelineViewMode,
  type TimelineViewMode,
} from '@/features/records/timelineView';
import {
  EventDefinitionRepository,
  EventGroupRepository,
  EventRecordRepository,
  MetaRepository,
} from '@/repositories';
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
  /** 现有分组：筛选面板的胶囊按它列（分组本身在「事件」页里管） */
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [viewMode, setViewMode] = useState<TimelineViewMode>(DEFAULT_TIMELINE_VIEW_MODE);
  const [query, setQuery] = useState<TimelineQuery>(DEFAULT_TIMELINE_QUERY);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);

  const { filter } = query;

  const load = useCallback(
    (showSpinner: boolean) => {
      let cancelled = false;
      if (showSpinner) {
        setLoading(true);
      }
      Promise.all([
        // 筛选下推到 SQL：「最近 100 条」说的是「符合筛选的最近 100 条」
        new EventRecordRepository(db).list({ limit: RECENT_LIMIT, ...toRecordFilterOptions(filter) }),
        new EventDefinitionRepository(db).list({ includeArchived: true }),
        new EventGroupRepository(db).list(),
      ])
        .then(([loadedRecords, loadedDefinitions, loadedGroups]) => {
          if (!cancelled) {
            setRecords(loadedRecords);
            setDefinitions(new Map(loadedDefinitions.map((definition) => [definition.id, definition])));
            setDefinitionsLoaded(true);
            setGroups(loadedGroups);
            setError(null);
            // 存着的分组筛选可能指向一个已经被删掉的分组，那会筛出空列表、看着像「记录不见了」。
            // 读到分组后把这一项悄悄放下（只放它，其余筛选照旧）。
            setQuery((current) => {
              const groupId = current.filter.groupId;
              if (typeof groupId !== 'string' || loadedGroups.some((group) => group.id === groupId)) {
                return current;
              }
              return { ...current, filter: { ...current.filter, groupId: undefined } };
            });
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
    [db, filter],
  );

  // 每次回到这个标签页都重新读一次，这样从记录页/详情页返回后能立刻看到变化；
  // `load` 跟着筛选条件变，所以改了筛选也会立刻重读（筛选下推到 SQL，得重新查）。
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

  // 筛选与排序的开关就在这一页（不像显示方式那样收在「设置」里），所以**挂载时读一次**就够：
  // 这一页没有别的写入者，重新聚焦时读回来的只会是自己刚写进去的值，不必再读。
  // 读到之前先用默认值（全部 · 按时间）；读失败只是「偏好没记住」，不值得弹错误卡片打扰人。
  const hydrated = useRef(false);
  useEffect(() => {
    let cancelled = false;
    new MetaRepository(db)
      .get(META_KEYS.timelineQuery)
      .then((stored) => {
        if (cancelled) {
          return;
        }
        hydrated.current = true;
        setQuery(parseTimelineQuery(stored));
      })
      .catch(() => {
        // 读不出来也不能一直不记：放行写入，下次打开至少是这次的设置
        if (!cancelled) {
          hydrated.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  // 改了就写回 app_meta。等第一次读完之后再写，免得把默认值盖掉存着的偏好。
  useEffect(() => {
    if (!hydrated.current) {
      return;
    }
    new MetaRepository(db).set(META_KEYS.timelineQuery, formatTimelineQuery(query)).catch(() => undefined);
  }, [db, query]);

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

  // 合并视图的一行 = 一个事件（同一个定义的多次记录并成一行）。
  // 先按发生时间倒序合并（`RecordGroupRow` 上的「最近一次」与【+1】都取组里第一条），
  // 再按用户选的排序键**给事件排队**——排序不能反过来做，否则「最近一次」就不是最近的了。
  const recordGroups = useMemo(
    () => sortTimelineGroups(groupRecordsByDefinition(records), query.sort),
    [records, query.sort],
  );

  // 逐条视图：按同一个「事件级」的键排，所以同一个事件的记录仍然连在一起，组内仍是发生时间倒序
  const orderedRecords = useMemo(() => sortTimelineRecords(records, query.sort), [records, query.sort]);

  const items: TimelineItem[] = useMemo(
    () =>
      viewMode === 'merged'
        ? recordGroups.map((group) => ({ type: 'group' as const, group }))
        : orderedRecords.map((record) => ({ type: 'record' as const, record })),
    [recordGroups, orderedRecords, viewMode],
  );

  const filterActive = isFilterActive(filter);
  // 筛选与排序都还是默认值时，页头不用多写一行「当前在看什么」
  const queryIsDefault = !filterActive && query.sort === DEFAULT_TIMELINE_SORT;

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
                    ? `${filterActive ? '筛出' : '最近'} ${records.length} 条，合并为 ${recordGroups.length} 个事件（最多 ${RECENT_LIMIT} 条）`
                    : `${filterActive ? '筛出' : '最近'} ${records.length} 条（最多 ${RECENT_LIMIT} 条）`
                  : filterActive
                    ? '没有符合筛选的记录'
                    : '软删除的记录会进回收站'}
              </AppText>
              <Button label="筛选" tone="secondary" size="sm" onPress={() => setPanelOpen((open) => !open)} />
              <Button
                label="回收站"
                tone="secondary"
                size="sm"
                onPress={() => router.push('/records/deleted')}
              />
            </View>

            {queryIsDefault ? null : (
              <View style={styles.queryRow}>
                <AppText variant="caption" color={palette.textMuted} style={styles.headerHint}>
                  {describeTimelineQuery(query, selectedGroupName(filter, groups))}
                </AppText>
                <Button
                  label={filterActive ? '清空筛选' : '还原排序'}
                  tone="secondary"
                  size="sm"
                  onPress={() =>
                    setQuery(
                      filterActive
                        ? { ...query, filter: { name: '' } }
                        : { ...query, sort: DEFAULT_TIMELINE_SORT },
                    )
                  }
                />
              </View>
            )}

            {panelOpen ? <TimelineQueryPanel query={query} groups={groups} onChange={setQuery} /> : null}

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
          ) : filterActive ? (
            <EmptyState title="没有符合筛选的记录" description="换个条件，或点「清空筛选」" />
          ) : (
            <EmptyState title="还没有任何记录" />
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
  queryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
