import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  assertBackupCompatible,
  assertBackupIntegrity,
  createBackup,
  emptyBackupData,
  mergeBackup,
  parseBackup,
  serializeBackup,
  sortBackupData,
  type BackupData,
  type BackupFile,
} from '@/domain/backup';
import { ImportError } from '@/domain/errors';
import type {
  CycleDefinition,
  CycleEntry,
  CycleInstance,
  EventDefinition,
  EventGroup,
  EventRecord,
  Tag,
} from '@/domain/models';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';
const T3 = '2026-10-20T09:00:00.000Z';

const GROUP_BASE = 100;
const TAG_BASE = 200;
const DEFINITION_BASE = 300;
const RECORD_BASE = 400;
const CYCLE_DEFINITION_BASE = 500;
const CYCLE_INSTANCE_BASE = 600;
const CYCLE_ENTRY_BASE = 700;

/** 生成合法的 UUID v7（只要满足格式，导入校验就认） */
function id(value: number): string {
  return `018fed00-0000-7000-8000-${String(value).padStart(12, '0')}`;
}

function makeGroup(index: number, overrides: Partial<EventGroup> = {}): EventGroup {
  return {
    id: id(GROUP_BASE + index),
    name: `分组${index}`,
    sortOrder: index,
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function makeTag(index: number, overrides: Partial<Tag> = {}): Tag {
  return {
    id: id(TAG_BASE + index),
    name: `标签${index}`,
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function makeDefinition(index: number, overrides: Partial<EventDefinition> = {}): EventDefinition {
  return {
    id: id(DEFINITION_BASE + index),
    name: `事件${index}`,
    kind: 'counter',
    groupId: id(GROUP_BASE + 1),
    quickOptions: [{ id: id(900 + index), label: '一次', value: 1, sortOrder: 0 }],
    tagIds: [id(TAG_BASE + 1)],
    isArchived: false,
    sortOrder: index,
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function makeRecord(index: number, overrides: Partial<EventRecord> = {}): EventRecord {
  const definitionId = id(DEFINITION_BASE + 1);
  return {
    id: id(RECORD_BASE + index),
    definitionId,
    kind: 'counter',
    value: index,
    occurredAt: T1,
    recordedAt: T1,
    source: 'manual',
    tagIds: [id(TAG_BASE + 1)],
    snapshot: {
      definitionId,
      name: '事件1',
      kind: 'counter',
      groupId: id(GROUP_BASE + 1),
      tagIds: [id(TAG_BASE + 1)],
    },
    ...overrides,
  };
}

function makeCycleDefinition(index: number, overrides: Partial<CycleDefinition> = {}): CycleDefinition {
  return {
    id: id(CYCLE_DEFINITION_BASE + index),
    name: `周期${index}`,
    isArchived: false,
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function makeCycleInstance(index: number, overrides: Partial<CycleInstance> = {}): CycleInstance {
  return {
    id: id(CYCLE_INSTANCE_BASE + index),
    definitionId: id(CYCLE_DEFINITION_BASE + 1),
    startDate: '2026-10-01',
    endDate: '2026-10-05',
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

function makeCycleEntry(index: number, overrides: Partial<CycleEntry> = {}): CycleEntry {
  return {
    id: id(CYCLE_ENTRY_BASE + index),
    instanceId: id(CYCLE_INSTANCE_BASE + 1),
    date: '2026-10-02',
    symptoms: ['头痛'],
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

/** 一份自洽的最小数据：1 分组 / 1 标签 / 1 定义 / 1 记录 / 1 周期定义 / 1 实例 / 1 记录 */
function fixtureData(overrides: Partial<BackupData> = {}): BackupData {
  return {
    eventGroups: [makeGroup(1)],
    tags: [makeTag(1)],
    eventDefinitions: [makeDefinition(1)],
    eventRecords: [makeRecord(1)],
    cycleDefinitions: [makeCycleDefinition(1)],
    cycleInstances: [makeCycleInstance(1)],
    cycleEntries: [makeCycleEntry(1)],
    ...overrides,
  };
}

function makeFile(overrides: Partial<BackupFile> = {}): BackupFile {
  const base = createBackup(fixtureData(), { schemaVersion: 4, exportedAt: T1, appVersion: '0.1.0' });
  return {
    format: overrides.format ?? base.format,
    formatVersion: overrides.formatVersion ?? base.formatVersion,
    schemaVersion: overrides.schemaVersion ?? base.schemaVersion,
    exportedAt: overrides.exportedAt ?? base.exportedAt,
    appVersion: overrides.appVersion ?? base.appVersion,
    data: overrides.data ?? base.data,
  };
}

/** 领域对象 → 备份里那层纯 JSON（用于构造各种「写坏了」的文件） */
function jsonOf(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/** 组装一个「结构上像备份」的原始对象，方便只坏掉某一处 */
function rawFile(data: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: 4,
    exportedAt: T1,
    data,
    ...overrides,
  });
}

describe('createBackup / serializeBackup', () => {
  it('写入格式与版本元信息', () => {
    const file = makeFile();

    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(file.schemaVersion).toBe(4);
    expect(file.exportedAt).toBe(T1);
    expect(file.appVersion).toBe('0.1.0');
  });

  it('schemaVersion 必须是 ≥ 0 的整数', () => {
    expect(() => createBackup(emptyBackupData(), { schemaVersion: -1, exportedAt: T1 })).toThrow();
    expect(() => createBackup(emptyBackupData(), { schemaVersion: 1.5, exportedAt: T1 })).toThrow();
    expect(() => createBackup(emptyBackupData(), { schemaVersion: 4, exportedAt: '昨天' })).toThrow();
  });

  it('固定排序：同一份数据无论输入顺序如何，导出结果都一样', () => {
    const shuffled = fixtureData({
      eventGroups: [makeGroup(2), makeGroup(1)],
      eventRecords: [makeRecord(2, { occurredAt: T3 }), makeRecord(1, { occurredAt: T1 })],
    });

    const file = createBackup(shuffled, { schemaVersion: 4, exportedAt: T1 });
    const reordered = createBackup(
      {
        ...shuffled,
        eventGroups: [...shuffled.eventGroups].reverse(),
        eventRecords: [...shuffled.eventRecords].reverse(),
      },
      { schemaVersion: 4, exportedAt: T1 },
    );

    expect(file.data.eventGroups.map((group) => group.sortOrder)).toEqual([1, 2]);
    expect(file.data.eventRecords.map((record) => record.occurredAt)).toEqual([T1, T3]);
    expect(serializeBackup(reordered)).toBe(serializeBackup(file));
  });

  it('序列化成带缩进的 JSON，且未设置的字段不出现在文本里', () => {
    const text = serializeBackup(makeFile());

    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "format"');
    expect(text).not.toContain('"color"'); // undefined 字段被 JSON.stringify 丢掉
  });

  it('sortBackupData 不修改入参', () => {
    const data = fixtureData({ eventGroups: [makeGroup(2), makeGroup(1)] });
    const original = [...data.eventGroups];

    sortBackupData(data);

    expect(data.eventGroups).toEqual(original);
  });
});

describe('parseBackup', () => {
  it('导出 → 序列化 → 解析 是无损往返', () => {
    const file = makeFile();

    expect(parseBackup(serializeBackup(file))).toEqual(file);
  });

  it('缺省的集合按空处理（兼容旧版本导出的文件）', () => {
    const parsed = parseBackup(rawFile({}));

    expect(parsed.data).toEqual(emptyBackupData());
  });

  it('不是 JSON、格式不对、版本过高都被拒绝', () => {
    expect(() => parseBackup('这不是 JSON')).toThrow(ImportError);
    expect(() => parseBackup('[]')).toThrow(/必须是非空|必须是对象/);
    expect(() =>
      parseBackup(
        JSON.stringify({ format: 'other', formatVersion: 1, schemaVersion: 4, exportedAt: T1, data: {} }),
      ),
    ).toThrow(/不是 LifeTrack 备份文件/);
    expect(() => parseBackup(rawFile({}, { formatVersion: BACKUP_FORMAT_VERSION + 1 }))).toThrow(
      /高于当前应用支持的版本/,
    );
    expect(() => parseBackup(rawFile({}, { schemaVersion: 'v4' }))).toThrow(/schemaVersion/);
    expect(() => parseBackup(rawFile({}, { exportedAt: '2026-10-19' }))).toThrow(/exportedAt/);
  });

  it('字段非法时报错并带上路径', () => {
    const record = jsonOf(makeRecord(1));

    expect(() => parseBackup(rawFile({ eventRecords: [record] }))).not.toThrow();
    expect(() => parseBackup(rawFile({ eventRecords: [{ ...record, value: 0 }] }))).toThrow(
      /data\.eventRecords\[0\]\.value/,
    );
    expect(() => parseBackup(rawFile({ eventRecords: [{ ...record, value: 0.5 }] }))).toThrow(
      /data\.eventRecords\[0\]\.value/,
    );
    expect(() => parseBackup(rawFile({ eventRecords: [{ ...record, kind: 'count' }] }))).toThrow(
      /data\.eventRecords\[0\]\.kind/,
    );
    expect(() => parseBackup(rawFile({ eventRecords: [{ ...record, source: 'auto' }] }))).toThrow(
      /data\.eventRecords\[0\]\.source/,
    );
    expect(() => parseBackup(rawFile({ eventRecords: [{ ...record, id: 'not-a-uuid' }] }))).toThrow(
      /data\.eventRecords\[0\]\.id/,
    );
    expect(() => parseBackup(rawFile({ eventRecords: [{ ...record, occurredAt: '2026/10/19' }] }))).toThrow(
      /data\.eventRecords\[0\]\.occurredAt/,
    );
    expect(() => parseBackup(rawFile({ eventGroups: [{ ...jsonOf(makeGroup(1)), name: '  ' }] }))).toThrow(
      /data\.eventGroups\[0\]\.name/,
    );
    expect(() => parseBackup(rawFile({ tags: [{ ...jsonOf(makeTag(1)), color: 42 }] }))).toThrow(
      /data\.tags\[0\]\.color/,
    );
  });

  it('领域规则照旧生效：补录不能晚于录入时间', () => {
    const record = jsonOf(makeRecord(1, { occurredAt: T3, recordedAt: T1 }));

    expect(() => parseBackup(rawFile({ eventRecords: [record] }))).toThrow(/occurredAt/);
  });

  it('快照必须自洽：definitionId / kind / tagIds 与记录本体一致', () => {
    const record = jsonOf(makeRecord(1));

    expect(() =>
      parseBackup(
        rawFile({
          eventRecords: [
            { ...record, snapshot: { ...jsonOf(makeRecord(1).snapshot), definitionId: id(999) } },
          ],
        }),
      ),
    ).toThrow(/snapshot\.definitionId/);
    expect(() =>
      parseBackup(
        rawFile({
          eventRecords: [{ ...record, snapshot: { ...jsonOf(makeRecord(1).snapshot), kind: 'quantity' } }],
        }),
      ),
    ).toThrow(/snapshot\.kind/);
    expect(() => parseBackup(rawFile({ eventRecords: [{ ...record, tagIds: [] }] }))).toThrow(
      /data\.eventRecords\[0\]\.tagIds/,
    );
  });

  it('引用完整性：指向不存在的父实体一律拒绝', () => {
    const definition = jsonOf(makeDefinition(1));
    const group = jsonOf(makeGroup(1));

    expect(() => parseBackup(rawFile({ eventDefinitions: [{ ...definition, groupId: id(999) }] }))).toThrow(
      /指向不存在的分组/,
    );
    expect(() =>
      parseBackup(
        rawFile({ eventGroups: [group], eventDefinitions: [{ ...definition, tagIds: [id(999)] }] }),
      ),
    ).toThrow(/指向不存在的标签/);
    expect(() =>
      parseBackup(rawFile({ cycleInstances: [jsonOf(makeCycleInstance(1, { definitionId: id(999) }))] })),
    ).toThrow(/指向不存在的周期定义/);
    expect(() =>
      parseBackup(rawFile({ cycleEntries: [jsonOf(makeCycleEntry(1, { instanceId: id(999) }))] })),
    ).toThrow(/指向不存在的周期实例/);
  });

  it('周期记录的日期必须落在实例区间内', () => {
    expect(() =>
      parseBackup(
        rawFile({
          cycleDefinitions: [jsonOf(makeCycleDefinition(1))],
          cycleInstances: [jsonOf(makeCycleInstance(1))],
          cycleEntries: [jsonOf(makeCycleEntry(1, { date: '2026-10-09' }))],
        }),
      ),
    ).toThrow(/不在周期实例的区间内/);
    expect(() =>
      parseBackup(
        rawFile({
          cycleDefinitions: [jsonOf(makeCycleDefinition(1))],
          cycleInstances: [jsonOf(makeCycleInstance(1))],
          cycleEntries: [jsonOf(makeCycleEntry(1, { date: '2026-10-09' }))],
        }),
      ),
    ).toThrow(/data\.cycleEntries\[0\]\.date/);
  });

  it('主键重复 / 周期记录同一天重复都被拒绝', () => {
    expect(() => parseBackup(rawFile({ eventGroups: [jsonOf(makeGroup(1)), jsonOf(makeGroup(1))] }))).toThrow(
      /id 重复/,
    );
    expect(() =>
      parseBackup(
        rawFile({
          cycleDefinitions: [jsonOf(makeCycleDefinition(1))],
          cycleInstances: [jsonOf(makeCycleInstance(1))],
          cycleEntries: [jsonOf(makeCycleEntry(1)), jsonOf(makeCycleEntry(2, { date: '2026-10-02' }))],
        }),
      ),
    ).toThrow(/2026-10-02 已有记录/);
  });

  it('事件记录指向已删除的定义是允许的（历史靠快照自证）', () => {
    const record = jsonOf(makeRecord(1, { definitionId: id(999) }));
    record.snapshot = { ...jsonOf(makeRecord(1).snapshot), definitionId: id(999) };

    expect(() => parseBackup(rawFile({ eventRecords: [record] }))).not.toThrow();
  });

  it('归一化：名称去空白、标签去重，周期结束日不得早于开始日', () => {
    const group = jsonOf(makeGroup(1, { name: '  健康  ' }));
    const tag = jsonOf(makeTag(1));
    const definition = jsonOf(makeDefinition(1, { tagIds: [id(TAG_BASE + 1), id(TAG_BASE + 1)] }));

    const parsed = parseBackup(
      rawFile({ eventGroups: [group], tags: [tag], eventDefinitions: [definition] }),
    );

    expect(parsed.data.eventGroups[0]?.name).toBe('健康');
    expect(parsed.data.eventDefinitions[0]?.tagIds).toEqual([id(TAG_BASE + 1)]);

    expect(() =>
      parseBackup(
        rawFile({
          cycleInstances: [jsonOf(makeCycleInstance(1, { startDate: '2026-10-05', endDate: '2026-10-01' }))],
          cycleDefinitions: [jsonOf(makeCycleDefinition(1))],
        }),
      ),
    ).toThrow(/endDate/);
  });
});

describe('assertBackupCompatible / assertBackupIntegrity', () => {
  it('schema 版本不高于应用支持时放行', () => {
    expect(() => assertBackupCompatible(makeFile({ schemaVersion: 4 }), 4)).not.toThrow();
    expect(() => assertBackupCompatible(makeFile({ schemaVersion: 3 }), 4)).not.toThrow();
  });

  it('备份来自更新版本时拒绝（要求先升级应用）', () => {
    expect(() => assertBackupCompatible(makeFile({ schemaVersion: 5 }), 4)).toThrow(/请先升级 LifeTrack/);
    expect(() => assertBackupCompatible(makeFile({ formatVersion: BACKUP_FORMAT_VERSION + 1 }), 4)).toThrow(
      ImportError,
    );
  });

  it('assertBackupIntegrity 对自洽数据放行，对断裂引用报路径', () => {
    expect(() => assertBackupIntegrity(fixtureData())).not.toThrow();
    expect(() => assertBackupIntegrity(fixtureData({ cycleDefinitions: [] }))).toThrow(
      /data\.cycleInstances\[0\]\.definitionId/,
    );
  });
});

describe('mergeBackup', () => {
  it('备份新增的进结果，本地独有的保留：导入不是覆盖', () => {
    const local = fixtureData({ eventGroups: [makeGroup(1)] });
    const incoming = fixtureData({ eventGroups: [makeGroup(2)] });

    const { data, summary } = mergeBackup(local, incoming);

    expect(data.eventGroups.map((group) => group.name)).toEqual(['分组1', '分组2']);
    expect(summary.collections.eventGroups).toEqual({ added: 1, updated: 0, kept: 1 });
  });

  it('同 id 冲突：updatedAt 较新的胜出；完全相同则保留本地不重写', () => {
    const local = fixtureData({ tags: [makeTag(1, { name: '早上', updatedAt: T2 })] });
    const older = mergeBackup(local, fixtureData({ tags: [makeTag(1, { name: '旧名', updatedAt: T1 })] }));
    const same = mergeBackup(local, fixtureData({ tags: [makeTag(1, { name: '早上', updatedAt: T2 })] }));
    const newer = mergeBackup(local, fixtureData({ tags: [makeTag(1, { name: '新名', updatedAt: T3 })] }));

    expect(older.data.tags[0]?.name).toBe('早上');
    expect(older.summary.collections.tags).toEqual({ added: 0, updated: 0, kept: 1 });
    expect(same.summary.collections.tags.updated).toBe(0);
    expect(newer.data.tags[0]?.name).toBe('新名');
    expect(newer.summary.collections.tags).toEqual({ added: 0, updated: 1, kept: 0 });
  });

  it('事件记录：备份里已删除的标记会合进来（删除是后发生的状态）', () => {
    const local = fixtureData({ eventRecords: [makeRecord(1)] });
    const incoming = fixtureData({ eventRecords: [makeRecord(1, { deletedAt: T2 })] });

    const { data, summary } = mergeBackup(local, incoming);

    expect(data.eventRecords[0]?.deletedAt).toBe(T2);
    expect(summary.collections.eventRecords).toEqual({ added: 0, updated: 1, kept: 0 });
  });

  it('事件记录：本地已删除不会被备份「复活」', () => {
    const local = fixtureData({ eventRecords: [makeRecord(1, { deletedAt: T2 })] });
    const incoming = fixtureData({ eventRecords: [makeRecord(1)] });

    const { data, summary } = mergeBackup(local, incoming);

    expect(data.eventRecords[0]?.deletedAt).toBe(T2);
    expect(summary.collections.eventRecords.updated).toBe(0);
  });

  it('事件记录：两边都删除时取更早的删除时间（与幂等语义一致）', () => {
    const local = fixtureData({ eventRecords: [makeRecord(1, { deletedAt: T3 })] });
    const incoming = fixtureData({ eventRecords: [makeRecord(1, { deletedAt: T2 })] });

    expect(mergeBackup(local, incoming).data.eventRecords[0]?.deletedAt).toBe(T2);
  });

  it('结果按固定顺序排序，且不修改入参', () => {
    const local = fixtureData({ eventGroups: [makeGroup(2)] });
    const incoming = fixtureData({ eventGroups: [makeGroup(1)] });
    const localSnapshot = [...local.eventGroups];

    const { data } = mergeBackup(local, incoming);

    expect(data.eventGroups.map((group) => group.sortOrder)).toEqual([1, 2]);
    expect(local.eventGroups).toEqual(localSnapshot);
  });

  it('totals 是各集合的合计', () => {
    const local = emptyBackupData();
    const { summary } = mergeBackup(local, fixtureData());

    expect(summary.totals).toEqual({ added: 7, updated: 0, kept: 0 });
    expect(summary.collections.cycleEntries).toEqual({ added: 1, updated: 0, kept: 0 });
  });
});
