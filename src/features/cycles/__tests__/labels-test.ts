import {
  describeAutoSegment,
  describeCycleDefinition,
  describeLatestCycle,
  describeOverlap,
  describePrediction,
} from '@/features/cycles/labels';
import type { CycleInstance, EventDefinition } from '@/domain/models';

/** describeLatestCycle 只用得到「平均周期长度」这一项配置。 */
type CycleDefinitionView = Pick<
  EventDefinition,
  'averageCycleLengthDays' | 'averagePeriodLengthDays' | 'cycleMode'
>;

function makeDefinition(overrides: Partial<CycleDefinitionView> = {}): CycleDefinitionView {
  return { ...overrides };
}

function makeInstance(overrides: Partial<CycleInstance> = {}): CycleInstance {
  return {
    id: 'i1',
    definitionId: 'd1',
    startDate: '2026-10-01',
    endDate: '2026-10-05',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('describePrediction', () => {
  it('没有依据时明说不预测，而不是给一个数', () => {
    expect(describePrediction(undefined)).toContain('暂不做预测');
  });

  it('按观察到的间隔预测时说清「最近几段间隔的平均」', () => {
    const text = describePrediction({
      nextStart: '2026-10-29',
      lengthDays: 28,
      basis: 'observed',
      observedGaps: 2,
    });
    expect(text).toBe('预测下次开始日：2026-10-29（按最近 2 段间隔的平均 28 天）');
  });

  it('按配置值预测时标明依据是配置，不说成「算出来的」', () => {
    const text = describePrediction({
      nextStart: '2026-10-29',
      lengthDays: 30,
      basis: 'configured',
      observedGaps: 0,
    });
    expect(text).toBe('预测下次开始日：2026-10-29（按定义里配置的平均周期长度 30 天）');
  });
});

describe('describeLatestCycle', () => {
  it('没有实例时给出明确说明', () => {
    expect(describeLatestCycle(makeDefinition(), [])).toBe('还没有周期记录');
  });

  it('有历史间隔时，列表副标题里的预测用的是实际间隔', () => {
    const instances = [
      makeInstance({ id: 'a', startDate: '2026-09-03', endDate: '2026-09-07' }),
      makeInstance({ id: 'b', startDate: '2026-10-01', endDate: undefined }),
    ];
    // 间隔 28 天 → 下次 2026-10-29（定义里没配平均长度，也能预测）
    expect(describeLatestCycle(makeDefinition(), instances)).toBe(
      '最近 2026-10-01 ~ 进行中 · 预测下次 2026-10-29',
    );
  });

  it('只有一段且没配平均长度时，不硬塞一个预测', () => {
    expect(describeLatestCycle(makeDefinition(), [makeInstance()])).toBe('最近 2026-10-01 ~ 2026-10-05');
  });

  it('可以指定预测窗口：窗口越小，越只看最近一段间隔', () => {
    // 相邻开始日之差：30 / 26 / 24 天
    const instances = [
      makeInstance({ id: 'a', startDate: '2026-08-01' }),
      makeInstance({ id: 'b', startDate: '2026-08-31' }),
      makeInstance({ id: 'c', startDate: '2026-09-26' }),
      makeInstance({ id: 'd', startDate: '2026-10-20', endDate: undefined }),
    ];
    // 默认窗口 3：三段平均 26.67 → 27 天
    expect(describeLatestCycle(makeDefinition(), instances)).toBe(
      '最近 2026-10-20 ~ 进行中 · 预测下次 2026-11-16',
    );
    // 窗口 1：只取最后一个间隔 24 天
    expect(describeLatestCycle(makeDefinition(), instances, 1)).toBe(
      '最近 2026-10-20 ~ 进行中 · 预测下次 2026-11-13',
    );
  });
});

describe('describeOverlap', () => {
  it('说清和哪一段重叠，并明说保存会被拒绝', () => {
    const text = describeOverlap(makeInstance({ startDate: '2026-09-01', endDate: '2026-09-05' }));
    expect(text).toBe('这个区间会和已有的一段周期重叠（2026-09-01 ~ 2026-09-05），保存会被拒绝。');
  });

  it('进行中的那一段说成「进行中」', () => {
    expect(describeOverlap(makeInstance({ startDate: '2026-09-01', endDate: undefined }))).toContain(
      '2026-09-01 ~ 进行中',
    );
  });
});

describe('describeCycleDefinition', () => {
  it('手动标记：说清做法与平均长度', () => {
    expect(
      describeCycleDefinition({
        cycleMode: 'manual',
        averageCycleLengthDays: 28,
        averagePeriodLengthDays: 5,
      }),
    ).toBe('手动标记 · 平均周期 28 天 · 平均持续 5 天');
  });

  it('自动循环：说成「每 N 天一次」', () => {
    expect(describeCycleDefinition({ cycleMode: 'auto', averageCycleLengthDays: 30 })).toBe(
      '自动循环 · 每 30 天一次',
    );
  });

  it('自动循环但没设周期长度时明说「还不能生成」', () => {
    expect(describeCycleDefinition({ cycleMode: 'auto' })).toContain('还不能按规律生成');
  });
});

describe('describeAutoSegment', () => {
  it('还没有可用的规律时不硬给一段', () => {
    expect(describeAutoSegment(undefined)).toContain('先在上面的「周期长度」里填上');
  });

  it('说清下一段的日期区间与推算依据', () => {
    expect(describeAutoSegment({ startDate: '2026-10-19', endDate: '2026-10-23', basis: 'scheduled' })).toBe(
      '下一段：2026-10-19 ~ 2026-10-23（按上一段的开始日 + 周期长度推出）',
    );
  });

  it('还没有任何周期时说明「从今天开始」', () => {
    expect(describeAutoSegment({ startDate: '2026-10-19', basis: 'first' })).toBe(
      '下一段：2026-10-19（进行中）（还没有任何周期，这一段从今天开始）',
    );
  });
});
