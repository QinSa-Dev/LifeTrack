/**
 * 备份格式（导出 / 导入）与合并规则 —— **纯领域层**，不碰数据库、不碰文件系统。
 *
 * 设计要点：
 *
 * 1. **显式格式契约**：文件里写死 `format` / `formatVersion`，导入时先认格式再认数据，
 *    避免随便一个 JSON 被当成备份读进来。
 * 2. **严格解析，不做猜测**：外部 JSON 逐个字段过守卫（复用 validation.ts 的规则），
 *    出错就抛 `ImportError` 并带上路径（例如 `data.eventRecords[3].value`）。
 *    缺失的**集合**按空数组处理（兼容旧版本导出的文件），但「存在却写错」的条目一律拒绝。
 * 3. **引用完整性在写库之前就查**：分组 / 周期实例的指向必须存在。
 *    例外是事件记录——它的 `definitionId` 本来就可能指向已被永久删除的定义
 *    （v3 表故意没有外键，靠快照自证），所以不校验。
 * 4. **合并 = 取并集，永不删除本地数据**：导入是「把备份里的东西合进来」，
 *    本地独有的数据一律保留。同 id 冲突时**较新的 `updatedAt` 胜出**；
 *    完全相同则保留本地、不重写。事件记录是不可篡改的历史，没有 `updatedAt`，
 *    只可能合并「软删除标记」。
 * 5. **输出稳定**：导出前按固定规则排序，两次导出可以直接 diff。
 */

import { isEntryWithinRange } from './cycles';
import { ImportError, ValidationError } from './errors';
import { assertEntityId, newId } from './id';
import {
  type CycleEntry,
  type CycleInstance,
  type CycleMode,
  type DefinitionField,
  type EventDefinition,
  type EventGroup,
  type EventRecord,
  type FieldSnapshot,
  type FieldValue,
  type IsoDateTime,
  type QuickOption,
} from './models';
import {
  normalizeFieldInput,
  normalizeFieldValues,
  normalizeIdList,
  normalizeTextList,
  optionalCycleMode,
  optionalPositiveInteger,
  optionalText,
  requireFieldKind,
  requireIsoDate,
  requireIsoDateTime,
  requireKind,
  requireName,
  requireNotFuture,
  requireQuickOptionValue,
  requireRecordKind,
  requireRecordSource,
  requireRecordValue,
  requireSortOrder,
} from './validation';

/** 备份文件的标识字符串，用来拒绝「不是本应用导出」的 JSON */
export const BACKUP_FORMAT = 'lifetrack-backup';

/** 备份**格式**版本（数据结构本身的版本，与数据库 schema 版本是两件事） */
export const BACKUP_FORMAT_VERSION = 3;

/** 备份里包含的五个集合，顺序即写入顺序（父表在前） */
export const BACKUP_COLLECTIONS = [
  'eventGroups',
  'eventDefinitions',
  'eventRecords',
  'cycleInstances',
  'cycleEntries',
] as const;

export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

/** 备份的正文：与仓储层的领域模型一一对应（不含 app_meta 这类本机元信息） */
export interface BackupData {
  eventGroups: EventGroup[];
  /** 事件定义：计数型与周期型都在这里（周期型就是多几个周期字段） */
  eventDefinitions: EventDefinition[];
  eventRecords: EventRecord[];
  cycleInstances: CycleInstance[];
  cycleEntries: CycleEntry[];
}

/**
 * 一份完整的备份文件。
 *
 * `schemaVersion` 是导出时数据库的版本，用来在导入时判断
 * 「备份是不是来自更新版本的应用」（那种情况只能提示用户先升级）。
 */
export interface BackupFile {
  format: string;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: IsoDateTime;
  appVersion?: string;
  data: BackupData;
}

/** 一个集合的合并结果计数 */
export interface MergeCounts {
  /** 本地没有、由备份补进来的条数 */
  added: number;
  /** 本地已有、被备份版本覆盖的条数 */
  updated: number;
  /** 结果中沿用本地版本的条数（本地独有 + 本地较新 + 完全相同） */
  kept: number;
}

export interface ImportSummary {
  collections: Record<BackupCollection, MergeCounts>;
  totals: MergeCounts;
}

export function emptyBackupData(): BackupData {
  return {
    eventGroups: [],
    eventDefinitions: [],
    eventRecords: [],
    cycleInstances: [],
    cycleEntries: [],
  };
}

// ---------------------------------------------------------------------------
// 解析（外部 JSON → BackupFile）
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new ImportError(`${path}：${message}`);
}

