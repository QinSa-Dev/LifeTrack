import { ValidationError } from '@/domain/errors';
import type { EventDefinitionKind, EventRecord } from '@/domain/models';
import {
  aggregateByDay,
  aggregateByDefinition,
  aggregateByWeek,
  summarize,
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
