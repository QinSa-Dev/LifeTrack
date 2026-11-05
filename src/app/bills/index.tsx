import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Chip, EmptyState, Header, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { LedgerEntry } from '@/domain/models';
import { useGoBack } from '@/features/common/useGoBack';
import { LedgerAnalysis } from '@/features/ledger/LedgerAnalysis';
import { YearPicker } from '@/features/ledger/YearPicker';
import {
  listBillMonths,
  listYearOptions,
  resolveBillYear,
  summarizeByMonth,
  type BillSortOrder,
  type MonthBillRow,
} from '@/features/ledger/bills';
import { formatLedgerTotal, summarizeLedger } from '@/features/ledger/format';
import { yearRangeIso } from '@/features/ledger/month';
import { LedgerEntryRepository } from '@/repositories';
import { palette, radius, spacing } from '@/theme';

type BillMode = 'month' | 'year';

function Amount({
  value,
  color,
  muted = false,
  bold = false,
}: {
  value: number;
  color: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <AppText
      variant={bold ? 'label' : 'caption'}
      color={muted ? palette.textMuted : color}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={styles.amount}
    >
      {formatLedgerTotal(value)}
    </AppText>
  );
}

/**
 * 账单二级页：先看一年的逐月汇总，再点进某个月看图表分析。
 *
 * 顶部左边是**年份**（点开选年份），右边是「月账单 / 年账单」：
 * - 月账单：12 行表格（月份 / 月收入 / 月支出 / 月结余），点一行进三级页；
 * - 年账单：直接把这一年的趋势、支出构成与排行铺开，不用再多点一层。
 *
 * 一年只查一次库（`yearRangeIso` 下推），12 个月在内存里分组，
 * 所以切换月份、翻看表格都不会重复读 SQL。
 */
export default function BillsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const { db } = useReadyDatabase();
  const { year: yearParam } = useLocalSearchParams<{ year?: string }>();

  const initialYear = useMemo(() => resolveBillYear(yearParam), [yearParam]);
  const [year, setYear] = useState(initialYear);
  const [mode, setMode] = useState<BillMode>('month');
  const [order, setOrder] = useState<BillSortOrder>('desc');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [years, setYears] = useState<number[]>(() => listYearOptions(null, initialYear));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const repository = new LedgerEntryRepository(db);
      const currentYear = new Date().getFullYear();

      Promise.all([repository.list(yearRangeIso(year)), repository.yearBounds()])
        .then(([loaded, bounds]) => {
          if (cancelled) {
            return;
          }
          setEntries(loaded);
          setYears(listYearOptions(bounds, currentYear, year));
          setError(null);
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
    }, [db, year]),
  );

  const monthRows = useMemo(() => {
    const byMonth = summarizeByMonth(entries, year);
    return listBillMonths(year, order)
      .map((month) => byMonth[month - 1])
      .filter((row): row is MonthBillRow => row !== undefined);
  }, [entries, year, order]);
  const yearTotals = useMemo(() => summarizeLedger(entries), [entries]);

  const current = new Date();
  const isCurrentMonth = (row: MonthBillRow) =>
    row.month === current.getMonth() + 1 && year === current.getFullYear();

  const openMonth = (month: number) => {
    router.push({ pathname: '/bills/[year]/[month]', params: { year, month } });
  };

  return (
    <Screen
      header={
        <>
          <Header title="账单" onBack={goBack} />
          <View style={styles.controls}>
            <YearPicker value={year} years={years} onChange={setYear} />
            <View style={styles.modeToggle}>
              <Chip label="月账单" selected={mode === 'month'} onPress={() => setMode('month')} />
              <Chip label="年账单" selected={mode === 'year'} onPress={() => setMode('year')} />
            </View>
          </View>
        </>
      }
      scroll
      contentStyle={styles.content}
    >
      {error ? (
        <Card title="读取失败">
          <AppText variant="body" color={palette.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : mode === 'month' ? (
        <Card
          title={`${year} 年`}
          subtitle="按月汇总，点一行看图表分析"
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`排序：${order === 'desc' ? '最新月份在前' : '最早月份在前'}`}
              accessibilityHint="切换月份排序"
              onPress={() => setOrder((current) => (current === 'desc' ? 'asc' : 'desc'))}
              style={({ pressed }) => [styles.sortToggle, pressed ? styles.pressed : null]}
            >
              <Ionicons
                name={order === 'desc' ? 'arrow-down' : 'arrow-up'}
                size={13}
                color={palette.primary}
              />
              <AppText variant="caption" color={palette.primary}>
                {order === 'desc' ? '倒序' : '正序'}
              </AppText>
            </Pressable>
          }
        >
          <View style={styles.tableHeader}>
            <AppText variant="caption" color={palette.textMuted} style={styles.monthCell}>
              月份
            </AppText>
            <AppText variant="caption" color={palette.textMuted} style={styles.amount}>
              月收入
            </AppText>
            <AppText variant="caption" color={palette.textMuted} style={styles.amount}>
              月支出
            </AppText>
            <AppText variant="caption" color={palette.textMuted} style={styles.amount}>
              月结余
            </AppText>
            <View style={styles.chevronSpace} />
          </View>

          {monthRows.map((row) => (
            <Pressable
              key={row.month}
              accessibilityRole="button"
              accessibilityLabel={`${year} 年 ${row.month} 月，收入 ${formatLedgerTotal(
                row.incomeCents,
              )}，支出 ${formatLedgerTotal(row.expenseCents)}，结余 ${formatLedgerTotal(row.balanceCents)}`}
              accessibilityHint="查看这个月的图表分析"
              onPress={() => openMonth(row.month)}
              style={({ pressed }) => [styles.tableRow, pressed ? styles.pressed : null]}
            >
              <AppText
                variant="label"
                color={isCurrentMonth(row) ? palette.primary : palette.text}
                style={styles.monthCell}
              >
                {row.month} 月
              </AppText>
              <Amount value={row.incomeCents} color={palette.success} muted={row.count === 0} />
              <Amount value={row.expenseCents} color={palette.danger} muted={row.count === 0} />
              <Amount
                value={row.balanceCents}
                color={row.balanceCents < 0 ? palette.danger : palette.text}
                muted={row.count === 0}
              />
              <View style={styles.chevronSpace}>
                <Ionicons name="chevron-forward" size={14} color={palette.textMuted} />
              </View>
            </Pressable>
          ))}

          <View style={styles.totalRow}>
            <AppText variant="label" style={styles.monthCell}>
              全年
            </AppText>
            <Amount value={yearTotals.incomeCents} color={palette.success} bold />
            <Amount value={yearTotals.expenseCents} color={palette.danger} bold />
            <Amount
              value={yearTotals.balanceCents}
              color={yearTotals.balanceCents < 0 ? palette.danger : palette.text}
              bold
            />
            <View style={styles.chevronSpace} />
          </View>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState title="这一年还没有记账" description="记一笔之后，这里会有全年分析。" />
      ) : (
        <LedgerAnalysis entries={entries} period="year" year={year} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    zIndex: 20,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sortToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: palette.primarySoft,
  },
  content: {
    paddingTop: spacing.md,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
  },
  monthCell: {
    width: 42,
  },
  amount: {
    flex: 1,
    textAlign: 'right',
  },
  chevronSpace: {
    width: 14,
    alignItems: 'flex-end',
  },
  pressed: {
    opacity: 0.55,
  },
});
