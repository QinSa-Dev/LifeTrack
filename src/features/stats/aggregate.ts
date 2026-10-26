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
 * 3. **不同属性的值不相加成一个数**：历史数量型允许每条记录覆盖属性（如「1 杯」与
 *    「500 毫升」），此时合并没有意义。只有属性一致时才给出 `attributeText`，否则为
 *    `undefined`，界面只显示数值、不加属性。
 *
 * 对比（环比 / 同比）同样只用**条数**，不比较取值合计：
 * 「上周 3 杯 + 1 公里」与「本周 2 杯 + 5 公里」在数值上不可比（第 3 条约定）。
 */

import { addDays, daysBetween } from '@/domain/dates';
import { ValidationError } from '@/domain/errors';
import {
  attributeText,
  isVisibleRecord,
  recordAttributes,
  type EventRecord,
  type IsoDate,
  type IsoDateTime,
  type RecordKind,
} from '@/domain/models';
import { localDateText, shiftLocalDays } from '@/features/common/datetime';

/** 单个事件定义在一段时间内的汇总。 */
export interface DefinitionTotal {
  definitionId: string;
  /** 展示名取「最近一条记录」的快照名（定义改名不改历史，用最新的名字代表它） */
  name: string;
  kind: RecordKind;
  /** 所有记录的属性一致时给出拼接好的文本，否则 undefined（不同属性的值不合并计量） */
  attributeText?: string;
  /** 记录条数 */
  recordCount: number;
  /** 取值合计：counter 是总增量，历史 quantity 是总量 */
  totalValue: number;
}

/** 一个时间桶（本地日历日或自然周）的汇总。 */
export interface PeriodTotal {
  /** 本地日历日 `YYYY-MM-DD`；按周聚合时是该周的周一 */
  date: IsoDate;
  recordCount: number;
  totalValue: number;
  /**
   * 该桶里出现过的**不同事件数**（「活跃事件数」趋势用）。
   *
   * 为什么需要它：把所有事件的条数加成一个数没有意义（「3 次喝水 + 2 次跑步」
   * 不等于「5 次什么」），但「今天有哪几个事件被记录过」是一个说得清的指标——
   * 它衡量的是**覆盖 / 坚持度**。按某个事件过滤后再算时，这个值只会是 0 或 1。
   */
  definitionCount: number;
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
  /** 该桶里出现过的事件 id（去重后就是「活跃事件数」） */
  definitionIds: Set<string>;
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
      bucket.definitionIds.add(record.definitionId);
    } else {
      buckets.set(key, {
        recordCount: 1,
        totalValue: record.value,
        definitionIds: new Set([record.definitionId]),
      });
    }
  }
  return buckets;
}

