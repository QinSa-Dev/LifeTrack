import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, EmptyState, ListRow, Screen } from '@/components';
import { META_KEYS, useReadyDatabase } from '@/db';
import type { CycleInstance, EventDefinition, EventGroup, EventRecord } from '@/domain/models';
import { describeCycleDefinition, describeLatestCycle } from '@/features/cycles/labels';
import { DEFAULT_PREDICTION_WINDOW_SETTING, parsePredictionWindow } from '@/features/cycles/predictionWindow';
import { describeDefinition, eventKindLabel } from '@/features/definitions/labels';
import { repeatDraft } from '@/features/records/repeat';
import {
  CycleInstanceRepository,
  EventDefinitionRepository,
  EventGroupRepository,
  EventRecordRepository,
  MetaRepository,
} from '@/repositories';
import { palette, spacing } from '@/theme';

/** 【+1】记完把结果贴在那一行里，2.5 秒后自己消失（不占整页顶部的位置）。 */
const FLASH_MS = 2500;

/** 一行的操作反馈：只给触发它的那一行看。 */
interface RowFlash {
  definitionId: string;
  text: string;
  tone: 'success' | 'danger';
}

/**
 * 「事件」页：**计数型与周期型在同一张列表里**。
 *
 * 周期不是单独的一类东西，而是事件的一种类型，所以这里不再分两个标签页：
 * 计数型可以直接在行内点【+1】记一条，也可以点进记录页填细节；
 * 周期型点进周期页（开一段、逐天记录）。
 */
