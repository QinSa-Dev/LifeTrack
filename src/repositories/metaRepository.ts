/**
 * app_meta 仓储：应用级键值元信息。
 *
 * 它是第一阶段的「样板仓储」，用来固定 Repository 层的写法：
 * - 只依赖 SqlExecutor 接口（可用内存 SQLite 直接测试）
 * - SQL 集中在本文件，不外泄到 UI
 * - 统一通过 guard 收敛为 StorageError
 */

import { guard } from '@/db/guard';
import { META_KEYS } from '@/db/schema';
import type { SqlExecutor } from '@/db/types';
import type { IsoDateTime } from '@/domain/models';

export interface MetaEntry {
  key: string;
  value: string;
  updatedAt: IsoDateTime;
}

interface MetaRow {
  key: string;
  value: string;
  updated_at: string;
}

export class MetaRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async get(key: string): Promise<string | null> {
    return guard('读取应用元信息', async () => {
      const row = await this.db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_meta WHERE key = ?',
        key,
      );
      return row?.value ?? null;
    });
  }

  async set(key: string, value: string, now: IsoDateTime = new Date().toISOString()): Promise<void> {
    return guard('写入应用元信息', async () => {
      await this.db.runAsync(
        `INSERT INTO app_meta (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        key,
        value,
        now,
      );
    });
  }

  async getAll(): Promise<MetaEntry[]> {
    return guard('读取应用元信息列表', async () => {
      const rows = await this.db.getAllAsync<MetaRow>(
        'SELECT key, value, updated_at FROM app_meta ORDER BY key ASC',
      );
      return rows.map((row) => ({ key: row.key, value: row.value, updatedAt: row.updated_at }));
    });
  }

  /**
   * 记录一次启动并返回累计次数。
   * 第二阶段会用它作为「跨重启持久化」的可视证据（设置页展示）。
   */
  async incrementLaunchCount(now: IsoDateTime = new Date().toISOString()): Promise<number> {
    return guard('更新启动次数', async () => {
      const current = await this.get(META_KEYS.launchCount);
      const parsed = current === null ? 0 : Number.parseInt(current, 10);
      const next = (Number.isFinite(parsed) ? parsed : 0) + 1;
      await this.set(META_KEYS.launchCount, String(next), now);
      return next;
    });
  }

  /** 首次启动时间只写一次，之后保持不变。 */
  async ensureInstalledAt(now: IsoDateTime = new Date().toISOString()): Promise<string> {
    return guard('初始化安装时间', async () => {
      const existing = await this.get(META_KEYS.installedAt);
      if (existing !== null) {
        return existing;
      }
      await this.set(META_KEYS.installedAt, now, now);
      return now;
    });
  }
}
