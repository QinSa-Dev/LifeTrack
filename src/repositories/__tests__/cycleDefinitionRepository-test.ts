import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { NotFoundError, ValidationError } from '@/domain/errors';
import { CycleDefinitionRepository } from '@/repositories/cycleDefinitionRepository';
import { CycleEntryRepository } from '@/repositories/cycleEntryRepository';
import { CycleInstanceRepository } from '@/repositories/cycleInstanceRepository';

const T1 = '2026-10-19T08:00:00.000Z';

describe('CycleDefinitionRepository', () => {
  let db: TestDatabase;
  let definitions: CycleDefinitionRepository;
  let instances: CycleInstanceRepository;
  let entries: CycleEntryRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    definitions = new CycleDefinitionRepository(db);
    instances = new CycleInstanceRepository(db);
    entries = new CycleEntryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('创建：名称必填，平均长度可选且必须是正整数', async () => {
    const created = await definitions.create({ name: '生理期', averageCycleLengthDays: 28 }, T1);
    expect(created.name).toBe('生理期');
    expect(created.averageCycleLengthDays).toBe(28);
    expect(created.averagePeriodLengthDays).toBeUndefined();
    expect(created.isArchived).toBe(false);

    await expect(definitions.create({ name: '   ' }, T1)).rejects.toThrow(ValidationError);
    await expect(definitions.create({ name: 'x', averageCycleLengthDays: 0 }, T1)).rejects.toThrow(
      ValidationError,
    );
    await expect(definitions.create({ name: 'x', averageCycleLengthDays: 1.5 }, T1)).rejects.toThrow(
      ValidationError,
    );
  });

  it('列表默认排除已归档，includeArchived 才列出', async () => {
    const active = await definitions.create({ name: 'A' }, T1);
    const archived = await definitions.create({ name: 'B' }, T1);
    await definitions.setArchived(archived.id, true, T1);

    expect((await definitions.list()).map((item) => item.id)).toEqual([active.id]);
    expect((await definitions.list({ includeArchived: true })).length).toBe(2);
  });

  it('更新字段与归档状态；不存在的定义抛 NotFoundError', async () => {
    const created = await definitions.create({ name: '生理期' }, T1);
    const updated = await definitions.update(created.id, { name: '月经', averageCycleLengthDays: 30 }, T1);
    expect(updated.name).toBe('月经');
    expect(updated.averageCycleLengthDays).toBe(30);

    const archived = await definitions.setArchived(created.id, true, T1);
    expect(archived.isArchived).toBe(true);
    expect((await definitions.setArchived(created.id, false, T1)).isArchived).toBe(false);

    await expect(definitions.update('missing', { name: 'x' }, T1)).rejects.toThrow(NotFoundError);
    await expect(definitions.setArchived('missing', true, T1)).rejects.toThrow(NotFoundError);
    expect(await definitions.getById('missing')).toBeNull();
  });

  it('归档不影响已产生的周期实例与记录', async () => {
    const definition = await definitions.create({ name: '生理期' }, T1);
    const instance = await instances.create(
      { definitionId: definition.id, startDate: '2026-10-01', endDate: '2026-10-05' },
      T1,
    );
    await entries.save(instance.id, { date: '2026-10-02', symptoms: ['头痛'] }, T1);

    await definitions.setArchived(definition.id, true, T1);

    expect(await instances.getById(instance.id)).not.toBeNull();
    expect((await entries.listByInstance(instance.id)).length).toBe(1);
  });

  it('永久删除定义会级联删除实例与记录', async () => {
    const definition = await definitions.create({ name: '生理期' }, T1);
    const instance = await instances.create({ definitionId: definition.id, startDate: '2026-10-01' }, T1);
    await entries.save(instance.id, { date: '2026-10-02' }, T1);

    await definitions.remove(definition.id);

    expect(await instances.getById(instance.id)).toBeNull();
    expect(db.rawAll('SELECT id FROM cycle_entries')).toEqual([]);
    await expect(definitions.remove(definition.id)).rejects.toThrow(NotFoundError);
  });
});
