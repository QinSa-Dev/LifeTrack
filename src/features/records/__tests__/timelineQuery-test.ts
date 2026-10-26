import type { EventGroup } from '@/domain/models';

import {
  DEFAULT_TIMELINE_QUERY,
  DEFAULT_TIMELINE_SORT,
  describeTimelineQuery,
  formatTimelineQuery,
  isFilterActive,
  isTimelineSortKey,
  parseTimelineQuery,
  selectedGroupName,
  toRecordFilterOptions,
} from '@/features/records/timelineQuery';

const groups: EventGroup[] = [
  {
    id: 'grp-health',
    name: '健康',
    sortOrder: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

describe('parseTimelineQuery / formatTimelineQuery', () => {
  it('没存过（null / 空串）时给默认值：全部 · 按时间', () => {
    expect(parseTimelineQuery(null)).toEqual(DEFAULT_TIMELINE_QUERY);
    expect(parseTimelineQuery(undefined)).toEqual(DEFAULT_TIMELINE_QUERY);
    expect(parseTimelineQuery('')).toEqual(DEFAULT_TIMELINE_QUERY);
  });

  it('写出去再读回来是同一套条件', () => {
    const query = {
      filter: { name: '喝水', kind: 'quantity' as const, source: 'quick' as const, groupId: 'grp-health' },
      sort: 'count' as const,
    };

    expect(parseTimelineQuery(formatTimelineQuery(query))).toEqual(query);
  });

  it('「不限」与「未分组」分得开：两者都是 JSON 里合法的值', () => {
    const ungrouped = formatTimelineQuery({ filter: { name: '', groupId: null }, sort: 'time' });
    const anyGroup = formatTimelineQuery({ filter: { name: '' }, sort: 'time' });

    expect(parseTimelineQuery(ungrouped).filter.groupId).toBeNull();
    expect(parseTimelineQuery(anyGroup).filter.groupId).toBeUndefined();
  });

  it('坏数据不炸：整个值不是 JSON 时回落到默认', () => {
    expect(parseTimelineQuery('{不是 JSON')).toEqual(DEFAULT_TIMELINE_QUERY);
    expect(parseTimelineQuery('"一个字符串"')).toEqual(DEFAULT_TIMELINE_QUERY);
  });

  it('认不出来的那一项回落，认得出来的照旧（不整段丢掉）', () => {
    const stored = JSON.stringify({
      name: '喝水',
      kind: 'cycle', // 记录类型里没有 cycle
      source: 'auto', // 来源里也没有 auto
      group: 'none',
      sort: '按姓名', // 不是任何一种排序键
    });

    expect(parseTimelineQuery(stored)).toEqual({
      filter: { name: '喝水', kind: undefined, source: undefined, groupId: null },
      sort: DEFAULT_TIMELINE_SORT,
    });
  });

  it('每次读回来都是新对象，不跟默认常量共享引用', () => {
    expect(parseTimelineQuery(null)).not.toBe(DEFAULT_TIMELINE_QUERY);
  });
});

describe('isTimelineSortKey', () => {
  it('认四种固定排序键，别的一律不认', () => {
    expect(isTimelineSortKey('time')).toBe(true);
    expect(isTimelineSortKey('recorded')).toBe(true);
    expect(isTimelineSortKey('name')).toBe(true);
    expect(isTimelineSortKey('count')).toBe(true);
    expect(isTimelineSortKey('updated_at')).toBe(false);
    expect(isTimelineSortKey(undefined)).toBe(false);
  });
});

describe('isFilterActive', () => {
  it('什么都不筛时为假', () => {
    expect(isFilterActive({ name: '' })).toBe(false);
    expect(isFilterActive({ name: '   ' })).toBe(false);
  });

  it('任意一项筛了就是真', () => {
    expect(isFilterActive({ name: '喝水' })).toBe(true);
    expect(isFilterActive({ name: '', kind: 'counter' })).toBe(true);
    expect(isFilterActive({ name: '', source: 'backfill' })).toBe(true);
    expect(isFilterActive({ name: '', groupId: null })).toBe(true);
    expect(isFilterActive({ name: '', groupId: 'grp-health' })).toBe(true);
  });
});

describe('describeTimelineQuery', () => {
  it('什么都没筛：写「全部」，并带上排序', () => {
    expect(describeTimelineQuery({ filter: { name: '' }, sort: 'time' })).toBe('全部 · 按时间');
  });

  it('多项筛选按「名字 → 类型 → 来源 → 分组 → 排序」拼起来', () => {
    const query = {
      filter: { name: ' 喝水 ', kind: 'counter' as const, source: 'quick' as const, groupId: 'grp-health' },
      sort: 'count' as const,
    };

    expect(describeTimelineQuery(query, '健康')).toBe('「喝水」 · 计数 · 快捷 · 健康 · 按次数');
  });

  it('未分组写「未分组」；分组名一时查不到就写「分组」兜底', () => {
    expect(describeTimelineQuery({ filter: { name: '', groupId: null }, sort: 'name' })).toBe(
      '未分组 · 按名称',
    );
    expect(describeTimelineQuery({ filter: { name: '', groupId: 'grp-other' }, sort: 'time' })).toBe(
      '分组 · 按时间',
    );
  });
});

describe('selectedGroupName', () => {
  it('选出分组名；「不限」「未分组」都没有名字', () => {
    expect(selectedGroupName({ name: '', groupId: 'grp-health' }, groups)).toBe('健康');
    expect(selectedGroupName({ name: '' }, groups)).toBeUndefined();
    expect(selectedGroupName({ name: '', groupId: null }, groups)).toBeUndefined();
  });
});

describe('toRecordFilterOptions', () => {
  it('空条件不进参数：仓储按「不限」处理 undefined', () => {
    expect(toRecordFilterOptions({ name: '   ' })).toEqual({
      nameLike: undefined,
      kind: undefined,
      source: undefined,
      groupId: undefined,
    });
  });

  it('关键字去掉两头空白；「未分组」原样传 null', () => {
    expect(toRecordFilterOptions({ name: ' 喝水 ', groupId: null })).toEqual({
      nameLike: '喝水',
      kind: undefined,
      source: undefined,
      groupId: null,
    });
  });
});
