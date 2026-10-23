/**
 * 时间轴的两种显示方式。
 *
 * - `expanded`：逐条展开，一条记录一行
 * - `merged`：合并，同一个事件的多次记录并成一行，点开可再展开（默认）
 *
 * 这是**纯展示偏好**，只影响怎么读，不影响库里存了什么，因此存在 `app_meta`
 * 这张键值表里（零迁移），而不是加业务表或列。设置入口在「设置」标签页里统一收着，
 * 不放在时间轴页头（页头留给「这一页是什么」）。
 */
export type TimelineViewMode = 'expanded' | 'merged';

/** 默认合并：同一事件先并成一行，想逐条看时再展开——比一屏几十条更好扫。 */
export const DEFAULT_TIMELINE_VIEW_MODE: TimelineViewMode = 'merged';

/** 两种显示方式在界面上的叫法（设置页的胶囊用它，避免文案散落）。 */
export const TIMELINE_VIEW_LABELS: Record<TimelineViewMode, string> = {
  expanded: '逐条',
  merged: '合并',
};

/** 把 `app_meta` 里存着的字符串解析成显示方式；空值与不认识的值都回退到默认。 */
export function parseTimelineViewMode(value: string | null | undefined): TimelineViewMode {
  return value === 'expanded' || value === 'merged' ? value : DEFAULT_TIMELINE_VIEW_MODE;
}
