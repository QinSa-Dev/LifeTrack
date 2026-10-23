import type { EventRecord } from '@/domain/models';

import { groupRecordsByDefinition } from '@/features/records/groupRecords';

const NOW = '2026-10-22T08:00:00.000Z';

function makeRecord(
  id: string,
  definitionId: string,
  occurredAt: string,
  overrides: Partial<EventRecord> = {},
): EventRecord {
  return {
    id,
    definitionId,
    kind: 'counter',
    value: 1,
    attributes: [],
    occurredAt,
    recordedAt: occurredAt,
    source: 'manual',
    tagIds: [],
    snapshot: { definitionId, name: `事件 ${definitionId}`, kind: 'counter', attributes: [], tagIds: [] },
    ...overrides,
  };
}

describe('groupRecordsByDefinition', () => {
  it('把同一个定义的记录并成一组，组内顺序原样保留', () => {
    const records = [
      makeRecord('r3', 'd1', '2026-10-22T07:00:00.000Z'),
      makeRecord('r2', 'd2', '2026-10-22T06:00:00.000Z'),
      makeRecord('r1', 'd1', '2026-10-22T05:00:00.000Z'),
    ];

    const groups = groupRecordsByDefinition(records);

    expect(groups.map((group) => group.definitionId)).toEqual(['d1', 'd2']);
    expect(groups[0]?.records.map((record) => record.id)).toEqual(['r3', 'r1']);
    expect(groups[1]?.records.map((record) => record.id)).toEqual(['r2']);
  });

  it('latest 是组内第一条，也就是最近一次记录', () => {
    const records = [
      makeRecord('r2', 'd1', '2026-10-22T07:00:00.000Z', { value: 500, kind: 'quantity' }),
      makeRecord('r1', 'd1', '2026-10-22T05:00:00.000Z', { value: 100, kind: 'quantity' }),
    ];

    const [group] = groupRecordsByDefinition(records);

    expect(group?.latest.id).toBe('r2');
    expect(group?.latest.value).toBe(500);
  });

  it('组之间按各自最近一次记录出现的先后排序（沿用传入的倒序）', () => {
    const records = [
      makeRecord('a2', 'd2', '2026-10-22T09:00:00.000Z'),
      makeRecord('a1', 'd1', '2026-10-22T08:00:00.000Z'),
      makeRecord('b1', 'd2', '2026-10-21T09:00:00.000Z'),
      makeRecord('b2', 'd1', '2026-10-20T09:00:00.000Z'),
    ];

    const groups = groupRecordsByDefinition(records);

    expect(groups.map((group) => group.definitionId)).toEqual(['d2', 'd1']);
    expect(groups.map((group) => group.records.length)).toEqual([2, 2]);
  });

  it('软删除过的记录也照常分组：分组只看定义 id，不看状态', () => {
    const records = [
      makeRecord('r2', 'd1', '2026-10-22T07:00:00.000Z', { deletedAt: NOW }),
      makeRecord('r1', 'd1', '2026-10-22T05:00:00.000Z'),
    ];

    const [group] = groupRecordsByDefinition(records);

    expect(group?.records).toHaveLength(2);
    expect(group?.latest.id).toBe('r2');
  });

  it('定义已被删除的历史仍按定义 id 聚在一起，不散成一行一条', () => {
    const gone = { name: '已删掉的事件' };
    const records = [
      makeRecord('r2', 'd-gone', '2026-10-22T07:00:00.000Z', {
        snapshot: { definitionId: 'd-gone', name: gone.name, kind: 'counter', attributes: [], tagIds: [] },
      }),
      makeRecord('r1', 'd-gone', '2026-10-22T05:00:00.000Z', {
        snapshot: { definitionId: 'd-gone', name: gone.name, kind: 'counter', attributes: [], tagIds: [] },
      }),
    ];

    const groups = groupRecordsByDefinition(records);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.definitionId).toBe('d-gone');
    expect(groups[0]?.records).toHaveLength(2);
  });

  it('空列表得到空结果，不报错', () => {
    expect(groupRecordsByDefinition([])).toEqual([]);
  });
});
