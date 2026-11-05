import {
  describeLedgerEntry,
  formatLedgerAmount,
  formatLedgerTime,
  formatLedgerTotal,
  groupLedgerEntriesByDay,
  ledgerEntryTitle,
  summarizeLedger,
} from '@/features/ledger/format';
import type { LedgerEntry } from '@/domain/models';

const T1 = '2026-11-05T00:30:00.000Z';

function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: '018fed00-0000-7000-8000-000000000801',
    kind: 'expense',
    amountCents: 360,
    note: '上班地铁',
    occurredAt: T1,
    recordedAt: T1,
    ...overrides,
  };
}

describe('金额文案', () => {
  test('支出带负号，收入带正号，固定两位小数', () => {
    expect(formatLedgerAmount('expense', 360)).toBe('-¥3.60');
    expect(formatLedgerAmount('income', 10000)).toBe('+¥100.00');
  });

  test('汇总允许负结余，负号在货币符号前', () => {
    expect(formatLedgerTotal(1234)).toBe('¥12.34');
    expect(formatLedgerTotal(0)).toBe('¥0.00');
    expect(formatLedgerTotal(-360)).toBe('-¥3.60');
  });
});

describe('summarizeLedger', () => {
  test('支出、收入分别求和，结余 = 收入 − 支出', () => {
    expect(
      summarizeLedger([
        { kind: 'expense', amountCents: 360 },
        { kind: 'expense', amountCents: 640 },
        { kind: 'income', amountCents: 10000 },
      ]),
    ).toEqual({ expenseCents: 1000, incomeCents: 10000, balanceCents: 9000 });
  });

  test('空列表全为 0', () => {
    expect(summarizeLedger([])).toEqual({ expenseCents: 0, incomeCents: 0, balanceCents: 0 });
  });
});

describe('列表文案', () => {
  test('有备注用备注，没有备注回落到方向名', () => {
    expect(ledgerEntryTitle(makeEntry())).toBe('上班地铁');
    expect(ledgerEntryTitle(makeEntry({ note: undefined }))).toBe('支出');
    expect(ledgerEntryTitle(makeEntry({ kind: 'income', note: undefined }))).toBe('收入');
  });

  test('时间按设备本地时区显示为 HH:mm（日期在分组标题里）', () => {
    const local = new Date(2026, 10, 5, 8, 30, 0, 0);
    expect(formatLedgerTime(local.toISOString())).toBe('08:30');
  });

  test('非法时间原样返回，列表不会崩', () => {
    expect(formatLedgerTime('不是时间')).toBe('不是时间');
  });

  test('删除确认说清金额与标题', () => {
    expect(describeLedgerEntry(makeEntry())).toBe('-¥3.60 · 上班地铁');
  });
});

describe('groupLedgerEntriesByDay', () => {
  test('按设备本地日期分组，同一天保持传入顺序', () => {
    const later = makeEntry({
      id: '018fed00-0000-7000-8000-000000000811',
      occurredAt: new Date(2026, 10, 2, 9, 0, 0, 0).toISOString(),
    });
    const earlier = makeEntry({
      id: '018fed00-0000-7000-8000-000000000812',
      occurredAt: new Date(2026, 10, 2, 8, 0, 0, 0).toISOString(),
    });
    const previousDay = makeEntry({
      id: '018fed00-0000-7000-8000-000000000813',
      occurredAt: new Date(2026, 10, 1, 20, 0, 0, 0).toISOString(),
    });

    expect(groupLedgerEntriesByDay([later, earlier, previousDay])).toEqual([
      { date: '2026-11-02', entries: [later, earlier] },
      { date: '2026-11-01', entries: [previousDay] },
    ]);
  });

  test('空列表与非法时间都不崩', () => {
    expect(groupLedgerEntriesByDay([])).toEqual([]);
    expect(groupLedgerEntriesByDay([makeEntry({ occurredAt: '不是时间' })])).toEqual([
      { date: '不是时间', entries: [makeEntry({ occurredAt: '不是时间' })] },
    ]);
  });
});
