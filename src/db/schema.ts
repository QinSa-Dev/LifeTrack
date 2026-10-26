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
  /**
   * 时间轴的筛选与排序（一段 JSON，见 `features/records/timelineQuery.ts`）。
   * 与显示方式同一个理由：只影响「怎么读」，不改库里的事实，所以存在这里（零迁移）。
   */
  timelineQuery: 'app.timeline_query',
  /**
   * 周期预测窗口：预测时回看最近几段「实际间隔」取平均（默认 3）。
   * 只影响预测怎么算，不改库里的事实，同样存在这里（零迁移）。
   */
  predictionWindow: 'app.prediction_window',
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

/**
 * v6：周期并入事件定义，「单位」改为「属性」。
 *
 * 产品模型变了：**周期不再是独立的一类东西，而是事件的一个类型**
 * （`kind IN ('counter', 'cycle')`），所以 `cycle_definitions` 整体并进
 * `event_definitions`；又因为「数量」不再是一种类型（记多少改成用户自定义的
 * 「属性」自由文本），`unit` 一律改名 `attribute`。
 *
 * 数据怎么搬：
 * - 事件定义：`quantity` 统一并入 `counter`；单个 `unit` 包成属性列表
 *   （v6 起属性可以是多条，例如「温水」「500ml」）；
 * - 周期定义：写进 `event_definitions`，**沿用原来的 id**，
 *   因此 `cycle_instances.definition_id` 的取值一个都不用改；
 * - 快捷选项：原来「名称 + 取值 + 单位」合并成「属性 + 取值」，
 *   属性取 `COALESCE(unit, label)`——有单位用单位（它是记多少的量纲），
 *   没有就退而用原来的名称；
 * - 周期实例 / 周期记录 / 历史记录：一行不丢，只是换了所属表的指向与列名。
 *
 * 属性列表用 `json_array()` 生成：手写字符串拼接在属性里带引号时会拼出坏 JSON，
 * 交给 SQLite 的 JSON 函数转义才可靠（一条都不写时存 `'[]'`）。
 *
 * 为什么必须重建表：`kind` 的 CHECK 约束与列名都改不了 ALTER；
 * 而连接上 `PRAGMA foreign_keys = ON`，迁移又在事务里跑（SQLite 规定
 * 事务内改不动这个 PRAGMA），所以用「旧表改名 → 建同名新表 → 搬数据 →
 * 重建引用它的子表 → 删旧表」的顺序，全程不依赖关外键。
 */
