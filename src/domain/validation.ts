/**
 * 输入校验与「表单输入 → 领域对象」的规整规则。
 *
 * 为什么单独成一层：仓储层收到的永远可能是「外部数据」（用户输入、未来导入的 JSON），
 * 而 TypeScript 的类型在运行时不做任何校验（见 docs/learning/03 4.4、4.7）。
 * 把「非空、类型、取值范围」这些规则集中在这里，仓储与界面都复用同一套判断，
 * 避免「界面校验一套、写库再校验一套」的重复与不一致。
 */

import { isValidIsoDate } from './dates';
import { ValidationError } from './errors';
import {
  isEventDefinitionKind,
  isRecordSource,
  type EventDefinitionKind,
  type IsoDate,
  type RecordSource,
} from './models';

/** 事件分组的输入（创建与更新共用） */
export interface EventGroupInput {
  name: string;
  color?: string;
  sortOrder?: number;
}

/** 标签的输入 */
export interface TagInput {
  name: string;
  color?: string;
}

/** 快捷选项的输入；id 省略表示新建 */
export interface QuickOptionInput {
  id?: string;
  label: string;
  value: number;
  unit?: string;
  sortOrder?: number;
}

/**
 * 事件定义的草稿：一次提交里包含定义本身、快捷选项与标签关联。
 * 更新语义是**整体替换**——草稿里没有的快捷选项/标签会被移除。
 */
export interface EventDefinitionDraft {
  name: string;
  kind: EventDefinitionKind;
  unit?: string;
  groupId?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  tagIds: string[];
  quickOptions: QuickOptionInput[];
}

/**
 * 记录一次事件的输入。
 * `occurredAt` 省略时表示「就是现在」；补录（backfill）会显式传入过去的时间。
 */
export interface EventRecordInput {
  definitionId: string;
  value: number;
  /** 覆盖定义/选项的单位，例如快捷选项自带的「杯」 */
  unit?: string;
  occurredAt?: string;
  note?: string;
  source: RecordSource;
}

/** 周期定义的输入（创建与更新共用）。 */
export interface CycleDefinitionInput {
  name: string;
  /** 平均周期长度（天），用于预测下次开始日；省略表示不预测 */
  averageCycleLengthDays?: number;
  /** 平均经期长度（天），仅作参考 */
  averagePeriodLengthDays?: number;
}

/** 周期实例的输入（创建与更新共用）。`endDate` 省略表示仍在进行中。 */
export interface CycleInstanceInput {
  definitionId: string;
  startDate: string;
  endDate?: string;
  note?: string;
}

/**
 * 周期实例的边界与备注（更新用）。
 * 实例**不会换定义**，所以这里没有 `definitionId`——避免「一个周期中途换了归属」这种含糊状态。
 */
export interface CycleInstanceUpdateInput {
  startDate: string;
  endDate?: string;
  note?: string;
}

/** 周期内记录的输入（创建与更新共用）。 */
export interface CycleEntryInput {
  date: string;
  phase?: string;
  symptoms?: string[];
  feelings?: string;
  note?: string;
}

/** 名称类字段：去首尾空白后必须非空。 */
export function requireName(value: string, field = '名称'): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field}不能为空`);
  }
  return trimmed;
}

/** 可选文本：空串与纯空白都归为 undefined，避免「空字符串」这种脏值落库。 */
export function optionalText(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** 事件类型：只接受 counter / quantity，其它值在写库前就拒绝。 */
export function requireKind(value: unknown): EventDefinitionKind {
  if (!isEventDefinitionKind(value)) {
    throw new ValidationError(`事件类型不合法：${String(value)}`);
  }
  return value;
}

/** 排序值：必须是整数，允许为 0 与负数（负数表示手动置顶）。 */
export function requireSortOrder(value: number, field = '排序值'): number {
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${field}必须是整数`);
  }
  return value;
}

/**
 * 正数取值校验（快捷选项与事件记录共用）：
 * - 必须是有限正数（数量型允许小数，例如 0.5 升）；
 * - 计数型的取值必须是正整数（「0.5 次」没有意义）。
 */
