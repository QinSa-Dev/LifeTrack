import { DEFAULT_TIMELINE_VIEW_MODE, parseTimelineViewMode } from '@/features/records/timelineView';

describe('parseTimelineViewMode', () => {
  it('认识存下来的两种取值', () => {
    expect(parseTimelineViewMode('expanded')).toBe('expanded');
    expect(parseTimelineViewMode('merged')).toBe('merged');
  });

  it('没存过（null / undefined / 空串）时回退到默认的逐条展开', () => {
    expect(parseTimelineViewMode(null)).toBe(DEFAULT_TIMELINE_VIEW_MODE);
    expect(parseTimelineViewMode(undefined)).toBe(DEFAULT_TIMELINE_VIEW_MODE);
    expect(parseTimelineViewMode('')).toBe(DEFAULT_TIMELINE_VIEW_MODE);
    expect(DEFAULT_TIMELINE_VIEW_MODE).toBe('expanded');
  });

  it('不认识的值也回退到默认，不让脏数据把界面卡住', () => {
    expect(parseTimelineViewMode('MERGED')).toBe('expanded');
    expect(parseTimelineViewMode('grouped')).toBe('expanded');
    expect(parseTimelineViewMode('1')).toBe('expanded');
  });
});
