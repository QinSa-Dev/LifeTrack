import { fireEvent, render, screen } from '@testing-library/react-native';

import { NavigationSettingsCard } from '../NavigationSettingsCard';
import {
  TAB_ROUTES,
  defaultNavigationPreferences,
  type NavigationPreferences,
} from '../navigationPreferences';

function renderCard(
  preferences: NavigationPreferences = defaultNavigationPreferences(),
  error: string | null = null,
) {
  const onChange = jest.fn();
  return render(<NavigationSettingsCard preferences={preferences} error={error} onChange={onChange} />).then(
    () => onChange,
  );
}

describe('<NavigationSettingsCard />', () => {
  test('摆出四个标签的顺序与默认页；两端的方向按钮禁用', async () => {
    await renderCard();

    expect(screen.getByText('底部导航')).toBeOnTheScreen();
    expect(screen.getByText('导航顺序')).toBeOnTheScreen();
    expect(screen.getByText('默认打开')).toBeOnTheScreen();

    expect(screen.getByRole('button', { name: '把「时间轴」左移' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '把「设置」右移' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '默认打开「时间轴」' })).toBeSelected();
  });

  test('右移一格：把时间轴换到统计后面，其余顺序不变', async () => {
    const onChange = await renderCard();

    await fireEvent.press(screen.getByRole('button', { name: '把「时间轴」右移' }));

    expect(onChange).toHaveBeenCalledWith({
      order: ['stats', 'index', 'definitions', 'settings'],
      defaultTab: 'index',
    });
  });

  test('左移一格：把统计换到最前面', async () => {
    const onChange = await renderCard();

    await fireEvent.press(screen.getByRole('button', { name: '把「统计」左移' }));

    expect(onChange).toHaveBeenCalledWith({
      order: ['stats', 'index', 'definitions', 'settings'],
      defaultTab: 'index',
    });
  });

  test('选默认页：只改 defaultTab，顺序原样带回去', async () => {
    const onChange = await renderCard();

    await fireEvent.press(screen.getByRole('button', { name: '默认打开「事件」' }));

    expect(onChange).toHaveBeenCalledWith({
      order: [...TAB_ROUTES],
      defaultTab: 'definitions',
    });
  });

  test('偏好写失败时在卡片里说清楚，但顺序照常显示', async () => {
    await renderCard(defaultNavigationPreferences(), '数据库忙');

    expect(screen.getByText(/导航偏好没能记住：数据库忙/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '把「统计」左移' })).not.toBeDisabled();
  });
});
