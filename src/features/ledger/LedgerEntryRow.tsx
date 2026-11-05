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
  /** 右滑后点「删除」：由调用方弹二次确认 */
  onDelete: () => void;
}

/** 单侧操作区宽度：复制和删除各自只占这一侧。 */
const ACTION_WIDTH = 76;

type OpenSide = 'copy' | 'delete' | null;

function offsetOf(side: OpenSide): number {
  if (side === 'copy') {
    return -ACTION_WIDTH;
  }
  if (side === 'delete') {
    return ACTION_WIDTH;
  }
  return 0;
}

function clampOffset(value: number): number {
  return Math.max(-ACTION_WIDTH, Math.min(ACTION_WIDTH, value));
}

/**
 * 一条记账记录：**左滑复制，右滑删除**。
 *
 * 两个动作分在两侧，一次滑动只会露出一个，减少「想复制却点到删除」。
 * 复制是这个功能最常见的动作：每天同一趟地铁、同一份早餐，
 * 金额、备注、标签都不变，只是时间变成了现在，所以不弹表单，点一下就好。
 *
 * 手势用内置的 `PanResponder` + `Animated`，不额外引入手势库：
 * 只在明显的横向滑动（`|dx| > 8` 且比纵向大）时接管，
 * 纵向滚动列表仍然归 `SectionList`。
 */
export function LedgerEntryRow({ entry, onCopy, onDelete }: LedgerEntryRowProps) {
  // 哪一侧露出来了要参与渲染（决定哪个按钮对读屏可见），所以用 state；
  // Animated.Value、PanResponder 和手势内部的当前侧仍在惰性初始化里只建一次。
  const [openSide, setOpenSide] = useState<OpenSide>(null);
  const [swipe] = useState(() => {
    const translateX = new Animated.Value(0);
    let open: OpenSide = null;

    const settle = (next: OpenSide) => {
      open = next;
      setOpenSide(next);
      Animated.spring(translateX, {
        toValue: offsetOf(next),
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    };

    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: (_, state) =>
        Math.abs(state.dx) > 8 && Math.abs(state.dx) > Math.abs(state.dy) * 1.5,
      onPanResponderMove: (_, state) => {
        translateX.setValue(clampOffset(offsetOf(open) + state.dx));
      },
      onPanResponderRelease: (_, state) => {
        const next = clampOffset(offsetOf(open) + state.dx);
        if (open === null) {
          if (next <= -ACTION_WIDTH / 2) {
            settle('copy');
          } else if (next >= ACTION_WIDTH / 2) {
            settle('delete');
          } else {
            settle(null);
          }
          return;
        }
        // 已经展开时，只允许同侧保持或反向收起，不在一次滑动里换到另一侧。
        if (open === 'copy') {
          settle(next > -ACTION_WIDTH / 2 ? null : 'copy');
        } else {
          settle(next < ACTION_WIDTH / 2 ? null : 'delete');
        }
      },
      onPanResponderTerminate: () => settle(open),
    });

    return { translateX, panResponder, settle };
  });

  const title = ledgerEntryTitle(entry);
  const amount = formatLedgerAmount(entry.kind, entry.amountCents);
  const tag = entry.tag?.trim();
  const { translateX, panResponder, settle } = swipe;

  const act = (action: () => void) => () => {
    settle(null);
    action();
  };

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`删除「${title}」`}
          accessibilityElementsHidden={openSide !== 'delete'}
          importantForAccessibility={openSide === 'delete' ? 'yes' : 'no-hide-descendants'}
          onPress={act(onDelete)}
          style={({ pressed }) => [styles.action, styles.delete, pressed ? styles.pressed : null]}
        >
          <Ionicons name="trash-outline" size={18} color={palette.danger} />
          <AppText variant="caption" color={palette.danger}>
            删除
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`复制「${title}」`}
          accessibilityElementsHidden={openSide !== 'copy'}
          importantForAccessibility={openSide === 'copy' ? 'yes' : 'no-hide-descendants'}
          onPress={act(onCopy)}
          style={({ pressed }) => [styles.action, styles.copy, pressed ? styles.pressed : null]}
        >
          <Ionicons name="copy-outline" size={18} color={palette.primary} />
          <AppText variant="caption" color={palette.primary}>
            复制
          </AppText>
        </Pressable>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        accessibilityHint="左滑复制，右滑删除"
        style={[styles.row, { transform: [{ translateX }] }]}
      >
        <View style={styles.texts}>
          <AppText variant="body" numberOfLines={1}>
            {title}
          </AppText>
          <View style={styles.metaRow}>
            <AppText variant="caption" color={palette.textMuted}>
              {formatLedgerTime(entry.occurredAt)}
            </AppText>
            {tag ? (
              <View style={styles.tag}>
                <Ionicons name="pricetag-outline" size={10} color={palette.primary} />
                <AppText variant="caption" color={palette.primary} numberOfLines={1} style={styles.tagText}>
                  {tag}
                </AppText>
              </View>
            ) : null}
          </View>
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
    left: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: palette.primarySoft,
  },
  tagText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
  },
});
