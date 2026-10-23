/**
 * 事件定义仓储（event_definitions + quick_options + event_definition_tags）。
 *
 * 这是事件定义功能的聚合根：对外返回带「快捷选项」与「标签 id」的完整 EventDefinition，
 * 调用方（界面/业务层）不需要知道底层是三张表。
 *
 * 关键约定：
 * - 创建/更新是多表写入，整体包在**独占事务**里，避免出现「定义写了、快捷选项没写」的半成品。
 * - 更新是**整体替换**语义：草稿里的快捷选项与标签就是最终状态，多余的会被删除。
 * - 归档是 UPDATE is_archived，不删行、不影响历史（历史记录本就在另一张表，不属于本项范围）。
 * - 从库里读回的 kind 会再过一次 isEventDefinitionKind 守卫（泛型运行时不校验）。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor } from '@/db/types';
import { NotFoundError, StorageError, ValidationError } from '@/domain/errors';
import { newId } from '@/domain/id';
import {
  isEventDefinitionKind,
  type CycleMode,
  type EventDefinition,
  type EventDefinitionKind,
  type IsoDateTime,
  type QuickOption,
} from '@/domain/models';
import {
  normalizeIdList,
  normalizeTextList,
  optionalCycleMode,
  optionalPositiveInteger,
  optionalText,
  readTextList,
  requireKind,
  requireName,
  requireQuickOptionValue,
  requireSortOrder,
  type EventDefinitionDraft,
  type QuickOptionInput,
} from '@/domain/validation';

interface DefinitionRow {
  id: string;
  name: string;
  kind: string;
  attributes: string;
  group_id: string | null;
  color: string | null;
  icon: string | null;
  is_archived: number;
  sort_order: number;
  cycle_mode: string | null;
  average_cycle_length_days: number | null;
  average_period_length_days: number | null;
  created_at: string;
  updated_at: string;
}

interface QuickOptionRow {
  id: string;
  definition_id: string;
  attribute: string | null;
  value: number;
  sort_order: number;
}

interface DefinitionTagRow {
  definition_id: string;
  tag_id: string;
}

const DEFINITION_COLUMNS =
  'id, name, kind, attributes, group_id, color, icon, is_archived, sort_order, cycle_mode, average_cycle_length_days, average_period_length_days, created_at, updated_at';

/** 生成 IN (?, ?, ...) 的占位符，个数与传入 id 数量一致。 */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/** 读库得到的 kind 必须再过一次守卫，非法值宁可报错也不猜。 */
function toKind(value: unknown): EventDefinitionKind {
  if (!isEventDefinitionKind(value)) {
    throw new ValidationError(`事件定义的类型字段不合法：${String(value)}`);
  }
  return value;
}

