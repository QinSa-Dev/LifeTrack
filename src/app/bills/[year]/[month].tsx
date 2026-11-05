import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Card, EmptyState, Header, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { LedgerEntry } from '@/domain/models';
import { useGoBack } from '@/features/common/useGoBack';
import { LedgerAnalysis } from '@/features/ledger/LedgerAnalysis';
import { resolveBillMonth, resolveBillYear } from '@/features/ledger/bills';
import { monthRangeIso } from '@/features/ledger/month';
import { LedgerEntryRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

/**
 * 账单三级页：某个月的图表分析。
 *
 * 入口只有一个：账单二级页的月份表格点一行。数据按这个月的时间区间下推查询，
 * 不读全年——月账单只需要这一个月的记录。
 */
export default function MonthBillScreen() {
  const goBack = useGoBack();
  const { db } = useReadyDatabase();
  const { year: yearParam, month: monthParam } = useLocalSearchParams<{
    year?: string;
    month?: string;
  }>();

  const year = resolveBillYear(yearParam);
  const month = resolveBillMonth(monthParam);

  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setEntries(null);
      setError(null);

      new LedgerEntryRepository(db)
        .list(monthRangeIso({ year, month }))
        .then((loaded) => {
          if (!cancelled) {
            setEntries(loaded);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        });

      return () => {
        cancelled = true;
      };
    }, [db, year, month]),
  );

  return (
    <Screen
      header={<Header title={`${year} 年 ${month} 月账单`} onBack={goBack} />}
      scroll
      contentStyle={styles.content}
    >
      {error ? (
        <Card title="读取失败">
          <AppText variant="body" color={palette.danger}>
            {error}
          </AppText>
        </Card>
      ) : entries === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : entries.length === 0 ? (
        <EmptyState title="这个月还没有记账" description="记一笔之后，这里会有图表分析。" />
      ) : (
        <LedgerAnalysis entries={entries} period="month" year={year} month={month} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
});
