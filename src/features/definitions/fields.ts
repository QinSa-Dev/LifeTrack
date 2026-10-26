import type { FieldKind } from '@/domain/models';

/** 自定义字段类型的中文名：定义表单与记录页共用一处。 */
export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  single: '单选',
  multi: '多选',
  time: '时间点',
  range: '时间段',
};

/** 每种字段类型的一句话提示，放在定义表单里让人一眼知道它记什么。 */
export const FIELD_KIND_HINTS: Record<FieldKind, string> = {
  single: '从候选值里挑一个，例如「早晨 / 中午 / 晚上」。',
  multi: '从候选值里挑若干，例如「早晨 + 运动后」。',
  time: '记一个时间点，记录时填「时:分」，例如 08:30。',
  range: '记一段时间，记录时填开始与结束，例如 08:30–09:15。',
};
