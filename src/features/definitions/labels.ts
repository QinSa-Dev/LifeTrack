import { attributeText, type EventDefinitionKind, type RecordKind } from '@/domain/models';

/** 事件类型的中文展示名，列表与表单共用一处。 */
export function eventKindLabel(kind: EventDefinitionKind): string {
  return kind === 'counter' ? '计数' : '周期';
}

/** 记录类型的中文展示名：历史里的 `quantity` 标注一下来源，避免看起来像新功能。 */
export function recordKindLabel(kind: RecordKind): string {
  return kind === 'counter' ? '计数' : '数量（历史）';
}

/**
 * 「事件」列表行右侧那颗类型标记。
 *
 * 计数型写【+1】而不是「计数」——它说的是「点一次记一次」这个动作，比一个分类名更接近
 * 用户要做的事（真机反馈：这颗蓝标记看起来就像按钮）。周期型仍写「周期」。
 *
 * 类型的正式名称没有丢：副标题里由 `describeDefinition` 照旧写着「计数 / 周期」。
 */
export function definitionBadgeLabel(kind: EventDefinitionKind): string {
  return kind === 'counter' ? '+1' : eventKindLabel(kind);
}

/**
 * 一行副标题：分组名 + 类型 +（写了的话）属性。
 *
 * **没分组就不写这一段**，而不是补一个「未分组」——列表只列真实存在的信息，
 * 不拿占位词把空缺填满（属性为空同理，`attributeText` 返回 undefined 时整段不写）。
 */
export function describeDefinition(
  kind: EventDefinitionKind,
  attributes: readonly string[],
  groupName?: string,
): string {
  const parts = groupName === undefined ? [eventKindLabel(kind)] : [groupName, eventKindLabel(kind)];
  const text = attributeText(attributes);
  if (text !== undefined) {
    parts.push(`属性 ${text}`);
  }
  return parts.join(' · ');
}
