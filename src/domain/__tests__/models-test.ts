import {
  attributeText,
  isCycleMode,
  isEventDefinitionKind,
  isRecordKind,
  isRecordSource,
  isRecordable,
  isVisibleRecord,
  recordAttributes,
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
    attributes: ['杯'],
    quickOptions: [],
    fields: [],
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
    attributes: [],
    occurredAt: NOW,
    recordedAt: NOW,
    source: 'manual',
    fieldValues: [],
    snapshot: { definitionId: 'd1', name: '喝水', kind: 'counter', attributes: [], fields: [] },
    ...overrides,
  };
}

describe('类型守卫', () => {
  it('isEventDefinitionKind 只认 counter / cycle', () => {
    expect(isEventDefinitionKind('counter')).toBe(true);
    expect(isEventDefinitionKind('cycle')).toBe(true);
    // 「数量」不再是定义的类型（只是历史记录里还可能出现）
    expect(isEventDefinitionKind('quantity')).toBe(false);
    expect(isEventDefinitionKind(undefined)).toBe(false);
  });

  it('isRecordKind 认 counter / quantity（历史留下的记录）', () => {
    expect(isRecordKind('counter')).toBe(true);
    expect(isRecordKind('quantity')).toBe(true);
    expect(isRecordKind('cycle')).toBe(false);
  });

  it('isCycleMode 只认 auto / manual', () => {
    expect(isCycleMode('auto')).toBe(true);
    expect(isCycleMode('manual')).toBe(true);
    expect(isCycleMode('weekly')).toBe(false);
  });

  it('isRecordSource 只认 manual / quick / backfill', () => {
    expect(isRecordSource('manual')).toBe(true);
    expect(isRecordSource('backfill')).toBe(true);
    expect(isRecordSource('auto')).toBe(false);
  });
});

describe('属性展示：recordAttributes / attributeText', () => {
  it('记录标了属性就用标上的', () => {
    const record = makeRecord({
      attributes: ['温水'],
      snapshot: { definitionId: 'd1', name: '喝水', kind: 'counter', attributes: ['200ml'], fields: [] },
    });
    expect(recordAttributes(record)).toEqual(['温水']);
  });

  it('一个都没标时回落到定义当时的属性，别把「一次是什么」在历史里丢掉', () => {
    const record = makeRecord({
      attributes: [],
      snapshot: { definitionId: 'd1', name: '喝水', kind: 'counter', attributes: ['200ml'], fields: [] },
    });
    expect(recordAttributes(record)).toEqual(['200ml']);
  });

  it('多条属性用 · 连成一行；空列表给 undefined（调用方据此决定显不显示）', () => {
    expect(attributeText(['温水', '500ml'])).toBe('温水 · 500ml');
    expect(attributeText([])).toBeUndefined();
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
  it('固化名称 / 类型 / 属性列表 / 分组 / 字段定义', () => {
    const definition = makeDefinition({
      name: '饮水',
      kind: 'counter',
      attributes: ['温水', '200ml'],
      groupId: 'g1',
      fields: [{ id: 'f1', name: '时段', kind: 'single', options: ['早晨', '晚上'], sortOrder: 0 }],
    });

    expect(toDefinitionSnapshot(definition)).toEqual({
      definitionId: 'd1',
      name: '饮水',
      kind: 'counter',
      attributes: ['温水', '200ml'],
      groupId: 'g1',
      fields: [{ id: 'f1', name: '时段', kind: 'single', options: ['早晨', '晚上'] }],
    });
  });

  it('周期型不产生事件记录：传进来就是编程错误，要抛而不是编一个错类型', () => {
    expect(() => toDefinitionSnapshot(makeDefinition({ kind: 'cycle', cycleMode: 'manual' }))).toThrow(
      /周期型事件不产生事件记录/,
    );
  });

  it('字段候选值是复制：之后改动定义不会污染已生成的快照', () => {
    const definition = makeDefinition({
      fields: [{ id: 'f1', name: '时段', kind: 'single', options: ['早晨'], sortOrder: 0 }],
    });
    const snapshot = toDefinitionSnapshot(definition);

    definition.fields[0]?.options.push('晚上');

    expect(snapshot.fields[0]?.options).toEqual(['早晨']);
  });
});
