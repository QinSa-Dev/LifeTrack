import type { EventRecord } from '@/domain/models';

export interface RecordGroup {
  /**
   * 分组键：事件定义 id。
   * 事件记录刻意不建指向定义的**外键**（历史独立于定义），所以定义被永久删除后
   * 这个 id 仍然把它名下同一事件的历史聚在一起，不会散成一行一条。
   */
  definitionId: string;
  /** 组内记录，仍是发生时间倒序（与逐条模式看到的顺序一致） */
  records: EventRecord[];
  /** 最近一次记录：合并行右侧的取值与【+1】都以它为准 */
  latest: EventRecord;
}

/**
 * 把时间轴记录按事件定义合并成组（「同类合并」视图）。
 *
 * 输入已经是「发生时间倒序」，所以第一组就是最近发生的那个事件；
 * 组内顺序原样保留，展开后与逐条视图完全一致。
 *
 * 纯函数：不读库、不重排序，只做分组，方便单测。
 */
export function groupRecordsByDefinition(records: readonly EventRecord[]): RecordGroup[] {
  const buckets = new Map<string, EventRecord[]>();
  for (const record of records) {
    const bucket = buckets.get(record.definitionId);
    if (bucket) {
      bucket.push(record);
    } else {
      buckets.set(record.definitionId, [record]);
    }
  }

  const groups: RecordGroup[] = [];
  for (const [definitionId, items] of buckets) {
    const latest = items[0];
    // 分组只可能由至少一条记录创建，`latest` 必然存在；
    // 这个判断只是为了让 noUncheckedIndexedAccess 下的类型收敛。
    if (!latest) {
      continue;
    }
    groups.push({ definitionId, records: items, latest });
  }
  return groups;
}
