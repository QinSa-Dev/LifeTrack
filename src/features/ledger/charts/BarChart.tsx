import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import { palette, radius, spacing } from '@/theme';

export interface BarSeries {
  label: string;
  color: string;
  /** 与 labels 一一对应；缺失按 0 处理 */
  values: readonly number[];
}

export interface BarChartProps {
  labels: readonly string[];
  series: readonly BarSeries[];
  /** 柱子的绘图高度（不含底部文字），默认 132 */
  height?: number;
  /** 每隔几个标签显示一个，默认全显示。31 天这类密集横轴传 5。 */
  labelEvery?: number;
  /** 金额格式化（用于读数） */
  formatValue: (value: number) => string;
  /** 右上角最大值的格式化；不传时与 formatValue 相同 */
  formatMax?: (value: number) => string;
  /** 点中某根柱子时的读数；不传则退化成「标签 + 各系列数值」 */
  describe?: (index: number) => string;
}

/**
 * 轻量柱状图：不引图表库，用原生 View 的高度画柱子。
 *
 * 单系列（每日支出）和双系列（每月收入 / 支出）共用一套代码；
 * 点柱子会把其它柱子的透明度压低，并在上方显示这一格的读数——
 * 手机上柱状图没有 tooltip，点一下是最直接的查看方式。
 */
export function BarChart({
  labels,
  series,
  height = 132,
  labelEvery = 1,
  formatValue,
  formatMax,
  describe,
}: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(1, ...series.flatMap((item) => Array.from(item.values)));

  const caption =
    active === null
      ? '轻点柱子查看数值'
      : (describe?.(active) ??
        `${labels[active] ?? ''}：${series
          .map((item) => `${item.label} ${formatValue(item.values[active] ?? 0)}`)
          .join('，')}`);

  return (
    <View>
      <View style={styles.captionRow}>
        <AppText variant="caption" color={palette.textMuted} numberOfLines={1} style={styles.caption}>
          {caption}
        </AppText>
        <AppText variant="caption" color={palette.textMuted}>
          {(formatMax ?? formatValue)(max)}
        </AppText>
      </View>

      <View style={[styles.plot, { height }]}>
        <View style={[styles.gridLine, styles.gridTop]} />
        <View style={[styles.gridLine, styles.gridMiddle]} />
        <View style={[styles.gridLine, styles.gridBottom]} />

        <View style={styles.columns}>
          {labels.map((label, index) => (
            <Pressable
              key={`${label}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={series
                .map((item) => `${item.label} ${formatValue(item.values[index] ?? 0)}`)
                .join('，')}
              accessibilityHint="显示这一格的数值"
              onPress={() => setActive((current) => (current === index ? null : index))}
              style={styles.column}
            >
              <View style={styles.bars}>
                {series.map((item) => {
                  const value = item.values[index] ?? 0;
                  const barHeight = value > 0 ? Math.max(2, (value / max) * height) : 0;
                  return (
                    <View
                      key={item.label}
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: item.color,
                          opacity: active === null || active === index ? 1 : 0.3,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.ticks}>
        {labels.map((label, index) => (
          <View key={`tick-${label}-${index}`} style={styles.tickCell}>
            {index % labelEvery === 0 || index === labels.length - 1 ? (
              <AppText variant="caption" color={palette.textMuted} numberOfLines={1} style={styles.tick}>
                {label}
              </AppText>
            ) : null}
          </View>
        ))}
      </View>

      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <AppText variant="caption" color={palette.textMuted}>
                {item.label}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  caption: {
    flexShrink: 1,
  },
  plot: {
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
  },
  gridTop: {
    top: 0,
  },
  gridMiddle: {
    top: '50%',
  },
  gridBottom: {
    bottom: 0,
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  column: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bars: {
    width: '72%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 1,
  },
  bar: {
    flex: 1,
    maxWidth: 14,
    borderTopLeftRadius: radius.sm / 2,
    borderTopRightRadius: radius.sm / 2,
  },
  ticks: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  tickCell: {
    flex: 1,
    alignItems: 'center',
  },
  tick: {
    fontSize: 10,
    lineHeight: 14,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
