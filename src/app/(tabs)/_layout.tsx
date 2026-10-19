import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { palette } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const ACTIVE_COLOR = palette.primary;
const INACTIVE_COLOR = palette.textMuted;

/** 选中用实心图标，未选中用描边图标 */
function iconName(base: 'time' | 'albums' | 'settings', focused: boolean): IoniconName {
  return (focused ? base : `${base}-outline`) as IoniconName;
}

export default function TabsLayout() {
  return (
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
      <Tabs.Screen
        name="index"
        options={{
          title: '时间轴',
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={iconName('time', focused)}
              color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="definitions"
        options={{
          title: '事件',
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={iconName('albums', focused)}
              color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={iconName('settings', focused)}
              color={focused ? ACTIVE_COLOR : INACTIVE_COLOR}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
