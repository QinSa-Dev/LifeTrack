import type { EventRecord } from '@/domain/models';

import { formatFullTime, formatRecordValue, formatRowValue } from '@/features/records/format';

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
    tagIds: [],
    snapshot: { definitionId: 'd1', name: '喝水', kind: 'counter', attributes: [], tagIds: [] },
    ...overrides,
  };
}

describe('formatRecordValue', () => {
  it('计数型带 +，历史数量型原样，都带上属性', () => {
    expect(formatRecordValue(makeRecord({ value: 3 }))).toBe('+3');
    expect(formatRecordValue(makeRecord({ kind: 'quantity', value: 5, attributes: ['公里'] }))).toBe(
      '5 公里',
    );
    expect(formatRecordValue(makeRecord({ kind: 'quantity', value: 0.5, attributes: ['升'] }))).toBe(
      '0.5 升',
    );
  });

  it('标了多个属性时用 · 连起来', () => {
    expect(formatRecordValue(makeRecord({ value: 2, attributes: ['温水', '500ml'] }))).toBe(
      '+2 温水 · 500ml',
    );
  });

  it('一个都没标时用记录时刻的定义属性，别丢「一次是什么」', () => {
    const record = makeRecord({
      attributes: [],
      snapshot: { definitionId: 'd1', name: '喝水', kind: 'counter', attributes: ['200ml'], tagIds: [] },
    });
    expect(formatRecordValue(record)).toBe('+1 200ml');
  });
});

describe('formatRowValue', () => {
  it('计数型增量为 1 时不显示文字：右侧已经有【+1】按钮', () => {
    expect(formatRowValue(makeRecord({ value: 1 }))).toBeNull();
  });

  it('计数型增量大于 1 时照常显示，那是这一行的信息', () => {
    expect(formatRowValue(makeRecord({ value: 3 }))).toBe('+3');
  });

  it('历史数量型永远显示（含属性），哪怕值是 1', () => {
    expect(formatRowValue(makeRecord({ kind: 'quantity', value: 1, attributes: ['杯'] }))).toBe('1 杯');
    expect(formatRowValue(makeRecord({ kind: 'quantity', value: 500, attributes: ['毫升'] }))).toBe(
      '500 毫升',
    );
  });
});

describe('formatFullTime', () => {
  it('给出日期与时间（年份不省略），交给本地时区换算', () => {
    expect(formatFullTime('2026-10-22T08:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('解析不了就原样返回，不抛错', () => {
    expect(formatFullTime('坏时间')).toBe('坏时间');
  });
});
