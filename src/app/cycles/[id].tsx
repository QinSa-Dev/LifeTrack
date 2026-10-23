import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, EmptyState, Header, ListRow, Screen, TextField } from '@/components';
import { META_KEYS, useReadyDatabase } from '@/db';
import { addDays } from '@/domain/dates';
import { instanceLengthDays, latestInstance, predictNextCycle } from '@/domain/cycles';
import type { CycleDefinition, CycleEntry, CycleInstance } from '@/domain/models';
import { CycleDefinitionForm } from '@/features/cycles/CycleDefinitionForm';
import { describeCycleDefinition, describePrediction } from '@/features/cycles/labels';
import { DEFAULT_PREDICTION_WINDOW_SETTING, parsePredictionWindow } from '@/features/cycles/predictionWindow';
import { SymptomStatsCard } from '@/features/cycles/SymptomStatsCard';
import { localDateText } from '@/features/common/datetime';
import {
  CycleDefinitionRepository,
  CycleEntryRepository,
  CycleInstanceRepository,
  MetaRepository,
} from '@/repositories';
import { palette, spacing } from '@/theme';

function maxIsoDate(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * 周期定义详情：定义本身 + 它的周期实例列表。
 *
 * 「开始新周期」的默认开始日会避开上一段周期的结束日（结束后一天），
 * 这样既不会和上一段重叠（仓储会拒绝重叠），也符合直觉。
 */
export default function CycleDefinitionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  // undefined = 加载中，null = 未找到
  const [definition, setDefinition] = useState<CycleDefinition | null | undefined>(undefined);
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
      new CycleDefinitionRepository(db).getById(id),
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
          title="找不到这个周期定义"
          description="它可能已经被删除。"
          footnote={error ?? undefined}
        />
      </Screen>
    );
  }

  const today = localDateText(new Date());
  const ongoing = instances.find((instance) => instance.endDate === undefined);
  const prediction = predictNextCycle(instances, definition, predictionWindow);

  const toggleArchive = () => {
    if (busy) {
      return;
    }
    const next = !definition.isArchived;
    setBusy(true);
    setError(null);
    new CycleDefinitionRepository(db)
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
      '永久删除周期定义',
      `「${definition.name}」及其 ${instances.length} 段周期、以及这些周期里的全部记录都会被永久删除。此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '永久删除',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setError(null);
            new CycleDefinitionRepository(db)
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

  const startNewCycle = () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    new CycleInstanceRepository(db)
      .create({ definitionId: definition.id, startDate: newStart })
      .then((created) => {
        router.push({ pathname: '/cycle-instances/[id]', params: { id: created.id } });
      })
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
            这个周期定义已归档，不能再开新周期。已有的周期与记录不受影响。
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
          <CycleDefinitionForm
            initial={definition}
            submitLabel="保存修改"
            onSubmit={async (input) => {
              const updated = await new CycleDefinitionRepository(db).update(definition.id, input);
              setDefinition(updated);
              setEditing(false);
            }}
          />
        </View>
      ) : (
        <Card title="定义信息" style={styles.spaced}>
          <AppText variant="body">{describeCycleDefinition(definition)}</AppText>
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            {describePrediction(prediction)}
          </AppText>
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            预测窗口在「设置 → 偏好设置」里统一改。
          </AppText>
        </Card>
      )}

      <Card
        title="周期记录"
        subtitle={instances.length === 0 ? '还没有周期' : `共 ${instances.length} 段`}
        style={styles.spaced}
      >
        {instances.length === 0 ? (
          <AppText variant="caption" color={palette.textMuted}>
            还没有周期。在下方填入开始日后点「开始新周期」。
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
                onPress={() =>
                  router.push({ pathname: '/cycle-instances/[id]', params: { id: instance.id } })
                }
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
            hint={
              ongoing
                ? '已有一段进行中的周期，先把它结束再开新的。'
                : '默认避开上一段周期的结束日；同一周期的两段区间不能重叠。'
            }
          />
          <Button
            label={busy ? '处理中…' : '开始新周期'}
            onPress={startNewCycle}
            disabled={busy || ongoing !== undefined || definition.isArchived}
          />
        </View>
      </Card>

      <View style={styles.spaced}>
        <SymptomStatsCard
          entries={entries}
          emptyHint="进入某一段周期，在月视图上点一天，就能记录那天的阶段与症状；记过之后这里会汇总。"
        />
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
