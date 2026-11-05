import { fireEvent, render, screen } from '@testing-library/react-native';

import { YearPicker } from '../YearPicker';

describe('<YearPicker />', () => {
  const years = [2026, 2025, 2024];

  test('默认只显示当前年份，不展开列表', async () => {
    await render(<YearPicker value={2026} years={years} onChange={() => {}} />);

    expect(screen.getByText('2026 年')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '切换到 2024 年' })).not.toBeOnTheScreen();
  });

  test('点开后列出所有年份，当前年份选中；选完自动收起', async () => {
    const onChange = jest.fn();
    await render(<YearPicker value={2026} years={years} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: '年份：2026 年' }));

    expect(screen.getByRole('button', { name: '切换到 2026 年' })).toBeSelected();
    expect(screen.getByRole('button', { name: '切换到 2024 年' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: '切换到 2024 年' }));

    expect(onChange).toHaveBeenCalledWith(2024);
    expect(screen.queryByRole('button', { name: '切换到 2024 年' })).not.toBeOnTheScreen();
  });
});
