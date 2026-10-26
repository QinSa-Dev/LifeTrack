import type { EventRecord } from '@/domain/models';

import { repeatDraft } from '@/features/records/repeat';

function makeRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'r1',
    definitionId: 'd1',
    kind: 'counter',
    value: 1,
    attributes: [],
    occurredAt: '2026-10-22T08:00:00.000Z',
    recordedAt: '2026-10-22T08:00:00.000Z',
    source: 'manual',
    fieldValues: [],
    snapshot: {
      definitionId: 'd1',
      name: '喝水',
      kind: 'counter',
      attributes: [],
      fields: [],
    },
    ...overrides,
  };
}

describe('repeatDraft', () => {
  it('有历史时照抄最近一条：取值 + 属性 + 字段取值', () => {
    const latest = makeRecord({
      value: 3,
      attributes: ['200ml'],
      fieldValues: [{ fieldId: 'f1', values: ['早上'] }],
    });

    expect(repeatDraft(latest)).toEqual({
      value: 3,
      attributes: ['200ml'],
      fieldValues: [{ fieldId: 'f1', values: ['早上'] }],
    });
  });

  it('记录自己没有属性时，属性退到快照里的那份', () => {
    const latest = makeRecord({
      attributes: [],
      snapshot: {
        definitionId: 'd1',
        name: '喝水',
        kind: 'counter',
        attributes: ['温水'],
        fields: [],
      },
    });

    expect(repeatDraft(latest).attributes).toEqual(['温水']);
  });

  it('没有历史（undefined）时退化为 +1、不带属性与字段', () => {
    expect(repeatDraft(undefined)).toEqual({ value: 1, attributes: [], fieldValues: [] });
  });
});
