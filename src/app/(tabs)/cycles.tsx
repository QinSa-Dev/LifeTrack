import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, EmptyState, ListRow, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { CycleDefinition, CycleInstance } from '@/domain/models';
import { describeCycleDefinition, describeLatestCycle } from '@/features/cycles/labels';
import { CycleDefinitionRepository, CycleInstanceRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

/**
 * 「周期」标签页：列出周期定义。
 *
 * 与「事件」页的区别：事件定义点进去是**记录**，周期定义点进去是**周期实例列表**
 * （一段段区间），再往里才是某一天的记录——所以这里是两级下钻。
 */
export default function CyclesScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [definitions, setDefinitions] = useState<CycleDefinition[]>([]);
  const [instances, setInstances] = useState<CycleInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([
        new CycleDefinitionRepository(db).list({ includeArchived: true }),
        new CycleInstanceRepository(db).list(),
      ])
        .then(([loadedDefinitions, loadedInstances]) => {
          if (cancelled) {
            return;
          }
          setDefinitions(loadedDefinitions);
          setInstances(loadedInstances);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  const active = definitions.filter((definition) => !definition.isArchived);
  const archived = definitions.filter((definition) => definition.isArchived);

  const renderRow = (definition: CycleDefinition, muted = false) => {
    const own = instances.filter((instance) => instance.definitionId === definition.id);
    return (
      <ListRow
        key={definition.id}
        title={definition.name}
        subtitle={`${describeCycleDefinition(definition)}　${describeLatestCycle(definition, own)}`}
        onPress={() => router.push({ pathname: '/cycles/[id]', params: { id: definition.id } })}
        right={<Badge label={muted ? '已归档' : `${own.length} 段`} tone={muted ? 'warning' : 'primary'} />}
      />
    );
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.actions}>
        <Button label="+ 新建周期定义" onPress={() => router.push('/cycles/new')} style={styles.grow} />
      </View>
      <AppText variant="caption" color={palette.textMuted} style={styles.hint}>
        周期定义代表一类周期（例如「生理期」）。点进去可以开一段新周期、记录每天的阶段与症状；
        同一周期里的两段区间不能重叠，改了边界也不会悄悄丢掉越界的记录。
      </AppText>

      {error ? (
        <Card title="读取失败" style={styles.spaced}>
          <AppText variant="body" color={palette.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : definitions.length === 0 ? (
        <EmptyState
          title="还没有周期定义"
          description="点上方「新建周期定义」创建一类周期，例如「生理期」，再录入一段段真实的周期。"
          footnote="平均周期长度只用于预测下次开始日；留空就不预测。"
        />
      ) : (
        <>
          <Card title="周期" subtitle={`${active.length} 个进行中`} style={styles.spaced}>
            {active.length === 0 ? (
              <AppText variant="body" color={palette.textMuted}>
                没有进行中的周期定义。
              </AppText>
            ) : (
              active.map((definition) => renderRow(definition))
            )}
          </Card>

          {archived.length > 0 ? (
            <Card title="已归档" subtitle={`${archived.length} 个`} style={styles.spaced}>
              {archived.map((definition) => renderRow(definition, true))}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  hint: {
    marginBottom: spacing.md,
  },
  grow: {
    flex: 1,
  },
  spaced: {
    marginTop: spacing.md,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
});
