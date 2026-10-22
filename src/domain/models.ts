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

/** ISO-8601 带时区的时间戳，例如 2026-10-19T07:30:00.000Z */
export type IsoDateTime = string;
/** ISO-8601 日期，例如 2026-10-19 */
export type IsoDate = string;

/** 事件类型：纯计数 / 数量计量 */
export type EventDefinitionKind = 'counter' | 'quantity';

export const EVENT_DEFINITION_KINDS: readonly EventDefinitionKind[] = ['counter', 'quantity'];

export function isEventDefinitionKind(value: unknown): value is EventDefinitionKind {
  return value === 'counter' || value === 'quantity';
}

/** 记录的来源，用于区分手动录入 / 快捷记录 / 历史补录 */
export type RecordSource = 'manual' | 'quick' | 'backfill';

export const RECORD_SOURCES: readonly RecordSource[] = ['manual', 'quick', 'backfill'];

export function isRecordSource(value: unknown): value is RecordSource {
  return value === 'manual' || value === 'quick' || value === 'backfill';
}

/** 快捷选项：一键记录常用的取值 */
export interface QuickOption {
  id: string;
  label: string;
  /** counter：一次的增量（通常为 1）；quantity：数量 */
  value: number;
  /** 覆盖定义默认单位，例如「毫升」 */
  unit?: string;
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
  /** quantity 的默认单位，例如「杯」「公里」 */
  unit?: string;
  groupId?: string;
  color?: string;
  /** 图标标识（前端映射），不存字形本身 */
  icon?: string;
  quickOptions: QuickOption[];
  tagIds: string[];
  /** 归档后不再出现在记录入口，但历史保留 */
  isArchived: boolean;
  sortOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * 记录时刻的事件定义快照。
 * 事件定义被改名、换单位、归档、甚至删除后，历史记录依然展示当初的样子。
 */
export interface EventDefinitionSnapshot {
  definitionId: string;
  name: string;
  kind: EventDefinitionKind;
  unit?: string;
  groupId?: string;
  tagIds: string[];
}

/** 历史记录：一次事实发生的记录 */
export interface EventRecord {
  id: string;
  definitionId: string;
  kind: EventDefinitionKind;
  /** counter：本次增量；quantity：本次数量 */
  value: number;
  unit?: string;
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

/** 周期定义，例如「生理期」 */
export interface CycleDefinition {
  id: string;
  name: string;
  /** 用于预测下一次周期的平均长度（天），可为空表示不预测 */
  averageCycleLengthDays?: number;
  /** 平均持续时间（天），可为空 */
  averagePeriodLengthDays?: number;
  isArchived: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

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

/**
 * 把事件定义在「记录的这一刻」固化成一个快照。
 *
 * 这是「历史不可篡改」的实现手段：快照一旦写入记录就永不更新，
 * 之后定义改名、换单位、归档甚至被永久删除，历史都不受影响。
 */
export function toDefinitionSnapshot(definition: EventDefinition): EventDefinitionSnapshot {
  return {
    definitionId: definition.id,
    name: definition.name,
    kind: definition.kind,
    unit: definition.unit,
    groupId: definition.groupId,
    tagIds: [...definition.tagIds],
  };
}
