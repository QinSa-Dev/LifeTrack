import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Card, ListRow, Screen } from '@/components';
import { palette, spacing } from '@/theme';

interface SettingsRowProps {
  title: string;
  subtitle: string;
  href: '/settings/preferences' | '/settings/backup' | '/settings/diagnostics' | '/settings/about';
  divider?: boolean;
}

/** 一条设置入口：标题 + 一句说明 + 右侧箭头，点进去再改具体项。 */
function SettingsRow({ title, subtitle, href, divider }: SettingsRowProps) {
  const router = useRouter();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      divider={divider}
      onPress={() => router.push(href)}
      right={<Ionicons name="chevron-forward" size={18} color={palette.textMuted} />}
    />
  );
}

/**
 * 设置首页：只列**分类入口**，具体选项都在各自的二级页里。
 *
 * 以前把显示偏好、导航顺序、备份、诊断全铺在一页上，滚半天才能到底；
 * 拆成条目后每页只做一件事，标签栏的「设置」也就回到一个清爽的目录。
 */
export default function SettingsScreen() {
  const version = Constants.expoConfig?.version ?? '未知';

  return (
    <Screen scroll edges={['left', 'right']} contentStyle={styles.content}>
      <Card>
        <SettingsRow
          title="偏好设置"
          subtitle="时间轴显示、周期预测窗口、底部导航"
          href="/settings/preferences"
        />
        <SettingsRow title="备份与恢复" subtitle="导出 JSON / CSV，从备份合并导入" href="/settings/backup" />
        <SettingsRow
          title="数据与诊断"
          subtitle="本地数据库状态、app_meta 内容"
          href="/settings/diagnostics"
        />
        <SettingsRow title="关于" subtitle={`LifeTrack v${version}`} href="/settings/about" divider={false} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
});
