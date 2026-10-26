/**
 * 时间轴的「筛选与排序」：一套只影响**怎么读**的状态，不改库里的事实。
 *
 * - 筛选：事件名（关键字）/ 类型 / 来源 / 分组。四项都是「不限 + 选一个」，
 *   组合起来交给 `EventRecordRepository.list` **下推到 SQL**——所以「最近 N 条」
 *   说的是「**符合筛选的**最近 N 条」，而不是「最近 N 条里碰巧符合的几条」。
 * - 排序：按时间（默认）/ 名称 / 次数 / 最近修改。见 `timelineSort.ts`。
 *
 * 状态存 `app_meta`（`META_KEYS.timelineQuery`），值是**一段 JSON**：
 * 与「逐条 / 合并」同一个理由——纯展示偏好，不值得为它加表或加列（零迁移）。
 * 读回来时每一项都单独校验，认不出来的值一律回落到默认：`app_meta` 是文本，
 * 哪天被手改坏了，也不该让时间轴打不开。
 */

import { isRecordKind, isRecordSource, type RecordKind, type RecordSource } from '@/domain/models';

import { recordKindLabel } from '@/features/definitions/labels';

import { sourceLabel } from './format';

/**
 * 列表筛选条件。四个字段都是「空 = 不限」：
 * 一次只筛一种类型 / 一种来源 / 一个分组——组合够用，也不用教人怎么多选。
 */
export interface TimelineFilter {
  /** 事件名关键字；空串（或只有空白）= 不限 */
  name: string;
  /** 记录类型；`undefined` = 不限 */
  kind?: RecordKind;
  /** 来源；`undefined` = 不限 */
  source?: RecordSource;
  /** 分组：`undefined` = 不限，`null` = 未分组，字符串 = 分组 id */
  groupId?: string | null;
}

/** 排序键。四个都是「固定属性」，不给人填表达式。 */
export type TimelineSortKey = 'time' | 'name' | 'count' | 'recorded';

/** 默认按时间倒序：刚发生的事排在前面，这是时间轴本来的读法。 */
export const DEFAULT_TIMELINE_SORT: TimelineSortKey = 'time';

export const TIMELINE_SORT_KEYS: readonly TimelineSortKey[] = ['time', 'name', 'count', 'recorded'];

export const TIMELINE_SORT_LABELS: Record<TimelineSortKey, string> = {
  time: '按时间',
  name: '按名称',
  count: '按次数',
  recorded: '按最近修改',
};

export interface TimelineQuery {
  filter: TimelineFilter;
  sort: TimelineSortKey;
}

/** 常量当只读用：改状态一律造新对象（`{ ...query, ... }`），不要在原地改。 */
export const DEFAULT_TIMELINE_QUERY: TimelineQuery = { filter: { name: '' }, sort: DEFAULT_TIMELINE_SORT };

/** 存进 `app_meta` 的形状。JSON 里没有 `undefined`，所以「不限」与「未分组」得分得开。 */
interface StoredTimelineQuery {
  name: string;
  kind: RecordKind | null;
  source: RecordSource | null;
  /** `all` = 不限，`none` = 未分组，其余是分组 id */
  group: 'all' | 'none' | string;
  sort: TimelineSortKey;
}

export function isTimelineSortKey(value: unknown): value is TimelineSortKey {
  return typeof value === 'string' && (TIMELINE_SORT_KEYS as readonly string[]).includes(value);
}

/**
 * 读回存的 JSON；坏数据、缺字段、认不出来的值都回落到默认，不抛错。
 * 每次返回一个新对象（调用方拿去当 state，不跟常量共享引用）。
 */
export function parseTimelineQuery(stored: string | null | undefined): TimelineQuery {
  const fallback: TimelineQuery = { filter: { name: '' }, sort: DEFAULT_TIMELINE_SORT };
  if (!stored) {
    return fallback;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return fallback;
  }
  if (typeof raw !== 'object' || raw === null) {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  return {
    filter: {
      name: typeof record.name === 'string' ? record.name : '',
      kind: isRecordKind(record.kind) ? record.kind : undefined,
      source: isRecordSource(record.source) ? record.source : undefined,
      groupId:
        record.group === 'none'
          ? null
          : typeof record.group === 'string' && record.group !== 'all'
            ? record.group
            : undefined,
    },
    sort: isTimelineSortKey(record.sort) ? record.sort : DEFAULT_TIMELINE_SORT,
  };
}

/** 写回 `app_meta` 的 JSON（与 `parseTimelineQuery` 严格互逆）。 */
export function formatTimelineQuery(query: TimelineQuery): string {
  const stored: StoredTimelineQuery = {
    name: query.filter.name,
    kind: query.filter.kind ?? null,
    source: query.filter.source ?? null,
    group:
      query.filter.groupId === undefined
        ? 'all'
        : query.filter.groupId === null
          ? 'none'
          : query.filter.groupId,
    sort: query.sort,
  };
  return JSON.stringify(stored);
}

/** 有没有筛——「只有排序不是默认」不算筛选，页头据此决定要不要提示「清空筛选」。 */
export function isFilterActive(filter: TimelineFilter): boolean {
  return (
    filter.name.trim() !== '' ||
    filter.kind !== undefined ||
    filter.source !== undefined ||
    filter.groupId !== undefined
  );
}

/**
 * 一句话说清现在在看什么，例如「喝水 · 快捷 · 按次数」「全部 · 按时间」。
 * 页头与折叠开关共用它，避免两处各写一遍。
 *
 * `groupName` 由调用方按 `filter.groupId` 去分组表里查（`null` 是「未分组」，查不到就不传）。
 */
export function describeTimelineQuery(query: TimelineQuery, groupName?: string): string {
  const parts = describeFilter(query.filter, groupName);
  parts.push(TIMELINE_SORT_LABELS[query.sort]);
  return parts.join(' · ');
}

function describeFilter(filter: TimelineFilter, groupName?: string): string[] {
  const parts: string[] = [];
  const name = filter.name.trim();
  if (name !== '') {
    parts.push(`「${name}」`);
  }
  if (filter.kind !== undefined) {
    parts.push(recordKindLabel(filter.kind));
  }
  if (filter.source !== undefined) {
    parts.push(sourceLabel(filter.source));
  }
  if (filter.groupId !== undefined) {
    parts.push(filter.groupId === null ? '未分组' : (groupName ?? '分组'));
  }
  // 一项都没筛就把「全部」写上：这句要回答「现在在看什么」，空着反而不知道是全看还是没加载出来
  return parts.length > 0 ? parts : ['全部'];
}

/**
 * 分组筛选当前选中的那一个（用于 `describeTimelineQuery` 与胶囊高亮）。
 */
export function selectedGroupName(
  filter: TimelineFilter,
  groups: readonly { id: string; name: string }[],
): string | undefined {
  if (typeof filter.groupId !== 'string') {
    return undefined;
  }
  return groups.find((group) => group.id === filter.groupId)?.name;
}

/** 筛选条件 → `EventRecordRepository.list` 的参数（空条件不出现在参数里）。 */
export function toRecordFilterOptions(filter: TimelineFilter): {
  nameLike?: string;
  kind?: RecordKind;
  source?: RecordSource;
  groupId?: string | null;
} {
  const name = filter.name.trim();
  return {
    nameLike: name === '' ? undefined : name,
    kind: filter.kind,
    source: filter.source,
    groupId: filter.groupId,
  };
}
