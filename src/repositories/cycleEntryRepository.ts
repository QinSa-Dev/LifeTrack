/**
 * 周期内记录仓储（cycle_entries）：周期里**某一天**的症状 / 阶段 / 感受 / 备注。
 *
 * 两条设计决定：
 *
 * 1. **「一天一条」用 upsert 表达**：`save` 按 `(instance_id, date)` 冲突即更新。
 *    这样界面「点某一天 → 填写 → 保存」天然幂等，不需要先判断「是新的一天还是改旧的」。
 *    结构上由 `UNIQUE(instance_id, date)` 保证。
 * 2. **日期必须落在实例区间内**：写入前读一次实例的 `start_date` / `end_date` 校验。
 *    否则会出现「属于这个周期、却在这个周期之外」的记录，
 *    之后改边界时又会被 `assertNoOutsiders` 拦住，变成自相矛盾的数据。
 *    恢复也一样要过这道校验（见 `restore`）：软删除期间边界可能已经缩走。
 *
 * 3. **删除分两级**（v5 起，与 `event_records` 对齐）：`softDelete` 只写 `deleted_at`
 *    （可 `restore` 撤销），真删是不可撤销的 `remove`，界面必须二次确认。
 *    软删除的记录不再参与展示与统计，也不算「挡着边界」的记录。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor } from '@/db/types';
import { NotFoundError, StorageError, ValidationError } from '@/domain/errors';
import { newId } from '@/domain/id';
import { isEntryWithinRange } from '@/domain/cycles';
import type { CycleEntry, DeletedCycleEntry, IsoDateTime } from '@/domain/models';
import {
  normalizeTextList,
  optionalText,
  requireId,
  requireIsoDate,
  requireIsoDateTime,
  type CycleEntryInput,
} from '@/domain/validation';

interface CycleEntryRow {
  id: string;
  instance_id: string;
  date: string;
  phase: string | null;
  symptoms: string;
  feelings: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** 回收站查询的行：记录本身 + 它属于哪个定义、哪一段周期 */
interface DeletedEntryRow extends CycleEntryRow {
  definition_name: string;
  instance_start_date: string;
  instance_end_date: string | null;
}

interface InstanceRangeRow {
  start_date: string;
  end_date: string | null;
}

const SELECT_COLUMNS =
  'id, instance_id, date, phase, symptoms, feelings, note, created_at, updated_at, deleted_at';

/** JOIN 实例表时要带表别名，否则列名有歧义。 */
const SELECT_COLUMNS_ALIASED =
  'e.id, e.instance_id, e.date, e.phase, e.symptoms, e.feelings, e.note, e.created_at, e.updated_at, e.deleted_at';

