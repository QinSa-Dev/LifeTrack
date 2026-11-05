import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components';
import { palette } from '@/theme';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  slices: readonly DonutSlice[];
  /** 整个图（含环）的边长，默认 132 */
  size?: number;
  /** 环宽，默认 16 */
  strokeWidth?: number;
  centerLabel: string;
  centerValue: string;
}

/**
 * 环形图：用 `react-native-svg` 的虚线圆环画扇形。
 *
 * 每个扇形的长度 = 占比 × 周长，靠 `strokeDashoffset` 依次错开；
 * 圆整体旋转 -90°，让第一段从 12 点方向开始。
 * 段与段之间留 2px 缝（只有一段时不留，否则 100% 的环会缺一个口）。
 */
export function DonutChart({
  slices,
  size = 132,
  strokeWidth = 16,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const gap = slices.length > 1 ? 2 : 0;

  const fractions = slices.map((slice) => (total > 0 ? slice.value / total : 0));
  const arcs = slices.map((slice, index) => {
    const fraction = fractions[index] ?? 0;
    const offset = fractions.slice(0, index).reduce((sum, value) => sum + value, 0);
    const length = Math.max(0, fraction * circumference - (fraction > 0 ? gap : 0));
    return {
      ...slice,
      // 只有一类时直接画整圆：`strokeDasharray` 的第二段为 0 在部分渲染器上会整段消失。
      dashArray:
        fraction >= 0.9999 ? undefined : ([length, Math.max(0, circumference - length)] as [number, number]),
      dashOffset: -offset * circumference,
    };
  });

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessible
      accessibilityLabel={`${centerLabel} ${centerValue}`}
    >
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={palette.surfaceMuted}
            strokeWidth={strokeWidth}
          />
          {arcs.map((arc) => (
            <Circle
              key={arc.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.dashOffset}
            />
          ))}
        </G>
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <AppText variant="caption" color={palette.textMuted} numberOfLines={1} style={styles.centerLabel}>
          {centerLabel}
        </AppText>
        <AppText
          variant="label"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
          style={styles.centerValue}
        >
          {centerValue}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  centerLabel: {
    textAlign: 'center',
  },
  centerValue: {
    textAlign: 'center',
  },
});
