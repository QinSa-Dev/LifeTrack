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
import type { SymptomSummary, SymptomTotal } from '@/features/stats/symptoms';

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
 * 「活跃事件数」趋势的对比：本期与对照期各有几个**不同事件**被记录过。
 *
 * 与 `describeComparison`（比条数）不同，这里比的是「覆盖了几个事件」，
 * 所以单位是「个」而不是「条」，两种文案不能互相套用。
 */
export function describeActiveComparison(summary: ComparisonSummary, basis: ComparisonBasis): string {
  const label = comparisonBasisLabel(basis);
  const current = summary.current.definitionCount;
  const previous = summary.previous.definitionCount;

  if (previous === 0) {
    return current === 0 ? `本期与${label}都没有记录` : `本期记了 ${current} 个事件，${label}没有记录`;
  }
  if (summary.definitionDelta === 0) {
    return `与${label}持平（都是 ${current} 个事件）`;
  }
  return `本期记了 ${current} 个事件，较${label} ${formatDelta(summary.definitionDelta)} 个`;
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

/* ------------------------------------------------------------------ *
 * 周期症状统计的文案
 * ------------------------------------------------------------------ */

/** `33%`；比例缺失时返回 undefined（没有任何记了症状的记录）。 */
export function formatSymptomRatio(ratio: number | undefined): string | undefined {
  if (ratio === undefined) {
    return undefined;
  }
  return `${Math.round(ratio * 100)}%`;
}

/**
 * 症状统计的底数：先讲清「多少条记录里有多少条记了症状」，
 * 否则下面的百分比会被误读成「占全部记录」。
 */
export function describeSymptomSummary(summary: SymptomSummary): string {
  if (summary.entryCount === 0) {
    return '还没有周期内记录';
  }
  if (summary.withSymptomsCount === 0) {
    return `${summary.entryCount} 条记录，都还没有记症状`;
  }
  return `${summary.entryCount} 条记录，其中 ${summary.withSymptomsCount} 条记了症状，共 ${summary.distinctSymptoms} 种`;
}

/** 一个症状的副标题：`3 天 · 33%`（比例按「记了症状的记录数」算）。 */
export function describeSymptomTotal(total: SymptomTotal): string {
  const ratio = formatSymptomRatio(total.ratio);
  return ratio === undefined ? `${total.dayCount} 天` : `${total.dayCount} 天 · ${ratio}`;
}