/** 把 validation.ts 抛出的 ValidationError 转成带路径的 ImportError，保持错误类型单一。 */
function check<T>(path: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof ValidationError) {
      fail(path, error.message);
    }
    throw error;
  }
}

function asObject(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, '必须是对象');
  }
  return value as JsonObject;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, '必须是数组');
  }
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail(path, '必须是字符串');
  }
  return value;
}

/** 可选文本：null / undefined 都归为 undefined，空串也算「没写」。 */
function textOrUndefined(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return optionalText(text(value, path));
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, '必须是有限数字');
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail(path, '必须是布尔值');
  }
  return value;
}

function integerValue(value: unknown, path: string, minimum: number): number {
  const parsed = numberValue(value, path);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    fail(path, `必须是 ≥ ${minimum} 的整数`);
  }
  return parsed;
}

/** 实体 id：任一版本的 UUID（早期数据里是 v4，见 `id.ts` 的说明）。 */
function entityId(value: unknown, path: string): string {
  return check(path, () => assertEntityId(text(value, path), path));
}

function dateTime(value: unknown, path: string): IsoDateTime {
  return check(path, () => requireIsoDateTime(text(value, path), path));
}

function date(value: unknown, path: string): string {
  return check(path, () => requireIsoDate(text(value, path), path));
}

function name(value: unknown, path: string): string {
  return check(path, () => requireName(text(value, path), path));
}

/** 字符串数组（缺省按空数组处理），去掉空串与重复项后返回。 */
function textList(value: unknown, path: string): string[] {
  const items = value === undefined || value === null ? [] : asArray(value, path);
  return items.map((item, index) => text(item, `${path}[${index}]`));
}

function parseArray<T>(value: unknown, path: string, parse: (item: unknown, itemPath: string) => T): T[] {
  const items = value === undefined || value === null ? [] : asArray(value, path);
  return items.map((item, index) => parse(item, `${path}[${index}]`));
}

function parseGroup(value: unknown, path: string): EventGroup {
  const row = asObject(value, path);
  return {
    id: entityId(row.id, `${path}.id`),
    name: name(row.name, `${path}.name`),
    color: textOrUndefined(row.color, `${path}.color`),
    sortOrder: check(`${path}.sortOrder`, () =>
      requireSortOrder(numberValue(row.sortOrder, `${path}.sortOrder`)),
    ),
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
  };
}

/**
 * v2 及以前备份里的标签：现在只用于**折算**（标签 → 定义上的「标签」多选字段），
 * 不再作为独立的领域实体存在，所以这里只取 id 与名称。
 */
function parseLegacyTag(value: unknown, path: string): { id: string; name: string } {
  const row = asObject(value, path);
  return { id: entityId(row.id, `${path}.id`), name: name(row.name, `${path}.name`) };
}

/**
 * 解析上下文：**旧备份的折算规则**。
 *
 * - 格式 v1：里「数量」还是一种事件类型、字段叫 `unit`，周期定义也还单独放在
 *   `cycleDefinitions` 里；v2 起类型只有计数/周期、属性叫 `attributes`（可多条）、
 *   周期定义并进 `eventDefinitions`。
 * - 格式 v2：里「标签」还是全局实体（`tags` + `tagIds`）；v3 起没有标签，
 *   每个定义自己的「字段」取而代之。导入 v2 备份时按下面的规则折成字段。
 *
 * 一律折算、不拒绝——「备份来自旧版本，请重新导出」等于让人丢掉历史。
 */
interface ParseContext {
  /** 备份格式版本 < 2：需要折算 `quantity` 与 `unit` */
  legacy: boolean;
  /** 备份格式版本 < 3：需要把标签折成字段 */
  foldTags: boolean;
  /** 标签 id → 名称（仅 v2 及以前有） */
  legacyTagNames: Map<string, string>;
  /**
   * 定义 id → 折出来的「标签」字段。
   * 定义先于记录解析，记录据此把自己的快照标签值挂到同一条字段上。
   */
  legacyTagFields: Map<string, { id: string; options: string[] }>;
}

/** 把标签 id 列表按名称去重地解析出来（丢弃已经不存在的标签）。 */
function resolveTagNames(tagIds: readonly string[], nameById: Map<string, string>): string[] {
  const names: string[] = [];
  for (const tagId of tagIds) {
    const tagName = nameById.get(tagId);
    if (tagName !== undefined && !names.includes(tagName)) {
      names.push(tagName);
    }
  }
  return names;
}

/** v2 及以前：把某个定义的标签折成一条「标签」多选字段，并登记到上下文里。 */
function foldTagField(
  definitionId: string,
  tagIds: readonly string[],
  context: ParseContext,
): DefinitionField | undefined {
  const names = resolveTagNames(tagIds, context.legacyTagNames);
  if (names.length === 0) {
    return undefined;
  }
  const options = [...names].sort();
  const id = newId();
  context.legacyTagFields.set(definitionId, { id, options });
  return { id, name: '标签', kind: 'multi', options, sortOrder: 0 };
}

