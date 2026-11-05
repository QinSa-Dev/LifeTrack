import type { LedgerEntry } from '@/domain/models';
import {
  dailyExpenseSeries,
  foldExpenseCategories,
  formatCompactLedgerTotal,
  formatShare,
  ledgerCategory,
  listBillMonths,
  listYearOptions,
  resolveBillMonth,
  resolveBillYear,
  summarizeByMonth,
  summarizeExpenseCategories,
  type ExpenseCategory,
} from '@/features/ledger/bills';

/** 设备本地时间 → ISO（记账按本地时区分月，测试也必须按本地构造） */
function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour).toISOString();
}

let counter = 0;
function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  counter += 1;
  const occurredAt = localIso(2026, 11, 5);
  return {
    id: `018fed00-0000-7000-8000-${String(counter).padStart(12, '0')}`,
    kind: 'expense',
    amountCents: 360,
    note: '早餐',
    occurredAt,
    recordedAt: occurredAt,
    ...overrides,
  };
}

describe('summarizeByMonth', () => {
  test('按本地月份汇总收入、支出与笔数，结余 = 收入 − 支出', () => {
    const entries = [
      makeEntry({ amountCents: 360, occurredAt: localIso(2026, 11, 5) }),
      makeEntry({ amountCents: 640, occurredAt: localIso(2026, 11, 20) }),
      makeEntry({ kind: 'income', amountCents: 10000, occurredAt: localIso(2026, 11, 1) }),
      makeEntry({ amountCents: 100, occurredAt: localIso(2026, 10, 31) }),
    ];

    const rows = summarizeByMonth(entries, 2026);

    expect(rows).toHaveLength(12);
    expect(rows[9]).toMatchObject({
      month: 10,
      expenseCents: 100,
      incomeCents: 0,
      balanceCents: -100,
      count: 1,
    });
    expect(rows[10]).toMatchObject({
      month: 11,
      expenseCents: 1000,
      incomeCents: 10000,
      balanceCents: 9000,
      count: 3,
    });
    expect(rows[11]).toMatchObject({ month: 12, count: 0, balanceCents: 0 });
  });

  test('别的年份、非法时间都不进这一年', () => {
    const rows = summarizeByMonth(
      [makeEntry({ occurredAt: localIso(2025, 12, 31) }), makeEntry({ occurredAt: '不是时间' })],
      2026,
    );

    expect(rows.every((row) => row.count === 0)).toBe(true);
  });
});

