import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { NotFoundError, StorageError, ValidationError } from '@/domain/errors';
import type { EventDefinitionDraft } from '@/domain/validation';
import { EventDefinitionRepository } from '@/repositories/eventDefinitionRepository';
import { EventGroupRepository } from '@/repositories/eventGroupRepository';
import { TagRepository } from '@/repositories/tagRepository';

function counterDraft(overrides: Partial<EventDefinitionDraft> = {}): EventDefinitionDraft {
  return {
    name: '喝水',
    kind: 'counter',
    tagIds: [],
    quickOptions: [],
    ...overrides,
  };
}

describe('EventDefinitionRepository', () => {
  let db: TestDatabase;
  let definitions: EventDefinitionRepository;
  let groups: EventGroupRepository;
  let tags: TagRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    definitions = new EventDefinitionRepository(db);
    groups = new EventGroupRepository(db);
    tags = new TagRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('创建定义并连带写入快捷选项与标签，读取时完整聚合', async () => {
    const group = await groups.create({ name: '健康' });
    const tagA = await tags.create({ name: '早晨' });
    const tagB = await tags.create({ name: '运动后' });

    const created = await definitions.create(
      counterDraft({
        attributes: ['杯'],
        groupId: group.id,
        quickOptions: [
          { attribute: '杯', value: 1, sortOrder: 0 },
          { attribute: '杯', value: 2, sortOrder: 1 },
        ],
        tagIds: [tagA.id, tagB.id],
      }),
      '2026-10-19T00:00:00.000Z',
    );

    expect(created.name).toBe('喝水');
    expect(created.kind).toBe('counter');
    expect(created.attributes).toEqual(['杯']);
    expect(created.groupId).toBe(group.id);
    expect(created.tagIds.sort()).toEqual([tagA.id, tagB.id].sort());
    expect(created.quickOptions.map((option) => option.attribute)).toEqual(['杯', '杯']);
    expect(created.quickOptions.map((option) => option.value)).toEqual([1, 2]);
    expect(created.isArchived).toBe(false);

    const fetched = await definitions.getById(created.id);
    expect(fetched).toEqual(created);
  });

  it('默认可选字段为 undefined / 空列表', async () => {
    const created = await definitions.create(counterDraft());
    expect(created.attributes).toEqual([]);
    expect(created.groupId).toBeUndefined();
    expect(created.color).toBeUndefined();
    expect(created.icon).toBeUndefined();
    expect(created.quickOptions).toEqual([]);
    expect(created.tagIds).toEqual([]);
  });

  it('getById 不存在返回 null', async () => {
    expect(await definitions.getById('missing')).toBeNull();
  });

  it('list 默认排除归档，includeArchived 时包含', async () => {
    const active = await definitions.create(counterDraft({ name: '喝水' }));
    const archived = await definitions.create(counterDraft({ name: '旧事件' }));
    await definitions.setArchived(archived.id, true);

    expect((await definitions.list()).map((item) => item.id)).toEqual([active.id]);
    expect((await definitions.list({ includeArchived: true })).map((item) => item.id).sort()).toEqual(
      [active.id, archived.id].sort(),
    );
  });

  it('list 按 sort_order 排序', async () => {
    await definitions.create(counterDraft({ name: '乙', sortOrder: 1 }));
    await definitions.create(counterDraft({ name: '甲', sortOrder: 0 }));

    expect((await definitions.list()).map((item) => item.name)).toEqual(['甲', '乙']);
  });

  it('更新是整体替换：旧的快捷选项与标签被移除', async () => {
    const tagA = await tags.create({ name: 'a' });
    const tagB = await tags.create({ name: 'b' });
    const created = await definitions.create(
      counterDraft({
        quickOptions: [{ value: 1 }],
        tagIds: [tagA.id],
      }),
    );

    const updated = await definitions.update(
      created.id,
      counterDraft({
        name: '喝水（含茶）',
        quickOptions: [{ attribute: '杯', value: 3 }],
        tagIds: [tagB.id],
      }),
      '2026-10-20T00:00:00.000Z',
    );

    expect(updated.name).toBe('喝水（含茶）');
    expect(updated.quickOptions.map((option) => option.attribute)).toEqual(['杯']);
    expect(updated.tagIds).toEqual([tagB.id]);
    expect(updated.updatedAt).toBe('2026-10-20T00:00:00.000Z');

    // 数据库里旧的子表行确实没了
    expect(db.rawAll('SELECT id FROM quick_options WHERE definition_id = ?', created.id)).toHaveLength(1);
    expect(db.rawAll('SELECT tag_id FROM event_definition_tags WHERE definition_id = ?', created.id)).toEqual(
      [{ tag_id: tagB.id }],
    );
  });

  it('更新不存在的定义抛 NotFoundError', async () => {
    await expect(definitions.update('missing', counterDraft())).rejects.toThrow(NotFoundError);
  });

  it('归档只改标记，定义与子表都还在', async () => {
    const created = await definitions.create(counterDraft({ quickOptions: [{ value: 1 }] }));
    await definitions.setArchived(created.id, true);

    const archived = await definitions.getById(created.id);
    expect(archived?.isArchived).toBe(true);
    expect(archived?.quickOptions).toHaveLength(1);
    expect(db.rawAll('SELECT id FROM quick_options WHERE definition_id = ?', created.id)).toHaveLength(1);

    await definitions.setArchived(created.id, false);
    expect((await definitions.getById(created.id))?.isArchived).toBe(false);
  });

  it('归档不存在的定义抛 NotFoundError', async () => {
    await expect(definitions.setArchived('missing', true)).rejects.toThrow(NotFoundError);
  });

  it('永久删除级联清理子表，但不影响分组与标签本身', async () => {
    const group = await groups.create({ name: '健康' });
    const tag = await tags.create({ name: '早晨' });
    const created = await definitions.create(
      counterDraft({
        groupId: group.id,
        quickOptions: [{ value: 1 }],
        tagIds: [tag.id],
      }),
    );

    await definitions.remove(created.id);

    expect(await definitions.getById(created.id)).toBeNull();
    expect(db.rawAll('SELECT id FROM quick_options WHERE definition_id = ?', created.id)).toEqual([]);
    expect(
      db.rawAll('SELECT definition_id FROM event_definition_tags WHERE definition_id = ?', created.id),
    ).toEqual([]);
    expect(await groups.getById(group.id)).not.toBeNull();
    expect(await tags.getById(tag.id)).not.toBeNull();
  });

  it('删除分组把定义的 groupId 置空，定义保留', async () => {
    const group = await groups.create({ name: '健康' });
    const created = await definitions.create(counterDraft({ groupId: group.id }));

    await groups.remove(group.id);

    const after = await definitions.getById(created.id);
    expect(after).not.toBeNull();
    expect(after?.groupId).toBeUndefined();
  });

  it('删除标签只解除关联，定义保留', async () => {
    const tag = await tags.create({ name: '早晨' });
    const created = await definitions.create(counterDraft({ tagIds: [tag.id] }));

    await tags.remove(tag.id);

    const after = await definitions.getById(created.id);
    expect(after?.tagIds).toEqual([]);
  });

  it('空名 / 非法类型 / 非法快捷选项取值都会被拒绝', async () => {
    await expect(definitions.create(counterDraft({ name: '  ' }))).rejects.toThrow(ValidationError);
    await expect(definitions.create(counterDraft({ kind: 'count' as unknown as 'counter' }))).rejects.toThrow(
      ValidationError,
    );
    await expect(definitions.create(counterDraft({ quickOptions: [{ value: 0.5 }] }))).rejects.toThrow(
      ValidationError,
    );
    await expect(definitions.create(counterDraft({ quickOptions: [{ value: -1 }] }))).rejects.toThrow(
      ValidationError,
    );
  });

  it('计数型的属性可以是多条，空白与前后空格会被规整掉', async () => {
    const created = await definitions.create(counterDraft({ attributes: [' 温水 ', '500ml', '  ', ''] }));

    expect(created.attributes).toEqual(['温水', '500ml']);
    expect((await definitions.getById(created.id))?.attributes).toEqual(['温水', '500ml']);
  });

  it('周期型：做法必填、属性恒为空、周期长度照写', async () => {
    const created = await definitions.create({
      name: '生理期',
      kind: 'cycle',
      // 周期记的是「哪一天」，不是「一次是什么」：属性与快捷选项一律丢弃
      attributes: ['不该保留'],
      quickOptions: [{ value: 1 }],
      cycleMode: 'auto',
      averageCycleLengthDays: 28,
      averagePeriodLengthDays: 5,
      tagIds: [],
    });

    expect(created.kind).toBe('cycle');
    expect(created.cycleMode).toBe('auto');
    expect(created.averageCycleLengthDays).toBe(28);
    expect(created.averagePeriodLengthDays).toBe(5);
    expect(created.attributes).toEqual([]);
    expect(created.quickOptions).toEqual([]);

    // 不写做法时兜底成手动（老数据都是一段自己点开始、自己点结束的周期）
    const manual = await definitions.create({ name: '减肥', kind: 'cycle', tagIds: [], quickOptions: [] });
    expect(manual.cycleMode).toBe('manual');
  });

  it('写入中途失败会整体回滚，不产生半成品', async () => {
    const created = await definitions.create(counterDraft({ quickOptions: [{ value: 1 }] }));

    // 用一个不存在的标签 id 触发外键错误 → 事务回滚
    await expect(
      definitions.update(
        created.id,
        counterDraft({ name: '改了', tagIds: ['missing-tag'], quickOptions: [] }),
      ),
    ).rejects.toThrow(StorageError);

    const after = await definitions.getById(created.id);
    expect(after?.name).toBe('喝水'); // 名字没被改掉
    expect(after?.quickOptions.map((option) => option.value)).toEqual([1]); // 快捷选项还在
  });

  it('删除不存在的定义抛 NotFoundError', async () => {
    await expect(definitions.remove('missing')).rejects.toThrow(NotFoundError);
  });
});
