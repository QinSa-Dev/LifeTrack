import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components';
import type { LedgerEntry } from '@/domain/models';
import { palette, radius, spacing } from '@/theme';

import {
  OTHER_CATEGORY,
  dailyExpenseSeries,
  foldExpenseCategories,
  formatCompactLedgerTotal,
  formatShare,
  listBillMonths,
  summarizeByMonth,
  summarizeExpenseCategories,
} from './bills';
import { BarChart } from './charts/BarChart';
import { DonutChart } from './charts/DonutChart';
import { OTHER_COLOR, chartColor } from './charts/colors';
import { formatLedgerTotal, summarizeLedger } from './format';

export interface LedgerAnalysisProps {
  entries: readonly LedgerEntry[];
  period: 'month' | 'year';
  year: number;
  /** `period === 'month'` 时必传 */
  month?: number;
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="subtitle" color={color} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </AppText>
      <AppText variant="caption" color={palette.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * 账单分析：概览 + 趋势柱状图 + 支出构成环图 + 支出排行。
 *
 * 月账单和年账单共用这一套：月看「每天」，年看「每月」；
 * 类别、金额、笔数的统计口径完全一样，避免两个页面各算一套。
 */
export function LedgerAnalysis({ entries, period, year, month }: LedgerAnalysisProps) {
  const totals = useMemo(() => summarizeLedger(entries), [entries]);
  const monthRows = useMemo(() => {
    const byMonth = summarizeByMonth(entries, year);
    if (period !== 'year') {
      return byMonth;
    }
    // 年视图只画到当前月：11 月时不应该出现一根空白的 12 月柱子。
    return listBillMonths(year, 'asc').flatMap((month) => {
      const row = byMonth[month - 1];
      return row ? [row] : [];
    });
  }, [entries, period, year]);
  const categories = useMemo(() => summarizeExpenseCategories(entries), [entries]);
  const shownCategories = useMemo(() => foldExpenseCategories(categories, 5), [categories]);
  const daily = useMemo(
    () => (period === 'month' && month !== undefined ? dailyExpenseSeries(entries, year, month) : []),
    [entries, period, year, month],
  );

  const periodLabel = period === 'month' && month !== undefined ? `${year} 年 ${month} 月` : `${year} 年`;

  const barLabels =
    period === 'month' ? daily.map((point) => String(point.day)) : monthRows.map((row) => `${row.month}月`);
  const barSeries =
    period === 'month'
      ? [
          {
            label: '支出',
            color: palette.danger,
            values: daily.map((point) => point.amountCents),
          },
        ]
      : [
          {
            label: '收入',
            color: palette.success,
            values: monthRows.map((row) => row.incomeCents),
          },
          {
            label: '支出',
            color: palette.danger,
            values: monthRows.map((row) => row.expenseCents),
          },
        ];

  const describeBar = (index: number): string => {
    if (period === 'month') {
      const point = daily[index];
      return point ? `${month} 月 ${point.day} 日：支出 ${formatLedgerTotal(point.amountCents)}` : '';
    }
    const row = monthRows[index];
    return row
      ? `${row.month} 月：收入 ${formatLedgerTotal(row.incomeCents)} · 支出 ${formatLedgerTotal(
          row.expenseCents,
        )}`
      : '';
  };

  const slices = shownCategories.map((category, index) => ({
    label: category.name,
    value: category.amountCents,
    color: category.name === OTHER_CATEGORY ? OTHER_COLOR : chartColor(index),
  }));

  const ranking = categories.slice(0, 8);
  const hasMore = categories.length > ranking.length;
  const topAmount = ranking[0]?.amountCents ?? 0;

  return (
    <View>
      <Card title="收支概览" subtitle={`${periodLabel} · 共 ${entries.length} 笔`}>
        <View style={styles.summaryRow}>
          <Metric label="收入" value={formatLedgerTotal(totals.incomeCents)} color={palette.success} />
          <Metric label="支出" value={formatLedgerTotal(totals.expenseCents)} color={palette.danger} />
          <Metric
            label="结余"
            value={formatLedgerTotal(totals.balanceCents)}
            color={totals.balanceCents < 0 ? palette.danger : palette.text}
          />
        </View>
      </Card>

      <Card title={period === 'month' ? '每日支出' : '每月收支'} style={styles.spaced}>
        <BarChart
          labels={barLabels}
          series={barSeries}
          labelEvery={period === 'month' ? 5 : 1}
          formatValue={formatLedgerTotal}
          formatMax={formatCompactLedgerTotal}
          describe={describeBar}
        />
      </Card>

      {shownCategories.length > 0 ? (
        <>
          <Card title="支出构成" style={styles.spaced}>
            <View style={styles.donutRow}>
              <DonutChart
                slices={slices}
                size={120}
                strokeWidth={15}
                centerLabel="支出"
                centerValue={formatLedgerTotal(totals.expenseCents)}
              />
              <View style={styles.legend}>
                {shownCategories.map((category, index) => (
                  <View key={category.name} style={styles.legendRow}>
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor: category.name === OTHER_CATEGORY ? OTHER_COLOR : chartColor(index),
                        },
                      ]}
                    />
                    <AppText variant="caption" numberOfLines={1} style={styles.legendName}>
                      {category.name}
                    </AppText>
                    <AppText variant="caption" color={palette.textMuted}>
                      {formatShare(category.share)}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          </Card>

          <Card
            title="支出排行"
            subtitle={hasMore ? `按金额排序，只显示前 ${ranking.length} 类` : '按金额排序'}
            style={styles.spaced}
          >
            {ranking.map((category, index) => {
              const width = topAmount > 0 ? Math.max(2, (category.amountCents / topAmount) * 100) : 0;
              return (
                <View
                  key={category.name}
                  style={[styles.rankRow, index === ranking.length - 1 ? styles.rankRowLast : null]}
                >
                  <AppText variant="label" color={palette.textMuted} style={styles.rankNumber}>
                    {index + 1}
                  </AppText>
                  <View style={styles.rankBody}>
                    <View style={styles.rankLine}>
                      <AppText variant="body" numberOfLines={1} style={styles.rankName}>
                        {category.name}
                      </AppText>
                      <AppText variant="label" color={palette.danger}>
                        {formatLedgerTotal(category.amountCents)}
                      </AppText>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${width}%` as `${number}%` }]} />
                    </View>
                    <AppText variant="caption" color={palette.textMuted}>
                      {category.count} 笔 · 占支出 {formatShare(category.share)}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : (
        <Card title="支出构成" style={styles.spaced}>
          <AppText variant="body" color={palette.textMuted}>
            这段时间没有支出。
          </AppText>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  legend: {
    flex: 1,
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendName: {
    flex: 1,
  },
  rankRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  rankRowLast: {
    borderBottomWidth: 0,
  },
  rankNumber: {
    width: 18,
    textAlign: 'center',
    paddingTop: 1,
  },
  rankBody: {
    flex: 1,
    gap: spacing.xs,
  },
  rankLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rankName: {
    flex: 1,
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.dangerSoft,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: palette.danger,
  },
});
