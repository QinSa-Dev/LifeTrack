/**
 * 时间轴的两种显示方式。
 *
 * - `expanded`：逐条展开，一条记录一行（默认，也是既有行为）
 * - `merged`：同类合并，同一个事件的多次记录并成一行，点开可再展开
 *
 * 这是**纯展示偏好**，只影响怎么读，不影响库里存了什么，因此存在 `app_meta`
 * 这张键值表里（零迁移），而不是加业务表或列。
 */
export type TimelineViewMode = 'expanded' | 'merged';

/** 默认逐条展开：不改变使用者已经在看的样子，切换开关由使用者自己按。 */
export const DEFAULT_TIMELINE_VIEW_MODE: TimelineViewMode = 'expanded';

/** 把 `app_meta` 里存着的字符串解析成显示方式；空值与不认识的值都回退到默认。 */
export function parseTimelineViewMode(value: string | null | undefined): TimelineViewMode {
  return value === 'merged' ? 'merged' : DEFAULT_TIMELINE_VIEW_MODE;
}