function toDefinition(row: DefinitionRow, quickOptions: QuickOption[], tagIds: string[]): EventDefinition {
  return {
    id: row.id,
    name: row.name,
    kind: toKind(row.kind),
    attributes: readTextList(row.attributes),
    groupId: row.group_id ?? undefined,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    quickOptions,
    tagIds,
    isArchived: row.is_archived === 1,
    sortOrder: row.sort_order,
    cycleMode: optionalCycleMode(row.cycle_mode),
    averageCycleLengthDays: row.average_cycle_length_days ?? undefined,
    averagePeriodLengthDays: row.average_period_length_days ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 批量读取快捷选项并按 definition_id 分组，避免 N+1。 */
async function loadQuickOptions(
  db: SqlExecutor,
  definitionIds: readonly string[],
): Promise<Map<string, QuickOption[]>> {
  const grouped = new Map<string, QuickOption[]>();
  if (definitionIds.length === 0) {
    return grouped;
  }
  const rows = await db.getAllAsync<QuickOptionRow>(
    `SELECT id, definition_id, attribute, value, sort_order
       FROM quick_options
      WHERE definition_id IN (${placeholders(definitionIds.length)})
      ORDER BY sort_order ASC, id ASC`,
    ...definitionIds,
  );
  for (const row of rows) {
    const list = grouped.get(row.definition_id) ?? [];
    list.push({
      id: row.id,
      attribute: row.attribute ?? undefined,
      value: row.value,
      sortOrder: row.sort_order,
    });
    grouped.set(row.definition_id, list);
  }
  return grouped;
}

/** 批量读取「定义 → 标签」关联，按定义分组。 */
async function loadTagIds(db: SqlExecutor, definitionIds: readonly string[]): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (definitionIds.length === 0) {
    return grouped;
  }
  const rows = await db.getAllAsync<DefinitionTagRow>(
    `SELECT definition_id, tag_id
       FROM event_definition_tags
      WHERE definition_id IN (${placeholders(definitionIds.length)})
      ORDER BY tag_id ASC`,
    ...definitionIds,
  );
  for (const row of rows) {
    const list = grouped.get(row.definition_id) ?? [];
    list.push(row.tag_id);
    grouped.set(row.definition_id, list);
  }
  return grouped;
}

/** 校验并规整快捷选项输入：一条就是「属性 + 取值」（属性可省略）。 */
function normalizeQuickOptions(
  kind: EventDefinitionKind,
  inputs: readonly QuickOptionInput[],
): QuickOptionInput[] {
  return inputs.map((input) => ({
    id: input.id,
    attribute: optionalText(input.attribute),
    value: requireQuickOptionValue(kind, input.value),
    sortOrder: requireSortOrder(input.sortOrder ?? 0),
  }));
}

/** 草稿规整后的落库形态。 */
interface NormalizedDraft {
  name: string;
  kind: EventDefinitionKind;
  attributes: string[];
  groupId: string | undefined;
  color: string | undefined;
  icon: string | undefined;
  tagIds: string[];
  quickOptions: QuickOptionInput[];
  sortOrder: number;
  cycleMode: CycleMode | undefined;
  averageCycleLengthDays: number | undefined;
  averagePeriodLengthDays: number | undefined;
}

/**
 * 草稿 → 可直接落库的规整结果。
 *
 * 两种类型各管各的字段，规则在这里收口，`create` 与 `update` 共用同一份判断：
 * - 计数型：允许快捷选项，**不允许**带周期字段；
 * - 周期型：必须有一种做法（省略按「手动标记」兜底），带周期长度与持续天数，
 *   不使用快捷选项（周期记的是「哪一天」，不是「点了几次」）。
 */
function normalizeDraft(draft: EventDefinitionDraft): NormalizedDraft {
  const name = requireName(draft.name, '事件名称');
  const kind = requireKind(draft.kind);
  const groupId = optionalText(draft.groupId);
  const color = optionalText(draft.color);
  const icon = optionalText(draft.icon);
  const tagIds = normalizeIdList(draft.tagIds);
  const sortOrder = requireSortOrder(draft.sortOrder ?? 0);

  if (kind === 'counter') {
    return {
      name,
      kind,
      attributes: normalizeTextList(draft.attributes ?? []),
      groupId,
      color,
      icon,
      tagIds,
      quickOptions: normalizeQuickOptions(kind, draft.quickOptions),
      sortOrder,
      cycleMode: undefined,
      averageCycleLengthDays: undefined,
      averagePeriodLengthDays: undefined,
    };
  }

  return {
    name,
    kind,
    // 周期型不使用属性：周期记的是「哪一天」，不是「一次是什么」。
    attributes: [],
    groupId,
    color,
    icon,
    tagIds,
    quickOptions: [],
    sortOrder,
    cycleMode: optionalCycleMode(draft.cycleMode) ?? 'manual',
    averageCycleLengthDays: optionalPositiveInteger(draft.averageCycleLengthDays, '周期长度'),
    averagePeriodLengthDays: optionalPositiveInteger(draft.averagePeriodLengthDays, '持续天数'),
  };
}

async function insertQuickOptions(
  db: SqlExecutor,
  definitionId: string,
  options: readonly QuickOptionInput[],
): Promise<void> {
  for (const option of options) {
    await db.runAsync(
      `INSERT INTO quick_options (id, definition_id, attribute, value, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      option.id ?? newId(),
      definitionId,
      option.attribute ?? null,
      option.value,
      option.sortOrder ?? 0,
    );
  }
}

async function insertTags(db: SqlExecutor, definitionId: string, tagIds: readonly string[]): Promise<void> {
  for (const tagId of tagIds) {
    await db.runAsync(
      `INSERT INTO event_definition_tags (definition_id, tag_id) VALUES (?, ?)`,
      definitionId,
      tagId,
    );
  }
}

export class EventDefinitionRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  /** 默认只返回未归档的定义；includeArchived 为 true 时全部返回。 */
  async list(options: { includeArchived?: boolean } = {}): Promise<EventDefinition[]> {
    return guard('读取事件定义', async () => {
      const where = options.includeArchived ? '' : 'WHERE is_archived = 0';
      const rows = await this.db.getAllAsync<DefinitionRow>(
        `SELECT ${DEFINITION_COLUMNS}
           FROM event_definitions
           ${where}
          ORDER BY sort_order ASC, created_at ASC, id ASC`,
      );
      return this.hydrate(rows);
    });
  }

  async getById(id: string): Promise<EventDefinition | null> {
    return guard('读取事件定义', async () => this.readOne(id));
  }

  async create(
    draft: EventDefinitionDraft,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<EventDefinition> {
    const normalized = normalizeDraft(draft);
    const id = newId();

    return guard('创建事件定义', async () => {
      await this.db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync(
          `INSERT INTO event_definitions
             (id, name, kind, attributes, group_id, color, icon, is_archived, sort_order,
              cycle_mode, average_cycle_length_days, average_period_length_days, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
          id,
          normalized.name,
          normalized.kind,
          JSON.stringify(normalized.attributes),
          normalized.groupId ?? null,
          normalized.color ?? null,
          normalized.icon ?? null,
          normalized.sortOrder,
          normalized.cycleMode ?? null,
          normalized.averageCycleLengthDays ?? null,
          normalized.averagePeriodLengthDays ?? null,
          now,
          now,
        );
        await insertQuickOptions(txn, id, normalized.quickOptions);
        await insertTags(txn, id, normalized.tagIds);
      });
      return this.mustReadOne(id);
    });
  }

  /** 整体替换定义本身、快捷选项与标签关联。 */
  async update(
    id: string,
    draft: EventDefinitionDraft,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<EventDefinition> {
    const normalized = normalizeDraft(draft);

    return guard('更新事件定义', async () => {
      await this.db.withExclusiveTransactionAsync(async (txn) => {
        const result = await txn.runAsync(
          `UPDATE event_definitions
              SET name = ?, kind = ?, attributes = ?, group_id = ?, color = ?, icon = ?,
                  sort_order = ?, cycle_mode = ?, average_cycle_length_days = ?,
                  average_period_length_days = ?, updated_at = ?
            WHERE id = ?`,
          normalized.name,
          normalized.kind,
          JSON.stringify(normalized.attributes),
          normalized.groupId ?? null,
          normalized.color ?? null,
          normalized.icon ?? null,
          normalized.sortOrder,
          normalized.cycleMode ?? null,
          normalized.averageCycleLengthDays ?? null,
          normalized.averagePeriodLengthDays ?? null,
          now,
          id,
        );
        if (result.changes === 0) {
          throw new NotFoundError(`事件定义不存在：${id}`);
        }
        // 整体替换：先清掉旧的子表数据，再按草稿重建
        await txn.runAsync('DELETE FROM quick_options WHERE definition_id = ?', id);
        await txn.runAsync('DELETE FROM event_definition_tags WHERE definition_id = ?', id);
        await insertQuickOptions(txn, id, normalized.quickOptions);
        await insertTags(txn, id, normalized.tagIds);
      });
      return this.mustReadOne(id);
    });
  }

  /** 归档 / 取消归档：只改标记，不删任何行。 */
  async setArchived(
    id: string,
    archived: boolean,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<void> {
    return guard(archived ? '归档事件定义' : '取消归档事件定义', async () => {
      const result = await this.db.runAsync(
        `UPDATE event_definitions SET is_archived = ?, updated_at = ? WHERE id = ?`,
        archived ? 1 : 0,
        now,
        id,
      );
      if (result.changes === 0) {
        throw new NotFoundError(`事件定义不存在：${id}`);
      }
    });
  }

  /**
   * 永久删除事件定义：级联清理快捷选项与标签关联（数据库外键负责）。
   * 调用方（界面）必须先做二次确认。历史记录不受影响。
   */
  async remove(id: string): Promise<void> {
    return guard('删除事件定义', async () => {
      const result = await this.db.runAsync('DELETE FROM event_definitions WHERE id = ?', id);
      if (result.changes === 0) {
        throw new NotFoundError(`事件定义不存在：${id}`);
      }
    });
  }

  private async hydrate(rows: readonly DefinitionRow[]): Promise<EventDefinition[]> {
    const ids = rows.map((row) => row.id);
    const [quickOptions, tagIds] = await Promise.all([
      loadQuickOptions(this.db, ids),
      loadTagIds(this.db, ids),
    ]);
    return rows.map((row) => toDefinition(row, quickOptions.get(row.id) ?? [], tagIds.get(row.id) ?? []));
  }

  private async readOne(id: string): Promise<EventDefinition | null> {
    const row = await this.db.getFirstAsync<DefinitionRow>(
      `SELECT ${DEFINITION_COLUMNS} FROM event_definitions WHERE id = ?`,
      id,
    );
    if (!row) {
      return null;
    }
    const [hydrated] = await this.hydrate([row]);
    return hydrated ?? null;
  }

  private async mustReadOne(id: string): Promise<EventDefinition> {
    const definition = await this.readOne(id);
    if (!definition) {
      throw new StorageError(`写入后无法读回事件定义：${id}`);
    }
    return definition;
  }
}
