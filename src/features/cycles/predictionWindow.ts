/**
 * 周期预测的「窗口」：预测时回看最近几段「实际间隔」取平均。
 *
 * 这是**展示 / 计算偏好**，只影响预测怎么算，不改库里的事实，因此和时间轴显示方式
 * 一样存在 `app_meta` 这张键值表里（零迁移），而不是加业务表或列。
 *
 * 窗口越小越贴合最近状态、越容易被一次异常周期带偏——所以默认仍是 3，
 * 界面上只给少数几个档位，别让人误以为数字越大越准。
 */

import { DEFAULT_PREDICTION_WINDOW } from '@/domain/cycles';

/** 界面上提供的档位：最近 1 / 3 / 5 段间隔。 */
export const PREDICTION_WINDOW_OPTIONS = [1, 3, 5] as const;

/** 默认窗口，与领域层保持一致（`predictNextCycle` 缺省用的就是它）。 */
export const DEFAULT_PREDICTION_WINDOW_SETTING = DEFAULT_PREDICTION_WINDOW;

/**
 * 把 `app_meta` 里存着的字符串解析成窗口。
 *
 * 缺失、空串、非数字、小于 1 的值一律回退到默认值——和 `timelineView` 同一个思路：
 * 读不懂的偏好只当「没记住」，不因为它把预测整个搞坏。
 * 上限不设死：领域层的 `observedCycleLength` 会自动只取实际存在的那几段。
 */
export function parsePredictionWindow(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_PREDICTION_WINDOW_SETTING;
}

/** 档位标签：「最近 3 段」。 */
export function describePredictionWindow(window: number): string {
  return `最近 ${window} 段`;
}
