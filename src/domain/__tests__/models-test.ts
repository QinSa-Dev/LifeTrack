import {
  isEventDefinitionKind,
  isRecordSource,
  isRecordable,
  isVisibleRecord,
  toDefinitionSnapshot,
  type EventDefinition,
  type EventRecord,
} from '@/domain/models';

const NOW = '2026-10-19T08:00:00.000Z';

function makeDefinition(overrides: Partial<EventDefinition> = {}): EventDefinition {
  return {
    id: 'd1',
    name: '喝水',
    kind: 'counter',
    unit: '杯',
    quickOptions: [],
    tagIds: [],
    isArchived: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'r1',
    definitionId: 'd1',
    kind: 'counter',
    value: 1,
    occurredAt: NOW,
    recordedAt: NOW,
    source: 'manual',
    tagIds: [],
    snapshot: { definitionId: 'd1', name: '喝水', kind: 'counter', tagIds: [] },
    ...overrides,
  };
}

describe('类型守卫', () => {
  it('isEventDefinitionKind 只认 counter / quantity', () => {
    expect(isEventDefinitionKind('counter')).toBe(true);
    expect(isEventDefinitionKind('quantity')).toBe(true);
    expect(isEventDefinitionKind('count')).toBe(false);
    expect(isEventDefinitionKind(undefined)).toBe(false);
  });

  it('isRecordSource 只认 manual / quick / backfill', () => {
    expect(isRecordSource('manual')).toBe(true);
    expect(isRecordSource('backfill')).toBe(true);
    expect(isRecordSource('auto')).toBe(false);
  });
});

describe('isVisibleRecord', () => {
  it('没有 deletedAt 时可见（判定的是 === undefined）', () => {
    expect(isVisibleRecord(makeRecord())).toBe(true);
  });

  it('设置了 deletedAt 时不可见', () => {
    expect(isVisibleRecord(makeRecord({ deletedAt: NOW }))).toBe(false);
  });
});

describe('isRecordable', () => {
  it('未归档可记录', () => {
    expect(isRecordable(makeDefinition())).toBe(true);
  });

  it('已归档不可记录（历史不受影响）', () => {
    expect(isRecordable(makeDefinition({ isArchived: true }))).toBe(false);
  });
});

describe('toDefinitionSnapshot', () => {
  it('固化名称 / 类型 / 单位 / 分组 / 标签', () => {
    const definition = makeDefinition({
      name: '饮水',
      kind: 'quantity',
      unit: '升',
      groupId: 'g1',
      tagIds: ['t1', 't2'],
    });

    expect(toDefinitionSnapshot(definition)).toEqual({
      definitionId: 'd1',
      name: '饮水',
      kind: 'quantity',
      unit: '升',
      groupId: 'g1',
      tagIds: ['t1', 't2'],
    });
  });

  it('标签数组是复制：之后改动定义不会污染已生成的快照', () => {
    const definition = makeDefinition({ tagIds: ['t1'] });
    const snapshot = toDefinitionSnapshot(definition);

    definition.tagIds.push('t2');

    expect(snapshot.tagIds).toEqual(['t1']);
  });
});