/** symptoms 存 JSON 数组文本；解析失败退化为空数组，避免整行读不出来。 */
function parseSymptoms(json: string): string[] {
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

function toEntry(row: CycleEntryRow): CycleEntry {
  return {
    id: row.id,
    instanceId: row.instance_id,
    date: row.date,
    phase: row.phase ?? undefined,
    symptoms: parseSymptoms(row.symptoms),
    feelings: row.feelings ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export class CycleEntryRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  /** 某个实例的全部记录，按日期正序（日历顺序）。软删除的那天不在其中。 */
  async listByInstance(instanceId: string): Promise<CycleEntry[]> {
    const targetId = requireId(instanceId, '周期实例 id');
    return guard('读取周期记录', async () => {
      const rows = await this.db.getAllAsync<CycleEntryRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_entries
          WHERE instance_id = ? AND deleted_at IS NULL
          ORDER BY date ASC`,
        targetId,
      );
      return rows.map(toEntry);
    });
  }

  /** 全部周期记录（导出备份用，**含软删除**）：按日期正序。 */
  async listAll(): Promise<CycleEntry[]> {
    return guard('读取周期记录', async () => {
      const rows = await this.db.getAllAsync<CycleEntryRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_entries ORDER BY date ASC, id ASC`,
      );
      return rows.map(toEntry);
    });
  }

  /**
   * 全部**可见**的周期记录（跨实例），按日期正序。
   * 传入 `definitionId` 时只返回这个周期定义下的记录。
   *
   * 与 `listAll` 的区别：那个是导出用的、**含软删除**；这个是展示与统计用的、不含。
   * 症状统计需要跨实例看一个定义（或全部）的记录，所以不能只靠 `listByInstance`。
   */
  async listVisible(definitionId?: string): Promise<CycleEntry[]> {
    return guard('读取周期记录', async () => {
      if (definitionId === undefined) {
        const rows = await this.db.getAllAsync<CycleEntryRow>(
          `SELECT ${SELECT_COLUMNS} FROM cycle_entries
            WHERE deleted_at IS NULL
            ORDER BY date ASC, id ASC`,
        );
        return rows.map(toEntry);
      }

      const targetId = requireId(definitionId, '周期事件 id');
      const rows = await this.db.getAllAsync<CycleEntryRow>(
        `SELECT ${SELECT_COLUMNS_ALIASED} FROM cycle_entries e
           JOIN cycle_instances i ON i.id = e.instance_id
          WHERE i.definition_id = ? AND e.deleted_at IS NULL
          ORDER BY e.date ASC, e.id ASC`,
        targetId,
      );
      return rows.map(toEntry);
    });
  }

  /**
   * 回收站：所有软删除的周期记录，按删除时间倒序（最近删的在最上面），
   * 并带上所属定义名与实例区间，让每一行都能自证「这是哪个周期的哪一天」。
   */
  async listDeleted(): Promise<DeletedCycleEntry[]> {
    return guard('读取周期记录', async () => {
      const rows = await this.db.getAllAsync<DeletedEntryRow>(
        `SELECT e.id, e.instance_id, e.date, e.phase, e.symptoms, e.feelings, e.note,
                e.created_at, e.updated_at, e.deleted_at,
                d.name AS definition_name,
                i.start_date AS instance_start_date,
                i.end_date AS instance_end_date
           FROM cycle_entries e
           JOIN cycle_instances i ON i.id = e.instance_id
           JOIN event_definitions d ON d.id = i.definition_id
          WHERE e.deleted_at IS NOT NULL
          ORDER BY e.deleted_at DESC, e.date DESC, e.id DESC`,
      );
      return rows.map((row) => ({
        entry: toEntry(row),
        definitionName: row.definition_name,
        instanceStartDate: row.instance_start_date,
        instanceEndDate: row.instance_end_date ?? undefined,
      }));
    });
  }

  async getById(id: string): Promise<CycleEntry | null> {
    return guard('读取周期记录', async () => {
      const row = await this.db.getFirstAsync<CycleEntryRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_entries WHERE id = ?`,
        id,
      );
      return row ? toEntry(row) : null;
    });
  }

  async getByInstanceAndDate(instanceId: string, date: string): Promise<CycleEntry | null> {
    const targetId = requireId(instanceId, '周期实例 id');
    const targetDate = requireIsoDate(date, '记录日期');
    return guard('读取周期记录', async () => {
      const row = await this.db.getFirstAsync<CycleEntryRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_entries WHERE instance_id = ? AND date = ?`,
        targetId,
        targetDate,
      );
      return row ? toEntry(row) : null;
    });
  }

  /**
   * 保存某一天的记录：已存在就更新，不存在就新建（按 `(instance_id, date)`）。
   * 日期必须落在实例区间内，否则抛 ValidationError。
   *
   * 如果这一天此前被软删除，保存会把它**复活**（`deleted_at` 清空）：
   * 否则会出现「提示保存成功、列表里却看不到」的自相矛盾。
   */
  async save(
    instanceId: string,
    input: CycleEntryInput,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<CycleEntry> {
    const targetId = requireId(instanceId, '周期实例 id');
    const date = requireIsoDate(input.date, '记录日期');
    const phase = optionalText(input.phase);
    const symptoms = normalizeTextList(input.symptoms ?? []);
    const feelings = optionalText(input.feelings);
    const note = optionalText(input.note);
    const id = newId();

    return guard('保存周期记录', async () => {
      const instance = await this.db.getFirstAsync<InstanceRangeRow>(
        'SELECT start_date, end_date FROM cycle_instances WHERE id = ?',
        targetId,
      );
      if (!instance) {
        throw new NotFoundError(`周期实例不存在：${targetId}`);
      }
      const range = { startDate: instance.start_date, endDate: instance.end_date ?? undefined };
      if (!isEntryWithinRange(date, range)) {
        throw new ValidationError(
          `${date} 不在这个周期的区间内（${range.startDate} ~ ${range.endDate ?? '进行中'}）。`,
        );
      }

      await this.db.runAsync(
        `INSERT INTO cycle_entries (id, instance_id, date, phase, symptoms, feelings, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(instance_id, date) DO UPDATE SET
           phase = excluded.phase,
           symptoms = excluded.symptoms,
           feelings = excluded.feelings,
           note = excluded.note,
           updated_at = excluded.updated_at,
           deleted_at = NULL`,
        id,
        targetId,
        date,
        phase ?? null,
        JSON.stringify(symptoms),
        feelings ?? null,
        note ?? null,
        now,
        now,
      );

      const saved = await this.getByInstanceAndDate(targetId, date);
      if (!saved) {
        throw new StorageError(`写入后无法读回周期记录：${targetId} / ${date}`);
      }
      return saved;
    });
  }

  /** 软删除某一天的记录（可 `restore` 撤销）。重复删除是幂等的。 */
  async softDelete(id: string, now: IsoDateTime = new Date().toISOString()): Promise<CycleEntry> {
    const targetId = requireId(id, '周期记录 id');
    const deletedAt = requireIsoDateTime(now, '删除时间');

    return guard('删除周期记录', async () => {
      const existing = await this.getById(targetId);
      if (!existing) {
        throw new NotFoundError(`周期记录不存在：${targetId}`);
      }
      if (existing.deletedAt !== undefined) {
        return existing;
      }
      await this.db.runAsync(
        'UPDATE cycle_entries SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
        deletedAt,
        targetId,
      );
      return this.mustReadOne(targetId);
    });
  }

  /**
   * 恢复软删除的记录。
   *
   * 恢复也要重新过「日期在实例区间内」这道校验：软删除期间这一段的边界可能已经
   * 缩到不包含这一天了（软删除的记录不挡边界），直接恢复就会造出一条
   * 「属于这个周期、却在这个周期之外」的记录。这时抛 ValidationError 说明原因，
   * 让用户自己选：先把边界改回来，或者永久删除它。
   */
  async restore(id: string): Promise<CycleEntry> {
    const targetId = requireId(id, '周期记录 id');

    return guard('恢复周期记录', async () => {
      const existing = await this.getById(targetId);
      if (!existing) {
        throw new NotFoundError(`周期记录不存在：${targetId}`);
      }
      if (existing.deletedAt === undefined) {
        return existing;
      }

      const instance = await this.db.getFirstAsync<InstanceRangeRow>(
        'SELECT start_date, end_date FROM cycle_instances WHERE id = ?',
        existing.instanceId,
      );
      if (!instance) {
        throw new NotFoundError(`周期实例不存在：${existing.instanceId}`);
      }
      const range = { startDate: instance.start_date, endDate: instance.end_date ?? undefined };
      if (!isEntryWithinRange(existing.date, range)) {
        throw new ValidationError(
          `${existing.date} 已经不在所属周期的区间内（${range.startDate} ~ ${range.endDate ?? '进行中'}）。` +
            '先把这个周期的边界改回包含这一天，或者彻底删除它。',
        );
      }

      await this.db.runAsync('UPDATE cycle_entries SET deleted_at = NULL WHERE id = ?', targetId);
      return this.mustReadOne(targetId);
    });
  }

  /** 永久删除某一天的记录：不可撤销，界面需二次确认。 */
  async remove(id: string): Promise<void> {
    const targetId = requireId(id, '周期记录 id');
    return guard('永久删除周期记录', async () => {
      const result = await this.db.runAsync('DELETE FROM cycle_entries WHERE id = ?', targetId);
      if (result.changes === 0) {
        throw new NotFoundError(`周期记录不存在：${targetId}`);
      }
    });
  }

  /** 写完之后必须能读回：读不回来说明库里发生了意想不到的事，早点炸掉比返回假数据好。 */
  private async mustReadOne(id: string): Promise<CycleEntry> {
    const entry = await this.getById(id);
    if (!entry) {
      throw new StorageError(`写入后无法读回周期记录：${id}`);
    }
    return entry;
  }
}
