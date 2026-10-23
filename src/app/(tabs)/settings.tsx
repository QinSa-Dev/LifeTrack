import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Chip, Screen } from '@/components';
import { META_KEYS, readSchemaVersion, useReadyDatabase, type MigrationResult } from '@/db';
import { toAppError } from '@/domain/errors';
import {
  exportBackupFile,
  exportRecordsCsv,
  isSharingAvailable,
  pickBackupFile,
} from '@/features/backup/transfer';
import { recordsToCsv } from '@/features/backup/csv';
import {
  DEFAULT_PREDICTION_WINDOW_SETTING,
  PREDICTION_WINDOW_OPTIONS,
  describePredictionWindow,
  parsePredictionWindow,
} from '@/features/cycles/predictionWindow';
import {
  DEFAULT_TIMELINE_VIEW_MODE,
  TIMELINE_VIEW_LABELS,
  parseTimelineViewMode,
  type TimelineViewMode,
} from '@/features/records/timelineView';
import type { BackupFile, ImportSummary } from '@/domain/backup';
import type { MetaEntry } from '@/repositories';
import {
  BackupRepository,
  EventGroupRepository,
  EventRecordRepository,
  MetaRepository,
  TagRepository,
} from '@/repositories';
import { palette, spacing } from '@/theme';

interface Diagnostics {
  loading: boolean;
  error: string | null;
  schemaVersion: number | null;
  migration: MigrationResult;
  databasePath: string;
  entries: MetaEntry[];
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" color={palette.textMuted} style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant={mono ? 'mono' : 'body'} selectable style={styles.rowValue}>
        {value}
      </AppText>
    </View>
  );
}

/** 把「新增 / 覆盖 / 保留」摆成一句人话 */
function describeSummary(summary: ImportSummary): string {
  const { added, updated, kept } = summary.totals;
  return `新增 ${added} 条、覆盖 ${updated} 条、保留本地 ${kept} 条`;
}

