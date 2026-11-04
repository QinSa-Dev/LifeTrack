import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { MonthCalendar } from '../MonthCalendar';
import { buildMonthGrid, monthLabel, type DayMark } from '../calendar';

const CELLS = buildMonthGrid('2026-10-01');
const LABEL = monthLabel('2026-10-01');

function renderCalendar(
  overrides: Partial<ComponentProps<typeof MonthCalendar>> = {},
  marks: ReadonlyMap<string, DayMark> = new Map(),
) {
  return render(
    <MonthCalendar
      label={LABEL}
      cells={CELLS}
      marks={marks}
      startDate="2026-10-01"
      endDate="2026-10-31"
      today="2026-10-15"
      onSelectDate={() => {}}
      onShiftMonth={() => {}}
      canShiftBack
      canShiftForward
      {...overrides}
    />,
  );
}

describe('<MonthCalendar />', () => {
  test('摆出月份、星期表头与每一天', async () => {
    await renderCalendar();

    expect(screen.getByText('2026 年 10 月')).toBeOnTheScreen();
    for (const weekday of ['一', '二', '三', '四', '五', '六', '日']) {
      expect(screen.getByText(weekday)).toBeOnTheScreen();
    }
    expect(screen.getByLabelText(/日历 2026-10-01/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/日历 2026-10-31/)).toBeOnTheScreen();
  });

  test('区间内的日子可点，点下去把日期交给调用方', async () => {
    const onSelectDate = jest.fn();
    await renderCalendar({ onSelectDate });

    await fireEvent.press(screen.getByLabelText(/日历 2026-10-03/));

    expect(onSelectDate).toHaveBeenCalledWith('2026-10-03');
  });

  test('区间外的日子灰掉且点不动（仓储也会拒绝，不如一开始就不给点）', async () => {
    const onSelectDate = jest.fn();
    await renderCalendar({ onSelectDate, startDate: '2026-10-05', endDate: '2026-10-20' });

    const outside = screen.getByLabelText(/日历 2026-10-04，不在周期区间内/);
    expect(outside).toBeDisabled();

    await fireEvent.press(outside);

    expect(onSelectDate).not.toHaveBeenCalled();
  });

  test('今天与选中的那天都写在朗读文字里，选中状态可被读屏识别', async () => {
    await renderCalendar({ selectedDate: '2026-10-02' });

    expect(screen.getByLabelText(/日历 2026-10-15，今天，无记录/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/日历 2026-10-02/)).toBeSelected();
    expect(screen.getByLabelText(/日历 2026-10-03/)).not.toBeSelected();
  });

  test('有记录 / 有症状的日子在朗读文字里说清楚', async () => {
    const marks: ReadonlyMap<string, DayMark> = new Map([
      ['2026-10-02', { hasEntry: true, symptomCount: 2, phase: '经期' }],
      ['2026-10-03', { hasEntry: true, symptomCount: 0 }],
    ]);
    await renderCalendar({}, marks);

    expect(screen.getByLabelText('日历 2026-10-02，有记录（经期，2 个症状）')).toBeOnTheScreen();
    expect(screen.getByLabelText('日历 2026-10-03，有记录')).toBeOnTheScreen();
  });

  test('翻月按钮各自按能不能翻来禁用，点得动时交回偏移量', async () => {
    const onShiftMonth = jest.fn();
    await renderCalendar({ onShiftMonth, canShiftBack: false, canShiftForward: true });

    expect(screen.getByRole('button', { name: '‹ 上个月' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '下个月 ›' }));

    expect(onShiftMonth).toHaveBeenCalledWith(1);
  });
});
