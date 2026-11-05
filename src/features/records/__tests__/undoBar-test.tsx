import { fireEvent, render, screen } from '@testing-library/react-native';

import { UndoBar } from '../UndoBar';

describe('<UndoBar />', () => {
  test('软删除后给「撤销」与「知道了」两个出口', async () => {
    await render(<UndoBar message="已删除「喝水」" onUndo={() => {}} onDismiss={() => {}} />);

    expect(screen.getByText('已删除「喝水」')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '知道了' })).toBeEnabled();
  });

  test('两个按钮分别走撤销与关闭，不会互相串台', async () => {
    const onUndo = jest.fn();
    const onDismiss = jest.fn();
    await render(<UndoBar message="已删除" onUndo={onUndo} onDismiss={onDismiss} />);

    await fireEvent.press(screen.getByRole('button', { name: '撤销' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: '知道了' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('撤销进行中：文字改「撤销中…」，两个按钮都禁用', async () => {
    const onUndo = jest.fn();
    const onDismiss = jest.fn();
    await render(<UndoBar message="已删除" onUndo={onUndo} onDismiss={onDismiss} busy />);

    expect(screen.getByRole('button', { name: '撤销中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '知道了' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: '撤销中…' }));
    await fireEvent.press(screen.getByRole('button', { name: '知道了' }));

    expect(onUndo).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
