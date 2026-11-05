/**
 * 图表的类别配色。
 *
 * 支出类别是按备注动态生成的，没有固定的「行业色」可套，所以按排名循环取色；
 * 「其他」统一用中性灰，避免和真实类别抢注意力。
 * 顺序经过挑选：相邻颜色在色相上有明显距离，小屏上也能分清。
 */
export const CHART_COLORS = [
  '#3B6EF6',
  '#D64545',
  '#1B9C63',
  '#B0731A',
  '#7C5CFC',
  '#0E8FA7',
  '#D9569B',
] as const;

export const OTHER_COLOR = '#9CA3AF';

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? OTHER_COLOR;
}
