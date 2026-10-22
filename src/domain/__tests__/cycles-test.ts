import {
  findDatesOutside,
  findOverlappingInstance,
  instanceLengthDays,
  isEntryWithinRange,
  isOngoingInstance,
  latestInstance,
  observedCycleLength,
  predictNextCycle,
  rangesOverlap,
} from '@/domain/cycles';
import type { CycleDefinition, CycleInstance } from '@/domain/models';

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

describe('findDatesOutside', () => {
  it('挑出落在区间外的日期（这是「不静默删除越界记录」的依据）', () => {
    const dates = ['2026-09-30', '2026-10-01', '2026-10-05', '2026-10-06'];
    expect(findDatesOutside(dates, '2026-10-01', '2026-10-05')).toEqual(['2026-09-30', '2026-10-06']);
  });

  it('全部在区间内时返回空数组', () => {
    expect(findDatesOutside(['2026-10-02', '2026-10-03'], '2026-10-01', '2026-10-05')).toEqual([]);
  });

  it('进行中（无 endDate）时只筛下界', () => {
    expect(findDatesOutside(['2026-09-30', '2027-01-01'], '2026-10-01', undefined)).toEqual(['2026-09-30']);
  });
});

describe('isEntryWithinRange', () => {
  it('闭区间判定', () => {
    expect(isEntryWithinRange('2026-10-01', { startDate: '2026-10-01', endDate: '2026-10-05' })).toBe(true);
    expect(isEntryWithinRange('2026-10-06', { startDate: '2026-10-01', endDate: '2026-10-05' })).toBe(false);
  });

  it('进行中只约束下界', () => {
    expect(isEntryWithinRange('2030-01-01', { startDate: '2026-10-01' })).toBe(true);
  });
});

describe('rangesOverlap', () => {
  it('有交集为真（含首尾相接）', () => {
    expect(
      rangesOverlap(
        { startDate: '2026-10-01', endDate: '2026-10-05' },
        { startDate: '2026-10-05', endDate: '2026-10-09' },
      ),
    ).toBe(true);
    expect(
      rangesOverlap(
        { startDate: '2026-10-01', endDate: '2026-10-05' },
        { startDate: '2026-10-03', endDate: '2026-10-07' },
      ),
    ).toBe(true);
  });

  it('完全分离为假', () => {
    expect(
      rangesOverlap(
        { startDate: '2026-10-01', endDate: '2026-10-05' },
        { startDate: '2026-10-06', endDate: '2026-10-09' },
      ),
    ).toBe(false);
  });

  it('进行中的区间视为延伸到无穷远', () => {
    expect(
      rangesOverlap({ startDate: '2026-10-01' }, { startDate: '2030-01-01', endDate: '2030-01-05' }),
    ).toBe(true);
  });
});

describe('findOverlappingInstance', () => {
  it('找出重叠的实例，更新时排除自己', () => {
    const a = makeInstance({ id: 'a', startDate: '2026-09-01', endDate: '2026-09-05' });
    const b = makeInstance({ id: 'b', startDate: '2026-10-01', endDate: '2026-10-05' });

    expect(findOverlappingInstance([a, b], { startDate: '2026-10-03', endDate: '2026-10-08' })?.id).toBe('b');
    expect(
      findOverlappingInstance([a, b], { startDate: '2026-10-03', endDate: '2026-10-08' }, 'b'),
    ).toBeUndefined();
    expect(
      findOverlappingInstance([a, b], { startDate: '2026-11-01', endDate: '2026-11-05' }),
    ).toBeUndefined();
  });
});

describe('isOngoingInstance / instanceLengthDays', () => {
  it('无结束日即进行中', () => {
    expect(isOngoingInstance(makeInstance({ endDate: undefined }))).toBe(true);
    expect(isOngoingInstance(makeInstance())).toBe(false);
  });

  it('含首尾计算天数', () => {
    expect(instanceLengthDays(makeInstance())).toBe(5); // 10-01 ~ 10-05
  });

  it('单日实例是 1 天', () => {
    expect(instanceLengthDays(makeInstance({ startDate: '2026-10-01', endDate: '2026-10-01' }))).toBe(1);
  });

  it('进行中需要显式传入「截至哪一天」', () => {
    const ongoing = makeInstance({ startDate: '2026-10-01', endDate: undefined });
    expect(instanceLengthDays(ongoing)).toBeUndefined();
    expect(instanceLengthDays(ongoing, '2026-10-05')).toBe(5);
  });
});

