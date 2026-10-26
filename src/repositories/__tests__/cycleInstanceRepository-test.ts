import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors';
import { CycleEntryRepository } from '@/repositories/cycleEntryRepository';
import { CycleInstanceRepository } from '@/repositories/cycleInstanceRepository';
import { EventDefinitionRepository } from '@/repositories/eventDefinitionRepository';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';

describe('CycleInstanceRepository', () => {
  let db: TestDatabase;
  let definitions: EventDefinitionRepository;
  let instances: CycleInstanceRepository;
  let entries: CycleEntryRepository;
  let definitionId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    definitions = new EventDefinitionRepository(db);
    instances = new CycleInstanceRepository(db);
    entries = new CycleEntryRepository(db);
    // v6 起周期是事件的一种类型：定义走 EventDefinitionRepository，写法标 cycle
    definitionId = (
      await definitions.create({ name: '生理期', kind: 'cycle', cycleMode: 'manual', quickOptions: [] }, T1)
    ).id;
  });

  afterEach(() => {
    db.close();
  });

  function create(overrides: Partial<{ startDate: string; endDate: string; note: string }> = {}) {
    return instances.create(
      {
        definitionId,
        startDate: overrides.startDate ?? '2026-10-01',
        endDate: overrides.endDate,
        note: overrides.note,
      },
      T1,
    );
  }

  it('创建：进行中的周期没有结束日', async () => {
    const created = await create();
    expect(created.startDate).toBe('2026-10-01');
    expect(created.endDate).toBeUndefined();
  });

  it('创建校验：定义必须存在、未归档，日期区间合法', async () => {
    await expect(instances.create({ definitionId: 'missing', startDate: '2026-10-01' }, T1)).rejects.toThrow(
      NotFoundError,
    );

    await definitions.setArchived(definitionId, true, T1);
    await expect(create()).rejects.toThrow(ConflictError);
    await definitions.setArchived(definitionId, false, T1);

    await expect(create({ startDate: '2026-10-05', endDate: '2026-10-01' })).rejects.toThrow(ValidationError);
    await expect(create({ startDate: '2026-02-31' })).rejects.toThrow(ValidationError);
  });

  it('同一周期的两段区间不能重叠', async () => {
    await create({ startDate: '2026-10-01', endDate: '2026-10-05' });

    await expect(create({ startDate: '2026-10-05', endDate: '2026-10-09' })).rejects.toThrow(ConflictError);
    await expect(create({ startDate: '2026-10-03', endDate: '2026-10-07' })).rejects.toThrow(ConflictError);
    // 完全分离可以
    await expect(create({ startDate: '2026-10-06', endDate: '2026-10-09' })).resolves.toBeTruthy();
  });

  it('进行中的实例与任何后续区间都视为重叠', async () => {
    await create({ startDate: '2026-10-01' }); // 进行中
    await expect(create({ startDate: '2027-01-01', endDate: '2027-01-05' })).rejects.toThrow(ConflictError);
  });

  it('列表按开始日倒序，可按定义过滤并限制条数', async () => {
    await create({ startDate: '2026-09-01', endDate: '2026-09-05' });
    await create({ startDate: '2026-10-01', endDate: '2026-10-05' });

    expect((await instances.list()).map((item) => item.startDate)).toEqual(['2026-10-01', '2026-09-01']);
    expect((await instances.list({ limit: 1 })).length).toBe(1);
    expect((await instances.list({ definitionId })).length).toBe(2);
    expect((await instances.list({ definitionId: 'other' })).length).toBe(0);
  });

  it('扩大边界可以成功更新', async () => {
    const created = await create({ startDate: '2026-10-01', endDate: '2026-10-05' });
    await entries.save(created.id, { date: '2026-10-02' }, T1);

    const updated = await instances.update(
      created.id,
      { startDate: '2026-10-01', endDate: '2026-10-07' },
      T2,
    );
    expect(updated.endDate).toBe('2026-10-07');
    expect(updated.updatedAt).toBe(T2);
  });

  it('缩小边界导致记录越界：拒绝更新，且一条数据都没少（核心规则）', async () => {
    const created = await create({ startDate: '2026-10-01', endDate: '2026-10-10' });
    await entries.save(created.id, { date: '2026-10-02' }, T1);
    await entries.save(created.id, { date: '2026-10-08' }, T1);

    // 想把结束日提前到 10-05，10-08 那条会越界
    await expect(
      instances.update(created.id, { startDate: '2026-10-01', endDate: '2026-10-05' }, T2),
    ).rejects.toThrow(ConflictError);

    // 反向断言：边界没变、记录一条没少
    const after = await instances.getById(created.id);
    expect(after?.endDate).toBe('2026-10-10');
    expect((await entries.listByInstance(created.id)).map((entry) => entry.date)).toEqual([
      '2026-10-02',
      '2026-10-08',
    ]);
  });

  it('把开始日往后移导致记录越界时同样拒绝，并在 details 里列出日期', async () => {
    const created = await create({ startDate: '2026-10-01', endDate: '2026-10-10' });
    await entries.save(created.id, { date: '2026-10-02' }, T1);

    await expect(
      instances.update(created.id, { startDate: '2026-10-03', endDate: '2026-10-10' }, T2),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { outsideDates: ['2026-10-02'] },
    });
  });

  it('回收站里的记录不挡边界：软删除之后可以缩到它外面', async () => {
    const created = await create({ startDate: '2026-10-01', endDate: '2026-10-10' });
    const kept = await entries.save(created.id, { date: '2026-10-02' }, T1);
    const trashed = await entries.save(created.id, { date: '2026-10-08' }, T1);

    // 没软删除时 10-08 会挡住缩减
    await expect(
      instances.update(created.id, { startDate: '2026-10-01', endDate: '2026-10-05' }, T2),
    ).rejects.toThrow(ConflictError);

    await entries.softDelete(trashed.id, T2);

    const updated = await instances.update(
      created.id,
      { startDate: '2026-10-01', endDate: '2026-10-05' },
      T2,
    );
    expect(updated.endDate).toBe('2026-10-05');
    // 未删除的那条被完整保留，软删除的那条也还在库里（只是不再可见）
    expect((await entries.listByInstance(created.id)).map((entry) => entry.id)).toEqual([kept.id]);
    expect((await entries.listAll()).map((entry) => entry.id).sort()).toEqual([kept.id, trashed.id].sort());
  });

  it('更新成与其它实例重叠时拒绝', async () => {
    const first = await create({ startDate: '2026-09-01', endDate: '2026-09-05' });
    await create({ startDate: '2026-10-01', endDate: '2026-10-05' });

    await expect(
      instances.update(first.id, { startDate: '2026-09-01', endDate: '2026-10-02' }, T2),
    ).rejects.toThrow(ConflictError);
  });

  it('更新不存在的实例抛 NotFoundError', async () => {
    await expect(instances.update('missing', { startDate: '2026-10-01' }, T2)).rejects.toThrow(NotFoundError);
  });

  it('endInstance 结束进行中的周期；越界时同样拒绝', async () => {
    const created = await create({ startDate: '2026-10-01' });
    await entries.save(created.id, { date: '2026-10-03' }, T1);

    await expect(instances.endInstance(created.id, '2026-10-02', T2)).rejects.toThrow(ConflictError);

    const ended = await instances.endInstance(created.id, '2026-10-05', T2);
    expect(ended.endDate).toBe('2026-10-05');
    expect(ended.startDate).toBe('2026-10-01');
  });

  it('永久删除实例会级联删除它的记录', async () => {
    const created = await create({ startDate: '2026-10-01', endDate: '2026-10-05' });
    await entries.save(created.id, { date: '2026-10-02' }, T1);

    await instances.remove(created.id);

    expect(await instances.getById(created.id)).toBeNull();
    expect(db.rawAll('SELECT id FROM cycle_entries')).toEqual([]);
    await expect(instances.remove(created.id)).rejects.toThrow(NotFoundError);
  });
});
