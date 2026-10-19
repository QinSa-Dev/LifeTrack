import { StyleSheet, View } from 'react-native';

import { palette, spacing } from '@/theme';

import { AppText } from './AppText';

export interface EmptyStateProps {
  title: string;
  description?: string;
  footnote?: string;
}

export function EmptyState({ title, description, footnote }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <AppText variant="subtitle" color={palette.textMuted} style={styles.title}>
        {title}
      </AppText>
      {description ? (
        <AppText variant="body" color={palette.textMuted} style={styles.description}>
          {description}
        </AppText>
      ) : null}
      {footnote ? (
        <AppText variant="caption" color={palette.textMuted} style={styles.footnote}>
          {footnote}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  footnote: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
