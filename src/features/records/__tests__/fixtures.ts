import type { EventDefinitionSnapshot, EventRecord } from '@/domain/models';

import type { RecordGroup } from '../groupRecords';

/** 固定时间，避免测试随运行时刻变化。 */
export const T1 = '2026-10-19T08:00:00.000Z';
export const T0 = '2026-10-18T08:00:00.000Z';

/** 一条「喝水」记录的默认形状；每个用例只覆盖自己关心的字段。 */
export function makeRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  const snapshot: EventDefinitionSnapshot = {
    definitionId: 'definition-1',
    name: '喝水',
    kind: 'counter',
    attributes: ['200ml'],
    fields: [],
  };
  return {
    id: 'record-1',
    definitionId: 'definition-1',
    kind: 'counter',
    value: 1,
    attributes: [],
    fieldValues: [],
    occurredAt: T1,
    recordedAt: T1,
    source: 'manual',
    snapshot,
    ...overrides,
  };
}

/** 「合并」视图的一行：默认两条记录，最近一条取值 3。 */
export function makeGroup(): RecordGroup {
  const latest = makeRecord({ id: 'record-2', value: 3, occurredAt: T1, recordedAt: T1 });
  const older = makeRecord({ id: 'record-1', value: 1, occurredAt: T0, recordedAt: T0 });
  return { definitionId: 'definition-1', records: [latest, older], latest };
}
