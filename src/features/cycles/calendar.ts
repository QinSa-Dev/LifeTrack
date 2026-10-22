/**
 * 周期月视图的纯计算（不碰数据库、不碰 React），与 `features/cycles/labels.ts` 同一层。
 *
 * 为什么抽出来：月视图的难点不在画格子，而在**边界**——月初要补白到周一、
 * 月末补到整周，区间之外的日期要变灰，翻月要夹在周期区间内。
 * 这些都是纯函数，单独可测，组件只负责把结果摆出来。
 *
 * 与 `domain/dates.ts` 的分工：日期算术（加减月、月长、星期几）在领域层，
 * 这里只组合它们，并把「一天有没有记录」表达成展示用的标记。
 */

import { addDays, addMonths, daysInMonth, startOfMonth, weekdayIndex } from '@/domain/dates';
import { isVisibleEntry, type CycleEntry, type IsoDate } from '@/domain/models';

/** 月视图网格里的一格：`date` 为空表示补白（本月之前 / 之后的空位）。 */
export interface MonthCalendarCell {
  date?: IsoDate;
}

/** 一天在月视图上的标记。 */
export interface DayMark {
  /** 这一天有没有记录（软删除的不算） */
  hasEntry: boolean;
  /** 记了几个症状 */
  symptomCount: number;
  /** 阶段（例如「经期」），没有记录时为空 */
  phase?: string;
}

/** 一格的展示状态：在不在周期区间内、是不是今天。 */
export interface CalendarDayState {
  inRange: boolean;
  isToday: boolean;
}

/** 星期表头，**周一为第一列**（与 `weekdayIndex` 一致）。 */
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

function padDay(day: number): string {
  return String(day).padStart(2, '0');
}

/**
 * 把一段周期里的可见记录按日期索引成「标记」。
 *
 * 软删除的那天不出现在月视图上（与列表、统计口径一致）；
 * 一天只有一条记录，所以同一天重复出现时后者覆盖前者。
 */
export function indexEntriesByDate(entries: readonly CycleEntry[]): Map<IsoDate, DayMark> {
  const marks = new Map<IsoDate, DayMark>();
  for (const entry of entries) {
    if (!isVisibleEntry(entry)) {
      continue;
    }
    marks.set(entry.date, {
      hasEntry: true,
      symptomCount: entry.symptoms.length,
      phase: entry.phase,
    });
  }
  return marks;
}

/**
 * 一个月的网格：月初补白到周一，月末补白到整周。
 *
 * 返回的格子数是 7 的整数倍，直接按每行 7 格渲染即可。
 */
export function buildMonthGrid(month: IsoDate): MonthCalendarCell[] {
  const first = startOfMonth(month);
  const yearMonth = first.slice(0, 8); // `2026-10-`
  const lead = weekdayIndex(first);
  const total = daysInMonth(first);

  const cells: MonthCalendarCell[] = [];
  for (let blank = 0; blank < lead; blank += 1) {
    cells.push({});
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push({ date: `${yearMonth}${padDay(day)}` });
  }
  while (cells.length % 7 !== 0) {
    cells.push({});
  }
  return cells;
}

/** `2026 年 10 月`。 */
export function monthLabel(month: IsoDate): string {
  const first = startOfMonth(month);
  return `${first.slice(0, 4)} 年 ${Number(first.slice(5, 7))} 月`;
}

/** 按月翻页（`offset` 可为负），结果仍是月初。 */
export function shiftMonth(month: IsoDate, offset: number): IsoDate {
  return startOfMonth(addMonths(startOfMonth(month), offset));
}

/** 这个月里有没有任何一天落在周期区间内（进行中的周期只约束下界）。 */
export function monthIntersectsRange(month: IsoDate, startDate: IsoDate, endDate?: IsoDate): boolean {
  const first = startOfMonth(month);
  const last = addDays(first, daysInMonth(first) - 1);
  if (last < startDate) {
    return false;
  }
  if (endDate !== undefined && first > endDate) {
    return false;
  }
  return true;
}

/** 把月份夹进周期区间：区间在将来就显示开始那个月，已经结束就显示结束那个月。 */
export function clampMonthToRange(month: IsoDate, startDate: IsoDate, endDate?: IsoDate): IsoDate {
  const target = startOfMonth(month);
  if (target < startOfMonth(startDate)) {
    return startOfMonth(startDate);
  }
  if (endDate !== undefined && target > startOfMonth(endDate)) {
    return startOfMonth(endDate);
  }
  return target;
}

/**
 * 一格的朗读文字，也是自动化测试的抓手（`accessibilityLabel`）。
 *
 * 形状固定：`日历 2026-10-22，今天，有记录（经期，2 个症状）`。
 * 前缀「日历」把月视图的格子和「每日记录」里同名的日期行区分开。
 */
export function describeCalendarDay(
  date: IsoDate,
  mark: DayMark | undefined,
  state: CalendarDayState,
): string {
  const parts = [`日历 ${date}`];
  if (state.isToday) {
    parts.push('今天');
  }
  if (!state.inRange) {
    parts.push('不在周期区间内');
  } else if (mark?.hasEntry) {
    const detail = [mark.phase, mark.symptomCount > 0 ? `${mark.symptomCount} 个症状` : undefined]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join('，');
    parts.push(detail.length > 0 ? `有记录（${detail}）` : '有记录');
  } else {
    parts.push('无记录');
  }
  return parts.join('，');
}
