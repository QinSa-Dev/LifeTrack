import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, EmptyState, ListRow, Screen } from '@/components';
import { META_KEYS, useReadyDatabase } from '@/db';
import type { CycleInstance, EventDefinition, EventGroup } from '@/domain/models';
import { describeCycleDefinition, describeLatestCycle } from '@/features/cycles/labels';
import { DEFAULT_PREDICTION_WINDOW_SETTING, parsePredictionWindow } from '@/features/cycles/predictionWindow';
import { eventKindLabel, describeDefinition } from '@/features/definitions/labels';
import {
  CycleInstanceRepository,
  EventDefinitionRepository,
  EventGroupRepository,
  MetaRepository,
} from '@/repositories';
import { palette, spacing } from '@/theme';

/**
 * 「事件」页：**计数型与周期型在同一张列表里**。
 *
 * 周期不是单独的一类东西，而是事件的一种类型，所以这里不再分两个标签页：
 * 点计数型进记录页（点一次记一次），点周期型进周期页（开一段、逐天记录）。
 */
export default function DefinitionsScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [definitions, setDefinitions] = useState<EventDefinition[]>([]);
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [instances, setInstances] = useState<CycleInstance[]>([]);
  // 预测窗口：全局偏好，存 app_meta；周期行副标题里的预测要用同一个窗口
  const [predictionWindow, setPredictionWindow] = useState(DEFAULT_PREDICTION_WINDOW_SETTING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([
        new EventDefinitionRepository(db).list({ includeArchived: true }),
        new EventGroupRepository(db).list(),
        new CycleInstanceRepository(db).list(),
        new MetaRepository(db).get(META_KEYS.predictionWindow),
      ])
        .then(([loadedDefinitions, loadedGroups, loadedInstances, loadedWindow]) => {
          if (cancelled) {
            return;
          }
          setDefinitions(loadedDefinitions);
          setGroups(loadedGroups);
          setInstances(loadedInstances);
          setPredictionWindow(parsePredictionWindow(loadedWindow));
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

  const groupName = (id?: string) => groups.find((group) => group.id === id)?.name;
  const active = definitions.filter((definition) => !definition.isArchived);
  const archived = definitions.filter((definition) => definition.isArchived);

  const open = (definition: EventDefinition) => {
    const pathname = definition.kind === 'cycle' ? '/cycles/[id]' : '/record/[id]';
    router.push({ pathname, params: { id: definition.id } });
  };

  const renderRow = (definition: EventDefinition, muted = false) => {
    const isCycle = definition.kind === 'cycle';
    const own = isCycle ? instances.filter((instance) => instance.definitionId === definition.id) : [];
    const subtitle = isCycle
      ? `${groupName(definition.groupId) ?? '未分组'} · ${describeCycleDefinition(definition)}　${describeLatestCycle(
          definition,
          own,
          predictionWindow,
        )}`
      : describeDefinition(definition.kind, definition.attributes, groupName(definition.groupId));

    return (
      <ListRow
        key={definition.id}
        title={definition.name}
        subtitle={subtitle}
        onPress={() => open(definition)}
        right={
          <>
            {!isCycle && definition.quickOptions.length > 0 ? (
              <Badge label={`${definition.quickOptions.length} 个快捷`} tone="neutral" />
            ) : null}
            {!isCycle && definition.fields.length > 0 ? (
              <Badge label={`${definition.fields.length} 个字段`} tone="neutral" />
            ) : null}
            {isCycle ? <Badge label={`${own.length} 段`} tone="neutral" /> : null}
            <Badge
              label={muted ? '已归档' : eventKindLabel(definition.kind)}
              tone={muted ? 'warning' : 'primary'}
            />
          </>
        }
      />
    );
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.actions}>
        <Button label="+ 新建事件" onPress={() => router.push('/events/new')} style={styles.grow} />
        <Button label="分组" tone="secondary" onPress={() => router.push('/groups')} />
      </View>
      <AppText variant="caption" color={palette.textMuted} style={styles.hint}>
        点按事件即可记录：计数型点一次记一次；周期型进内页开一段周期、逐天记录。
        在事件内页可编辑定义、归档或永久删除。
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
          title="尚未创建事件定义"
          description="点上方「新建事件」定义你想记录的内容：计数型（如喝水 +1、属性 200ml）或周期型（如生理期）。"
          footnote="归档只影响能否继续记录，不会删除任何历史。"
        />
      ) : (
        <>
          <Card title="事件" subtitle={`${active.length} 个进行中`} style={styles.spaced}>
            {active.length === 0 ? (
              <AppText variant="body" color={palette.textMuted}>
                没有进行中的事件。
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
