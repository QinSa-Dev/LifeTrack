import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors';
import { EventDefinitionRepository } from '@/repositories/eventDefinitionRepository';
import { EventRecordRepository } from '@/repositories/eventRecordRepository';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';
const T3 = '2026-10-19T10:00:00.000Z';

describe('EventRecordRepository', () => {
  let db: TestDatabase;
  let definitions: EventDefinitionRepository;
  let records: EventRecordRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    definitions = new EventDefinitionRepository(db);
    records = new EventRecordRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  async function createCounter(overrides: { name?: string; attributes?: string[] } = {}) {
    return definitions.create({
      name: overrides.name ?? '喝水',
      kind: 'counter',
      attributes: overrides.attributes,
      quickOptions: [],
    });
  }

  it('记录计数型事件：写入并生成快照', async () => {
    const definition = await createCounter({ attributes: ['杯'] });
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    expect(record.id).toBeTruthy();
    expect(record.kind).toBe('counter');
    expect(record.value).toBe(1);
    expect(record.attributes).toEqual([]); // 一个都没标
    expect(record.fieldValues).toEqual([]); // 也没选字段值
    expect(record.snapshot.attributes).toEqual(['杯']); // 定义当时的属性留在快照里
    expect(record.snapshot.fields).toEqual([]);
    expect(record.occurredAt).toBe(T1);
    expect(record.recordedAt).toBe(T1);
    expect(record.source).toBe('manual');
    expect(record.snapshot.name).toBe('喝水');
    expect(record.snapshot.definitionId).toBe(definition.id);
    expect(record.deletedAt).toBeUndefined();

    expect(await records.getById(record.id)).toEqual(record);
  });

  it('记录时标上的属性会写进记录（可多条），快照仍留定义当时的属性', async () => {
    const definition = await definitions.create({
      name: '饮水',
      kind: 'counter',
      attributes: ['升'],
      quickOptions: [],
    });
    const record = await records.record(
      { definitionId: definition.id, value: 1, attributes: ['温水', '瓶'], source: 'quick' },
      T1,
    );

    expect(record.value).toBe(1);
    expect(record.attributes).toEqual(['温水', '瓶']);
    expect(record.snapshot.attributes).toEqual(['升']);
    expect(record.source).toBe('quick');
    expect((await records.getById(record.id))?.attributes).toEqual(['温水', '瓶']);
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

  it('可按发生时间范围读取（半开区间 [from, until)）', async () => {
    const definition = await createCounter();
    for (const at of [
      '2026-10-01T00:00:00.000Z',
      '2026-10-15T00:00:00.000Z',
      '2026-10-20T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
    ]) {
      await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, at);
    }

    // from 含、until 不含：正好落在边界上的两条各算一侧
    const range = await records.list({
      from: '2026-10-15T00:00:00.000Z',
      until: '2026-10-20T00:00:00.000Z',
    });
    expect(range.map((item) => item.occurredAt)).toEqual(['2026-10-15T00:00:00.000Z']);

    // 只给一侧也可以
    expect((await records.list({ from: '2026-10-16T00:00:00.000Z' })).length).toBe(2);
    expect((await records.list({ until: '2026-10-15T00:00:00.000Z' })).length).toBe(1);

    // 范围排除软删除、也能和定义 / limit 一起用（AND 叠加）
    const soft = await records.record(
      { definitionId: definition.id, value: 1, source: 'manual' },
      '2026-10-16T00:00:00.000Z',
    );
    await records.softDelete(soft.id);
    const other = await createCounter({ name: '另一个' });
    await records.record({ definitionId: other.id, value: 1, source: 'manual' }, '2026-10-17T00:00:00.000Z');

    expect((await records.list({ from: '2026-10-16T00:00:00.000Z' })).length).toBe(3);
    expect((await records.list({ from: '2026-10-16T00:00:00.000Z', includeDeleted: true })).length).toBe(4);
    expect((await records.list({ from: '2026-10-16T00:00:00.000Z', definitionId: other.id })).length).toBe(1);
    expect((await records.list({ from: '2026-10-16T00:00:00.000Z', limit: 1 })).length).toBe(1);
  });

  it('时间范围不是合法时间戳时抛错，且不查库', async () => {
    await expect(records.list({ from: '昨天' })).rejects.toThrow(ValidationError);
    await expect(records.list({ until: '2026-10-20' })).rejects.toThrow(ValidationError);
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

  it('快照不可篡改：之后改名/换属性/归档都不影响历史', async () => {
    const definition = await createCounter({ attributes: ['杯'] });
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    await definitions.update(definition.id, {
      name: '喝水（含茶）',
      kind: 'counter',
      attributes: ['毫升'],
      quickOptions: [],
    });

    const after = await records.getById(record.id);
    expect(after?.snapshot.name).toBe('喝水');
    expect(after?.snapshot.attributes).toEqual(['杯']);
  });

  it('记录时把定义的字段固化为快照，取值一并保存', async () => {
    const definition = await definitions.create({
      name: '喝水',
      kind: 'counter',
      fields: [{ name: '时段', kind: 'single', options: ['早晨', '晚上'] }],
      quickOptions: [],
    });
    const field = definition.fields[0]!;

    const record = await records.record(
      {
        definitionId: definition.id,
        value: 1,
        fieldValues: [{ fieldId: field.id, values: ['早晨'] }],
        source: 'manual',
      },
      T1,
    );
    expect(record.fieldValues).toEqual([{ fieldId: field.id, values: ['早晨'] }]);
    expect(record.snapshot.fields).toEqual([
      { id: field.id, name: '时段', kind: 'single', options: ['早晨', '晚上'] },
    ]);

    // 之后把字段换掉，历史快照里的字段定义与取值仍在
    await definitions.update(definition.id, {
      name: '喝水',
      kind: 'counter',
      fields: [{ name: '心情', kind: 'multi', options: ['好'] }],
      quickOptions: [],
    });
    const after = await records.getById(record.id);
    expect(after?.snapshot.fields[0]?.name).toBe('时段');
    expect(after?.fieldValues[0]?.values).toEqual(['早晨']);
  });

  it('记录时的字段取值按定义校验：候选之外的枚举值 / 非法时间点都被拒绝', async () => {
    const definition = await definitions.create({
      name: '喝水',
      kind: 'counter',
      fields: [
        { name: '时段', kind: 'single', options: ['早晨'] },
        { name: '起床', kind: 'time' },
      ],
      quickOptions: [],
    });
    const [shift, wake] = definition.fields;

    await expect(
      records.record(
        {
          definitionId: definition.id,
          value: 1,
          fieldValues: [{ fieldId: shift!.id, values: ['中午'] }],
          source: 'manual',
        },
        T1,
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      records.record(
        {
          definitionId: definition.id,
          value: 1,
          fieldValues: [{ fieldId: wake!.id, values: ['25:00'] }],
          source: 'manual',
        },
        T1,
      ),
    ).rejects.toThrow(ValidationError);
    expect(await records.list()).toEqual([]);
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

  it('软删除：默认从列表消失，includeDeleted 时才列出，行与快照都保留', async () => {
    const definition = await createCounter({ attributes: ['杯'] });
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    const deleted = await records.softDelete(record.id, T2);
    expect(deleted.deletedAt).toBe(T2);
    expect(deleted.snapshot.name).toBe('喝水'); // 行还在，快照也在，所以能撤销

    expect(await records.list()).toEqual([]);
    expect((await records.list({ includeDeleted: true })).map((item) => item.id)).toEqual([record.id]);
    expect(await records.getById(record.id)).not.toBeNull();
  });

  it('软删除是幂等的：重复删除不报错，也不覆盖原来的删除时间', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    const first = await records.softDelete(record.id, T2);
    const second = await records.softDelete(record.id, T3);

    expect(first.deletedAt).toBe(T2);
    expect(second.deletedAt).toBe(T2); // 保持第一次的删除时间
  });

  it('软删除只影响目标记录', async () => {
    const definition = await createCounter();
    const keep = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    const drop = await records.record({ definitionId: definition.id, value: 2, source: 'manual' }, T2);

    await records.softDelete(drop.id, T3);

    expect((await records.list()).map((item) => item.id)).toEqual([keep.id]);
  });

  it('撤销软删除：记录重新可见，deletedAt 被清空', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    await records.softDelete(record.id, T2);

    const restored = await records.restore(record.id);

    expect(restored.deletedAt).toBeUndefined();
    expect((await records.list()).map((item) => item.id)).toEqual([record.id]);
  });

  it('撤销未删除的记录是幂等的，不报错', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    const restored = await records.restore(record.id);
    expect(restored.deletedAt).toBeUndefined();
  });

  it('软删除 / 撤销不存在的记录都抛 NotFoundError', async () => {
    await expect(records.softDelete('missing', T1)).rejects.toThrow(NotFoundError);
    await expect(records.restore('missing')).rejects.toThrow(NotFoundError);
  });

  it('回收站：onlyDeleted 只列软删除的记录，按删除时间倒序', async () => {
    const definition = await createCounter();
    const keep = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    const older = await records.record({ definitionId: definition.id, value: 2, source: 'manual' }, T2);
    const newer = await records.record({ definitionId: definition.id, value: 3, source: 'manual' }, T3);

    await records.softDelete(older.id, T2);
    await records.softDelete(newer.id, T3);

    expect((await records.list({ onlyDeleted: true })).map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(await records.list()).toEqual([keep]);
  });

  it('永久删除：行被彻底移除，读不回，也不在回收站里', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    await records.softDelete(record.id, T2);

    await records.remove(record.id);

    expect(await records.getById(record.id)).toBeNull();
    expect(await records.list({ includeDeleted: true })).toEqual([]);
    expect(await records.list({ onlyDeleted: true })).toEqual([]);
  });

  it('永久删除只影响目标记录', async () => {
    const definition = await createCounter();
    const keep = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    const drop = await records.record({ definitionId: definition.id, value: 2, source: 'manual' }, T2);

    await records.remove(drop.id);

    expect((await records.list()).map((item) => item.id)).toEqual([keep.id]);
  });

  it('撤销之后仍可永久删除（软删除 → 撤销 → 永久删除 无漏洞）', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    await records.softDelete(record.id, T2);
    await records.restore(record.id);
    await records.remove(record.id);

    expect(await records.getById(record.id)).toBeNull();
  });

  it('永久删除不存在的记录抛 NotFoundError', async () => {
    await expect(records.remove('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('EventRecordRepository.update', () => {
  let db: TestDatabase;
  let definitions: EventDefinitionRepository;
  let records: EventRecordRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    definitions = new EventDefinitionRepository(db);
    records = new EventRecordRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  async function createCounter(overrides: { name?: string; attributes?: string[] } = {}) {
    return definitions.create({
      name: overrides.name ?? '喝水',
      kind: 'counter',
      attributes: overrides.attributes,
      quickOptions: [],
    });
  }

  it('改取值与备注：改动落库，快照纹丝不动', async () => {
    const definition = await definitions.create({
      name: '喝水',
      kind: 'counter',
      attributes: ['毫升'],
      quickOptions: [],
    });
    const record = await records.record(
      { definitionId: definition.id, value: 300, attributes: ['毫升'], note: '随手一杯', source: 'manual' },
      T1,
    );
    // 定义后来改名换属性：历史不该跟着变
    await definitions.update(definition.id, {
      name: '饮水',
      kind: 'counter',
      attributes: ['升'],
      quickOptions: [],
    });

    const updated = await records.update(record.id, { value: 500, note: '大杯' });

    expect(updated.value).toBe(500);
    expect(updated.note).toBe('大杯');
    expect(updated.attributes).toEqual(['毫升']); // 记录当时标的属性
    expect(updated.snapshot.attributes).toEqual(['毫升']); // 记录当时的定义属性
    expect(updated.snapshot.name).toBe('喝水'); // 记录当时的名称
    expect(updated.recordedAt).toBe(T1);
    expect(updated.source).toBe('manual');
  });

  it('省略备注即清空备注（这三个字段是整体替换）', async () => {
    const definition = await createCounter();
    const record = await records.record(
      { definitionId: definition.id, value: 1, note: '运动后', source: 'manual' },
      T1,
    );

    const updated = await records.update(record.id, { value: 2 });

    expect(updated.note).toBeUndefined();
  });

  it('可以改发生时间：只允许移到录入时间之前（未来还没发生）', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T3);

    const earlier = await records.update(record.id, { value: 1, occurredAt: T1 });
    expect(earlier.occurredAt).toBe(T1);
    expect(earlier.recordedAt).toBe(T3);

    await expect(
      records.update(record.id, { value: 1, occurredAt: '2026-10-20T00:00:00.000Z' }),
    ).rejects.toThrow(ValidationError);
    // 被拒之后原来的值还在，没有写坏
    expect((await records.getById(record.id))?.occurredAt).toBe(T1);
  });

  it('取值仍按类型校验：计数型不接受 0 或负数', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);

    await expect(records.update(record.id, { value: 0 })).rejects.toThrow(ValidationError);
    await expect(records.update(record.id, { value: -2 })).rejects.toThrow(ValidationError);
    expect((await records.getById(record.id))?.value).toBe(1);
  });

  it('已软删除的记录不能改：先撤销删除', async () => {
    const definition = await createCounter();
    const record = await records.record({ definitionId: definition.id, value: 1, source: 'manual' }, T1);
    await records.softDelete(record.id, T2);

    await expect(records.update(record.id, { value: 5 })).rejects.toThrow(ConflictError);

    await records.restore(record.id);
    expect((await records.update(record.id, { value: 5 })).value).toBe(5);
  });

  it('改不存在的记录抛 NotFoundError', async () => {
    await expect(records.update('missing', { value: 1 })).rejects.toThrow(NotFoundError);
  });
});
