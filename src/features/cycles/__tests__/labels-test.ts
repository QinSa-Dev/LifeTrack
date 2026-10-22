import { describeLatestCycle, describePrediction } from '@/features/cycles/labels';
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
});
