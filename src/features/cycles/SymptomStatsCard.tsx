import { StyleSheet } from 'react-native';

import { AppText, Card, ListRow } from '@/components';
import type { CycleEntry } from '@/domain/models';
import { describeSymptomSummary, describeSymptomTotal } from '@/features/stats/labels';
import { aggregateSymptoms, summarizeSymptoms } from '@/features/stats/symptoms';
import { palette, spacing } from '@/theme';

export interface SymptomStatsCardProps {
  entries: readonly CycleEntry[];
  title?: string;
  /** 一条周期记录都没有时显示的提示 */
  emptyHint?: string;
  /** 最多列几种症状（不传则全列） */
  limit?: number;
}

/**
 * 症状统计卡片：一段周期（或全部）里，哪些症状最常见。
 *
 * 纯展示：数据由调用方给（`CycleEntryRepository.listVisible`），
 * 统计口径在 `features/stats/symptoms.ts`，文案在 `features/stats/labels.ts`。
 * 周期定义详情页与统计页共用它，所以标题与空态提示可以传。
 */
export function SymptomStatsCard({ entries, title = '症状统计', emptyHint, limit }: SymptomStatsCardProps) {
  const summary = summarizeSymptoms(entries);
  const totals = aggregateSymptoms(entries);
  const shown = limit === undefined ? totals : totals.slice(0, limit);

  return (
    <Card title={title} subtitle={describeSymptomSummary(summary)}>
      {summary.entryCount === 0 ? (
        <AppText variant="caption" color={palette.textMuted}>
          {emptyHint ?? '还没有可以统计的周期内记录。'}
        </AppText>
      ) : totals.length === 0 ? (
        <AppText variant="caption" color={palette.textMuted}>
          已经记了 {summary.entryCount} 条周期记录，但都还没有填过症状。
        </AppText>
      ) : (
        <>
          {shown.map((total) => (
            <ListRow
              key={total.symptom}
              title={total.symptom}
              right={<AppText variant="subtitle">{describeSymptomTotal(total)}</AppText>}
            />
          ))}
          {limit !== undefined && totals.length > limit ? (
            <AppText variant="caption" color={palette.textMuted} style={styles.more}>
              只列出前 {limit} 种，还有 {totals.length - limit} 种没有列出。
            </AppText>
          ) : null}
          <AppText variant="caption" color={palette.textMuted} style={styles.note}>
            百分比按「记了症状的记录数」算；软删除的记录不计入。
          </AppText>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  more: {
    marginTop: spacing.sm,
  },
  note: {
    marginTop: spacing.sm,
  },
});
