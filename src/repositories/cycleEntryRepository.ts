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
 *
 * 删除是**真删**：模型里 `CycleEntry` 没有软删除标记，一天的数据量也小。
 * 界面上的删除有二次确认（对应领域规则：永久删除必须确认）。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor } from '@/db/types';
import { NotFoundError, StorageError, ValidationError } from '@/domain/errors';
import { newId } from '@/domain/id';
import { isEntryWithinRange } from '@/domain/cycles';
import type { CycleEntry, IsoDateTime } from '@/domain/models';
import {
  normalizeTextList,
  optionalText,
  requireId,
  requireIsoDate,
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
}

interface InstanceRangeRow {
  start_date: string;
  end_date: string | null;
}

const SELECT_COLUMNS = 'id, instance_id, date, phase, symptoms, feelings, note, created_at, updated_at';

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
  };
}

export class CycleEntryRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  /** 某个实例的全部记录，按日期正序（日历顺序）。 */
  async listByInstance(instanceId: string): Promise<CycleEntry[]> {
    const targetId = requireId(instanceId, '周期实例 id');
    return guard('读取周期记录', async () => {
      const rows = await this.db.getAllAsync<CycleEntryRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_entries WHERE instance_id = ? ORDER BY date ASC`,
        targetId,
      );
      return rows.map(toEntry);
    });
  }

  /** 全部周期记录（导出备份用）：按日期正序。 */
  async listAll(): Promise<CycleEntry[]> {
    return guard('读取周期记录', async () => {
      const rows = await this.db.getAllAsync<CycleEntryRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_entries ORDER BY date ASC, id ASC`,
      );
      return rows.map(toEntry);
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
           updated_at = excluded.updated_at`,
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

  /** 真删某一天的记录。 */
  async remove(id: string): Promise<void> {
    const targetId = requireId(id, '周期记录 id');
    return guard('删除周期记录', async () => {
      const result = await this.db.runAsync('DELETE FROM cycle_entries WHERE id = ?', targetId);
      if (result.changes === 0) {
        throw new NotFoundError(`周期记录不存在：${targetId}`);
      }
    });
  }
}
