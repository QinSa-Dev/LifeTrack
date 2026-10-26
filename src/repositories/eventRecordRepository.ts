/**
 * 事件历史记录仓储（event_records）。
 *
 * 职责：把「用户记录了一次事实」落库。核心领域规则在这里被强制执行：
 *
 * 1. **记录时生成快照**：从当前的事件定义取出名称、属性、分组、字段定义，固化进记录。
 *    之后定义改名/换属性/改字段/归档/删除，历史都保持原样（见 domain/models.ts 的 snapshot）。
 * 2. **归档不可新增记录**：`isRecordable` 为假时抛 ConflictError，历史不受影响。
 * 3. **读用 `occurred_at` 排序**（事实发生时间），而不是 `recorded_at`（录入时间）——
 *    这样补录的旧记录会落在时间轴的正确位置。
 * 4. **补录只能回到过去**：`occurredAt` 允许早于 `recordedAt`，但不允许晚于它
 *    （未来还没发生，不构成事实）。
 * 5. **删除分两级**：`softDelete` 只写 `deleted_at`（可 `restore` 撤销），真删是 `remove`，
 *    不可撤销、需要界面二次确认。两者划分清楚，避免「以为能撤销，其实是真删」。
 * 6. **记录可以更正**：`update` 只改事实本身（取值、发生时间、备注），
 *    快照（名称、属性、分组、字段）永不更新——「快照不可改，事实可更正」。
 *    已软删除的记录不能改（先撤销删除），避免改了又留在回收站里对不上账。
 *
 * 读取时 `kind` / `source` 都会再过一次守卫（泛型运行时不校验）。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor, SqlParam } from '@/db/types';
import { ConflictError, NotFoundError, StorageError, ValidationError } from '@/domain/errors';
import { newId } from '@/domain/id';
import {
  isRecordKind,
  isRecordSource,
  toFieldSnapshot,
  type DefinitionField,
  type EventDefinitionSnapshot,
  type EventRecord,
  type IsoDateTime,
  type RecordKind,
  type RecordSource,
} from '@/domain/models';
import {
  normalizeFieldValues,
  normalizeTextList,
  optionalText,
  readFieldSnapshots,
  readFieldValues,
  readTextList,
  requireFieldKind,
  requireId,
  requireIsoDateTime,
  requireNotFuture,
  requireRecordSource,
  requireRecordValue,
  type EventRecordEditInput,
  type EventRecordInput,
} from '@/domain/validation';

interface RecordRow {
  id: string;
  definition_id: string;
  kind: string;
  value: number;
  attributes: string;
  occurred_at: string;
  recorded_at: string;
  note: string | null;
  source: string;
  deleted_at: string | null;
  snapshot_name: string;
  snapshot_attributes: string;
  snapshot_group_id: string | null;
  snapshot_fields: string;
  field_values: string;
}

interface DefinitionRow {
  id: string;
  name: string;
  kind: string;
  attributes: string;
  group_id: string | null;
  is_archived: number;
}

interface FieldRow {
  id: string;
  name: string;
  kind: string;
  options: string;
  sort_order: number;
}

const SELECT_COLUMNS =
  'id, definition_id, kind, value, attributes, occurred_at, recorded_at, note, source, deleted_at, ' +
  'snapshot_name, snapshot_attributes, snapshot_group_id, snapshot_fields, field_values';

/**
 * 读库得到的记录类型必须再过一次守卫：它比定义的类型多一个历史遗留的 `quantity`，
 * 非法值宁可报错也不猜。
 */
