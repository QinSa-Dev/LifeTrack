import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, ListRow } from '@/components';
import { spacing } from '@/theme';

import { formatOccurredAt, formatRowValue, isBackfilled } from './format';
import type { RecordGroup } from './groupRecords';

export interface RecordGroupRowProps {
  group: RecordGroup;
  /** 是否已就地展开为逐条 */
  expanded: boolean;
  /** 点行切换展开 / 收起 */
  onToggle: () => void;
  /** 点【+1】：以最近一次的取值再记一条 */
  onRepeat?: () => void;
  repeating?: boolean;
  /** 【+1】不能用的原因（例如定义已归档） */
  repeatBlockedReason?: string;
  /** 定义已被永久删除：连【+1】都不再可能，只留一个标记 */
  definitionGone?: boolean;
  /** 展开后逐条渲染的内容（由调用方给出，才能复用 RecordRow 的取值与【+1】） */
  children?: ReactNode;
}

/**
 * 「同类合并」视图里的一行：同一个事件的多次记录并成一行。
 *
 * 行上说的是**最近一次**的事实（最近时间、最近的取值），【+1】也重复它；
 * 点行就地展开成逐条，与逐条视图看到的是同一批记录（顺序完全一致）。
 * 合并只是「怎么读」，不改动库里的任何东西。
 */
export function RecordGroupRow({
  group,
  expanded,
  onToggle,
  onRepeat,
  repeating = false,
  repeatBlockedReason,
  definitionGone = false,
  children,
}: RecordGroupRowProps) {
  const { latest } = group;
  const backfilled = isBackfilled(latest);
  const value = formatRowValue(latest);
  const subtitle = [
    `共 ${group.records.length} 次`,
    `最近 ${formatOccurredAt(latest.occurredAt)}`,
    expanded ? '收起' : '展开逐条',
  ].join(' · ');

  return (
    <View>
      <ListRow
        title={latest.snapshot.name}
        subtitle={subtitle}
        divider={expanded}
        onPress={onToggle}
        right={
          <>
            {backfilled ? <Badge label="补录" tone="warning" /> : null}
            {definitionGone ? <Badge label="定义已删除" /> : null}
            {repeatBlockedReason ? <Badge label={repeatBlockedReason} tone="warning" /> : null}
            {value ? <AppText variant="subtitle">{value}</AppText> : null}
            {onRepeat && !definitionGone ? (
              <Button
                label={repeating ? '+1…' : '+1'}
                tone="secondary"
                size="sm"
                onPress={onRepeat}
                disabled={repeating || repeatBlockedReason !== undefined}
              />
            ) : null}
          </>
        }
      />
      {expanded ? <View style={styles.children}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  children: {
    // 展开出来的逐条往右缩一格，看得出它们属于上面那个事件
    paddingLeft: spacing.md,
  },
});