/** 定义上的自定义字段（外部 JSON → 领域对象）。 */
function parseField(value: unknown, path: string): DefinitionField {
  const row = asObject(value, path);
  const normalized = check(path, () =>
    normalizeFieldInput({
      id: entityId(row.id, `${path}.id`),
      name: text(row.name, `${path}.name`),
      kind: row.kind as ReturnType<typeof requireFieldKind>,
      options: textList(row.options, `${path}.options`),
      sortOrder: numberValue(row.sortOrder, `${path}.sortOrder`),
    }),
  );
  return {
    id: normalized.id!,
    name: normalized.name,
    kind: normalized.kind,
    options: normalized.options ?? [],
    sortOrder: normalized.sortOrder ?? 0,
  };
}

/** 记录快照里的字段定义。 */
function parseFieldSnapshot(value: unknown, path: string): FieldSnapshot {
  const row = asObject(value, path);
  return {
    id: entityId(row.id, `${path}.id`),
    name: name(row.name, `${path}.name`),
    kind: check(`${path}.kind`, () => requireFieldKind(row.kind)),
    options: normalizeTextList(textList(row.options, `${path}.options`)),
  };
}

/** 记录上某个字段的取值。 */
function parseFieldValue(value: unknown, path: string): FieldValue {
  const row = asObject(value, path);
  return {
    fieldId: entityId(row.fieldId, `${path}.fieldId`),
    values: textList(row.values, `${path}.values`),
  };
}

/**
 * 属性列表的解析。
 *
 * v2 起是 `attributes: string[]`；v1 里只有一个 `unit`（事件定义与事件记录），
 * 快捷选项则是 `label`——折成单元素列表，老备份照样读得进来。
 */
function parseAttributes(row: JsonObject, path: string, legacyKeys: readonly string[]): string[] {
  if (row.attributes !== undefined && row.attributes !== null) {
    return normalizeTextList(textList(row.attributes, `${path}.attributes`));
  }
  for (const key of legacyKeys) {
    const single = textOrUndefined(row[key], `${path}.${key}`);
    if (single !== undefined) {
      return [single];
    }
  }
  return [];
}

/** 快捷选项 = 属性 + 取值；v1 里属性叫 `unit`，没有单位时退用原来的名称 `label`。 */
function parseQuickOption(value: unknown, path: string, kind: DefinitionKindOrLegacy): QuickOption {
  const row = asObject(value, path);
  return {
    id: entityId(row.id, `${path}.id`),
    attribute: textOrUndefined(row.attribute ?? row.unit ?? row.label, `${path}.attribute`),
    value: check(`${path}.value`, () =>
      requireQuickOptionValue(kind, numberValue(row.value, `${path}.value`), `${path}.value`),
    ),
    sortOrder: check(`${path}.sortOrder`, () =>
      requireSortOrder(numberValue(row.sortOrder, `${path}.sortOrder`)),
    ),
  };
}

/** 定义的类型在解析阶段允许的取值：v1 备份里还可能出现 `quantity`。 */
type DefinitionKindOrLegacy = EventDefinition['kind'] | 'quantity';

/** 可选正整数（周期长度这类配置）：null / undefined 都归为「没配置」。 */
function optionalInteger(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return check(path, () => optionalPositiveInteger(numberValue(value, path), path));
}

