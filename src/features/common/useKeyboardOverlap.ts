import { useCallback, useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent, type LayoutChangeEvent } from 'react-native';

/** 让布局跟着键盘一起动（RN 内置，但类型里有的版本没暴露，取不到就退回硬切） */
function animateWithKeyboard(event: KeyboardEvent) {
  Keyboard.scheduleLayoutAnimation?.(event);
}

/** 键盘顶边（屏幕坐标）：null 表示键盘没弹出 */
function currentKeyboardTop(): number | null {
  return Keyboard.isVisible() ? (Keyboard.metrics()?.screenY ?? null) : null;
}

/**
 * 键盘遮住容器底边的距离（0 表示没遮住），配合 `onLayout` 一起用：
 *
 * ```tsx
 * const { overlap, onLayout } = useKeyboardOverlap();
 * <View style={{ paddingBottom: overlap }} onLayout={onLayout}>…</View>
 * ```
 *
 * 为什么不用 `KeyboardAvoidingView`：
 * 这个表单在 `Modal` 里，Android 从 edge-to-edge 起不再帮窗口 `adjustResize`，
 * 而独立窗口里 `KeyboardAvoidingView` 的坐标换算也对不上，键盘会直接盖住按钮。
 * 这里统一用「容器底边（窗口坐标） - 键盘顶边（屏幕坐标）」自己算，
 * 所以 `Modal` 要开 `statusBarTranslucent` / `navigationBarTranslucent`，
 * 保证窗口坐标和屏幕坐标一致。
 */
export function useKeyboardOverlap(enabled = true) {
  /** 容器底边（窗口坐标），由 `onLayout` 给 */
  const [containerBottom, setContainerBottom] = useState<number | null>(null);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(currentKeyboardTop);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onShow = (event: KeyboardEvent) => {
      setKeyboardTop(event.endCoordinates.screenY);
      animateWithKeyboard(event);
    };
    const onHide = (event: KeyboardEvent) => {
      setKeyboardTop(null);
      animateWithKeyboard(event);
    };

    // Android 没有 `keyboardWillShow` / `keyboardWillHide`
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subscriptions = [Keyboard.addListener(showEvent, onShow), Keyboard.addListener(hideEvent, onHide)];

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [enabled]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setContainerBottom(y + height);
  }, []);

  const overlap =
    !enabled || keyboardTop === null || keyboardTop <= 0 || containerBottom === null
      ? 0
      : Math.max(0, containerBottom - keyboardTop);

  return { overlap, onLayout };
}
