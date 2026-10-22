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
  /**
   * 时间轴显示方式：`expanded`（逐条展开）/ `merged`（同类合并）。
   * 纯展示偏好，存这里就不用为它加表或加列。
   */
  timelineView: 'app.timeline_view',
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

/**
 * v3：事件历史记录（第二阶段第 2 项）。
 *
 * 关键设计：`event_records` **故意不建指向 `event_definitions` 的外键**。
 * 领域规则是「删改定义不影响已产生的历史」，若加了 `ON DELETE CASCADE`，
 * 永久删除定义会把历史一起抹掉；若加 `RESTRICT`，又会让定义无法删除。
 * 因此这里用「定义 id + 完整快照」的方式保存历史：定义没了，历史仍能独立展示。
 *
 * 快照字段（`snapshot_*`）在「记录的那一刻」写入，之后永不更新。
 * `snapshot_tag_ids` 存 JSON 数组文本（快照要自洽，不想再依赖 tags 表）。
 * `source` 区分手动 / 快捷 / 补录；`deleted_at` 供后续「撤销/软删除」使用。
 */
export const MIGRATION_V3_EVENT_RECORDS: Migration = {
  version: 3,
  name: 'event_records',
  statements: [
    `CREATE TABLE event_records (
       id                 TEXT    PRIMARY KEY NOT NULL,
       definition_id      TEXT    NOT NULL,
       kind               TEXT    NOT NULL CHECK (kind IN ('counter', 'quantity')),
       value              REAL    NOT NULL,
       unit               TEXT,
       occurred_at        TEXT    NOT NULL,
       recorded_at        TEXT    NOT NULL,
       note               TEXT,
       source             TEXT    NOT NULL CHECK (source IN ('manual', 'quick', 'backfill')),
       deleted_at         TEXT,
       snapshot_name      TEXT    NOT NULL,
       snapshot_unit      TEXT,
       snapshot_group_id  TEXT,
       snapshot_tag_ids   TEXT    NOT NULL DEFAULT '[]'
     );`,
    `CREATE INDEX idx_event_records_occurred_at ON event_records(occurred_at DESC);`,
    `CREATE INDEX idx_event_records_definition_id ON event_records(definition_id);`,
  ],
};

/**
 * v4：周期（第二阶段·周期事件）。
 *
 * 三张表对应 03 里定义的三个领域概念，**实例与记录独立建模**：
 * - `cycle_definitions`：周期定义（例如「生理期」）+ 预测用的平均长度。
 * - `cycle_instances`：一段真实的周期区间；`end_date` 为空表示仍在进行中。
 * - `cycle_entries`：周期内某一天的记录（症状 / 阶段 / 感受 / 备注）。
 *
 * 规则落点：
 * - **边界修改不得静默删除越界记录**：这条由仓储层保证——更新边界前先查
 *   `cycle_entries` 里落在新区间外的日期，有就抛 ConflictError，绝不偷偷删。
 *   SQL 层只加 `CHECK (end_date IS NULL OR end_date >= start_date)` 兜住明显错误。
 * - **一天一条**：`UNIQUE (instance_id, date)` 从结构上保证同一天不会写两条。
 * - 实例删除会级联删掉它的记录（`ON DELETE CASCADE`）：记录只对所属实例有意义；
 *   界面上的永久删除有二次确认。
 */
export const MIGRATION_V4_CYCLE: Migration = {
  version: 4,
  name: 'cycle_definitions_instances_entries',
  statements: [
    `CREATE TABLE cycle_definitions (
       id                         TEXT    PRIMARY KEY NOT NULL,
       name                       TEXT    NOT NULL,
       average_cycle_length_days  INTEGER CHECK (average_cycle_length_days IS NULL OR average_cycle_length_days > 0),
       average_period_length_days INTEGER CHECK (average_period_length_days IS NULL OR average_period_length_days > 0),
       is_archived                INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
       created_at                 TEXT    NOT NULL,
       updated_at                 TEXT    NOT NULL
     );`,
    `CREATE TABLE cycle_instances (
       id            TEXT    PRIMARY KEY NOT NULL,
       definition_id TEXT    NOT NULL REFERENCES cycle_definitions(id) ON DELETE CASCADE,
       start_date    TEXT    NOT NULL,
       end_date      TEXT,
       note          TEXT,
       created_at    TEXT    NOT NULL,
       updated_at    TEXT    NOT NULL,
       CHECK (end_date IS NULL OR end_date >= start_date)
     );`,
    `CREATE TABLE cycle_entries (
       id          TEXT    PRIMARY KEY NOT NULL,
       instance_id TEXT    NOT NULL REFERENCES cycle_instances(id) ON DELETE CASCADE,
       date        TEXT    NOT NULL,
       phase       TEXT,
       symptoms    TEXT    NOT NULL DEFAULT '[]',
       feelings    TEXT,
       note        TEXT,
       created_at  TEXT    NOT NULL,
       updated_at  TEXT    NOT NULL
     );`,
    // 一天一条记录：从结构上避免同一天写两遍
    `CREATE UNIQUE INDEX idx_cycle_entries_instance_date ON cycle_entries(instance_id, date);`,
    `CREATE INDEX idx_cycle_instances_definition_id ON cycle_instances(definition_id);`,
    `CREATE INDEX idx_cycle_instances_start_date ON cycle_instances(start_date DESC);`,
  ],
};

/**
 * v5：周期内记录也能软删除（第二阶段第 6 项）。
 *
 * v4 里 `cycle_entries` 是**真删**，防手滑只能靠二次确认。现在补 `deleted_at`，
 * 与 `event_records` 的软删除对齐：周期页的删除先变成软删除（可撤销），
 * 由回收站决定恢复还是永久删除。
 *
 * 为什么不改 v4：迁移一旦在别人的库上跑过就是历史，改它等于让两份历史分叉；
 * 而且 `ALTER TABLE ... ADD COLUMN` 正是 SQLite 支持的增量操作——
 * 旧行自动是 NULL，语义天然是「未删除」，不需要回填。
 *
 * 不加 `deleted_at` 索引：回收站一次只列出软删除的行（数量很小），
 * 按实例查记录走的是已有的 `idx_cycle_entries_instance_date`。
 */
export const MIGRATION_V5_CYCLE_ENTRY_SOFT_DELETE: Migration = {
  version: 5,
  name: 'cycle_entry_soft_delete',
  statements: [`ALTER TABLE cycle_entries ADD COLUMN deleted_at TEXT;`],
};

/** 全部迁移，顺序即执行顺序。 */
export const MIGRATIONS: readonly Migration[] = [
  MIGRATION_V1_BASELINE,
  MIGRATION_V2_EVENT_DEFINITIONS,
  MIGRATION_V3_EVENT_RECORDS,
  MIGRATION_V4_CYCLE,
  MIGRATION_V5_CYCLE_ENTRY_SOFT_DELETE,
];

/** 当前应用支持的 schema 版本。 */
export const LATEST_SCHEMA_VERSION =
  MIGRATIONS.length === 0 ? 0 : (MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0);
