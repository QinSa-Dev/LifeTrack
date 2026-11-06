import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DatabaseGate } from '@/components/DatabaseGate';
import { DatabaseProvider } from '@/db';
import { NavigationPreferencesProvider } from '@/features/navigation/NavigationPreferencesProvider';
import { palette } from '@/theme';

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <StatusBar style="dark" />
      <DatabaseGate>
        {/*
          导航偏好放在根布局：标签栏要用它决定顺序，设置里的「偏好设置」二级页要改它。
          两者不在同一个导航器里，只有提到 Stack 外面才能共享同一份状态。
        */}
        <NavigationPreferencesProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.background },
            }}
          >
            <Stack.Screen name="(tabs)" />
          </Stack>
        </NavigationPreferencesProvider>
      </DatabaseGate>
    </DatabaseProvider>
  );
}
