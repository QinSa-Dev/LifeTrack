import {
  DEFAULT_TIMELINE_VIEW_MODE,
  TIMELINE_VIEW_LABELS,
  parseTimelineViewMode,
} from '@/features/records/timelineView';

describe('parseTimelineViewMode', () => {
  it('认识存下来的两种取值', () => {
    expect(parseTimelineViewMode('expanded')).toBe('expanded');
    expect(parseTimelineViewMode('merged')).toBe('merged');
  });

  it('没存过（null / undefined / 空串）时回退到默认的合并视图', () => {
    expect(parseTimelineViewMode(null)).toBe(DEFAULT_TIMELINE_VIEW_MODE);
    expect(parseTimelineViewMode(undefined)).toBe(DEFAULT_TIMELINE_VIEW_MODE);
    expect(parseTimelineViewMode('')).toBe(DEFAULT_TIMELINE_VIEW_MODE);
    expect(DEFAULT_TIMELINE_VIEW_MODE).toBe('merged');
  });

  it('不认识的值也回退到默认，不让脏数据把界面卡住', () => {
    expect(parseTimelineViewMode('MERGED')).toBe('merged');
    expect(parseTimelineViewMode('grouped')).toBe('merged');
    expect(parseTimelineViewMode('1')).toBe('merged');
  });
});

describe('TIMELINE_VIEW_LABELS', () => {
  it('两种显示方式的界面叫法是「逐条 / 合并」', () => {
    expect(TIMELINE_VIEW_LABELS.expanded).toBe('逐条');
    expect(TIMELINE_VIEW_LABELS.merged).toBe('合并');
  });
});
