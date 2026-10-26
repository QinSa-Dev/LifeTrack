import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { EventDefinitionRepository } from '@/repositories/eventDefinitionRepository';

import { seedStarterDefinitions, STARTER_DEFINITIONS } from '@/features/definitions/starterDefinitions';

describe('seedStarterDefinitions', () => {
  let db: TestDatabase;
  let definitions: EventDefinitionRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    definitions = new EventDefinitionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('数据库是刚新建的：写入内置模板事件', async () => {
    const created = await seedStarterDefinitions(db, { freshDatabase: true });

    expect(created.map((definition) => definition.name)).toEqual(['喝水']);
    const [drinking] = await definitions.list();
    expect(drinking?.kind).toBe('counter');
    expect(drinking?.isArchived).toBe(false);
    // 模板要真的能当参考：属性与快捷选项都落到库里了
    expect(drinking?.attributes).toEqual(['200ml']);
    expect(drinking?.quickOptions.map((option) => [option.attribute, option.value])).toEqual([['200ml', 1]]);
  });

  it('数据库不是刚新建的（升级 / 已有数据）：一条都不写', async () => {
    // 用户把内置事件删了之后，下次升级不该让它复活——判断依据是「库是不是刚建的」，
    // 而不是「库里现在有没有事件」
    const created = await seedStarterDefinitions(db, { freshDatabase: false });

    expect(created).toEqual([]);
    expect(await definitions.list()).toEqual([]);
  });

  it('内置事件只是一条普通定义：用户删得掉，删完不会自动回来', async () => {
    const [seeded] = await seedStarterDefinitions(db, { freshDatabase: true });
    await definitions.remove(seeded!.id);

    expect(await definitions.list()).toEqual([]);
    // 再跑一次「非新库」的初始化，仍然不写
    expect(await seedStarterDefinitions(db, { freshDatabase: false })).toEqual([]);
    expect(await definitions.list()).toEqual([]);
  });

  it('内置模板的写法本身是合法的（仓储的校验能过）', async () => {
    expect(STARTER_DEFINITIONS.length).toBeGreaterThan(0);
    await expect(seedStarterDefinitions(db, { freshDatabase: true })).resolves.toHaveLength(
      STARTER_DEFINITIONS.length,
    );
  });
});