function parseDefinition(value: unknown, path: string, context: ParseContext): EventDefinition {
  const row = asObject(value, path);
  const id = entityId(row.id, `${path}.id`);
  const rawKind = text(row.kind, `${path}.kind`);
  const kind: EventDefinition['kind'] =
    context.legacy && rawKind === 'quantity' ? 'counter' : check(`${path}.kind`, () => requireKind(rawKind));
  const cycleMode: CycleMode | undefined =
    kind === 'cycle'
      ? (check(`${path}.cycleMode`, () => optionalCycleMode(row.cycleMode)) ?? 'manual')
      : undefined;

  // 自定义字段只有计数型使用；周期型恒为空数组（周期记的是「哪一天」，不是「一次是什么」）。
  const fields: DefinitionField[] =
    kind === 'counter' ? parseArray(row.fields, `${path}.fields`, parseField) : [];
  // v2 及以前的标签：折成一条「标签」多选字段（周期型不带字段，标签随之丢弃）。
  if (kind === 'counter' && context.foldTags) {
    const folded = foldTagField(id, normalizeIdList(textList(row.tagIds, `${path}.tagIds`)), context);
    if (folded) {
      fields.push({ ...folded, sortOrder: fields.length });
    }
  }

  return {
    id,
    name: name(row.name, `${path}.name`),
    kind,
    attributes: parseAttributes(row, path, ['unit']),
    fields,
    groupId: textOrUndefined(row.groupId, `${path}.groupId`),
    color: textOrUndefined(row.color, `${path}.color`),
    icon: textOrUndefined(row.icon, `${path}.icon`),
    isArchived: booleanValue(row.isArchived, `${path}.isArchived`),
    sortOrder: check(`${path}.sortOrder`, () =>
      requireSortOrder(numberValue(row.sortOrder, `${path}.sortOrder`)),
    ),
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
    quickOptions: parseArray(row.quickOptions, `${path}.quickOptions`, (item, itemPath) =>
      parseQuickOption(item, itemPath, kind),
    ),
    cycleMode,
    averageCycleLengthDays:
      kind === 'cycle'
        ? optionalInteger(row.averageCycleLengthDays, `${path}.averageCycleLengthDays`)
        : undefined,
    averagePeriodLengthDays:
      kind === 'cycle'
        ? optionalInteger(row.averagePeriodLengthDays, `${path}.averagePeriodLengthDays`)
        : undefined,
  };
}

/**
 * v1 备份里的 `cycleDefinitions`：折成「周期型事件定义」。
 *
 * 老的周期定义只有名字与两个平均长度，没有做法（那会儿还没有自动/手动之分），
 * 因此按「手动标记」兜底——这也正是它当年唯一的行为。
 */
function parseLegacyCycleDefinition(value: unknown, path: string): EventDefinition {
  const row = asObject(value, path);
  return {
    id: entityId(row.id, `${path}.id`),
    name: name(row.name, `${path}.name`),
    kind: 'cycle',
    cycleMode: 'manual',
    // 周期型不使用属性与自定义字段
    attributes: [],
    fields: [],
    groupId: undefined,
    color: undefined,
    icon: undefined,
    isArchived: booleanValue(row.isArchived, `${path}.isArchived`),
    sortOrder: 0,
    quickOptions: [],
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
    averageCycleLengthDays: optionalInteger(row.averageCycleLengthDays, `${path}.averageCycleLengthDays`),
    averagePeriodLengthDays: optionalInteger(row.averagePeriodLengthDays, `${path}.averagePeriodLengthDays`),
  };
}

function parseRecord(value: unknown, path: string, context: ParseContext): EventRecord {
  const row = asObject(value, path);
  const kind = check(`${path}.kind`, () => requireRecordKind(row.kind));
  const definitionId = entityId(row.definitionId, `${path}.definitionId`);
  const occurredAt = dateTime(row.occurredAt, `${path}.occurredAt`);
  const recordedAt = dateTime(row.recordedAt, `${path}.recordedAt`);
  // 领域规则：补录只能回到过去，发生时间不得晚于录入时间
  check(`${path}.occurredAt`, () => requireNotFuture(occurredAt, recordedAt, `${path}.occurredAt`));

  const snapshotRow = asObject(row.snapshot, `${path}.snapshot`);

  let snapshotFields: FieldSnapshot[] = parseArray(
    snapshotRow.fields,
    `${path}.snapshot.fields`,
    parseFieldSnapshot,
  );
  let fieldValues: FieldValue[] = parseArray(row.fieldValues, `${path}.fieldValues`, parseFieldValue);

  // v2 及以前：标签只有一份（snapshot_tag_ids），导出时 row.tagIds 与 snapshot.tagIds 本就同源；
  // 不一致说明文件被改坏了。折成「标签」字段的取值。
  const legacyTagIds = normalizeIdList(textList(row.tagIds, `${path}.tagIds`));
  const legacySnapshotTagIds = normalizeIdList(textList(snapshotRow.tagIds, `${path}.snapshot.tagIds`));
  if (legacyTagIds.join('\u0000') !== legacySnapshotTagIds.join('\u0000')) {
    fail(`${path}.tagIds`, '必须与 snapshot.tagIds 一致');
  }
  if (context.foldTags) {
    const tagField = context.legacyTagFields.get(definitionId);
    const names = resolveTagNames(legacyTagIds, context.legacyTagNames);
    if (tagField && names.length > 0) {
      snapshotFields = [{ id: tagField.id, name: '标签', kind: 'multi', options: tagField.options }];
      fieldValues = [{ fieldId: tagField.id, values: names }];
    } else {
      snapshotFields = [];
      fieldValues = [];
    }
  }

  const snapshot = {
    definitionId: entityId(snapshotRow.definitionId, `${path}.snapshot.definitionId`),
    name: name(snapshotRow.name, `${path}.snapshot.name`),
    kind: check(`${path}.snapshot.kind`, () => requireRecordKind(snapshotRow.kind)),
    attributes: parseAttributes(snapshotRow, `${path}.snapshot`, ['unit']),
    groupId: textOrUndefined(snapshotRow.groupId, `${path}.snapshot.groupId`),
    fields: snapshotFields,
  };
  if (snapshot.definitionId !== definitionId) {
    fail(`${path}.snapshot.definitionId`, `必须与 definitionId（${definitionId}）一致`);
  }
  if (snapshot.kind !== kind) {
    fail(`${path}.snapshot.kind`, `必须与 kind（${kind}）一致`);
  }

  return {
    id: entityId(row.id, `${path}.id`),
    definitionId,
    kind,
    value: check(`${path}.value`, () =>
      requireRecordValue(kind, numberValue(row.value, `${path}.value`), `${path}.value`),
    ),
    attributes: parseAttributes(row, path, ['unit']),
    fieldValues,
    occurredAt,
    recordedAt,
    note: textOrUndefined(row.note, `${path}.note`),
    source: check(`${path}.source`, () => requireRecordSource(row.source)),
    snapshot,
    deletedAt:
      row.deletedAt === undefined || row.deletedAt === null
        ? undefined
        : dateTime(row.deletedAt, `${path}.deletedAt`),
  };
}

