/**
 * 统计聚合（纯函数，不碰数据库）。
 *
 * 领域规则第 7 条：**统计从事实数据算，不落冗余汇总表**。
 * 所以这里不读也不写数据库，只接收一批「事实记录」（EventRecord），
 * 算出界面要展示的汇总。好处是：事实数据是唯一真相、天然可单测、
 * 不需要维护同步汇总表的写入逻辑。
 *
 * 三条约定：
 *
 * 1. **只统计可见记录**：仓储默认已过滤软删除，这里再用 `isVisibleRecord` 兜底，
 *    避免调用方传进 `includeDeleted` 的数据导致重复计数。
 * 2. **「一天/一周」按设备本地时区分桶**：与页面展示的时间一致（用户看到 10-19
 *    的记录就该落在 10-19 这一天）。本地时间换算复用 `features/common/datetime`，
 *    与 `domain/dates.ts`（一律按 UTC 的纯日历运算）分工不同，不要混用。
 * 3. **不同单位的值不相加成一个数**：数量型允许每条记录覆盖单位（如「1 杯」与
 *    「500 毫升」），此时合并没有意义。只有单位一致时才给出 `unit`，否则为
 *    `undefined`，界面只显示数值、不加单位。
 */

import { addDays } from '@/domain/dates';
import { ValidationError } from '@/domain/errors';
import { isVisibleRecord, type EventDefinitionKind, type EventRecord, type IsoDate } from '@/domain/models';
import { localDateText, shiftLocalDays } from '@/features/common/datetime';

/** 单个事件定义在一段时间内的汇总。 */
export interface DefinitionTotal {
  definitionId: string;
  /** 展示名取「最近一条记录」的快照名（定义改名不改历史，用最新的名字代表它） */
  name: string;
  kind: EventDefinitionKind;
  /** 所有记录单位一致时给出，否则 undefined（不同单位的值不合并计量） */
  unit?: string;
  /** 记录条数 */
  recordCount: number;
  /** 取值合计：counter 是总增量，quantity 是总量 */
  totalValue: number;
}

/** 一个时间桶（本地日历日或自然周）的汇总。 */
export interface PeriodTotal {
  /** 本地日历日 `YYYY-MM-DD`；按周聚合时是该周的周一 */
  date: IsoDate;
  recordCount: number;
  totalValue: number;
}

/** 全部记录的总体概览。 */
export interface OverallSummary {
  recordCount: number;
  definitionCount: number;
  /** 最早 / 最晚的本地日期；没有任何记录时为 undefined */
  firstDate?: IsoDate;
  lastDate?: IsoDate;
}

interface Bucket {
  recordCount: number;
  totalValue: number;
}

/** 合计值保留的小数位：挡住 `0.1 + 0.2` 这类浮点误差。 */
const VALUE_PRECISION = 4;

function roundValue(value: number): number {
  const factor = 10 ** VALUE_PRECISION;
  return Math.round(value * factor) / factor;
}

/** 解析 occurredAt；无法解析时返回 null（统计时跳过，而不是抛错让整屏崩掉）。 */
function occurredAtMs(record: EventRecord): number | null {
  const ms = Date.parse(record.occurredAt);
  return Number.isNaN(ms) ? null : ms;
}

function visibleRecords(records: readonly EventRecord[]): EventRecord[] {
  return records.filter(isVisibleRecord);
}

function parseReference(now: string): Date {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`不是合法的参考时间：${now}`);
  }
  return date;
}

function assertRange(range: number): void {
  if (!Number.isInteger(range) || range <= 0) {
    throw new ValidationError(`统计范围必须是正整数：${range}`);
  }
}

function bucketBy(
  records: readonly EventRecord[],
  keyOf: (occurredAtMs: number) => IsoDate,
): Map<IsoDate, Bucket> {
  const buckets = new Map<IsoDate, Bucket>();
  for (const record of visibleRecords(records)) {
    const ms = occurredAtMs(record);
    if (ms === null) {
      continue;
    }
    const key = keyOf(ms);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.recordCount += 1;
      bucket.totalValue += record.value;
    } else {
      buckets.set(key, { recordCount: 1, totalValue: record.value });
    }
  }
  return buckets;
}

function toPeriodTotal(date: IsoDate, bucket: Bucket | undefined): PeriodTotal {
  return {
    date,
    recordCount: bucket?.recordCount ?? 0,
    totalValue: bucket ? roundValue(bucket.totalValue) : 0,
  };
}

