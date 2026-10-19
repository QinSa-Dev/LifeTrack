import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { palette, spacing } from '@/theme';

import { AppText } from './AppText';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** 右侧内容，例如 Badge */
  right?: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

/** 列表行：标题 + 说明 + 右侧元素，可点击。 */
export function ListRow({ title, subtitle, right, onPress, style }: ListRowProps) {
  const content = (
    <View style={styles.content}>
      <View style={styles.texts}>
        <AppText variant="body" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={palette.textMuted} numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );

  if (!onPress) {
    return <View style={[styles.row, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null, style]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  pressed: {
    opacity: 0.6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  texts: {
    flexShrink: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