function parseCycleInstance(value: unknown, path: string): CycleInstance {
  const row = asObject(value, path);
  const startDate = date(row.startDate, `${path}.startDate`);
  const endDate =
    row.endDate === undefined || row.endDate === null ? undefined : date(row.endDate, `${path}.endDate`);
  if (endDate !== undefined && endDate < startDate) {
    fail(`${path}.endDate`, `不能早于 startDate（${startDate}）`);
  }
  return {
    id: entityId(row.id, `${path}.id`),
    definitionId: entityId(row.definitionId, `${path}.definitionId`),
    startDate,
    endDate,
    note: textOrUndefined(row.note, `${path}.note`),
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
  };
}

function parseCycleEntry(value: unknown, path: string): CycleEntry {
  const row = asObject(value, path);
  return {
    id: entityId(row.id, `${path}.id`),
    instanceId: entityId(row.instanceId, `${path}.instanceId`),
    date: date(row.date, `${path}.date`),
    phase: textOrUndefined(row.phase, `${path}.phase`),
    symptoms: normalizeTextList(textList(row.symptoms, `${path}.symptoms`)),
    feelings: textOrUndefined(row.feelings, `${path}.feelings`),
    note: textOrUndefined(row.note, `${path}.note`),
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
    // 可选字段：v5 之前导出的备份没有这一项，缺失即「未删除」
    deletedAt:
      row.deletedAt === undefined || row.deletedAt === null
        ? undefined
        : dateTime(row.deletedAt, `${path}.deletedAt`),
  };
}

/** 主键唯一（同一集合里不能出现两条相同 id，否则写库必然撞主键） */
function assertUniqueIds(items: readonly { id: string }[], path: string): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      fail(`${path}[${index}].id`, `id 重复：${item.id}`);
    }
    seen.add(item.id);
  });
}

/**
 * 引用完整性检查：**写库之前**就要发现「指向不存在的东西」，
 * 而不是让 SQLite 的外键约束在中途报错（那样错误信息也说不清是哪一条）。
 */
