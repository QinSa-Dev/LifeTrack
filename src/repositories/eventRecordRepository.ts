/**
 * 事件历史记录仓储（event_records）。
 *
 * 职责：把「用户记录了一次事实」落库。核心领域规则在这里被强制执行：
 *
 * 1. **记录时生成快照**：从当前的事件定义取出名称、单位、分组、标签，固化进记录。
 *    之后定义改名/换单位/归档/删除，历史都保持原样（见 domain/models.ts 的 snapshot）。
 * 2. **归档不可新增记录**：`isRecordable` 为假时抛 ConflictError，历史不受影响。
 * 3. **读用 `occurred_at` 排序**（事实发生时间），而不是 `recorded_at`（录入时间）——
 *    这样补录的旧记录会落在时间轴的正确位置。
 * 4. **补录只能回到过去**：`occurredAt` 允许早于 `recordedAt`，但不允许晚于它
 *    （未来还没发生，不构成事实）。
 * 5. **删除分两级**：`softDelete` 只写 `deleted_at`（可 `restore` 撤销），真删是 `remove`，
 *    不可撤销、需要界面二次确认。两者划分清楚，避免「以为能撤销，其实是真删」。
 *
 * 读取时 `kind` / `source` 都会再过一次守卫（泛型运行时不校验）。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor, SqlParam } from '@/db/types';
import { ConflictError, NotFoundError, StorageError, ValidationError } from '@/domain/errors';
import { newId } from '@/domain/id';
import {
  isEventDefinitionKind,
  isRecordSource,
  type EventDefinitionKind,
  type EventDefinitionSnapshot,
  type EventRecord,
  type IsoDateTime,
  type RecordSource,
} from '@/domain/models';
import {
  optionalText,
  requireId,
  requireIsoDateTime,
  requireNotFuture,
  requireRecordSource,
  requireRecordValue,
  type EventRecordInput,
} from '@/domain/validation';

interface RecordRow {
  id: string;
  definition_id: string;
  kind: string;
  value: number;
  unit: string | null;
  occurred_at: string;
  recorded_at: string;
  note: string | null;
  source: string;
  deleted_at: string | null;
  snapshot_name: string;
  snapshot_unit: string | null;
  snapshot_group_id: string | null;
  snapshot_tag_ids: string;
}

interface DefinitionRow {
  id: string;
  name: string;
  kind: string;
  unit: string | null;
  group_id: string | null;
  is_archived: number;
}

interface TagIdRow {
  tag_id: string;
}

const SELECT_COLUMNS =
  'id, definition_id, kind, value, unit, occurred_at, recorded_at, note, source, deleted_at, ' +
  'snapshot_name, snapshot_unit, snapshot_group_id, snapshot_tag_ids';

function toKind(value: unknown): EventDefinitionKind {
  if (!isEventDefinitionKind(value)) {
    throw new ValidationError(`事件记录的类型字段不合法：${String(value)}`);
  }
  return value;
}

function toSource(value: unknown): RecordSource {
  if (!isRecordSource(value)) {
    throw new ValidationError(`事件记录的来源字段不合法：${String(value)}`);
  }
  return value;
}

/** snapshot_tag_ids 是 JSON 数组文本；解析失败时退化为空数组，而不是让整行读不出来。 */
function parseTagIds(json: string): string[] {
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

function toRecord(row: RecordRow): EventRecord {
  const kind = toKind(row.kind);
  const tagIds = parseTagIds(row.snapshot_tag_ids);
  const snapshot: EventDefinitionSnapshot = {
    definitionId: row.definition_id,
    name: row.snapshot_name,
    kind,
    unit: row.snapshot_unit ?? undefined,
    groupId: row.snapshot_group_id ?? undefined,
    tagIds,
  };
  return {
    id: row.id,
    definitionId: row.definition_id,
    kind,
    value: row.value,
    unit: row.unit ?? undefined,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    note: row.note ?? undefined,
    source: toSource(row.source),
    tagIds,
    snapshot,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export interface ListRecordsOptions {
  /** 只列某个事件定义的记录 */
  definitionId?: string;
  /** 是否包含软删除的记录（默认不包含） */
  includeDeleted?: boolean;
  /** 只列软删除的记录（回收站用）；与 includeDeleted 互斥，优先本项 */
  onlyDeleted?: boolean;
  /** 最多返回多少条（时间轴分页用） */
  limit?: number;
}

export class EventRecordRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  /**
   * 记录一次事件：读取定义 → 校验 → 生成快照 → 落库，整体在独占事务里，
   * 避免「定义在读取与写入之间被改动」导致快照错乱。
   */
  async record(input: EventRecordInput, now: IsoDateTime = new Date().toISOString()): Promise<EventRecord> {
    const definitionId = requireId(input.definitionId, '事件定义 id');
    const source = requireRecordSource(input.source);
    const recordedAt = requireIsoDateTime(now, '录入时间');
    // 补录只允许回到过去：`occurredAt` 可以早于 recordedAt，但不能晚于它。
    const occurredAt = requireNotFuture(
      requireIsoDateTime(input.occurredAt ?? recordedAt, '发生时间'),
      recordedAt,
      '发生时间',
    );
    const note = optionalText(input.note);
    const id = newId();

    return guard('新增事件记录', async () => {
      await this.db.withExclusiveTransactionAsync(async (txn) => {
        const definition = await txn.getFirstAsync<DefinitionRow>(
          'SELECT id, name, kind, unit, group_id, is_archived FROM event_definitions WHERE id = ?',
          definitionId,
        );
        if (!definition) {
          throw new NotFoundError(`事件定义不存在：${definitionId}`);
        }
        if (definition.is_archived === 1) {
          throw new ConflictError(`事件「${definition.name}」已归档，不能新增记录`);
        }

        const kind = toKind(definition.kind);
        const value = requireRecordValue(kind, input.value);
        const unit = optionalText(input.unit) ?? definition.unit ?? undefined;

        const tagRows = await txn.getAllAsync<TagIdRow>(
          'SELECT tag_id FROM event_definition_tags WHERE definition_id = ? ORDER BY tag_id ASC',
          definitionId,
        );
        const tagIds = tagRows.map((row) => row.tag_id);

        await txn.runAsync(
          `INSERT INTO event_records
             (id, definition_id, kind, value, unit, occurred_at, recorded_at, note, source, deleted_at,
              snapshot_name, snapshot_unit, snapshot_group_id, snapshot_tag_ids)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
          id,
          definitionId,
          kind,
          value,
          unit ?? null,
          occurredAt,
          recordedAt,
          note ?? null,
          source,
          definition.name,
          definition.unit ?? null,
          definition.group_id ?? null,
          JSON.stringify(tagIds),
        );
      });

      return this.mustReadOne(id);
    });
  }

  /** 时间轴/列表：默认按事实发生时间倒序，排除软删除；回收站按删除时间倒序。 */
  async list(options: ListRecordsOptions = {}): Promise<EventRecord[]> {
    return guard('读取事件记录', async () => {
      const clauses: string[] = [];
      const params: SqlParam[] = [];

      if (options.onlyDeleted) {
        clauses.push('deleted_at IS NOT NULL');
      } else if (!options.includeDeleted) {
        clauses.push('deleted_at IS NULL');
      }
      if (options.definitionId !== undefined) {
        clauses.push('definition_id = ?');
        params.push(options.definitionId);
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const orderBy = options.onlyDeleted
        ? 'deleted_at DESC, occurred_at DESC, id DESC'
        : 'occurred_at DESC, recorded_at DESC, id DESC';
      const limit = options.limit !== undefined ? 'LIMIT ?' : '';
      if (options.limit !== undefined) {
        params.push(options.limit);
      }

      const rows = await this.db.getAllAsync<RecordRow>(
        `SELECT ${SELECT_COLUMNS}
           FROM event_records
           ${where}
          ORDER BY ${orderBy}
          ${limit}`,
        ...params,
      );
      return rows.map(toRecord);
    });
  }

  async getById(id: string): Promise<EventRecord | null> {
    return guard('读取事件记录', async () => {
      const row = await this.db.getFirstAsync<RecordRow>(
        `SELECT ${SELECT_COLUMNS} FROM event_records WHERE id = ?`,
        id,
      );
      return row ? toRecord(row) : null;
    });
  }

  /**
   * 软删除（「撤销」用的删除）：只写 `deleted_at`，行与快照都保留。
   *
   * 幂等：已经删除过就直接返回，不报错、也不覆盖原来的删除时间
   * （否则「撤销栈」里的时间会漂移）。记录不存在才抛 NotFoundError。
   *
   * 注意这**不是永久删除**——永久删除需要二次确认，属于后续的「永久删除一致性」项。
   */
  async softDelete(id: string, now: IsoDateTime = new Date().toISOString()): Promise<EventRecord> {
    const targetId = requireId(id, '事件记录 id');
    const deletedAt = requireIsoDateTime(now, '删除时间');

    return guard('删除事件记录', async () => {
      const existing = await this.getById(targetId);
      if (!existing) {
        throw new NotFoundError(`事件记录不存在：${targetId}`);
      }
      if (existing.deletedAt !== undefined) {
        return existing;
      }
      await this.db.runAsync(
        'UPDATE event_records SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
        deletedAt,
        targetId,
      );
      return this.mustReadOne(targetId);
    });
  }

  /** 撤销软删除：清空 `deleted_at`，记录重新参与展示与统计。同样幂等。 */
  async restore(id: string): Promise<EventRecord> {
    const targetId = requireId(id, '事件记录 id');

    return guard('恢复事件记录', async () => {
      const existing = await this.getById(targetId);
      if (!existing) {
        throw new NotFoundError(`事件记录不存在：${targetId}`);
      }
      if (existing.deletedAt === undefined) {
        return existing;
      }
      await this.db.runAsync('UPDATE event_records SET deleted_at = NULL WHERE id = ?', targetId);
      return this.mustReadOne(targetId);
    });
  }

  /**
   * 永久删除：把这一行彻底删掉（真删），不可撤销。调用方（界面）必须先做二次确认。
   *
   * 与 `softDelete` 的区别：软删除只写 `deleted_at`，可以 `restore`；这里是 `DELETE`。
   * 事件记录没有子表，单条 `DELETE` 本身就是原子的，不需要显式事务。
   */
  async remove(id: string): Promise<void> {
    const targetId = requireId(id, '事件记录 id');
    return guard('永久删除事件记录', async () => {
      const result = await this.db.runAsync('DELETE FROM event_records WHERE id = ?', targetId);
      if (result.changes === 0) {
        throw new NotFoundError(`事件记录不存在：${targetId}`);
      }
    });
  }

  private async mustReadOne(id: string): Promise<EventRecord> {
    const row = await this.db.getFirstAsync<RecordRow>(
      `SELECT ${SELECT_COLUMNS} FROM event_records WHERE id = ?`,
      id,
    );
    if (!row) {
      throw new StorageError(`写入后无法读回事件记录：${id}`);
    }
    return toRecord(row);
  }
}
