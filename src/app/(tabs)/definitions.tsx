import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, EmptyState, ListRow, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventDefinition, EventGroup } from '@/domain/models';
import { eventKindLabel, describeDefinition } from '@/features/definitions/labels';
import { EventDefinitionRepository, EventGroupRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

export default function DefinitionsScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [definitions, setDefinitions] = useState<EventDefinition[]>([]);
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([
        new EventDefinitionRepository(db).list({ includeArchived: true }),
        new EventGroupRepository(db).list(),
      ])
        .then(([loadedDefinitions, loadedGroups]) => {
          if (cancelled) {
            return;
          }
          setDefinitions(loadedDefinitions);
          setGroups(loadedGroups);
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

  const openDefinition = (id: string) => {
    router.push({ pathname: '/events/[id]', params: { id } });
  };

  const renderRow = (definition: EventDefinition, muted = false) => (
    <ListRow
      key={definition.id}
      title={definition.name}
      subtitle={describeDefinition(definition.kind, definition.unit, groupName(definition.groupId))}
      onPress={() => openDefinition(definition.id)}
      right={
        <>
          {definition.quickOptions.length > 0 ? (
            <Badge label={`${definition.quickOptions.length} 个快捷`} tone="neutral" />
          ) : null}
          <Badge label={eventKindLabel(definition.kind)} tone={muted ? 'warning' : 'primary'} />
        </>
      }
    />
  );

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.actions}>
        <Button label="+ 新建事件" onPress={() => router.push('/events/new')} style={styles.grow} />
        <Button label="分组" tone="secondary" onPress={() => router.push('/groups')} />
        <Button label="标签" tone="secondary" onPress={() => router.push('/tags')} />
      </View>

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
          description="点上方「新建事件」定义你想记录的内容：计数型（如喝水 +1）或数量型（如里程）。"
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