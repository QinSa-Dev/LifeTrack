import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { palette, radius, spacing } from '@/theme';

import { AppText } from './AppText';

export interface CardProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  style?: ViewStyle;
}

export function Card({ title, subtitle, children, style }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {title ? <AppText variant="subtitle">{title}</AppText> : null}
      {subtitle ? (
        <AppText variant="caption" color={palette.textMuted} style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
      {children ? <View style={title || subtitle ? styles.body : undefined}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    padding: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  body: {
    marginTop: spacing.md,
  },
});
