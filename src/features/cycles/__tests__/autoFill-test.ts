import type { CycleInstance } from '@/domain/models';
import {
  AUTO_FILL_LIMIT,
  autoFillHorizonKey,
  parseAutoFillHorizon,
  planAutoCycleFill,
  type AutoFillDefinitionView,
} from '@/features/cycles/autoFill';

function makeInstance(overrides: Partial<CycleInstance> = {}): CycleInstance {
  return {
    id: 'i1',
    definitionId: 'd1',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDefinition(overrides: Partial<AutoFillDefinitionView> = {}): AutoFillDefinitionView {
  return {
    cycleMode: 'auto',
    averageCycleLengthDays: 28,
    averagePeriodLengthDays: 5,
    isArchived: false,
    ...overrides,
  };
}

describe('planAutoCycleFill', () => {
  it('手动型不参与自动补齐', () => {
    expect(
      planAutoCycleFill(makeDefinition({ cycleMode: 'manual' }), [makeInstance()], '2026-12-01'),
    ).toEqual({
      segments: [],
      reason: 'not-auto',
    });
  });

  it('已归档的定义不补', () => {
    expect(planAutoCycleFill(makeDefinition({ isArchived: true }), [makeInstance()], '2026-12-01')).toEqual({
      segments: [],
      reason: 'archived',
    });
  });

  it('没有第一段时不自动开始——第一段仍由用户点「生成这一段」', () => {
    expect(planAutoCycleFill(makeDefinition(), [], '2026-12-01')).toEqual({
      segments: [],
      reason: 'no-instances',
    });
  });

  it('最后一段是进行中时停手：不替用户决定它哪天结束', () => {
    const instances = [makeInstance({ endDate: undefined })];
    expect(planAutoCycleFill(makeDefinition(), instances, '2026-12-01')).toEqual({
      segments: [],
      reason: 'ongoing',
    });
  });

  it('没有周期长度就不猜', () => {
    expect(
      planAutoCycleFill(
        makeDefinition({ averageCycleLengthDays: undefined }),
        [makeInstance()],
        '2026-12-01',
      ),
    ).toEqual({ segments: [], reason: 'no-interval' });
  });

  it('下一段还在未来时什么都不做', () => {
    expect(planAutoCycleFill(makeDefinition(), [makeInstance()], '2026-09-20')).toEqual({
      segments: [],
      reason: 'future',
    });
  });

  it('一次补齐到今天为止的每一段（配置了持续天数）', () => {
    const plan = planAutoCycleFill(makeDefinition(), [makeInstance()], '2026-11-30');

    expect(plan.segments).toEqual([
      { startDate: '2026-09-29', endDate: '2026-10-03' },
      { startDate: '2026-10-27', endDate: '2026-10-31' },
      { startDate: '2026-11-24', endDate: '2026-11-28' },
    ]);
    // 最后一段结束在 11-28（还没盖住今天），下一段 12-22 在未来 → 停在 future
    expect(plan.reason).toBe('future');
  });

  it('最后一段盖住今天就停（即使结束日还在未来）', () => {
    const plan = planAutoCycleFill(makeDefinition(), [makeInstance()], '2026-10-01');

    expect(plan.segments).toEqual([{ startDate: '2026-09-29', endDate: '2026-10-03' }]);
    expect(plan.reason).toBe('filled');
  });

  it('没配持续天数时只生成一段进行中的，之后必须由用户结束', () => {
    const plan = planAutoCycleFill(
      makeDefinition({ averagePeriodLengthDays: undefined }),
      [makeInstance()],
      '2026-12-01',
    );

    expect(plan.segments).toEqual([{ startDate: '2026-09-29', endDate: undefined }]);
    expect(plan.reason).toBe('filled');
  });

  it('水位挡住「已经补过的那一段」：删掉它之后不会被自动补回来', () => {
    const plan = planAutoCycleFill(makeDefinition(), [makeInstance()], '2026-12-01', '2026-09-29');

    expect(plan.segments).toEqual([]);
    expect(plan.reason).toBe('horizon');
  });

  it('水位落在候选之前时照常往下补', () => {
    const plan = planAutoCycleFill(makeDefinition(), [makeInstance()], '2026-10-01', '2026-09-01');

    expect(plan.segments).toEqual([{ startDate: '2026-09-29', endDate: '2026-10-03' }]);
  });

  it('一次最多补 limit 段，剩下的留给下次启动', () => {
    const plan = planAutoCycleFill(
      makeDefinition({ averageCycleLengthDays: 1, averagePeriodLengthDays: 1 }),
      [makeInstance({ startDate: '2026-09-01', endDate: '2026-09-01' })],
      '2026-09-10',
      undefined,
      3,
    );

    expect(plan.segments.map((segment) => segment.startDate)).toEqual([
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
    expect(plan.reason).toBe('limit');
  });

  it('周期长度比持续天还短（区间必然重叠）时停下，不硬塞', () => {
    const instances = [makeInstance({ startDate: '2026-09-01', endDate: '2026-09-10' })];
    const plan = planAutoCycleFill(
      makeDefinition({ averageCycleLengthDays: 5, averagePeriodLengthDays: 10 }),
      instances,
      '2026-12-01',
    );

    expect(plan.segments).toEqual([]);
    expect(plan.reason).toBe('overlap');
  });

  it('中间被手动插了一段时只接到最后一段之后，不去填中间的洞', () => {
    const instances = [
      makeInstance({ id: 'a', startDate: '2026-09-01', endDate: '2026-09-05' }),
      // 用户手动插的，和自动规律对不上
      makeInstance({ id: 'b', startDate: '2026-10-02', endDate: '2026-10-06' }),
    ];
    const plan = planAutoCycleFill(makeDefinition(), instances, '2026-11-30');

    expect(plan.segments).toEqual([
      { startDate: '2026-10-30', endDate: '2026-11-03' },
      { startDate: '2026-11-27', endDate: '2026-12-01' },
    ]);
  });

  it('默认上限是个正数，避免周期长度很小时无限生成', () => {
    expect(AUTO_FILL_LIMIT).toBeGreaterThan(0);
  });
});

describe('autoFillHorizonKey / parseAutoFillHorizon', () => {
  it('水位按定义分开存', () => {
    expect(autoFillHorizonKey('abc')).toBe('app.cycle_auto_filled.abc');
  });

  it('读不懂的值当作没补过，而不是把自动循环卡死', () => {
    expect(parseAutoFillHorizon(null)).toBeUndefined();
    expect(parseAutoFillHorizon(undefined)).toBeUndefined();
    expect(parseAutoFillHorizon('')).toBeUndefined();
    expect(parseAutoFillHorizon('最近一段')).toBeUndefined();
    expect(parseAutoFillHorizon('2026-02-31')).toBeUndefined();
  });

  it('合法的 ISO 日期原样读回', () => {
    expect(parseAutoFillHorizon('2026-09-29')).toBe('2026-09-29');
  });
});
