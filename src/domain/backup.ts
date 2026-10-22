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
 * 3. **引用完整性在写库之前就查**：分组 / 标签 / 周期实例的指向必须存在。
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
import { assertUuidV7 } from './id';
import {
  type CycleDefinition,
  type CycleEntry,
  type CycleInstance,
  type EventDefinition,
  type EventGroup,
  type EventRecord,
  type IsoDateTime,
  type QuickOption,
  type Tag,
} from './models';
import {
  normalizeIdList,
  normalizeTextList,
  optionalPositiveInteger,
  optionalText,
  requireIsoDate,
  requireIsoDateTime,
  requireKind,
  requireName,
  requireNotFuture,
  requireQuickOptionValue,
  requireRecordSource,
  requireRecordValue,
  requireSortOrder,
} from './validation';

/** 备份文件的标识字符串，用来拒绝「不是本应用导出」的 JSON */
export const BACKUP_FORMAT = 'lifetrack-backup';

/** 备份**格式**版本（数据结构本身的版本，与数据库 schema 版本是两件事） */
export const BACKUP_FORMAT_VERSION = 1;

/** 备份里包含的七个集合，顺序即写入顺序（父表在前） */
export const BACKUP_COLLECTIONS = [
  'eventGroups',
  'tags',
  'eventDefinitions',
  'eventRecords',
  'cycleDefinitions',
  'cycleInstances',
  'cycleEntries',
] as const;

export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

/** 备份的正文：与仓储层的领域模型一一对应（不含 app_meta 这类本机元信息） */
export interface BackupData {
  eventGroups: EventGroup[];
  tags: Tag[];
  eventDefinitions: EventDefinition[];
  eventRecords: EventRecord[];
  cycleDefinitions: CycleDefinition[];
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
    tags: [],
    eventDefinitions: [],
    eventRecords: [],
    cycleDefinitions: [],
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

function uuid(value: unknown, path: string): string {
  return check(path, () => assertUuidV7(text(value, path), path));
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
    id: uuid(row.id, `${path}.id`),
    name: name(row.name, `${path}.name`),
    color: textOrUndefined(row.color, `${path}.color`),
    sortOrder: check(`${path}.sortOrder`, () =>
      requireSortOrder(numberValue(row.sortOrder, `${path}.sortOrder`)),
    ),
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
  };
}

function parseTag(value: unknown, path: string): Tag {
  const row = asObject(value, path);
  return {
    id: uuid(row.id, `${path}.id`),
    name: name(row.name, `${path}.name`),
    color: textOrUndefined(row.color, `${path}.color`),
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
  };
}

function parseQuickOption(value: unknown, path: string, kind: EventDefinition['kind']): QuickOption {
  const row = asObject(value, path);
  return {
    id: uuid(row.id, `${path}.id`),
    label: name(row.label, `${path}.label`),
    value: check(`${path}.value`, () =>
      requireQuickOptionValue(kind, numberValue(row.value, `${path}.value`), `${path}.value`),
    ),
    unit: textOrUndefined(row.unit, `${path}.unit`),
    sortOrder: check(`${path}.sortOrder`, () =>
      requireSortOrder(numberValue(row.sortOrder, `${path}.sortOrder`)),
    ),
  };
}

function parseDefinition(value: unknown, path: string): EventDefinition {
  const row = asObject(value, path);
  const kind = check(`${path}.kind`, () => requireKind(row.kind));
  return {
    id: uuid(row.id, `${path}.id`),
    name: name(row.name, `${path}.name`),
    kind,
    unit: textOrUndefined(row.unit, `${path}.unit`),
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
    tagIds: normalizeIdList(textList(row.tagIds, `${path}.tagIds`)),
  };
}