describe('observedCycleLength', () => {
  const at = (startDate: string) => makeInstance({ id: startDate, startDate, endDate: undefined });

  it('一个实例（没有完整间隔）不猜', () => {
    expect(observedCycleLength([at('2026-10-01')])).toBeUndefined();
  });

  it('两个实例：间隔就是两段开始日之差', () => {
    expect(observedCycleLength([at('2026-09-03'), at('2026-10-01')])).toEqual({
      averageDays: 28,
      gaps: 1,
    });
  });

  it('取最近 window 个间隔的平均（远的旧数据不参与）', () => {
    const instances = [at('2026-06-01'), at('2026-06-21'), at('2026-07-20'), at('2026-08-17')];
    // 间隔依次是 20 / 29 / 28 天；window = 2 时只看 29 与 28 → 28.5 → 四舍五入 29
    expect(observedCycleLength(instances, 2)).toEqual({ averageDays: 29, gaps: 2 });
    // 全部参与时 20 + 29 + 28 → 25.67 → 26
    expect(observedCycleLength(instances)).toEqual({ averageDays: 26, gaps: 3 });
  });

  it('实例顺序不影响结果（内部按开始日排序）', () => {
    const instances = [at('2026-08-17'), at('2026-06-01'), at('2026-07-20'), at('2026-06-21')];
    expect(observedCycleLength(instances)).toEqual({ averageDays: 26, gaps: 3 });
  });

  it('同一个开始日只算一次（防御性处理，避免 0 天间隔拉低平均）', () => {
    expect(observedCycleLength([at('2026-09-03'), at('2026-09-03'), at('2026-10-01')])).toEqual({
      averageDays: 28,
      gaps: 1,
    });
  });

  it('window 不是正整数时不猜', () => {
    const instances = [at('2026-09-03'), at('2026-10-01')];
    expect(observedCycleLength(instances, 0)).toBeUndefined();
    expect(observedCycleLength(instances, 1.5)).toBeUndefined();
  });
});

describe('predictNextCycle', () => {
  const at = (startDate: string) => makeInstance({ id: startDate, startDate, endDate: undefined });

  it('有历史时按实际观察到的间隔预测，并说明依据', () => {
    const prediction = predictNextCycle([at('2026-09-03'), at('2026-10-01')], makeDefinition());
    expect(prediction).toEqual({
      nextStart: '2026-10-29',
      lengthDays: 28,
      basis: 'observed',
      observedGaps: 1,
    });
  });

  it('观察到的间隔优先于定义里配置的平均长度', () => {
    const prediction = predictNextCycle(
      [at('2026-09-03'), at('2026-10-01')],
      makeDefinition({ averageCycleLengthDays: 40 }),
    );
    expect(prediction?.lengthDays).toBe(28);
    expect(prediction?.basis).toBe('observed');
  });

  it('没有历史间隔时退回配置的平均长度，并标明依据是配置', () => {
    const prediction = predictNextCycle([at('2026-10-01')], makeDefinition({ averageCycleLengthDays: 28 }));
    expect(prediction).toEqual({
      nextStart: '2026-10-29',
      lengthDays: 28,
      basis: 'configured',
      observedGaps: 0,
    });
  });

  it('既没有历史间隔、也没有配置时不预测', () => {
    expect(predictNextCycle([at('2026-10-01')], makeDefinition())).toBeUndefined();
  });

  it('一个实例都没有时不预测', () => {
    expect(predictNextCycle([], makeDefinition({ averageCycleLengthDays: 28 }))).toBeUndefined();
  });
});

describe('latestInstance', () => {
  it('取开始日最大的那个', () => {
    const older = makeInstance({ id: 'older', startDate: '2026-09-01' });
    const newer = makeInstance({ id: 'newer', startDate: '2026-10-01' });
    expect(latestInstance([older, newer])?.id).toBe('newer');
  });

  it('空列表返回 undefined', () => {
    expect(latestInstance([])).toBeUndefined();
  });
});
