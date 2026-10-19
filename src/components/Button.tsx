import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { palette, radius, spacing, typography } from '@/theme';

import { AppText } from './AppText';

export type ButtonTone = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
}

const TONES: Record<ButtonTone, { background: string; text: string; border: string }> = {
  primary: { background: palette.primary, text: '#FFFFFF', border: palette.primary },
  secondary: { background: palette.surface, text: palette.text, border: palette.border },
  danger: { background: palette.dangerSoft, text: palette.danger, border: palette.danger },
};

export function Button({ label, onPress, tone = 'primary', disabled = false, testID, style }: ButtonProps) {
  const colors = TONES[tone];

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
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <AppText style={[styles.label, { color: colors.text }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.label,
    fontSize: 14,
  },
});
