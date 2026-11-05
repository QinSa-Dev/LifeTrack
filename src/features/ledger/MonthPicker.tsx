import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Chip } from '@/components';
import { palette, radius, spacing } from '@/theme';

import { MONTHS, monthLabel, yearLabel, type YearMonth } from './month';

export interface MonthPickerProps {
  value: YearMonth;
  onChange: (next: YearMonth) => void;
}

/**
 * 记账页左上角的「年 / 月」选择：上面是年，下面是月。
 *
 * 年和月份是两件事：年箭头只平移年（保留月份），月份下拉只换月（保留年份）。
 * 月份默认显示当前月，点一下才在下方展开 12 个月，选完自动收起。
 * 下拉是绝对定位的浮层，不把右边的收支统计一起撑高。
 */
export function MonthPicker({ value, onChange }: MonthPickerProps) {
  const [open, setOpen] = useState(false);

  const chooseMonth = (month: number) => {
    onChange({ ...value, month });
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.timeBlock}>
        <View style={styles.yearRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="上一年"
            hitSlop={8}
            onPress={() => onChange({ ...value, year: value.year - 1 })}
            style={({ pressed }) => [styles.arrow, pressed ? styles.pressed : null]}
          >
            <Ionicons name="chevron-back" size={14} color={palette.textMuted} />
          </Pressable>
          <AppText variant="subtitle">{yearLabel(value)}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="下一年"
            hitSlop={8}
            onPress={() => onChange({ ...value, year: value.year + 1 })}
            style={({ pressed }) => [styles.arrow, pressed ? styles.pressed : null]}
          >
            <Ionicons name="chevron-forward" size={14} color={palette.textMuted} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`月份：${monthLabel(value.month)}`}
          accessibilityHint="展开月份列表"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((current) => !current)}
          style={({ pressed }) => [styles.monthTrigger, pressed ? styles.pressed : null]}
        >
          <AppText variant="label" color={palette.primary}>
            {monthLabel(value.month)}
          </AppText>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={palette.primary} />
        </Pressable>
      </View>

      {open ? (
        <View style={styles.dropdown} accessibilityLabel="月份列表">
          {MONTHS.map((month) => (
            <View key={month} style={styles.monthCell}>
              <Chip
                label={monthLabel(month)}
                selected={month === value.month}
                onPress={() => chooseMonth(month)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'flex-start',
    zIndex: 30,
  },
  timeBlock: {
    alignItems: 'flex-start',
    gap: 2,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrow: {
    padding: 2,
    borderRadius: 999,
  },
  monthTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: palette.primarySoft,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: spacing.sm,
    width: 280,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 40,
  },
  monthCell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
