/**
 * LifeTrack 领域模型（第一阶段：类型与规则边界，不含业务实现）。
 *
 * 已确认的领域规则（体现在类型设计里）：
 * 1. 事件定义（Definition）与历史记录（Record）分离：删改定义不影响已产生的历史。
 * 2. 历史记录保存「记录时刻的快照」，不随事件配置变化而变化。
 * 3. 周期实例（Instance）与周期内记录（Entry）独立建模。
 * 4. 归档只改 isArchived，不删除历史。
 * 5. 删除历史用软删除（deletedAt），以便撤销最近操作。
 */

import { ValidationError } from './errors';

/** ISO-8601 带时区的时间戳，例如 2026-10-19T07:30:00.000Z */
export type IsoDateTime = string;
/** ISO-8601 日期，例如 2026-10-19 */
export type IsoDate = string;

/**
 * 事件类型：**计数**（点一次记一次）或**周期**（一段有开始与结束的区间）。
 *
 * 「数量」（每次填一个数值）不再是一种类型：要表达「一次是多少」就用定义上的
 * **属性**（`attributes`）这些自由文本，例如「200ml」「5km」——
 * 用户自己怎么写、写几条，应用就怎么显示，不做单位换算与一致性校验。
 */
export type EventDefinitionKind = 'counter' | 'cycle';

export const EVENT_DEFINITION_KINDS: readonly EventDefinitionKind[] = ['counter', 'cycle'];

export function isEventDefinitionKind(value: unknown): value is EventDefinitionKind {
  return value === 'counter' || value === 'cycle';
}

/**
 * 周期型事件的两种做法。
 *
 * - `auto`：按配置好的规律自动生成，到时间自动开始、自动结束（例如每 30 天一次、每周）；
 * - `manual`：由用户自己点开始、点结束，时长不预先限定，真实发生后再记录。
 */
export type CycleMode = 'auto' | 'manual';

export const CYCLE_MODES: readonly CycleMode[] = ['auto', 'manual'];

export function isCycleMode(value: unknown): value is CycleMode {
  return value === 'auto' || value === 'manual';
}

/**
 * **历史记录**的类型：比定义的类型多一个 `quantity`。
 *
 * 为什么留着它：`quantity` 是 2026-10 之前「数量」型事件留下的记录，
 * 历史不可篡改——那些行仍然按「数量」的方式展示（`5 公里` 而不是 `+5 公里`），
 * 相关字段与约束也照旧，只是**新建事件时不再有这个类型**。
 */
export type RecordKind = 'counter' | 'quantity';

export const RECORD_KINDS: readonly RecordKind[] = ['counter', 'quantity'];

export function isRecordKind(value: unknown): value is RecordKind {
  return value === 'counter' || value === 'quantity';
}

/** 记录的来源，用于区分手动录入 / 快捷记录 / 历史补录 */
export type RecordSource = 'manual' | 'quick' | 'backfill';

export const RECORD_SOURCES: readonly RecordSource[] = ['manual', 'quick', 'backfill'];

export function isRecordSource(value: unknown): value is RecordSource {
  return value === 'manual' || value === 'quick' || value === 'backfill';
}

/** 快捷选项：一键记录一组「属性 + 取值」 */
export interface QuickOption {
  id: string;
  /** 这一下记的是什么，例如「200ml」；留空表示只记取值、不带属性 */
  attribute?: string;
  /** counter：一次的增量（通常为 1） */
  value: number;
  sortOrder: number;
}

