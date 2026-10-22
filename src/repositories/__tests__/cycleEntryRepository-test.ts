import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { NotFoundError, ValidationError } from '@/domain/errors';
import { CycleDefinitionRepository } from '@/repositories/cycleDefinitionRepository';
import { CycleEntryRepository } from '@/repositories/cycleEntryRepository';
import { CycleInstanceRepository } from '@/repositories/cycleInstanceRepository';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';

describe('CycleEntryRepository', () => {
  let db: TestDatabase;
  let instances: CycleInstanceRepository;
  let entries: CycleEntryRepository;
  let instanceId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    const definitions = new CycleDefinitionRepository(db);
    instances = new CycleInstanceRepository(db);
    entries = new CycleEntryRepository(db);
    const definition = await definitions.create({ name: '生理期' }, T1);
    const instance = await instances.create(
      { definitionId: definition.id, startDate: '2026-10-01', endDate: '2026-10-05' },
      T1,
    );
    instanceId = instance.id;
  });

  afterEach(() => {
    db.close();
  });

  it('保存某一天的记录并读回（症状存 JSON、顺手去空去重）', async () => {
    const saved = await entries.save(
      instanceId,
      { date: '2026-10-02', phase: '经期', symptoms: [' 头痛 ', '乏力', '头痛', ' '], note: '第 2 天' },
      T1,
    );

    expect(saved.date).toBe('2026-10-02');
    expect(saved.phase).toBe('经期');
    expect(saved.symptoms).toEqual(['头痛', '乏力']);
    expect(saved.note).toBe('第 2 天');

    expect(await entries.getById(saved.id)).toEqual(saved);
  });

  it('「一天一条」：同一天再保存是更新，不是新增', async () => {
    const first = await entries.save(instanceId, { date: '2026-10-02', symptoms: ['头痛'] }, T1);
    const second = await entries.save(instanceId, { date: '2026-10-02', symptoms: ['乏力'] }, T2);

    expect(second.id).toBe(first.id); // 同一条
    expect(second.symptoms).toEqual(['乏力']);
    expect(second.createdAt).toBe(T1);
    expect(second.updatedAt).toBe(T2);
    expect((await entries.listByInstance(instanceId)).length).toBe(1);
  });

  it('不同日期是两条，列表按日期正序', async () => {
    await entries.save(instanceId, { date: '2026-10-04' }, T1);
    await entries.save(instanceId, { date: '2026-10-02' }, T1);

    expect((await entries.listByInstance(instanceId)).map((entry) => entry.date)).toEqual([
      '2026-10-02',
      '2026-10-04',
    ]);
  });

  it('listAll 跨实例返回全部记录，按日期正序（导出备份用）', async () => {
    const definitions = new CycleDefinitionRepository(db);
    const second = await definitions.create({ name: '第二个周期' }, T1);
    const otherInstance = await instances.create(
      { definitionId: second.id, startDate: '2026-11-01', endDate: '2026-11-03' },
      T1,
    );

    await entries.save(instanceId, { date: '2026-10-04' }, T1);
    await entries.save(otherInstance.id, { date: '2026-11-02' }, T1);

    expect((await entries.listAll()).map((entry) => entry.date)).toEqual(['2026-10-04', '2026-11-02']);
  });

  it('日期必须落在周期区间内，否则拒绝且不写库', async () => {
    await expect(entries.save(instanceId, { date: '2026-09-30' }, T1)).rejects.toThrow(ValidationError);
    await expect(entries.save(instanceId, { date: '2026-10-06' }, T1)).rejects.toThrow(ValidationError);
    expect(await entries.listByInstance(instanceId)).toEqual([]);
  });

  it('非法日期格式被拒绝', async () => {
    await expect(entries.save(instanceId, { date: '2026-02-31' }, T1)).rejects.toThrow(ValidationError);
    await expect(entries.save(instanceId, { date: '10/02/2026' }, T1)).rejects.toThrow(ValidationError);
  });

  it('实例不存在时抛 NotFoundError', async () => {
    await expect(entries.save('missing', { date: '2026-10-02' }, T1)).rejects.toThrow(NotFoundError);
  });

  it('getByInstanceAndDate 找不到时返回 null', async () => {
    expect(await entries.getByInstanceAndDate(instanceId, '2026-10-03')).toBeNull();
    await entries.save(instanceId, { date: '2026-10-03' }, T1);
    expect((await entries.getByInstanceAndDate(instanceId, '2026-10-03'))?.date).toBe('2026-10-03');
  });

  it('没有症状时存成空数组并能读回', async () => {
    const saved = await entries.save(instanceId, { date: '2026-10-02' }, T1);
    expect(saved.symptoms).toEqual([]);
    expect(saved.phase).toBeUndefined();
    expect(
      db.rawGet<{ symptoms: string }>('SELECT symptoms FROM cycle_entries WHERE id = ?', saved.id),
    ).toEqual({
      symptoms: '[]',
    });
  });

  it('永久删除某一天的记录；不存在时抛 NotFoundError', async () => {
    const saved = await entries.save(instanceId, { date: '2026-10-02' }, T1);
    await entries.remove(saved.id);

    expect(await entries.getById(saved.id)).toBeNull();
    expect(await entries.listByInstance(instanceId)).toEqual([]);
    await expect(entries.remove(saved.id)).rejects.toThrow(NotFoundError);
  });

  it('删除记录不影响实例（实例与记录独立）', async () => {
    const saved = await entries.save(instanceId, { date: '2026-10-02' }, T1);
    await entries.remove(saved.id);

    expect(await instances.getById(instanceId)).not.toBeNull();
  });

  describe('软删除与恢复（v5）', () => {
    it('软删除后不再出现在实例列表里，但行还在库里（备份要带上）', async () => {
      const saved = await entries.save(instanceId, { date: '2026-10-02', phase: '经期' }, T1);

      const deleted = await entries.softDelete(saved.id, T2);

      expect(deleted.deletedAt).toBe(T2);
      // 界面用的列表看不到
      expect(await entries.listByInstance(instanceId)).toEqual([]);
      // 导出用的全量仍在，且带着删除标记
      expect(await entries.listAll()).toEqual([deleted]);
      expect((await entries.getById(saved.id))?.deletedAt).toBe(T2);
    });

    it('重复软删除是幂等的：保留第一次的删除时间', async () => {
      const saved = await entries.save(instanceId, { date: '2026-10-02' }, T1);

      await entries.softDelete(saved.id, T1);
      const again = await entries.softDelete(saved.id, T2);

      expect(again.deletedAt).toBe(T1);
    });

    it('删除不存在的记录抛 NotFoundError', async () => {
      await expect(entries.softDelete('missing', T2)).rejects.toThrow(NotFoundError);
      await expect(entries.restore('missing')).rejects.toThrow(NotFoundError);
    });

    it('恢复后重新出现在列表里，删除标记被清掉', async () => {
      const saved = await entries.save(instanceId, { date: '2026-10-02', phase: '经期' }, T1);
      await entries.softDelete(saved.id, T2);

      const restored = await entries.restore(saved.id);

      expect(restored.deletedAt).toBeUndefined();
      expect(restored.phase).toBe('经期');
      expect(await entries.listByInstance(instanceId)).toEqual([restored]);
      // 已经恢复的再恢复一次也是幂等的
      expect(await entries.restore(saved.id)).toEqual(restored);
    });

    it('保存被软删除的那一天会把它复活（不会出现「说保存成功、列表里却没有」）', async () => {
      const saved = await entries.save(instanceId, { date: '2026-10-02', symptoms: ['头痛'] }, T1);
      await entries.softDelete(saved.id, T2);

      const revived = await entries.save(instanceId, { date: '2026-10-02', symptoms: ['乏力'] }, T2);

      expect(revived.id).toBe(saved.id);
      expect(revived.deletedAt).toBeUndefined();
      expect(revived.symptoms).toEqual(['乏力']);
      expect((await entries.listByInstance(instanceId)).map((entry) => entry.date)).toEqual(['2026-10-02']);
    });

    it('边界缩到软删除记录之外后：恢复被拒绝并说明原因（不造出区间外的记录）', async () => {
      const saved = await entries.save(instanceId, { date: '2026-10-04' }, T1);
      await entries.softDelete(saved.id, T1);
      // 软删除的记录不挡边界，所以这里能缩到 10-02
      await instances.update(instanceId, { startDate: '2026-10-01', endDate: '2026-10-02' }, T2);

      await expect(entries.restore(saved.id)).rejects.toThrow(ValidationError);
      // 失败后仍是软删除状态，没有留下半成品
      expect((await entries.getById(saved.id))?.deletedAt).toBe(T1);
      expect(await entries.listByInstance(instanceId)).toEqual([]);
    });

    it('listDeleted 带上所属定义与实例区间，按删除时间倒序', async () => {
      const first = await entries.save(instanceId, { date: '2026-10-02' }, T1);
      const second = await entries.save(instanceId, { date: '2026-10-03' }, T1);
      await entries.softDelete(first.id, T1);
      await entries.softDelete(second.id, T2);

      const trashed = await entries.listDeleted();

      expect(trashed.map((item) => item.entry.date)).toEqual(['2026-10-03', '2026-10-02']);
      expect(trashed[0]).toMatchObject({
        definitionName: '生理期',
        instanceStartDate: '2026-10-01',
        instanceEndDate: '2026-10-05',
      });
      expect(trashed[0]?.entry.deletedAt).toBe(T2);
    });

    it('listDeleted 在没有任何软删除记录时返回空数组', async () => {
      await entries.save(instanceId, { date: '2026-10-02' }, T1);
      expect(await entries.listDeleted()).toEqual([]);
    });
  });
});
