import type { EventRecord, RecordSource } from '@/domain/models';

const SOURCE_LABELS: Record<RecordSource, string> = {
  manual: '手动',
  quick: '快捷',
  backfill: '补录',
};

export function sourceLabel(source: RecordSource): string {
  return SOURCE_LABELS[source];
}

/** 计数型展示成「+1」，数量型展示成「0.5」，再带上单位。 */
export function formatRecordValue(record: EventRecord): string {
  const value = record.kind === 'counter' ? `+${record.value}` : String(record.value);
  return record.unit ? `${value} ${record.unit}` : value;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 按设备本地时区展示为 MM-DD HH:mm；解析失败时原样返回，不抛错。 */
export function formatOccurredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 记录时间与发生时间不一致时，说明这是补录。 */
export function isBackfilled(record: EventRecord): boolean {
  return record.source === 'backfill' || record.occurredAt !== record.recordedAt;
}

/** 一行记录的名称与取值，例如「喝水 +1 杯」，用于撤销提示等文案。 */
export function describeRecord(record: EventRecord): string {
  return `${record.snapshot.name} ${formatRecordValue(record)}`;
}

/**
 * 默认副标题：发生时间 + 来源。
 * 补录的记录按需求显示「补录于 <录入时间>」，让用户知道这条是事后填的。
 */
export function recordSubtitle(record: EventRecord): string {
  const when = formatOccurredAt(record.occurredAt);
  return isBackfilled(record)
    ? `${when} · 补录于 ${formatOccurredAt(record.recordedAt)}`
    : `${when} · ${sourceLabel(record.source)}`;
}
