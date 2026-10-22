import { ValidationError } from '@/domain/errors';
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  isDateWithin,
  isValidIsoDate,
  startOfMonth,
  weekdayIndex,
} from '@/domain/dates';

describe('isValidIsoDate', () => {
  it('接受真实存在的日期', () => {
    expect(isValidIsoDate('2026-10-19')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true); // 闰年
  });

  it('拒绝格式错误', () => {
    expect(isValidIsoDate('2026-10-19T00:00:00Z')).toBe(false);
    expect(isValidIsoDate('2026/10/19')).toBe(false);
    expect(isValidIsoDate('26-10-19')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });

  it('拒绝不存在的日期（不被 JS 的归一化骗过去）', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026-02-29')).toBe(false); // 平年
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('2026-10-00')).toBe(false);
  });
});

describe('addDays', () => {
  it('按日历天加减', () => {
    expect(addDays('2026-10-19', 1)).toBe('2026-10-20');
    expect(addDays('2026-10-19', -1)).toBe('2026-10-18');
  });

  it('跨月与跨年', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // 闰年
  });

  it('非法日期或非整数天数抛 ValidationError', () => {
    expect(() => addDays('2026-02-31', 1)).toThrow(ValidationError);
    expect(() => addDays('2026-10-19', 1.5)).toThrow(ValidationError);
  });
});

describe('daysBetween', () => {
  it('计算相差天数（可负）', () => {
    expect(daysBetween('2026-10-01', '2026-10-19')).toBe(18);
    expect(daysBetween('2026-10-19', '2026-10-01')).toBe(-18);
    expect(daysBetween('2026-10-19', '2026-10-19')).toBe(0);
  });

  it('跨月正确', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('isDateWithin', () => {
  const start = '2026-10-01';
  const end = '2026-10-05';

  it('闭区间：含首尾', () => {
    expect(isDateWithin('2026-10-01', start, end)).toBe(true);
    expect(isDateWithin('2026-10-05', start, end)).toBe(true);
    expect(isDateWithin('2026-10-03', start, end)).toBe(true);
  });

  it('区间外为 false', () => {
    expect(isDateWithin('2026-09-30', start, end)).toBe(false);
    expect(isDateWithin('2026-10-06', start, end)).toBe(false);
  });

  it('endDate 为空表示进行中：只约束下界', () => {
    expect(isDateWithin('2030-01-01', start, undefined)).toBe(true);
    expect(isDateWithin('2026-09-30', start, undefined)).toBe(false);
  });
});

describe('startOfMonth', () => {
  it('取所在月的第一天', () => {
    expect(startOfMonth('2026-10-19')).toBe('2026-10-01');
    expect(startOfMonth('2026-10-01')).toBe('2026-10-01');
    expect(startOfMonth('2026-12-31')).toBe('2026-12-01');
  });

  it('非法日期抛 ValidationError', () => {
    expect(() => startOfMonth('2026-02-31')).toThrow(ValidationError);
  });
});

describe('daysInMonth', () => {
  it('平年与闰年的 2 月', () => {
    expect(daysInMonth('2026-02-10')).toBe(28);
    expect(daysInMonth('2024-02-10')).toBe(29);
  });

  it('大月小月', () => {
    expect(daysInMonth('2026-10-01')).toBe(31);
    expect(daysInMonth('2026-11-30')).toBe(30);
    expect(daysInMonth('2026-12-31')).toBe(31);
  });

  it('非法日期抛 ValidationError', () => {
    expect(() => daysInMonth('2026-13-01')).toThrow(ValidationError);
  });
});

describe('addMonths', () => {
  it('按月加减', () => {
    expect(addMonths('2026-10-19', 1)).toBe('2026-11-19');
    expect(addMonths('2026-10-19', -1)).toBe('2026-09-19');
    expect(addMonths('2026-10-19', 0)).toBe('2026-10-19');
  });

  it('跨年', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });

  it('日号超出目标月份时夹到月末（不溢出到下个月）', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // 闰年
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-05-31', 1)).toBe('2026-06-30');
  });

  it('非法输入抛 ValidationError', () => {
    expect(() => addMonths('2026-02-30', 1)).toThrow(ValidationError);
    expect(() => addMonths('2026-10-19', 1.5)).toThrow(ValidationError);
  });
});

describe('weekdayIndex', () => {
  it('周一为 0、周日为 6', () => {
    expect(weekdayIndex('2026-10-19')).toBe(0); // 周一
    expect(weekdayIndex('2026-10-22')).toBe(3); // 周四
    expect(weekdayIndex('2026-10-25')).toBe(6); // 周日
    expect(weekdayIndex('2026-11-01')).toBe(6); // 周日
  });

  it('非法日期抛 ValidationError', () => {
    expect(() => weekdayIndex('2026-10-32')).toThrow(ValidationError);
  });
});