export const MIGRATION_V6_CYCLE_AS_EVENT_KIND: Migration = {
  version: 6,
  name: 'cycle_as_event_kind_and_attributes',
  statements: [
    // --- 1. 事件定义：类型集合改成 counter / cycle，unit → attributes，并带上周期字段 ---
    `ALTER TABLE event_definitions RENAME TO event_definitions_old;`,
    `CREATE TABLE event_definitions (
       id                         TEXT    PRIMARY KEY NOT NULL,
       name                       TEXT    NOT NULL,
       kind                       TEXT    NOT NULL CHECK (kind IN ('counter', 'cycle')),
       attributes                 TEXT    NOT NULL DEFAULT '[]',
       group_id                   TEXT    REFERENCES event_groups(id) ON DELETE SET NULL,
       color                      TEXT,
       icon                       TEXT,
       is_archived                INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
       sort_order                 INTEGER NOT NULL DEFAULT 0,
       cycle_mode                 TEXT    CHECK (cycle_mode IS NULL OR cycle_mode IN ('auto', 'manual')),
       average_cycle_length_days  INTEGER CHECK (average_cycle_length_days IS NULL OR average_cycle_length_days > 0),
       average_period_length_days INTEGER CHECK (average_period_length_days IS NULL OR average_period_length_days > 0),
       created_at                 TEXT    NOT NULL,
       updated_at                 TEXT    NOT NULL,
       CHECK ((kind = 'cycle') = (cycle_mode IS NOT NULL))
     );`,
    `INSERT INTO event_definitions
       (id, name, kind, attributes, group_id, color, icon, is_archived, sort_order,
        cycle_mode, average_cycle_length_days, average_period_length_days, created_at, updated_at)
     SELECT id, name, CASE kind WHEN 'quantity' THEN 'counter' ELSE kind END,
            CASE WHEN unit IS NULL OR trim(unit) = '' THEN '[]' ELSE json_array(unit) END,
            group_id, color, icon,
            is_archived, sort_order, NULL, NULL, NULL, created_at, updated_at
       FROM event_definitions_old;`,
    `INSERT INTO event_definitions
       (id, name, kind, attributes, group_id, color, icon, is_archived, sort_order,
        cycle_mode, average_cycle_length_days, average_period_length_days, created_at, updated_at)
     SELECT id, name, 'cycle', '[]', NULL, NULL, NULL, is_archived, 0,
            'manual', average_cycle_length_days, average_period_length_days, created_at, updated_at
       FROM cycle_definitions;`,
    // 索引跟着改名的表走，先删掉再在新表上重建
    `DROP INDEX idx_event_definitions_group_id;`,
    `CREATE INDEX idx_event_definitions_group_id ON event_definitions(group_id);`,
    // --- 2. 定义的子表：外键重新指向新表（快捷选项合并成「属性 + 取值」） ---
    `CREATE TABLE quick_options_new (
       id            TEXT    PRIMARY KEY NOT NULL,
       definition_id TEXT    NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
       attribute     TEXT,
       value         REAL    NOT NULL,
       sort_order    INTEGER NOT NULL DEFAULT 0
     );`,
    `INSERT INTO quick_options_new (id, definition_id, attribute, value, sort_order)
     SELECT id, definition_id,
            CASE WHEN unit IS NULL OR trim(unit) = '' THEN label ELSE unit END,
            value, sort_order
       FROM quick_options;`,
    `DROP TABLE quick_options;`,
    `ALTER TABLE quick_options_new RENAME TO quick_options;`,
    `CREATE INDEX idx_quick_options_definition_id ON quick_options(definition_id);`,
    `CREATE TABLE event_definition_tags_new (
       definition_id TEXT NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
       tag_id        TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
       PRIMARY KEY (definition_id, tag_id)
     );`,
    `INSERT INTO event_definition_tags_new (definition_id, tag_id)
     SELECT definition_id, tag_id FROM event_definition_tags;`,
    `DROP TABLE event_definition_tags;`,
    `ALTER TABLE event_definition_tags_new RENAME TO event_definition_tags;`,
    `CREATE INDEX idx_event_definition_tags_tag_id ON event_definition_tags(tag_id);`,
    `DROP TABLE event_definitions_old;`,
    // --- 3. 历史记录：unit → attributes（快照语义不变，一行不丢） ---
    `CREATE TABLE event_records_new (
       id                  TEXT    PRIMARY KEY NOT NULL,
       definition_id       TEXT    NOT NULL,
       kind                TEXT    NOT NULL CHECK (kind IN ('counter', 'quantity')),
       value               REAL    NOT NULL,
       attributes          TEXT    NOT NULL DEFAULT '[]',
       occurred_at         TEXT    NOT NULL,
       recorded_at         TEXT    NOT NULL,
       note                TEXT,
       source              TEXT    NOT NULL CHECK (source IN ('manual', 'quick', 'backfill')),
       deleted_at          TEXT,
       snapshot_name       TEXT    NOT NULL,
       snapshot_attributes TEXT    NOT NULL DEFAULT '[]',
       snapshot_group_id   TEXT,
       snapshot_tag_ids    TEXT    NOT NULL DEFAULT '[]'
     );`,
    `INSERT INTO event_records_new
       (id, definition_id, kind, value, attributes, occurred_at, recorded_at, note, source, deleted_at,
        snapshot_name, snapshot_attributes, snapshot_group_id, snapshot_tag_ids)
     SELECT id, definition_id, kind, value,
            CASE WHEN unit IS NULL OR trim(unit) = '' THEN '[]' ELSE json_array(unit) END,
            occurred_at, recorded_at, note, source, deleted_at,
            snapshot_name,
            CASE WHEN snapshot_unit IS NULL OR trim(snapshot_unit) = '' THEN '[]'
                 ELSE json_array(snapshot_unit) END,
            snapshot_group_id, snapshot_tag_ids
       FROM event_records;`,
    `DROP TABLE event_records;`,
    `ALTER TABLE event_records_new RENAME TO event_records;`,
    `CREATE INDEX idx_event_records_occurred_at ON event_records(occurred_at DESC);`,
    `CREATE INDEX idx_event_records_definition_id ON event_records(definition_id);`,
    // --- 4. 周期实例 / 记录：外键从 cycle_definitions 改指 event_definitions ---
    `ALTER TABLE cycle_instances RENAME TO cycle_instances_old;`,
    `CREATE TABLE cycle_instances (
       id            TEXT    PRIMARY KEY NOT NULL,
       definition_id TEXT    NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
       start_date    TEXT    NOT NULL,
       end_date      TEXT,
       note          TEXT,
       created_at    TEXT    NOT NULL,
       updated_at    TEXT    NOT NULL,
       CHECK (end_date IS NULL OR end_date >= start_date)
     );`,
    `INSERT INTO cycle_instances (id, definition_id, start_date, end_date, note, created_at, updated_at)
     SELECT id, definition_id, start_date, end_date, note, created_at, updated_at FROM cycle_instances_old;`,
    `DROP INDEX idx_cycle_instances_definition_id;`,
    `DROP INDEX idx_cycle_instances_start_date;`,
    `CREATE INDEX idx_cycle_instances_definition_id ON cycle_instances(definition_id);`,
    `CREATE INDEX idx_cycle_instances_start_date ON cycle_instances(start_date DESC);`,
    `CREATE TABLE cycle_entries_new (
       id          TEXT    PRIMARY KEY NOT NULL,
       instance_id TEXT    NOT NULL REFERENCES cycle_instances(id) ON DELETE CASCADE,
       date        TEXT    NOT NULL,
       phase       TEXT,
       symptoms    TEXT    NOT NULL DEFAULT '[]',
       feelings    TEXT,
       note        TEXT,
       created_at  TEXT    NOT NULL,
       updated_at  TEXT    NOT NULL,
       deleted_at  TEXT
     );`,
    `INSERT INTO cycle_entries_new
       (id, instance_id, date, phase, symptoms, feelings, note, created_at, updated_at, deleted_at)
     SELECT id, instance_id, date, phase, symptoms, feelings, note, created_at, updated_at, deleted_at
       FROM cycle_entries;`,
    `DROP TABLE cycle_entries;`,
    `ALTER TABLE cycle_entries_new RENAME TO cycle_entries;`,
    `CREATE UNIQUE INDEX idx_cycle_entries_instance_date ON cycle_entries(instance_id, date);`,
    `DROP TABLE cycle_instances_old;`,
    `DROP TABLE cycle_definitions;`,
  ],
};

