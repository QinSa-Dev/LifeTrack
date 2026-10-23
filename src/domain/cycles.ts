/**
 * 生命周期的领域规则（纯函数，不碰数据库、不碰 React）。
 *
 * 这里承载的是本功能最重要的一条规则：
 *
 * > **修改周期边界不得静默删除越界记录。**
 *
 * `findDatesOutside` 把「哪些日期会越界」算出来交给调用方决定；
 * 仓储层据此**拒绝更新**（抛 ConflictError）并在报错里说明原因，
 * 而不是把越界的记录偷偷删掉或改掉。这样数据只会在用户明确操作时消失。
 *
 * 预测同样守「不猜」的原则：**先看实际观察到的间隔，没有历史才退回配置值，
 * 两样都没有就明说「不做预测」**（`predictNextCycle`）。
 */

import { addDays, daysBetween, isDateWithin } from './dates';
import type { CycleInstance, EventDefinition, IsoDate } from './models';

/** 一个日期区间；`endDate` 为空表示「进行中」。 */
export interface DateRange {
  startDate: IsoDate;
  endDate?: IsoDate;
}

/** 用于「进行中」区间的开区间上界：`YYYY-MM-DD` 字典序下足够大。 */
const OPEN_ENDED = '9999-12-31';

/** 取出若干日期中**落在区间外**的那些（保持输入顺序）。 */
export function findDatesOutside(
  dates: readonly IsoDate[],
  startDate: IsoDate,
  endDate?: IsoDate,
): IsoDate[] {
  return dates.filter((date) => !isDateWithin(date, startDate, endDate));
}

/** 单条记录是否在区间内（新增 / 修改记录时校验）。 */
export function isEntryWithinRange(date: IsoDate, range: DateRange): boolean {
  return isDateWithin(date, range.startDate, range.endDate);
}

/** 两个区间是否重叠。进行中的区间视为延伸到无穷远。 */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const aEnd = a.endDate ?? OPEN_ENDED;
  const bEnd = b.endDate ?? OPEN_ENDED;
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

function toRange(instance: CycleInstance): DateRange {
  return { startDate: instance.startDate, endDate: instance.endDate };
}

/**
 * 在已有实例里找与 `range` 重叠的那一个（`excludeId` 用于更新时排除自己）。
 * 同一定义的周期实例不该重叠——否则「第几天」的语义会含糊。
 */
export function findOverlappingInstance(
  instances: readonly CycleInstance[],
  range: DateRange,
  excludeId?: string,
): CycleInstance | undefined {
  return instances.find((instance) => instance.id !== excludeId && rangesOverlap(toRange(instance), range));
}

/** 实例是否仍在进行中。 */
export function isOngoingInstance(instance: CycleInstance): boolean {
  return instance.endDate === undefined;
}

/**
 * 实例包含多少天（含首尾）。
 * 进行中的实例没有结束日，必须显式传入 `through`（通常是「今天」）才有结果。
 */
export function instanceLengthDays(instance: CycleInstance, through?: IsoDate): number | undefined {
  const end = instance.endDate ?? through;
  if (end === undefined) {
    return undefined;
  }
  return daysBetween(instance.startDate, end) + 1;
}

/** 预测时最多回看多少个「间隔」（相邻两次开始日之差）。 */
export const DEFAULT_PREDICTION_WINDOW = 3;

/** 从历史里「观察」到的周期长度。 */
export interface ObservedCycleLength {
  /** 相邻开始日之差的平均值（天，四舍五入成整数） */
  averageDays: number;
  /** 参与平均的间隔数（≥ 1） */
  gaps: number;
}

/**
 * 观察到的平均周期长度：把**最近 `window` 个相邻开始日之差**取平均。
 *
 * - 少于两个实例（连一个完整间隔都没有）→ `undefined`，**不猜**。
 * - 传进来的应当是同一定义的实例（仓储的 `list({ definitionId })` 已经保证）；
 *   同一个开始日只算一次（正常情况下两段区间不重叠，这里是防御性处理）。
 * - 间隔按**日历日**算（`daysBetween`），不受时区与夏令时影响。
 */
