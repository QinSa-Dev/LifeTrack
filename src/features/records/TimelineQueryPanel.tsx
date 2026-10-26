import { StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, TextField } from '@/components';
import { RECORD_KINDS, RECORD_SOURCES, type EventGroup } from '@/domain/models';
import { recordKindLabel } from '@/features/definitions/labels';
import { palette, spacing } from '@/theme';

import { sourceLabel } from './format';
import {
  TIMELINE_SORT_KEYS,
  TIMELINE_SORT_LABELS,
  type TimelineFilter,
  type TimelineQuery,
} from './timelineQuery';

export interface TimelineQueryPanelProps {
  query: TimelineQuery;
  /** 现成的分组（胶囊按它列）；「未分组」由本组件自己补一颗 */
  groups: readonly EventGroup[];
  onChange: (next: TimelineQuery) => void;
}

/**
 * 「筛选与排序」面板：在时间轴页头就地展开，改一下立刻生效（并且记住）。
 *
 * 每一项都是「**不限 + 选一个**」：四组筛选条件组合起来够用，也省得教人
 * 「怎么多选、怎么取消选中」——点「全部」就是取消。
 *
 * 「未分组」是一颗**筛选项**，不是往列表空位上填的占位词：它筛的是
 * 「事件现在不属于任何分组」的那些记录。
 */
export function TimelineQueryPanel({ query, groups, onChange }: TimelineQueryPanelProps) {
  const { filter, sort } = query;
  const setFilter = (patch: Partial<TimelineFilter>) =>
    onChange({ ...query, filter: { ...filter, ...patch } });

  return (
    <Card title="筛选与排序" style={styles.spaced}>
      <View style={styles.panel}>
        <TextField
          label="事件名"
          value={filter.name}
          onChangeText={(name) => setFilter({ name })}
          placeholder="写下关键字"
          autoCorrect={false}
          returnKeyType="search"
          containerStyle={styles.field}
        />

        <AppText variant="label" color={palette.textMuted}>
          类型
        </AppText>
        <View style={styles.row}>
          <Chip
            label="全部"
            selected={filter.kind === undefined}
            onPress={() => setFilter({ kind: undefined })}
          />
          {RECORD_KINDS.map((kind) => (
            <Chip
              key={kind}
              label={recordKindLabel(kind)}
              selected={filter.kind === kind}
              onPress={() => setFilter({ kind })}
            />
          ))}
        </View>

        <AppText variant="label" color={palette.textMuted}>
          来源
        </AppText>
        <View style={styles.row}>
          <Chip
            label="全部"
            selected={filter.source === undefined}
            onPress={() => setFilter({ source: undefined })}
          />
          {RECORD_SOURCES.map((source) => (
            <Chip
              key={source}
              label={sourceLabel(source)}
              selected={filter.source === source}
              onPress={() => setFilter({ source })}
            />
          ))}
        </View>

        {groups.length > 0 ? (
          <>
            <AppText variant="label" color={palette.textMuted}>
              分组
            </AppText>
            <View style={styles.row}>
              <Chip
                label="全部"
                selected={filter.groupId === undefined}
                onPress={() => setFilter({ groupId: undefined })}
              />
              <Chip
                label="未分组"
                selected={filter.groupId === null}
                onPress={() => setFilter({ groupId: null })}
              />
              {groups.map((group) => (
                <Chip
                  key={group.id}
                  label={group.name}
                  selected={filter.groupId === group.id}
                  onPress={() => setFilter({ groupId: group.id })}
                />
              ))}
            </View>
          </>
        ) : null}

        <AppText variant="label" color={palette.textMuted}>
          排序
        </AppText>
        <View style={styles.row}>
          {TIMELINE_SORT_KEYS.map((key) => (
            <Chip
              key={key}
              label={TIMELINE_SORT_LABELS[key]}
              selected={sort === key}
              onPress={() => onChange({ ...query, sort: key })}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginBottom: spacing.md,
  },
  panel: {
    gap: spacing.sm,
  },
  field: {
    marginBottom: 0,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
