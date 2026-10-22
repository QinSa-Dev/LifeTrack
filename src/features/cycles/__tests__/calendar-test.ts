import type { CycleEntry } from '@/domain/models';
import {
  buildMonthGrid,
  clampMonthToRange,
  describeCalendarDay,
  indexEntriesByDate,
  monthIntersectsRange,
  monthLabel,
  shiftMonth,
  WEEKDAY_LABELS,
} from '@/features/cycles/calendar';

const T1 = '2026-10-19T08:00:00.000Z';

function makeEntry(overrides: Partial<CycleEntry> & { date: string }): CycleEntry {
  return {
    id: `entry-${overrides.date}`,
    instanceId: 'instance-1',
    symptoms: [],
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

describe('WEEKDAY_LABELS', () => {
  it('周一打头、周日收尾，与 weekdayIndex 对齐', () => {
    expect(WEEKDAY_LABELS).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });
});

describe('buildMonthGrid', () => {
  it('格子数是 7 的整数倍，且每格都落在本月内或为补白', () => {
    const cells = buildMonthGrid('2026-10-19');
    expect(cells.length % 7).toBe(0);
    expect(cells.filter((cell) => cell.date !== undefined).length).toBe(31);
    expect(cells.every((cell) => cell.date === undefined || cell.date.startsWith('2026-10'))).toBe(true);
  });

  it('2026-10：1 号是周四 → 前面补 3 格，1 号在第 4 格', () => {
    const cells = buildMonthGrid('2026-10-01');
    expect(cells.slice(0, 3)).toEqual([{}, {}, {}]);
    expect(cells[3]?.date).toBe('2026-10-01');
    expect(cells[33]?.date).toBe('2026-10-31');
    expect(cells.length).toBe(35); // 3 + 31 = 34，补到 35
    expect(cells[34]?.date).toBeUndefined();
  });

  it('2026-02（平年）：1 号是周日 → 前面补 6 格，2 月 28 日是最后一格日期', () => {
    const cells = buildMonthGrid('2026-02-01');
    expect(cells[6]?.date).toBe('2026-02-01');
    expect(cells[33]?.date).toBe('2026-02-28');
    expect(cells.length).toBe(35);
  });

  it('2024-02（闰年）：包含 2 月 29 日', () => {
    const cells = buildMonthGrid('2024-02-15');
    const dates = cells.map((cell) => cell.date).filter((date): date is string => date !== undefined);
    expect(dates).toHaveLength(29);
    expect(dates).toContain('2024-02-29');
    expect(cells.length % 7).toBe(0);
  });

  it('日期是连续的一天接一天', () => {
    const dates = buildMonthGrid('2026-12-31')
      .map((cell) => cell.date)
      .filter((date): date is string => date !== undefined);
    expect(dates[0]).toBe('2026-12-01');
    expect(dates[dates.length - 1]).toBe('2026-12-31');
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe('monthLabel', () => {
  it('显示年与月，月份不补零', () => {
    expect(monthLabel('2026-10-19')).toBe('2026 年 10 月');
    expect(monthLabel('2026-01-05')).toBe('2026 年 1 月');
  });
});

describe('shiftMonth', () => {
  it('按月翻页，结果仍是月初', () => {
    expect(shiftMonth('2026-10-19', 1)).toBe('2026-11-01');
    expect(shiftMonth('2026-10-19', -1)).toBe('2026-09-01');
    expect(shiftMonth('2026-10-19', 0)).toBe('2026-10-01');
  });

  it('跨年', () => {
    expect(shiftMonth('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('monthIntersectsRange', () => {
  it('整段落在同一个月', () => {
    expect(monthIntersectsRange('2026-10-01', '2026-10-01', '2026-10-05')).toBe(true);
    expect(monthIntersectsRange('2026-09-01', '2026-10-01', '2026-10-05')).toBe(false);
    expect(monthIntersectsRange('2026-11-01', '2026-10-01', '2026-10-05')).toBe(false);
  });

  it('跨月的区间：头尾月份都算相交，中间月份也算', () => {
    expect(monthIntersectsRange('2026-10-01', '2026-10-20', '2026-12-05')).toBe(true);
    expect(monthIntersectsRange('2026-11-01', '2026-10-20', '2026-12-05')).toBe(true);
    expect(monthIntersectsRange('2026-12-01', '2026-10-20', '2026-12-05')).toBe(true);
    expect(monthIntersectsRange('2026-09-01', '2026-10-20', '2026-12-05')).toBe(false);
    expect(monthIntersectsRange('2027-01-01', '2026-10-20', '2026-12-05')).toBe(false);
  });

  it('进行中的周期（没有结束日）只约束下界', () => {
    expect(monthIntersectsRange('2026-10-01', '2026-10-20', undefined)).toBe(true);
    expect(monthIntersectsRange('2030-01-01', '2026-10-20', undefined)).toBe(true);
    expect(monthIntersectsRange('2026-09-01', '2026-10-20', undefined)).toBe(false);
  });
});

describe('clampMonthToRange', () => {
  it('区间在将来 / 已经结束：夹到区间那一头的月份', () => {
    expect(clampMonthToRange('2026-08-15', '2026-10-20', '2026-12-05')).toBe('2026-10-01');
    expect(clampMonthToRange('2027-02-15', '2026-10-20', '2026-12-05')).toBe('2026-12-01');
  });

  it('区间内保持不动，并归一到月初', () => {
    expect(clampMonthToRange('2026-11-15', '2026-10-20', '2026-12-05')).toBe('2026-11-01');
  });

  it('进行中的周期没有上界', () => {
    expect(clampMonthToRange('2030-01-15', '2026-10-20', undefined)).toBe('2030-01-01');
    expect(clampMonthToRange('2026-01-15', '2026-10-20', undefined)).toBe('2026-10-01');
  });
});

describe('indexEntriesByDate', () => {
  it('按日期索引，带上症状个数与阶段', () => {
    const marks = indexEntriesByDate([
      makeEntry({ date: '2026-10-02', phase: '经期', symptoms: ['头痛', '乏力'] }),
      makeEntry({ date: '2026-10-03' }),
    ]);

    expect(marks.get('2026-10-02')).toEqual({ hasEntry: true, symptomCount: 2, phase: '经期' });
    expect(marks.get('2026-10-03')).toEqual({ hasEntry: true, symptomCount: 0, phase: undefined });
    expect(marks.has('2026-10-04')).toBe(false);
  });

  it('软删除的那天不出现在月视图上', () => {
    const marks = indexEntriesByDate([
      makeEntry({ date: '2026-10-02' }),
      makeEntry({ date: '2026-10-03', deletedAt: '2026-10-19T09:00:00.000Z' }),
    ]);

    expect([...marks.keys()]).toEqual(['2026-10-02']);
  });
});

describe('describeCalendarDay', () => {
  it('无记录 / 有记录 / 今天 / 区间外', () => {
    expect(describeCalendarDay('2026-10-02', undefined, { inRange: true, isToday: false })).toBe(
      '日历 2026-10-02，无记录',
    );
    expect(
      describeCalendarDay(
        '2026-10-02',
        { hasEntry: true, symptomCount: 2, phase: '经期' },
        { inRange: true, isToday: false },
      ),
    ).toBe('日历 2026-10-02，有记录（经期，2 个症状）');
    expect(
      describeCalendarDay(
        '2026-10-22',
        { hasEntry: true, symptomCount: 0 },
        {
          inRange: true,
          isToday: true,
        },
      ),
    ).toBe('日历 2026-10-22，今天，有记录');
    expect(describeCalendarDay('2026-10-30', undefined, { inRange: false, isToday: false })).toBe(
      '日历 2026-10-30，不在周期区间内',
    );
  });

  it('区间外的格子里有记录也只说「不在区间」', () => {
    expect(
      describeCalendarDay(
        '2026-10-30',
        { hasEntry: true, symptomCount: 1 },
        {
          inRange: false,
          isToday: false,
        },
      ),
    ).toBe('日历 2026-10-30，不在周期区间内');
  });
});
