import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Header, Screen } from '@/components';
import { useGoBack } from '@/features/common/useGoBack';
import { palette, spacing } from '@/theme';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" color={palette.textMuted} style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant="body" selectable style={styles.rowValue}>
        {value}
      </AppText>
    </View>
  );
}

/** 关于：版本与运行环境，纯展示。 */
export default function AboutScreen() {
  const goBack = useGoBack();

  const version = Constants.expoConfig?.version ?? '未知';
  const sdkVersion = Constants.expoConfig?.sdkVersion ?? '未知';
  const runtime = String(Constants.executionEnvironment ?? '未知');

  return (
    <Screen scroll header={<Header title="关于" onBack={goBack} />} contentStyle={styles.content}>
      <Card title="应用信息">
        <Row label="应用版本" value={version} />
        <Row label="Expo SDK" value={sdkVersion} />
        <Row label="运行环境" value={runtime} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowLabel: {
    marginBottom: 2,
  },
  rowValue: {
    color: palette.text,
  },
});