function parseRecord(value: unknown, path: string): EventRecord {
  const row = asObject(value, path);
  const kind = check(`${path}.kind`, () => requireKind(row.kind));
  const definitionId = uuid(row.definitionId, `${path}.definitionId`);
  const occurredAt = dateTime(row.occurredAt, `${path}.occurredAt`);
  const recordedAt = dateTime(row.recordedAt, `${path}.recordedAt`);
  // 领域规则：补录只能回到过去，发生时间不得晚于录入时间
  check(`${path}.occurredAt`, () => requireNotFuture(occurredAt, recordedAt, `${path}.occurredAt`));

  const snapshotRow = asObject(row.snapshot, `${path}.snapshot`);
  const snapshot = {
    definitionId: uuid(snapshotRow.definitionId, `${path}.snapshot.definitionId`),
    name: name(snapshotRow.name, `${path}.snapshot.name`),
    kind: check(`${path}.snapshot.kind`, () => requireKind(snapshotRow.kind)),
    unit: textOrUndefined(snapshotRow.unit, `${path}.snapshot.unit`),
    groupId: textOrUndefined(snapshotRow.groupId, `${path}.snapshot.groupId`),
    tagIds: normalizeIdList(textList(snapshotRow.tagIds, `${path}.snapshot.tagIds`)),
  };
  if (snapshot.definitionId !== definitionId) {
    fail(`${path}.snapshot.definitionId`, `必须与 definitionId（${definitionId}）一致`);
  }
  if (snapshot.kind !== kind) {
    fail(`${path}.snapshot.kind`, `必须与 kind（${kind}）一致`);
  }

  const tagIds = normalizeIdList(textList(row.tagIds, `${path}.tagIds`));
  // 记录表里标签只有一份（snapshot_tag_ids），读取时两者本就同源；不一致说明文件被改坏了
  if (tagIds.join('\u0000') !== snapshot.tagIds.join('\u0000')) {
    fail(`${path}.tagIds`, '必须与 snapshot.tagIds 一致');
  }

  return {
    id: uuid(row.id, `${path}.id`),
    definitionId,
    kind,
    value: check(`${path}.value`, () =>
      requireRecordValue(kind, numberValue(row.value, `${path}.value`), `${path}.value`),
    ),
    unit: textOrUndefined(row.unit, `${path}.unit`),
    occurredAt,
    recordedAt,
    note: textOrUndefined(row.note, `${path}.note`),
    source: check(`${path}.source`, () => requireRecordSource(row.source)),
    tagIds,
    snapshot,
    deletedAt:
      row.deletedAt === undefined || row.deletedAt === null
        ? undefined
        : dateTime(row.deletedAt, `${path}.deletedAt`),
  };
}

