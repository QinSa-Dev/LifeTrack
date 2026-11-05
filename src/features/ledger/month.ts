/**
 * 记账页的「年 / 月」选择（纯函数）。
 *
 * 为什么不用字符串 `YYYY-MM` 当状态：年、月要分别给「年份」和「月份下拉」用，
 * 跨年时还要让两者一起变；拆成两个数字最不容易算错。
 * 月份从 **1** 开始（跟界面一致），不是 JS `Date` 的 0 起。
 */

export interface YearMonth {
  year: number;
  /** 1–12 */
  month: number;
}

/** 设备本地时区下的「今年这个月」。 */
export function currentYearMonth(now: Date = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function sameYearMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** 只平移年（月份保持不变）；换月由月份下拉负责。 */
export function shiftYear(value: YearMonth, offset: number): YearMonth {
  return { year: value.year + offset, month: value.month };
}

/**
 * 把「某年某月」换成 UTC 时间区间 `[from, until)`。
 *
 * 记账的 `occurred_at` 存的是 UTC，而用户按**本地时区**分月：
 * 本地 11 月 1 日 00:30 的记录在 UTC 里可能还是 10 月 31 日。
 * 所以区间必须用本地零点构造，再交给 `toISOString()`。
 */
export function monthRangeIso(value: YearMonth): { from: string; until: string } {
  const start = new Date(value.year, value.month - 1, 1, 0, 0, 0, 0);
  const end = new Date(value.year, value.month, 1, 0, 0, 0, 0);
  return { from: start.toISOString(), until: end.toISOString() };
}

export function yearLabel(value: YearMonth): string {
  return `${value.year} 年`;
}

export function monthLabel(month: number): string {
  return `${month} 月`;
}

/** 12 个月，给月份下拉用。 */
export const MONTHS: readonly number[] = Array.from({ length: 12 }, (_, index) => index + 1);
