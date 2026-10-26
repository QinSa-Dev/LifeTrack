import type { EventRecord } from '@/domain/models';

import { groupRecordsByDefinition } from '@/features/records/groupRecords';
import { sortTimelineGroups, sortTimelineRecords } from '@/features/records/timelineSort';

function makeRecord(
  id: string,
  definitionId: string,
  name: string,
  occurredAt: string,
  recordedAt: string = occurredAt,
): EventRecord {
  return {
    id,
    definitionId,
    kind: 'counter',
    value: 1,
    attributes: [],
    occurredAt,
    recordedAt,
    source: 'manual',
    fieldValues: [],
    snapshot: { definitionId, name, kind: 'counter', attributes: [], fields: [] },
  };
}

/**
 * 发生时间倒序（和仓储 `list()` 返回的顺序一样）。
 * 录入时间刻意与发生时间错开两处，才能验出「按最近修改」与「按时间」不是同一件事：
 * `a2` 是补录的旧事（发生 21 号、22 号才记），`c1` 也是补录的。
 */
const records: EventRecord[] = [
  makeRecord('a3', 'd-water', 'A 喝水', '2026-10-22T07:00:00.000Z'),
  makeRecord('b1', 'd-walk', 'B 散步', '2026-10-22T06:00:00.000Z'),
  makeRecord('c2', 'd-sleep', 'C 睡眠', '2026-10-22T05:00:00.000Z'),
  makeRecord('a2', 'd-water', 'A 喝水', '2026-10-21T07:00:00.000Z', '2026-10-22T09:00:00.000Z'),
  makeRecord('a1', 'd-water', 'A 喝水', '2026-10-20T07:00:00.000Z'),
  makeRecord('c1', 'd-sleep', 'C 睡眠', '2026-10-19T05:00:00.000Z', '2026-10-22T08:30:00.000Z'),
];

const groupIds = (groups: readonly { definitionId: string }[]) => groups.map((group) => group.definitionId);
const recordIds = (items: readonly EventRecord[]) => items.map((record) => record.id);

describe('sortTimelineGroups', () => {
  it('按时间（默认）：原样返回，仍是「最近发生的事件在前」', () => {
    const groups = groupRecordsByDefinition(records);

    const sorted = sortTimelineGroups(groups, 'time');

    expect(groupIds(sorted)).toEqual(['d-water', 'd-walk', 'd-sleep']);
    expect(sorted).not.toBe(groups); // 返回新数组，不动调用方的
  });

  it('按名称：按**行上显示的名字**升序', () => {
    const groups = groupRecordsByDefinition(records);

    expect(groupIds(sortTimelineGroups(groups, 'name'))).toEqual(['d-water', 'd-walk', 'd-sleep']);
  });

  it('按名称排的是最近一条记录的名字，不是更早那条快照里的旧名字', () => {
    // d-x 改名过：新的那条记录写着「Z 新名字」，旧的那条还写着「A 旧名字」
    const renamed = [
      makeRecord('new', 'd-x', 'Z 新名字', '2026-10-22T07:00:00.000Z'),
      makeRecord('other', 'd-y', 'B 别的', '2026-10-21T07:00:00.000Z'),
      makeRecord('old', 'd-x', 'A 旧名字', '2026-10-20T07:00:00.000Z'),
    ];

    const sorted = sortTimelineGroups(groupRecordsByDefinition(renamed), 'name');

    // 若拿旧名字排，d-x（A 旧名字）会跑到 d-y（B 别的）前面
    expect(groupIds(sorted)).toEqual(['d-y', 'd-x']);
  });

  it('按次数：次数多的在前，次数就是这次载入的条数', () => {
    const groups = groupRecordsByDefinition(records);

    expect(groupIds(sortTimelineGroups(groups, 'count'))).toEqual(['d-water', 'd-sleep', 'd-walk']);
  });

  it('按最近修改：按组里最晚的**录入**时间倒序（补录的旧事也能排到前面）', () => {
    const groups = groupRecordsByDefinition(records);

    // 发生时间最晚的其实是「散步」（22 号 06:00），但「睡眠」22 号 08:30 才补录过一次
    expect(groupIds(sortTimelineGroups(groups, 'recorded'))).toEqual(['d-water', 'd-sleep', 'd-walk']);
  });

  it('键值全相同时也有确定的名次：最近发生时间倒序、定义 id 升序兜底', () => {
    const sameOccurred = [
      makeRecord('r-b', 'd-b', 'A 同名', '2026-10-22T07:00:00.000Z'),
      makeRecord('r-a', 'd-a', 'A 同名', '2026-10-22T07:00:00.000Z'),
    ];

    const sorted = sortTimelineGroups(groupRecordsByDefinition(sameOccurred), 'name');

    expect(groupIds(sorted)).toEqual(['d-a', 'd-b']);
  });

  it('空列表得到空结果，不报错', () => {
    expect(sortTimelineGroups([], 'count')).toEqual([]);
  });
});

describe('sortTimelineRecords', () => {
  it('按时间（默认）：原样返回，仍是发生时间倒序', () => {
    const sorted = sortTimelineRecords(records, 'time');

    expect(recordIds(sorted)).toEqual(['a3', 'b1', 'c2', 'a2', 'a1', 'c1']);
    expect(sorted).not.toBe(records);
  });

  it('按次数：同一个事件的记录连在一起，组内仍是发生时间倒序', () => {
    const sorted = sortTimelineRecords(records, 'count');

    expect(recordIds(sorted)).toEqual(['a3', 'a2', 'a1', 'c2', 'c1', 'b1']);
  });

  it('按名称：事件之间按名字升序，事件内部不受影响', () => {
    const sorted = sortTimelineRecords(records, 'name');

    expect(recordIds(sorted)).toEqual(['a3', 'a2', 'a1', 'b1', 'c2', 'c1']);
  });

  it('按最近修改：整组一起移动，组内仍是发生时间倒序', () => {
    const sorted = sortTimelineRecords(records, 'recorded');

    expect(recordIds(sorted)).toEqual(['a3', 'a2', 'a1', 'c2', 'c1', 'b1']);
  });

  it('原数组不被改动', () => {
    const before = recordIds(records);

    sortTimelineRecords(records, 'count');

    expect(recordIds(records)).toEqual(before);
  });
});
