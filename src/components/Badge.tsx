import { StyleSheet, View } from 'react-native';

import { palette, radius, spacing } from '@/theme';

import { AppText } from './AppText';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

const TONES: Record<BadgeTone, { background: string; text: string }> = {
  neutral: { background: palette.surfaceMuted, text: palette.textMuted },
  primary: { background: palette.primarySoft, text: palette.primary },
  success: { background: palette.successSoft, text: palette.success },
  warning: { background: palette.warningSoft, text: palette.warning },
  danger: { background: palette.dangerSoft, text: palette.danger },
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const colors = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <AppText variant="label" color={colors.text} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  text: {
    fontSize: 12,
  },
});