function toPeriodTotal(date: IsoDate, bucket: Bucket | undefined): PeriodTotal {
  return {
    date,
    recordCount: bucket?.recordCount ?? 0,
    totalValue: bucket ? roundValue(bucket.totalValue) : 0,
    definitionCount: bucket?.definitionIds.size ?? 0,
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

    // 展示名与属性取「最近一条记录」的快照：定义改名后历史不变，用最新的名字代表它。
    let latest = first;
    let latestMs = occurredAtMs(latest);
    for (const record of bucket) {
      const ms = occurredAtMs(record);
      if (ms !== null && (latestMs === null || ms > latestMs)) {
        latest = record;
        latestMs = ms;
      }
    }

    // 属性不一致（含「有属性」与「无属性」混用）时不做合并计量。
    const texts = new Set(bucket.map((record) => attributeText(recordAttributes(record)) ?? ''));
    const text = texts.size === 1 ? attributeText(recordAttributes(latest)) : undefined;

    totals.push({
      definitionId,
      name: latest.snapshot.name,
      kind: latest.kind,
      attributeText: text,
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
 * 只留下某个事件定义的记录（给「按事件看趋势」用）。
 *
 * 这里**不**再过滤软删除：可见性统一由下游的聚合函数兜底，避免两处各写一套。
 */
export function recordsOfDefinition(records: readonly EventRecord[], definitionId: string): EventRecord[] {
  return records.filter((record) => record.definitionId === definitionId);
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

/* ------------------------------------------------------------------ *
 * 环比 / 同比：把「最近一段」与「前一段」或「上年同期」摆在一起
 *
 * 统计口径与上面完全一致（只算可见记录、按设备本地时区分桶），
 * 所以对比结果与趋势图里的数字一定对得上。
 * ------------------------------------------------------------------ */

/** 一个**闭区间**的本地日历日窗口（含首尾）。 */
export interface StatsWindow {
  startDate: IsoDate;
  endDate: IsoDate;
}

/** 窗口的单位：按天或按周（与趋势图的「按天 / 按周」同一套）。 */
export type ComparisonUnit = 'day' | 'week';

/** 跟谁比：前一段（环比）还是上年同期（同比）。 */
export type ComparisonBasis = 'previous' | 'lastYear';

/**
 * 趋势窗口的长度（与对比窗口同长）：按天看两周，按周看两个月。
 *
 * 这是窗口长度的**唯一来源**：界面上的趋势条、对比文案、以及「统计要读到哪一天」
 * （`statsReadRange`）都从这一份取值，避免三处各写一个数字后对不上。
 */
export const TREND_RANGES: Record<ComparisonUnit, number> = { day: 14, week: 8 };

/** 本期与对照期的窗口。 */
export interface ComparisonWindows {
  current: StatsWindow;
  previous: StatsWindow;
}

/** 一个窗口内的汇总。 */
export interface WindowSummary {
  window: StatsWindow;
  recordCount: number;
  definitionCount: number;
}

/** 单个事件在两个窗口之间的变化。 */
export interface DefinitionChange {
  definitionId: string;
  /** 展示名取这两个窗口里「最近一条记录」的快照名 */
  name: string;
  kind: RecordKind;
  currentCount: number;
  previousCount: number;
  /** 本期 − 对照期（可为负；两个窗口都没记录的定义不会出现在结果里） */
  delta: number;
}

/** 整体的对比结果。 */
export interface ComparisonSummary {
  current: WindowSummary;
  previous: WindowSummary;
  recordCountDelta: number;
  /** 变化率（小数，如 0.3333）；**对照期为 0 时为 `undefined`**——不除零、也不编造「+100%」 */
  recordCountRate?: number;
  definitionDelta: number;
}

/**
 * 「上年同期」按 **52 周（364 天）** 对齐，而不是自然年的 365/366 天。
 *
 * 这样对齐之后星期几完全相同，按天的窗口不会出现「今年这 14 天是周一到周日、
 * 去年那 14 天是周三到周二」这种错位；按周的窗口也正好落在 52 周之后。
 */
const YEAR_ALIGN_DAYS = 364;

/**
 * 算出「本期」与「对照期」两个窗口。
 *
 * - 按天：本期是最近 `length` 个本地日历日（含今天）；
 * - 按周：本期是最近 `length` 个 ISO 周（周一为起点），最后一桶是**今天所在的这一周**
 *   （该周的周日可能还没到，与趋势图的「本周」口径一致）；
 * - `previous`（环比）：紧挨着本期的、同样长度的前一段；
 * - `lastYear`（同比）：把本期整体往前挪 52 周。
 */
export function recentComparisonWindows(
  unit: ComparisonUnit,
  length: number,
  basis: ComparisonBasis = 'previous',
  now: string = new Date().toISOString(),
): ComparisonWindows {
  assertRange(length);
  const reference = parseReference(now);

  let current: StatsWindow;
  if (unit === 'day') {
    const endDate = localDateText(reference);
    current = { startDate: addDays(endDate, -(length - 1)), endDate };
  } else {
    const currentWeekStart = localWeekStart(reference);
    current = {
      startDate: addDays(currentWeekStart, -7 * (length - 1)),
      endDate: addDays(currentWeekStart, 6),
    };
  }

  const span = daysBetween(current.startDate, current.endDate) + 1;
  const shift = basis === 'lastYear' ? YEAR_ALIGN_DAYS : span;
  return {
    current,
    previous: {
      startDate: addDays(current.startDate, -shift),
      endDate: addDays(current.endDate, -shift),
    },
  };
}

/** 统计页需要读到的时段（**半开区间** `[from, until)`，UTC 时间戳）。 */
export interface StatsReadRange {
  from: IsoDateTime;
  until: IsoDateTime;
}

/** 界面能摆出的四种窗口组合：按天/按周 × 环比/同比。 */
const READ_RANGE_PAIRS: readonly (readonly [ComparisonUnit, ComparisonBasis])[] = [
  ['day', 'previous'],
  ['day', 'lastYear'],
  ['week', 'previous'],
  ['week', 'lastYear'],
];

/**
 * 算出「统计页至少要读到哪一段」（给仓储的 `list({ from, until })` 用）。
 *
 * 为什么放在这里：趋势与对比**只看窗口内的记录**，却原本要先把全表读进内存再逐行
 * 判断属于哪个窗口；窗口的定义就在本模块，所以「最早要读到哪天」也只能在这里回答。
 * 下推之后这两块只扫窗口内的行（概览与「按事件统计」是**累计**口径，不受它约束）。
 *
 * 两条刻意的设计：
 *
 * 1. **只求超集，不求精确**：按 UTC 零点取整并前后各留一天。边界不需要精确，是因为
 *    「某个时刻属于哪一天」仍由纯函数按**设备本地时区**判定——多读的行会被过滤掉。
 *    这样这里不必关心时区偏移与夏令时，也不会因为差一小时而漏掉记录。
 * 2. 取**四种组合的并集**（而不是当前选中的那一种）：读一次就够，切换「按天/按周」或
 *    「较前一段/较上年同期」只是重新算，不必再查库。
 */
export function statsReadRange(now: string = new Date().toISOString()): StatsReadRange {
  const windows = READ_RANGE_PAIRS.flatMap(([unit, basis]) => {
    const pair = recentComparisonWindows(unit, TREND_RANGES[unit], basis, now);
    return [pair.current, pair.previous];
  });

  const startDate = windows.map((window) => window.startDate).reduce((a, b) => (a < b ? a : b));
  const endDate = windows.map((window) => window.endDate).reduce((a, b) => (a > b ? a : b));

  return {
    from: `${addDays(startDate, -1)}T00:00:00.000Z`,
    until: `${addDays(endDate, 2)}T00:00:00.000Z`,
  };
}

/** 一个窗口内的事实汇总：条数 + 涉及多少个事件（只算可见记录）。 */
export function summarizeWindow(records: readonly EventRecord[], window: StatsWindow): WindowSummary {
  const definitionIds = new Set<string>();
  let recordCount = 0;

  for (const record of visibleRecords(records)) {
    const ms = occurredAtMs(record);
    if (ms === null) {
      continue;
    }
    const date = localDateText(new Date(ms));
    if (date < window.startDate || date > window.endDate) {
      continue;
    }
    recordCount += 1;
    definitionIds.add(record.definitionId);
  }

  return { window, recordCount, definitionCount: definitionIds.size };
}

/** 整体对比：两个窗口各自的汇总 + 条数差 + 变化率。 */
export function compareWindows(
  records: readonly EventRecord[],
  windows: ComparisonWindows,
): ComparisonSummary {
  const current = summarizeWindow(records, windows.current);
  const previous = summarizeWindow(records, windows.previous);
  const recordCountDelta = current.recordCount - previous.recordCount;

  return {
    current,
    previous,
    recordCountDelta,
    recordCountRate:
      previous.recordCount === 0 ? undefined : roundValue(recordCountDelta / previous.recordCount),
    definitionDelta: current.definitionCount - previous.definitionCount,
  };
}

/**
 * 逐个事件对比两个窗口：只列出**在任一窗口里出现过**的定义。
 *
 * 排序：本期条数从多到少 → 变化幅度从大到小 → 名称，先看「现在最多的」，
 * 再看「动得最明显的」。
 */
export function compareDefinitions(
  records: readonly EventRecord[],
  windows: ComparisonWindows,
): DefinitionChange[] {
  interface Bucket {
    currentCount: number;
    previousCount: number;
    latest: EventRecord;
    latestMs: number;
  }

  const buckets = new Map<string, Bucket>();
  const each = (window: StatsWindow, side: 'current' | 'previous') => {
    for (const record of visibleRecords(records)) {
      const ms = occurredAtMs(record);
      if (ms === null) {
        continue;
      }
      const date = localDateText(new Date(ms));
      if (date < window.startDate || date > window.endDate) {
        continue;
      }
      const bucket = buckets.get(record.definitionId);
      if (!bucket) {
        buckets.set(record.definitionId, {
          currentCount: side === 'current' ? 1 : 0,
          previousCount: side === 'previous' ? 1 : 0,
          latest: record,
          latestMs: ms,
        });
        continue;
      }
      bucket[side === 'current' ? 'currentCount' : 'previousCount'] += 1;
      if (ms > bucket.latestMs) {
        bucket.latest = record;
        bucket.latestMs = ms;
      }
    }
  };

  // 先本期后对照期：同一条记录只会落在一个窗口里（两个窗口不重叠），
  // 所以这里的计数不会重复。`latest` 取的是两个窗口里最新的那一条。
  each(windows.current, 'current');
  each(windows.previous, 'previous');

  return [...buckets.entries()]
    .map(([definitionId, bucket]) => ({
      definitionId,
      name: bucket.latest.snapshot.name,
      kind: bucket.latest.kind,
      currentCount: bucket.currentCount,
      previousCount: bucket.previousCount,
      delta: bucket.currentCount - bucket.previousCount,
    }))
    .sort(
      (a, b) =>
        b.currentCount - a.currentCount ||
        Math.abs(b.delta) - Math.abs(a.delta) ||
        a.name.localeCompare(b.name) ||
        a.definitionId.localeCompare(b.definitionId),
    );
}