function requirePositiveValue(kind: EventDefinitionKind, value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field}必须是有限数字`);
  }
  if (value <= 0) {
    throw new ValidationError(`${field}必须大于 0`);
  }
  if (kind === 'counter' && !Number.isInteger(value)) {
    throw new ValidationError(`${field}在计数型事件下必须是整数`);
  }
  return value;
}

export function requireQuickOptionValue(
  kind: EventDefinitionKind,
  value: unknown,
  field = '快捷选项取值',
): number {
  return requirePositiveValue(kind, value, field);
}

/** 事件记录的取值：语义同快捷选项，只是错误文案不同。 */
export function requireRecordValue(kind: EventDefinitionKind, value: unknown, field = '记录值'): number {
  return requirePositiveValue(kind, value, field);
}

/** 主键类字段：去空白后必须非空。 */
export function requireId(value: string, field = 'id'): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field}不能为空`);
  }
  return trimmed;
}

/** 记录来源：只接受 manual / quick / backfill。 */
export function requireRecordSource(value: unknown): RecordSource {
  if (!isRecordSource(value)) {
    throw new ValidationError(`记录来源不合法：${String(value)}`);
  }
  return value;
}

/** ISO-8601 带时区时间戳，例如 2026-10-19T07:30:00.000Z。 */
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function requireIsoDateTime(value: string, field = '时间'): string {
  if (!ISO_DATE_TIME_PATTERN.test(value)) {
    throw new ValidationError(`${field}不是合法的 ISO-8601 时间：${value}`);
  }
  return value;
}

/**
 * 「不能是未来」校验：补录（backfill）只能记录已经发生的事实。
 *
 * 为什么用 `Date.parse` 比较而不是字符串大小：ISO 文本可以带不同时区偏移
 * （`+08:00` 与 `Z`），字典序并不等于时间先后。
 */
export function requireNotFuture(value: string, now: string, field = '发生时间'): string {
  const target = Date.parse(value);
  const reference = Date.parse(now);
  if (!Number.isFinite(target) || !Number.isFinite(reference)) {
    throw new ValidationError(`${field}不是可解析的时间：${value}`);
  }
  if (target > reference) {
    throw new ValidationError(`${field}不能晚于当前时间（补录只能记录已发生的事实）`);
  }
  return value;
}

/** 去重并去掉空白标签 id，保持输入顺序。 */
export function normalizeIdList(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (id.length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** 去空白、去重（按原样比较）、保持输入顺序的文本列表，例如症状名。 */
export function normalizeTextList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const text = raw.trim();
    if (text.length === 0 || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

/** 日历日期：必须是真实存在的 `YYYY-MM-DD`（2 月 31 日这类不算）。 */
export function requireIsoDate(value: string, field = '日期'): IsoDate {
  const trimmed = value.trim();
  if (!isValidIsoDate(trimmed)) {
    throw new ValidationError(`${field}不是合法的日历日期（应为 YYYY-MM-DD）：${value}`);
  }
  return trimmed;
}

/** 可选日历日期：空串 / 空白 / undefined 都归为 undefined。 */
export function optionalIsoDate(value: string | undefined | null, field = '日期'): IsoDate | undefined {
  const text = optionalText(value);
  return text === undefined ? undefined : requireIsoDate(text, field);
}

/** 可选正整数：用于「平均周期长度」这类配置；缺省表示不配置。 */
export function optionalPositiveInteger(value: number | undefined, field = '数值'): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${field}必须是正整数`);
  }
  return value;
}

/**
 * 日期区间：结束日不得早于开始日。
 * 返回规整后的区间，供仓储直接使用。
 */
export function requireDateRange(
  startDate: string,
  endDate?: string | null,
  startField = '开始日期',
  endField = '结束日期',
): { startDate: IsoDate; endDate?: IsoDate } {
  const start = requireIsoDate(startDate, startField);
  const end = optionalIsoDate(endDate, endField);
  if (end !== undefined && end < start) {
    throw new ValidationError(`${endField}不能早于${startField}`);
  }
  return { startDate: start, endDate: end };
}
