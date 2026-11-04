import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../Button';

describe('<Button />', () => {
  test('显示可见文字，点击触发 onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="保存" onPress={onPress} />);

    expect(screen.getByText('保存')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '保存' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('无障碍名字可以比可见文字更具体，且不改变可见文字', async () => {
    await render(<Button label="删除" accessibilityLabel="删除「健康」" onPress={() => {}} />);

    expect(screen.getByRole('button', { name: '删除「健康」' })).toBeOnTheScreen();
    expect(screen.getByText('删除')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeOnTheScreen();
  });

  test('disabled 时点不动', async () => {
    const onPress = jest.fn();
    await render(<Button label="添加" onPress={onPress} disabled />);

    const button = screen.getByRole('button', { name: '添加' });
    expect(button).toBeDisabled();

    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
  });
});
