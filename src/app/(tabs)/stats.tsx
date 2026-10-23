import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

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
  statsReadRange,
  summarize,
  TREND_RANGES,
  type ComparisonBasis,
  type ComparisonUnit,
  type DefinitionChange,
  type DefinitionTotal,
  type PeriodTotal,
} from '@/features/stats/aggregate';
import { describeComparison, describeDefinitionChange } from '@/features/stats/labels';
import { CycleEntryRepository, EventRecordRepository } from '@/repositories';
import { palette, radius, spacing } from '@/theme';

/** 趋势的粒度就是对比窗口的单位（同一个 `'day' | 'week'`）。 */
type Mode = ComparisonUnit;

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
  const periods = useMemo(
    () =>
      mode === 'day'
        ? aggregateByDay(recentRecords, TREND_RANGES.day, now)
        : aggregateByWeek(recentRecords, TREND_RANGES.week, now),
    [recentRecords, mode, now],
  );

  // 对比窗口与趋势窗口同长：「最近 14 天 vs 前 14 天」或「vs 上年同期」。
  const windows = useMemo(
    () => recentComparisonWindows(mode, TREND_RANGES[mode], basis, now),
    [mode, basis, now],
  );
  const comparison = useMemo(() => compareWindows(recentRecords, windows), [recentRecords, windows]);
  // 每个事件的变化，用来给「按事件统计」的每一行加一句对比。
  const changeById = useMemo(() => {
    const map = new Map<string, DefinitionChange>();
    for (const change of compareDefinitions(recentRecords, windows)) {
      map.set(change.definitionId, change);
    }
    return map;
  }, [recentRecords, windows]);

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
                subtitle={
                  mode === 'day'
                    ? `最近 ${TREND_RANGES.day} 天（按本地日期）`
                    : `最近 ${TREND_RANGES.week} 周（按周一起算）`
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
                emptyHint="到「周期」标签页记录每天的阶段与症状后，这里会汇总。"
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
