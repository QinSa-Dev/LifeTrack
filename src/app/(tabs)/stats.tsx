import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, EmptyState, ListRow, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { CycleEntry, EventRecord } from '@/domain/models';
import { recordKindLabel } from '@/features/definitions/labels';
import { SymptomStatsCard } from '@/features/cycles/SymptomStatsCard';
import {
  aggregateByDay,
  aggregateByDefinition,
  aggregateByWeek,
  compareDefinitions,
  compareWindows,
  recentComparisonWindows,
  recordsOfDefinition,
  statsReadRange,
  summarize,
  TREND_RANGES,
  type ComparisonBasis,
  type ComparisonUnit,
  type DefinitionChange,
  type DefinitionTotal,
  type PeriodTotal,
} from '@/features/stats/aggregate';
import {
  comparisonBasisLabel,
  describeActiveComparison,
  describeComparison,
  describeDefinitionChange,
} from '@/features/stats/labels';
import { CycleEntryRepository, EventRecordRepository } from '@/repositories';
import { palette, radius, spacing } from '@/theme';

/** 趋势的粒度就是对比窗口的单位（同一个 `'day' | 'week'`）。 */
type Mode = ComparisonUnit;

/**
 * 趋势要有「看什么」这一维，缺了它就只能把所有事件混成一个数。
 *
 * - `active`：**活跃事件数**——每天有几个不同的事件被记录过（覆盖 / 坚持度）。
 *   把「3 次喝水 + 2 次跑步」加成一个数是没意义的，但「今天记了 2 个事件」
 *   说得清，而且跨事件也能解释。
 * - `all`：全部记录的条数（保留为一个显式选项，而不是默认口径）。
 * - `definition`：某个事件每天的条数（「过去一周喝水每天有多少」）。
 */
type TrendSelection = { kind: 'active' } | { kind: 'all' } | { kind: 'definition'; definitionId: string };

/** 两个非事件选项的标题，界面与文案共用。 */
const ACTIVE_TREND_LABEL = '活跃事件数';
const ALL_TREND_LABEL = '全部';

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

/** 历史数量型不同属性的值不合并计量，所以合计属性可能为空。 */
function formatTotalValue(total: DefinitionTotal): string {
  return total.attributeText ? `${total.totalValue} ${total.attributeText}` : String(total.totalValue);
}

/** MM-DD，天与周都用周一/当天的月日做标签。 */
function periodLabel(date: string): string {
  return date.slice(5);
}

/**
 * 趋势条：每根横条的长度代表该桶的指标值（选「活跃事件数」时是事件数，
 * 否则是记录条数），最长的占满轨道。
 * 用 flex 表达比例（值为 0 时长度为 0），避免依赖字符串百分比宽度。
 */
