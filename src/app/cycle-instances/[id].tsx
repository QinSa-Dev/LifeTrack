import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { META_KEYS, useReadyDatabase } from '@/db';
import { isValidIsoDate } from '@/domain/dates';
import {
  findDatesOutside,
  findOverlappingInstance,
  isOngoingInstance,
  predictNextCycle,
} from '@/domain/cycles';
import type { CycleEntry, CycleInstance, EventDefinition } from '@/domain/models';
import { localDateText } from '@/features/common/datetime';
import {
  buildMonthGrid,
  clampMonthToRange,
  indexEntriesByDate,
  monthIntersectsRange,
  monthLabel,
  shiftMonth,
} from '@/features/cycles/calendar';
import {
  COMMON_PHASES,
  describeInstanceRange,
  describeOverlap,
  describePrediction,
  joinSymptoms,
  splitSymptoms,
} from '@/features/cycles/labels';
import { DEFAULT_PREDICTION_WINDOW_SETTING, parsePredictionWindow } from '@/features/cycles/predictionWindow';
import { MonthCalendar } from '@/features/cycles/MonthCalendar';
import { UndoBar } from '@/features/records/UndoBar';
import {
  CycleEntryRepository,
  CycleInstanceRepository,
  EventDefinitionRepository,
  MetaRepository,
} from '@/repositories';
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
 * 四个关键交互都对应领域规则：
 * - 「保存边界」如果会让已有记录越界，仓储会拒绝，页面把原因原样显示（不会悄悄删记录）。
 * - 删除某一天的记录是**软删除**：页面立刻给一个「撤销」提示条，回收站里还能永久删除；
 *   只有「删除整段周期」是不可逆的永久删除，所以只有它需要 `Alert` 二次确认。
 * - 一天只有一条记录，所以「保存记录」在已有那天时是覆盖更新。
 * - 月视图（`MonthCalendar`）点一天与点列表行是**同一个入口**：都填进同一个表单。
 */