describe('listBillMonths', () => {
  const now = new Date(2026, 10, 5); // 2026 年 11 月

  test('今年默认倒序：最近一个月在最上面，未来月份不出现', () => {
    expect(listBillMonths(2026, 'desc', now)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(listBillMonths(2026, 'desc', now)).not.toContain(12);
  });

  test('正序从 1 月排到当前月', () => {
    expect(listBillMonths(2026, 'asc', now)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  test('往年 12 个月都在，倒序从 12 月开始', () => {
    expect(listBillMonths(2025, 'desc', now)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(listBillMonths(2025, 'asc', now)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  test('1 月时只有 1 月', () => {
    expect(listBillMonths(2026, 'desc', new Date(2026, 0, 15))).toEqual([1]);
  });

  test('未来年份没有月份', () => {
    expect(listBillMonths(2027, 'desc', now)).toEqual([]);
  });
});

describe('ledgerCategory / summarizeExpenseCategories', () => {
  test('标签优先，没有标签再用备注；都空归入未分类', () => {
    expect(ledgerCategory({ note: ' 早餐 ', tag: '  餐饮  ' })).toBe('餐饮');
    expect(ledgerCategory({ note: ' 早餐 ', tag: '   ' })).toBe('早餐');
    expect(ledgerCategory({ note: undefined, tag: '通勤' })).toBe('通勤');
    expect(ledgerCategory({ note: '   ', tag: undefined })).toBe('未分类');
    expect(ledgerCategory({ note: undefined, tag: undefined })).toBe('未分类');
  });

  test('只统计支出，按金额从大到小排序，占比以支出总额为分母', () => {
    const entries = [
      makeEntry({ amountCents: 360, note: ' 早餐 ', tag: '餐饮' }),
      makeEntry({ amountCents: 400, note: '早餐', tag: '餐饮' }),
      makeEntry({ amountCents: 600, note: '地铁', tag: '通勤' }),
      makeEntry({ amountCents: 100, note: undefined }),
      makeEntry({ kind: 'income', amountCents: 10000, note: '工资' }),
    ];

    const categories = summarizeExpenseCategories(entries);

    expect(categories.map((item) => item.name)).toEqual(['餐饮', '通勤', '未分类']);
    expect(categories[0]).toMatchObject({ amountCents: 760, count: 2 });
    expect(categories[1]).toMatchObject({ amountCents: 600, count: 1 });
    expect(categories[2]).toMatchObject({ amountCents: 100, count: 1 });
    expect(categories[0]?.share).toBeCloseTo(760 / 1460);
    expect(categories.reduce((total, item) => total + item.share, 0)).toBeCloseTo(1);
  });

  test('没有支出时返回空数组', () => {
    expect(summarizeExpenseCategories([makeEntry({ kind: 'income' })])).toEqual([]);
  });
});

describe('foldExpenseCategories', () => {
  function category(name: string, amountCents: number, count = 1): ExpenseCategory {
    return { name, amountCents, count, share: amountCents / 1000 };
  }

  test('超过上限时把尾部折成「其他」', () => {
    const categories = [
      category('A', 300),
      category('B', 200),
      category('C', 150),
      category('D', 100),
      category('E', 50),
      category('F', 30),
      category('G', 20),
    ];

    const folded = foldExpenseCategories(categories, 5);

    expect(folded).toHaveLength(6);
    expect(folded.slice(0, 5).map((item) => item.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(folded[5]).toMatchObject({ name: '其他', amountCents: 50, count: 2 });
  });

  test('不超过上限时原样返回（不会多出一个 0 元的其他）', () => {
    const categories = [category('A', 300), category('B', 200)];
    expect(foldExpenseCategories(categories, 5)).toEqual(categories);
  });

  test('上限为 0 时全部折成一个「其他」', () => {
    expect(foldExpenseCategories([category('A', 300), category('B', 200)], 0)).toEqual([
      { name: '其他', amountCents: 500, count: 2, share: 0.5 },
    ]);
  });
});

describe('dailyExpenseSeries', () => {
  test('按本地日期落到每一天，只统计支出', () => {
    const points = dailyExpenseSeries(
      [
        makeEntry({ amountCents: 360, occurredAt: localIso(2026, 11, 5, 8) }),
        makeEntry({ amountCents: 640, occurredAt: localIso(2026, 11, 5, 20) }),
        makeEntry({ kind: 'income', amountCents: 10000, occurredAt: localIso(2026, 11, 5) }),
        makeEntry({ amountCents: 100, occurredAt: localIso(2026, 11, 6) }),
        makeEntry({ amountCents: 999, occurredAt: localIso(2026, 12, 1) }),
      ],
      2026,
      11,
    );

    expect(points).toHaveLength(30);
    expect(points[4]).toEqual({ day: 5, amountCents: 1000 });
    expect(points[5]).toEqual({ day: 6, amountCents: 100 });
    expect(points.reduce((total, point) => total + point.amountCents, 0)).toBe(1100);
  });

  test('闰年 2 月有 29 天', () => {
    expect(dailyExpenseSeries([], 2024, 2)).toHaveLength(29);
    expect(dailyExpenseSeries([], 2026, 2)).toHaveLength(28);
  });
});

describe('listYearOptions', () => {
  test('从最早有记录的年份到今年，倒序', () => {
    expect(listYearOptions({ earliestYear: 2024, latestYear: 2026 }, 2026)).toEqual([2026, 2025, 2024]);
  });

  test('没有数据时至少给今年', () => {
    expect(listYearOptions(null, 2026)).toEqual([2026]);
  });

  test('有数据但最新一年早于今年时，今年仍然在列表里', () => {
    expect(listYearOptions({ earliestYear: 2023, latestYear: 2024 }, 2026)).toEqual([2026, 2025, 2024, 2023]);
  });

  test('当前选中的年份一定被包含（例如深链打开一个没有数据的年份）', () => {
    expect(listYearOptions({ earliestYear: 2024, latestYear: 2026 }, 2026, 2015)).toEqual([
      2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015,
    ]);
  });

  test('未来年份不会出现在下拉里', () => {
    expect(listYearOptions({ earliestYear: 2024, latestYear: 2026 }, 2026, 2030)).toEqual([2026, 2025, 2024]);
  });
});

describe('展示格式', () => {
  test('占比：小于 1% 不显示 0%', () => {
    expect(formatShare(0.5)).toBe('50%');
    expect(formatShare(0.004)).toBe('<1%');
    expect(formatShare(0)).toBe('0%');
  });

  test('坐标轴金额：过万折成「万」，其余取整到元', () => {
    expect(formatCompactLedgerTotal(36000)).toBe('¥360');
    expect(formatCompactLedgerTotal(1_200_000)).toBe('¥1.2万');
    expect(formatCompactLedgerTotal(-1234)).toBe('-¥12');
  });
});

describe('路由参数', () => {
  test('年份合法就用，非法 / 缺失退回今年', () => {
    const now = new Date(2026, 10, 5);
    expect(resolveBillYear('2024', now)).toBe(2024);
    expect(resolveBillYear(['2024', '2025'], now)).toBe(2024);
    expect(resolveBillYear('不是年份', now)).toBe(2026);
    expect(resolveBillYear(undefined, now)).toBe(2026);
    expect(resolveBillYear('1969', now)).toBe(2026);
    expect(resolveBillYear('2030', now)).toBe(2026);
  });

  test('月份只接受 1–12，其余退回当前月', () => {
    const now = new Date(2026, 10, 5);
    expect(resolveBillMonth('2', now)).toBe(2);
    expect(resolveBillMonth('13', now)).toBe(11);
    expect(resolveBillMonth(undefined, now)).toBe(11);
  });
});