function TrendBars({
  periods,
  valueOf,
}: {
  periods: PeriodTotal[];
  valueOf: (period: PeriodTotal) => number;
}) {
  const values = periods.map(valueOf);
  const max = Math.max(1, ...values);

  return (
    <View>
      {periods.map((period, index) => {
        const value = values[index] ?? 0;
        return (
          <View key={period.date} style={styles.barRow}>
            <AppText variant="caption" color={palette.textMuted} style={styles.barLabel}>
              {periodLabel(period.date)}
            </AppText>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { flex: value }]} />
              <View style={{ flex: max - value }} />
            </View>
            <AppText variant="caption" style={styles.barCount}>
              {value}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

export default function StatsScreen() {
  const { db } = useReadyDatabase();

  // 「累计」口径（概览 / 按事件统计）：需要**有史以来**的全部记录，所以这里读全量。
  const [records, setRecords] = useState<EventRecord[]>([]);
  // 「窗口」口径（趋势 / 对比）：只需要统计窗口内的一段时间，由 `statsReadRange` 下推给 SQL。
  const [recentRecords, setRecentRecords] = useState<EventRecord[]>([]);
  // 周期内记录（症状统计用；仓储已过滤软删除）。与事件记录是两套事实，分开统计。
  const [cycleEntries, setCycleEntries] = useState<CycleEntry[]>([]);
  // 本次加载的参考时刻：读库、窗口、分桶共用同一个 `now`，
  // 免得跨零点时「读了 14 天、却按 15 天分桶」这种不一致。
  const [now, setNow] = useState(() => new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('day');
  const [basis, setBasis] = useState<ComparisonBasis>('previous');
  // 趋势看哪一条；`null` 表示还没手动选过，用下面算出的默认值。
  const [trend, setTrend] = useState<TrendSelection | null>(null);
  // 「按天/按周」「较前一段/较上年同期」是低频选择，默认折叠进右上角。
  const [optionsOpen, setOptionsOpen] = useState(false);

  // 每次回到这个标签页都重新读一次，这样刚记录/删除的内容马上反映到统计里。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const loadedAt = new Date().toISOString();
      const range = statsReadRange(loadedAt);
      const recordRepository = new EventRecordRepository(db);

      Promise.all([
        recordRepository.list(),
        recordRepository.list({ from: range.from, until: range.until }),
        new CycleEntryRepository(db).listVisible(),
      ])
        .then(([loadedRecords, loadedRecent, loadedEntries]) => {
          if (!cancelled) {
            setRecords(loadedRecords);
            setRecentRecords(loadedRecent);
            setCycleEntries(loadedEntries);
            setNow(loadedAt);
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

  // 对比窗口与趋势窗口同长：「最近 14 天 vs 前 14 天」或「vs 上年同期」。
  const windows = useMemo(
    () => recentComparisonWindows(mode, TREND_RANGES[mode], basis, now),
    [mode, basis, now],
  );
  const comparison = useMemo(() => compareWindows(recentRecords, windows), [recentRecords, windows]);

  // 每个事件在两个窗口里的变化：既是「按事件统计」每一行的对比，
  // 也是趋势选择器的排序依据与默认值来源。
  const definitionChanges = useMemo(
    () => compareDefinitions(recentRecords, windows),
    [recentRecords, windows],
  );
  const changeById = useMemo(() => {
    const map = new Map<string, DefinitionChange>();
    for (const change of definitionChanges) {
      map.set(change.definitionId, change);
    }
    return map;
  }, [definitionChanges]);

  // 趋势选择器里的事件列表：用「读进来的这段」而不是累计全量，
  // 这样列表只含有近期出现过的事件，且不随「按天/按周」切换而变化。
  const recentDefinitions = useMemo(() => aggregateByDefinition(recentRecords), [recentRecords]);

  // 默认看「本期记录最多的那个事件」；本期没有就退到近来记录最多的事件，
  // 再没有才退到「活跃事件数」。只有用户没手动选过时才用这个默认值。
  const defaultTrend = useMemo<TrendSelection>(() => {
    const topInWindow = definitionChanges.find((change) => change.currentCount > 0);
    if (topInWindow) {
      return { kind: 'definition', definitionId: topInWindow.definitionId };
    }
    const topOverall = recentDefinitions[0];
    if (topOverall) {
      return { kind: 'definition', definitionId: topOverall.definitionId };
    }
    return { kind: 'active' };
  }, [definitionChanges, recentDefinitions]);
  const trendSelection = trend ?? defaultTrend;

  const trendPeriods = useMemo(() => {
    const source =
      trendSelection.kind === 'definition'
        ? recordsOfDefinition(recentRecords, trendSelection.definitionId)
        : recentRecords;
    return mode === 'day'
      ? aggregateByDay(source, TREND_RANGES.day, now)
      : aggregateByWeek(source, TREND_RANGES.week, now);
  }, [recentRecords, trendSelection, mode, now]);
  const trendValueOf = useCallback(
    (period: PeriodTotal) => (trendSelection.kind === 'active' ? period.definitionCount : period.recordCount),
    [trendSelection],
  );

  const trendNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const total of recentDefinitions) {
      map.set(total.definitionId, total.name);
    }
    for (const change of definitionChanges) {
      if (!map.has(change.definitionId)) {
        map.set(change.definitionId, change.name);
      }
    }
    return map;
  }, [recentDefinitions, definitionChanges]);

  const rangeText = mode === 'day' ? `最近 ${TREND_RANGES.day} 天` : `最近 ${TREND_RANGES.week} 周`;
  // 折叠开关上要显示当前选择，用和 Chip 一致的说法（「较前一段」而不是「前一段」）。
  const modeLabel = mode === 'day' ? '按天' : '按周';
  const basisChipLabel = basis === 'previous' ? '较前一段' : '较上年同期';
  const trendSubtitle = useMemo(() => {
    if (trendSelection.kind === 'active') {
      return `${rangeText}，每天有几个事件被记录过`;
    }
    if (trendSelection.kind === 'all') {
      return `${rangeText}，全部事件合起来的记录条数`;
    }
    const name = trendNameById.get(trendSelection.definitionId) ?? '所选事件';
    return `${name} · ${rangeText}每天的条数`;
  }, [trendSelection, trendNameById, rangeText]);

  const comparisonText = useMemo(() => {
    if (trendSelection.kind === 'active') {
      return describeActiveComparison(comparison, basis);
    }
    if (trendSelection.kind === 'all') {
      return describeComparison(comparison, basis);
    }
    const change = changeById.get(trendSelection.definitionId);
    return (
      (change ? describeDefinitionChange(change, basis) : undefined) ??
      `本期与${comparisonBasisLabel(basis)}都没有记录`
    );
  }, [trendSelection, comparison, basis, changeById]);

  const hasData = !loading && records.length > 0;
  const hasCycleData = !loading && cycleEntries.length > 0;

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
      ) : !hasData && !hasCycleData ? (
        <EmptyState
          title="还没有可统计的数据"
          description="先到「事件」标签记录几次，这里会按天/周汇总、按事件统计总条数与取值合计，并与前一段或上年同期对比；周期里记的症状也会在这里汇总。"
          footnote="统计从事实记录实时计算，不含已软删除的记录，也不落汇总表。"
        />
      ) : (
        <>
          {hasData ? (
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
                subtitle={trendSubtitle}
                right={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: optionsOpen }}
                    accessibilityLabel={`显示选项，当前${modeLabel}、${basisChipLabel}`}
                    onPress={() => setOptionsOpen((open) => !open)}
                    style={({ pressed }) => [
                      styles.optionsToggle,
                      pressed ? styles.optionsTogglePressed : null,
                    ]}
                  >
                    <AppText variant="caption" color={palette.primary}>
                      {modeLabel} · {basisChipLabel}
                    </AppText>
                    <AppText variant="caption" color={palette.primary}>
                      {optionsOpen ? '收起' : '展开'}
                    </AppText>
                  </Pressable>
                }
                style={styles.spaced}
              >
                {optionsOpen ? (
                  <View style={styles.optionsPanel}>
                    <AppText variant="label" color={palette.textMuted}>
                      统计粒度
                    </AppText>
                    <View style={styles.optionsRow}>
                      <Chip label="按天" selected={mode === 'day'} onPress={() => setMode('day')} />
                      <Chip label="按周" selected={mode === 'week'} onPress={() => setMode('week')} />
                    </View>
                    <AppText variant="label" color={palette.textMuted}>
                      对比基准
                    </AppText>
                    <View style={styles.optionsRow}>
                      <Chip
                        label="较前一段"
                        selected={basis === 'previous'}
                        onPress={() => setBasis('previous')}
                      />
                      <Chip
                        label="较上年同期"
                        selected={basis === 'lastYear'}
                        onPress={() => setBasis('lastYear')}
                      />
                    </View>
                  </View>
                ) : null}
                <View style={styles.trendChips}>
                  <Chip
                    label={ACTIVE_TREND_LABEL}
                    selected={trendSelection.kind === 'active'}
                    onPress={() => setTrend({ kind: 'active' })}
                  />
                  <Chip
                    label={ALL_TREND_LABEL}
                    selected={trendSelection.kind === 'all'}
                    onPress={() => setTrend({ kind: 'all' })}
                  />
                  {recentDefinitions.map((total) => (
                    <Chip
                      key={total.definitionId}
                      label={total.name}
                      selected={
                        trendSelection.kind === 'definition' &&
                        trendSelection.definitionId === total.definitionId
                      }
                      onPress={() => setTrend({ kind: 'definition', definitionId: total.definitionId })}
                    />
                  ))}
                </View>
                <TrendBars periods={trendPeriods} valueOf={trendValueOf} />

                <AppText variant="label" color={palette.textMuted} style={styles.compareLabel}>
                  对比（与上图同一窗口）
                </AppText>
                <AppText variant="caption" color={palette.textMuted}>
                  {comparisonText}
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
                      const subtitle = [
                        `${recordKindLabel(total.kind)} · ${total.recordCount} 条`,
                        changeText,
                      ]
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
          ) : null}

          {hasCycleData ? (
            <View style={styles.spaced}>
              <SymptomStatsCard
                entries={cycleEntries}
                title="周期症状"
                limit={5}
                emptyHint="到「事件」页点开周期型事件、按天记录阶段与症状后，这里会汇总。"
              />
            </View>
          ) : null}
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
  optionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.primarySoft,
  },
  optionsTogglePressed: {
    opacity: 0.7,
  },
  optionsPanel: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  trendChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
