import { ValidationError } from '@/domain/errors';
import { addDays, daysBetween, isDateWithin, isValidIsoDate } from '@/domain/dates';

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
