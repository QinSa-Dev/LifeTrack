import { readSchemaVersion, runMigrations, validateMigrations, type Migration } from '@/db/migrations';
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  MIGRATION_V1_BASELINE,
  MIGRATION_V2_EVENT_DEFINITIONS,
  MIGRATION_V3_EVENT_RECORDS,
  MIGRATION_V4_CYCLE,
  MIGRATION_V5_CYCLE_ENTRY_SOFT_DELETE,
  MIGRATION_V6_CYCLE_AS_EVENT_KIND,
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

/** 只跑到某个版本为止：各版本的结构用例不该被后来的迁移改写的表影响。 */
function upTo(version: number): Migration[] {
  return MIGRATIONS.filter((migration) => migration.version <= version);
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
    expect(LATEST_SCHEMA_VERSION).toBe(6);
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

    expect(result).toEqual({ from: 0, to: 6, applied: [1, 2, 3, 4, 5, 6] });
    expect(await readSchemaVersion(db)).toBe(6);
    expect(tableExists(db, 'app_meta')).toBe(true);
    expect(tableExists(db, 'event_definitions')).toBe(true);
    expect(tableExists(db, 'event_records')).toBe(true);
    expect(tableExists(db, 'cycle_instances')).toBe(true);
    expect(tableExists(db, 'cycle_entries')).toBe(true);
    // v6 起周期不再是独立的定义表
    expect(tableExists(db, 'cycle_definitions')).toBe(false);
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

    expect(second).toEqual({ from: 6, to: 6, applied: [] });
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

  it('kind 只接受 counter / cycle（「数量」不再是类型，只留在历史记录里）', () => {
    expect(() =>
      db.rawExec(
        `INSERT INTO event_definitions (id, name, kind, created_at, updated_at)
         VALUES ('x', 'n', 'count', 'now', 'now')`,
      ),
    ).toThrow();
    expect(() =>
      db.rawExec(
        `INSERT INTO event_definitions (id, name, kind, created_at, updated_at)
         VALUES ('x', 'n', 'quantity', 'now', 'now')`,
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
      `INSERT INTO quick_options (id, definition_id, attribute, value, sort_order)
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
        `INSERT INTO quick_options (id, definition_id, attribute, value, sort_order)
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

  it('从已含 v1 数据的旧库升级：只跑 v2 之后的迁移，旧数据不丢', async () => {
    const legacy = createTestDatabase();
    try {
      await runMigrations(legacy, [MIGRATION_V1_BASELINE]);
      legacy.rawExec("INSERT INTO app_meta (key, value, updated_at) VALUES ('keep', 'me', 'now')");

      const result = await runMigrations(legacy, MIGRATIONS);

      expect(result).toEqual({ from: 1, to: 6, applied: [2, 3, 4, 5, 6] });
      expect(await readSchemaVersion(legacy)).toBe(6);
      expect(legacy.rawGet("SELECT value FROM app_meta WHERE key = 'keep'")).toEqual({ value: 'me' });
      expect(tableExists(legacy, 'event_definitions')).toBe(true);
      expect(tableExists(legacy, 'event_records')).toBe(true);
      expect(tableExists(legacy, 'cycle_instances')).toBe(true);
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

describe('v4 周期结构', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = createTestDatabase();
    // 只跑到 v4：v6 会把 cycle_definitions 并进 event_definitions，
    // 那之后再验证「周期有三张表」已经不是这套结构了
    await runMigrations(db, upTo(4));
  });

  afterEach(() => {
    db.close();
  });

  function insertDefinition(id = 'cd1'): void {
    db.rawExec(
      `INSERT INTO cycle_definitions (id, name, created_at, updated_at)
       VALUES ('${id}', '生理期', 'now', 'now')`,
    );
  }

  function insertInstance(id = 'ci1', startDate = '2026-10-01', endDate: string | null = null): void {
    const end = endDate === null ? 'NULL' : `'${endDate}'`;
    db.rawExec(
      `INSERT INTO cycle_instances (id, definition_id, start_date, end_date, created_at, updated_at)
       VALUES ('${id}', 'cd1', '${startDate}', ${end}, 'now', 'now')`,
    );
  }

  function insertEntry(id = 'ce1', date = '2026-10-02'): void {
    db.rawExec(
      `INSERT INTO cycle_entries (id, instance_id, date, created_at, updated_at)
       VALUES ('${id}', 'ci1', '${date}', 'now', 'now')`,
    );
  }

  it('三张表都建了出来', () => {
    expect(tableExists(db, 'cycle_definitions')).toBe(true);
    expect(tableExists(db, 'cycle_instances')).toBe(true);
    expect(tableExists(db, 'cycle_entries')).toBe(true);
  });

  it('结束日不能早于开始日（CHECK 兜底）', () => {
    insertDefinition();
    expect(() => insertInstance('ci1', '2026-10-05', '2026-10-01')).toThrow();
  });

  it('平均长度必须是正数（CHECK 兜底）', () => {
    expect(() =>
      db.rawExec(
        `INSERT INTO cycle_definitions (id, name, average_cycle_length_days, created_at, updated_at)
         VALUES ('bad', 'x', 0, 'now', 'now')`,
      ),
    ).toThrow();
  });

  it('同一天只能有一条记录（UNIQUE 兜底）', () => {
    insertDefinition();
    insertInstance();
    insertEntry('ce1', '2026-10-02');
    expect(() => insertEntry('ce2', '2026-10-02')).toThrow();
    // 不同日期可以
    expect(() => insertEntry('ce3', '2026-10-03')).not.toThrow();
  });

  it('外键生效：实例必须指向存在的定义', () => {
    expect(() => insertInstance('ci1')).toThrow();
  });

  it('删除实例会级联删除它的记录', () => {
    insertDefinition();
    insertInstance();
    insertEntry('ce1', '2026-10-02');
    insertEntry('ce2', '2026-10-03');

    db.rawExec("DELETE FROM cycle_instances WHERE id = 'ci1'");

    expect(db.rawAll('SELECT id FROM cycle_entries')).toEqual([]);
  });

  it('删除周期定义会级联删除它的实例与记录', () => {
    insertDefinition();
    insertInstance();
    insertEntry('ce1', '2026-10-02');

    db.rawExec("DELETE FROM cycle_definitions WHERE id = 'cd1'");

    expect(db.rawAll('SELECT id FROM cycle_instances')).toEqual([]);
    expect(db.rawAll('SELECT id FROM cycle_entries')).toEqual([]);
  });

  it('记录与实例独立：删除某一天的记录不影响实例', () => {
    insertDefinition();
    insertInstance();
    insertEntry('ce1', '2026-10-02');

    db.rawExec("DELETE FROM cycle_entries WHERE id = 'ce1'");

    expect(db.rawGet("SELECT id FROM cycle_instances WHERE id = 'ci1'")).toEqual({ id: 'ci1' });
  });

  it('v4 语句本身可独立建表', () => {
    const fresh = createTestDatabase();
    try {
      for (const statement of MIGRATION_V4_CYCLE.statements ?? []) {
        fresh.rawExec(statement);
      }
      expect(tableExists(fresh, 'cycle_entries')).toBe(true);
    } finally {
      fresh.close();
    }
  });
});

describe('v5 周期记录软删除', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = createTestDatabase();
    // 只跑到 v5：v6 之后 cycle_definitions 已经不存在了
    await runMigrations(db, upTo(5));
    db.rawExec(
      `INSERT INTO cycle_definitions (id, name, created_at, updated_at)
       VALUES ('cd1', '生理期', 'now', 'now')`,
    );
    db.rawExec(
      `INSERT INTO cycle_instances (id, definition_id, start_date, created_at, updated_at)
       VALUES ('ci1', 'cd1', '2026-10-01', 'now', 'now')`,
    );
  });

  afterEach(() => {
    db.close();
  });

  function insertEntry(id: string, date: string): void {
    db.rawExec(
      `INSERT INTO cycle_entries (id, instance_id, date, created_at, updated_at)
       VALUES ('${id}', 'ci1', '${date}', 'now', 'now')`,
    );
  }

  it('cycle_entries 多出 deleted_at 列，默认是 NULL（等于「未删除」）', () => {
    const columns = db.rawAll<{ name: string; notnull: number; dflt_value: string | null }>(
      'PRAGMA table_info(cycle_entries)',
    );
    const deletedAt = columns.find((column) => column.name === 'deleted_at');
    expect(deletedAt).toBeDefined();
    // 可空：旧行升级后天然是「未删除」，不需要回填
    expect(deletedAt?.notnull).toBe(0);
    expect(deletedAt?.dflt_value).toBeNull();
  });

  it('从已经写入 v4 数据的旧库升级：老记录一条不少，且都视为未删除', async () => {
    const legacy = createTestDatabase();
    try {
      await runMigrations(legacy, [
        MIGRATION_V1_BASELINE,
        MIGRATION_V2_EVENT_DEFINITIONS,
        MIGRATION_V3_EVENT_RECORDS,
        MIGRATION_V4_CYCLE,
      ]);
      legacy.rawExec(
        `INSERT INTO cycle_definitions (id, name, created_at, updated_at)
         VALUES ('cd1', '生理期', 'now', 'now')`,
      );
      legacy.rawExec(
        `INSERT INTO cycle_instances (id, definition_id, start_date, created_at, updated_at)
         VALUES ('ci1', 'cd1', '2026-10-01', 'now', 'now')`,
      );
      legacy.rawExec(
        `INSERT INTO cycle_entries (id, instance_id, date, created_at, updated_at)
         VALUES ('ce1', 'ci1', '2026-10-02', 'now', 'now')`,
      );

      const result = await runMigrations(legacy, upTo(5));

      expect(result).toEqual({ from: 4, to: 5, applied: [5] });
      expect(legacy.rawGet("SELECT deleted_at FROM cycle_entries WHERE id = 'ce1'")).toEqual({
        deleted_at: null,
      });
    } finally {
      legacy.close();
    }
  });

  it('软删除只是写一个时间戳：记录行本身不受影响', () => {
    insertEntry('ce1', '2026-10-02');

    db.rawExec("UPDATE cycle_entries SET deleted_at = 'deleted-now' WHERE id = 'ce1'");

    expect(db.rawGet("SELECT date, deleted_at FROM cycle_entries WHERE id = 'ce1'")).toEqual({
      date: '2026-10-02',
      deleted_at: 'deleted-now',
    });
  });

  it('一天一条的 UNIQUE 约束不受软删除影响（同一天仍不能有两行）', () => {
    insertEntry('ce1', '2026-10-02');
    db.rawExec("UPDATE cycle_entries SET deleted_at = 'deleted-now' WHERE id = 'ce1'");

    expect(() => insertEntry('ce2', '2026-10-02')).toThrow();
  });

  it('v5 语句本身可独立执行（在只有 v4 结构的库上）', () => {
    const fresh = createTestDatabase();
    try {
      for (const statement of MIGRATION_V4_CYCLE.statements ?? []) {
        fresh.rawExec(statement);
      }
      for (const statement of MIGRATION_V5_CYCLE_ENTRY_SOFT_DELETE.statements ?? []) {
        fresh.rawExec(statement);
      }

      const columns = fresh.rawAll<{ name: string }>('PRAGMA table_info(cycle_entries)');
      expect(columns.some((column) => column.name === 'deleted_at')).toBe(true);
    } finally {
      fresh.close();
    }
  });
});

describe('v6 周期并入事件定义、单位改为属性', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  it('事件定义换成 attributes JSON 列表，周期字段也挂在同一张表上', () => {
    const columns = db.rawAll<{ name: string; notnull: number; dflt_value: string | null }>(
      'PRAGMA table_info(event_definitions)',
    );
    const names = columns.map((column) => column.name);

    expect(names).not.toContain('attribute');
    expect(names).not.toContain('unit');
    expect(names).toEqual(
      expect.arrayContaining([
        'attributes',
        'cycle_mode',
        'average_cycle_length_days',
        'average_period_length_days',
      ]),
    );

    const attributes = columns.find((column) => column.name === 'attributes');
    expect(attributes?.notnull).toBe(1);
    expect(attributes?.dflt_value).toBe("'[]'");
  });

  it('快捷选项合并成「属性 + 取值」，没有独立的名称列了', () => {
    expect(db.rawAll<{ name: string }>('PRAGMA table_info(quick_options)').map((row) => row.name)).toEqual([
      'id',
      'definition_id',
      'attribute',
      'value',
      'sort_order',
    ]);
  });

  it('周期型必须有做法、计数型不能带做法（CHECK 兜底）', () => {
    // 周期型没写做法 → 拒
    expect(() =>
      db.rawExec(
        `INSERT INTO event_definitions (id, name, kind, created_at, updated_at)
         VALUES ('c1', '生理期', 'cycle', 'now', 'now')`,
      ),
    ).toThrow();
    // 计数型却带了做法 → 拒
    expect(() =>
      db.rawExec(
        `INSERT INTO event_definitions (id, name, kind, cycle_mode, created_at, updated_at)
         VALUES ('d1', '喝水', 'counter', 'manual', 'now', 'now')`,
      ),
    ).toThrow();

    // 合法的两种都放行
    db.rawExec(
      `INSERT INTO event_definitions (id, name, kind, cycle_mode, created_at, updated_at)
       VALUES ('c2', '生理期', 'cycle', 'auto', 'now', 'now')`,
    );
    db.rawExec(
      `INSERT INTO event_definitions (id, name, kind, created_at, updated_at)
       VALUES ('d2', '喝水', 'counter', 'now', 'now')`,
    );
  });

  it('周期实例直接外键指向事件定义：悬空被拒，删定义级联删实例与记录', () => {
    db.rawExec(
      `INSERT INTO event_definitions (id, name, kind, cycle_mode, created_at, updated_at)
       VALUES ('c1', '生理期', 'cycle', 'manual', 'now', 'now')`,
    );
    db.rawExec(
      `INSERT INTO cycle_instances (id, definition_id, start_date, created_at, updated_at)
       VALUES ('ci1', 'c1', '2026-10-01', 'now', 'now')`,
    );
    db.rawExec(
      `INSERT INTO cycle_entries (id, instance_id, date, created_at, updated_at)
       VALUES ('ce1', 'ci1', '2026-10-02', 'now', 'now')`,
    );

    expect(() =>
      db.rawExec(
        `INSERT INTO cycle_instances (id, definition_id, start_date, created_at, updated_at)
         VALUES ('ci2', 'ghost', '2026-11-01', 'now', 'now')`,
      ),
    ).toThrow();

    db.rawExec("DELETE FROM event_definitions WHERE id = 'c1'");
    expect(db.rawAll('SELECT id FROM cycle_instances')).toEqual([]);
    expect(db.rawAll('SELECT id FROM cycle_entries')).toEqual([]);
  });

  it('从 v5 库升级：quantity → counter、unit → 属性列表、周期定义沿用原 id', async () => {
    const legacy = createTestDatabase();
    try {
      await runMigrations(legacy, upTo(5));
      legacy.rawExec(
        `INSERT INTO event_definitions (id, name, kind, unit, created_at, updated_at)
         VALUES ('d1', '喝水', 'counter', '杯', 'now', 'now')`,
      );
      // 「数量」型折成计数型，单位变成属性
      legacy.rawExec(
        `INSERT INTO event_definitions (id, name, kind, unit, created_at, updated_at)
         VALUES ('d2', '里程', 'quantity', '公里', 'now', 'now')`,
      );
      // 属性里带引号与反斜杠：迁移靠 json_array 转义，不能手拼字符串
      legacy.rawExec(
        `INSERT INTO event_definitions (id, name, kind, unit, created_at, updated_at)
         VALUES ('d3', '怪属性', 'counter', 'a"b\\c', 'now', 'now')`,
      );
      legacy.rawExec(
        `INSERT INTO quick_options (id, definition_id, label, value, unit, sort_order)
         VALUES ('q1', 'd1', '一杯', 250, 'ml', 0)`,
      );
      legacy.rawExec(
        `INSERT INTO event_records
           (id, definition_id, kind, value, unit, occurred_at, recorded_at, source,
            snapshot_name, snapshot_unit, snapshot_tag_ids)
         VALUES ('r1', 'd1', 'counter', 1, '杯', 'now', 'now', 'manual', '喝水', '杯', '[]')`,
      );
      legacy.rawExec(
        `INSERT INTO cycle_definitions (id, name, average_cycle_length_days, created_at, updated_at)
         VALUES ('c1', '生理期', 28, 'now', 'now')`,
      );
      legacy.rawExec(
        `INSERT INTO cycle_instances (id, definition_id, start_date, created_at, updated_at)
         VALUES ('ci1', 'c1', '2026-10-01', 'now', 'now')`,
      );

      const result = await runMigrations(legacy, MIGRATIONS);

      expect(result).toEqual({ from: 5, to: 6, applied: [6] });

      const definitions = legacy.rawAll<{
        id: string;
        kind: string;
        attributes: string;
        cycle_mode: string | null;
        average_cycle_length_days: number | null;
      }>(
        'SELECT id, kind, attributes, cycle_mode, average_cycle_length_days FROM event_definitions ORDER BY id',
      );
      expect(definitions.map((row) => row.id)).toEqual(['c1', 'd1', 'd2', 'd3']);
      const byId = Object.fromEntries(definitions.map((row) => [row.id, row]));

      expect(byId.c1).toMatchObject({
        kind: 'cycle',
        cycle_mode: 'manual',
        average_cycle_length_days: 28,
      });
      expect(byId.c1?.attributes).toBe('[]'); // 周期型不带属性
      expect(byId.d1).toMatchObject({ kind: 'counter', cycle_mode: null });
      expect(JSON.parse(byId.d1!.attributes)).toEqual(['杯']);
      expect(byId.d2?.kind).toBe('counter');
      expect(JSON.parse(byId.d2!.attributes)).toEqual(['公里']);
      expect(JSON.parse(byId.d3!.attributes)).toEqual(['a"b\\c']);

      // 快捷选项合并且一行不丢：有 unit 就用它当属性
      expect(legacy.rawGet("SELECT attribute, value FROM quick_options WHERE id = 'q1'")).toEqual({
        attribute: 'ml',
        value: 250,
      });

      // 历史记录：unit → attributes，快照也跟着改
      expect(
        legacy.rawGet("SELECT attributes, snapshot_attributes FROM event_records WHERE id = 'r1'"),
      ).toEqual({ attributes: '["杯"]', snapshot_attributes: '["杯"]' });

      // 周期实例还指着原来的 id
      expect(legacy.rawGet("SELECT definition_id FROM cycle_instances WHERE id = 'ci1'")).toEqual({
        definition_id: 'c1',
      });

      // 外键一致，旧表清干净
      expect(legacy.rawAll('PRAGMA foreign_key_check')).toEqual([]);
      expect(tableExists(legacy, 'cycle_definitions')).toBe(false);
      expect(
        legacy.rawAll(
          "SELECT name FROM sqlite_master WHERE name LIKE '%\\_old' ESCAPE '\\' OR name LIKE '%\\_new' ESCAPE '\\'",
        ),
      ).toEqual([]);
    } finally {
      legacy.close();
    }
  });

  it('重建表之后 8 个索引都还在', () => {
    const indexes = db
      .rawAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .map((row) => row.name)
      .sort();

    expect(indexes).toEqual([
      'idx_cycle_entries_instance_date',
      'idx_cycle_instances_definition_id',
      'idx_cycle_instances_start_date',
      'idx_event_definition_tags_tag_id',
      'idx_event_definitions_group_id',
      'idx_event_records_definition_id',
      'idx_event_records_occurred_at',
      'idx_quick_options_definition_id',
    ]);
  });

  it('v6 迁移对象自带版本号与可执行语句', () => {
    expect(MIGRATION_V6_CYCLE_AS_EVENT_KIND.version).toBe(6);
    expect(MIGRATION_V6_CYCLE_AS_EVENT_KIND.statements?.length).toBeGreaterThan(0);
  });
});
