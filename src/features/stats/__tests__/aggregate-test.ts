import { ValidationError } from '@/domain/errors';
import type { EventDefinitionKind, EventRecord } from '@/domain/models';
import {
  aggregateByDay,
  aggregateByDefinition,
  aggregateByWeek,
  compareDefinitions,
  compareWindows,
  recentComparisonWindows,
  statsReadRange,
  summarize,
  summarizeWindow,
  TREND_RANGES,
} from '@/features/stats/aggregate';

/**
 * 构造一条记录。
 *
 * `at` 用**本地时间**字段构造 `Date` 再转成 ISO，因此无论测试机器在哪个时区，
 * 「这条记录属于哪一天/哪一周」都和断言里写的本地日期一致（与时区无关）。
 */
function makeRecord(options: {
  definitionId?: string;
  name?: string;
  kind?: EventDefinitionKind;
  value?: number;
  unit?: string;
  at: [number, number, number, number?, number?];
  deletedAt?: string;
  id?: string;
}): EventRecord {
  const [year, month, day, hour = 9, minute = 0] = options.at;
  const occurredAt = new Date(year, month - 1, day, hour, minute).toISOString();
  const definitionId = options.definitionId ?? 'd1';
  const kind = options.kind ?? 'counter';

  return {
    id: options.id ?? `${definitionId}-${occurredAt}`,
    definitionId,
    kind,
    value: options.value ?? 1,
    unit: options.unit,
    occurredAt,
    recordedAt: occurredAt,
    source: 'manual',
    tagIds: [],
    snapshot: { definitionId, name: options.name ?? '喝水', kind, unit: options.unit, tagIds: [] },
    deletedAt: options.deletedAt,
  };
}

/** 用「分类讨论」的顺序无关方式取某个定义的汇总。 */
function findTotal(totals: ReturnType<typeof aggregateByDefinition>, definitionId: string) {
  return totals.find((total) => total.definitionId === definitionId);
}

describe('aggregateByDefinition', () => {
  it('按定义分组：统计条数并合计取值', () => {
    const totals = aggregateByDefinition([
      makeRecord({ definitionId: 'd1', name: '喝水', unit: '杯', value: 1, at: [2026, 10, 18] }),
      makeRecord({ definitionId: 'd1', name: '喝水', unit: '杯', value: 2, at: [2026, 10, 19] }),
      makeRecord({
        definitionId: 'd2',
        name: '跑步',
        kind: 'quantity',
        unit: '公里',
        value: 5,
        at: [2026, 10, 19],
      }),
    ]);

    expect(totals).toHaveLength(2);
    expect(findTotal(totals, 'd1')?.recordCount).toBe(2);
    expect(findTotal(totals, 'd1')?.totalValue).toBe(3);
    expect(findTotal(totals, 'd1')?.unit).toBe('杯');
    expect(findTotal(totals, 'd2')?.kind).toBe('quantity');
    expect(findTotal(totals, 'd2')?.totalValue).toBe(5);
  });

  it('展示名取最近一条记录的快照名（定义改名不改历史）', () => {
    const totals = aggregateByDefinition([
      makeRecord({ definitionId: 'd1', name: '喝水', at: [2026, 10, 18] }),
      makeRecord({ definitionId: 'd1', name: '喝水（含茶）', at: [2026, 10, 19] }),
    ]);

    expect(findTotal(totals, 'd1')?.name).toBe('喝水（含茶）');
  });

  it('单位不一致时不给合计单位，但数值仍然合计', () => {
    const totals = aggregateByDefinition([
      makeRecord({ definitionId: 'd1', unit: '杯', value: 1, at: [2026, 10, 18] }),
      makeRecord({ definitionId: 'd1', unit: '毫升', value: 500, at: [2026, 10, 19] }),
    ]);

    expect(findTotal(totals, 'd1')?.unit).toBeUndefined();
    expect(findTotal(totals, 'd1')?.totalValue).toBe(501);
  });

  it('排除软删除的记录', () => {
    const totals = aggregateByDefinition([
      makeRecord({ definitionId: 'd1', value: 1, at: [2026, 10, 18] }),
      makeRecord({
        definitionId: 'd1',
        value: 100,
        at: [2026, 10, 19],
        deletedAt: '2026-10-19T10:00:00.000Z',
      }),
    ]);

    expect(findTotal(totals, 'd1')?.recordCount).toBe(1);
    expect(findTotal(totals, 'd1')?.totalValue).toBe(1);
  });

  it('按条数从多到少排序', () => {
    const totals = aggregateByDefinition([
      makeRecord({ definitionId: 'few', name: '少', at: [2026, 10, 19] }),
      makeRecord({ definitionId: 'many', name: '多', at: [2026, 10, 18] }),
      makeRecord({ definitionId: 'many', name: '多', at: [2026, 10, 19] }),
    ]);

    expect(totals.map((total) => total.definitionId)).toEqual(['many', 'few']);
  });

  it('挡住浮点误差：0.1 + 0.2 记成 0.3', () => {
    const totals = aggregateByDefinition([
      makeRecord({ definitionId: 'd1', kind: 'quantity', value: 0.1, at: [2026, 10, 18] }),
      makeRecord({ definitionId: 'd1', kind: 'quantity', value: 0.2, at: [2026, 10, 19] }),
    ]);

    expect(findTotal(totals, 'd1')?.totalValue).toBe(0.3);
  });
});

