/**
 * 周期相关的领域规则（纯函数，不碰数据库、不碰 React）。
 *
 * 这里承载的是本功能最重要的一条规则：
 *
 * > **修改周期边界不得静默删除越界记录。**
 *
 * `findDatesOutside` 把「哪些日期会越界」算出来交给调用方决定；
 * 仓储层据此**拒绝更新**（抛 ConflictError）并在报错里说明原因，
 * 而不是把越界的记录偷偷删掉或改掉。这样数据只会在用户明确操作时消失。
 */

import { addDays, daysBetween, isDateWithin } from './dates';
import type { CycleDefinition, CycleInstance, IsoDate } from './models';

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

/**
 * 预测下次周期的开始日：本次开始日 + 平均周期长度。
 * 没有配置平均长度时返回 `undefined`（表示「不预测」，而不是猜一个值）。
 */
export function predictNextCycleStart(
  instance: CycleInstance,
  definition: CycleDefinition,
): IsoDate | undefined {
  const length = definition.averageCycleLengthDays;
  if (length === undefined) {
    return undefined;
  }
  return addDays(instance.startDate, length);
}

/** 取「最近一次」实例：开始日最大的那个（进行中的也算）。 */
export function latestInstance(instances: readonly CycleInstance[]): CycleInstance | undefined {
  return instances.reduce<CycleInstance | undefined>(
    (latest, instance) => (latest === undefined || instance.startDate > latest.startDate ? instance : latest),
    undefined,
  );
}
