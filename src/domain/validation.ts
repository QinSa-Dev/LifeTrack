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
  isCycleMode,
  isEnumFieldKind,
  isEventDefinitionKind,
  isFieldKind,
  isRecordKind,
  isRecordSource,
  type CycleMode,
  type EventDefinitionKind,
  type FieldKind,
  type FieldSnapshot,
  type FieldValue,
  type IsoDate,
  type RecordKind,
  type RecordSource,
} from './models';

/** 事件分组的输入（创建与更新共用） */
export interface EventGroupInput {
  name: string;
  color?: string;
  sortOrder?: number;
}

/** 快捷选项的输入；id 省略表示新建 */
export interface QuickOptionInput {
  id?: string;
  /** 这一下记的是什么（自由文本，例如「200ml」）；省略表示不带属性 */
  attribute?: string;
  value: number;
  sortOrder?: number;
}

/** 自定义字段的输入；id 省略表示新建 */
export interface FieldInput {
  id?: string;
  name: string;
  kind: FieldKind;
  /** 枚举型的候选值（single / multi）；其它类型忽略 */
  options?: string[];
  sortOrder?: number;
}

/** 记录时对某个字段的取值；枚举型从候选值里挑，时间点 / 时间段填 `HH:mm` */
export interface FieldValueInput {
  fieldId: string;
  values: string[];
}

/**
 * 事件定义的草稿：一次提交里包含定义本身、属性、自定义字段与快捷选项。
 * 更新语义是**整体替换**——草稿里没有的字段/快捷选项会被移除。
 */
export interface EventDefinitionDraft {
  name: string;
  kind: EventDefinitionKind;
  /** 属性：自由文本列表（例如「200ml」「温水」），可以一条都不写 */
  attributes?: string[];
  /** 自定义字段（只有计数型用得上） */
  fields?: FieldInput[];
  groupId?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  quickOptions: QuickOptionInput[];
  /** 周期型的做法；计数型忽略 */
  cycleMode?: CycleMode;
  /** 周期长度（天）：手动型用于预测，自动型是「每隔多少天一次」 */
  averageCycleLengthDays?: number;
  /** 一段周期通常持续多少天 */
  averagePeriodLengthDays?: number;
}

/**
 * 记录一次事件的输入。
 * `occurredAt` 省略时表示「就是现在」；补录（backfill）会显式传入过去的时间。
 */
export interface EventRecordInput {
  definitionId: string;
  value: number;
  /** 这一次标上的属性（可多选，也可以不标）；省略即空 */
  attributes?: string[];
  /** 这一次为各字段选的值；省略即空 */
  fieldValues?: FieldValueInput[];
  occurredAt?: string;
  note?: string;
  source: RecordSource;
}

/**
 * 修改一条已存在的记录：只改「事实本身」——取值、发生时间、备注。
 *
 * 不给属性、名称这类**快照**字段：它们是「记录当时的样子」，改了就不是历史了
 * （见 domain/models.ts 的 snapshot）。也不给 source：它说明这条是怎么进来的，
 * 不是用户能重新选的东西。
 */
export interface EventRecordEditInput {
  value: number;
  occurredAt?: string;
  /** 省略即清空备注：更新是「这条记录的这三个字段整体替换」 */
  note?: string;
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

/** 事件类型：只接受 counter / cycle，其它值在写库前就拒绝。 */
export function requireKind(value: unknown): EventDefinitionKind {
  if (!isEventDefinitionKind(value)) {
    throw new ValidationError(`事件类型不合法：${String(value)}`);
  }
  return value;
}

/**
 * 历史记录的类型：比定义多一个 `quantity`（早期「数量」型事件留下的记录）。
 * 历史不可篡改，所以读取与导入时它必须仍然合法。
 */
export function requireRecordKind(value: unknown): RecordKind {
  if (!isRecordKind(value)) {
    throw new ValidationError(`记录类型不合法：${String(value)}`);
  }
  return value;
}

/** 周期型做法：只接受 auto / manual。 */
export function requireCycleMode(value: unknown): CycleMode {
  if (!isCycleMode(value)) {
    throw new ValidationError(`周期方式不合法：${String(value)}`);
  }
  return value;
}

/**
 * 可选周期型做法：空值归为 `undefined`（调用方再按 `manual` 兜底）。
 */
export function optionalCycleMode(value: unknown): CycleMode | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireCycleMode(value);
}

