import { attributeText, type EventDefinitionKind, type RecordKind } from '@/domain/models';

/** 事件类型的中文展示名，列表与表单共用一处。 */
export function eventKindLabel(kind: EventDefinitionKind): string {
  return kind === 'counter' ? '计数' : '周期';
}

/** 记录类型的中文展示名：历史里的 `quantity` 标注一下来源，避免看起来像新功能。 */
export function recordKindLabel(kind: RecordKind): string {
  return kind === 'counter' ? '计数' : '数量（历史）';
}

/** 一行副标题：分组名 + 类型 +（写了的话）属性。 */
export function describeDefinition(
  kind: EventDefinitionKind,
  attributes: readonly string[],
  groupName?: string,
): string {
  const parts = [groupName ?? '未分组', eventKindLabel(kind)];
  const text = attributeText(attributes);
  if (text !== undefined) {
    parts.push(`属性 ${text}`);
  }
  return parts.join(' · ');
}
