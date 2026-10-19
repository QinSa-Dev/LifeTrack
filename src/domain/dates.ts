/**
 * 纯日历日期的运算（`IsoDate`，形如 `2026-10-19`）。
 *
 * 为什么单独成文件：周期功能记录的是「哪一天」而不是「哪一刻」，
 * 这类运算不该沾时区。所以这里**一律按 UTC 解释**（`Date.UTC`），
 * 只用日历字段做加减，不做任何本地时区换算。
 *
 * 与之相对，「今天是几号」这种与设备时区相关的判断属于界面层，
 * 放在 `src/features/common/datetime.ts`（localDateText）。两者不要混用。
 */

import { ValidationError } from './errors';
import type { IsoDate } from './models';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 解析成 UTC 零点的毫秒值；格式不合法或日期不存在时返回 null。 */
function parseIsoDate(value: string): number | null {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  // JS 会把「2 月 31 日」归一成 3 月，用回读字段挡掉不存在的日期
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return ms;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 把毫秒值格式化成 UTC 的 `YYYY-MM-DD`。 */
function formatUtc(ms: number): IsoDate {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 格式与存在性都合法，才算合法的日历日期。 */
export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

/** 日历加减天数。传入非法日期或非整数天数时抛 ValidationError。 */
export function addDays(date: IsoDate, days: number): IsoDate {
  const ms = parseIsoDate(date);
  if (ms === null) {
    throw new ValidationError(`不是合法的日历日期：${date}`);
  }
  if (!Number.isInteger(days)) {
    throw new ValidationError(`天数必须是整数：${days}`);
  }
  return formatUtc(ms + days * DAY_MS);
}

/** `to` 比 `from` 晚多少天（可为负）。 */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (start === null || end === null) {
    throw new ValidationError(`不是合法的日历日期：${from} / ${to}`);
  }
  return Math.round((end - start) / DAY_MS);
}

/**
 * 日期是否落在 `[startDate, endDate]` 内。
 *
 * `endDate` 为空表示「进行中」，只约束下界。
 * 用字符串比较即可：`YYYY-MM-DD` 定长补零，字典序与时间先后一致。
 */
export function isDateWithin(date: IsoDate, startDate: IsoDate, endDate?: IsoDate): boolean {
  if (date < startDate) {
    return false;
  }
  if (endDate !== undefined && date > endDate) {
    return false;
  }
  return true;
}
