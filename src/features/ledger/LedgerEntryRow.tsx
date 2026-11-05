import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import type { LedgerEntry } from '@/domain/models';
import { palette, radius, spacing } from '@/theme';

import { formatLedgerAmount, formatLedgerTime, ledgerEntryTitle } from './format';

export interface LedgerEntryRowProps {
  entry: LedgerEntry;
  /** 左滑后点「复制」：以当前时间再记一笔一模一样的 */
  onCopy: () => void;
  /** 左滑后点「删除」：由调用方弹二次确认 */
  onDelete: () => void;
}

/** 左滑露出的操作区宽度：两个按钮各 76。 */
const ACTION_WIDTH = 76;
const ACTIONS_WIDTH = ACTION_WIDTH * 2;

/**
 * 一条记账记录，**左滑露出「复制 / 删除」**。
 *
 * 复制是这个功能最常见的动作：每天同一趟地铁、同一份早餐，
 * 金额和备注都不变，只是时间变成了现在。所以不弹表单，点一下就好。
 *
 * 手势用内置的 `PanResponder` + `Animated`，不额外引入手势库：
 * 只在明显的横向滑动（`|dx| > 8` 且比纵向大）时接管，
 * 纵向滚动列表仍然归 `FlatList`。
 */
export function LedgerEntryRow({ entry, onCopy, onDelete }: LedgerEntryRowProps) {
  // Animated.Value、PanResponder 和「当前是否展开」都要求跨渲染保持同一份，
  // 但又不需要触发渲染。把它们一起放进 useState 的惰性初始化里：
  // 只创建一次，且不在渲染期读写 ref，React Compiler 的规则也能过。
  const [swipe] = useState(() => {
    const translateX = new Animated.Value(0);
    let open = false;

    const settle = (nextOpen: boolean) => {
      open = nextOpen;
      Animated.spring(translateX, {
        toValue: nextOpen ? -ACTIONS_WIDTH : 0,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    };

    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: (_, state) =>
        Math.abs(state.dx) > 8 && Math.abs(state.dx) > Math.abs(state.dy) * 1.5,
      onPanResponderMove: (_, state) => {
        const base = open ? -ACTIONS_WIDTH : 0;
        const next = Math.max(-ACTIONS_WIDTH, Math.min(0, base + state.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, state) => {
        const base = open ? -ACTIONS_WIDTH : 0;
        settle(base + state.dx < -ACTIONS_WIDTH / 2);
      },
      onPanResponderTerminate: () => settle(open),
    });

    return { translateX, panResponder, settle };
  });

  const title = ledgerEntryTitle(entry);
  const amount = formatLedgerAmount(entry.kind, entry.amountCents);
  const { translateX, panResponder, settle } = swipe;

  const act = (action: () => void) => () => {
    settle(false);
    action();
  };

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`复制「${title}」`}
          onPress={act(onCopy)}
          style={({ pressed }) => [styles.action, styles.copy, pressed ? styles.pressed : null]}
        >
          <Ionicons name="copy-outline" size={18} color={palette.primary} />
          <AppText variant="caption" color={palette.primary}>
            复制
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`删除「${title}」`}
          onPress={act(onDelete)}
          style={({ pressed }) => [styles.action, styles.delete, pressed ? styles.pressed : null]}
        >
          <Ionicons name="trash-outline" size={18} color={palette.danger} />
          <AppText variant="caption" color={palette.danger}>
            删除
          </AppText>
        </Pressable>
      </View>

      <Animated.View {...panResponder.panHandlers} style={[styles.row, { transform: [{ translateX }] }]}>
        <View style={styles.texts}>
          <AppText variant="body" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" color={palette.textMuted}>
            {formatLedgerTime(entry.occurredAt)}
          </AppText>
        </View>
        <AppText variant="subtitle" color={entry.kind === 'expense' ? palette.danger : palette.success}>
          {amount}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  actions: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  copy: {
    backgroundColor: palette.primarySoft,
  },
  delete: {
    backgroundColor: palette.dangerSoft,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: palette.surface,
  },
  texts: {
    flexShrink: 1,
    gap: 2,
  },
});
