import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runMigrations } from '@/db/migrations';
import { MIGRATIONS, META_KEYS } from '@/db/schema';
import { createTestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { StorageError } from '@/domain/errors';
import { MetaRepository } from '@/repositories/metaRepository';

describe('MetaRepository', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let repository: MetaRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    repository = new MetaRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('读取不存在的键返回 null', async () => {
    expect(await repository.get('nope')).toBeNull();
  });

  it('写入后可读回', async () => {
    await repository.set('k', 'v', '2026-10-19T00:00:00.000Z');
    expect(await repository.get('k')).toBe('v');
  });

  it('重复写入是 upsert，不会产生重复行', async () => {
    await repository.set('k', 'v1', '2026-10-19T00:00:00.000Z');
    await repository.set('k', 'v2', '2026-10-19T00:00:01.000Z');

    expect(await repository.get('k')).toBe('v2');
    const rows = await repository.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.updatedAt).toBe('2026-10-19T00:00:01.000Z');
  });

  it('getAll 按 key 排序', async () => {
    await repository.set('b', '2');
    await repository.set('a', '1');
    expect((await repository.getAll()).map((row) => row.key)).toEqual(['a', 'b']);
  });

  it('启动次数逐次累加', async () => {
    expect(await repository.incrementLaunchCount()).toBe(1);
    expect(await repository.incrementLaunchCount()).toBe(2);
    expect(await repository.get(META_KEYS.launchCount)).toBe('2');
  });

  it('安装时间只写一次', async () => {
    const first = await repository.ensureInstalledAt('2026-01-01T00:00:00.000Z');
    const second = await repository.ensureInstalledAt('2030-01-01T00:00:00.000Z');

    expect(first).toBe('2026-01-01T00:00:00.000Z');
    expect(second).toBe(first);
  });

  it('底层异常被收敛为 StorageError（表不存在时）', async () => {
    const empty = createTestDatabase();
    try {
      await expect(new MetaRepository(empty).get('k')).rejects.toThrow(StorageError);
      await expect(new MetaRepository(empty).get('k')).rejects.toMatchObject({ code: 'STORAGE' });
    } finally {
      empty.close();
    }
  });
});

describe('持久化（同一文件重新打开）', () => {
  it('关闭连接后重新打开，数据仍在，且迁移不重复执行', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lifetrack-test-'));
    const file = join(dir, 'lifetrack.db');

    try {
      const first = createTestDatabase(file);
      const firstMigration = await runMigrations(first, MIGRATIONS);
      const firstRepo = new MetaRepository(first);
      await firstRepo.incrementLaunchCount('2026-10-19T00:00:00.000Z');
      await firstRepo.set('probe', 'persisted');
      first.close();

      // 模拟应用重启：重新打开同一个数据库文件
      const second = createTestDatabase(file);
      const secondMigration = await runMigrations(second, MIGRATIONS);
      const secondRepo = new MetaRepository(second);

      expect(firstMigration.applied).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(secondMigration.applied).toEqual([]); // 已是最新，不重复迁移
      expect(await secondRepo.get('probe')).toBe('persisted');
      expect(await secondRepo.get(META_KEYS.launchCount)).toBe('1');

      // 第二次启动继续累加
      expect(await secondRepo.incrementLaunchCount()).toBe(2);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
