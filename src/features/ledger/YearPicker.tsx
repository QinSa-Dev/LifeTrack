import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Chip } from '@/components';
import { palette, radius, spacing } from '@/theme';

export interface YearPickerProps {
  value: number;
  /** 可选的年份，倒序（新的在前） */
  years: readonly number[];
  onChange: (year: number) => void;
}

/**
 * 账单页左上角的年份选择：点一下展开年份列表，选完收起。
 *
 * 列表由「最早有记录的一年 → 今年」决定，不凭空给未来年份——
 * 记账的发生时间不能晚于现在，未来年份一定是空的。
 */
export function YearPicker({ value, years, onChange }: YearPickerProps) {
  const [open, setOpen] = useState(false);

  const choose = (year: number) => {
    onChange(year);
    setOpen(false);
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`年份：${value} 年`}
        accessibilityHint="展开年份列表"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.trigger, pressed ? styles.pressed : null]}
      >
        <AppText variant="subtitle">{value} 年</AppText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={palette.primary} />
      </Pressable>

      {open ? (
        <View style={styles.dropdown} accessibilityLabel="年份列表">
          {years.map((year) => (
            <View key={year} style={styles.cell}>
              <Chip
                label={`${year} 年`}
                selected={year === value}
                onPress={() => choose(year)}
                accessibilityLabel={`切换到 ${year} 年`}
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
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: palette.primarySoft,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: spacing.sm,
    width: 264,
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
  cell: {
    width: '33.333%',
    alignItems: 'center',
    paddingVertical: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
