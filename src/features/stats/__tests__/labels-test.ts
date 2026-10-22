import type { ComparisonSummary, DefinitionChange } from '@/features/stats/aggregate';
import {
  comparisonBasisLabel,
  describeComparison,
  describeDefinitionChange,
  formatDelta,
  formatRate,
} from '@/features/stats/labels';

function makeSummary(
  currentCount: number,
  previousCount: number,
  rate: number | undefined,
): ComparisonSummary {
  return {
    current: {
      window: { startDate: '2026-10-17', endDate: '2026-10-19' },
      recordCount: currentCount,
      definitionCount: currentCount > 0 ? 1 : 0,
    },
    previous: {
      window: { startDate: '2026-10-14', endDate: '2026-10-16' },
      recordCount: previousCount,
      definitionCount: previousCount > 0 ? 1 : 0,
    },
    recordCountDelta: currentCount - previousCount,
    recordCountRate: rate,
    definitionDelta: 0,
  };
}

function makeChange(currentCount: number, previousCount: number): DefinitionChange {
  return {
    definitionId: 'd1',
    name: '喝水',
    kind: 'counter',
    currentCount,
    previousCount,
    delta: currentCount - previousCount,
  };
}

describe('formatDelta / formatRate', () => {
  it('正数带 +，负数带 -，零就是 0', () => {
    expect(formatDelta(3)).toBe('+3');
    expect(formatDelta(-3)).toBe('-3');
    expect(formatDelta(0)).toBe('0');
  });

  it('变化率换算成百分比并四舍五入', () => {
    expect(formatRate(0.3333)).toBe('+33%');
    expect(formatRate(-0.08)).toBe('-8%');
    expect(formatRate(0)).toBe('0%');
  });

  it('变化率缺失时返回 undefined，不编造一个数', () => {
    expect(formatRate(undefined)).toBeUndefined();
  });
});

describe('comparisonBasisLabel', () => {
  it('两种对照各有说法', () => {
    expect(comparisonBasisLabel('previous')).toBe('前一段');
    expect(comparisonBasisLabel('lastYear')).toBe('上年同期');
  });
});

describe('describeComparison', () => {
  it('对照期有记录时给出差值与百分比', () => {
    expect(describeComparison(makeSummary(12, 9, 1 / 3), 'previous')).toBe(
      '本期 12 条，较前一段 +3 条（+33%）',
    );
  });

  it('同比用「上年同期」的说法，差值可为负', () => {
    expect(describeComparison(makeSummary(11, 12, -1 / 12), 'lastYear')).toBe(
      '本期 11 条，较上年同期 -1 条（-8%）',
    );
  });

  it('对照期没有记录时只说本期条数，不编造变化率', () => {
    expect(describeComparison(makeSummary(5, 0, undefined), 'previous')).toBe(
      '本期 5 条，前一段没有记录，无法算变化率',
    );
  });

  it('两边都没有记录时明说', () => {
    expect(describeComparison(makeSummary(0, 0, undefined), 'lastYear')).toBe('本期与上年同期都没有记录');
  });
});

describe('describeDefinitionChange', () => {
  it('本期新增时直接说「本期新增」', () => {
    expect(describeDefinitionChange(makeChange(3, 0), 'previous')).toBe('本期新增 3 条');
  });

  it('本期没有但对照期有时说明对照期的量', () => {
    expect(describeDefinitionChange(makeChange(0, 2), 'previous')).toBe('本期没有（前一段 2 条）');
  });

  it('差值非零时给出「较…+N」', () => {
    expect(describeDefinitionChange(makeChange(5, 2), 'previous')).toBe('本期 5 条，较前一段 +3');
    expect(describeDefinitionChange(makeChange(1, 3), 'lastYear')).toBe('本期 1 条，较上年同期 -2');
  });

  it('持平时明说持平', () => {
    expect(describeDefinitionChange(makeChange(2, 2), 'previous')).toBe('与前一段持平（2 条）');
  });

  it('两个窗口都没有它时返回 undefined（调用方不显示这一段）', () => {
    expect(describeDefinitionChange(makeChange(0, 0), 'previous')).toBeUndefined();
  });
});
