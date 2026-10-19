/**
 * 标签仓储（tags）。
 *
 * 与分组类似，但标签没有 sort_order——它是一组无序的「维度」，
 * 按名称排序即可（见 domain/models.ts 的 Tag 定义）。
 * 删除标签只会级联清理「事件定义 ↔ 标签」关联，不影响事件定义本身。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor } from '@/db/types';
import { NotFoundError } from '@/domain/errors';
import { newId } from '@/domain/id';
import type { IsoDateTime, Tag } from '@/domain/models';
import { optionalText, requireName, type TagInput } from '@/domain/validation';

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = 'id, name, color, created_at, updated_at';

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TagRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async list(): Promise<Tag[]> {
    return guard('读取标签', async () => {
      const rows = await this.db.getAllAsync<TagRow>(`SELECT ${SELECT_COLUMNS} FROM tags ORDER BY name ASC`);
      return rows.map(toTag);
    });
  }

  async getById(id: string): Promise<Tag | null> {
    return guard('读取标签', async () => {
      const row = await this.db.getFirstAsync<TagRow>(`SELECT ${SELECT_COLUMNS} FROM tags WHERE id = ?`, id);
      return row ? toTag(row) : null;
    });
  }

  async create(input: TagInput, now: IsoDateTime = new Date().toISOString()): Promise<Tag> {
    const name = requireName(input.name, '标签名称');
    const color = optionalText(input.color);
    const id = newId();

    return guard('创建标签', async () => {
      await this.db.runAsync(
        `INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        id,
        name,
        color ?? null,
        now,
        now,
      );
      return { id, name, color, createdAt: now, updatedAt: now };
    });
  }

  async update(id: string, input: TagInput, now: IsoDateTime = new Date().toISOString()): Promise<Tag> {
    const name = requireName(input.name, '标签名称');
    const color = optionalText(input.color);

    return guard('更新标签', async () => {
      const result = await this.db.runAsync(
        `UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?`,
        name,
        color ?? null,
        now,
        id,
      );
      if (result.changes === 0) {
        throw new NotFoundError(`标签不存在：${id}`);
      }
      const row = await this.db.getFirstAsync<TagRow>(`SELECT ${SELECT_COLUMNS} FROM tags WHERE id = ?`, id);
      if (!row) {
        throw new NotFoundError(`标签不存在：${id}`);
      }
      return toTag(row);
    });
  }

  async remove(id: string): Promise<void> {
    return guard('删除标签', async () => {
      const result = await this.db.runAsync('DELETE FROM tags WHERE id = ?', id);
      if (result.changes === 0) {
        throw new NotFoundError(`标签不存在：${id}`);
      }
    });
  }
}
