import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Card, EmptyState } from '@/components';
import { useReadyDatabase } from '@/db';
import type { LedgerEntry } from '@/domain/models';
import { LedgerEntryForm, type LedgerEntryFormValues } from '@/features/ledger/LedgerEntryForm';
import { LedgerEntryRow } from '@/features/ledger/LedgerEntryRow';
import { MonthPicker } from '@/features/ledger/MonthPicker';
import {
  describeLedgerEntry,
  formatLedgerTotal,
  groupLedgerEntriesByDay,
  summarizeLedger,
  type LedgerTotals,
} from '@/features/ledger/format';
import { currentYearMonth, monthRangeIso, sameYearMonth, type YearMonth } from '@/features/ledger/month';
import { LedgerEntryRepository } from '@/repositories';
import { palette, radius, spacing } from '@/theme';

/** 三个数字并排；支出 / 收入各带色，右侧「账单」可点进二级页。 */
function Totals({ totals, onPressBill }: { totals: LedgerTotals; onPressBill: () => void }) {
  return (
    <Card style={styles.summary}>
      <View style={styles.summaryRow}>
        <View style={styles.metric}>
          <AppText
            variant="subtitle"
            color={palette.danger}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatLedgerTotal(totals.expenseCents)}
          </AppText>
          <AppText variant="caption" color={palette.textMuted}>
            支出
          </AppText>
        </View>
        <View style={styles.metric}>
          <AppText
            variant="subtitle"
            color={palette.success}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatLedgerTotal(totals.incomeCents)}
          </AppText>
          <AppText variant="caption" color={palette.textMuted}>
            收入
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`账单，当前 ${formatLedgerTotal(totals.balanceCents)}`}
          accessibilityHint="查看账单汇总与图表分析"
          onPress={onPressBill}
          style={({ pressed }) => [styles.metric, pressed ? styles.metricPressed : null]}
        >
          <AppText variant="subtitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {formatLedgerTotal(totals.balanceCents)}
          </AppText>
          <View style={styles.billLabelRow}>
            <AppText variant="caption" color={palette.primary}>
              账单
            </AppText>
            <Ionicons name="chevron-forward" size={12} color={palette.primary} />
          </View>
        </Pressable>
      </View>
    </Card>
  );
}

/**
 * 「记账」页：按月看流水。
 *
 * 顶部左边是年 / 月选择，右边是当月合计（支出 / 收入 / 账单）；
 * 「账单」可点进二级页，看逐月汇总与图表分析。
 * 下面的记录按**天**分组，两组之间留一段空白。
 * 「记一笔」走底部表单（方向 + 金额 + 备注 + 标签）；每条记录
 * **左滑复制、右滑删除**——每天同样的通勤 / 早餐不用重新输入。
 */
export default function LedgerScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [selected, setSelected] = useState<YearMonth>(() => currentYearMonth());
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /** 正在复制 / 删除的那一条，挡住连点 */
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // 读的是哪一次请求：reloadKey 变化后旧请求即使回来也不该覆盖新结果。
      const generation = reloadKey;
      setLoading(true);
      const range = monthRangeIso(selected);
      new LedgerEntryRepository(db)
        .list(range)
        .then((loaded) => {
          if (!cancelled && generation === reloadKey) {
            setEntries(loaded);
            setError(null);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        })
        .finally(() => {
          if (!cancelled && generation === reloadKey) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [db, selected, reloadKey]),
  );

  /** 记完 / 复制完如果不在当前月，跳到当前月，保证新记录马上看得见。 */
  const showMonthOf = (when: Date) => {
    const month = currentYearMonth(when);
    if (sameYearMonth(month, selected)) {
      setReloadKey((value) => value + 1);
    } else {
      setSelected(month);
    }
  };

  const addEntry = async (values: LedgerEntryFormValues) => {
    const now = new Date();
    await new LedgerEntryRepository(db).create(
      { ...values, occurredAt: now.toISOString() },
      now.toISOString(),
    );
    setFormOpen(false);
    showMonthOf(now);
  };

  const copyEntry = async (entry: LedgerEntry) => {
    if (busyId !== null) {
      return;
    }
    setBusyId(entry.id);
    try {
      const now = new Date();
      await new LedgerEntryRepository(db).create(
        {
          kind: entry.kind,
          amountCents: entry.amountCents,
          note: entry.note,
          tag: entry.tag,
          occurredAt: now.toISOString(),
        },
        now.toISOString(),
      );
      showMonthOf(now);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const removeEntry = async (entry: LedgerEntry) => {
    if (busyId !== null) {
      return;
    }
    setBusyId(entry.id);
    try {
      await new LedgerEntryRepository(db).remove(entry.id);
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (entry: LedgerEntry) => {
    Alert.alert('删除这笔账？', describeLedgerEntry(entry), [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void removeEntry(entry) },
    ]);
  };

  const sections = useMemo(
    () =>
      groupLedgerEntriesByDay(entries).map((group) => ({
        date: group.date,
        data: group.entries,
      })),
    [entries],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topRow}>
        <MonthPicker value={selected} onChange={setSelected} />
        <Totals
          totals={summarizeLedger(entries)}
          onPressBill={() => router.push({ pathname: '/bills', params: { year: selected.year } })}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(entry) => entry.id}
        renderItem={({ item, index, section }) => (
          <View style={index === section.data.length - 1 ? styles.dayEnd : styles.item}>
            <LedgerEntryRow
              entry={item}
              onCopy={() => void copyEntry(item)}
              onDelete={() => confirmDelete(item)}
            />
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <AppText variant="label" color={palette.textMuted} style={styles.dayHeader}>
            {section.date}
          </AppText>
        )}
        ListHeaderComponent={
          error ? (
            <Card title="操作失败" style={styles.errorCard}>
              <AppText variant="body" color={palette.danger}>
                {error}
              </AppText>
            </Card>
          ) : undefined
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : (
            <EmptyState title="这个月还没有记账" />
          )
        }
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        style={styles.list}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="记一笔"
        onPress={() => setFormOpen(true)}
        style={({ pressed }) => [styles.fab, pressed ? styles.fabPressed : null]}
      >
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <AppText variant="label" color="#FFFFFF">
          记一笔
        </AppText>
      </Pressable>

      {formOpen ? (
        <LedgerEntryForm
          onSubmit={addEntry}
          onClose={() => {
            setFormOpen(false);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    // 月份下拉是绝对定位的浮层，必须画在下面的列表之上。
    zIndex: 20,
  },
  summary: {
    flex: 1,
    padding: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
  },
  metric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: spacing.xs,
  },
  metricPressed: {
    opacity: 0.6,
  },
  billLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 96,
  },
  errorCard: {
    marginBottom: spacing.md,
  },
  dayHeader: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  item: {
    marginBottom: spacing.sm,
  },
  dayEnd: {
    marginBottom: spacing.lg,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: palette.primary,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabPressed: {
    opacity: 0.8,
  },
});