/** 事件分组，例如「健康」「工作」 */
export interface EventGroup {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** 标签，例如「早晨」「运动后」 */
export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** 事件定义：用户「可以记录什么」 */
export interface EventDefinition {
  id: string;
  name: string;
  kind: EventDefinitionKind;
  /**
   * 属性：用户自定义的自由文本，说明「一次是什么」，例如「200ml」「5km」。
   * 可以写多条（例如「温水」「500ml」）；应用只负责原样展示，不做单位换算。
   * 周期型不使用属性（周期记的是「哪一天」，不是「一次是什么」），恒为空数组。
   */
  attributes: string[];
  groupId?: string;
  color?: string;
  /** 图标标识（前端映射），不存字形本身 */
  icon?: string;
  quickOptions: QuickOption[];
  tagIds: string[];
  /** 归档后不再出现在记录入口，但历史保留 */
  isArchived: boolean;
  sortOrder: number;
  /** 周期型的做法（`auto` / `manual`）；计数型恒为 `undefined` */
  cycleMode?: CycleMode;
  /** 周期长度（天）：手动型用于预测下次开始日；自动型就是「每隔多少天一次」 */
  averageCycleLengthDays?: number;
  /** 一段周期通常持续多少天；自动型据此给出结束日 */
  averagePeriodLengthDays?: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** 只有周期型定义才有意义的那部分配置，供预测等纯函数按需取用。 */
export type CycleConfig = Pick<
  EventDefinition,
  'cycleMode' | 'averageCycleLengthDays' | 'averagePeriodLengthDays'
>;

/**
 * 记录时刻的事件定义快照。
 * 事件定义被改名、换属性、归档、甚至删除后，历史记录依然展示当初的样子。
 */
export interface EventDefinitionSnapshot {
  definitionId: string;
  name: string;
  kind: RecordKind;
  /** 记录时刻定义上的属性列表（可能为空） */
  attributes: string[];
  groupId?: string;
  tagIds: string[];
}

/** 历史记录：一次事实发生的记录 */
export interface EventRecord {
  id: string;
  definitionId: string;
  kind: RecordKind;
  /** counter：本次增量；quantity（历史数据）：本次数量 */
  value: number;
  /**
   * 这一次记录标上的属性（可多选，也可以一个都不标）。
   * 展示时若为空会回落到快照里的属性列表，见 `recordAttributes`。
   */
  attributes: string[];
  /** 事实发生时间（补录时可能早于 recordedAt） */
  occurredAt: IsoDateTime;
  /** 录入时间 */
  recordedAt: IsoDateTime;
  note?: string;
  source: RecordSource;
  /** 记录时生效的标签，快照保存 */
  tagIds: string[];
  snapshot: EventDefinitionSnapshot;
  /** 软删除标记：设置后视为已删除，可撤销恢复 */
  deletedAt?: IsoDateTime;
}

/** 周期阶段：不写死枚举，允许自定义名称 */
export type CyclePhase = string;

/** 周期实例：一段真实的周期区间 */
export interface CycleInstance {
  id: string;
  definitionId: string;
  startDate: IsoDate;
  /** 未结束时为空；修改边界不得静默删除已越界的记录 */
  endDate?: IsoDate;
  note?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** 周期内记录：某一天的症状、阶段、感受与备注 */
export interface CycleEntry {
  id: string;
  instanceId: string;
  date: IsoDate;
  phase?: CyclePhase;
  symptoms: string[];
  feelings?: string;
  note?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** 软删除标记：设置后视为已删除，可撤销恢复 */
  deletedAt?: IsoDateTime;
}

/**
 * 回收站里的一条周期记录。
 *
 * 周期记录本身只有「哪一天」，光看它说不清是哪个周期的哪一天，
 * 所以带上所属实例与定义的名字，让回收站里的每一行都能自证来历。
 */
export interface DeletedCycleEntry {
  entry: CycleEntry;
  /** 所属周期定义的名字（例如「生理期」） */
  definitionName: string;
  /** 所属实例的区间，用来说清这条记录属于哪一段 */
  instanceStartDate: IsoDate;
  instanceEndDate?: IsoDate;
}

/** 只有未软删除的记录参与展示与统计 */
export function isVisibleRecord(record: EventRecord): boolean {
  return record.deletedAt === undefined;
}

/** 周期记录同理：软删除的那天不再参与展示、统计与「边界越界」判断 */
export function isVisibleEntry(entry: CycleEntry): boolean {
  return entry.deletedAt === undefined;
}

/** 归档不影响历史，只影响「能否新建记录」的入口 */
export function isRecordable(definition: EventDefinition): boolean {
  return !definition.isArchived;
}

/** 是不是周期型事件（周期型走周期实例与每日记录，不使用事件记录）。 */
export function isCycleDefinition(definition: EventDefinition): boolean {
  return definition.kind === 'cycle';
}

/**
 * 一条记录最终展示用的属性。
 *
 * 用户记录时标了属性就用标上的；一个都没标（`attributes` 为空）时回落到记录时刻的
 * 定义属性——「一次是什么」本来就由定义描述，不该因为没勾选就在历史里丢掉。
 */
export function recordAttributes(record: EventRecord): string[] {
  return record.attributes.length > 0 ? record.attributes : record.snapshot.attributes;
}

/** 把属性列表拼成一行展示文本；空列表返回 `undefined`（调用方据此决定要不要显示）。 */
export function attributeText(attributes: readonly string[]): string | undefined {
  return attributes.length === 0 ? undefined : attributes.join(' · ');
}

/** 定义的类型 → 记录的类型。周期型不产生事件记录，传进来就是编程错误。 */
export function toRecordKind(kind: EventDefinitionKind): RecordKind {
  if (kind !== 'counter') {
    throw new ValidationError('周期型事件不产生事件记录，请走周期实例与每日记录');
  }
  return 'counter';
}

/**
 * 把事件定义在「记录的这一刻」固化成一个快照。
 *
 * 这是「历史不可篡改」的实现手段：快照一旦写入记录就永不更新，
 * 之后定义改名、换属性、归档甚至被永久删除，历史都不受影响。
 */
export function toDefinitionSnapshot(definition: EventDefinition): EventDefinitionSnapshot {
  return {
    definitionId: definition.id,
    name: definition.name,
    kind: toRecordKind(definition.kind),
    attributes: [...definition.attributes],
    groupId: definition.groupId,
    tagIds: [...definition.tagIds],
  };
}
