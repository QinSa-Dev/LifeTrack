import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { NotFoundError, ValidationError } from '@/domain/errors';
import { TagRepository } from '@/repositories/tagRepository';

describe('TagRepository', () => {
  let db: TestDatabase;
  let tags: TagRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    tags = new TagRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('创建后能读回', async () => {
    const created = await tags.create({ name: '早晨', color: '#B0731A' }, '2026-10-19T00:00:00.000Z');

    expect(created.id).toBeTruthy();
    expect(created.name).toBe('早晨');
    expect(await tags.getById(created.id)).toEqual(created);
  });

  it('空名拒绝', async () => {
    await expect(tags.create({ name: '  ' })).rejects.toThrow(ValidationError);
  });

  it('list 按名称排序', async () => {
    await tags.create({ name: 'b' });
    await tags.create({ name: 'a' });
    await tags.create({ name: 'c' });

    expect((await tags.list()).map((tag) => tag.name)).toEqual(['a', 'b', 'c']);
  });

  it('更新刷新 updatedAt', async () => {
    const created = await tags.create({ name: '旧' }, '2026-10-19T00:00:00.000Z');
    const updated = await tags.update(created.id, { name: '新' }, '2026-10-20T00:00:00.000Z');

    expect(updated.name).toBe('新');
    expect(updated.updatedAt).toBe('2026-10-20T00:00:00.000Z');
  });

  it('更新/删除不存在的标签抛 NotFoundError', async () => {
    await expect(tags.update('missing', { name: 'x' })).rejects.toThrow(NotFoundError);
    await expect(tags.remove('missing')).rejects.toThrow(NotFoundError);
  });
});