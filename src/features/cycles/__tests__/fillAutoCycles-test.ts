import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import type { EventDefinitionDraft } from '@/domain/validation';
import { autoFillHorizonKey } from '@/features/cycles/autoFill';
import { fillAutoCycles, rememberAutoFillHorizon } from '@/features/cycles/fillAutoCycles';
import { CycleInstanceRepository } from '@/repositories/cycleInstanceRepository';
import { EventDefinitionRepository } from '@/repositories/eventDefinitionRepository';

const T1 = '2026-09-01T08:00:00.000Z';

describe('fillAutoCycles', () => {
  let db: TestDatabase;
  let definitions: EventDefinitionRepository;
  let instances: CycleInstanceRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    definitions = new EventDefinitionRepository(db);
    instances = new CycleInstanceRepository(db);
  });

  async function createDefinition(overrides: Partial<EventDefinitionDraft> = {}): Promise<string> {
    const definition = await definitions.create(
      {
        name: '自动循环',
        kind: 'cycle',
        quickOptions: [],
        cycleMode: 'auto',
        averageCycleLengthDays: 28,
        averagePeriodLengthDays: 5,
        ...overrides,
      },
      T1,
    );
    return definition.id;
  }

  it('把漏掉的段落补到今天，并且只追加在最后一段之后', async () => {
    const definitionId = await createDefinition();
    await instances.create({ definitionId, startDate: '2026-09-01', endDate: '2026-09-05' }, T1);

    const outcome = await fillAutoCycles(db, '2026-11-30');

    expect(outcome).toMatchObject({ created: 3, definitions: 1, failures: [] });
    expect((await instances.list({ definitionId })).map((item) => item.startDate)).toEqual([
      '2026-11-24',
      '2026-10-27',
      '2026-09-29',
      '2026-09-01',
    ]);
    expect(await readHorizon(definitionId)).toBe('2026-11-24');
  });

  it('再启动一次不会重复生成（幂等）', async () => {
    const definitionId = await createDefinition();
    await instances.create({ definitionId, startDate: '2026-09-01', endDate: '2026-09-05' }, T1);

    expect((await fillAutoCycles(db, '2026-11-30')).created).toBe(3);
    expect((await fillAutoCycles(db, '2026-11-30')).created).toBe(0);
    expect(await instances.list({ definitionId })).toHaveLength(4);
  });

  it('删掉自动补出的最后一段后，下次启动不会又补回来（水位兜底）', async () => {
    const definitionId = await createDefinition();
    await instances.create({ definitionId, startDate: '2026-09-01', endDate: '2026-09-05' }, T1);
    await fillAutoCycles(db, '2026-11-30');

    const latest = (await instances.list({ definitionId }))[0];
    expect(latest?.startDate).toBe('2026-11-24');
    if (latest === undefined) {
      throw new Error('补齐之后应该有一段以 2026-11-24 开始');
    }
    await instances.remove(latest.id);

    expect((await fillAutoCycles(db, '2026-11-30')).created).toBe(0);
    expect((await instances.list({ definitionId })).map((item) => item.startDate)).toEqual([
      '2026-10-27',
      '2026-09-29',
      '2026-09-01',
    ]);
  });

  it('没有第一段的定义不动：第一段仍要用户明确生成', async () => {
    const definitionId = await createDefinition();

    expect((await fillAutoCycles(db, '2026-11-30')).created).toBe(0);
    expect(await instances.list({ definitionId })).toEqual([]);
  });

  it('水位只增不减：手动补一段更早的周期不会把水位退回去', async () => {
    const definitionId = await createDefinition();

    await rememberAutoFillHorizon(db, definitionId, '2026-11-24');
    await rememberAutoFillHorizon(db, definitionId, '2026-10-01');

    expect(await readHorizon(definitionId)).toBe('2026-11-24');
  });

  it('进行中的一段挡住补齐', async () => {
    const definitionId = await createDefinition();
    await instances.create({ definitionId, startDate: '2026-09-01' }, T1);

    expect((await fillAutoCycles(db, '2026-11-30')).created).toBe(0);
  });

  it('手动型与已归档的定义都不参与', async () => {
    const manualId = await createDefinition({ cycleMode: 'manual' });
    await instances.create({ definitionId: manualId, startDate: '2026-09-01', endDate: '2026-09-05' }, T1);

    const archivedId = await createDefinition({ name: '归档的自动循环' });
    await instances.create({ definitionId: archivedId, startDate: '2026-09-01', endDate: '2026-09-05' }, T1);
    await definitions.setArchived(archivedId, true, T1);

    const outcome = await fillAutoCycles(db, '2026-11-30');

    expect(outcome.definitions).toBe(0);
    expect(outcome.created).toBe(0);
  });

  it('单条定义失败不影响其它定义（坏数据只记在它自己名下）', async () => {
    const brokenId = await createDefinition({ name: '坏数据' });
    // 绕过仓储写一条不可能通过校验的实例，模拟库里已有的坏数据。
    // 开始日故意用「2026-00-01」：日期不存在（addDays 会抛），但字符串比较仍满足表的 CHECK。
    await db.runAsync(
      `INSERT INTO cycle_instances (id, definition_id, start_date, end_date, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      'broken-instance',
      brokenId,
      '2026-00-01',
      '2026-09-05',
      T1,
      T1,
    );

    const goodId = await createDefinition({ name: '好数据' });
    await instances.create({ definitionId: goodId, startDate: '2026-09-01', endDate: '2026-09-05' }, T1);

    const outcome = await fillAutoCycles(db, '2026-11-30');

    expect(outcome.created).toBe(3);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]).toMatchObject({ definitionId: brokenId, name: '坏数据' });
    expect(await instances.list({ definitionId: goodId })).toHaveLength(4);
  });

  async function readHorizon(definitionId: string): Promise<string | null> {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?',
      autoFillHorizonKey(definitionId),
    );
    return row?.value ?? null;
  }
});
