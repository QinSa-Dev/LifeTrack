/**
 * 周期定义仓储（cycle_definitions）。
 *
 * 与分组 / 标签类似，是最简单的一层 CRUD；差别在于多两个预测用的可选字段
 * （平均周期长度、平均经期长度）。
 *
 * 归档语义与事件定义一致：归档只改 `is_archived`，**不影响已产生的周期实例与记录**，
 * 只表示「不再新开周期」。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor } from '@/db/types';
import { NotFoundError } from '@/domain/errors';
import { newId } from '@/domain/id';
import type { CycleDefinition, IsoDateTime } from '@/domain/models';
import { optionalPositiveInteger, requireName, type CycleDefinitionInput } from '@/domain/validation';

interface CycleDefinitionRow {
  id: string;
  name: string;
  average_cycle_length_days: number | null;
  average_period_length_days: number | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, name, average_cycle_length_days, average_period_length_days, is_archived, created_at, updated_at';

function toDefinition(row: CycleDefinitionRow): CycleDefinition {
  return {
    id: row.id,
    name: row.name,
    averageCycleLengthDays: row.average_cycle_length_days ?? undefined,
    averagePeriodLengthDays: row.average_period_length_days ?? undefined,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListCycleDefinitionsOptions {
  /** 是否包含已归档的定义（默认不包含） */
  includeArchived?: boolean;
}

export class CycleDefinitionRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async list(options: ListCycleDefinitionsOptions = {}): Promise<CycleDefinition[]> {
    return guard('读取周期定义', async () => {
      const where = options.includeArchived ? '' : 'WHERE is_archived = 0';
      const rows = await this.db.getAllAsync<CycleDefinitionRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_definitions ${where} ORDER BY name ASC`,
      );
      return rows.map(toDefinition);
    });
  }

  async getById(id: string): Promise<CycleDefinition | null> {
    return guard('读取周期定义', async () => {
      const row = await this.db.getFirstAsync<CycleDefinitionRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_definitions WHERE id = ?`,
        id,
      );
      return row ? toDefinition(row) : null;
    });
  }

  async create(
    input: CycleDefinitionInput,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<CycleDefinition> {
    const name = requireName(input.name, '周期名称');
    const averageCycleLengthDays = optionalPositiveInteger(input.averageCycleLengthDays, '平均周期长度');
    const averagePeriodLengthDays = optionalPositiveInteger(input.averagePeriodLengthDays, '平均经期长度');
    const id = newId();

    return guard('创建周期定义', async () => {
      await this.db.runAsync(
        `INSERT INTO cycle_definitions
           (id, name, average_cycle_length_days, average_period_length_days, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        id,
        name,
        averageCycleLengthDays ?? null,
        averagePeriodLengthDays ?? null,
        now,
        now,
      );
      return {
        id,
        name,
        averageCycleLengthDays,
        averagePeriodLengthDays,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  async update(
    id: string,
    input: CycleDefinitionInput,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<CycleDefinition> {
    const name = requireName(input.name, '周期名称');
    const averageCycleLengthDays = optionalPositiveInteger(input.averageCycleLengthDays, '平均周期长度');
    const averagePeriodLengthDays = optionalPositiveInteger(input.averagePeriodLengthDays, '平均经期长度');

    return guard('更新周期定义', async () => {
      const result = await this.db.runAsync(
        `UPDATE cycle_definitions
            SET name = ?, average_cycle_length_days = ?, average_period_length_days = ?, updated_at = ?
          WHERE id = ?`,
        name,
        averageCycleLengthDays ?? null,
        averagePeriodLengthDays ?? null,
        now,
        id,
      );
      if (result.changes === 0) {
        throw new NotFoundError(`周期定义不存在：${id}`);
      }
      const row = await this.db.getFirstAsync<CycleDefinitionRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_definitions WHERE id = ?`,
        id,
      );
      if (!row) {
        throw new NotFoundError(`周期定义不存在：${id}`);
      }
      return toDefinition(row);
    });
  }

  async setArchived(
    id: string,
    isArchived: boolean,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<CycleDefinition> {
    return guard('归档周期定义', async () => {
      const result = await this.db.runAsync(
        'UPDATE cycle_definitions SET is_archived = ?, updated_at = ? WHERE id = ?',
        isArchived ? 1 : 0,
        now,
        id,
      );
      if (result.changes === 0) {
        throw new NotFoundError(`周期定义不存在：${id}`);
      }
      const row = await this.db.getFirstAsync<CycleDefinitionRow>(
        `SELECT ${SELECT_COLUMNS} FROM cycle_definitions WHERE id = ?`,
        id,
      );
      if (!row) {
        throw new NotFoundError(`周期定义不存在：${id}`);
      }
      return toDefinition(row);
    });
  }

  /** 永久删除：会级联删除该定义下的所有实例与记录（界面需二次确认）。 */
  async remove(id: string): Promise<void> {
    return guard('删除周期定义', async () => {
      const result = await this.db.runAsync('DELETE FROM cycle_definitions WHERE id = ?', id);
      if (result.changes === 0) {
        throw new NotFoundError(`周期定义不存在：${id}`);
      }
    });
  }
}