export function assertBackupIntegrity(data: BackupData): void {
  assertUniqueIds(data.eventGroups, 'data.eventGroups');
  assertUniqueIds(data.eventDefinitions, 'data.eventDefinitions');
  assertUniqueIds(data.eventRecords, 'data.eventRecords');
  assertUniqueIds(data.cycleInstances, 'data.cycleInstances');
  assertUniqueIds(data.cycleEntries, 'data.cycleEntries');

  const groupIds = new Set(data.eventGroups.map((group) => group.id));
  data.eventDefinitions.forEach((definition, index) => {
    const path = `data.eventDefinitions[${index}]`;
    if (definition.groupId !== undefined && !groupIds.has(definition.groupId)) {
      fail(`${path}.groupId`, `指向不存在的分组：${definition.groupId}`);
    }
    assertUniqueIds(definition.fields, `${path}.fields`);
    // 周期型定义必须有做法，计数型不能带周期字段（与 v6 的结构约束一致）
    if (definition.kind === 'cycle' && definition.cycleMode === undefined) {
      fail(`${path}.cycleMode`, '周期型事件必须说明是自动循环还是手动标记');
    }
    if (definition.kind === 'counter' && definition.cycleMode !== undefined) {
      fail(`${path}.cycleMode`, '计数型事件不该带周期方式');
    }
    // 自定义字段只有计数型使用
    if (definition.kind === 'cycle' && definition.fields.length > 0) {
      fail(`${path}.fields`, '周期型事件不使用自定义字段');
    }
  });

  // 事件记录：字段取值必须都能在快照的字段定义里对上，且不为空（值要么不写，要么至少一个）。
  data.eventRecords.forEach((record, index) => {
    const path = `data.eventRecords[${index}]`;
    assertUniqueIds(record.snapshot.fields, `${path}.snapshot.fields`);
    check(`${path}.fieldValues`, () => {
      const normalized = normalizeFieldValues(record.snapshot.fields, record.fieldValues, {
        dropUnknownFields: false,
      });
      if (normalized.length !== record.fieldValues.length) {
        throw new ValidationError('字段取值不能为空（要么不写这一条，要么至少给一个值）');
      }
    });
  });

  const cycleDefinitionIds = new Set(
    data.eventDefinitions
      .filter((definition) => definition.kind === 'cycle')
      .map((definition) => definition.id),
  );
  data.cycleInstances.forEach((instance, index) => {
    if (!cycleDefinitionIds.has(instance.definitionId)) {
      fail(`data.cycleInstances[${index}].definitionId`, `指向不存在的周期型事件：${instance.definitionId}`);
    }
  });

  const instanceById = new Map(data.cycleInstances.map((instance) => [instance.id, instance]));
  const entryKeys = new Set<string>();
  data.cycleEntries.forEach((entry, index) => {
    const path = `data.cycleEntries[${index}]`;
    const instance = instanceById.get(entry.instanceId);
    if (!instance) {
      fail(`${path}.instanceId`, `指向不存在的周期实例：${entry.instanceId}`);
    }
    // 结构约束：同一天只能有一条记录（对应 UNIQUE(instance_id, date)）
    const key = `${entry.instanceId}\u0000${entry.date}`;
    if (entryKeys.has(key)) {
      fail(`${path}.date`, `同一实例下 ${entry.date} 已有记录`);
    }
    entryKeys.add(key);
    // 领域规则：周期记录的日期必须落在实例区间内（否则会变成「属于这个周期却在这个周期之外」的脏数据）
    // 例外：已软删除的记录可以落在区间外——软删除的记录不挡边界，边界缩走之后
    // 回收站里那条本来就在外面（restore 时会重新校验）。不放行的话，App 自己导出的备份
    // 会在导入时被自己拒绝。
    if (
      entry.deletedAt === undefined &&
      !isEntryWithinRange(entry.date, { startDate: instance.startDate, endDate: instance.endDate })
    ) {
      fail(
        `${path}.date`,
        `${entry.date} 不在周期实例的区间内（${instance.startDate} ~ ${instance.endDate ?? '进行中'}）`,
      );
    }
  });

  // 事件记录故意不校验 definitionId：v3 表没有外键，历史可以指向已被永久删除的定义
}

function parseBackupRoot(value: unknown): BackupFile {
  const root = asObject(value, '备份文件');

  if (root.format !== BACKUP_FORMAT) {
    fail('format', `不是 LifeTrack 备份文件（期望 "${BACKUP_FORMAT}"，实际 ${JSON.stringify(root.format)}）`);
  }
  const formatVersion = integerValue(root.formatVersion, 'formatVersion', 1);
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    fail(
      'formatVersion',
      `备份格式版本（${formatVersion}）高于当前应用支持的版本（${BACKUP_FORMAT_VERSION}），请先升级 LifeTrack`,
    );
  }

  const data = asObject(root.data, 'data');
  const context: ParseContext = {
    legacy: formatVersion < 2,
    foldTags: formatVersion < 3,
    legacyTagNames: new Map(),
    legacyTagFields: new Map(),
  };
  // v2 及以前才有独立的 `tags` 集合；先读出来，供定义 / 记录把标签折成字段时查名字。
  if (context.foldTags) {
    for (const tag of parseArray(data.tags, 'data.tags', parseLegacyTag)) {
      context.legacyTagNames.set(tag.id, tag.name);
    }
  }
  const definitions = parseArray(data.eventDefinitions, 'data.eventDefinitions', (item, itemPath) =>
    parseDefinition(item, itemPath, context),
  );
  // v1 备份里周期定义还是独立集合；折成「周期型事件定义」后并进同一个列表，
  // 这样「实例指向的定义」在同一个集合里，下面的引用完整性检查才说得清。
  const legacyCycles = parseArray(data.cycleDefinitions, 'data.cycleDefinitions', parseLegacyCycleDefinition);
  const parsed: BackupData = {
    eventGroups: parseArray(data.eventGroups, 'data.eventGroups', parseGroup),
    eventDefinitions: [...definitions, ...legacyCycles],
    eventRecords: parseArray(data.eventRecords, 'data.eventRecords', (item, itemPath) =>
      parseRecord(item, itemPath, context),
    ),
    cycleInstances: parseArray(data.cycleInstances, 'data.cycleInstances', parseCycleInstance),
    cycleEntries: parseArray(data.cycleEntries, 'data.cycleEntries', parseCycleEntry),
  };
  assertBackupIntegrity(parsed);

  return {
    format: BACKUP_FORMAT,
    formatVersion,
    schemaVersion: integerValue(root.schemaVersion, 'schemaVersion', 0),
    exportedAt: dateTime(root.exportedAt, 'exportedAt'),
    appVersion: textOrUndefined(root.appVersion, 'appVersion'),
    data: parsed,
  };
}