export default function DefinitionsScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [definitions, setDefinitions] = useState<EventDefinition[]>([]);
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [instances, setInstances] = useState<CycleInstance[]>([]);
  /**
   * 每个定义**最近一条**记录。
   *
   * 【+1】要照抄它的取值 / 属性 / 字段，所以进页面时就备好，点下去不再临时查库。
   * 定义被删掉的历史记录不会出现在这里（按定义查，查不到就是没有）。
   */
  const [latestByDefinition, setLatestByDefinition] = useState<ReadonlyMap<string, EventRecord>>(new Map());
  // 预测窗口：全局偏好，存 app_meta；周期行副标题里的预测要用同一个窗口
  const [predictionWindow, setPredictionWindow] = useState(DEFAULT_PREDICTION_WINDOW_SETTING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 正在写库的那几行（按钮显示「+1…」并禁用，避免连点记成两条）
  const [recordingIds, setRecordingIds] = useState<readonly string[]>([]);
  const [flash, setFlash] = useState<RowFlash | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) {
        clearTimeout(flashTimer.current);
      }
    },
    [],
  );

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
        .then(async ([loadedDefinitions, loadedGroups, loadedInstances, loadedWindow]) => {
          if (cancelled) {
            return;
          }
          setDefinitions(loadedDefinitions);
          setGroups(loadedGroups);
          setInstances(loadedInstances);
          setPredictionWindow(parsePredictionWindow(loadedWindow));
          setError(null);

          // 「最近一条」逐定义各查一次（走 definition_id 索引 + LIMIT 1）。
          // 不读一大把记录再自己挑：那样定义一多，排在窗口外的老事件就拿不到自己的最近一条。
          const records = new EventRecordRepository(db);
          const latest = await Promise.all(
            loadedDefinitions.map(async (definition) => {
              const [record] = await records.list({ definitionId: definition.id, limit: 1 });
              return [definition.id, record] as const;
            }),
          );
          if (cancelled) {
            return;
          }
          setLatestByDefinition(
            new Map(latest.filter((entry): entry is [string, EventRecord] => entry[1] !== undefined)),
          );
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

  const showFlash = (definitionId: string, text: string, tone: RowFlash['tone']) => {
    setFlash({ definitionId, text, tone });
    if (flashTimer.current !== null) {
      clearTimeout(flashTimer.current);
    }
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  /**
   * 行内【+1】：照抄该事件**最近一条**记录的取值 / 属性 / 字段，来源记为「快捷」。
   *
   * 不弹确认、也不再给撤销入口——这一下就是「快」（与时间轴同一套取舍）：
   * 记错了进这条记录的详情页改或删。记完也**不整页重读**（事件页不展示记录），
   * 只把本地那份「最近一条」换成刚写的这条，连点两次的行为就与时间轴一致了。
   */
  const quickRecord = (definition: EventDefinition) => {
    setRecordingIds((current) => [...current, definition.id]);
    new EventRecordRepository(db)
      .record({
        definitionId: definition.id,
        ...repeatDraft(latestByDefinition.get(definition.id)),
        source: 'quick',
      })
      .then((created) => {
        setLatestByDefinition((current) => new Map(current).set(definition.id, created));
        showFlash(definition.id, `✓ 已记录 +${created.value}`, 'success');
      })
      .catch((cause: unknown) => {
        // 失败同样落在这一行里，不弹到整页顶端（否则点完看不到）
        showFlash(definition.id, cause instanceof Error ? cause.message : String(cause), 'danger');
      })
      .finally(() => {
        setRecordingIds((current) => current.filter((id) => id !== definition.id));
      });
  };

  const renderRow = (definition: EventDefinition, muted = false) => {
    const isCycle = definition.kind === 'cycle';
    const own = isCycle ? instances.filter((instance) => instance.definitionId === definition.id) : [];
    const group = groupName(definition.groupId);
    // 没分组就连分组这一段都不带，不写「未分组」（同 `describeDefinition`）
    const groupPrefix = group === undefined ? '' : `${group} · `;
    const subtitle = isCycle
      ? `${groupPrefix}${describeCycleDefinition(definition)}　${describeLatestCycle(
          definition,
          own,
          predictionWindow,
        )}`
      : describeDefinition(definition.kind, definition.attributes, group);
    // 只有「未归档的计数型」才点得动：归档后不能再新增记录，周期型本来就不是点一次记一次
    const canQuickRecord = !isCycle && !muted;
    const rowFlash = flash?.definitionId === definition.id ? flash : null;

    return (
      <ListRow
        key={definition.id}
        title={definition.name}
        subtitle={subtitle}
        onPress={() => open(definition)}
        right={
          <>
            {/* 反馈紧贴这一行；放在按钮左边，按钮本身不挪位，点完不会「跳」 */}
            {rowFlash ? (
              <Badge label={rowFlash.text} tone={rowFlash.tone === 'success' ? 'success' : 'danger'} />
            ) : null}
            {!isCycle && definition.quickOptions.length > 0 ? (
              <Badge label={`${definition.quickOptions.length} 个快捷`} tone="neutral" />
            ) : null}
            {!isCycle && definition.fields.length > 0 ? (
              <Badge label={`${definition.fields.length} 个字段`} tone="neutral" />
            ) : null}
            {isCycle ? <Badge label={`${own.length} 段`} tone="neutral" /> : null}
            {canQuickRecord ? (
              /*
                标签就叫「+1」，与时间轴那颗一致。一屏多颗同名按钮对读屏不算友好，
                但具体到「+1 喝水」这种名字会和 Maestro 的 `.*Maestro喝水.*` 选择器撞车
                （同一屏里两个元素都能匹配，`tapOn` 会报多匹配）——详见 `.maestro/README.md`。
              */
              <Button
                label={recordingIds.includes(definition.id) ? '+1…' : '+1'}
                tone="secondary"
                size="sm"
                onPress={() => quickRecord(definition)}
                disabled={recordingIds.includes(definition.id)}
              />
            ) : (
              // 计数型的类型说明由副标题（describeDefinition）负责，这里只留周期型与归档态
              <Badge
                label={muted ? '已归档' : eventKindLabel(definition.kind)}
                tone={muted ? 'warning' : 'primary'}
              />
            )}
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
        计数型点行内【+1】直接记一条（照抄最近一次的取值与属性），点行进内页可填细节；
        周期型点进内页开一段周期、逐天记录。在事件内页可编辑定义、归档或永久删除。
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
