import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  NavigationPreferencesProvider,
  useNavigationPreferences,
} from '@/features/navigation/NavigationPreferencesProvider';
import {
  TAB_ROUTE_HREFS,
  TAB_ROUTE_LABELS,
  type NavigationPreferences,
  type TabRoute,
} from '@/features/navigation/navigationPreferences';
import { palette } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type IconBase = 'time' | 'wallet' | 'stats-chart' | 'albums' | 'settings';

const ACTIVE_COLOR = palette.primary;
const INACTIVE_COLOR = palette.textMuted;

/** 每个标签的图标；顺序由用户偏好决定，这里只放不随顺序变的东西。 */
const TAB_META: Record<TabRoute, { icon: IconBase }> = {
  index: { icon: 'time' },
  ledger: { icon: 'wallet' },
  stats: { icon: 'stats-chart' },
  definitions: { icon: 'albums' },
  settings: { icon: 'settings' },
};

/** 选中用实心图标，未选中用描边图标 */
function iconName(base: IconBase, focused: boolean): IoniconName {
  return (focused ? base : `${base}-outline`) as IoniconName;
}

/**
 * 标签栏的「默认打开」不是 Expo Router 的静态 `initialRouteName` 能做到的：
 * 那个值来自 layout 文件里的 `unstable_settings`，读不到异步的 `app_meta`。
 *
 * 所以做法是：先按偏好渲染标签栏，再在**冷启动且初始路径是 `/`** 时用
 * `router.replace` 切到默认页。深链（例如直接打开 `/records/…`）一律不动。
 * 切换完成前盖一层背景，避免先闪一下时间轴再跳走。
 */
function TabsNavigator() {
  const { preferences, loading } = useNavigationPreferences();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  return <TabNavigator preferences={preferences} />;
}

/**
 * 和 `TabsNavigator` 拆开，是为了让「启动时默认页」只在偏好读完之后**取一次**：
 * 之后用户在设置里改默认页，不能把当前页盖住或立刻跳走。
 */
function TabNavigator({ preferences }: { preferences: NavigationPreferences }) {
  const router = useRouter();
  const pathname = usePathname();
  const [initialPathname] = useState(pathname);
  const [launchTarget] = useState(() => TAB_ROUTE_HREFS[preferences.defaultTab]);
  const appliedDefault = useRef(false);
  const [redirectExpired, setRedirectExpired] = useState(false);
  const covering = !redirectExpired && initialPathname === '/' && pathname !== launchTarget;

  useEffect(() => {
    if (appliedDefault.current) {
      return;
    }
    appliedDefault.current = true;
    if (initialPathname === '/' && pathname !== launchTarget) {
      router.replace(launchTarget);
    }
  }, [initialPathname, launchTarget, pathname, router]);

  // 兜底：极端情况下 replace 没有落地也不能一直盖着；正常路径用不到这一条
  useEffect(() => {
    if (!covering) {
      return;
    }
    const timer = setTimeout(() => setRedirectExpired(true), 2000);
    return () => clearTimeout(timer);
  }, [covering]);

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerShadowVisible: false,
          headerTitleStyle: { fontSize: 17, fontWeight: '600', color: palette.text },
          tabBarActiveTintColor: ACTIVE_COLOR,
          tabBarInactiveTintColor: INACTIVE_COLOR,
          tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        {preferences.order.map((route) => (
          <Tabs.Screen
            key={route}
            name={route}
            options={{
              title: TAB_ROUTE_LABELS[route],
              tabBarIcon: ({ size, focused }) => (
                <Ionicons
                  name={iconName(TAB_META[route].icon, focused)}
                  color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
                  size={size}
                />
              ),
            }}
          />
        ))}
      </Tabs>
      {covering ? (
        <View style={styles.cover}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <NavigationPreferencesProvider>
      <TabsNavigator />
    </NavigationPreferencesProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
});
