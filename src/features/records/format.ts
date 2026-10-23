import { attributeText, recordAttributes, type EventRecord, type RecordSource } from '@/domain/models';

import { localDateText, localTimeText } from '@/features/common/datetime';

const SOURCE_LABELS: Record<RecordSource, string> = {
  manual: '手动',
  quick: '快捷',
  backfill: '补录',
};

export function sourceLabel(source: RecordSource): string {
  return SOURCE_LABELS[source];
}

/** 计数型展示成「+1」，历史数量型展示成「0.5」，再带上属性（多个用 · 连起来）。 */
export function formatRecordValue(record: EventRecord): string {
  const value = record.kind === 'counter' ? `+${record.value}` : String(record.value);
  const text = attributeText(recordAttributes(record));
  return text === undefined ? value : `${value} ${text}`;
}

/**
 * 时间轴一行右侧显示的取值，取不出来时返回 `null`。
 *
 * 计数型且增量为 1 时不显示文字：这一行的右侧已经有一颗【+1】按钮，
 * 旁边再摆一个「+1」会分不清哪个是说明、哪个是能点的按钮。
 * 增量大于 1（如「+3」）仍要显示——那是这一行的信息，按钮重复它的取值。
 */
export function formatRowValue(record: EventRecord): string | null {
  if (record.kind === 'counter' && record.value === 1) {
    return null;
  }
  return formatRecordValue(record);
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

/**
 * 详情页用的完整本地时间：`YYYY-MM-DD HH:mm`。
 *
 * 列表一行用短格式（`MM-DD HH:mm`）省地方，详情页没有这个约束，
 * 把年份补全，跨年的记录就不会看错。
 */
export function formatFullTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${localDateText(date)} ${localTimeText(date)}`;
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
