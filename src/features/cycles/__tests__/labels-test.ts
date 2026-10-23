import { describeLatestCycle, describeOverlap, describePrediction } from '@/features/cycles/labels';
import type { CycleDefinition, CycleInstance } from '@/domain/models';

function makeDefinition(overrides: Partial<CycleDefinition> = {}): CycleDefinition {
  return {
    id: 'd1',
    name: '生理期',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
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
