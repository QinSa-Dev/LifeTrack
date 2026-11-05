import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText, Button, Card, Chip } from '@/components';
import { palette, spacing } from '@/theme';

import {
  TAB_ROUTE_LABELS,
  moveTab,
  type NavigationPreferences,
  type TabRoute,
} from './navigationPreferences';

export interface NavigationSettingsCardProps {
  preferences: NavigationPreferences;
  /** 偏好读 / 写失败时的原因（成功时为 null） */
  error: string | null;
  /** 每次改顺序或默认页都把**完整**的新偏好交回去 */
  onChange: (next: NavigationPreferences) => void;
  style?: ViewStyle;
}

/**
 * 「底部导航」设置卡：各标签的左右顺序 + 默认打开哪一页。
 *
 * 顺序按当前顺序列成若干行，每行两颗小按钮（左移 / 右移）；默认页用同一组中文名做胶囊。
 * 按钮的读屏名字带上标签名（`把「统计」左移`），一屏同名按钮也不会点错——
 * 与分组管理卡的做法一致。
 */
export function NavigationSettingsCard({ preferences, error, onChange, style }: NavigationSettingsCardProps) {
  const { order, defaultTab } = preferences;

  const move = (route: TabRoute, offset: -1 | 1) => {
    onChange({ ...preferences, order: moveTab(order, route, offset) });
  };

  return (
    <Card title="底部导航" subtitle="顺序改完立即生效；默认页下次启动生效" style={style}>
      <AppText variant="label" color={palette.textMuted}>
        导航顺序
      </AppText>
      <View style={styles.orderList}>
        {order.map((route, index) => (
          <View key={route} style={styles.orderRow}>
            <AppText variant="body" style={styles.orderName}>
              {TAB_ROUTE_LABELS[route]}
            </AppText>
            <View style={styles.orderActions}>
              <Button
                label="左移"
                size="sm"
                tone="secondary"
                disabled={index === 0}
                accessibilityLabel={`把「${TAB_ROUTE_LABELS[route]}」左移`}
                onPress={() => move(route, -1)}
              />
              <Button
                label="右移"
                size="sm"
                tone="secondary"
                disabled={index === order.length - 1}
                accessibilityLabel={`把「${TAB_ROUTE_LABELS[route]}」右移`}
                onPress={() => move(route, 1)}
              />
            </View>
          </View>
        ))}
      </View>

      <AppText variant="label" color={palette.textMuted} style={styles.defaultLabel}>
        默认打开
      </AppText>
      <View style={styles.chipRow}>
        {order.map((route) => (
          <Chip
            key={route}
            label={TAB_ROUTE_LABELS[route]}
            selected={defaultTab === route}
            accessibilityLabel={`默认打开「${TAB_ROUTE_LABELS[route]}」`}
            onPress={() => onChange({ ...preferences, defaultTab: route })}
          />
        ))}
      </View>

      {error ? (
        <AppText variant="caption" color={palette.danger} style={styles.error}>
          导航偏好没能记住：{error}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  orderList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderName: {
    flex: 1,
  },
  orderActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  defaultLabel: {
    marginTop: spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  error: {
    marginTop: spacing.sm,
  },
});
