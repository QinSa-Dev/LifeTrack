import { Pressable, StyleSheet, View } from 'react-native';

import { palette, radius, spacing } from '@/theme';

import { AppText } from './AppText';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** 选中时的强调色，默认用主题主色 */
  color?: string;
  /**
   * 读屏时念出来的名字。可见文字保持不变，只在需要补充上下文时才传
   * （例如「默认打开「统计」」）。
   */
  accessibilityLabel?: string;
}

/** 可选中的胶囊标签，用于类型切换、分组/标签的多选。 */
export function Chip({
  label,
  selected = false,
  onPress,
  color = palette.primary,
  accessibilityLabel,
}: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: palette.surface, borderColor: palette.border },
        pressed ? styles.pressed : null,
      ]}
    >
      <View>
        <AppText variant="label" color={selected ? '#FFFFFF' : palette.text}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.75,
  },
});
