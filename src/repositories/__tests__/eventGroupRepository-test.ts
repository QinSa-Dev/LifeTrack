import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { NotFoundError, ValidationError } from '@/domain/errors';
import { EventGroupRepository } from '@/repositories/eventGroupRepository';

describe('EventGroupRepository', () => {
  let db: TestDatabase;
  let groups: EventGroupRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    groups = new EventGroupRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('创建后能读回，字段映射正确', async () => {
    const created = await groups.create(
      { name: '健康', color: '#3B6EF6', sortOrder: 2 },
      '2026-10-19T00:00:00.000Z',
    );

    expect(created.name).toBe('健康');
    expect(created.color).toBe('#3B6EF6');
    expect(created.sortOrder).toBe(2);
    expect(created.createdAt).toBe('2026-10-19T00:00:00.000Z');

    const fetched = await groups.getById(created.id);
    expect(fetched).toEqual(created);
  });

  it('名称去首尾空白，空名拒绝并抛 ValidationError', async () => {
    const created = await groups.create({ name: '  健康  ' });
    expect(created.name).toBe('健康');

    await expect(groups.create({ name: '   ' })).rejects.toThrow(ValidationError);
  });

  it('可选字段留空时存为 undefined 而不是空字符串', async () => {
    const created = await groups.create({ name: '健康', color: '   ' });
    expect(created.color).toBeUndefined();
  });

  it('list 按 sort_order 再按名称排序', async () => {
    await groups.create({ name: '乙', sortOrder: 1 });
    await groups.create({ name: '甲', sortOrder: 0 });
    await groups.create({ name: '丙', sortOrder: 2 });

    expect((await groups.list()).map((group) => group.name)).toEqual(['甲', '乙', '丙']);
  });

  it('更新改字段并刷新 updatedAt', async () => {
    const created = await groups.create({ name: '旧' }, '2026-10-19T00:00:00.000Z');
    const updated = await groups.update(
      created.id,
      { name: '新', color: '#111111', sortOrder: 5 },
      '2026-10-20T00:00:00.000Z',
    );

    expect(updated.name).toBe('新');
    expect(updated.sortOrder).toBe(5);
    expect(updated.updatedAt).toBe('2026-10-20T00:00:00.000Z');
    expect(updated.createdAt).toBe('2026-10-19T00:00:00.000Z');
  });

  it('更新不存在的分组抛 NotFoundError', async () => {
    await expect(groups.update('missing', { name: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('删除后查不到；再次删除抛 NotFoundError', async () => {
    const created = await groups.create({ name: '健康' });
    await groups.remove(created.id);

    expect(await groups.getById(created.id)).toBeNull();
    await expect(groups.remove(created.id)).rejects.toThrow(NotFoundError);
  });

  it('排序值非整数时拒绝', async () => {
    await expect(groups.create({ name: '健康', sortOrder: 1.5 })).rejects.toThrow(ValidationError);
  });
});
