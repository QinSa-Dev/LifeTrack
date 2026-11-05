/**
 * 账单页的汇总与图表数据（纯函数）。
 *
 * 记账数据的「类别」优先取**标签**（去掉首尾空白），没有标签再取**备注原文**；
 * 两者都空时归到「未分类」。
 * 不做模糊匹配、不猜同义词——用户写「早餐」和「早饭」就是两类，
 * 因为应用没有资格替用户决定它们是不是一回事。
 *
 * 所有分组都按**设备本地时区**算：发生在 UTC 月末的账，可能属于本地下个月。
 */

import type { LedgerEntry } from '@/domain/models';

import type { LedgerTotals } from './format';

/** 没有标签也没有备注时的兜底类别名。 */
export const UNCATEGORIZED_CATEGORY = '未分类';
/** 支出类别超过展示上限时，被折起来的那部分。 */
export const OTHER_CATEGORY = '其他';

/** 一个月账单行：月份 + 收支合计 + 笔数。 */
export interface MonthBillRow extends LedgerTotals {
  /** 1–12 */
  month: number;
  /** 这个月有几笔（收入 + 支出） */
  count: number;
}

/** 月账单的排序方向：倒序 = 最近一个月在前。 */
export type BillSortOrder = 'desc' | 'asc';

/** 一个支出类别的汇总。 */
export interface ExpenseCategory {
  name: string;
  amountCents: number;
  count: number;
  /** 占该时段全部支出的比例，0–1 */
  share: number;
}

/** 每天一个点，给「本月每日支出」柱状图用。 */
export interface DailyExpensePoint {
  /** 1–31 */
  day: number;
  amountCents: number;
}

/** 有记账数据的年份范围（只有年份，不带月日）。 */
export interface LedgerYearBounds {
  earliestYear: number;
  latestYear: number;
}

function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * 一条支出属于哪个类别：优先标签，没有标签再用备注；两者都空归入「未分类」。
 *
 * 标签是用户显式选的类别，比自由文本备注更适合做统计口径。
 */
export function ledgerCategory(entry: Pick<LedgerEntry, 'note' | 'tag'>): string {
  const tag = entry.tag?.trim();
  if (tag && tag.length > 0) {
    return tag;
  }
  const note = entry.note?.trim();
  return note && note.length > 0 ? note : UNCATEGORIZED_CATEGORY;
}

/**
 * 某一年 12 个月的收支汇总。
 *
 * 不在这一年的记录直接跳过（调用方通常已经按年下推查询，这里只防御脏数据）。
 * 非法时间不进任何一个月，避免整页因为一条坏数据崩掉。
 */
export function summarizeByMonth(
  entries: readonly Pick<LedgerEntry, 'kind' | 'amountCents' | 'occurredAt'>[],
  year: number,
): MonthBillRow[] {
  const rows: MonthBillRow[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    expenseCents: 0,
    incomeCents: 0,
    balanceCents: 0,
    count: 0,
  }));

  for (const entry of entries) {
    const date = new Date(entry.occurredAt);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) {
      continue;
    }
    const row = rows[date.getMonth()];
    if (!row) {
      continue;
    }
    row.count += 1;
    if (entry.kind === 'expense') {
      row.expenseCents += entry.amountCents;
    } else {
      row.incomeCents += entry.amountCents;
    }
  }

  for (const row of rows) {
    row.balanceCents = row.incomeCents - row.expenseCents;
  }
  return rows;
}

/**
 * 月账单要展示的月份。
 *
 * - 往年：12 个月全展示；
 * - 今年：只到**当前月**，还没到的月份不出现（11 月时不展示 12 月）；
 * - 未来年份：空数组。
 *
 * 默认倒序（最近一个月在前）；正序用于从 1 月顺着看。
 */
export function listBillMonths(
  year: number,
  order: BillSortOrder = 'desc',
  now: Date = new Date(),
): number[] {
  const currentYear = now.getFullYear();
  const lastMonth = year < currentYear ? 12 : year === currentYear ? now.getMonth() + 1 : 0;
  const months = Array.from({ length: lastMonth }, (_, index) => lastMonth - index);
  return order === 'desc' ? months : [...months].reverse();
}

/**
 * 支出按备注归类，按金额从大到小排。
 * 金额相同时笔数多的在前，再相同按名称排，保证两次渲染顺序一致。
 */
