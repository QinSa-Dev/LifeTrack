/**
 * 统计功能的展示文案（纯函数，不碰数据库、不碰 React）。
 *
 * 抽出来的理由和 `features/cycles/labels.ts` 一样：让「说法」只有一处，
 * 并且能脱离 React 组件单独测试。
 *
 * 这里最要紧的一条是**别把 0 说成百分比**：对照期没有记录时，
 * 变化率是算不出来的（除数为 0），文案要如实说「无法算变化率」，
 * 而不是显示成「+100%」或「—」。
 */

import type { ComparisonBasis, ComparisonSummary, DefinitionChange } from '@/features/stats/aggregate';

/** 用来对照的那一段怎么称呼。 */
export function comparisonBasisLabel(basis: ComparisonBasis): string {
  return basis === 'previous' ? '前一段' : '上年同期';
}

/** 「+3」/「-3」/「0」。条数一定是整数，这里仍然四舍五入挡一次浮点误差。 */
export function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/** 「+33%」/「-8%」；变化率缺失时返回 undefined（让调用方决定怎么讲）。 */
export function formatRate(rate: number | undefined): string | undefined {
  if (rate === undefined) {
    return undefined;
  }
  const percent = Math.round(rate * 100);
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

/**
 * 一句话说清本期的整体对比。
 *
 * 三种情况分开讲：
 * - 对照期有记录 → 给差值与百分比；
 * - 对照期没有、本期有 → 只说本期条数（变化率算不出来）；
 * - 两边都没有 → 明说两边都空。
 */
export function describeComparison(summary: ComparisonSummary, basis: ComparisonBasis): string {
  const label = comparisonBasisLabel(basis);
  const currentCount = summary.current.recordCount;

  if (summary.previous.recordCount === 0) {
    return currentCount === 0
      ? `本期与${label}都没有记录`
      : `本期 ${currentCount} 条，${label}没有记录，无法算变化率`;
  }

  const rate = formatRate(summary.recordCountRate);
  const percent = rate === undefined ? '' : `（${rate}）`;
  return `本期 ${currentCount} 条，较${label} ${formatDelta(summary.recordCountDelta)} 条${percent}`;
}

/**
 * 单个事件在两个窗口之间的变化，用于「按事件统计」每行的副标题。
 *
 * 两个窗口都没有它时返回 `undefined`（调用方据此不显示这一段）。
 */
export function describeDefinitionChange(
  change: DefinitionChange,
  basis: ComparisonBasis,
): string | undefined {
  const label = comparisonBasisLabel(basis);

  if (change.currentCount === 0 && change.previousCount === 0) {
    return undefined;
  }
  if (change.previousCount === 0) {
    return `本期新增 ${change.currentCount} 条`;
  }
  if (change.currentCount === 0) {
    return `本期没有（${label} ${change.previousCount} 条）`;
  }
  if (change.delta === 0) {
    return `与${label}持平（${change.currentCount} 条）`;
  }
  return `本期 ${change.currentCount} 条，较${label} ${formatDelta(change.delta)}`;
}
