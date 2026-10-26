import { createBackup, parseBackup, serializeBackup, sortBackupData, type BackupFile } from '@/domain/backup';
import { runMigrations } from '@/db/migrations';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { ImportError, StorageError } from '@/domain/errors';
import { BackupRepository } from '@/repositories/backupRepository';
import { CycleEntryRepository } from '@/repositories/cycleEntryRepository';
import { CycleInstanceRepository } from '@/repositories/cycleInstanceRepository';
import { EventDefinitionRepository } from '@/repositories/eventDefinitionRepository';
import { EventGroupRepository } from '@/repositories/eventGroupRepository';
import { EventRecordRepository } from '@/repositories/eventRecordRepository';
import { MetaRepository } from '@/repositories/metaRepository';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';
const T3 = '2026-10-20T09:00:00.000Z';
const T4 = '2026-10-21T09:00:00.000Z';

interface Context {
  db: TestDatabase;
  backup: BackupRepository;
  groups: EventGroupRepository;
  definitions: EventDefinitionRepository;
  records: EventRecordRepository;
  instances: CycleInstanceRepository;
  entries: CycleEntryRepository;
  meta: MetaRepository;
}

async function setup(): Promise<Context> {
  const db = createTestDatabase();
  await runMigrations(db, MIGRATIONS);
  return {
    db,
    backup: new BackupRepository(db),
    groups: new EventGroupRepository(db),
    definitions: new EventDefinitionRepository(db),
    records: new EventRecordRepository(db),
    instances: new CycleInstanceRepository(db),
    entries: new CycleEntryRepository(db),
    meta: new MetaRepository(db),
  };
}

/**
 * 一份有代表性的数据：分组 / 带自定义字段与快捷选项的定义 / 归档的定义 /
 * 带字段取值的有效记录 / 软删除记录 / 周期型事件 + 实例 + 每日记录。
 */
async function seed(context: Context): Promise<void> {
  const group = await context.groups.create({ name: '健康', color: '#0af' }, T1);

  const definition = await context.definitions.create(
    {
      name: '喝水',
      kind: 'counter',
      attributes: ['杯', '温水'],
      groupId: group.id,
      fields: [{ name: '时段', kind: 'multi', options: ['早晨', '晚上'] }],
      quickOptions: [{ attribute: '杯', value: 1, sortOrder: 0 }],
    },
    T1,
  );
  const archived = await context.definitions.create(
    { name: '咖啡', kind: 'counter', attributes: ['杯'], quickOptions: [] },
    T1,
  );
  await context.definitions.setArchived(archived.id, true, T1);

  await context.records.record(
    {
      definitionId: definition.id,
      value: 1,
      attributes: ['温水'],
      fieldValues: [{ fieldId: definition.fields[0]!.id, values: ['早晨'] }],
      source: 'manual',
    },
    T1,
  );
  const dropped = await context.records.record(
    { definitionId: definition.id, value: 2, source: 'quick' },
    T2,
  );
  await context.records.softDelete(dropped.id, T3);

  const cycleDefinition = await context.definitions.create(
    {
      name: '生理期',
      kind: 'cycle',
      cycleMode: 'manual',
      averageCycleLengthDays: 28,
      quickOptions: [],
    },
    T1,
  );
  const instance = await context.instances.create(
    { definitionId: cycleDefinition.id, startDate: '2026-10-01', endDate: '2026-10-05' },
    T1,
  );
  await context.entries.save(instance.id, { date: '2026-10-02', phase: '经期', symptoms: ['头痛'] }, T1);
}

/** 取导出数据里某个名字的定义，找不到就失败（夹具变更时能立刻发现） */
function findDefinition(file: BackupFile, name: string) {
  const found = file.data.eventDefinitions.find((item) => item.name === name);
  if (!found) {
    throw new Error(`导出数据里没有定义：${name}`);
  }
  return found;
}

