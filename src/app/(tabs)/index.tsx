import { Card, EmptyState, Screen } from '@/components';
import { AppText } from '@/components/AppText';
import { palette, spacing } from '@/theme';

export default function TimelineScreen() {
  return (
    <Screen scroll contentStyle={{ paddingTop: spacing.lg }}>
      <Card title="时间轴" subtitle="第一阶段：工程基线已就绪">
        <AppText>这里将按时间倒序展示所有事件记录，并支持按事件、标签、时间段筛选。</AppText>
        <AppText color={palette.textMuted} style={{ marginTop: spacing.sm }}>
          记录功能（counter / quantity / 补录 / 周期）属于第二阶段，尚未实现。
        </AppText>
      </Card>

      <EmptyState
        title="还没有任何记录"
        description="事件定义与记录功能将在第二阶段接入，届时这里会显示真实数据。"
        footnote="当前页面仅用于验证工程基线与底部导航。"
      />
    </Screen>
  );
}