export default function CycleInstanceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  const [instance, setInstance] = useState<CycleInstance | null | undefined>(undefined);
  const [definition, setDefinition] = useState<EventDefinition | null>(null);
  const [entries, setEntries] = useState<CycleEntry[]>([]);
  // 同一定义的全部实例：预测要用「实际观察到的间隔」，只看当前这一段不够
  const [definitionInstances, setDefinitionInstances] = useState<CycleInstance[]>([]);
  // 预测窗口（最近几段实际间隔取平均）：全局偏好，存 app_meta
  const [predictionWindow, setPredictionWindow] = useState(DEFAULT_PREDICTION_WINDOW_SETTING);
  const [boundaryStart, setBoundaryStart] = useState('');
  const [boundaryEnd, setBoundaryEnd] = useState('');
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);
  // 月视图当前显示的月份（月初）；加载时按「今天」夹进周期区间
  const [month, setMonth] = useState('');
  const [boundaryBusy, setBoundaryBusy] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 最近一次被软删除的记录：有值时显示「撤销」提示条
  const [undoTarget, setUndoTarget] = useState<CycleEntry | null>(null);
  const [restoring, setRestoring] = useState(false);
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

        const [loadedDefinition, loadedEntries, loadedInstances, loadedWindow] = await Promise.all([
          new EventDefinitionRepository(db).getById(loaded.definitionId),
          new CycleEntryRepository(db).listByInstance(loaded.id),
          new CycleInstanceRepository(db).list({ definitionId: loaded.definitionId }),
          new MetaRepository(db).get(META_KEYS.predictionWindow),
        ]);
        if (cancelled) {
          return;
        }
        setDefinition(loadedDefinition);
        setEntries(loadedEntries);
        setDefinitionInstances(loadedInstances);
        setPredictionWindow(parsePredictionWindow(loadedWindow));
        const todayText = localDateText(new Date());
        // 表单的日期只在第一次填入时给默认值，之后不覆盖用户正在编辑的内容
        const defaultDate = clampDate(todayText, loaded.startDate, loaded.endDate);
        setForm((current) => (current.date === '' ? { ...current, date: defaultDate } : current));
        // 月视图默认停在「今天」所在的月（区间在将来 / 已结束就夹到那一头）
        setMonth((current) =>
          current === '' ? clampMonthToRange(todayText, loaded.startDate, loaded.endDate) : current,
        );
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
        // 边界缩走之后，月视图可能整个落在区间外（整月变灰）——把它拉回区间内
        setMonth((current) => clampMonthToRange(current, updated.startDate, updated.endDate));
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
        setMonth((current) => clampMonthToRange(current, updated.startDate, updated.endDate));
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

  /**
   * 点月视图里的一天：那天有记录就填进表单（等同于点列表行），
   * 没有记录就把表单的日期换成那天，等着填写。
   *
   * 为什么复用 `editEntry` / 同一个表单，而不是点开一个弹窗：
   * 保存、校验、软删除都只有一条路，「一天一条」这个约束在哪都成立。
   */
  const pickCalendarDate = (date: string) => {
    const existing = entries.find((entry) => entry.date === date);
    if (existing) {
      editEntry(existing);
      return;
    }
    setFlash(null);
    setError(null);
    setForm({ ...EMPTY_FORM, date });
  };

  /**
   * 删除某一天的记录：**软删除**（写 `deleted_at`），所以不需要二次确认，
   * 先删再给一个「撤销」入口更轻。真正不可逆的永久删除在回收站里，那边才二次确认。
   */
  const removeEntry = (entry: CycleEntry) => {
    setDeletingId(entry.id);
    setError(null);
    setFlash(null);
    new CycleEntryRepository(db)
      .softDelete(entry.id)
      .then(async (deleted) => {
        setUndoTarget(deleted);
        await reloadEntries(entry.instanceId);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setDeletingId(null);
      });
  };

  const undoRemoveEntry = () => {
    if (!undoTarget) {
      return;
    }
    setRestoring(true);
    setError(null);
    new CycleEntryRepository(db)
      .restore(undoTarget.id)
      .then(async (restored) => {
        setUndoTarget(null);
        await reloadEntries(restored.instanceId);
      })
      .catch((cause: unknown) => {
        // 恢复失败（例如期间边界已经缩走）时提示条留着，让用户能再试或去回收站
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setRestoring(false);
      });
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

  /**
   * 边界预演：按当前输入，哪些日期会落到区间外。
   *
   * 记录本来就在手上（`entries` 是这段周期的全部记录），所以**不必再查一次库**：
   * 直接用与仓储同一份纯函数规则 `findDatesOutside` 算，边打字边出结果，
   * 也就没有「异步结果回来晚了、显示成旧输入的结论」这类竞态。
   *
   * 输入还没填完整（不是合法日期、或结束日早于开始日）时不给结论——
   * 否则会显示成误导性的「全部记录都越界」。真正的把关仍在保存时由仓储执行。
   */
  const outsideDates = useMemo(() => {
    const start = boundaryStart.trim();
    const end = boundaryEnd.trim();
    if (!isValidIsoDate(start) || (end !== '' && (!isValidIsoDate(end) || end < start))) {
      return [];
    }
    return findDatesOutside(
      entries.map((entry) => entry.date),
      start,
      end === '' ? undefined : end,
    );
  }, [entries, boundaryStart, boundaryEnd]);

  /**
   * 边界预演的另一半：这个新区间会不会压到同一定义的**另一段**周期。
   *
   * 与越界一样，这里只是提前提示；真正的拒绝在保存时由仓储执行，
   * 两处用的是同一个 `findOverlappingInstance`，不会对不上。
   * `excludeId` 传当前这一段的 id——不然「不动边界」也会被判成和自己重叠。
   */
  const overlappingInstance = useMemo(() => {
    const start = boundaryStart.trim();
    const end = boundaryEnd.trim();
    if (!isValidIsoDate(start) || (end !== '' && (!isValidIsoDate(end) || end < start))) {
      return undefined;
    }
    return findOverlappingInstance(
      definitionInstances,
      { startDate: start, endDate: end === '' ? undefined : end },
      instance?.id,
    );
  }, [definitionInstances, boundaryStart, boundaryEnd, instance?.id]);

  // 月视图：哪几天有记录（标记）与这个月的格子。都是纯计算，随数据/月份变化重算。
  const marks = useMemo(() => indexEntriesByDate(entries), [entries]);
  const cells = useMemo(() => (month === '' ? [] : buildMonthGrid(month)), [month]);

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
  const prediction = definition
    ? predictNextCycle(definitionInstances, definition, predictionWindow)
    : undefined;

  // 月视图只在「这个月里还有落在区间内的日子」时才允许翻过去，
  // 否则会翻到一整屏都不能点的月份。
  const canShiftBack =
    month !== '' && monthIntersectsRange(shiftMonth(month, -1), instance.startDate, instance.endDate);
  const canShiftForward =
    month !== '' && monthIntersectsRange(shiftMonth(month, 1), instance.startDate, instance.endDate);
  const selectedDate = isValidIsoDate(form.date) ? form.date : undefined;

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
          hint="若新边界会把已有记录甩在外面，这里会立刻提示；保存也会被拒绝——不会悄悄删掉它们。"
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
        {outsideDates.length > 0 ? (
          <AppText variant="body" color={palette.warning} style={styles.spacedTop}>
            按这个边界，会有 {outsideDates.length} 条记录落在区间外（{outsideDates.join('、')}）：
            保存会被拒绝，这些记录不会被删除。
          </AppText>
        ) : null}
        {overlappingInstance ? (
          <AppText variant="body" color={palette.warning} style={styles.spacedTop}>
            {describeOverlap(overlappingInstance)}
          </AppText>
        ) : null}
        {prediction !== undefined ? (
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            {describePrediction(prediction)}
          </AppText>
        ) : null}
      </Card>

      <Card title="月视图" subtitle="点一天，就能把那一天填进下方的表单" style={styles.spaced}>
        {month === '' ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          <MonthCalendar
            label={monthLabel(month)}
            cells={cells}
            marks={marks}
            startDate={instance.startDate}
            endDate={instance.endDate}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={pickCalendarDate}
            onShiftMonth={(offset) => setMonth((current) => shiftMonth(current, offset))}
            canShiftBack={canShiftBack}
            canShiftForward={canShiftForward}
          />
        )}
        <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
          当前选中：{selectedDate ?? '（还没有填一个合法的日期）'}
        </AppText>
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
                      onPress={() => removeEntry(entry)}
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
            点某一行可以把那天填进下方表单；同一天再保存是覆盖更新。删除是软删除，可在「时间轴 →
            回收站」恢复或永久删除。
          </AppText>
        ) : null}
      </Card>

      {undoTarget ? (
        <UndoBar
          message={`已删除 ${undoTarget.date} 的记录（可在「时间轴 → 回收站」找回）`}
          onUndo={undoRemoveEntry}
          onDismiss={() => setUndoTarget(null)}
          busy={restoring}
        />
      ) : null}

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
