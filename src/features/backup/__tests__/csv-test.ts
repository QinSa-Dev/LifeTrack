import { RECORDS_CSV_HEADERS, escapeCsvField, recordsToCsv } from '@/features/backup/csv';
import type { EventRecord } from '@/domain/models';

const T1 = '2026-10-19T08:00:00.000Z';
const T2 = '2026-10-19T09:00:00.000Z';

function makeRecord(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: '018fed00-0000-7000-8000-000000000401',
    definitionId: '018fed00-0000-7000-8000-000000000301',
    kind: 'counter',
    value: 1,
    attributes: ['杯'],
    occurredAt: T1,
    recordedAt: T1,
    source: 'manual',
    tagIds: [],
    snapshot: {
      definitionId: '018fed00-0000-7000-8000-000000000301',
      name: '喝水',
      kind: 'counter',
      attributes: ['杯'],
      groupId: '018fed00-0000-7000-8000-000000000101',
      tagIds: [],
    },
    ...overrides,
  };
}

/** 拆成数据行（首行是表头，末行是空行），并按逗号切列——测试里所有字段都不含逗号，所以直接切是安全的 */
function rows(csv: string): string[] {
  return csv
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter((line) => line.length > 0);
}

describe('escapeCsvField', () => {
  it('只在必要时加引号，内部引号翻倍', () => {
    expect(escapeCsvField('喝水')).toBe('喝水');
    expect(escapeCsvField('喝水,茶')).toBe('"喝水,茶"');
    expect(escapeCsvField('他说的"好"')).toBe('"他说的""好"""');
    expect(escapeCsvField('第一行\n第二行')).toBe('"第一行\n第二行"');
  });
});

describe('recordsToCsv', () => {
  it('带 BOM 与 CRLF，首行是中文表头', () => {
    const csv = recordsToCsv([]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(rows(csv)).toEqual([RECORDS_CSV_HEADERS.join(',')]);
  });

  it('一行记录按列铺开：取值保留原始数字，不补「+」', () => {
    const csv = recordsToCsv([makeRecord()]);
    const cells = rows(csv)[1]!.split(',');

    expect(cells[0]).toBe(T1); // 发生时间
    expect(cells[1]).toBe(T1); // 录入时间
    expect(cells[2]).toBe('手动');
    expect(cells[3]).toBe('喝水');
    expect(cells[4]).toBe('计数');
    expect(cells[5]).toBe('1');
    expect(cells[6]).toBe('杯');
    expect(cells[7]).toBe('018fed00-0000-7000-8000-000000000101'); // 分组没给名称映射 → 退回 id
    expect(cells[8]).toBe(''); // 无标签
    expect(cells[9]).toBe(''); // 无备注
    expect(cells[10]).toBe('有效');
    expect(cells[11]).toBe(''); // 无删除时间
    expect(cells[12]).toBe('018fed00-0000-7000-8000-000000000401');
  });

  it('历史数量型与补录的来源都如实写出', () => {
    const csv = recordsToCsv([
      makeRecord({
        kind: 'quantity',
        value: 0.5,
        source: 'backfill',
        attributes: [],
        occurredAt: '2026-10-01T00:00:00.000Z',
        snapshot: { ...makeRecord().snapshot, kind: 'quantity', attributes: [] },
      }),
    ]);
    const cells = rows(csv)[1]!.split(',');

    expect(cells[2]).toBe('补录');
    expect(cells[4]).toBe('数量');
    expect(cells[5]).toBe('0.5');
    expect(cells[6]).toBe('');
  });

  it('一条记录标了多个属性时用竖线分隔', () => {
    const csv = recordsToCsv([makeRecord({ attributes: ['温水', '500ml'] })]);
    const cells = rows(csv)[1]!.split(',');

    expect(cells[6]).toBe('温水 | 500ml');
  });

  it('软删除的记录标成「已删除」并带上删除时间', () => {
    const csv = recordsToCsv([makeRecord({ deletedAt: T2 })]);
    const cells = rows(csv)[1]!.split(',');

    expect(cells[10]).toBe('已删除');
    expect(cells[11]).toBe(T2);
  });

  it('分组与标签用名称，解析不到时退回 id（信息不丢）', () => {
    const record = makeRecord({
      tagIds: ['018fed00-0000-7000-8000-000000000201'],
      snapshot: {
        ...makeRecord().snapshot,
        tagIds: ['018fed00-0000-7000-8000-000000000201', '018fed00-0000-7000-8000-000000000999'],
      },
    });

    const csv = recordsToCsv([record], {
      tagNameById: new Map([['018fed00-0000-7000-8000-000000000201', '早晨']]),
      groupNameById: new Map([['018fed00-0000-7000-8000-000000000101', '健康']]),
    });
    const cells = rows(csv)[1]!.split(',');

    expect(cells[7]).toBe('健康');
    expect(cells[8]).toBe('早晨 | 018fed00-0000-7000-8000-000000000999');
  });

  it('含逗号 / 引号 / 换行的字段（事件名、备注）被正确转义，不破坏列数', () => {
    const csv = recordsToCsv([
      makeRecord({
        note: '第一行\n第二行',
        snapshot: { ...makeRecord().snapshot, name: '喝茶,加"糖"' },
      }),
    ]);
    // 转义后行数会因字段内的换行而增加，这里直接断言文本内容
    expect(csv).toContain('"喝茶,加""糖"""');
    expect(csv).toContain('"第一行\n第二行"');
  });
});