// ---------------------------------------------------------------------------
// 生成 / 序列化
// ---------------------------------------------------------------------------

function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** 固定排序：两次导出（或导入前后）可以逐行 diff。 */
export function sortBackupData(data: BackupData): BackupData {
  return {
    eventGroups: [...data.eventGroups].sort(
      (a, b) => a.sortOrder - b.sortOrder || compareText(a.name, b.name) || compareText(a.id, b.id),
    ),
    eventDefinitions: [...data.eventDefinitions].sort(
      (a, b) => a.sortOrder - b.sortOrder || compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id),
    ),
    // 历史按发生时间正序（档案顺序），id 作为并列时的稳定次序
    eventRecords: [...data.eventRecords].sort(
      (a, b) => compareText(a.occurredAt, b.occurredAt) || compareText(a.id, b.id),
    ),
    cycleInstances: [...data.cycleInstances].sort(
      (a, b) => compareText(a.startDate, b.startDate) || compareText(a.id, b.id),
    ),
    cycleEntries: [...data.cycleEntries].sort(
      (a, b) => compareText(a.date, b.date) || compareText(a.id, b.id),
    ),
  };
}

export interface CreateBackupOptions {
  /** 导出时的数据库 schema 版本（由调用方传入，领域层不依赖 db 层） */
  schemaVersion: number;
  exportedAt: IsoDateTime;
  appVersion?: string;
}

export function createBackup(data: BackupData, options: CreateBackupOptions): BackupFile {
  if (!Number.isInteger(options.schemaVersion) || options.schemaVersion < 0) {
    throw new ValidationError(`schemaVersion 必须是 ≥ 0 的整数：${String(options.schemaVersion)}`);
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: options.schemaVersion,
    exportedAt: requireIsoDateTime(options.exportedAt, '导出时间'),
    appVersion: optionalText(options.appVersion),
    data: sortBackupData(data),
  };
}

/** 序列化成可读（缩进）的 JSON；`undefined` 字段自动省略，输出稳定。 */
export function serializeBackup(file: BackupFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 默认文件名的主干：备份（可恢复）与记录表格（只读）分开，用户一眼能区分。 */
const BACKUP_FILE_STEM = 'lifetrack-backup';
const RECORDS_FILE_STEM = 'lifetrack-records';

/**
 * 默认文件名，例如 `lifetrack-backup-2026-10-22.json`。
 *
 * 日期取导出时间戳的日期部分（UTC，与备份内部的 ISO 文本一致），
 * 所以同一份备份在任何设备上命名都一样；命名规则属于「备份格式契约」的一部分，
 * 放在领域层，界面只负责用它。
 */
export function backupFileName(exportedAt: IsoDateTime, extension: 'json' | 'csv'): string {
  const date = exportedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError(`导出时间不是合法的 ISO-8601 时间：${exportedAt}`);
  }
  return `${extension === 'json' ? BACKUP_FILE_STEM : RECORDS_FILE_STEM}-${date}.${extension}`;
}

/** 解析备份文本：JSON 语法错误、格式不符、字段非法都收敛为 ImportError。 */
export function parseBackup(source: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (error) {
    throw new ImportError('备份文件不是合法的 JSON', { cause: error });
  }
  return parseBackupRoot(raw);
}

