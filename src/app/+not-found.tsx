import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button, EmptyState, Screen } from '@/components';
import { spacing } from '@/theme';

/** 兜底路由：任何未匹配的路径都会落到这里，而不是白屏。 */
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen scroll contentStyle={styles.content}>
      <EmptyState title="页面不存在" description="链接可能已失效，回时间轴看看" />
      <Button label="回到时间轴" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xxl,
  },
});
