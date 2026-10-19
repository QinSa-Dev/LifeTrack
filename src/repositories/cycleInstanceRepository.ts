/**
 * 周期实例仓储（cycle_instances）。
 *
 * 实例是「一段真实的周期区间」。这一层承载了周期功能最关键的那条规则：
 *
 * > **修改边界不得静默删除越界记录。**
 *
 * `update` / `endInstance` 会先查 `cycle_entries` 里落在**新区间之外**的日期；
 * 只要存在，就抛 `ConflictError`（把日期放进 `details` 与报错文案），
 * 让用户自己决定「改边界」还是「先处理那些记录」。**绝不顺手删掉它们**。
 *
 * 另一条规则：**同一定义的实例不重叠**（否则「第几天」会含糊）。
 * 校验用 `domain/cycles.ts` 的纯函数 `findOverlappingInstance`。
 *
 * 实例永不「换定义」：更新接口不接受 `definitionId`。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor, SqlParam } from '@/db/types';
import { ConflictError, NotFoundError, StorageError } from '@/domain/errors';
import { newId } from '@/domain/id';
import { findDatesOutside, findOverlappingInstance, type DateRange } from '@/domain/cycles';
import type { CycleInstance, IsoDate, IsoDateTime } from '@/domain/models';
import {
  optionalText,
  requireDateRange,
  requireId,
  type CycleInstanceInput,
  type CycleInstanceUpdateInput,
} from '@/domain/validation';

interface CycleInstanceRow {
  id: string;
  definition_id: string;
  start_date: string;
  end_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface DefinitionRow {
  id: string;
  name: string;
  is_archived: number;
}

interface DateRow {
  date: string;
}

const SELECT_COLUMNS = 'id, definition_id, start_date, end_date, note, created_at, updated_at';

function toInstance(row: CycleInstanceRow): CycleInstance {
  return {
    id: row.id,
    definitionId: row.definition_id,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListCycleInstancesOptions {
  definitionId?: string;
  limit?: number;
}

export class CycleInstanceRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  /** 按开始日倒序（最近的周期排前面）。 */
  async list(options: ListCycleInstancesOptions = {}): Promise<CycleInstance[]> {
    return guard('读取周期实例', async () => {
      const params: SqlParam[] = [];
      let where = '';
      if (options.definitionId !== undefined) {
        where = 'WHERE definition_id = ?';
        params.push(options.definitionId);
      }
      const limit = options.limit !== undefined ? 'LIMIT ?' : '';
      if (options.limit !== undefined) {
        params.push(options.limit);
      }
      const rows = await this.db.getAllAsync<CycleInstanceRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_instances ${where} ORDER BY start_date DESC, id DESC ${limit}`,
        ...params,
      );
      return rows.map(toInstance);
    });
  }

  async getById(id: string): Promise<CycleInstance | null> {
    return guard('读取周期实例', async () => {
      const row = await this.db.getFirstAsync<CycleInstanceRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_instances WHERE id = ?`,
        id,
      );
      return row ? toInstance(row) : null;
    });
  }

  async create(
    input: CycleInstanceInput,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<CycleInstance> {
    const definitionId = requireId(input.definitionId, '周期定义 id');
    const range = requireDateRange(input.startDate, input.endDate);
    const note = optionalText(input.note);
    const id = newId();

    return guard('创建周期实例', async () => {
      await this.db.withExclusiveTransactionAsync(async (txn) => {
        const definition = await txn.getFirstAsync<DefinitionRow>(
          'SELECT id, name, is_archived FROM cycle_definitions WHERE id = ?',
          definitionId,
        );
        if (!definition) {
          throw new NotFoundError(`周期定义不存在：${definitionId}`);
        }
        if (definition.is_archived === 1) {
          throw new ConflictError(`周期「${definition.name}」已归档，不能新开周期`);
        }

        await this.assertNoOverlap(txn, definitionId, range);

        await txn.runAsync(
          `INSERT INTO cycle_instances (id, definition_id, start_date, end_date, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id,
          definitionId,
          range.startDate,
          range.endDate ?? null,
          note ?? null,
          now,
          now,
        );
      });

      return this.mustReadOne(id);
    });
  }

  /**
   * 更新边界与备注。若新区间会把已有记录甩在外面，**拒绝更新**并列出那些日期。
   */
  async update(
    id: string,
    input: CycleInstanceUpdateInput,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<CycleInstance> {
    const targetId = requireId(id, '周期实例 id');
    const range = requireDateRange(input.startDate, input.endDate);
    const note = optionalText(input.note);

    return guard('更新周期实例', async () => {
      await this.db.withExclusiveTransactionAsync(async (txn) => {
        const existing = await txn.getFirstAsync<CycleInstanceRow>(
          'SELECT definition_id FROM cycle_instances WHERE id = ?',
          targetId,
        );
        if (!existing) {
          throw new NotFoundError(`周期实例不存在：${targetId}`);
        }

        await this.assertNoOutsiders(txn, targetId, range);
        await this.assertNoOverlap(txn, existing.definition_id, range, targetId);

        await txn.runAsync(
          'UPDATE cycle_instances SET start_date = ?, end_date = ?, note = ?, updated_at = ? WHERE id = ?',
          range.startDate,
          range.endDate ?? null,
          note ?? null,
          now,
          targetId,
        );
      });

      return this.mustReadOne(targetId);
    });
  }

  /** 结束一个进行中的周期：只改结束日（其余走 `update` 的同一套校验）。 */
  async endInstance(
    id: string,
    endDate: IsoDate,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<CycleInstance> {
    const targetId = requireId(id, '周期实例 id');
    return guard('结束周期实例', async () => {
      const instance = await this.getById(targetId);
      if (!instance) {
        throw new NotFoundError(`周期实例不存在：${targetId}`);
      }
      return this.update(targetId, { startDate: instance.startDate, endDate, note: instance.note }, now);
    });
  }

  /** 永久删除实例：会级联删除它的所有记录（界面需二次确认）。 */
  async remove(id: string): Promise<void> {
    const targetId = requireId(id, '周期实例 id');
    return guard('删除周期实例', async () => {
      const result = await this.db.runAsync('DELETE FROM cycle_instances WHERE id = ?', targetId);
      if (result.changes === 0) {
        throw new NotFoundError(`周期实例不存在：${targetId}`);
      }
    });
  }

  /**
   * 只读的「预演」：如果边界改成这个区间，哪些日期会落在外面。
   * 界面可以在用户点保存之前就提示，而不是等报错。
   */
  async listOutsideEntryDates(id: string, range: DateRange): Promise<IsoDate[]> {
    const targetId = requireId(id, '周期实例 id');
    return guard('检查周期边界', async () => {
      const rows = await this.db.getAllAsync<DateRow>(
        'SELECT date FROM cycle_entries WHERE instance_id = ? ORDER BY date ASC',
        targetId,
      );
      return findDatesOutside(
        rows.map((row) => row.date),
        range.startDate,
        range.endDate,
      );
    });
  }

  /** 有记录落在新区间外就抛 ConflictError——这就是「不静默删除」的落点。 */
  private async assertNoOutsiders(txn: SqlExecutor, instanceId: string, range: DateRange): Promise<void> {
    const rows = await txn.getAllAsync<DateRow>(
      'SELECT date FROM cycle_entries WHERE instance_id = ? ORDER BY date ASC',
      instanceId,
    );
    const outside = findDatesOutside(
      rows.map((row) => row.date),
      range.startDate,
      range.endDate,
    );
    if (outside.length > 0) {
      throw new ConflictError(
        `有 ${outside.length} 条记录落在新边界之外（${outside.join('、')}），已取消修改。` +
          '请先处理这些记录，或把边界改回包含它们。',
        { details: { outsideDates: outside } },
      );
    }
  }

  private async assertNoOverlap(
    txn: SqlExecutor,
    definitionId: string,
    range: DateRange,
    excludeId?: string,
  ): Promise<void> {
    const rows = await txn.getAllAsync<CycleInstanceRow>(
      `SELECT ${SELECT_COLUMNS} FROM cycle_instances WHERE definition_id = ?`,
      definitionId,
    );
    const overlapping = findOverlappingInstance(rows.map(toInstance), range, excludeId);
    if (overlapping) {
      throw new ConflictError(
        `这个区间与已有周期（${overlapping.startDate} ~ ${overlapping.endDate ?? '进行中'}）重叠，` +
          '同一周期的两段区间不能重叠。',
      );
    }
  }

  private async mustReadOne(id: string): Promise<CycleInstance> {
    const instance = await this.getById(id);
    if (!instance) {
      throw new StorageError(`写入后无法读回周期实例：${id}`);
    }
    return instance;
  }
}
