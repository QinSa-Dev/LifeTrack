import {
  MONTHS,
  currentYearMonth,
  monthLabel,
  monthRangeIso,
  sameYearMonth,
  shiftYear,
  yearLabel,
} from '@/features/ledger/month';

describe('currentYearMonth', () => {
  test('按设备本地时区取年与月（月份从 1 开始）', () => {
    expect(currentYearMonth(new Date(2026, 0, 15, 12, 0))).toEqual({ year: 2026, month: 1 });
    expect(currentYearMonth(new Date(2026, 11, 31, 23, 59))).toEqual({ year: 2026, month: 12 });
  });
});

describe('sameYearMonth / shiftYear', () => {
  test('同年同月才相等', () => {
    expect(sameYearMonth({ year: 2026, month: 11 }, { year: 2026, month: 11 })).toBe(true);
    expect(sameYearMonth({ year: 2026, month: 11 }, { year: 2026, month: 12 })).toBe(false);
    expect(sameYearMonth({ year: 2026, month: 11 }, { year: 2025, month: 11 })).toBe(false);
  });

  test('按年平移保留月份，可以跨到过去或未来', () => {
    expect(shiftYear({ year: 2026, month: 11 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftYear({ year: 2026, month: 11 }, 2)).toEqual({ year: 2028, month: 11 });
  });
});

describe('monthRangeIso', () => {
  test('区间是本地零点到下个月本地零点，而不是 UTC 的月初', () => {
    const { from, until } = monthRangeIso({ year: 2026, month: 11 });
    expect(from).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).toISOString());
    expect(until).toBe(new Date(2026, 11, 1, 0, 0, 0, 0).toISOString());
  });

  test('12 月的结束时间落到次年 1 月 1 日', () => {
    const { from, until } = monthRangeIso({ year: 2026, month: 12 });
    expect(from).toBe(new Date(2026, 11, 1).toISOString());
    expect(until).toBe(new Date(2027, 0, 1).toISOString());
  });
});

describe('标签', () => {
  test('年、月文案与 12 个月列表', () => {
    expect(yearLabel({ year: 2026, month: 11 })).toBe('2026 年');
    expect(monthLabel(1)).toBe('1 月');
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0]).toBe(1);
    expect(MONTHS[11]).toBe(12);
  });
});
