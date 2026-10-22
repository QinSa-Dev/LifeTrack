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
  /** 是否显示底部分隔线（默认显示）；单独成卡的行传 false，避免卡内多出一条线 */
  divider?: boolean;
}

/** 列表行：标题 + 说明 + 右侧元素，可点击。 */
export function ListRow({ title, subtitle, right, onPress, style, divider = true }: ListRowProps) {
  const content = (
    <View style={styles.content}>
      {/*
        「文字区」自己当无障碍按钮，而不是把整行标成按钮：
        整行标按钮会把右侧的按钮一起合并进去（VoiceOver 只会读到
        「2026-10-22，删除」这样一个元素，里面的「删除」再也点不到）。
        拆开之后，文字区是一个按钮、右侧各元素各归各，两边都能被单独聚焦。
      */}
      <View
        style={styles.texts}
        accessible={onPress ? true : undefined}
        accessibilityRole={onPress ? 'button' : undefined}
      >
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
    return <View style={[styles.row, divider ? null : styles.noDivider, style]}>{content}</View>;
  }

  return (
    <Pressable
      // 整行仍是点击区（点哪里都能进），只是自身不做无障碍元素——见上面「文字区」的注释
      accessible={false}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider ? null : styles.noDivider,
        pressed ? styles.pressed : null,
        style,
      ]}
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
  noDivider: {
    borderBottomWidth: 0,
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