/** 本地日历日所在的周一（ISO 周，周一为起点）。 */
function localWeekStart(date: Date): IsoDate {
  const sinceMonday = (date.getDay() + 6) % 7;
  return localDateText(shiftLocalDays(date, -sinceMonday));
}

/**
 * 按事件定义汇总：条数 + 取值合计，按条数从多到少排序。
 *
 * 这是「哪个事件记录得最多」的答案，与时间无关。
 */
export function aggregateByDefinition(records: readonly EventRecord[]): DefinitionTotal[] {
  const buckets = new Map<string, EventRecord[]>();
  for (const record of visibleRecords(records)) {
    const bucket = buckets.get(record.definitionId);
    if (bucket) {
      bucket.push(record);
    } else {
      buckets.set(record.definitionId, [record]);
    }
  }

  const totals: DefinitionTotal[] = [];
  for (const [definitionId, bucket] of buckets) {
    const first = bucket[0];
    if (first === undefined) {
      continue;
    }

    // 展示名与单位取「最近一条记录」的快照：定义改名后历史不变，用最新的名字代表它。
    let latest = first;
    let latestMs = occurredAtMs(latest);
    for (const record of bucket) {
      const ms = occurredAtMs(record);
      if (ms !== null && (latestMs === null || ms > latestMs)) {
        latest = record;
        latestMs = ms;
      }
    }

    // 单位不一致（含「有单位」与「无单位」混用）时不做合并计量。
    const units = new Set(bucket.map((record) => record.unit ?? ''));
    const unit = units.size === 1 ? latest.unit : undefined;

    totals.push({
      definitionId,
      name: latest.snapshot.name,
      kind: latest.kind,
      unit,
      recordCount: bucket.length,
      totalValue: roundValue(bucket.reduce((sum, record) => sum + record.value, 0)),
    });
  }

  return totals.sort(
    (a, b) =>
      b.recordCount - a.recordCount ||
      a.name.localeCompare(b.name) ||
      a.definitionId.localeCompare(b.definitionId),
  );
}

/**
 * 按天汇总：以 `now` 为终点，往回取 `rangeDays` 个本地日历日。
 *
 * 没有记录的日子也返回（条数为 0），这样界面能画出连续的趋势，而不是跳过空白。
 * 返回按时间**从早到晚**排列。
 */
export function aggregateByDay(
  records: readonly EventRecord[],
  rangeDays: number,
  now: string = new Date().toISOString(),
): PeriodTotal[] {
  assertRange(rangeDays);
  const reference = parseReference(now);
  const buckets = bucketBy(records, (ms) => localDateText(new Date(ms)));

  const totals: PeriodTotal[] = [];
  for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
    const date = localDateText(shiftLocalDays(reference, -offset));
    totals.push(toPeriodTotal(date, buckets.get(date)));
  }
  return totals;
}

/**
 * 按周汇总：ISO 周（周一为起点），以 `now` 所在周为最后一桶，往前取 `rangeWeeks` 周。
 * 桶的 `date` 是该周的周一。同样保留空周，从早到晚排列。
 */
export function aggregateByWeek(
  records: readonly EventRecord[],
  rangeWeeks: number,
  now: string = new Date().toISOString(),
): PeriodTotal[] {
  assertRange(rangeWeeks);
  const reference = parseReference(now);
  const buckets = bucketBy(records, (ms) => localWeekStart(new Date(ms)));

  const currentWeekStart = localWeekStart(reference);
  const totals: PeriodTotal[] = [];
  for (let offset = rangeWeeks - 1; offset >= 0; offset -= 1) {
    const date = addDays(currentWeekStart, -7 * offset);
    totals.push(toPeriodTotal(date, buckets.get(date)));
  }
  return totals;
}

/** 总体概览：记录总数、涉及多少个事件、覆盖的最早/最晚一天。 */
export function summarize(records: readonly EventRecord[]): OverallSummary {
  const visible = visibleRecords(records);
  const definitionIds = new Set<string>();
  let firstDate: IsoDate | undefined;
  let lastDate: IsoDate | undefined;

  for (const record of visible) {
    definitionIds.add(record.definitionId);
    const ms = occurredAtMs(record);
    if (ms === null) {
      continue;
    }
    const date = localDateText(new Date(ms));
    if (firstDate === undefined || date < firstDate) {
      firstDate = date;
    }
    if (lastDate === undefined || date > lastDate) {
      lastDate = date;
    }
  }

  return {
    recordCount: visible.length,
    definitionCount: definitionIds.size,
    firstDate,
    lastDate,
  };
}
