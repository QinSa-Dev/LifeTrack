/**
 * 输入校验与「表单输入 → 领域对象」的规整规则。
 *
 * 为什么单独成一层：仓储层收到的永远可能是「外部数据」（用户输入、未来导入的 JSON），
 * 而 TypeScript 的类型在运行时不做任何校验（见 docs/learning/03 4.4、4.7）。
 * 把「非空、类型、取值范围」这些规则集中在这里，仓储与界面都复用同一套判断，
 * 避免「界面校验一套、写库再校验一套」的重复与不一致。
 */

import { ValidationError } from './errors';
import { isEventDefinitionKind, type EventDefinitionKind } from './models';

/** 事件分组的输入（创建与更新共用） */
export interface EventGroupInput {
  name: string;
  color?: string;
  sortOrder?: number;
}

/** 标签的输入 */
export interface TagInput {
  name: string;
  color?: string;
}

/** 快捷选项的输入；id 省略表示新建 */
export interface QuickOptionInput {
  id?: string;
  label: string;
  value: number;
  unit?: string;
  sortOrder?: number;
}

/**
 * 事件定义的草稿：一次提交里包含定义本身、快捷选项与标签关联。
 * 更新语义是**整体替换**——草稿里没有的快捷选项/标签会被移除。
 */
export interface EventDefinitionDraft {
  name: string;
  kind: EventDefinitionKind;
  unit?: string;
  groupId?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  tagIds: string[];
  quickOptions: QuickOptionInput[];
}

/** 名称类字段：去首尾空白后必须非空。 */
export function requireName(value: string, field = '名称'): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${field}不能为空`);
  }
  return trimmed;
}

/** 可选文本：空串与纯空白都归为 undefined，避免「空字符串」这种脏值落库。 */
export function optionalText(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** 事件类型：只接受 counter / quantity，其它值在写库前就拒绝。 */
export function requireKind(value: unknown): EventDefinitionKind {
  if (!isEventDefinitionKind(value)) {
    throw new ValidationError(`事件类型不合法：${String(value)}`);
  }
  return value;
}

/** 排序值：必须是整数，允许为 0 与负数（负数表示手动置顶）。 */
export function requireSortOrder(value: number, field = '排序值'): number {
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${field}必须是整数`);
  }
  return value;
}

/**
 * 快捷选项取值：
 * - 必须是有限正数（数量型允许小数，例如 0.5 升）；
 * - 计数型的增量必须是正整数（「0.5 次」没有意义）。
 */
export function requireQuickOptionValue(
  kind: EventDefinitionKind,
  value: unknown,
  field = '快捷选项取值',
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field}必须是有限数字`);
  }
  if (value <= 0) {
    throw new ValidationError(`${field}必须大于 0`);
  }
  if (kind === 'counter' && !Number.isInteger(value)) {
    throw new ValidationError(`${field}在计数型事件下必须是整数`);
  }
  return value;
}

/** 去重并去掉空白标签 id，保持输入顺序。 */
export function normalizeIdList(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (id.length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}