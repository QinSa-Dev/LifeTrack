import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors';
import { EventDefinitionRepository } from '@/repositories/eventDefinitionRepository';
import { EventRecordRepository } from '@/repositories/eventRecordRepository';
import { TagRepository } from '@/repositories/tagRepository';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';

describe('EventRecordRepository', () => {
  let db: TestDatabase;
  let definitions: EventDefinitionRepository;
  let records: EventRecordRepository;
  let tags: TagRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    definitions = new EventDefinitionRepository(db);
    records = new EventRecordRepository(db);
    tags = new TagRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  async function createCounter(overrides: { name?: string; unit?: string } = {}) {
    return definitions.create({
      name: overrides.name ?? '喝水',
      kind: 'counter',
      unit: overrides.unit,
      tagIds: [],
      quickOptions: [],
    });
  }

  it('记录计数型事件：写入并生成快照', async () => {
    const definition = await createCounter({ unit: '杯' });
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    expect(record.id).toBeTruthy();
    expect(record.kind).toBe('counter');
    expect(record.value).toBe(1);
    expect(record.unit).toBe('杯');
    expect(record.occurredAt).toBe(T1);
    expect(record.recordedAt).toBe(T1);
    expect(record.source).toBe('manual');
    expect(record.snapshot.name).toBe('喝水');
    expect(record.snapshot.definitionId).toBe(definition.id);
    expect(record.deletedAt).toBeUndefined();

    expect(await records.getById(record.id)).toEqual(record);
  });

  it('记录数量型事件，快捷选项可覆盖单位', async () => {
    const definition = await definitions.create({
      name: '饮水',
      kind: 'quantity',
      unit: '升',
      tagIds: [],
      quickOptions: [],
    });
    const record = await records.record(
      { definitionId: definition.id, value: 0.5, unit: '瓶', source: 'quick' },
      T1,
    );

    expect(record.value).toBe(0.5);
    expect(record.unit).toBe('瓶');
    expect(record.source).toBe('quick');
  });

  it('记录时先落一条再读回，按事实发生时间倒序', async () => {
    const definition = await createCounter();
    await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    await records.record({ definitionId: definition.id, value: 2, source: 'manual' }, T2);

    const list = await records.list();
    expect(list.map((item) => item.value)).toEqual([2, 1]);
  });

  it('occurredAt 省略时等于录入时间', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    expect(record.occurredAt).toBe(T1);
    expect(record.recordedAt).toBe(T1);
  });

  it('可按定义过滤，并支持 limit', async () => {
    const a = await createCounter({ name: 'A' });
    const b = await createCounter({ name: 'B' });
    await records.record({ definitionId: a.id, value: 1, source: 'manual' }, T1);
    await records.record({ definitionId: a.id, value: 1, source: 'manual' }, T2);
    await records.record({ definitionId: b.id, value: 1, source: 'manual' }, T2);

    expect((await records.list({ definitionId: a.id })).length).toBe(2);
    expect((await records.list({ limit: 1 })).length).toBe(1);
  });

  it('归档的事件不能新增记录，且不会写入任何数据', async () => {
    const definition = await createCounter();
    await definitions.setArchived(definition.id, true);

    await expect(
      records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1),
    ).rejects.toThrow(ConflictError);
    expect(await records.list()).toEqual([]);
  });

  it('定义不存在时抛 NotFoundError', async () => {
    await expect(records.record({ definitionId: 'missing', value: 1, source: 'manual' }, T1)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('取值校验：计数型非整数、非正数、非法来源、非法时间都被拒绝', async () => {
    const definition = await createCounter();

    await expect(
      records.record({ definitionId: definition.id, value: 0.5, source: 'manual' }, T1),
    ).rejects.toThrow(ValidationError);
    await expect(
      records.record({ definitionId: definition.id, value: -1, source: 'manual' }, T1),
    ).rejects.toThrow(ValidationError);
    await expect(
      records.record({ definitionId: definition.id, value: 1, source: 'auto' as unknown as 'manual' }, T1),
    ).rejects.toThrow(ValidationError);
    await expect(
      records.record({ definitionId: definition.id, value: 1, source: 'manual', occurredAt: '昨天' }, T1),
    ).rejects.toThrow(ValidationError);
    expect(await records.list()).toEqual([]);
  });

  it('补录：把 occurredAt 设为过去，来源为 backfill', async () => {
    const definition = await createCounter();
    const earlier = '2026-10-18T21:30:00.000Z';
    const record = await records.record(
      { definitionId: definition.id, value: 2, source: 'backfill', occurredAt: earlier },
      T1,
    );

    expect(record.occurredAt).toBe(earlier);
    expect(record.recordedAt).toBe(T1);
    expect(record.source).toBe('backfill');
  });

  it('补录的旧记录排在时间轴靠后（按发生时间而非录入时间排序）', async () => {
    const definition = await createCounter();
    const later = '2026-10-18T00:00:00.000Z';
    const earlier = '2026-10-01T00:00:00.000Z';

    await records.record({ definitionId: definition.id, value: 1, source: 'manual', occurredAt: later }, T1);
    await records.record(
      { definitionId: definition.id, value: 2, source: 'backfill', occurredAt: earlier },
      T1,
    );

    expect((await records.list()).map((item) => item.occurredAt)).toEqual([later, earlier]);
  });

  it('补录不能指向未来：晚于录入时间被拒绝且不写库', async () => {
    const definition = await createCounter();
    const future = '2026-10-20T00:00:00.000Z'; // T1 = 2026-10-19T08:00:00.000Z

    await expect(
      records.record({ definitionId: definition.id, value: 1, source: 'backfill', occurredAt: future }, T1),
    ).rejects.toThrow(ValidationError);
    expect(await records.list()).toEqual([]);
  });

  it('occurredAt 恰好等于录入时间时允许（边界）', async () => {
    const definition = await createCounter();
    const record = await records.record(
      { definitionId: definition.id, value: 1, source: 'manual', occurredAt: T1 },
      T1,
    );
    expect(record.occurredAt).toBe(T1);
  });

  it('快照不可篡改：之后改名/换单位/归档都不影响历史', async () => {
    const definition = await createCounter({ unit: '杯' });
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    await definitions.update(definition.id, {
      name: '喝水（含茶）',
      kind: 'counter',
      unit: '毫升',
      tagIds: [],
      quickOptions: [],
    });

    const after = await records.getById(record.id);
    expect(after?.snapshot.name).toBe('喝水');
    expect(after?.snapshot.unit).toBe('杯');
  });

  it('记录时把定义的标签固化为快照', async () => {
    const tag = await tags.create({ name: '早晨' });
    const definition = await definitions.create({
      name: '喝水',
      kind: 'counter',
      tagIds: [tag.id],
      quickOptions: [],
    });

    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    expect(record.tagIds).toEqual([tag.id]);
    expect(record.snapshot.tagIds).toEqual([tag.id]);

    // 之后删除标签，历史快照里的 tagId 仍在
    await tags.remove(tag.id);
    expect((await records.getById(record.id))?.snapshot.tagIds).toEqual([tag.id]);
  });

  it('永久删除定义后，历史记录仍然存在且可读', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 3, source: 'manual' }, T1);

    await definitions.remove(definition.id);

    const after = await records.getById(record.id);
    expect(after).not.toBeNull();
    expect(after?.snapshot.name).toBe('喝水');
    expect(after?.value).toBe(3);
  });

  it('软删除的记录默认不出现，includeDeleted 时才列出', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    await db.runAsync('UPDATE event_records SET deleted_at = ? WHERE id = ?', T1, record.id);

    expect(await records.list()).toEqual([]);
    expect((await records.list({ includeDeleted: true })).map((item) => item.id)).toEqual([record.id]);
  });
});
