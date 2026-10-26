import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, EmptyState, Header, ListRow, Screen, TextField } from '@/components';
import { META_KEYS, useReadyDatabase } from '@/db';
import { addDays } from '@/domain/dates';
import { instanceLengthDays, latestInstance, nextAutoCycleSegment, predictNextCycle } from '@/domain/cycles';
import type { CycleEntry, CycleInstance, EventDefinition } from '@/domain/models';
import { EventDefinitionForm } from '@/features/definitions/EventDefinitionForm';
import {
  CYCLE_MODE_HINTS,
  describeAutoSegment,
  describeCycleDefinition,
  describePrediction,
} from '@/features/cycles/labels';
import { DEFAULT_PREDICTION_WINDOW_SETTING, parsePredictionWindow } from '@/features/cycles/predictionWindow';
import { SymptomStatsCard } from '@/features/cycles/SymptomStatsCard';
import { localDateText } from '@/features/common/datetime';
import {
  CycleEntryRepository,
  CycleInstanceRepository,
  EventDefinitionRepository,
  MetaRepository,
} from '@/repositories';
import { palette, spacing } from '@/theme';

function maxIsoDate(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * 周期型事件详情：定义本身 + 它的周期实例列表。
 *
 * 这里是「周期并入事件」之后周期功能的落点：从「事件」页点一个周期型事件就到这里，
 * 而不是再有一个独立的「周期」标签页。
 *
 * 两种做法各有一套入口：
 * - 手动标记：自己填开始日点「开始新周期」，结束在某一段里点；
 * - 自动循环：按配置好的规律算出下一段，点「生成这一段」把它落库
 *   （本轮只做「配置 + 生成下一段」，不做后台自动写库）。
 */
export default function CycleEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  // undefined = 加载中，null = 未找到
  const [definition, setDefinition] = useState<EventDefinition | null | undefined>(undefined);
  const [instances, setInstances] = useState<CycleInstance[]>([]);
  // 这个定义下全部的每日记录（症状统计用；仓储已过滤软删除）
  const [entries, setEntries] = useState<CycleEntry[]>([]);
  const [editing, setEditing] = useState(false);
  const [newStart, setNewStart] = useState('');
  // 预测窗口（最近几段实际间隔取平均）：全局偏好，存 app_meta
  const [predictionWindow, setPredictionWindow] = useState(DEFAULT_PREDICTION_WINDOW_SETTING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    Promise.all([
      new EventDefinitionRepository(db).getById(id),
      new CycleInstanceRepository(db).list({ definitionId: id }),
      new CycleEntryRepository(db).listVisible(id),
      new MetaRepository(db).get(META_KEYS.predictionWindow),
    ])
      .then(([loadedDefinition, loadedInstances, loadedEntries, loadedWindow]) => {
        if (cancelled) {
          return;
        }
        setDefinition(loadedDefinition);
        setInstances(loadedInstances);
        setEntries(loadedEntries);
        setPredictionWindow(parsePredictionWindow(loadedWindow));
        const latest = latestInstance(loadedInstances);
        const today = localDateText(new Date());
        setNewStart(latest?.endDate ? maxIsoDate(today, addDays(latest.endDate, 1)) : today);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setDefinition(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  useFocusEffect(load);

  if (definition === undefined) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator color={palette.primary} />
      </Screen>
    );
  }

  if (definition === null) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <Header title="周期" onBack={() => router.back()} />
        <EmptyState
          title="找不到这个周期事件"
          description="它可能已经被删除。"
          footnote={error ?? undefined}
        />
      </Screen>
    );
  }

  if (definition.kind !== 'cycle') {
    return (
      <Screen scroll contentStyle={styles.content}>
        <Header title={definition.name} onBack={() => router.back()} />
        <Card title="这不是周期型事件" style={styles.spaced}>
          <AppText variant="body" color={palette.textMuted}>
            这不是周期型事件，去记录页记一条。
          </AppText>
          <Button
            label="去记录页"
            onPress={() => router.replace({ pathname: '/record/[id]', params: { id: definition.id } })}
            style={styles.spacedTop}
          />
        </Card>
      </Screen>
    );
  }

  const today = localDateText(new Date());
  const ongoing = instances.find((instance) => instance.endDate === undefined);
  const prediction = predictNextCycle(instances, definition, predictionWindow);
  const autoSegment = nextAutoCycleSegment(instances, definition, today);
  const cycleMode = definition.cycleMode ?? 'manual';

  const toggleArchive = () => {
    if (busy) {
      return;
    }
    const next = !definition.isArchived;
    setBusy(true);
    setError(null);
    new EventDefinitionRepository(db)
      .setArchived(definition.id, next)
      .then(() => {
        setDefinition({ ...definition, isArchived: next });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const confirmDelete = () => {
    if (busy) {
      return;
    }
    Alert.alert(
      '永久删除周期事件',
      `「${definition.name}」及其 ${instances.length} 段周期、以及这些周期里的全部记录都会被永久删除。此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '永久删除',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setError(null);
            new EventDefinitionRepository(db)
              .remove(definition.id)
              .then(() => router.back())
              .catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : String(cause));
                setBusy(false);
              });
          },
        },
      ],
    );
  };

  const openInstance = (instance: CycleInstance) => {
    router.push({ pathname: '/cycle-instances/[id]', params: { id: instance.id } });
  };

  const startNewCycle = () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    new CycleInstanceRepository(db)
      .create({ definitionId: definition.id, startDate: newStart })
      .then(openInstance)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  /** 自动循环：「按规律生成下一段」——开始日与结束日一起给出，之后仍可手改。 */
  const generateNext = () => {
    if (busy || autoSegment === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    new CycleInstanceRepository(db)
      .create({
        definitionId: definition.id,
        startDate: autoSegment.startDate,
        endDate: autoSegment.endDate,
      })
      .then(openInstance)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header
        title={definition.name}
        onBack={() => router.back()}
        right={
          <Button
            label={editing ? '收起编辑' : '编辑定义'}
            tone="secondary"
            onPress={() => setEditing((value) => !value)}
          />
        }
      />

      {definition.isArchived ? (
        <Card title="已归档" style={styles.spaced}>
          <AppText variant="body" color={palette.warning}>
            已归档，不能再开新周期。已有的周期与记录不受影响。
          </AppText>
        </Card>
      ) : null}

      {error ? (
        <Card style={styles.spaced}>
          <AppText variant="body" color={palette.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}

      {editing ? (
        <View style={styles.spaced}>
          <EventDefinitionForm
            initial={definition}
            submitLabel="保存修改"
            onSubmit={async (draft) => {
              const updated = await new EventDefinitionRepository(db).update(definition.id, draft);
              setDefinition(updated);
              setEditing(false);
            }}
          />
        </View>
      ) : (
        <Card title="定义信息" style={styles.spaced}>
          <AppText variant="body">{describeCycleDefinition(definition)}</AppText>
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            {CYCLE_MODE_HINTS[cycleMode]}
          </AppText>
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            {describePrediction(prediction)}
          </AppText>
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            预测窗口在「设置」里改。
          </AppText>
        </Card>
      )}

      {cycleMode === 'auto' ? (
        <Card title="自动循环：生成下一段" subtitle="算出下一段，由你确认" style={styles.spaced}>
          <AppText variant="body" color={palette.textMuted}>
            {describeAutoSegment(autoSegment)}
          </AppText>
          <Button
            label={busy ? '处理中…' : '生成这一段'}
            onPress={generateNext}
            disabled={busy || autoSegment === undefined || ongoing !== undefined || definition.isArchived}
            style={styles.spacedTop}
          />
          {ongoing !== undefined ? (
            <AppText variant="caption" color={palette.warning} style={styles.spacedTop}>
              先结束进行中的这段。
            </AppText>
          ) : null}
        </Card>
      ) : null}

      <Card
        title="周期记录"
        subtitle={instances.length === 0 ? '还没有周期' : `共 ${instances.length} 段`}
        style={styles.spaced}
      >
        {instances.length === 0 ? (
          <AppText variant="caption" color={palette.textMuted}>
            还没有周期。在下方填入开始日。
          </AppText>
        ) : (
          instances.map((instance) => {
            const days = instanceLengthDays(instance, today);
            return (
              <ListRow
                key={instance.id}
                title={`${instance.startDate} ~ ${instance.endDate ?? '进行中'}`}
                subtitle={
                  instance.note ? `${days ?? ''} 天 · ${instance.note}` : days ? `共 ${days} 天` : undefined
                }
                onPress={() => openInstance(instance)}
                right={instance.endDate ? undefined : <Badge label="进行中" tone="success" />}
              />
            );
          })
        )}

        <View style={styles.spacedTop}>
          <TextField
            label="新周期开始日"
            value={newStart}
            onChangeText={setNewStart}
            placeholder="2026-10-19"
            autoCapitalize="none"
            autoCorrect={false}
            hint={ongoing ? '先结束进行中的这段。' : '两段区间不能重叠。'}
          />
          <Button
            label={busy ? '处理中…' : '开始新周期'}
            onPress={startNewCycle}
            disabled={busy || ongoing !== undefined || definition.isArchived}
          />
        </View>
      </Card>

      <View style={styles.spaced}>
        <SymptomStatsCard entries={entries} emptyHint="点开一段周期，在月视图上点一天就能记" />
      </View>

      <Card title="状态与删除" subtitle="归档可随时取消；永久删除需二次确认" style={styles.spaced}>
        <View style={styles.actions}>
          <Button
            label={definition.isArchived ? '取消归档' : '归档'}
            tone="secondary"
            onPress={toggleArchive}
            disabled={busy}
            style={styles.grow}
          />
          <Button
            label="永久删除"
            tone="danger"
            onPress={confirmDelete}
            disabled={busy}
            style={styles.grow}
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaced: {
    marginTop: spacing.md,
  },
  spacedTop: {
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
});