/**
 * 迁移里用到的极小 JSON 解析：**故意不依赖 `domain/validation` 的 `readTextList`**。
 *
 * 迁移是历史的一部分——它一旦在别人的库上跑过就固定了。若它调用会随版本演进变化的
 * 业务函数，同一个迁移在「今天」和「明年」就可能跑出不同结果。所以这里自带一份最小实现。
 */
function parseStringArray(json: string): string[] {
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

/** 仅迁移内部使用：生成一个 UUID 形状的字段主键（与运行时 `newId` 同形，但不依赖它）。 */
function migrationUuid(): string {
  // 版本位固定 7、变体位固定 8：形状上就是 UUID v7，`assertEntityId` 认它。
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i += 1) {
    out += hex[Math.floor(Math.random() * 16)];
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-7${out.slice(13, 16)}-8${out.slice(17, 20)}-${out.slice(20, 32)}`;
}

/**
 * v7：**自定义字段替换全局标签**（第二阶段·自定义字段）。
 *
 * 产品模型又变了一次：事件定义上的「标签」不再是一个全局共享的实体，而是**每个事件
 * 自己的一组带类型的字段**（枚举单选 / 多选、时间点、时间段）。记录时给这些字段选值，
 * 值随记录一起存下来（快照里带上字段定义，历史照样能自证）。
 *
 * 现有标签数据怎么搬（**不丢**）：
 * - 给每个「本来挂着标签」的定义造**一条多选字段**（名字就叫「标签」，选项 = 这些标签名）；
 * - 该定义下每条记录原本的快照标签值，一并搬成这条字段的取值；
 * - 选项取「定义当前挂的标签」∪「它记录里出现过的标签」的并集，避免历史值落在选项之外。
 *
 * 为什么 `event_records` 要重建：要把 `snapshot_tag_ids` 换成 `snapshot_fields` 并新增
 * `field_values`，SQLite 改不了列名/删列，只能重建。好在这张表**没有外键、也没有谁引用它**
 * （历史独立于定义），重建不会牵连别人。
 *
 * 为什么 `tags` / `event_definition_tags` 直接删掉：标签已被字段取代，且数据都已经折算完；
 * 留着一张没人用的表只会让后来的人猜它还要不要维护。
 */
export const MIGRATION_V7_CUSTOM_FIELDS: Migration = {
  version: 7,
  name: 'custom_fields_replace_tags',
  statements: [
    `CREATE TABLE event_definition_fields (
       id            TEXT    PRIMARY KEY NOT NULL,
       definition_id TEXT    NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
       name          TEXT    NOT NULL,
       kind          TEXT    NOT NULL CHECK (kind IN ('single', 'multi', 'time', 'range')),
       options       TEXT    NOT NULL DEFAULT '[]',
       sort_order    INTEGER NOT NULL DEFAULT 0,
       created_at    TEXT    NOT NULL,
       updated_at    TEXT    NOT NULL
     );`,
    `CREATE INDEX idx_event_definition_fields_definition_id ON event_definition_fields(definition_id);`,
  ],
  up: async (db) => {
    const now = new Date().toISOString();

    // --- 1. 读出现有标签：id → 名称，以及「定义 → 挂着的标签 id」---
    const tagNameById = new Map<string, string>();
    for (const row of await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM tags')) {
      tagNameById.set(row.id, row.name);
    }
    const tagIdsByDefinition = new Map<string, string[]>();
    for (const row of await db.getAllAsync<{ definition_id: string; tag_id: string }>(
      'SELECT definition_id, tag_id FROM event_definition_tags',
    )) {
      const list = tagIdsByDefinition.get(row.definition_id) ?? [];
      list.push(row.tag_id);
      tagIdsByDefinition.set(row.definition_id, list);
    }

    // 自定义字段只有计数型使用（周期型记的是「哪一天」），所以只有计数型定义才折标签。
    const definitionKindById = new Map<string, string>();
    for (const row of await db.getAllAsync<{ id: string; kind: string }>(
      'SELECT id, kind FROM event_definitions',
    )) {
      definitionKindById.set(row.id, row.kind);
    }

    // --- 2. 读出全部记录，收集「记录里出现过」的标签 id（补全字段选项用）---
    const recordRows = await db.getAllAsync<{ id: string; definition_id: string; snapshot_tag_ids: string }>(
      'SELECT id, definition_id, snapshot_tag_ids FROM event_records',
    );
    const snapshotTagIdsByRecord = new Map<string, string[]>();
    const observedByDefinition = new Map<string, Set<string>>();
    for (const row of recordRows) {
      const ids = parseStringArray(row.snapshot_tag_ids);
      snapshotTagIdsByRecord.set(row.id, ids);
      const observed = observedByDefinition.get(row.definition_id) ?? new Set<string>();
      for (const id of ids) {
        observed.add(id);
      }
      observedByDefinition.set(row.definition_id, observed);
    }

    // --- 3. 给「本来有标签」的定义各造一条「标签」多选字段 ---
    const fieldByDefinition = new Map<string, { id: string; options: string[] }>();
    const definitionIds = new Set<string>([...tagIdsByDefinition.keys(), ...observedByDefinition.keys()]);
    for (const definitionId of definitionIds) {
      if (definitionKindById.get(definitionId) !== 'counter') {
        continue;
      }
      const names = new Set<string>();
      for (const tagId of tagIdsByDefinition.get(definitionId) ?? []) {
        const name = tagNameById.get(tagId);
        if (name !== undefined) {
          names.add(name);
        }
      }
      for (const tagId of observedByDefinition.get(definitionId) ?? []) {
        const name = tagNameById.get(tagId);
        if (name !== undefined) {
          names.add(name);
        }
      }
      if (names.size === 0) {
        continue;
      }
      const options = [...names].sort();
      const fieldId = migrationUuid();
      await db.runAsync(
        `INSERT INTO event_definition_fields
           (id, definition_id, name, kind, options, sort_order, created_at, updated_at)
         VALUES (?, ?, '标签', 'multi', ?, 0, ?, ?)`,
        fieldId,
        definitionId,
        JSON.stringify(options),
        now,
        now,
      );
      fieldByDefinition.set(definitionId, { id: fieldId, options });
    }

    // --- 4. 重建 event_records：snapshot_tag_ids → snapshot_fields + field_values ---
    await db.execAsync(
      `CREATE TABLE event_records_new (
         id                  TEXT    PRIMARY KEY NOT NULL,
         definition_id       TEXT    NOT NULL,
         kind                TEXT    NOT NULL CHECK (kind IN ('counter', 'quantity')),
         value               REAL    NOT NULL,
         attributes          TEXT    NOT NULL DEFAULT '[]',
         occurred_at         TEXT    NOT NULL,
         recorded_at         TEXT    NOT NULL,
         note                TEXT,
         source              TEXT    NOT NULL CHECK (source IN ('manual', 'quick', 'backfill')),
         deleted_at          TEXT,
         snapshot_name       TEXT    NOT NULL,
         snapshot_attributes TEXT    NOT NULL DEFAULT '[]',
         snapshot_group_id   TEXT,
         snapshot_fields     TEXT    NOT NULL DEFAULT '[]',
         field_values        TEXT    NOT NULL DEFAULT '[]'
       );`,
    );
    for (const row of recordRows) {
      const field = fieldByDefinition.get(row.definition_id);
      const values = (snapshotTagIdsByRecord.get(row.id) ?? [])
        .map((tagId) => tagNameById.get(tagId))
        .filter((name): name is string => name !== undefined);
      const fieldValues = field && values.length > 0 ? [{ fieldId: field.id, values }] : [];
      const snapshotFields = field
        ? [{ id: field.id, name: '标签', kind: 'multi', options: field.options }]
        : [];
      await db.runAsync(
        `INSERT INTO event_records_new
           (id, definition_id, kind, value, attributes, occurred_at, recorded_at, note, source, deleted_at,
            snapshot_name, snapshot_attributes, snapshot_group_id, snapshot_fields, field_values)
         SELECT id, definition_id, kind, value, attributes, occurred_at, recorded_at, note, source, deleted_at,
                snapshot_name, snapshot_attributes, snapshot_group_id, ?, ?
           FROM event_records WHERE id = ?`,
        JSON.stringify(snapshotFields),
        JSON.stringify(fieldValues),
        row.id,
      );
    }
    await db.execAsync('DROP TABLE event_records;');
    await db.execAsync('ALTER TABLE event_records_new RENAME TO event_records;');
    await db.execAsync('CREATE INDEX idx_event_records_occurred_at ON event_records(occurred_at DESC);');
    await db.execAsync('CREATE INDEX idx_event_records_definition_id ON event_records(definition_id);');

    // --- 5. 卸磨杀驴：标签表不再需要（先删子表，避免外键挡住 DROP）---
    await db.execAsync('DROP TABLE event_definition_tags;');
    await db.execAsync('DROP TABLE tags;');
  },
};

/** 全部迁移，顺序即执行顺序。 */
export const MIGRATIONS: readonly Migration[] = [
  MIGRATION_V1_BASELINE,
  MIGRATION_V2_EVENT_DEFINITIONS,
  MIGRATION_V3_EVENT_RECORDS,
  MIGRATION_V4_CYCLE,
  MIGRATION_V5_CYCLE_ENTRY_SOFT_DELETE,
  MIGRATION_V6_CYCLE_AS_EVENT_KIND,
  MIGRATION_V7_CUSTOM_FIELDS,
];

/** 当前应用支持的 schema 版本。 */
export const LATEST_SCHEMA_VERSION =
  MIGRATIONS.length === 0 ? 0 : (MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0);
