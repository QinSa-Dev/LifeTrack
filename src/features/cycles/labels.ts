/**
 * 周期功能的展示文案与文本解析（纯函数，不碰数据库）。
 *
 * 抽出来是为了让三个页面（周期列表、定义详情、实例详情）说同一套话，
 * 也方便将来单元测试不需要渲染 React 组件。
 */

import { instanceLengthDays, latestInstance, predictNextCycleStart } from '@/domain/cycles';
import type { CycleDefinition, CycleInstance, CyclePhase, IsoDate } from '@/domain/models';

/** 常用阶段名，界面上给成快捷胶囊；`CyclePhase` 本身是自由文本，仍可自己填。 */
export const COMMON_PHASES: readonly CyclePhase[] = ['经期', '卵泡期', '排卵期', '黄体期'];

/** 一行定义摘要：平均周期长度 / 平均经期长度，用于列表副标题。 */
export function describeCycleDefinition(definition: CycleDefinition): string {
  const parts = [
    definition.averageCycleLengthDays === undefined
      ? '未设平均周期'
      : `平均周期 ${definition.averageCycleLengthDays} 天`,
  ];
  if (definition.averagePeriodLengthDays !== undefined) {
    parts.push(`平均经期 ${definition.averagePeriodLengthDays} 天`);
  }
  return parts.join(' · ');
}

/** 最近一次周期 + 下次预测，用于列表副标题；没有记录时给出明确说明。 */
export function describeLatestCycle(
  definition: CycleDefinition,
  instances: readonly CycleInstance[],
): string {
  const latest = latestInstance(instances);
  if (!latest) {
    return '还没有周期记录';
  }
  const parts = [`最近 ${latest.startDate} ~ ${latest.endDate ?? '进行中'}`];
  const predicted = predictNextCycleStart(latest, definition);
  if (predicted !== undefined) {
    parts.push(`预测下次 ${predicted}`);
  }
  return parts.join(' · ');
}

/** 「2026-10-01 ~ 2026-10-05 · 共 5 天」；进行中的实例需要传入 `through`（通常是今天）。 */
export function describeInstanceRange(instance: CycleInstance, through?: IsoDate): string {
  const range = `${instance.startDate} ~ ${instance.endDate ?? '进行中'}`;
  const days = instanceLengthDays(instance, through);
  return days === undefined ? range : `${range} · 共 ${days} 天`;
}

/** 把 `2026-10-01` 显示成 `10-01`，列表里更紧凑。 */
export function formatShortDate(iso: IsoDate): string {
  return iso.slice(5);
}

const SYMPTOM_SEPARATOR = /[,，、]/;

/** 把输入框里的「头痛，乏力」解析成症状列表；仓储层还会再去空去重。 */
export function splitSymptoms(text: string): string[] {
  return text.split(SYMPTOM_SEPARATOR).map((item) => item.trim());
}

/** 反向：把症状列表填回输入框。 */
export function joinSymptoms(symptoms: readonly string[]): string {
  return symptoms.join('、');
}
