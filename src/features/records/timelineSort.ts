/**
 * 时间轴的排序：把「事件级」的固定属性套到列表上。
 *
 * 排序键都是**事件**的属性，不是单条记录的属性：
 *
 * - `time`：按发生时间倒序（默认，也就是读库本来的顺序）
 * - `name`：按**行上显示的那个名字**升序——该事件最近一条记录的「记录时名称」。
 *   快照不可改，所以事件改名不会让老行跟着改名，排序也就跟着你看到的字走。
 * - `count`：按次数倒序，次数就是这次载入的条数（与合并行上的「共 N 次」同一个数）
 * - `recorded`：按**录入时间**倒序（「我最近记的排前面」）——
 *   补录的旧记录发生时间很早，但它是刚记的，按这一项就排在前面
 *
 * 输入**必须是发生时间倒序**（`EventRecordRepository.list` 的默认顺序）：
 * 名称与「最近一次」都取自那次遍历里的第一条。
 *
 * 纯函数：不读库，只排序，方便单测。
 */

import type { EventRecord } from '@/domain/models';

import type { RecordGroup } from './groupRecords';
import type { TimelineSortKey } from './timelineQuery';

/** 一个事件的排序键 */
interface EventSortKeys {
  /** 行上显示的名字（最近一条记录的记录时名称） */
  name: string;
  /** 这次载入的条数 */
  count: number;
  /** 最近一次发生 */
  latestOccurredAt: string;
  /** 最近一次录入 */
  latestRecordedAt: string;
}

/**
 * 按定义汇总排序键。入参发生时间倒序，所以每个定义第一次出现的那条就是它的「最近一次」。
 */
function eventSortKeys(records: readonly EventRecord[]): Map<string, EventSortKeys> {
  const keys = new Map<string, EventSortKeys>();
  for (const record of records) {
    const existing = keys.get(record.definitionId);
    if (!existing) {
      keys.set(record.definitionId, {
        name: record.snapshot.name,
        count: 1,
        latestOccurredAt: record.occurredAt,
        latestRecordedAt: record.recordedAt,
      });
      continue;
    }
    existing.count += 1;
    if (record.recordedAt > existing.latestRecordedAt) {
      existing.latestRecordedAt = record.recordedAt;
    }
  }
  return keys;
}

/**
 * 比大小：负数表示 `a` 排在前面。
 * 时间、次数、最近修改都是「大的在前」，只有名称是升序（跟人名册一样）。
 */
function compareSortKeys(a: EventSortKeys, b: EventSortKeys, sort: TimelineSortKey): number {
  switch (sort) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'count':
      return b.count - a.count;
    case 'recorded':
      return b.latestRecordedAt.localeCompare(a.latestRecordedAt);
    case 'time':
    default:
      return b.latestOccurredAt.localeCompare(a.latestOccurredAt);
  }
}

/**
 * 给事件定义排队，返回「定义 id → 名次」。
 *
 * 名次相同（理论上是不同定义撞上了同一个键值）时补两个兜底：最近发生时间倒序、
 * 定义 id 升序——排序结果因此是**确定的**，不会两个键相等就随数据库返回顺序漂移。
 */
function rankEvents(keys: Map<string, EventSortKeys>, sort: TimelineSortKey): Map<string, number> {
  const ordered = [...keys.entries()].sort(
    ([idA, a], [idB, b]) =>
      compareSortKeys(a, b, sort) ||
      b.latestOccurredAt.localeCompare(a.latestOccurredAt) ||
      idA.localeCompare(idB),
  );
  return new Map(ordered.map(([id], index) => [id, index]));
}

/**
 * 取名次。调用方喂进来的条目一定都算过键；真漏了一个也只排到最后，不会冒充第一名。
 */
function rankOf(rank: Map<string, number>, definitionId: string): number {
  return rank.get(definitionId) ?? Number.MAX_SAFE_INTEGER;
}

export function sortTimelineGroups(groups: readonly RecordGroup[], sort: TimelineSortKey): RecordGroup[] {
  if (sort === 'time') {
    return [...groups];
  }
  // 同一个定义只可能出现在一个分组里，所以把各组的记录摊平再汇总就够了
  const flat: EventRecord[] = [];
  for (const group of groups) {
    flat.push(...group.records);
  }
  const rank = rankEvents(eventSortKeys(flat), sort);
  return [...groups].sort((a, b) => rankOf(rank, a.definitionId) - rankOf(rank, b.definitionId));
}

export function sortTimelineRecords(records: readonly EventRecord[], sort: TimelineSortKey): EventRecord[] {
  if (sort === 'time') {
    return [...records];
  }
  const rank = rankEvents(eventSortKeys(records), sort);
  // 同一个事件的多条记录连在一起（名次相同），组内仍是发生时间倒序
  return [...records].sort((a, b) => {
    const byEvent = rankOf(rank, a.definitionId) - rankOf(rank, b.definitionId);
    return byEvent !== 0 ? byEvent : b.occurredAt.localeCompare(a.occurredAt);
  });
}