function parseCycleDefinition(value: unknown, path: string): CycleDefinition {
  const row = asObject(value, path);
  return {
    id: uuid(row.id, `${path}.id`),
    name: name(row.name, `${path}.name`),
    averageCycleLengthDays: check(`${path}.averageCycleLengthDays`, () =>
      optionalPositiveInteger(
        row.averageCycleLengthDays === null || row.averageCycleLengthDays === undefined
          ? undefined
          : numberValue(row.averageCycleLengthDays, `${path}.averageCycleLengthDays`),
        `${path}.averageCycleLengthDays`,
      ),
    ),
    averagePeriodLengthDays: check(`${path}.averagePeriodLengthDays`, () =>
      optionalPositiveInteger(
        row.averagePeriodLengthDays === null || row.averagePeriodLengthDays === undefined
          ? undefined
          : numberValue(row.averagePeriodLengthDays, `${path}.averagePeriodLengthDays`),
        `${path}.averagePeriodLengthDays`,
      ),
    ),
    isArchived: booleanValue(row.isArchived, `${path}.isArchived`),
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
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
    id: uuid(row.id, `${path}.id`),
    definitionId: uuid(row.definitionId, `${path}.definitionId`),
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
    id: uuid(row.id, `${path}.id`),
    instanceId: uuid(row.instanceId, `${path}.instanceId`),
    date: date(row.date, `${path}.date`),
    phase: textOrUndefined(row.phase, `${path}.phase`),
    symptoms: normalizeTextList(textList(row.symptoms, `${path}.symptoms`)),
    feelings: textOrUndefined(row.feelings, `${path}.feelings`),
    note: textOrUndefined(row.note, `${path}.note`),
    createdAt: dateTime(row.createdAt, `${path}.createdAt`),
    updatedAt: dateTime(row.updatedAt, `${path}.updatedAt`),
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
  assertUniqueIds(data.tags, 'data.tags');
  assertUniqueIds(data.eventDefinitions, 'data.eventDefinitions');
  assertUniqueIds(data.eventRecords, 'data.eventRecords');
  assertUniqueIds(data.cycleDefinitions, 'data.cycleDefinitions');
  assertUniqueIds(data.cycleInstances, 'data.cycleInstances');
  assertUniqueIds(data.cycleEntries, 'data.cycleEntries');

  const groupIds = new Set(data.eventGroups.map((group) => group.id));
  const tagIds = new Set(data.tags.map((tag) => tag.id));
  data.eventDefinitions.forEach((definition, index) => {
    const path = `data.eventDefinitions[${index}]`;
    if (definition.groupId !== undefined && !groupIds.has(definition.groupId)) {
      fail(`${path}.groupId`, `指向不存在的分组：${definition.groupId}`);
    }
    for (const tagId of definition.tagIds) {
      if (!tagIds.has(tagId)) {
        fail(`${path}.tagIds`, `指向不存在的标签：${tagId}`);
      }
    }
  });

  const cycleDefinitionIds = new Set(data.cycleDefinitions.map((definition) => definition.id));
  data.cycleInstances.forEach((instance, index) => {
    if (!cycleDefinitionIds.has(instance.definitionId)) {
      fail(`data.cycleInstances[${index}].definitionId`, `指向不存在的周期定义：${instance.definitionId}`);
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
    if (!isEntryWithinRange(entry.date, { startDate: instance.startDate, endDate: instance.endDate })) {
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
  const parsed: BackupData = {
    eventGroups: parseArray(data.eventGroups, 'data.eventGroups', parseGroup),
    tags: parseArray(data.tags, 'data.tags', parseTag),
    eventDefinitions: parseArray(data.eventDefinitions, 'data.eventDefinitions', parseDefinition),
    eventRecords: parseArray(data.eventRecords, 'data.eventRecords', parseRecord),
    cycleDefinitions: parseArray(data.cycleDefinitions, 'data.cycleDefinitions', parseCycleDefinition),
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
    tags: [...data.tags].sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id)),
    eventDefinitions: [...data.eventDefinitions].sort(
      (a, b) => a.sortOrder - b.sortOrder || compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id),
    ),
    // 历史按发生时间正序（档案顺序），id 作为并列时的稳定次序
    eventRecords: [...data.eventRecords].sort(
      (a, b) => compareText(a.occurredAt, b.occurredAt) || compareText(a.id, b.id),
    ),
    cycleDefinitions: [...data.cycleDefinitions].sort(
      (a, b) => compareText(a.name, b.name) || compareText(a.id, b.id),
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
  const tags = mergeCollection(current.tags, incoming.tags, byUpdatedAt);
  const definitions = mergeCollection(current.eventDefinitions, incoming.eventDefinitions, byUpdatedAt);
  const records = mergeCollection(current.eventRecords, incoming.eventRecords, preferIncomingRecord);
  const cycleDefinitions = mergeCollection(current.cycleDefinitions, incoming.cycleDefinitions, byUpdatedAt);
  const cycleInstances = mergeCollection(current.cycleInstances, incoming.cycleInstances, byUpdatedAt);
  const cycleEntries = mergeCollection(current.cycleEntries, incoming.cycleEntries, byUpdatedAt);

  const collections: Record<BackupCollection, MergeCounts> = {
    eventGroups: groups.counts,
    tags: tags.counts,
    eventDefinitions: definitions.counts,
    eventRecords: records.counts,
    cycleDefinitions: cycleDefinitions.counts,
    cycleInstances: cycleInstances.counts,
    cycleEntries: cycleEntries.counts,
  };

  return {
    data: sortBackupData({
      eventGroups: groups.items,
      tags: tags.items,
      eventDefinitions: definitions.items,
      eventRecords: records.items,
      cycleDefinitions: cycleDefinitions.items,
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
