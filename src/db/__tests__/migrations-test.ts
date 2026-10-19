import { readSchemaVersion, runMigrations, validateMigrations, type Migration } from '@/db/migrations';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, MIGRATION_V1_BASELINE } from '@/db/schema';
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
    expect(LATEST_SCHEMA_VERSION).toBe(1);
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

    expect(result).toEqual({ from: 0, to: 1, applied: [1] });
    expect(await readSchemaVersion(db)).toBe(1);
    expect(tableExists(db, 'app_meta')).toBe(true);
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

    expect(second).toEqual({ from: 1, to: 1, applied: [] });
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