describe('aggregateByDay', () => {
  const now = new Date(2026, 9, 19, 12, 0).toISOString(); // 本地 2026-10-19 中午

  it('按本地日历日分桶，保留空天，从早到晚排列', () => {
    const days = aggregateByDay(
      [
        makeRecord({ value: 1, at: [2026, 10, 19, 9] }),
        makeRecord({ value: 1, at: [2026, 10, 19, 10] }),
        makeRecord({ value: 5, at: [2026, 10, 17, 9] }),
      ],
      3,
      now,
    );

    expect(days.map((day) => day.date)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
    expect(days.map((day) => day.recordCount)).toEqual([1, 0, 2]);
    expect(days[2]?.totalValue).toBe(2);
  });

  it('范围之外的记录不进桶', () => {
    const days = aggregateByDay([makeRecord({ at: [2026, 10, 10] })], 3, now);
    expect(days.reduce((sum, day) => sum + day.recordCount, 0)).toBe(0);
  });

  it('排除软删除的记录', () => {
    const days = aggregateByDay(
      [
        makeRecord({ at: [2026, 10, 19] }),
        makeRecord({ at: [2026, 10, 19], deletedAt: '2026-10-19T10:00:00.000Z' }),
      ],
      1,
      now,
    );

    expect(days[0]?.recordCount).toBe(1);
  });

  it('跳过无法解析的发生时间，不抛错', () => {
    const broken = { ...makeRecord({ at: [2026, 10, 19] }), occurredAt: '昨天' };
    const days = aggregateByDay([broken], 1, now);
    expect(days[0]?.recordCount).toBe(0);
  });

  it('范围不是正整数时抛 ValidationError', () => {
    expect(() => aggregateByDay([], 0, now)).toThrow(ValidationError);
    expect(() => aggregateByDay([], -1, now)).toThrow(ValidationError);
    expect(() => aggregateByDay([], 1.5, now)).toThrow(ValidationError);
  });
});

describe('aggregateByWeek', () => {
  // 本地 2026-10-19 是周一
  const now = new Date(2026, 9, 19, 12, 0).toISOString();

  it('按 ISO 周（周一为起点）分桶，桶的日期是周一', () => {
    const weeks = aggregateByWeek(
      [
        makeRecord({ at: [2026, 10, 19] }), // 本周
        makeRecord({ at: [2026, 10, 13] }), // 上周（周二）
        makeRecord({ at: [2026, 10, 13] }), // 上周
        makeRecord({ at: [2026, 10, 5] }), // 更早，超出范围
      ],
      2,
      now,
    );

    expect(weeks.map((week) => week.date)).toEqual(['2026-10-12', '2026-10-19']);
    expect(weeks.map((week) => week.recordCount)).toEqual([2, 1]);
  });
});

describe('summarize', () => {
  it('给出记录总数、事件数与覆盖的日期范围', () => {
    const summary = summarize([
      makeRecord({ definitionId: 'd1', at: [2026, 10, 17] }),
      makeRecord({ definitionId: 'd1', at: [2026, 10, 19] }),
      makeRecord({ definitionId: 'd2', at: [2026, 10, 18] }),
    ]);

    expect(summary.recordCount).toBe(3);
    expect(summary.definitionCount).toBe(2);
    expect(summary.firstDate).toBe('2026-10-17');
    expect(summary.lastDate).toBe('2026-10-19');
  });

  it('排除软删除，且无记录时不返回日期范围', () => {
    const summary = summarize([makeRecord({ at: [2026, 10, 19], deletedAt: '2026-10-19T10:00:00.000Z' })]);

    expect(summary.recordCount).toBe(0);
    expect(summary.definitionCount).toBe(0);
    expect(summary.firstDate).toBeUndefined();
    expect(summary.lastDate).toBeUndefined();
  });
});

describe('recentComparisonWindows', () => {
  const now = new Date(2026, 9, 19, 12, 0).toISOString(); // 本地 2026-10-19（周一）中午

  it('按天：本期是最近 N 个本地日历日，环比是紧挨着的前 N 天', () => {
    const windows = recentComparisonWindows('day', 3, 'previous', now);
    expect(windows.current).toEqual({ startDate: '2026-10-17', endDate: '2026-10-19' });
    expect(windows.previous).toEqual({ startDate: '2026-10-14', endDate: '2026-10-16' });
  });

  it('按天同比：整体往前挪 52 周，星期几对得上', () => {
    const windows = recentComparisonWindows('day', 3, 'lastYear', now);
    expect(windows.previous).toEqual({ startDate: '2025-10-18', endDate: '2025-10-20' });
    // 2026-10-19 与 2025-10-20 都是周一
    expect(new Date(2026, 9, 19).getDay()).toBe(new Date(2025, 9, 20).getDay());
  });

  it('按周：本期是最近 N 个 ISO 周，最后一桶是今天所在的那一周', () => {
    const windows = recentComparisonWindows('week', 2, 'previous', now);
    expect(windows.current).toEqual({ startDate: '2026-10-12', endDate: '2026-10-25' });
    expect(windows.previous).toEqual({ startDate: '2026-09-28', endDate: '2026-10-11' });
  });

  it('按周同比：往前挪 52 周，正好落在同样的周一起点', () => {
    const windows = recentComparisonWindows('week', 2, 'lastYear', now);
    expect(windows.previous.startDate).toBe('2025-10-13');
    expect(windows.previous.endDate).toBe('2025-10-26');
  });

  it('长度不是正整数时抛 ValidationError', () => {
    expect(() => recentComparisonWindows('day', 0, 'previous', now)).toThrow(ValidationError);
    expect(() => recentComparisonWindows('week', 2.5, 'previous', now)).toThrow(ValidationError);
  });

  it('参考时间不合法时抛 ValidationError', () => {
    expect(() => recentComparisonWindows('day', 3, 'previous', '昨天')).toThrow(ValidationError);
  });
});

describe('statsReadRange', () => {
  const now = new Date(2026, 9, 19, 12, 0).toISOString(); // 本地 2026-10-19（周一）中午

  it('取四种窗口（按天/按周 × 环比/同比）的并集，前后各留一天', () => {
    // 最早：按周同比的区间起点 2025-09-01 再往前一天；
    // 最晚：按周本期的终点（本周周日 2026-10-25）再往后两天。
    expect(statsReadRange(now)).toEqual({
      from: '2025-08-31T00:00:00.000Z',
      until: '2026-10-27T00:00:00.000Z',
    });
  });

  it('对每一种窗口都是超集：不早于窗口起点、不晚于窗口终点', () => {
    const range = statsReadRange(now);
    const from = Date.parse(range.from);
    const until = Date.parse(range.until);

    for (const unit of ['day', 'week'] as const) {
      for (const basis of ['previous', 'lastYear'] as const) {
        const windows = recentComparisonWindows(unit, TREND_RANGES[unit], basis, now);
        for (const window of [windows.current, windows.previous]) {
          expect(from).toBeLessThanOrEqual(Date.parse(`${window.startDate}T00:00:00.000Z`));
          expect(until).toBeGreaterThan(Date.parse(`${window.endDate}T23:59:59.999Z`));
        }
      }
    }
  });

  it('大约读到一年出头，不是全量', () => {
    const range = statsReadRange(now);
    const days = (Date.parse(range.until) - Date.parse(range.from)) / 86_400_000;
    expect(days).toBeGreaterThan(370);
    expect(days).toBeLessThan(430);
  });

  it('参考时间不合法时抛 ValidationError', () => {
    expect(() => statsReadRange('昨天')).toThrow(ValidationError);
  });
});

describe('窗口下推的一致性（时间范围只求超集）', () => {
  const now = new Date(2026, 9, 22, 9, 0).toISOString(); // 本地 2026-10-22（周四）上午

  it('只喂 statsReadRange 内的记录，趋势与对比的结果与喂全量完全一致', () => {
    // 横跨两年多：窗口外的（2024 / 2026-09-01）与窗口内的都有
    const days: [number, number, number][] = [
      [2024, 1, 5],
      [2024, 11, 11],
      [2025, 8, 30],
      [2025, 9, 2],
      [2025, 10, 8],
      [2025, 10, 21],
      [2026, 1, 1],
      [2026, 7, 7],
      [2026, 9, 1],
      [2026, 10, 6],
      [2026, 10, 19],
      [2026, 10, 22],
      [2026, 11, 30],
    ];
    const records = days.map((at, index) => makeRecord({ definitionId: index % 2 === 0 ? 'd1' : 'd2', at }));

    const range = statsReadRange(now);
    // 仓储那边是 `occurred_at >= from AND occurred_at < until`，这里用同样的口径筛
    const pushed = records.filter(
      (record) => record.occurredAt >= range.from && record.occurredAt < range.until,
    );
    expect(pushed.length).toBeGreaterThan(0);
    expect(pushed.length).toBeLessThan(records.length);

    for (const unit of ['day', 'week'] as const) {
      for (const basis of ['previous', 'lastYear'] as const) {
        const windows = recentComparisonWindows(unit, TREND_RANGES[unit], basis, now);
        expect(compareWindows(pushed, windows)).toEqual(compareWindows(records, windows));
        expect(compareDefinitions(pushed, windows)).toEqual(compareDefinitions(records, windows));
      }
    }

    expect(aggregateByDay(pushed, TREND_RANGES.day, now)).toEqual(
      aggregateByDay(records, TREND_RANGES.day, now),
    );
    expect(aggregateByWeek(pushed, TREND_RANGES.week, now)).toEqual(
      aggregateByWeek(records, TREND_RANGES.week, now),
    );
  });
});

describe('summarizeWindow', () => {
  it('只算落在闭区间里的可见记录', () => {
    const summary = summarizeWindow(
      [
        makeRecord({ definitionId: 'd1', at: [2026, 10, 15] }),
        makeRecord({ definitionId: 'd1', at: [2026, 10, 17] }),
        makeRecord({ definitionId: 'd2', at: [2026, 10, 19] }),
        makeRecord({ definitionId: 'd3', at: [2026, 10, 20] }), // 区间外
        makeRecord({ definitionId: 'd4', at: [2026, 10, 18], deletedAt: '2026-10-18T10:00:00.000Z' }),
      ],
      { startDate: '2026-10-15', endDate: '2026-10-19' },
    );

    expect(summary.recordCount).toBe(3);
    expect(summary.definitionCount).toBe(2);
  });
});

describe('compareWindows', () => {
  const now = new Date(2026, 9, 19, 12, 0).toISOString();
  const windows = recentComparisonWindows('day', 3, 'previous', now); // 本期 10-17~10-19，对照 10-14~10-16

  it('给出条数差与变化率', () => {
    const comparison = compareWindows(
      [
        makeRecord({ definitionId: 'd1', at: [2026, 10, 14] }),
        makeRecord({ definitionId: 'd1', at: [2026, 10, 15] }),
        makeRecord({ definitionId: 'd1', at: [2026, 10, 17] }),
        makeRecord({ definitionId: 'd1', at: [2026, 10, 18] }),
        makeRecord({ definitionId: 'd2', at: [2026, 10, 19] }),
      ],
      windows,
    );

    expect(comparison.current.recordCount).toBe(3);
    expect(comparison.previous.recordCount).toBe(2);
    expect(comparison.recordCountDelta).toBe(1);
    expect(comparison.recordCountRate).toBe(0.5);
  });

  it('对照期没有记录时不给变化率（不除零、不编造百分比）', () => {
    const comparison = compareWindows([makeRecord({ at: [2026, 10, 19] })], windows);

    expect(comparison.previous.recordCount).toBe(0);
    expect(comparison.recordCountRate).toBeUndefined();
    expect(comparison.recordCountDelta).toBe(1);
  });

  it('变化率挡住浮点误差，并能给出负值', () => {
    const comparison = compareWindows(
      [
        makeRecord({ at: [2026, 10, 14] }),
        makeRecord({ at: [2026, 10, 15] }),
        makeRecord({ at: [2026, 10, 16] }),
        makeRecord({ at: [2026, 10, 17] }),
      ],
      windows,
    );

    expect(comparison.recordCountDelta).toBe(-2);
    expect(comparison.recordCountRate).toBe(-0.6667);
  });

  it('两个窗口之外的记录不参与对比', () => {
    const comparison = compareWindows([makeRecord({ at: [2026, 9, 1] })], windows);
    expect(comparison.current.recordCount).toBe(0);
    expect(comparison.previous.recordCount).toBe(0);
  });
});

describe('compareDefinitions', () => {
  const now = new Date(2026, 9, 19, 12, 0).toISOString();
  const windows = recentComparisonWindows('day', 3, 'previous', now);

  it('逐事件给出本期 / 对照期条数与差值，名字取最新的快照名', () => {
    const changes = compareDefinitions(
      [
        makeRecord({ definitionId: 'd1', name: '喝水', at: [2026, 10, 17] }),
        makeRecord({ definitionId: 'd1', name: '喝水（含茶）', at: [2026, 10, 19] }),
        makeRecord({ definitionId: 'd2', name: '跑步', kind: 'quantity', at: [2026, 10, 15] }),
        makeRecord({ definitionId: 'd2', name: '跑步', kind: 'quantity', at: [2026, 10, 16] }),
        makeRecord({ definitionId: 'd2', name: '跑步', kind: 'quantity', at: [2026, 10, 18] }),
      ],
      windows,
    );

    const d1 = changes.find((change) => change.definitionId === 'd1');
    expect(d1).toMatchObject({
      name: '喝水（含茶）',
      kind: 'counter',
      currentCount: 2,
      previousCount: 0,
      delta: 2,
    });

    const d2 = changes.find((change) => change.definitionId === 'd2');
    expect(d2).toMatchObject({ currentCount: 1, previousCount: 2, delta: -1 });
  });

  it('排序：先看本期条数多的，再看变化幅度大的', () => {
    const changes = compareDefinitions(
      [
        makeRecord({ definitionId: 'd1', name: 'd1', at: [2026, 10, 17] }),
        makeRecord({ definitionId: 'd1', name: 'd1', at: [2026, 10, 18] }),
        makeRecord({ definitionId: 'd2', name: 'd2', at: [2026, 10, 19] }),
        makeRecord({ definitionId: 'd2', name: 'd2', at: [2026, 10, 14] }),
        makeRecord({ definitionId: 'd2', name: 'd2', at: [2026, 10, 15] }),
        makeRecord({ definitionId: 'd3', name: 'd3', at: [2026, 10, 19] }),
        makeRecord({ definitionId: 'd3', name: 'd3', at: [2026, 10, 16] }),
      ],
      windows,
    );

    // d1：本期 2 / 对照 0（+2）→ d2：本期 1 / 对照 2（-1，幅度 1）→ d3：本期 1 / 对照 1（0）
    expect(changes.map((change) => change.definitionId)).toEqual(['d1', 'd2', 'd3']);
  });

  it('两个窗口都没出现过的定义不进入结果', () => {
    const changes = compareDefinitions([makeRecord({ at: [2026, 9, 1] })], windows);
    expect(changes).toEqual([]);
  });

  it('排除软删除的记录', () => {
    const changes = compareDefinitions(
      [
        makeRecord({ definitionId: 'd1', at: [2026, 10, 19] }),
        makeRecord({
          definitionId: 'd2',
          at: [2026, 10, 19],
          deletedAt: '2026-10-19T10:00:00.000Z',
        }),
      ],
      windows,
    );

    expect(changes.map((change) => change.definitionId)).toEqual(['d1']);
  });
});
