/**
 * 事件分组仓储（event_groups）。
 *
 * 追求与 metaRepository 一致的写法：只依赖 SqlExecutor、SQL 参数化、
 * 每个方法用 guard 收敛异常、时间作为带默认值的参数以便测试。
 *
 * 领域规则：删除分组**不删除**任何事件定义——数据库用 `ON DELETE SET NULL`
 * 把定义的 group_id 置空，定义与其历史都保留。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor } from '@/db/types';
import { newId } from '@/domain/id';
import type { EventGroup, IsoDateTime } from '@/domain/models';
import { NotFoundError } from '@/domain/errors';
import { optionalText, requireName, requireSortOrder, type EventGroupInput } from '@/domain/validation';

interface EventGroupRow {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = 'id, name, color, sort_order, created_at, updated_at';

function toEventGroup(row: EventGroupRow): EventGroup {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class EventGroupRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async list(): Promise<EventGroup[]> {
    return guard('读取事件分组', async () => {
      const rows = await this.db.getAllAsync<EventGroupRow>(
        `SELECT ${SELECT_COLUMNS} FROM event_groups ORDER BY sort_order ASC, name ASC`,
      );
      return rows.map(toEventGroup);
    });
  }

  async getById(id: string): Promise<EventGroup | null> {
    return guard('读取事件分组', async () => {
      const row = await this.db.getFirstAsync<EventGroupRow>(
        `SELECT ${SELECT_COLUMNS} FROM event_groups WHERE id = ?`,
        id,
      );
      return row ? toEventGroup(row) : null;
    });
  }

  async create(input: EventGroupInput, now: IsoDateTime = new Date().toISOString()): Promise<EventGroup> {
    const name = requireName(input.name, '分组名称');
    const color = optionalText(input.color);
    const sortOrder = requireSortOrder(input.sortOrder ?? 0);
    const id = newId();

    return guard('创建事件分组', async () => {
      await this.db.runAsync(
        `INSERT INTO event_groups (id, name, color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        name,
        color ?? null,
        sortOrder,
        now,
        now,
      );
      return { id, name, color, sortOrder, createdAt: now, updatedAt: now };
    });
  }

  async update(
    id: string,
    input: EventGroupInput,
    now: IsoDateTime = new Date().toISOString(),
  ): Promise<EventGroup> {
    const name = requireName(input.name, '分组名称');
    const color = optionalText(input.color);
    const sortOrder = requireSortOrder(input.sortOrder ?? 0);

    return guard('更新事件分组', async () => {
      const result = await this.db.runAsync(
        `UPDATE event_groups
            SET name = ?, color = ?, sort_order = ?, updated_at = ?
          WHERE id = ?`,
        name,
        color ?? null,
        sortOrder,
        now,
        id,
      );
      if (result.changes === 0) {
        throw new NotFoundError(`分组不存在：${id}`);
      }
      const row = await this.db.getFirstAsync<EventGroupRow>(
        `SELECT ${SELECT_COLUMNS} FROM event_groups WHERE id = ?`,
        id,
      );
      if (!row) {
        throw new NotFoundError(`分组不存在：${id}`);
      }
      return toEventGroup(row);
    });
  }

  async remove(id: string): Promise<void> {
    return guard('删除事件分组', async () => {
      const result = await this.db.runAsync('DELETE FROM event_groups WHERE id = ?', id);
      if (result.changes === 0) {
        throw new NotFoundError(`分组不存在：${id}`);
      }
    });
  }
}