export function observedCycleLength(
  instances: readonly CycleInstance[],
  window: number = DEFAULT_PREDICTION_WINDOW,
): ObservedCycleLength | undefined {
  if (!Number.isInteger(window) || window < 1) {
    return undefined;
  }
  const starts = [...new Set(instances.map((instance) => instance.startDate))].sort();
  if (starts.length < 2) {
    return undefined;
  }

  const gaps: number[] = [];
  for (let index = Math.max(1, starts.length - window); index < starts.length; index += 1) {
    const previous = starts[index - 1];
    const current = starts[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    gaps.push(daysBetween(previous, current));
  }
  if (gaps.length === 0) {
    return undefined;
  }

  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  return { averageDays: Math.round(total / gaps.length), gaps: gaps.length };
}

/** 下次周期的预测结果；`basis` 说明这个长度是怎么来的，界面据此说清依据。 */
export interface CyclePrediction {
  nextStart: IsoDate;
  /** 用来预测的周期长度（天） */
  lengthDays: number;
  /** `observed` = 最近若干段的实际间隔平均；`configured` = 定义里配置的平均长度 */
  basis: 'observed' | 'configured';
  /** `basis` 为 `observed` 时参与平均的间隔数；否则为 0 */
  observedGaps: number;
}

/**
 * 预测下次周期开始日（= 最近一段的开始日 + 预测长度）。
 *
 * 三级优先：**观察到的间隔** → **定义里配置的平均长度** → **不做预测**（`undefined`）。
 * 任何一种情况的依据都能从返回值看出来，界面不会把「猜的」说成「算的」。
 */
export function predictNextCycle(
  instances: readonly CycleInstance[],
  definition: Pick<EventDefinition, 'averageCycleLengthDays'>,
  window: number = DEFAULT_PREDICTION_WINDOW,
): CyclePrediction | undefined {
  const latest = latestInstance(instances);
  if (!latest) {
    return undefined;
  }

  const observed = observedCycleLength(instances, window);
  if (observed !== undefined) {
    return {
      nextStart: addDays(latest.startDate, observed.averageDays),
      lengthDays: observed.averageDays,
      basis: 'observed',
      observedGaps: observed.gaps,
    };
  }

  const configuredLength = definition.averageCycleLengthDays;
  if (configuredLength === undefined) {
    return undefined;
  }
  return {
    nextStart: addDays(latest.startDate, configuredLength),
    lengthDays: configuredLength,
    basis: 'configured',
    observedGaps: 0,
  };
}

/** 取「最近一次」实例：开始日最大的那个（进行中的也算）。 */
export function latestInstance(instances: readonly CycleInstance[]): CycleInstance | undefined {
  return instances.reduce<CycleInstance | undefined>(
    (latest, instance) => (latest === undefined || instance.startDate > latest.startDate ? instance : latest),
    undefined,
  );
}

/** 自动循环算出来的下一段：开始日、结束日（配了持续天数才有）。 */
export interface AutoCycleSegment {
  startDate: IsoDate;
  /** 配了「一段通常持续多少天」才会给出结束日；否则这一段仍是进行中 */
  endDate?: IsoDate;
  /** `first` = 还没有任何周期，今天就是起点；`scheduled` = 上一段开始日 + 周期长度 */
  basis: 'first' | 'scheduled';
}

/**
 * 自动循环的下一段：**上一段的开始日 + 周期长度**，持续天数落在结束日上。
 *
 * 这里刻意只算「下一段是什么」，不碰数据库：与预测一样，「什么时候写库」
 * 由用户决定（当前的按钮是「生成这一段」）。没有周期长度、或者根本不是
 * 自动型时返回 `undefined`——不猜。
 */
export function nextAutoCycleSegment(
  instances: readonly CycleInstance[],
  definition: Pick<EventDefinition, 'cycleMode' | 'averageCycleLengthDays' | 'averagePeriodLengthDays'>,
  today: IsoDate,
): AutoCycleSegment | undefined {
  if (definition.cycleMode !== 'auto') {
    return undefined;
  }

  const latest = latestInstance(instances);
  let startDate = today;
  let basis: AutoCycleSegment['basis'] = 'first';
  if (latest !== undefined) {
    const interval = definition.averageCycleLengthDays;
    if (interval === undefined) {
      return undefined;
    }
    startDate = addDays(latest.startDate, interval);
    basis = 'scheduled';
  }

  const duration = definition.averagePeriodLengthDays;
  return {
    startDate,
    endDate: duration === undefined ? undefined : addDays(startDate, duration - 1),
    basis,
  };
}
