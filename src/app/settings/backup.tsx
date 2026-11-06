import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Header, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { BackupFile, ImportSummary } from '@/domain/backup';
import { toAppError } from '@/domain/errors';
import {
  exportBackupFile,
  exportRecordsCsv,
  isSharingAvailable,
  pickBackupFile,
} from '@/features/backup/transfer';
import { recordsToCsv } from '@/features/backup/csv';
import { useGoBack } from '@/features/common/useGoBack';
import { BackupRepository, EventGroupRepository, EventRecordRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

/** 把「新增 / 覆盖 / 保留」摆成一句人话 */
function describeSummary(summary: ImportSummary): string {
  const { added, updated, kept } = summary.totals;
  return `新增 ${added} 条、覆盖 ${updated} 条、保留本地 ${kept} 条`;
}

/** 备份与恢复：导出 JSON / CSV，或从备份文件合并导入。 */
export default function BackupScreen() {
  const goBack = useGoBack();
  const { db } = useReadyDatabase();
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

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
        `已导出 ${saved.name}（分组 ${counts.eventGroups.length} / ` +
          `事件定义 ${counts.eventDefinitions.length}（含周期型）/ 记录 ${counts.eventRecords.length} / ` +
          `周期实例 ${counts.cycleInstances.length} 段 / 每日记录 ${counts.cycleEntries.length} 条 / ` +
          `记账 ${counts.ledgerEntries.length} 条）`,
      );
    });
  }, [db, runBackupTask]);

  const handleExportCsv = useCallback(() => {
    return runBackupTask(async () => {
      const exportedAt = new Date().toISOString();
      const [records, groups] = await Promise.all([
        new EventRecordRepository(db).list({ includeDeleted: true }),
        new EventGroupRepository(db).list(),
      ]);

      const csv = recordsToCsv(records, {
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

  return (
    <Screen scroll header={<Header title="备份与恢复" onBack={goBack} />} contentStyle={styles.content}>
      <Card title="导出">
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
      </Card>

      <Card title="导入" style={styles.spaced}>
        <Button label="从备份导入（合并）" tone="secondary" onPress={handleImport} disabled={backupBusy} />
        <AppText variant="caption" color={palette.textMuted} style={styles.hint}>
          合并导入只新增或覆盖同 ID 的数据，本地独有的内容不会被删除。
        </AppText>
      </Card>

      {backupBusy || backupMessage ? (
        <Card style={styles.spaced}>
          <AppText variant="caption" color={palette.textMuted}>
            {backupBusy ? '处理中…' : backupMessage}
          </AppText>
        </Card>
      ) : null}
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
    `备份内容：定义 ${file.data.eventDefinitions.length} 个（含周期型）、记录 ${file.data.eventRecords.length} 条、` +
    `周期实例 ${file.data.cycleInstances.length} 段、记账 ${file.data.ledgerEntries.length} 条\n\n` +
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
  content: {
    paddingTop: spacing.md,
  },
  spaced: {
    marginTop: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
  },
  hint: {
    marginTop: spacing.sm,
  },
});
