import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, EmptyState, ListRow, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventRecord } from '@/domain/models';
import { eventKindLabel } from '@/features/definitions/labels';
import {
  aggregateByDay,
  aggregateByDefinition,
  aggregateByWeek,
  compareDefinitions,
  compareWindows,
  recentComparisonWindows,
  summarize,
  type ComparisonBasis,
  type DefinitionChange,
  type DefinitionTotal,
  type PeriodTotal,
} from '@/features/stats/aggregate';
import { describeComparison, describeDefinitionChange } from '@/features/stats/labels';
import { EventRecordRepository } from '@/repositories';
import { palette, radius, spacing } from '@/theme';

type Mode = 'day' | 'week';

/** 趋势窗口：天看两周，周看两个月。对比窗口与它同长。 */
const RANGES: Record<Mode, number> = { day: 14, week: 8 };

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" color={palette.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

/** 数量型不同单位的值不合并计量，所以合计单位可能为空。 */
function formatTotalValue(total: DefinitionTotal): string {
  return total.unit ? `${total.totalValue} ${total.unit}` : String(total.totalValue);
}

/** MM-DD，天与周都用周一/当天的月日做标签。 */
function periodLabel(date: string): string {
  return date.slice(5);
}

/**
 * 趋势条：每根横条的长度代表该桶的记录条数，最长的占满轨道。
 * 用 flex 表达比例（记录数为 0 时长度为 0），避免依赖字符串百分比宽度。
 */
function TrendBars({ periods }: { periods: PeriodTotal[] }) {
  const max = Math.max(1, ...periods.map((period) => period.recordCount));

  return (
    <View>
      {periods.map((period) => (
        <View key={period.date} style={styles.barRow}>
          <AppText variant="caption" color={palette.textMuted} style={styles.barLabel}>
            {periodLabel(period.date)}
          </AppText>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { flex: period.recordCount }]} />
            <View style={{ flex: max - period.recordCount }} />
          </View>
          <AppText variant="caption" style={styles.barCount}>
            {period.recordCount}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export default function StatsScreen() {
  const { db } = useReadyDatabase();

  const [records, setRecords] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('day');
  const [basis, setBasis] = useState<ComparisonBasis>('previous');

  // 每次回到这个标签页都重新读一次，这样刚记录/删除的内容马上反映到统计里。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      new EventRecordRepository(db)
        .list()
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

  const summary = useMemo(() => summarize(records), [records]);
  const definitions = useMemo(() => aggregateByDefinition(records), [records]);
  const periods = useMemo(
    () => (mode === 'day' ? aggregateByDay(records, RANGES.day) : aggregateByWeek(records, RANGES.week)),
    [records, mode],
  );

  // 对比窗口与趋势窗口同长：「最近 14 天 vs 前 14 天」或「vs 上年同期」。
  const windows = useMemo(() => recentComparisonWindows(mode, RANGES[mode], basis), [mode, basis]);
  const comparison = useMemo(() => compareWindows(records, windows), [records, windows]);
  // 每个事件的变化，用来给「按事件统计」的每一行加一句对比。
  const changeById = useMemo(() => {
    const map = new Map<string, DefinitionChange>();
    for (const change of compareDefinitions(records, windows)) {
      map.set(change.definitionId, change);
    }
    return map;
  }, [records, windows]);

  const hasData = !loading && records.length > 0;

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
          title="还没有可统计的数据"
          description="先到「事件」标签记录几次，这里会按天/周汇总、按事件统计总条数与取值合计，并与前一段或上年同期对比。"
          footnote="统计从事实记录实时计算，不含已软删除的记录，也不落汇总表。"
        />
      ) : (
        <>
          <Card title="概览" style={styles.spaced}>
            <View style={styles.metrics}>
              <Metric label="记录总数" value={String(summary.recordCount)} />
              <Metric label="涉及事件" value={String(summary.definitionCount)} />
            </View>
            {summary.firstDate && summary.lastDate ? (
              <AppText variant="caption" color={palette.textMuted} style={styles.range}>
                覆盖 {summary.firstDate} ~ {summary.lastDate}
              </AppText>
            ) : null}
          </Card>

          <Card
            title="趋势"
            subtitle={
              mode === 'day' ? `最近 ${RANGES.day} 天（按本地日期）` : `最近 ${RANGES.week} 周（按周一起算）`
            }
            style={styles.spaced}
          >
            <View style={styles.modeRow}>
              <Chip label="按天" selected={mode === 'day'} onPress={() => setMode('day')} />
              <Chip label="按周" selected={mode === 'week'} onPress={() => setMode('week')} />
            </View>
            <TrendBars periods={periods} />

            <AppText variant="label" color={palette.textMuted} style={styles.compareLabel}>
              对比（窗口长度同上）
            </AppText>
            <View style={styles.modeRow}>
              <Chip label="较前一段" selected={basis === 'previous'} onPress={() => setBasis('previous')} />
              <Chip label="较上年同期" selected={basis === 'lastYear'} onPress={() => setBasis('lastYear')} />
            </View>
            <AppText variant="caption" color={palette.textMuted}>
              {describeComparison(comparison, basis)}
            </AppText>
            <AppText variant="caption" color={palette.textMuted} style={styles.range}>
              对照窗口：{comparison.previous.window.startDate} ~ {comparison.previous.window.endDate}
              （本期 {comparison.current.window.startDate} ~ {comparison.current.window.endDate}）
            </AppText>
          </Card>

          <Card
            title="按事件统计"
            subtitle={`累计 ${definitions.length} 个事件，按条数排序；行内变化是上面窗口的对比`}
            style={styles.spaced}
          >
            {hasData
              ? definitions.map((total) => {
                  const change = changeById.get(total.definitionId);
                  const changeText = change ? describeDefinitionChange(change, basis) : undefined;
                  const subtitle = [`${eventKindLabel(total.kind)} · ${total.recordCount} 条`, changeText]
                    .filter((part): part is string => Boolean(part))
                    .join(' · ');
                  return (
                    <ListRow
                      key={total.definitionId}
                      title={total.name}
                      subtitle={subtitle}
                      right={<AppText variant="subtitle">{formatTotalValue(total)}</AppText>}
                    />
                  );
                })
              : null}
          </Card>
        </>
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
  metrics: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metric: {
    flex: 1,
  },
  range: {
    marginTop: spacing.md,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  compareLabel: {
    marginTop: spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  barLabel: {
    width: 40,
  },
  barTrack: {
    flex: 1,
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
  },
  barCount: {
    width: 24,
    textAlign: 'right',
  },
});
