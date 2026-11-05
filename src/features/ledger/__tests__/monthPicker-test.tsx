import { fireEvent, render, screen } from '@testing-library/react-native';

import { MonthPicker } from '../MonthPicker';

describe('<MonthPicker />', () => {
  test('顶部是年份，下面 12 个月都能点，当前月选中', async () => {
    await render(<MonthPicker value={{ year: 2026, month: 11 }} onChange={() => {}} />);

    expect(screen.getByText('2026 年')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '11 月' })).toBeSelected();
    expect(screen.getByRole('button', { name: '1 月' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: '12 月' })).toBeOnTheScreen();
  });

  test('点月份只换月、不换年', async () => {
    const onChange = jest.fn();
    await render(<MonthPicker value={{ year: 2026, month: 11 }} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: '3 月' }));

    expect(onChange).toHaveBeenCalledWith({ year: 2026, month: 3 });
  });

  test('年份左右箭头逐年翻，月份保持不变', async () => {
    const onChange = jest.fn();
    await render(<MonthPicker value={{ year: 2026, month: 11 }} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: '上一年' }));
    expect(onChange).toHaveBeenLastCalledWith({ year: 2025, month: 11 });

    await fireEvent.press(screen.getByRole('button', { name: '下一年' }));
    expect(onChange).toHaveBeenLastCalledWith({ year: 2027, month: 11 });
  });
});
