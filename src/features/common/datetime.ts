/**
 * 本地时间处理（补录、周期等界面共用）。
 *
 * 存储一律是 UTC ISO-8601（`occurredAt` / `recordedAt`，见 domain/models.ts），
 * 而用户是按**设备本地时区**填写与阅读的。这里负责两者之间的转换，
 * 把「本地文本 ↔ UTC 时间戳」的细节从页面里抽出来，便于单独推理与复用。
 *
 * 与 `domain/dates.ts` 的分工：那边是**纯日历日期**运算（一律按 UTC 解释，
 * 不沾时区），用来算周期天数；这里处理**设备本地时区**下的「今天是几号」。
 * 两者不要混用。
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 把某个时刻格式化成设备本地的 `YYYY-MM-DD`。 */
export function localDateText(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 把某个时刻格式化成设备本地的 `HH:mm`。 */
export function localTimeText(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 以「天」为单位平移本地日期。
 * 用日历字段而不是加减 86400000 毫秒：跨夏令时那天加毫秒会算错。
 */
export function shiftLocalDays(date: Date, days: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
  );
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/**
 * 把「本地日期 + 本地时间」文本解析成 UTC ISO-8601。
 *
 * 格式不合法、取值越界或日期溢出（如 2 月 31 日）时返回 `null`，**不抛错**——
 * 解析失败属于用户输入问题，由调用方转成表单错误提示。
 */
export function parseLocalDateTime(dateText: string, timeText: string): string | null {
  const dateMatch = DATE_PATTERN.exec(dateText.trim());
  const timeMatch = TIME_PATTERN.exec(timeText.trim());
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  // JS 会把「2 月 31 日」归一成 3 月 2 日，用回读字段判断是否溢出。
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}
