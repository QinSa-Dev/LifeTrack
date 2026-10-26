import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { palette, radius, spacing } from '@/theme';

import { AppText } from './AppText';

export interface CardProps {
  title?: string;
  subtitle?: string;
  /** 右上角操作区（例如折叠开关），与标题同一行右对齐 */
  right?: ReactNode;
  children?: ReactNode;
  style?: ViewStyle;
}

export function Card({ title, subtitle, right, children, style }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {title || right ? (
        <View style={styles.header}>
          {title ? (
            <AppText variant="subtitle" style={styles.title}>
              {title}
            </AppText>
          ) : null}
          {right}
        </View>
      ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  body: {
    marginTop: spacing.md,
  },
});
