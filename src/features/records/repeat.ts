import { recordAttributes, type EventRecord } from '@/domain/models';
import type { FieldValueInput } from '@/domain/validation';

/** 照抄一条历史记录时要写库的部分：取值 + 属性 + 字段取值。 */
export interface RepeatDraft {
  value: number;
  attributes: string[];
  fieldValues: FieldValueInput[];
}

/**
 * 【+1】到底写什么：**照抄该事件最近一条记录**。
 *
 * - 属性取 `recordAttributes`（记录自己的属性，旧记录可能没有，退到快照里的）；
 * - 字段取值一并带上：同一条记录再发生一次，剂量 / 时间段这类取值通常也一样，
 *   悄悄丢掉会让人以为「记上了」其实缺了半条（仓储会按**当前**定义过滤掉不认识的字段）。
 * - **没有历史**（新建后一次都没记过）时退化为「+1、不带属性、不带字段」——
 *   计数型最默认的一条，也是记录页「数量」输入框的默认值。
 */
export function repeatDraft(latest: EventRecord | undefined): RepeatDraft {
  if (latest === undefined) {
    return { value: 1, attributes: [], fieldValues: [] };
  }
  return {
    value: latest.value,
    attributes: recordAttributes(latest),
    fieldValues: latest.fieldValues,
  };
}
