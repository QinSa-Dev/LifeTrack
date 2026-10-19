import { readSchemaVersion, runMigrations, validateMigrations, type Migration } from '@/db/migrations';
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  MIGRATION_V1_BASELINE,
  MIGRATION_V2_EVENT_DEFINITIONS,
  MIGRATION_V3_EVENT_RECORDS,
} from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { MigrationError } from '@/domain/errors';

/**
 * 这些用例在**真实的内存 SQLite**（node:sqlite）上执行第一阶段的迁移 SQL，
 * 因此能验证 SQL 语法、约束与 PRAGMA 行为，而不只是断言函数被调用过。
 */

function tableExists(db: TestDatabase, name: string): boolean {
  const row = db.rawGet<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    name,
  );
  return row !== null;
}

describe('迁移清单校验', () => {
  it('版本号必须从 1 连续递增', () => {
    const broken: Migration[] = [
      { version: 1, name: 'a', statements: ['SELECT 1'] },
      { version: 3, name: 'b', statements: ['SELECT 1'] },
    ];
    expect(() => validateMigrations(broken)).toThrow(MigrationError);
  });

  it('缺少可执行内容要报错', () => {
    expect(() => validateMigrations([{ version: 1, name: 'empty' }])).toThrow(MigrationError);
  });

  it('当前仓库的迁移清单是合法的', () => {
    expect(() => validateMigrations(MIGRATIONS)).not.toThrow();
    expect(LATEST_SCHEMA_VERSION).toBe(3);
  });
});

describe('runMigrations', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('全新数据库：建表并提升 user_version', async () => {
    const result = await runMigrations(db, MIGRATIONS);

    expect(result).toEqual({ from: 0, to: 3, applied: [1, 2, 3] });
    expect(await readSchemaVersion(db)).toBe(3);
    expect(tableExists(db, 'app_meta')).toBe(true);
    expect(tableExists(db, 'event_definitions')).toBe(true);
    expect(tableExists(db, 'event_records')).toBe(true);
  });

  it('app_meta 结构符合预期（主键约束生效）', () => {
    db.rawExec(MIGRATION_V1_BASELINE.statements![0]!);

    const columns = db.rawAll<{ name: string; notnull: number; pk: number }>('PRAGMA table_info(app_meta)');
    expect(columns.map((c) => c.name)).toEqual(['key', 'value', 'updated_at']);
    expect(columns.find((c) => c.name === 'key')?.pk).toBe(1);

    db.rawExec("INSERT INTO app_meta (key, value, updated_at) VALUES ('k', 'v', 'now')");
    expect(() =>
      db.rawExec("INSERT INTO app_meta (key, value, updated_at) VALUES ('k', 'v2', 'now')"),
    ).toThrow();
  });

  it('重复执行是幂等的，不会重复应用', async () => {
    await runMigrations(db, MIGRATIONS);
    const second = await runMigrations(db, MIGRATIONS);

    expect(second).toEqual({ from: 3, to: 3, applied: [] });
  });

  it('数据库版本高于应用支持版本时拒绝启动，且不破坏数据', async () => {
    await runMigrations(db, MIGRATIONS);
    db.rawExec("INSERT INTO app_meta (key, value, updated_at) VALUES ('keep', 'me', 'now')");
    db.rawExec('PRAGMA user_version = 99');

    await expect(runMigrations(db, MIGRATIONS)).rejects.toThrow(MigrationError);

    // 关键：报错之后数据依然在，版本号也没被改动
    expect(db.rawGet("SELECT value FROM app_meta WHERE key = 'keep'")).toEqual({ value: 'me' });
    expect(await readSchemaVersion(db)).toBe(99);
  });

  it('迁移失败时整体回滚（SQL 与版本号原子性）', async () => {
    const failing: Migration[] = [
      {
        version: 1,
        name: 'partially_broken',
        statements: ['CREATE TABLE probe_a (id TEXT)', 'THIS IS NOT SQL'],
      },
    ];

    await expect(runMigrations(db, failing)).rejects.toThrow(MigrationError);

    // 第一条语句建的表必须被回滚掉，版本号保持 0
    expect(tableExists(db, 'probe_a')).toBe(false);
    expect(await readSchemaVersion(db)).toBe(0);
  });

  it('失败信息里带上是哪个迁移', async () => {
    const failing: Migration[] = [{ version: 1, name: 'boom', statements: ['NOPE'] }];
    await expect(runMigrations(db, failing)).rejects.toThrow(/boom/);
  });

  it('多步迁移按顺序执行', async () => {
    const chain: Migration[] = [
      { version: 1, name: 'one', statements: ['CREATE TABLE t1 (id TEXT)'] },
      { version: 2, name: 'two', statements: ['CREATE TABLE t2 (id TEXT)'] },
      {
        version: 3,
        name: 'three',
        up: async (txn) => {
          await txn.execAsync('CREATE TABLE t3 (id TEXT)');
        },
      },
    ];

    const result = await runMigrations(db, chain);

    expect(result).toEqual({ from: 0, to: 3, applied: [1, 2, 3] });
    expect(tableExists(db, 't1')).toBe(true);
    expect(tableExists(db, 't2')).toBe(true);
    expect(tableExists(db, 't3')).toBe(true);
  });

  it('从中途版本继续执行剩余迁移', async () => {
    const chain: Migration[] = [
      { version: 1, name: 'one', statements: ['CREATE TABLE t1 (id TEXT)'] },
      { version: 2, name: 'two', statements: ['CREATE TABLE t2 (id TEXT)'] },
    ];

    await runMigrations(db, [chain[0]!]);
    expect(await readSchemaVersion(db)).toBe(1);

    const result = await runMigrations(db, chain);
    expect(result).toEqual({ from: 1, to: 2, applied: [2] });
  });
});