/** 排序值：必须是整数，允许为 0 与负数（负数表示手动置顶）。 */
export function requireSortOrder(value: number, field = '排序值'): number {
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${field}必须是整数`);
  }
  return value;
}

/**
 * 取值校验用的「事件类型」：比定义的类型多一个历史遗留的 `quantity`。
 *
 * 历史记录（以及老备份）里还可能出现 `quantity`，取值规则与当年一致，
 * 所以这里让三者在同一处共用一套判断。
 */
export type ValueKind = EventDefinitionKind | RecordKind;

/**
 * 正数取值校验（快捷选项与事件记录共用）：
 * - 必须是有限正数（历史「数量」型允许小数，例如 0.5 升）；
 * - 计数型的取值必须是正整数（「0.5 次」没有意义）。
 */
function requirePositiveValue(kind: ValueKind, value: unknown, field: string): number {
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

export function requireQuickOptionValue(kind: ValueKind, value: unknown, field = '快捷选项取值'): number {
  return requirePositiveValue(kind, value, field);
}

/** 事件记录的取值：语义同快捷选项，只是错误文案不同。 */
export function requireRecordValue(kind: ValueKind, value: unknown, field = '记录值'): number {
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

/**
 * 把库里存的 JSON 数组文本读回字符串数组（属性、标签、症状等共用）。
 *
 * 解析失败或不是数组时退化为空数组：一行数据里某个列表字段坏了，
 * 不该让整条记录读不出来，更不该让整屏崩掉。
 */
export function readTextList(json: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is string => typeof item === 'string');
}

/** 字段类型：只接受 single / multi / time / range。 */
export function requireFieldKind(value: unknown): FieldKind {
  if (!isFieldKind(value)) {
    throw new ValidationError(`字段类型不合法：${String(value)}`);
  }
  return value;
}

/** 24 小时制时间点：`HH:mm`（补零）。 */
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function requireTimeOfDay(value: string, field = '时间'): string {
  const trimmed = value.trim();
  if (!TIME_OF_DAY_PATTERN.test(trimmed)) {
    throw new ValidationError(`${field}要填 24 小时制的「时:分」（例如 08:30）：${value}`);
  }
  return trimmed;
}

/** 自定义字段输入 → 可直接落库的规整结果（枚举型必须至少有一个候选值）。 */
export function normalizeFieldInput(input: FieldInput): FieldInput {
  const name = requireName(input.name, '字段名称');
  const kind = requireFieldKind(input.kind);
  const options = isEnumFieldKind(kind) ? normalizeTextList(input.options ?? []) : [];
  if (isEnumFieldKind(kind) && options.length === 0) {
    throw new ValidationError(`枚举字段「${name}」至少要有一个候选值`);
  }
  return { id: input.id, name, kind, options, sortOrder: requireSortOrder(input.sortOrder ?? 0) };
}

/** 校验规则能用得上的字段信息：定义上的字段与快照里的字段都满足。 */
export interface FieldLike {
  id: string;
  name: string;
  kind: FieldKind;
  /** 候选值（枚举型）；只读 */
  options: readonly string[];
}

/** 一组取值是否符合某个字段：合规返回值，不合规抛 `ValidationError`。 */
function requireFieldAssignment(field: FieldLike, raw: readonly string[]): string[] {
  const values = raw.map((value) => value.trim()).filter((value) => value.length > 0);
  if (values.length === 0) {
    return [];
  }
  switch (field.kind) {
    case 'single': {
      if (values.length > 1) {
        throw new ValidationError(`字段「${field.name}」只能选一个值`);
      }
      if (!field.options.includes(values[0]!)) {
        throw new ValidationError(`字段「${field.name}」的取值不在候选里：${values[0]}`);
      }
      return [values[0]!];
    }
    case 'multi': {
      const picked: string[] = [];
      for (const value of values) {
        if (!field.options.includes(value)) {
          throw new ValidationError(`字段「${field.name}」的取值不在候选里：${value}`);
        }
        if (!picked.includes(value)) {
          picked.push(value);
        }
      }
      return picked;
    }
    case 'time':
      return [requireTimeOfDay(values[0]!, `字段「${field.name}」`)];
    case 'range': {
      if (values.length < 2) {
        throw new ValidationError(`字段「${field.name}」的时间段要填开始与结束两处`);
      }
      const start = requireTimeOfDay(values[0]!, `字段「${field.name}」的开始时间`);
      const end = requireTimeOfDay(values[1]!, `字段「${field.name}」的结束时间`);
      if (end < start) {
        throw new ValidationError(`字段「${field.name}」的结束时间不能早于开始时间`);
      }
      return [start, end];
    }
  }
}

/**
 * 把「记录时输入的字段取值」规整成可落库的 `FieldValue[]`。
 *
 * - 取值全部落空（没选）的字段会被丢掉，不落一条空记录；
 * - `dropUnknownFields`（默认 true，记录路径）对**不认识的字段 id 一律忽略**——定义改了、
 *   字段被删了之后，旧记录里的值再想「照着记一条」时不至于报错；
 * - 导入外部备份时传 false：备份里出现不认识的字段 id 属于数据坏了，必须拒绝而不是悄悄丢。
 */
export function normalizeFieldValues(
  fields: readonly FieldLike[],
  inputs: readonly FieldValueInput[],
  options: { dropUnknownFields?: boolean } = {},
): FieldValue[] {
  const dropUnknown = options.dropUnknownFields ?? true;
  const byId = new Map<string, FieldLike>();
  for (const field of fields) {
    byId.set(field.id, field);
  }
  const result: FieldValue[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const field = byId.get(input.fieldId);
    if (!field) {
      if (dropUnknown) {
        continue;
      }
      throw new ValidationError(`字段取值指向不存在的字段：${input.fieldId}`);
    }
    if (seen.has(field.id)) {
      throw new ValidationError(`字段「${field.name}」出现了重复取值`);
    }
    const values = requireFieldAssignment(field, input.values);
    if (values.length === 0) {
      continue;
    }
    seen.add(field.id);
    result.push({ fieldId: field.id, values });
  }
  return result;
}

/**
 * 宽松解析库里存的「字段取值」JSON 文本；坏一行不该让整条记录读不出来。
 * 解析失败或结构不对时退化为空数组。
 */
export function readFieldValues(json: string): FieldValue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const result: FieldValue[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const row = item as { fieldId?: unknown; values?: unknown };
    if (typeof row.fieldId !== 'string' || !Array.isArray(row.values)) {
      continue;
    }
    const values = row.values.filter((value): value is string => typeof value === 'string');
    result.push({ fieldId: row.fieldId, values });
  }
  return result;
}

/** 宽松解析库里存的「字段快照」JSON 文本；同上，坏一行只丢那一行。 */
export function readFieldSnapshots(json: string): FieldSnapshot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const result: FieldSnapshot[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const row = item as { id?: unknown; name?: unknown; kind?: unknown; options?: unknown };
    if (typeof row.id !== 'string' || typeof row.name !== 'string' || !isFieldKind(row.kind)) {
      continue;
    }
    const options = Array.isArray(row.options)
      ? row.options.filter((value): value is string => typeof value === 'string')
      : [];
    result.push({ id: row.id, name: row.name, kind: row.kind, options });
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
