/**
 * 数据库 schema 与迁移清单。
 *
 * 约定：
 * - 新增结构一律**追加**一个新的 Migration，禁止改动已发布迁移的内容。
 * - 时间统一存 ISO-8601 文本（可排序、可直接比较），布尔存 INTEGER 0/1。
 */

import type { Migration } from './migrations';

/** app_meta 的键名集中管理，避免各处散落魔法字符串 */
export const META_KEYS = {
  /** 应用安装后首次启动时间 */
  installedAt: 'app.installed_at',
  /** 应用启动次数（用于验证跨重启持久化） */
  launchCount: 'app.launch_count',
} as const;

/**
 * v1：基线。
 *
 * 只建立应用元信息表；它同时承担「启动次数」这类跨重启持久化的验证载体。
 * 业务表在第二阶段以 v2 追加，用来验证迁移机制真的可以增量演进。
 */
export const MIGRATION_V1_BASELINE: Migration = {
  version: 1,
  name: 'baseline_app_meta',
  statements: [
    `CREATE TABLE app_meta (
       key        TEXT    PRIMARY KEY NOT NULL,
       value      TEXT    NOT NULL,
       updated_at TEXT    NOT NULL
     );`,
  ],
};

/** 全部迁移，顺序即执行顺序。 */
export const MIGRATIONS: readonly Migration[] = [MIGRATION_V1_BASELINE];

/** 当前应用支持的 schema 版本。 */
export const LATEST_SCHEMA_VERSION =
  MIGRATIONS.length === 0 ? 0 : (MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0);
