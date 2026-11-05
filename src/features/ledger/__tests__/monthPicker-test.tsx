import { fireEvent, render, screen } from '@testing-library/react-native';

import { MonthPicker } from '../MonthPicker';

describe('<MonthPicker />', () => {
  test('时间块上面是年份，下面是当前月份；默认不展开 12 个月', async () => {
    await render(<MonthPicker value={{ year: 2026, month: 11 }} onChange={() => {}} />);

    expect(screen.getByText('2026 年')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '月份：11 月' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '1 月' })).not.toBeOnTheScreen();
  });

  test('点月份按钮才展开列表，选完自动收起', async () => {
    const onChange = jest.fn();
    await render(<MonthPicker value={{ year: 2026, month: 11 }} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: '月份：11 月' }));
    expect(screen.getByRole('button', { name: '1 月' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '11 月' })).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: '3 月' }));

    expect(onChange).toHaveBeenCalledWith({ year: 2026, month: 3 });
    expect(screen.queryByRole('button', { name: '3 月' })).not.toBeOnTheScreen();
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
