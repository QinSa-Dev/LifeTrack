import type { CycleEntry } from '@/domain/models';
import { aggregateSymptoms, summarizeSymptoms } from '@/features/stats/symptoms';

const T1 = '2026-10-19T08:00:00.000Z';

function makeEntry(date: string, symptoms: string[], deletedAt?: string): CycleEntry {
  return {
    id: `entry-${date}`,
    instanceId: 'instance-1',
    date,
    symptoms,
    createdAt: T1,
    updatedAt: T1,
    deletedAt,
  };
}

describe('aggregateSymptoms', () => {
  it('按天计数，条数从多到少；条数相同按名称排', () => {
    const totals = aggregateSymptoms([
      makeEntry('2026-10-01', ['头痛', '乏力']),
      makeEntry('2026-10-02', ['头痛']),
      makeEntry('2026-10-03', ['恶心', '头痛']),
    ]);

    expect(totals.map((total) => [total.symptom, total.dayCount])).toEqual([
      ['头痛', 3],
      ['乏力', 1],
      ['恶心', 1],
    ]);
  });

  it('比例的分母是「记了症状的记录数」，不是全部记录数', () => {
    const totals = aggregateSymptoms([
      makeEntry('2026-10-01', ['头痛']),
      makeEntry('2026-10-02', ['头痛', '乏力']),
      makeEntry('2026-10-03', []), // 没记症状，不进分母
    ]);

    expect(totals[0]).toEqual({ symptom: '头痛', dayCount: 2, ratio: 1 });
    expect(totals[1]).toEqual({ symptom: '乏力', dayCount: 1, ratio: 0.5 });
  });

  it('同一天里重复写同一个症状只算一次（去空、去首尾空白）', () => {
    const totals = aggregateSymptoms([makeEntry('2026-10-01', [' 头痛 ', '头痛', '  ', '', '乏力'])]);

    expect(totals.map((total) => [total.symptom, total.dayCount])).toEqual([
      ['乏力', 1],
      ['头痛', 1],
    ]);
  });

  it('不做同义归一：「头痛」与「头疼」分开统计', () => {
    const totals = aggregateSymptoms([makeEntry('2026-10-01', ['头痛', '头疼'])]);

    expect(totals.map((total) => total.symptom)).toEqual(['头疼', '头痛']);
  });

  it('软删除的记录不参与统计', () => {
    const totals = aggregateSymptoms([
      makeEntry('2026-10-01', ['头痛']),
      makeEntry('2026-10-02', ['头痛'], '2026-10-19T09:00:00.000Z'),
    ]);

    expect(totals).toEqual([{ symptom: '头痛', dayCount: 1, ratio: 1 }]);
  });

  it('没有任何症状时返回空数组（不会除以 0）', () => {
    expect(aggregateSymptoms([])).toEqual([]);
    expect(aggregateSymptoms([makeEntry('2026-10-01', []), makeEntry('2026-10-02', [])])).toEqual([]);
  });
});

describe('summarizeSymptoms', () => {
  it('记录条数、记了症状的条数、症状种数', () => {
    const summary = summarizeSymptoms([
      makeEntry('2026-10-01', ['头痛', '乏力']),
      makeEntry('2026-10-02', ['头痛']),
      makeEntry('2026-10-03', []),
      makeEntry('2026-10-04', ['头痛'], '2026-10-19T09:00:00.000Z'), // 软删除
    ]);

    expect(summary).toEqual({ entryCount: 3, withSymptomsCount: 2, distinctSymptoms: 2 });
  });

  it('空输入全是 0', () => {
    expect(summarizeSymptoms([])).toEqual({ entryCount: 0, withSymptomsCount: 0, distinctSymptoms: 0 });
  });
});
