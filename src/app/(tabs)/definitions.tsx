import { Card, EmptyState, Screen } from '@/components';
import { AppText } from '@/components/AppText';
import { palette, spacing } from '@/theme';

export default function DefinitionsScreen() {
  return (
    <Screen scroll contentStyle={{ paddingTop: spacing.lg }}>
      <Card title="事件定义" subtitle="第二阶段第一项">
        <AppText>计划支持：分组、标签、快捷选项，以及事件的归档管理。</AppText>
        <AppText color={palette.textMuted} style={{ marginTop: spacing.sm }}>
          归档只影响「能否继续记录」，不会删除任何历史记录。
        </AppText>
      </Card>

      <EmptyState
        title="尚未创建事件定义"
        description="事件定义的增删改查将在第二阶段实现；数据库 schema 会在那时以 v2 迁移追加。"
      />
    </Screen>
  );
}
