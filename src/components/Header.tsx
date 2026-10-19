import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { palette, spacing } from '@/theme';

import { AppText } from './AppText';

export interface HeaderProps {
  title: string;
  /** 传入时显示返回箭头 */
  onBack?: () => void;
  /** 标题右侧的自定义内容 */
  right?: ReactNode;
}

/**
 * 页面顶栏。根布局里 Stack 关闭了自带头部，二级页面（新建/编辑/管理）用它自绘，
 * 以便完全控制样式与返回行为。
 */
export function Header({ title, onBack, right }: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed ? styles.pressed : null]}
          >
            <Ionicons name="chevron-back" size={24} color={palette.primary} />
          </Pressable>
        ) : null}
        <AppText variant="title" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  back: {
    marginLeft: -spacing.sm,
    padding: spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
  title: {
    flexShrink: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});