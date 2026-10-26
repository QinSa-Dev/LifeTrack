import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  assertBackupCompatible,
  assertBackupIntegrity,
  backupFileName,
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
  CycleEntry,
  CycleInstance,
  DefinitionField,
  EventDefinition,
  EventGroup,
  EventRecord,
  FieldSnapshot,
} from '@/domain/models';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';
const T3 = '2026-10-20T09:00:00.000Z';

const GROUP_BASE = 100;
/** 只在「旧备份折算」用例里用：v2 还有全局标签 */
const TAG_BASE = 200;
const FIELD_BASE = 250;
const DEFINITION_BASE = 300;
const RECORD_BASE = 400;
const CYCLE_DEFINITION_BASE = 500;
const CYCLE_INSTANCE_BASE = 600;
const CYCLE_ENTRY_BASE = 700;

/** 生成合法的 UUID v7（只要满足 UUID 形状，导入校验就认） */
function id(value: number): string {
  return `018fed00-0000-7000-8000-${String(value).padStart(12, '0')}`;
}

/** 早期版本写进库的那种 v4（导入必须同样认，否则自家备份会被自己拒掉） */
function v4Id(value: number): string {
  return `550e8400-e29b-41d4-a716-${String(value).padStart(12, '0')}`;
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

function makeField(index: number, overrides: Partial<DefinitionField> = {}): DefinitionField {
  return {
    id: id(FIELD_BASE + index),
    name: `字段${index}`,
    kind: 'multi',
    options: [`选项${index}`],
    sortOrder: index,
    ...overrides,
  };
}

/** 快照里的字段定义：没有 sortOrder（快照只保留展示与校验需要的信息） */
function makeFieldSnapshot(index: number, overrides: Partial<FieldSnapshot> = {}): FieldSnapshot {
  return {
    id: id(FIELD_BASE + index),
    name: `字段${index}`,
    kind: 'multi',
    options: [`选项${index}`],
    ...overrides,
  };
}

function makeDefinition(index: number, overrides: Partial<EventDefinition> = {}): EventDefinition {
  return {
    id: id(DEFINITION_BASE + index),
    name: `事件${index}`,
    kind: 'counter',
    attributes: ['杯'],
    groupId: id(GROUP_BASE + 1),
    quickOptions: [{ id: id(900 + index), attribute: '杯', value: 1, sortOrder: 0 }],
    fields: [makeField(1)],
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
    attributes: [],
    occurredAt: T1,
    recordedAt: T1,
    source: 'manual',
    fieldValues: [{ fieldId: id(FIELD_BASE + 1), values: [`选项1`] }],
    snapshot: {
      definitionId,
      name: '事件1',
      kind: 'counter',
      attributes: ['杯'],
      groupId: id(GROUP_BASE + 1),
      fields: [makeFieldSnapshot(1)],
    },
    ...overrides,
  };
}

/** 周期型事件定义：并入事件定义之后，它就是「多几个周期字段」的事件定义。 */
function makeCycleDefinition(index: number, overrides: Partial<EventDefinition> = {}): EventDefinition {
  return {
    id: id(CYCLE_DEFINITION_BASE + index),
    name: `周期${index}`,
    kind: 'cycle',
    cycleMode: 'manual',
    averageCycleLengthDays: 28,
    averagePeriodLengthDays: 5,
    // 周期型不使用属性与自定义字段
    attributes: [],
    quickOptions: [],
    fields: [],
    isArchived: false,
    sortOrder: index,
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

/** 一份自洽的最小数据：1 分组 / 1 计数定义（带一个字段）+ 1 周期定义 / 1 记录 / 1 实例 / 1 每日记录 */
function fixtureData(overrides: Partial<BackupData> = {}): BackupData {
  return {
    eventGroups: [makeGroup(1)],
    eventDefinitions: [makeDefinition(1), makeCycleDefinition(1)],
    eventRecords: [makeRecord(1)],
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

describe('backupFileName', () => {
  it('按导出日期命名，备份与记录表格分开', () => {
    expect(backupFileName('2026-10-22T13:45:00.000Z', 'json')).toBe('lifetrack-backup-2026-10-22.json');
    expect(backupFileName('2026-10-22T13:45:00.000Z', 'csv')).toBe('lifetrack-records-2026-10-22.csv');
  });

  it('时间戳不合法时报错，而不是拼出一个奇怪的文件名', () => {
    expect(() => backupFileName('昨天', 'json')).toThrow();
  });
});

describe('parseBackup', () => {
  it('导出 → 序列化 → 解析 是无损往返', () => {
    const file = makeFile();

    expect(parseBackup(serializeBackup(file))).toEqual(file);
  });

  it('认自家备份里的 v4 主键：本项目早期版本写进库的 id 不能被自己拒掉', () => {
    // 手测「选文件导入」时踩到的就是这条：老数据里连分组 id 都是 v4，
    // 而导入端当时只认 v7，于是「自己导出的备份被自己拒绝」。
    const group = v4Id(GROUP_BASE + 1);
    const definition = v4Id(DEFINITION_BASE + 1);
    const record = v4Id(RECORD_BASE + 1);
    const file = makeFile({
      data: fixtureData({
        eventGroups: [makeGroup(1, { id: group })],
        eventDefinitions: [makeDefinition(1, { id: definition, groupId: group }), makeCycleDefinition(1)],
        eventRecords: [
          makeRecord(1, {
            id: record,
            definitionId: definition,
            snapshot: {
              definitionId: definition,
              name: '事件1',
              kind: 'counter',
              attributes: ['杯'],
              groupId: group,
              fields: [makeFieldSnapshot(1)],
            },
          }),
        ],
      }),
    });

    const parsed = parseBackup(serializeBackup(file));
    expect(parsed).toEqual(file);
    // 引用完整性也照旧能过（v4 只是另一个版本的 UUID，不是另一种 id）
    expect(() => assertBackupIntegrity(parsed.data)).not.toThrow();
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
    expect(() =>
      parseBackup(
        rawFile({
          eventDefinitions: [
            { ...jsonOf(makeDefinition(1)), fields: [{ ...jsonOf(makeField(1)), kind: 'when' }] },
          ],
        }),
      ),
    ).toThrow(/data\.eventDefinitions\[0\]\.fields\[0\]/);
    expect(() =>
      parseBackup(
        rawFile({
          eventDefinitions: [
            { ...jsonOf(makeDefinition(1)), fields: [{ ...jsonOf(makeField(1)), options: [] }] },
          ],
        }),
      ),
    ).toThrow(/至少要有一个候选值/);
  });

  it('领域规则照旧生效：补录不能晚于录入时间', () => {
    const record = jsonOf(makeRecord(1, { occurredAt: T3, recordedAt: T1 }));

    expect(() => parseBackup(rawFile({ eventRecords: [record] }))).toThrow(/occurredAt/);
  });

  it('快照必须自洽：definitionId / kind 与记录本体一致，字段取值也要对得上快照', () => {
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
    // 字段取值指向快照里没有的字段 → 拒绝
    expect(() =>
      parseBackup(
        rawFile({
          eventRecords: [{ ...record, fieldValues: [{ fieldId: id(999), values: ['选项1'] }] }],
        }),
      ),
    ).toThrow(/data\.eventRecords\[0\]\.fieldValues/);
  });

  it('引用完整性：指向不存在的父实体一律拒绝', () => {
    const definition = jsonOf(makeDefinition(1));

    expect(() => parseBackup(rawFile({ eventDefinitions: [{ ...definition, groupId: id(999) }] }))).toThrow(
      /指向不存在的分组/,
    );
    expect(() =>
      parseBackup(rawFile({ cycleInstances: [jsonOf(makeCycleInstance(1, { definitionId: id(999) }))] })),
    ).toThrow(/指向不存在的周期型事件/);
    expect(() =>
      parseBackup(rawFile({ cycleEntries: [jsonOf(makeCycleEntry(1, { instanceId: id(999) }))] })),
    ).toThrow(/指向不存在的周期实例/);
  });

  it('周期记录的日期必须落在实例区间内', () => {
    expect(() =>
      parseBackup(
        rawFile({
          eventDefinitions: [jsonOf(makeCycleDefinition(1))],
          cycleInstances: [jsonOf(makeCycleInstance(1))],
          cycleEntries: [jsonOf(makeCycleEntry(1, { date: '2026-10-09' }))],
        }),
      ),
    ).toThrow(/不在周期实例的区间内/);
    expect(() =>
      parseBackup(
        rawFile({
          eventDefinitions: [jsonOf(makeCycleDefinition(1))],
          cycleInstances: [jsonOf(makeCycleInstance(1))],
          cycleEntries: [jsonOf(makeCycleEntry(1, { date: '2026-10-09' }))],
        }),
      ),
    ).toThrow(/data\.cycleEntries\[0\]\.date/);
  });

  it('周期记录的软删除标记：缺失即「未删除」，写了就照原样读回', () => {
    const parsed = parseBackup(
      rawFile({
        eventDefinitions: [jsonOf(makeCycleDefinition(1))],
        cycleInstances: [jsonOf(makeCycleInstance(1))],
        // v5 之前的备份里没有 deletedAt 这个字段
        cycleEntries: [jsonOf(makeCycleEntry(1))],
      }),
    );
    expect(parsed.data.cycleEntries[0]?.deletedAt).toBeUndefined();

    const withFlag = parseBackup(
      rawFile({
        eventDefinitions: [jsonOf(makeCycleDefinition(1))],
        cycleInstances: [jsonOf(makeCycleInstance(1))],
        cycleEntries: [{ ...jsonOf(makeCycleEntry(1)), deletedAt: T1 }],
      }),
    );
    expect(withFlag.data.cycleEntries[0]?.deletedAt).toBe(T1);
  });

  it('已软删除的周期记录允许落在实例区间外（缩走边界后它就在外面）', () => {
    // 同一条记录、同一个越界日期：未删除时拒绝，已软删除时放行——
    // 否则 App 自己导出的备份会在导入时被自己拒绝
    expect(() =>
      parseBackup(
        rawFile({
          eventDefinitions: [jsonOf(makeCycleDefinition(1))],
          cycleInstances: [jsonOf(makeCycleInstance(1))],
          cycleEntries: [{ ...jsonOf(makeCycleEntry(1, { date: '2026-10-09' })), deletedAt: T1 }],
        }),
      ),
    ).not.toThrow();
  });

  it('主键重复 / 周期记录同一天重复都被拒绝', () => {
    expect(() => parseBackup(rawFile({ eventGroups: [jsonOf(makeGroup(1)), jsonOf(makeGroup(1))] }))).toThrow(
      /id 重复/,
    );
    expect(() =>
      parseBackup(
        rawFile({
          eventDefinitions: [jsonOf(makeCycleDefinition(1))],
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

  it('归一化：名称去空白、字段候选值去重，周期结束日不得早于开始日', () => {
    const group = jsonOf(makeGroup(1, { name: '  健康  ' }));
    const definition = jsonOf(
      makeDefinition(1, { fields: [makeField(1, { options: ['早晨', '早晨', '  ', '晚上'] })] }),
    );

    const parsed = parseBackup(rawFile({ eventGroups: [group], eventDefinitions: [definition] }));

    expect(parsed.data.eventGroups[0]?.name).toBe('健康');
    expect(parsed.data.eventDefinitions[0]?.fields[0]?.options).toEqual(['早晨', '晚上']);

    expect(() =>
      parseBackup(
        rawFile({
          cycleInstances: [jsonOf(makeCycleInstance(1, { startDate: '2026-10-05', endDate: '2026-10-01' }))],
          eventDefinitions: [jsonOf(makeCycleDefinition(1))],
        }),
      ),
    ).toThrow(/endDate/);
  });

  it('v1 备份：周期定义在单独一个集合里，导入时折成「周期型事件定义」', () => {
    const parsed = parseBackup(
      rawFile(
        {
          cycleDefinitions: [
            {
              id: id(CYCLE_DEFINITION_BASE + 1),
              name: '生理期',
              averageCycleLengthDays: 28,
              averagePeriodLengthDays: 5,
              isArchived: false,
              createdAt: T1,
              updatedAt: T1,
            },
          ],
          cycleInstances: [jsonOf(makeCycleInstance(1))],
          cycleEntries: [jsonOf(makeCycleEntry(1))],
        },
        { formatVersion: 1 },
      ),
    );

    expect(parsed.data.eventDefinitions).toEqual([
      {
        id: id(CYCLE_DEFINITION_BASE + 1),
        name: '生理期',
        kind: 'cycle',
        // v1 没有「做法」这个字段，按当年唯一的行为（自己点开始、自己点结束）兜底
        cycleMode: 'manual',
        averageCycleLengthDays: 28,
        averagePeriodLengthDays: 5,
        quickOptions: [],
        attributes: [],
        fields: [],
        isArchived: false,
        sortOrder: 0,
        createdAt: T1,
        updatedAt: T1,
      },
    ]);
    // 实例与每日记录跟着搬，不丢
    expect(parsed.data.cycleInstances).toHaveLength(1);
    expect(parsed.data.cycleEntries).toHaveLength(1);
  });

  it('v1 备份：quantity 折成计数型，unit 变成属性', () => {
    const parsed = parseBackup(
      rawFile(
        {
          eventDefinitions: [
            {
              id: id(DEFINITION_BASE + 1),
              name: '里程',
              kind: 'quantity',
              unit: '公里',
              quickOptions: [{ id: id(901), label: '一次', value: 1, unit: '公里', sortOrder: 0 }],
              tagIds: [],
              isArchived: false,
              sortOrder: 0,
              createdAt: T1,
              updatedAt: T1,
            },
          ],
        },
        { formatVersion: 1 },
      ),
    );

    expect(parsed.data.eventDefinitions[0]).toMatchObject({
      kind: 'counter',
      attributes: ['公里'],
      // 快捷选项折成「属性 + 取值」：有 unit 就用它
      quickOptions: [{ attribute: '公里', value: 1 }],
    });
  });

  it('格式 v2 起不再接受 quantity 定义（类型只有计数 / 周期）', () => {
    const definition = { ...jsonOf(makeDefinition(1)), kind: 'quantity' };
    expect(() => parseBackup(rawFile({ eventDefinitions: [definition] }))).toThrow(
      /data\.eventDefinitions\[0\]\.kind/,
    );
  });

  it('属性可以是多条，按顺序读回', () => {
    const definition = {
      ...jsonOf(makeDefinition(1)),
      groupId: undefined,
      attributes: ['温水', '200ml'],
    };
    const parsed = parseBackup(rawFile({ eventDefinitions: [definition] }));

    expect(parsed.data.eventDefinitions[0]?.attributes).toEqual(['温水', '200ml']);
  });

  it('属性必须是字符串数组，写错了要拒绝（不是默默丢掉）', () => {
    const definition = {
      ...jsonOf(makeDefinition(1)),
      groupId: undefined,
      attributes: ['温水', 200],
    };
    expect(() => parseBackup(rawFile({ eventDefinitions: [definition] }))).toThrow(
      /data\.eventDefinitions\[0\]\.attributes\[1\]/,
    );
  });

  it('历史记录里的 quantity 仍然合法，v1 的 unit 读成属性', () => {
    const base = jsonOf(makeRecord(1));
    // 老记录没有 attributes 这个字段，只有一个 unit
    const record: Record<string, unknown> = {
      ...base,
      kind: 'quantity',
      attributes: undefined,
      unit: '公里',
    };
    record.snapshot = {
      ...(base.snapshot as Record<string, unknown>),
      kind: 'quantity',
      attributes: undefined,
      unit: '公里',
    };
    const parsed = parseBackup(rawFile({ eventRecords: [record] }, { formatVersion: 1 }));

    expect(parsed.data.eventRecords[0]).toMatchObject({ kind: 'quantity', attributes: ['公里'] });
    expect(parsed.data.eventRecords[0]?.snapshot.attributes).toEqual(['公里']);
  });

  it('v2 备份：全局标签折成「标签」多选字段，记录的标签值搬成字段取值', () => {
    const tag = { id: id(TAG_BASE + 1), name: '早晨', createdAt: T1, updatedAt: T1 };
    const definition = {
      ...jsonOf(makeDefinition(1)),
      fields: [],
      tagIds: [id(TAG_BASE + 1)],
    };
    const record: Record<string, unknown> = {
      ...jsonOf(makeRecord(1)),
      // v2 的记录没有 fieldValues，标签值在 tagIds / snapshot.tagIds 里
      fieldValues: undefined,
      tagIds: [id(TAG_BASE + 1)],
      snapshot: {
        ...(jsonOf(makeRecord(1)).snapshot as Record<string, unknown>),
        fields: undefined,
        tagIds: [id(TAG_BASE + 1)],
      },
    };

    const parsed = parseBackup(
      rawFile(
        {
          eventGroups: [jsonOf(makeGroup(1))],
          tags: [tag],
          eventDefinitions: [definition],
          eventRecords: [record],
        },
        { formatVersion: 2 },
      ),
    );

    const folded = parsed.data.eventDefinitions[0]!;
    expect(folded.fields).toHaveLength(1);
    expect(folded.fields[0]?.name).toBe('标签');
    expect(folded.fields[0]?.kind).toBe('multi');
    expect(folded.fields[0]?.options).toEqual(['早晨']);

    const parsedRecord = parsed.data.eventRecords[0]!;
    expect(parsedRecord.snapshot.fields).toEqual([
      { id: folded.fields[0]!.id, name: '标签', kind: 'multi', options: ['早晨'] },
    ]);
    expect(parsedRecord.fieldValues).toEqual([{ fieldId: folded.fields[0]!.id, values: ['早晨'] }]);
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
    // 周期实例指向的定义不存在（这里把周期定义从 eventDefinitions 里拿掉）
    expect(() => assertBackupIntegrity(fixtureData({ eventDefinitions: [makeDefinition(1)] }))).toThrow(
      /data\.cycleInstances\[0\]\.definitionId/,
    );
  });

  it('周期型必须说明做法；计数型不该带周期字段', () => {
    expect(() =>
      assertBackupIntegrity(
        fixtureData({
          eventDefinitions: [makeDefinition(1), makeCycleDefinition(1, { cycleMode: undefined })],
        }),
      ),
    ).toThrow(/必须说明是自动循环还是手动标记/);
    expect(() =>
      assertBackupIntegrity(
        fixtureData({
          eventDefinitions: [makeDefinition(1, { cycleMode: 'manual' }), makeCycleDefinition(1)],
        }),
      ),
    ).toThrow(/计数型事件不该带周期方式/);
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
    const local = fixtureData({ eventGroups: [makeGroup(1, { name: '早上', updatedAt: T2 })] });
    const older = mergeBackup(
      local,
      fixtureData({ eventGroups: [makeGroup(1, { name: '旧名', updatedAt: T1 })] }),
    );
    const same = mergeBackup(
      local,
      fixtureData({ eventGroups: [makeGroup(1, { name: '早上', updatedAt: T2 })] }),
    );
    const newer = mergeBackup(
      local,
      fixtureData({ eventGroups: [makeGroup(1, { name: '新名', updatedAt: T3 })] }),
    );

    expect(older.data.eventGroups[0]?.name).toBe('早上');
    expect(older.summary.collections.eventGroups).toEqual({ added: 0, updated: 0, kept: 1 });
    expect(same.summary.collections.eventGroups.updated).toBe(0);
    expect(newer.data.eventGroups[0]?.name).toBe('新名');
    expect(newer.summary.collections.eventGroups).toEqual({ added: 0, updated: 1, kept: 0 });
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

  it('周期记录：删除状态跟着 updatedAt 走（较新的一方胜出）', () => {
    // 备份里删得更晚 → 合进来
    const local = fixtureData({ cycleEntries: [makeCycleEntry(1, { updatedAt: T1 })] });
    const incoming = fixtureData({
      cycleEntries: [makeCycleEntry(1, { updatedAt: T3, deletedAt: T3 })],
    });
    const merged = mergeBackup(local, incoming);
    expect(merged.data.cycleEntries[0]?.deletedAt).toBe(T3);
    expect(merged.summary.collections.cycleEntries).toEqual({ added: 0, updated: 1, kept: 0 });

    // 本地删得更晚 → 不被备份复活
    const deletedLocal = fixtureData({
      cycleEntries: [makeCycleEntry(1, { updatedAt: T3, deletedAt: T3 })],
    });
    const stale = fixtureData({ cycleEntries: [makeCycleEntry(1, { updatedAt: T1 })] });
    const kept = mergeBackup(deletedLocal, stale);
    expect(kept.data.cycleEntries[0]?.deletedAt).toBe(T3);
    expect(kept.summary.collections.cycleEntries.updated).toBe(0);
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

    expect(summary.totals).toEqual({ added: 6, updated: 0, kept: 0 });
    expect(summary.collections.cycleEntries).toEqual({ added: 1, updated: 0, kept: 0 });
  });
});
