import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { palette, spacing } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /**
   * 固定的页头（`Header`）。放在 `ScrollView` **外面**，滚动时不会跟着走——
   * 二级页面的「返回」必须一直点得到，不能滚两下就没了。
   */
  header?: ReactNode;
  /** 内容超出屏幕时是否可滚动 */
  scroll?: boolean;
  /** 是否使用水平内边距（默认 true） */
  padded?: boolean;
  contentStyle?: ViewStyle;
  /**
   * 交给 `SafeAreaView` 的边。**标签页本身已有导航栏**（顶部安全区已由它处理），
   * 传 `['left', 'right']`；二级页面用自绘页头，默认把顶部也留出来。
   */
  edges?: readonly Edge[];
}

export function Screen({
  children,
  header,
  scroll = false,
  padded = true,
  contentStyle,
  edges = ['top', 'left', 'right'],
}: ScreenProps) {
  const paddingStyle = padded ? styles.padded : undefined;

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, paddingStyle, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, paddingStyle, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      {header ? (
        <View style={styles.header}>
          <View style={[styles.headerContent, paddingStyle]}>{header}</View>
          <View style={styles.divider} />
        </View>
      ) : null}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  flex: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  header: {
    backgroundColor: palette.background,
  },
  headerContent: {
    paddingTop: spacing.xs,
  },
  /** 与内容之间的一条极细分隔线：页头浮在列表之上，但不必画成卡片 */
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },
});