/** 版本兼容检查：备份来自更新版本时只能让用户先升级应用。 */
export function assertBackupCompatible(file: BackupFile, maxSchemaVersion: number): void {
  if (file.formatVersion > BACKUP_FORMAT_VERSION) {
    fail(
      'formatVersion',
      `备份格式版本（${file.formatVersion}）高于当前应用支持的版本（${BACKUP_FORMAT_VERSION}），请先升级 LifeTrack`,
    );
  }
  if (!Number.isInteger(file.schemaVersion) || file.schemaVersion < 0) {
    fail('schemaVersion', `必须是 ≥ 0 的整数：${String(file.schemaVersion)}`);
  }
  if (file.schemaVersion > maxSchemaVersion) {
    fail(
      'schemaVersion',
      `备份来自更新版本的应用（schema v${file.schemaVersion}，当前支持 v${maxSchemaVersion}），请先升级 LifeTrack`,
    );
  }
}

// ---------------------------------------------------------------------------
// 合并
// ---------------------------------------------------------------------------

/** 判断「备份里的这一份」是否应当覆盖本地那一份。 */
type PreferIncoming<T> = (local: T, incoming: T) => boolean;

function byUpdatedAt(local: { updatedAt: IsoDateTime }, incoming: { updatedAt: IsoDateTime }): boolean {
  const localTime = Date.parse(local.updatedAt);
  const incomingTime = Date.parse(incoming.updatedAt);
  if (!Number.isFinite(localTime) || !Number.isFinite(incomingTime)) {
    // 时间不可解析时按字符串比较（至少是确定性的），不抛错打断整次导入
    return incoming.updatedAt > local.updatedAt;
  }
  return incomingTime > localTime;
}

/**
 * 事件记录是不可篡改的历史，没有 `updatedAt`，唯一的变量是软删除标记。
 *
 * 合并规则：**「已删除」视为后发生的状态**——备份里标记了删除而本地没有，就采用删除；
 * 两边都删除但时间不同时取更早的那个（与 `softDelete` 幂等语义保持一致，删除时间不漂移）；
 * 其余情况一律保留本地。
 */
function preferIncomingRecord(local: EventRecord, incoming: EventRecord): boolean {
  if (local.deletedAt === undefined && incoming.deletedAt !== undefined) {
    return true;
  }
  if (local.deletedAt !== undefined && incoming.deletedAt !== undefined) {
    const localTime = Date.parse(local.deletedAt);
    const incomingTime = Date.parse(incoming.deletedAt);
    if (Number.isFinite(localTime) && Number.isFinite(incomingTime)) {
      return incomingTime < localTime;
    }
    return incoming.deletedAt < local.deletedAt;
  }
  return false;
}

function mergeCollection<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
  preferIncoming: PreferIncoming<T>,
): { items: T[]; counts: MergeCounts } {
  const byId = new Map<string, T>();
  for (const item of current) {
    byId.set(item.id, item);
  }
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const local = byId.get(item.id);
    if (!local) {
      byId.set(item.id, item);
      added += 1;
      continue;
    }
    if (preferIncoming(local, item)) {
      byId.set(item.id, item);
      updated += 1;
    }
  }
  return { items: [...byId.values()], counts: { added, updated, kept: current.length - updated } };
}

/**
 * 把备份合并进本地数据：**结果 = 本地 ∪ 备份**，本地独有的数据一定保留。
 * 纯函数，不修改入参。
 */
export function mergeBackup(
  current: BackupData,
  incoming: BackupData,
): { data: BackupData; summary: ImportSummary } {
  const groups = mergeCollection(current.eventGroups, incoming.eventGroups, byUpdatedAt);
  const definitions = mergeCollection(current.eventDefinitions, incoming.eventDefinitions, byUpdatedAt);
  const records = mergeCollection(current.eventRecords, incoming.eventRecords, preferIncomingRecord);
  const cycleInstances = mergeCollection(current.cycleInstances, incoming.cycleInstances, byUpdatedAt);
  const cycleEntries = mergeCollection(current.cycleEntries, incoming.cycleEntries, byUpdatedAt);

  const collections: Record<BackupCollection, MergeCounts> = {
    eventGroups: groups.counts,
    eventDefinitions: definitions.counts,
    eventRecords: records.counts,
    cycleInstances: cycleInstances.counts,
    cycleEntries: cycleEntries.counts,
  };

  return {
    data: sortBackupData({
      eventGroups: groups.items,
      eventDefinitions: definitions.items,
      eventRecords: records.items,
      cycleInstances: cycleInstances.items,
      cycleEntries: cycleEntries.items,
    }),
    summary: {
      collections,
      totals: BACKUP_COLLECTIONS.reduce<MergeCounts>(
        (total, collection) => {
          const counts = collections[collection];
          return {
            added: total.added + counts.added,
            updated: total.updated + counts.updated,
            kept: total.kept + counts.kept,
          };
        },
        { added: 0, updated: 0, kept: 0 },
      ),
    },
  };
}
