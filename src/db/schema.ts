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

/**
 * v2：事件定义相关结构（第二阶段第 1 项）。
 *
 * 覆盖：分组、标签、事件定义、快捷选项，以及「事件定义 ↔ 标签」多对多关系。
 *
 * 数据安全与领域规则的体现：
 * - 删除分组只把 `event_definitions.group_id` 置空（`ON DELETE SET NULL`），
 *   **不连带删除任何事件定义**，更不触碰历史记录。
 * - 删除事件定义会级联清理它的快捷选项与标签关联（`ON DELETE CASCADE`），
 *   这两种数据只对所属定义有意义；历史记录不在此库、不受影响。
 * - 归档用 `is_archived`（0/1），是 UPDATE，不删行。
 * - 时间统一 ISO-8601 文本；布尔用 INTEGER 0/1 并用 CHECK 约束取值范围。
 */
export const MIGRATION_V2_EVENT_DEFINITIONS: Migration = {
  version: 2,
  name: 'event_groups_tags_definitions',
  statements: [
    `CREATE TABLE event_groups (
       id         TEXT    PRIMARY KEY NOT NULL,
       name       TEXT    NOT NULL,
       color      TEXT,
       sort_order INTEGER NOT NULL DEFAULT 0,
       created_at TEXT    NOT NULL,
       updated_at TEXT    NOT NULL
     );`,
    `CREATE TABLE tags (
       id         TEXT    PRIMARY KEY NOT NULL,
       name       TEXT    NOT NULL,
       color      TEXT,
       created_at TEXT    NOT NULL,
       updated_at TEXT    NOT NULL
     );`,
    `CREATE TABLE event_definitions (
       id          TEXT    PRIMARY KEY NOT NULL,
       name        TEXT    NOT NULL,
       kind        TEXT    NOT NULL CHECK (kind IN ('counter', 'quantity')),
       unit        TEXT,
       group_id    TEXT    REFERENCES event_groups(id) ON DELETE SET NULL,
       color       TEXT,
       icon        TEXT,
       is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
       sort_order  INTEGER NOT NULL DEFAULT 0,
       created_at  TEXT    NOT NULL,
       updated_at  TEXT    NOT NULL
     );`,
    `CREATE TABLE quick_options (
       id            TEXT    PRIMARY KEY NOT NULL,
       definition_id TEXT    NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
       label         TEXT    NOT NULL,
       value         REAL    NOT NULL,
       unit          TEXT,
       sort_order    INTEGER NOT NULL DEFAULT 0
     );`,
    `CREATE TABLE event_definition_tags (
       definition_id TEXT NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
       tag_id        TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
       PRIMARY KEY (definition_id, tag_id)
     );`,
    // 外键列与高频查询方向建索引
    `CREATE INDEX idx_event_definitions_group_id ON event_definitions(group_id);`,
    `CREATE INDEX idx_quick_options_definition_id ON quick_options(definition_id);`,
    `CREATE INDEX idx_event_definition_tags_tag_id ON event_definition_tags(tag_id);`,
  ],
};

/** 全部迁移，顺序即执行顺序。 */
export const MIGRATIONS: readonly Migration[] = [MIGRATION_V1_BASELINE, MIGRATION_V2_EVENT_DEFINITIONS];

/** 当前应用支持的 schema 版本。 */
export const LATEST_SCHEMA_VERSION =
  MIGRATIONS.length === 0 ? 0 : (MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0);
