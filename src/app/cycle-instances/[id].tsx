import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Header,
  ListRow,
  Screen,
  TextField,
} from '@/components';
import { useReadyDatabase } from '@/db';
import { isOngoingInstance, predictNextCycleStart } from '@/domain/cycles';
import type { CycleDefinition, CycleEntry, CycleInstance } from '@/domain/models';
import { localDateText } from '@/features/common/datetime';
import { COMMON_PHASES, describeInstanceRange, joinSymptoms, splitSymptoms } from '@/features/cycles/labels';
import { CycleDefinitionRepository, CycleEntryRepository, CycleInstanceRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

interface EntryForm {
  date: string;
  phase: string;
  symptoms: string;
  feelings: string;
  note: string;
}

const EMPTY_FORM: EntryForm = { date: '', phase: '', symptoms: '', feelings: '', note: '' };

/** 把「今天」夹进周期区间：区间在将来就取开始日，已经结束就取结束日，否则就是今天。 */
function clampDate(date: string, startDate: string, endDate?: string): string {
  if (date < startDate) {
    return startDate;
  }
  if (endDate !== undefined && date > endDate) {
    return endDate;
  }
  return date;
}

/**
 * 周期实例详情：一段真实周期 + 它每天的记录。
 *
 * 三个关键交互都对应领域规则：
 * - 「保存边界」如果会让已有记录越界，仓储会拒绝，页面把原因原样显示（不会悄悄删记录）。
 * - 删除某一天的记录、删除整段周期都是**永久删除**，所以都有 `Alert` 二次确认。
 * - 一天只有一条记录，所以「保存记录」在已有那天时是覆盖更新。
 */
export default function CycleInstanceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  const [instance, setInstance] = useState<CycleInstance | null | undefined>(undefined);
  const [definition, setDefinition] = useState<CycleDefinition | null>(null);
  const [entries, setEntries] = useState<CycleEntry[]>([]);
  const [boundaryStart, setBoundaryStart] = useState('');
  const [boundaryEnd, setBoundaryEnd] = useState('');
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);
  const [boundaryBusy, setBoundaryBusy] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingInstance, setDeletingInstance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    new CycleInstanceRepository(db)
      .getById(id)
      .then(async (loaded) => {
        if (cancelled) {
          return;
        }
        setInstance(loaded);
        if (!loaded) {
          setDefinition(null);
          return;
        }
        setBoundaryStart(loaded.startDate);
        setBoundaryEnd(loaded.endDate ?? '');

        const [loadedDefinition, loadedEntries] = await Promise.all([
          new CycleDefinitionRepository(db).getById(loaded.definitionId),
          new CycleEntryRepository(db).listByInstance(loaded.id),
        ]);
        if (cancelled) {
          return;
        }
        setDefinition(loadedDefinition);
        setEntries(loadedEntries);
        // 表单的日期只在第一次填入时给默认值，之后不覆盖用户正在编辑的内容
        const defaultDate = clampDate(localDateText(new Date()), loaded.startDate, loaded.endDate);
        setForm((current) => (current.date === '' ? { ...current, date: defaultDate } : current));
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setInstance(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  useFocusEffect(load);

  const reloadEntries = async (instanceId: string) => {
    setEntries(await new CycleEntryRepository(db).listByInstance(instanceId));
  };

  const saveBoundary = () => {
    if (!instance || boundaryBusy) {
      return;
    }
    setBoundaryBusy(true);
    setError(null);
    setFlash(null);
    new CycleInstanceRepository(db)
      .update(instance.id, { startDate: boundaryStart, endDate: boundaryEnd, note: instance.note })
      .then((updated) => {
        setInstance(updated);
        setBoundaryStart(updated.startDate);
        setBoundaryEnd(updated.endDate ?? '');
        setFlash(`边界已更新：${updated.startDate} ~ ${updated.endDate ?? '进行中'}`);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBoundaryBusy(false);
      });
  };

  const endToday = () => {
    if (!instance || boundaryBusy) {
      return;
    }
    const today = localDateText(new Date());
    setBoundaryBusy(true);
    setError(null);
    setFlash(null);
    new CycleInstanceRepository(db)
      .endInstance(instance.id, today)
      .then((updated) => {
        setInstance(updated);
        setBoundaryEnd(updated.endDate ?? '');
        setFlash(`周期已结束于 ${updated.endDate}`);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBoundaryBusy(false);
      });
  };

  const saveEntry = () => {
    if (!instance || entryBusy) {
      return;
    }
    setEntryBusy(true);
    setError(null);
    setFlash(null);
    new CycleEntryRepository(db)
      .save(instance.id, {
        date: form.date,
        phase: form.phase,
        symptoms: splitSymptoms(form.symptoms),
        feelings: form.feelings,
        note: form.note,
      })
      .then(async (saved) => {
        setFlash(`已保存 ${saved.date} 的记录`);
        await reloadEntries(instance.id);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setEntryBusy(false);
      });
  };

  const editEntry = (entry: CycleEntry) => {
    setFlash(null);
    setError(null);
    setForm({
      date: entry.date,
      phase: entry.phase ?? '',
      symptoms: joinSymptoms(entry.symptoms),
      feelings: entry.feelings ?? '',
      note: entry.note ?? '',
    });
  };

  const confirmRemoveEntry = (entry: CycleEntry) => {
    Alert.alert('删除这天的记录', `${entry.date} 的记录将被永久删除。此操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setDeletingId(entry.id);
          setError(null);
          new CycleEntryRepository(db)
            .remove(entry.id)
            .then(async () => reloadEntries(entry.instanceId))
            .catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : String(cause));
            })
            .finally(() => {
              setDeletingId(null);
            });
        },
      },
    ]);
  };

  const confirmRemoveInstance = () => {
    if (!instance || deletingInstance) {
      return;
    }
    Alert.alert(
      '永久删除这段周期',
      `这段周期（${instance.startDate} ~ ${instance.endDate ?? '进行中'}）及其 ${entries.length} 条记录都会被永久删除。此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '永久删除',
          style: 'destructive',
          onPress: () => {
            setDeletingInstance(true);
            setError(null);
            new CycleInstanceRepository(db)
              .remove(instance.id)
              .then(() => router.back())
              .catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : String(cause));
                setDeletingInstance(false);
              });
          },
        },
      ],
    );
  };

  if (instance === undefined) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator color={palette.primary} />
      </Screen>
    );
  }

  if (instance === null) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <Header title="周期记录" onBack={() => router.back()} />
        <EmptyState title="找不到这段周期" description="它可能已经被删除。" footnote={error ?? undefined} />
      </Screen>
    );
  }

  const today = localDateText(new Date());
  const ongoing = isOngoingInstance(instance);
  const predicted = definition ? predictNextCycleStart(instance, definition) : undefined;

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header
        title={definition?.name ?? '周期记录'}
        onBack={() => router.back()}
        right={ongoing ? <Badge label="进行中" tone="success" /> : undefined}
      />

      {flash ? (
        <Card style={styles.spaced}>
          <AppText variant="body" color={palette.success}>
            {flash}
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

      <Card title="周期区间" subtitle={describeInstanceRange(instance, today)} style={styles.spaced}>
        <TextField
          label="开始日期"
          value={boundaryStart}
          onChangeText={setBoundaryStart}
          placeholder="2026-10-01"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="结束日期（留空表示进行中）"
          value={boundaryEnd}
          onChangeText={setBoundaryEnd}
          placeholder="2026-10-05"
          autoCapitalize="none"
          autoCorrect={false}
          hint="若新边界会把已有记录甩在外面，会拒绝保存并列出那些日期——不会悄悄删掉它们。"
        />
        <View style={styles.actions}>
          <Button
            label={boundaryBusy ? '保存中…' : '保存边界'}
            onPress={saveBoundary}
            disabled={boundaryBusy}
            style={styles.grow}
          />
          {ongoing ? (
            <Button
              label="结束于今天"
              tone="secondary"
              onPress={endToday}
              disabled={boundaryBusy}
              style={styles.grow}
            />
          ) : null}
        </View>
        {predicted !== undefined ? (
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            预测下次开始日：{predicted}
          </AppText>
        ) : null}
      </Card>

      <Card title="每日记录" subtitle={`${entries.length} 条`} style={styles.spaced}>
        {entries.length === 0 ? (
          <AppText variant="caption" color={palette.textMuted}>
            还没有记录。在下方选一天、填阶段与症状即可。
          </AppText>
        ) : (
          entries.map((entry) => {
            const details = [entry.phase, entry.symptoms.join('、'), entry.feelings, entry.note].filter(
              (part): part is string => Boolean(part && part.length > 0),
            );
            return (
              <ListRow
                key={entry.id}
                title={entry.date}
                subtitle={details.length > 0 ? details.join(' · ') : '（无内容）'}
                onPress={() => editEntry(entry)}
                right={
                  <>
                    {entry.phase ? <Badge label={entry.phase} tone="primary" /> : null}
                    <Button
                      label={deletingId === entry.id ? '删除中…' : '删除'}
                      tone="danger"
                      size="sm"
                      onPress={() => confirmRemoveEntry(entry)}
                      disabled={deletingId === entry.id}
                    />
                  </>
                }
              />
            );
          })
        )}
        {entries.length > 0 ? (
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            点某一行可以把那天填进下方表单；同一天再保存是覆盖更新。
          </AppText>
        ) : null}
      </Card>

      <Card title="添加 / 编辑记录" subtitle="一天一条，重复保存即覆盖" style={styles.spaced}>
        <TextField
          label="日期"
          value={form.date}
          onChangeText={(text) => setForm((current) => ({ ...current, date: text }))}
          placeholder="2026-10-01"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <AppText variant="label" color={palette.textMuted} style={styles.fieldLabel}>
          阶段（可选）
        </AppText>
        <View style={styles.chipRow}>
          <Chip
            label="无"
            selected={form.phase.trim().length === 0}
            onPress={() => setForm((current) => ({ ...current, phase: '' }))}
          />
          {COMMON_PHASES.map((phase) => (
            <Chip
              key={phase}
              label={phase}
              selected={form.phase === phase}
              onPress={() => setForm((current) => ({ ...current, phase }))}
            />
          ))}
        </View>
        <TextField
          label="阶段（也可自己填）"
          value={form.phase}
          onChangeText={(text) => setForm((current) => ({ ...current, phase: text }))}
          placeholder="例如：经期"
        />

        <TextField
          label="症状（可选）"
          value={form.symptoms}
          onChangeText={(text) => setForm((current) => ({ ...current, symptoms: text }))}
          placeholder="用逗号分隔，例如：头痛、乏力"
        />
        <TextField
          label="感受（可选）"
          value={form.feelings}
          onChangeText={(text) => setForm((current) => ({ ...current, feelings: text }))}
          placeholder="例如：有点累"
        />
        <TextField
          label="备注（可选）"
          value={form.note}
          onChangeText={(text) => setForm((current) => ({ ...current, note: text }))}
          multiline
        />

        <Button label={entryBusy ? '保存中…' : '保存记录'} onPress={saveEntry} disabled={entryBusy} />
      </Card>

      <Card title="删除这段周期" subtitle="永久删除，需二次确认" style={styles.spaced}>
        <Button
          label={deletingInstance ? '删除中…' : '永久删除这段周期'}
          tone="danger"
          onPress={confirmRemoveInstance}
          disabled={deletingInstance}
        />
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
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
});
