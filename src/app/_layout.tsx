import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DatabaseGate } from '@/components/DatabaseGate';
import { DatabaseProvider } from '@/db';
import { palette } from '@/theme';

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <StatusBar style="dark" />
      <DatabaseGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
        </Stack>
      </DatabaseGate>
    </DatabaseProvider>
  );
}
