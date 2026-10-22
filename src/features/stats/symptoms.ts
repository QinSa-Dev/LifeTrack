/**
 * 周期症状统计（纯函数，不碰数据库）。
 *
 * `features/stats/aggregate.ts` 统的是**事件记录**（EventRecord，带发生时刻），
 * 这里统的是**周期内记录**（CycleEntry，只有「哪一天」）：一天一条，
 * 症状是一个文本数组（`['头痛', '乏力']`）。
 *
 * 三条口径，与事件统计保持一致：
 *
 * 1. **只统计可见记录**：软删除的那天不参与（`isVisibleEntry` 兜底）。
 * 2. **同一天内同一个症状只算一次**：手写「头痛、头痛」不该算两天份。
 * 3. **症状名不做同义归一**：`头痛` 与 `头疼` 是两种症状。这不是遗漏而是取舍——
 *    没有词典就不该替用户合并，界面上如实列出，用户自己看着改名更靠谱。
 */

import { isVisibleEntry, type CycleEntry } from '@/domain/models';

/** 一个症状的汇总。 */
export interface SymptomTotal {
  symptom: string;
  /** 记过这个症状的**记录条数**（一天一条，所以也是「天数」） */
  dayCount: number;
  /** 占「记了症状的记录数」的比例（如 0.3333）；分母为 0 时为 `undefined` */
  ratio?: number;
}

/** 症状统计的总体说明。 */
export interface SymptomSummary {
  /** 参与统计的周期记录条数（软删除的不算） */
  entryCount: number;
  /** 其中至少记了一个症状的条数 */
  withSymptomsCount: number;
  /** 不同症状的种数 */
  distinctSymptoms: number;
}

/** 症状名的轻量归一：去掉首尾空白，空串丢弃（备份导入的数据可能没清理过）。 */
function normalizeSymptom(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** 每天的症状去重后按名称排序，让同样的输入产生同样的统计结果。 */
function uniqueSymptoms(entry: CycleEntry): string[] {
  const seen = new Set<string>();
  for (const raw of entry.symptoms) {
    const symptom = normalizeSymptom(raw);
    if (symptom !== undefined) {
      seen.add(symptom);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** 总体说明：多少条记录、其中多少条记了症状、一共几种症状。 */
export function summarizeSymptoms(entries: readonly CycleEntry[]): SymptomSummary {
  const symptoms = new Set<string>();
  let entryCount = 0;
  let withSymptomsCount = 0;

  for (const entry of entries) {
    if (!isVisibleEntry(entry)) {
      continue;
    }
    entryCount += 1;
    const unique = uniqueSymptoms(entry);
    if (unique.length > 0) {
      withSymptomsCount += 1;
    }
    for (const symptom of unique) {
      symptoms.add(symptom);
    }
  }

  return { entryCount, withSymptomsCount, distinctSymptoms: symptoms.size };
}

/**
 * 按症状汇总，条数从多到少；条数相同按名称排。
 *
 * `ratio` 的分母是「记了症状的记录数」，不是全部记录数——
 * 「头痛出现在 3 天」这句话的意思应该是「在这 3 天里有头痛」，
 * 而不是把「没记症状的天」也算进分母，让它看起来更少见。
 */
export function aggregateSymptoms(entries: readonly CycleEntry[]): SymptomTotal[] {
  const counts = new Map<string, number>();
  let withSymptomsCount = 0;

  for (const entry of entries) {
    if (!isVisibleEntry(entry)) {
      continue;
    }
    const unique = uniqueSymptoms(entry);
    if (unique.length === 0) {
      continue;
    }
    withSymptomsCount += 1;
    for (const symptom of unique) {
      counts.set(symptom, (counts.get(symptom) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([symptom, dayCount]) => ({
      symptom,
      dayCount,
      ratio: withSymptomsCount === 0 ? undefined : dayCount / withSymptomsCount,
    }))
    .sort((a, b) => b.dayCount - a.dayCount || a.symptom.localeCompare(b.symptom));
}