describe('v2 事件定义结构', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  /** 插入最小可用的定义行，返回其 id */
  function insertDefinition(id: string, overrides: { groupId?: string | null } = {}): void {
    db.rawExec(
      `INSERT INTO event_definitions (id, name, kind, group_id, is_archived, sort_order, created_at, updated_at)
       VALUES ('${id}', '喝水', 'counter', ${overrides.groupId ? `'${overrides.groupId}'` : 'NULL'}, 0, 0, 'now', 'now')`,
    );
  }

  it('五张表都建了出来', () => {
    for (const table of [
      'event_groups',
      'tags',
      'event_definitions',
      'quick_options',
      'event_definition_tags',
    ]) {
      expect(tableExists(db, table)).toBe(true);
    }
  });

  it('kind 只接受 counter / quantity', () => {
    expect(() =>
      db.rawExec(
        `INSERT INTO event_definitions (id, name, kind, created_at, updated_at)
         VALUES ('x', 'n', 'count', 'now', 'now')`,
      ),
    ).toThrow();
  });

  it('is_archived 只接受 0 / 1', () => {
    expect(() =>
      db.rawExec(
        `INSERT INTO event_definitions (id, name, kind, is_archived, created_at, updated_at)
         VALUES ('x', 'n', 'counter', 2, 'now', 'now')`,
      ),
    ).toThrow();
  });

  it('删除分组把定义的 group_id 置空，而不是删除定义', () => {
    db.rawExec(
      `INSERT INTO event_groups (id, name, sort_order, created_at, updated_at)
       VALUES ('g1', '健康', 0, 'now', 'now')`,
    );
    insertDefinition('d1', { groupId: 'g1' });

    db.rawExec("DELETE FROM event_groups WHERE id = 'g1'");

    expect(db.rawGet("SELECT group_id FROM event_definitions WHERE id = 'd1'")).toEqual({
      group_id: null,
    });
  });

  it('删除定义级联清理快捷选项与标签关联，但保留标签与分组本身', () => {
    db.rawExec(
      `INSERT INTO event_groups (id, name, sort_order, created_at, updated_at)
       VALUES ('g1', '健康', 0, 'now', 'now')`,
    );
    db.rawExec(`INSERT INTO tags (id, name, created_at, updated_at) VALUES ('t1', '早晨', 'now', 'now')`);
    insertDefinition('d1', { groupId: 'g1' });
    db.rawExec(
      `INSERT INTO quick_options (id, definition_id, label, value, sort_order)
       VALUES ('q1', 'd1', '一杯', 1, 0)`,
    );
    db.rawExec(`INSERT INTO event_definition_tags (definition_id, tag_id) VALUES ('d1', 't1')`);

    db.rawExec("DELETE FROM event_definitions WHERE id = 'd1'");

    expect(db.rawAll("SELECT id FROM quick_options WHERE definition_id = 'd1'")).toEqual([]);
    expect(db.rawAll("SELECT definition_id FROM event_definition_tags WHERE definition_id = 'd1'")).toEqual(
      [],
    );
    // 分组与标签是独立配置，不受定义删除影响
    expect(db.rawGet("SELECT id FROM event_groups WHERE id = 'g1'")).toEqual({ id: 'g1' });
    expect(db.rawGet("SELECT id FROM tags WHERE id = 't1'")).toEqual({ id: 't1' });
  });

  it('外键生效：快捷选项不能指向不存在的定义', () => {
    expect(() =>
      db.rawExec(
        `INSERT INTO quick_options (id, definition_id, label, value, sort_order)
         VALUES ('q1', 'missing', '一杯', 1, 0)`,
      ),
    ).toThrow();
  });

  it('事件定义与标签是多对多，同一组合不能重复', () => {
    db.rawExec("INSERT INTO tags (id, name, created_at, updated_at) VALUES ('t1', '早晨', 'now', 'now')");
    insertDefinition('d1');
    db.rawExec("INSERT INTO event_definition_tags (definition_id, tag_id) VALUES ('d1', 't1')");

    expect(() =>
      db.rawExec("INSERT INTO event_definition_tags (definition_id, tag_id) VALUES ('d1', 't1')"),
    ).toThrow();
  });

  it('从已含 v1 数据的旧库升级：只跑 v2、v3，旧数据不丢', async () => {
    const legacy = createTestDatabase();
    try {
      await runMigrations(legacy, [MIGRATION_V1_BASELINE]);
      legacy.rawExec("INSERT INTO app_meta (key, value, updated_at) VALUES ('keep', 'me', 'now')");

      const result = await runMigrations(legacy, MIGRATIONS);

      expect(result).toEqual({ from: 1, to: 3, applied: [2, 3] });
      expect(await readSchemaVersion(legacy)).toBe(3);
      expect(legacy.rawGet("SELECT value FROM app_meta WHERE key = 'keep'")).toEqual({ value: 'me' });
      expect(tableExists(legacy, 'event_definitions')).toBe(true);
      expect(tableExists(legacy, 'event_records')).toBe(true);
    } finally {
      legacy.close();
    }
  });

  it('v2 语句本身可独立建表（不依赖 v1）', () => {
    const fresh = createTestDatabase();
    try {
      for (const statement of MIGRATION_V2_EVENT_DEFINITIONS.statements ?? []) {
        fresh.rawExec(statement);
      }
      expect(tableExists(fresh, 'quick_options')).toBe(true);
    } finally {
      fresh.close();
    }
  });
});

