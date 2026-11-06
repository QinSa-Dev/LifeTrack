import { act, renderHook } from '@testing-library/react-native';
import {
  Keyboard,
  Platform,
  type KeyboardEvent,
  type KeyboardEventName,
  type LayoutChangeEvent,
} from 'react-native';

import { useKeyboardOverlap } from '../useKeyboardOverlap';

type KeyboardListener = Parameters<typeof Keyboard.addListener>[1];

const listeners = new Map<KeyboardEventName, KeyboardListener>();
const SHOW_EVENT: KeyboardEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT: KeyboardEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
const SCREEN_HEIGHT = 844;

function keyboardEvent(screenY: number, height: number): KeyboardEvent {
  const coordinates = { screenX: 0, screenY, width: 390, height };
  return {
    duration: 250,
    easing: 'keyboard',
    endCoordinates: coordinates,
    startCoordinates: coordinates,
    isEventFromThisApp: true,
  };
}

function layout(height: number) {
  return { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } } as LayoutChangeEvent;
}

beforeEach(() => {
  listeners.clear();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    listeners.set(event, listener);
    return { remove: jest.fn() };
  });
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** 先量出容器底边——真实界面里 onLayout 总在建监听之后、键盘弹出之前跑一次 */
async function mountWithLayout() {
  const hook = await renderHook(() => useKeyboardOverlap());
  await act(() => hook.result.current.onLayout(layout(SCREEN_HEIGHT)));
  return hook;
}

describe('useKeyboardOverlap', () => {
  test('键盘弹出前不额外留白', async () => {
    const { result } = await mountWithLayout();
    expect(result.current.overlap).toBe(0);
  });

  test('按「容器底边 - 键盘顶边」让位，键盘收起后恢复', async () => {
    const { result } = await mountWithLayout();

    await act(() => listeners.get(SHOW_EVENT)?.(keyboardEvent(SCREEN_HEIGHT - 300, 300)));
    expect(result.current.overlap).toBe(300);

    await act(() => listeners.get(HIDE_EVENT)?.(keyboardEvent(SCREEN_HEIGHT, 0)));
    expect(result.current.overlap).toBe(0);
  });

  test('窗口已经被系统顶上去时不再重复让位', async () => {
    const { result } = await renderHook(() => useKeyboardOverlap());
    // 容器底边已经在键盘上方
    await act(() => result.current.onLayout(layout(SCREEN_HEIGHT - 300)));

    await act(() => listeners.get(SHOW_EVENT)?.(keyboardEvent(SCREEN_HEIGHT - 300, 300)));
    expect(result.current.overlap).toBe(0);
  });

  test('屏幕坐标异常（键盘顶边 <= 0）时不让位', async () => {
    const { result } = await mountWithLayout();

    await act(() => listeners.get(SHOW_EVENT)?.(keyboardEvent(0, 300)));
    expect(result.current.overlap).toBe(0);
  });

  test('挂载时键盘已经弹出，用当前键盘高度算', async () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({
      screenX: 0,
      screenY: SCREEN_HEIGHT - 320,
      width: 390,
      height: 320,
    });

    const { result } = await mountWithLayout();
    expect(result.current.overlap).toBe(320);
  });
});
