import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { palette, radius, spacing, typography } from '@/theme';

import { AppText } from './AppText';

export type ButtonTone = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  /** 尺寸：`md` 是常规按钮，`sm` 用于列表行内等紧凑位置 */
  size?: ButtonSize;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
}

const TONES: Record<ButtonTone, { background: string; text: string; border: string }> = {
  primary: { background: palette.primary, text: '#FFFFFF', border: palette.primary },
  // 浅灰底色：白色卡片上的「次要按钮」若和卡片同色（surface #FFFFFF），看起来就像没有底色
  secondary: { background: palette.surfaceMuted, text: palette.text, border: palette.border },
  danger: { background: palette.dangerSoft, text: palette.danger, border: palette.danger },
};

const SIZES: Record<ButtonSize, { minHeight: number; paddingHorizontal: number; fontSize: number }> = {
  md: { minHeight: 44, paddingHorizontal: spacing.lg, fontSize: 14 },
  sm: { minHeight: 32, paddingHorizontal: spacing.md, fontSize: 13 },
};

export function Button({
  label,
  onPress,
  tone = 'primary',
  size = 'md',
  disabled = false,
  testID,
  style,
}: ButtonProps) {
  const colors = TONES[tone];
  const dimensions = SIZES[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: dimensions.minHeight,
          paddingHorizontal: dimensions.paddingHorizontal,
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <AppText style={[styles.label, { color: colors.text, fontSize: dimensions.fontSize }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.label,
  },
});