export function summarizeExpenseCategories(
  entries: readonly Pick<LedgerEntry, 'kind' | 'amountCents' | 'note'>[],
): ExpenseCategory[] {
  const totals = new Map<string, { amountCents: number; count: number }>();
  let expenseTotal = 0;

  for (const entry of entries) {
    if (entry.kind !== 'expense') {
      continue;
    }
    const name = ledgerCategory(entry);
    const current = totals.get(name) ?? { amountCents: 0, count: 0 };
    current.amountCents += entry.amountCents;
    current.count += 1;
    totals.set(name, current);
    expenseTotal += entry.amountCents;
  }

  return Array.from(totals, ([name, value]) => ({
    name,
    amountCents: value.amountCents,
    count: value.count,
    share: expenseTotal > 0 ? value.amountCents / expenseTotal : 0,
  })).sort((a, b) => b.amountCents - a.amountCents || b.count - a.count || compareText(a.name, b.name));
}

/**
 * 环形图最多展示 limit 个类别，其余折成「其他」。
 * 类别数量本来就不超过 limit 时原样返回（不会凭空多出一个 0 元的「其他」）。
 */
export function foldExpenseCategories(
  categories: readonly ExpenseCategory[],
  limit: number,
): ExpenseCategory[] {
  if (limit <= 0) {
    return categories.length > 0
      ? [
          {
            name: OTHER_CATEGORY,
            amountCents: categories.reduce((total, item) => total + item.amountCents, 0),
            count: categories.reduce((total, item) => total + item.count, 0),
            share: categories.reduce((total, item) => total + item.share, 0),
          },
        ]
      : [];
  }
  if (categories.length <= limit) {
    return [...categories];
  }

  const head = categories.slice(0, limit);
  const rest = categories.slice(limit);
  return [
    ...head,
    {
      name: OTHER_CATEGORY,
      amountCents: rest.reduce((total, item) => total + item.amountCents, 0),
      count: rest.reduce((total, item) => total + item.count, 0),
      share: rest.reduce((total, item) => total + item.share, 0),
    },
  ];
}

/** 某月每天的支出合计（只统计支出；收入不放进这张图）。 */
export function dailyExpenseSeries(
  entries: readonly Pick<LedgerEntry, 'kind' | 'amountCents' | 'occurredAt'>[],
  year: number,
  month: number,
): DailyExpensePoint[] {
  // 下个月的第 0 天 = 这个月的最后一天；闰年由 Date 自己处理。
  const dayCount = new Date(year, month, 0).getDate();
  const points: DailyExpensePoint[] = Array.from({ length: dayCount }, (_, index) => ({
    day: index + 1,
    amountCents: 0,
  }));

  for (const entry of entries) {
    if (entry.kind !== 'expense') {
      continue;
    }
    const date = new Date(entry.occurredAt);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() + 1 !== month) {
      continue;
    }
    const point = points[date.getDate() - 1];
    if (point) {
      point.amountCents += entry.amountCents;
    }
  }
  return points;
}

/**
 * 年份下拉的选项：从最早有记录的一年到今年，倒序。
 *
 * 没有数据时至少给今年；`selectedYear` 也一定包含在内，
 * 否则深链打开一个没有数据的年份时，下拉里会找不到当前值。
 */
export function listYearOptions(
  bounds: LedgerYearBounds | null,
  currentYear: number,
  selectedYear: number = currentYear,
): number[] {
  // 记账不可能发生在未来，年份下拉也不给未来年份
  const latest = currentYear;
  const earliest = Math.min(bounds?.earliestYear ?? currentYear, currentYear, selectedYear);
  const years: number[] = [];
  for (let year = latest; year >= earliest; year -= 1) {
    years.push(year);
  }
  return years;
}

/** 百分比：0.5% 这种极小占比显示成「<1%」，避免出现「0%」。 */
export function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 1) {
    return '<1%';
  }
  return `${Math.round(percent)}%`;
}

/** 图表坐标轴用的紧凑金额：过万显示成「1.2 万」，其余取整到元。 */
export function formatCompactLedgerTotal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const yuan = Math.abs(cents) / 100;
  if (yuan >= 10000) {
    return `${sign}¥${(yuan / 10000).toFixed(1)}万`;
  }
  return `${sign}¥${Math.round(yuan)}`;
}

/** 深链 / 路由里的年份参数：非法、缺失或未来年份都退回今年。 */
export function resolveBillYear(raw: string | string[] | undefined, now: Date = new Date()): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  const parsed = text === undefined ? NaN : Number.parseInt(text, 10);
  const currentYear = now.getFullYear();
  return Number.isInteger(parsed) && parsed >= 1970 && parsed <= currentYear ? parsed : currentYear;
}

/** 深链 / 路由里的月份参数：非法或缺失时退回当前月。 */
export function resolveBillMonth(raw: string | string[] | undefined, now: Date = new Date()): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  const parsed = text === undefined ? NaN : Number.parseInt(text, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : now.getMonth() + 1;
}
