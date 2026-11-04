/**
 * 自动循环的「后台懒补齐」：打开 App 时按规律把漏掉的段落补上。
 *
 * 产品上的做法是「配置 + 生成下一段」，之前每次都要用户点一下「生成这一段」。
 * 这里补上「按规律自动往前走」的那一半；但**刻意只做追加**，规则如下：
 *
 * 1. **不生成第一段**：没有周期时停手，第一段仍由用户点「生成这一段」——否则只是
 *    建了一个事件定义，就凭空开始一段周期，太意外。
 * 2. **只在最后一段之后接**：不从中间补洞，也不改任何已有段落的边界。
 * 3. **进行中的一段挡住补齐**：既然是「进行中」，就不知道用户想让它哪天结束，
 *    别替用户决定（手动型 / 自动型没配持续天数时都会是这种状态）。
 * 4. **补到今天为止**：开始日 ≤ 今天才落库；配置了持续天数时，一次可以补多段
 *    （每段结束日 = 开始日 + 持续天数 - 1），最后一段盖住今天或下一段还在未来就停。
 * 5. **幂等**：下一段永远从「最后一段的开始日 + 周期长度」算；没到 12 段上限时，补齐之后
 *    下次启动算出来的开始日必然在未来，不会重复。另有一条 `app_meta` 里的「补到哪儿」水位
 *    （见 `autoFillHorizonKey`），防止用户删掉自动生成的那段之后，下次启动又把它补回来。
 * 6. **不猜**：没有周期长度、定义已归档、区间会重叠时都停下，不硬塞。
 *
 * 这里全是纯函数，方便单测；写库由 `fillAutoCycles` 负责。
 */

import { addDays, isValidIsoDate } from '@/domain/dates';
import { latestInstance, rangesOverlap } from '@/domain/cycles';
import type { CycleInstance, EventDefinition, IsoDate } from '@/domain/models';

/** 一次启动最多补几段：防止周期长度填得很小、又很久没打开时一次写太多。 */
export const AUTO_FILL_LIMIT = 12;

/** 补齐计划里要新建的一段。 */
export interface AutoFillSegment {
  startDate: IsoDate;
  /** 只有配置了「一段通常持续多少天」才有；没有就是进行中 */
  endDate?: IsoDate;
}

/** 为什么停下；界面目前不用，但测试和排查时要能看出「是补完了还是被挡住了」。 */
export type AutoFillStopReason =
  | 'filled'
  | 'not-auto'
  | 'archived'
  | 'no-instances'
  | 'ongoing'
  | 'no-interval'
  | 'future'
  | 'horizon'
  | 'overlap'
  | 'limit';

export interface AutoFillPlan {
  segments: AutoFillSegment[];
  reason: AutoFillStopReason;
}

/** 自动补齐需要的定义字段（周期型才有意义）。 */
export type AutoFillDefinitionView = Pick<
  EventDefinition,
  'cycleMode' | 'averageCycleLengthDays' | 'averagePeriodLengthDays' | 'isArchived'
>;

/**
 * 算出一条定义这次启动要补的段落。
 *
 * `horizon` 是「已经补到哪一段的开始日」的水位：候选开始日 ≤ 水位就认为补过了。
 * 它存在 `app_meta` 里（零迁移），而不是从实例倒推——这样用户删掉某一段之后，
 * 下次启动不会把那段又「自动」补回来。
 */
export function planAutoCycleFill(
  definition: AutoFillDefinitionView,
  instances: readonly CycleInstance[],
  today: IsoDate,
  horizon?: IsoDate,
  limit: number = AUTO_FILL_LIMIT,
): AutoFillPlan {
  if (definition.cycleMode !== 'auto') {
    return { segments: [], reason: 'not-auto' };
  }
  if (definition.isArchived) {
    return { segments: [], reason: 'archived' };
  }

  const latest = latestInstance(instances);
  if (latest === undefined) {
    return { segments: [], reason: 'no-instances' };
  }
  if (latest.endDate === undefined) {
    return { segments: [], reason: 'ongoing' };
  }

  const interval = definition.averageCycleLengthDays;
  if (interval === undefined) {
    return { segments: [], reason: 'no-interval' };
  }

  const duration = definition.averagePeriodLengthDays;
  const segments: AutoFillSegment[] = [];
  let startDate = addDays(latest.startDate, interval);

  for (;;) {
    if (segments.length >= limit) {
      return { segments, reason: 'limit' };
    }
    if (horizon !== undefined && startDate <= horizon) {
      return { segments, reason: 'horizon' };
    }
    if (startDate > today) {
      return { segments, reason: 'future' };
    }

    const segment: AutoFillSegment = {
      startDate,
      endDate: duration === undefined ? undefined : addDays(startDate, duration - 1),
    };
    const overlaps =
      instances.some((instance) => rangesOverlap(instance, segment)) ||
      segments.some((planned) => rangesOverlap(planned, segment));
    if (overlaps) {
      // 周期长度 ≤ 持续天数，或中间被手动插了一段——不硬塞，也不改别人的边界。
      return { segments, reason: 'overlap' };
    }

    segments.push(segment);

    if (segment.endDate === undefined || segment.endDate >= today) {
      return { segments, reason: 'filled' };
    }
    startDate = addDays(startDate, interval);
  }
}

/**
 * 「补到哪一段」的水位键。按定义分开，删除定义后这条记录暂时留着也无害
 * （键不会再被读到；导入备份不带 `app_meta`，换机会从零开始）。
 */
export function autoFillHorizonKey(definitionId: string): string {
  return `app.cycle_auto_filled.${definitionId}`;
}

/** 读水位：读不懂就当没补过（宁可多补一次，不要因为脏值把自动循环卡死）。 */
export function parseAutoFillHorizon(value: string | null | undefined): IsoDate | undefined {
  return value !== null && value !== undefined && isValidIsoDate(value) ? value : undefined;
}
