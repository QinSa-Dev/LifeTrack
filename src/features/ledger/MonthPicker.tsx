import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Pressable, View } from 'react-native';

import { AppText, Chip } from '@/components';
import { palette, spacing } from '@/theme';

import { MONTHS, monthLabel, yearLabel, type YearMonth } from './month';

export interface MonthPickerProps {
  value: YearMonth;
  onChange: (next: YearMonth) => void;
}

/**
 * 记账页顶部的「年 + 月份」选择。
 *
 * 年用左右箭头逐年翻（看老账本要能翻年），月份一次摆出 12 个胶囊，
 * 点哪个月就是哪个月。两者分开，是因为「换年」和「换月」是两件事：
 * 换年保留月份，点月份不改年份。
 */
export function MonthPicker({ value, onChange }: MonthPickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.yearRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="上一年"
          onPress={() => onChange({ ...value, year: value.year - 1 })}
          style={({ pressed }) => [styles.arrow, pressed ? styles.pressed : null]}
        >
          <Ionicons name="chevron-back" size={20} color={palette.textMuted} />
        </Pressable>
        <AppText variant="title" style={styles.year}>
          {yearLabel(value)}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="下一年"
          onPress={() => onChange({ ...value, year: value.year + 1 })}
          style={({ pressed }) => [styles.arrow, pressed ? styles.pressed : null]}
        >
          <Ionicons name="chevron-forward" size={20} color={palette.textMuted} />
        </Pressable>
      </View>
      <View style={styles.months}>
        {MONTHS.map((month) => (
          <Chip
            key={month}
            label={monthLabel(month)}
            selected={month === value.month}
            onPress={() => onChange({ ...value, month })}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  year: {
    minWidth: 96,
    textAlign: 'center',
  },
  arrow: {
    padding: spacing.xs,
    borderRadius: 999,
  },
  pressed: {
    backgroundColor: palette.surfaceMuted,
  },
  months: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