function toRecordKind(value: unknown): RecordKind {
  if (!isRecordKind(value)) {
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

/**
 * 列表类字段（字段快照、字段取值）是 JSON 文本；解析失败时退化为空数组，
 * 而不是让整行读不出来。
 */
function toRecord(row: RecordRow): EventRecord {
  const kind = toRecordKind(row.kind);
  const snapshot: EventDefinitionSnapshot = {
    definitionId: row.definition_id,
    name: row.snapshot_name,
    kind,
    attributes: readTextList(row.snapshot_attributes),
    groupId: row.snapshot_group_id ?? undefined,
    fields: readFieldSnapshots(row.snapshot_fields),
  };
  return {
    id: row.id,
    definitionId: row.definition_id,
    kind,
    value: row.value,
    attributes: readTextList(row.attributes),
    fieldValues: readFieldValues(row.field_values),
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    note: row.note ?? undefined,
    source: toSource(row.source),
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
  /** 只列**发生时间**（`occurred_at`）不早于它的记录；ISO-8601 时间戳 */
  from?: IsoDateTime;
  /** 只列**发生时间**（`occurred_at`）早于它的记录。区间是半开的：`[from, until)` */
  until?: IsoDateTime;
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
          'SELECT id, name, kind, attributes, group_id, is_archived FROM event_definitions WHERE id = ?',
          definitionId,
        );
        if (!definition) {
          throw new NotFoundError(`事件定义不存在：${definitionId}`);
        }
        if (definition.is_archived === 1) {
          throw new ConflictError(`事件「${definition.name}」已归档，不能新增记录`);
        }
        if (definition.kind === 'cycle') {
          throw new ConflictError(`「${definition.name}」是周期型事件，请在周期详情里记录，而不是记一次`);
        }

        const kind = toRecordKind(definition.kind);
        const value = requireRecordValue(kind, input.value);
        // 记录上标了哪些属性就用哪些；一个都没标就存空列表
        // （展示时 `recordAttributes` 会回落到快照里的定义属性）。
        const attributes = normalizeTextList(input.attributes ?? []);

        // 快照要固化「记录这一刻的字段定义」，字段取值则按定义逐个校验。
        const fieldRows = await txn.getAllAsync<FieldRow>(
          `SELECT id, name, kind, options, sort_order
             FROM event_definition_fields
            WHERE definition_id = ?
            ORDER BY sort_order ASC, id ASC`,
          definitionId,
        );
        const fields: DefinitionField[] = fieldRows.map((row) => ({
          id: row.id,
          name: row.name,
          kind: requireFieldKind(row.kind),
          options: readTextList(row.options),
          sortOrder: row.sort_order,
        }));
        const fieldValues = normalizeFieldValues(fields, input.fieldValues ?? []);
        const snapshotFields = fields.map(toFieldSnapshot);

        await txn.runAsync(
          `INSERT INTO event_records
             (id, definition_id, kind, value, attributes, occurred_at, recorded_at, note, source, deleted_at,
              snapshot_name, snapshot_attributes, snapshot_group_id, snapshot_fields, field_values)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
          id,
          definitionId,
          kind,
          value,
          JSON.stringify(attributes),
          occurredAt,
          recordedAt,
          note ?? null,
          source,
          definition.name,
          definition.attributes,
          definition.group_id ?? null,
          JSON.stringify(snapshotFields),
          JSON.stringify(fieldValues),
        );
      });

      return this.mustReadOne(id);
    });
  }

  /**
   * 更正一条已存在的记录：取值、发生时间、备注。
   *
   * 动的是「事实」，不是「快照」：记录时的名称、属性、分组、字段定义与取值保持原样，
   * 所以改完之后历史仍然自洽（比如定义后来改了名，这条记录还是原名）。
   *
   * 校验与新增记录同一套：取值按类型（counter 是正整数、历史 quantity 是数字）、
   * 发生时间不能晚于录入时间（未来还没发生，不构成事实——这条与补录共用同一条规则）。
   * 已软删除的记录拒绝修改：先撤销删除再改，免得「改了又躺在回收站里」对不上。
   */
  async update(id: string, input: EventRecordEditInput): Promise<EventRecord> {
    const targetId = requireId(id, '事件记录 id');
    const occurredAtInput = input.occurredAt;
    const note = optionalText(input.note);

    return guard('修改事件记录', async () => {
      const existing = await this.getById(targetId);
      if (!existing) {
        throw new NotFoundError(`事件记录不存在：${targetId}`);
      }
      if (existing.deletedAt !== undefined) {
        throw new ConflictError('这条记录已被删除，先撤销删除再修改');
      }

      const value = requireRecordValue(existing.kind, input.value);
      const occurredAt = requireNotFuture(
        requireIsoDateTime(occurredAtInput ?? existing.occurredAt, '发生时间'),
        existing.recordedAt,
        '发生时间',
      );

      await this.db.runAsync(
        'UPDATE event_records SET value = ?, note = ?, occurred_at = ? WHERE id = ?',
        value,
        note ?? null,
        occurredAt,
        targetId,
      );
      return this.mustReadOne(targetId);
    });
  }

  /**
   * 时间轴/列表：默认按事实发生时间倒序，排除软删除；回收站按删除时间倒序。
   *
   * `from` / `until` 把时间范围**下推到 SQL**（走 `idx_event_records_occurred_at`），
   * 统计页的趋势与对比因此不必先把全表读进内存再逐行判断窗口。
   *
   * 比较用的是 `occurred_at` 文本的**字典序**：这成立的前提是写入路径一律把时间戳
   * 归一到 `...Z`（`toISOString()`）。同一假设本来就被 `ORDER BY occurred_at` 与
   * 那条索引用着；唯一例外是外部手写的、带 `+08:00` 这类偏移的备份数据（导入只做
   * 格式校验，不做归一）。
   */
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
      if (options.from !== undefined) {
        clauses.push('occurred_at >= ?');
        params.push(requireIsoDateTime(options.from, '起始时间'));
      }
      if (options.until !== undefined) {
        clauses.push('occurred_at < ?');
        params.push(requireIsoDateTime(options.until, '结束时间'));
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