describe('v3 事件历史结构', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  function insertRecord(id: string, overrides: { definitionId?: string } = {}): void {
    db.rawExec(
      `INSERT INTO event_records
         (id, definition_id, kind, value, occurred_at, recorded_at, source, snapshot_name, snapshot_tag_ids)
       VALUES ('${id}', '${overrides.definitionId ?? 'd1'}', 'counter', 1, 'now', 'now', 'manual', '喝水', '[]')`,
    );
  }

  it('event_records 表建了出来', () => {
    expect(tableExists(db, 'event_records')).toBe(true);
  });

  it('kind / source 都受 CHECK 约束', () => {
    expect(() =>
      db.rawExec(
        `INSERT INTO event_records (id, definition_id, kind, value, occurred_at, recorded_at, source, snapshot_name)
         VALUES ('x', 'd1', 'count', 1, 'now', 'now', 'manual', 'n')`,
      ),
    ).toThrow();
    expect(() =>
      db.rawExec(
        `INSERT INTO event_records (id, definition_id, kind, value, occurred_at, recorded_at, source, snapshot_name)
         VALUES ('x', 'd1', 'counter', 1, 'now', 'now', 'auto', 'n')`,
      ),
    ).toThrow();
  });

  it('历史记录不依赖事件定义：指向不存在的定义也能写入', () => {
    // 没有外键约束，所以写一个不存在的 definition_id 不会失败
    expect(() => insertRecord('r1', { definitionId: 'ghost' })).not.toThrow();
    expect(db.rawGet("SELECT snapshot_name FROM event_records WHERE id = 'r1'")).toEqual({
      snapshot_name: '喝水',
    });
  });

  it('删除事件定义不会连带删除历史记录', () => {
    db.rawExec(
      `INSERT INTO event_definitions (id, name, kind, created_at, updated_at)
       VALUES ('d1', '喝水', 'counter', 'now', 'now')`,
    );
    insertRecord('r1');

    db.rawExec("DELETE FROM event_definitions WHERE id = 'd1'");

    expect(db.rawAll('SELECT id FROM event_records')).toEqual([{ id: 'r1' }]);
    // 快照仍在，历史可自证
    expect(db.rawGet("SELECT snapshot_name FROM event_records WHERE id = 'r1'")).toEqual({
      snapshot_name: '喝水',
    });
  });

  it('v3 语句本身可独立建表', () => {
    const fresh = createTestDatabase();
    try {
      for (const statement of MIGRATION_V3_EVENT_RECORDS.statements ?? []) {
        fresh.rawExec(statement);
      }
      expect(tableExists(fresh, 'event_records')).toBe(true);
    } finally {
      fresh.close();
    }
  });
});