describe('BackupRepository.exportAll', () => {
  let context: Context;

  beforeEach(async () => {
    context = await setup();
  });

  afterEach(() => {
    context.db.close();
  });

  it('空库导出的内容为空，但格式与 schema 版本是齐的', async () => {
    const file = await context.backup.exportAll(T1, '0.1.0');

    expect(file.format).toBe('lifetrack-backup');
    expect(file.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(file.exportedAt).toBe(T1);
    expect(file.appVersion).toBe('0.1.0');
    expect(file.data.eventGroups).toEqual([]);
    expect(file.data.eventDefinitions).toEqual([]);
    expect(file.data.cycleEntries).toEqual([]);
  });

  it('归档的定义与软删除的记录都要导出（备份必须无损）', async () => {
    await seed(context);

    const file = await context.backup.exportAll(T1);
    const names = file.data.eventDefinitions.map((item) => item.name);

    // 三个定义都是 sortOrder 0 / createdAt 相同，按主键（uuid v7，创建顺序）兜底排序
    // ——周期型也是事件定义，自然排在一起
    expect(names).toEqual(['喝水', '咖啡', '生理期']);
    expect(findDefinition(file, '咖啡').isArchived).toBe(true);
    expect(findDefinition(file, '喝水').attributes).toEqual(['杯', '温水']);
    expect(findDefinition(file, '喝水').fields.map((field) => field.name)).toEqual(['时段']);
    expect(findDefinition(file, '喝水').quickOptions).toHaveLength(1);
    expect(findDefinition(file, '生理期').cycleMode).toBe('manual');
    expect(file.data.eventRecords).toHaveLength(2);
    expect(file.data.eventRecords.filter((record) => record.deletedAt !== undefined)).toHaveLength(1);
    expect(file.data.cycleInstances).toHaveLength(1);
    expect(file.data.cycleEntries).toHaveLength(1);
  });

  it('导出的是稳定顺序：同一份数据两次导出完全一致', async () => {
    await seed(context);

    expect(serializeBackup(await context.backup.exportAll(T1))).toBe(
      serializeBackup(await context.backup.exportAll(T1)),
    );
  });

  it('软删除的周期记录也导出（备份必须无损）', async () => {
    await seed(context);
    const instance = (await context.instances.list())[0];
    if (!instance) {
      throw new Error('夹具数据缺失：周期实例');
    }
    const entry = (await context.entries.listByInstance(instance.id))[0];
    if (!entry) {
      throw new Error('夹具数据缺失：周期记录');
    }
    await context.entries.softDelete(entry.id, T4);

    const file = await context.backup.exportAll(T1);

    // 界面上看不到，但备份里带着删除标记
    expect(await context.entries.listByInstance(instance.id)).toEqual([]);
    expect(file.data.cycleEntries).toHaveLength(1);
    expect(file.data.cycleEntries[0]?.deletedAt).toBe(T4);
  });
});

describe('BackupRepository.importAll', () => {
  let context: Context;

  beforeEach(async () => {
    context = await setup();
  });

  afterEach(() => {
    context.db.close();
  });

  /** 导出 → 文本 → 解析，模拟「用户把文件存下来再读回来」 */
  async function exportToText(source: Context): Promise<string> {
    return serializeBackup(await source.backup.exportAll(T1, '0.1.0'));
  }

  it('导出到新库是无损往返（经过文本序列化）', async () => {
    await seed(context);
    const text = await exportToText(context);
    const file = parseBackup(text);

    const target = await setup();
    try {
      const summary = await target.backup.importAll(file);

      expect(summary.totals.added).toBe(8); // 1 分组 + 3 定义 + 2 记录 + 1 周期实例 + 1 周期记录
      expect(summary.totals.updated).toBe(0);
      expect(summary.totals.kept).toBe(0);
      expect(sortBackupData(await target.backup.readAll())).toEqual(file.data);
    } finally {
      target.db.close();
    }
  });

  it('重复导入同一份备份是幂等的：第二次全部走「保留」，不再重写', async () => {
    await seed(context);
    const file = parseBackup(await exportToText(context));

    const first = await context.backup.importAll(file);
    const second = await context.backup.importAll(file);

    expect(first.totals.added).toBe(0);
    expect(second.totals).toEqual({ added: 0, updated: 0, kept: 8 });
  });

  it('导入是合并：本地独有的数据一定保留', async () => {
    await seed(context);
    const file = parseBackup(await exportToText(context));

    // 导出之后本地又记了一条，导入旧备份不能把它挤掉
    const definition = (await context.definitions.list()).find((item) => item.name === '喝水');
    await context.records.record({ definitionId: definition!.id, value: 5, source: 'manual' }, T3);

    const summary = await context.backup.importAll(file);

    const values = (await context.records.list()).map((record) => record.value);
    expect(values).toContain(5);
    expect(summary.collections.eventRecords.kept).toBe(3);
  });

  it('同 id 冲突按 updatedAt 判断：本地较新则保留本地，备份较新则覆盖', async () => {
    await seed(context);
    const file = parseBackup(await exportToText(context));
    const original = findDefinition(file, '喝水');
    const id = original.id;

    // 本地改一次名（updatedAt = T3）
    await context.definitions.update(
      id,
      { name: '喝水（本地）', kind: 'counter', attributes: ['杯'], quickOptions: [] },
      T3,
    );

    // 备份更旧（T2）→ 本地胜出
    const renamed = (name: string, updatedAt: string) => ({
      ...file.data,
      eventDefinitions: file.data.eventDefinitions.map((item) =>
        item.id === id ? { ...item, name, updatedAt } : item,
      ),
    });
    const older = createBackup(renamed('喝水（旧备份）', T2), {
      schemaVersion: LATEST_SCHEMA_VERSION,
      exportedAt: T1,
    });
    await context.backup.importAll(older);
    expect((await context.definitions.getById(id))?.name).toBe('喝水（本地）');

    // 备份更新（T4）→ 覆盖本地
    const newer = createBackup(renamed('喝水（新备份）', T4), {
      schemaVersion: LATEST_SCHEMA_VERSION,
      exportedAt: T1,
    });
    const summary = await context.backup.importAll(newer);

    expect((await context.definitions.getById(id))?.name).toBe('喝水（新备份）');
    expect(summary.collections.eventDefinitions.updated).toBe(1);
  });

  it('软删除的记录会随备份一起恢复为「已删除」状态', async () => {
    await seed(context);
    const file = parseBackup(await exportToText(context));

    const target = await setup();
    try {
      await target.backup.importAll(file);

      expect((await target.records.list({ onlyDeleted: true })).map((record) => record.value)).toEqual([2]);
      expect((await target.records.list()).map((record) => record.value)).toEqual([1]);
    } finally {
      target.db.close();
    }
  });

  it('周期记录的软删除状态也随备份往返', async () => {
    await seed(context);
    const instance = (await context.instances.list())[0];
    if (!instance) {
      throw new Error('夹具数据缺失：周期实例');
    }
    const entry = (await context.entries.listByInstance(instance.id))[0];
    if (!entry) {
      throw new Error('夹具数据缺失：周期记录');
    }
    await context.entries.softDelete(entry.id, T4);

    const file = parseBackup(await exportToText(context));

    const target = await setup();
    try {
      await target.backup.importAll(file);

      const targetInstance = (await target.instances.list())[0];
      if (!targetInstance) {
        throw new Error('导入后没有周期实例');
      }
      expect(await target.entries.listByInstance(targetInstance.id)).toEqual([]);
      const trashed = await target.entries.listDeleted();
      expect(trashed.map((item) => item.entry.date)).toEqual(['2026-10-02']);
      expect(trashed[0]?.entry.deletedAt).toBe(T4);
      expect(trashed[0]?.definitionName).toBe('生理期');
    } finally {
      target.db.close();
    }
  });

  it('导入不动 app_meta（那是本机诊断信息，不属于用户数据）', async () => {
    await seed(context);
    const file = parseBackup(await exportToText(context));
    await context.meta.set('app.installed_at', '很久以前', T1);

    await context.backup.importAll(file);

    expect(await context.meta.get('app.installed_at')).toBe('很久以前');
  });

  it('预演导入不写库：只报计数，数据库一字未改', async () => {
    await seed(context);
    const file = parseBackup(await exportToText(context));
    const before = sortBackupData(await context.backup.readAll());

    const summary = await context.backup.previewImport(file);

    expect(summary.totals.added).toBe(0);
    expect(summary.totals.kept).toBe(8);
    expect(sortBackupData(await context.backup.readAll())).toEqual(before);
  });

  it('备份来自更新版本时拒绝导入，且数据库一字未改', async () => {
    await seed(context);
    const before = sortBackupData(await context.backup.readAll());
    const data = await context.backup.readAll();
    const tooNew = createBackup(data, { schemaVersion: LATEST_SCHEMA_VERSION + 1, exportedAt: T1 });

    await expect(context.backup.importAll(tooNew)).rejects.toThrow(ImportError);
    expect(sortBackupData(await context.backup.readAll())).toEqual(before);
  });

  it('引用断裂（周期实例没有对应定义）时拒绝导入，且数据库一字未改', async () => {
    await seed(context);
    const before = sortBackupData(await context.backup.readAll());
    const data = await context.backup.readAll();
    // 把周期型事件定义抽掉：实例就悬空了（v6 起周期定义并进 eventDefinitions）
    const broken = createBackup(
      { ...data, eventDefinitions: data.eventDefinitions.filter((item) => item.kind !== 'cycle') },
      {
        schemaVersion: LATEST_SCHEMA_VERSION,
        exportedAt: T1,
      },
    );

    await expect(context.backup.importAll(broken)).rejects.toThrow(/指向不存在的周期型事件/);
    expect(sortBackupData(await context.backup.readAll())).toEqual(before);
  });

  it('写入阶段失败时整体回滚：不留半截数据', async () => {
    await seed(context);
    const before = sortBackupData(await context.backup.readAll());
    const data = await context.backup.readAll();

    // 两个定义共用一个快捷选项 id：通过领域完整性检查，但写库时必然撞主键
    const sharedId = '018fed00-0000-7000-8000-00000000aaaa';
    const colliding = createBackup(
      {
        ...data,
        eventDefinitions: data.eventDefinitions.map((definition) => ({
          ...definition,
          updatedAt: T4, // 覆盖本地版本，确保真的走到写入阶段
          quickOptions: [{ id: sharedId, label: '同一条', value: 1, sortOrder: 0 }],
        })),
      },
      { schemaVersion: LATEST_SCHEMA_VERSION, exportedAt: T1 },
    );

    await expect(context.backup.importAll(colliding)).rejects.toThrow(StorageError);
    expect(context.db.transactionDepth()).toBe(0);
    expect(sortBackupData(await context.backup.readAll())).toEqual(before);
  });
});
