import type { EventDefinitionKind } from '@/domain/models';

/** 事件类型的中文展示名，列表与表单共用一处。 */
export function eventKindLabel(kind: EventDefinitionKind): string {
  return kind === 'counter' ? '计数' : '数量';
}

/** 一行副标题：分组名 + 类型 +（数量型的）单位。 */
export function describeDefinition(kind: EventDefinitionKind, unit?: string, groupName?: string): string {
  const parts = [groupName ?? '未分组', eventKindLabel(kind)];
  if (unit) {
    parts.push(`单位 ${unit}`);
  }
  return parts.join(' · ');
}