export default function SettingsScreen() {
  const { db, databasePath, migration } = useReadyDatabase();
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({
    loading: true,
    error: null,
    schemaVersion: null,
    migration,
    databasePath,
    entries: [],
  });
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  // 纯展示偏好：都存在 app_meta，改了只影响怎么看
  const [timelineView, setTimelineView] = useState<TimelineViewMode>(DEFAULT_TIMELINE_VIEW_MODE);
  const [predictionWindow, setPredictionWindow] = useState(DEFAULT_PREDICTION_WINDOW_SETTING);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const repository = new MetaRepository(db);

      Promise.all([
        readSchemaVersion(db),
        repository.getAll(),
        repository.get(META_KEYS.timelineView),
        repository.get(META_KEYS.predictionWindow),
      ])
        .then(([version, entries, storedView, storedWindow]) => {
          if (cancelled) {
            return;
          }
          setDiagnostics({
            loading: false,
            error: null,
            schemaVersion: version,
            migration,
            databasePath,
            entries,
          });
          setTimelineView(parseTimelineViewMode(storedView));
          setPredictionWindow(parsePredictionWindow(storedWindow));
        })
        .catch((cause: unknown) => {
          if (cancelled) {
            return;
          }
          setDiagnostics((previous) => ({
            ...previous,
            loading: false,
            error: cause instanceof Error ? cause.message : String(cause),
          }));
        });

      return () => {
        cancelled = true;
      };
    }, [db, databasePath, migration]),
  );

  /**
   * 改纯展示偏好：先改本地（界面立刻跟上），再落 app_meta；写失败只提示，不回滚显示
   * ——偏好没记住不影响任何数据。
   */
  const changeTimelineView = useCallback(
    (next: TimelineViewMode) => {
      setTimelineView(next);
      setPreferenceError(null);
      new MetaRepository(db).set(META_KEYS.timelineView, next).catch((cause: unknown) => {
        setPreferenceError(cause instanceof Error ? cause.message : String(cause));
      });
    },
    [db],
  );

  const changePredictionWindow = useCallback(
    (next: number) => {
      setPredictionWindow(next);
      setPreferenceError(null);
      new MetaRepository(db).set(META_KEYS.predictionWindow, String(next)).catch((cause: unknown) => {
        setPreferenceError(cause instanceof Error ? cause.message : String(cause));
      });
    },
    [db],
  );

  /** 导出 / 导入的共同外壳：忙碌标记 + 统一错误文案 */
  const runBackupTask = useCallback(async (task: () => Promise<void>) => {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      await task();
    } catch (cause) {
      const error = toAppError(cause, '备份操作失败');
      setBackupMessage(`失败：${error.message}`);
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const handleExportBackup = useCallback(() => {
    return runBackupTask(async () => {
      const backup = new BackupRepository(db);
      const exportedAt = new Date().toISOString();
      const file = await backup.exportAll(exportedAt, Constants.expoConfig?.version);
      const counts = file.data;

      if (!(await isSharingAvailable())) {
        setBackupMessage('当前环境不支持分享面板，导出已取消');
        return;
      }
      const saved = await exportBackupFile(file, exportedAt);
      setBackupMessage(
        `已导出 ${saved.name}（分组 ${counts.eventGroups.length} / 标签 ${counts.tags.length} / ` +
          `事件定义 ${counts.eventDefinitions.length} / 记录 ${counts.eventRecords.length} / ` +
          `周期 ${counts.cycleDefinitions.length} 个、实例 ${counts.cycleInstances.length} 段、` +
          `每日记录 ${counts.cycleEntries.length} 条）`,
      );
    });
  }, [db, runBackupTask]);

  const handleExportCsv = useCallback(() => {
    return runBackupTask(async () => {
      const exportedAt = new Date().toISOString();
      const [records, tags, groups] = await Promise.all([
        new EventRecordRepository(db).list({ includeDeleted: true }),
        new TagRepository(db).list(),
        new EventGroupRepository(db).list(),
      ]);

      const csv = recordsToCsv(records, {
        tagNameById: new Map(tags.map((tag) => [tag.id, tag.name])),
        groupNameById: new Map(groups.map((group) => [group.id, group.name])),
      });
      const saved = await exportRecordsCsv(csv, exportedAt);
      setBackupMessage(`已导出 ${saved.name}（${records.length} 条记录，含已软删除的）`);
    });
  }, [db, runBackupTask]);

  /** 选文件 → 预演 → 二次确认 → 合并导入 */
  const handleImport = useCallback(() => {
    return runBackupTask(async () => {
      const picked = await pickBackupFile();
      if (!picked) {
        setBackupMessage('已取消');
        return;
      }

      const backup = new BackupRepository(db);
      const summary = await backup.previewImport(picked.file);
      const confirmed = await confirmImport(picked.name, picked.file, summary);
      if (!confirmed) {
        setBackupMessage('已取消导入，本地数据未改动');
        return;
      }

      const applied = await backup.importAll(picked.file);
      setBackupMessage(`导入完成：${describeSummary(applied)}`);
    });
  }, [db, runBackupTask]);

  const version = Constants.expoConfig?.version ?? '未知';
  const sdkVersion = Constants.expoConfig?.sdkVersion ?? '未知';
  const runtime = String(Constants.executionEnvironment ?? '未知');
  const migrationSummary =
    diagnostics.migration.applied.length === 0
      ? `无（已是最新 v${diagnostics.migration.to}）`
      : `${diagnostics.migration.from} → ${diagnostics.migration.to}（应用 v${diagnostics.migration.applied.join(', v')}）`;

  return (
    <Screen scroll contentStyle={{ paddingTop: spacing.lg }}>
      <Card title="应用信息">
        <Row label="应用版本" value={version} />
        <Row label="Expo SDK" value={sdkVersion} />
        <Row label="运行环境" value={runtime} />
      </Card>

      <Card title="偏好设置" subtitle="只影响怎么看，不影响存了什么" style={styles.spaced}>
        <AppText variant="label" color={palette.textMuted}>
          时间轴显示
        </AppText>
        <View style={styles.chipRow}>
          {(['expanded', 'merged'] as const).map((mode) => (
            <Chip
              key={mode}
              label={TIMELINE_VIEW_LABELS[mode]}
              selected={timelineView === mode}
              onPress={() => changeTimelineView(mode)}
            />
          ))}
        </View>
        <AppText variant="caption" color={palette.textMuted} style={styles.chipHint}>
          逐条：一条记录一行；合并：同一事件并成一行，点行再就地展开逐条。
        </AppText>

        <AppText variant="label" color={palette.textMuted} style={styles.chipLabel}>
          周期预测窗口
        </AppText>
        <View style={styles.chipRow}>
          {PREDICTION_WINDOW_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={describePredictionWindow(option)}
              selected={predictionWindow === option}
              onPress={() => changePredictionWindow(option)}
            />
          ))}
        </View>
        <AppText variant="caption" color={palette.textMuted} style={styles.chipHint}>
          预测时只用最近这几段「实际间隔」取平均。窗口越小越贴合最近状态，也越容易被一次异常周期带偏。
        </AppText>

        {preferenceError ? (
          <AppText variant="caption" color={palette.danger} style={styles.chipHint}>
            偏好没能记住：{preferenceError}
          </AppText>
        ) : null}
      </Card>

      <Card
        title="备份与恢复"
        subtitle="导出 JSON 备份 / 记录表格；导入时按 id 合并，不删本地数据"
        style={styles.spaced}
      >
        <View style={styles.buttonRow}>
          <Button
            label="导出 JSON 备份"
            onPress={handleExportBackup}
            disabled={backupBusy}
            style={styles.button}
          />
          <Button
            label="导出记录 CSV"
            tone="secondary"
            onPress={handleExportCsv}
            disabled={backupBusy}
            style={styles.button}
          />
        </View>
        <Button
          label="从备份导入（合并）"
          tone="secondary"
          onPress={handleImport}
          disabled={backupBusy}
          style={styles.spacedSmall}
        />
        <AppText variant="caption" color={palette.textMuted} style={styles.spacedSmall}>
          {backupBusy
            ? '处理中…'
            : (backupMessage ??
              '导入只会「合并」：本地独有的数据一定保留。周期越界、引用缺失等非法备份会被整体拒绝，不会写进半截数据。')}
        </AppText>
      </Card>

      <Card title="本地数据库" subtitle="SQLite（expo-sqlite）" style={styles.spaced}>
        <View style={styles.badgeRow}>
          <Badge label="已连接" tone="success" />
          <Badge
            label={diagnostics.loading ? '读取中…' : `schema v${diagnostics.schemaVersion ?? '?'}`}
            tone="primary"
          />
        </View>
        <Row label="文件路径" value={diagnostics.databasePath} mono />
        <Row label="本次迁移" value={migrationSummary} />
        {diagnostics.error ? <Row label="读取错误" value={diagnostics.error} /> : null}
      </Card>

      <Card title="app_meta 表内容" subtitle="启动次数用于验证跨重启持久化" style={styles.spaced}>
        {diagnostics.entries.length === 0 ? (
          <AppText color={palette.textMuted}>暂无数据</AppText>
        ) : (
          diagnostics.entries.map((entry) => <Row key={entry.key} label={entry.key} value={entry.value} />)
        )}
      </Card>

      <Card title="数据安全约定" style={styles.spaced}>
        <AppText color={palette.textMuted}>
          迁移失败或版本高于应用支持时，LifeTrack
          会拒绝启动并保留原数据文件，不会删除或重建数据库。永久删除操作在此后阶段也会要求二次确认。
        </AppText>
      </Card>
    </Screen>
  );
}

/**
 * 导入前的二次确认。摘要先说清「会发生什么」，版本不符这一类问题已经在
 * `previewImport` 阶段被拒绝、根本走不到这里。
 */
function confirmImport(name: string, file: BackupFile, summary: ImportSummary): Promise<boolean> {
  const { added, updated, kept } = summary.totals;
  const message =
    `文件：${name}\n` +
    `备份时间：${file.exportedAt}（schema v${file.schemaVersion}）\n` +
    `备份内容：定义 ${file.data.eventDefinitions.length} 个、记录 ${file.data.eventRecords.length} 条、` +
    `周期 ${file.data.cycleDefinitions.length} 个\n\n` +
    `合并结果：新增 ${added} 条、覆盖 ${updated} 条、保留本地 ${kept} 条。\n` +
    '本地独有的数据不会被删除。';

  return new Promise((resolve) => {
    Alert.alert('确认导入并合并？', message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: '导入', onPress: () => resolve(true) },
    ]);
  });
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: spacing.md,
  },
  spacedSmall: {
    marginTop: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chipLabel: {
    marginTop: spacing.md,
  },
  chipHint: {
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowLabel: {
    marginBottom: 2,
  },
  rowValue: {
    color: palette.text,
  },
});
