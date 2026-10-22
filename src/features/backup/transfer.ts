/**
 * 备份文件的实际读写与分享（唯一碰文件系统 / 系统选择器的地方）。
 *
 * 为什么单独一层：领域层只认字符串（`serializeBackup` / `parseBackup`），
 * 仓储层只认数据库；把「文件从哪来、到哪去」隔离在这里，界面就只剩按钮与提示。
 *
 * 三个原生模块都在 Expo Go 内置（SDK 58），不需要 development build：
 * - `expo-file-system`：新 API（`File` / `Paths`），同步的 `text()` / `write()`
 * - `expo-document-picker`：选文件导入
 * - `expo-sharing`：把导出的文件交给系统分享面板（存到「文件」/ 发给别人）
 *
 * 落点固定在 **缓存目录**：导出的文件只是中转，用户通过分享面板决定它的最终去处，
 * 不需要我们长期占有文档目录。
 */

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { BackupFile } from '@/domain/backup';
import { backupFileName, parseBackup, serializeBackup } from '@/domain/backup';
import { ImportError } from '@/domain/errors';
import type { IsoDateTime } from '@/domain/models';

export interface ExportedFile {
  name: string;
  uri: string;
}

/** 导出的文件类型：JSON 是备份，CSV 是给人看的表格。 */
const FILE_TYPES = {
  json: { mimeType: 'application/json', UTI: 'public.json' },
  csv: { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' },
} as const;

export async function isSharingAvailable(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

/**
 * 写进缓存目录再交给系统分享面板。
 * `overwrite: true` 让重复导出覆盖同名旧文件，而不是在缓存里越堆越多。
 */
async function writeAndShare(
  name: string,
  text: string,
  options: { mimeType: string; UTI: string; dialogTitle: string },
): Promise<ExportedFile> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(text);

  if (!(await Sharing.isAvailableAsync())) {
    // 分享面板不可用（少数环境）时不算失败：文件已经写好了，把路径告诉用户
    return { name, uri: file.uri };
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: options.mimeType,
    UTI: options.UTI,
    dialogTitle: options.dialogTitle,
  });
  return { name, uri: file.uri };
}

/** 导出完整备份（可再次导入恢复）：文件名与内容都由领域层决定。 */
export async function exportBackupFile(file: BackupFile, exportedAt: IsoDateTime): Promise<ExportedFile> {
  return writeAndShare(backupFileName(exportedAt, 'json'), serializeBackup(file), {
    ...FILE_TYPES.json,
    dialogTitle: '保存 LifeTrack 备份',
  });
}

/** 导出记录表格（只读、方便用表格软件查看，不参与导入）。 */
export async function exportRecordsCsv(csv: string, exportedAt: IsoDateTime): Promise<ExportedFile> {
  return writeAndShare(backupFileName(exportedAt, 'csv'), csv, {
    ...FILE_TYPES.csv,
    dialogTitle: '保存记录表格',
  });
}

/**
 * 让用户挑一个备份文件并解析。
 *
 * 类型过滤故意放宽到「任意类型」：iOS 上从各种云盘选来的 `.json` 有时被标成
 * `application/octet-stream`，严格过滤会让文件变灰选不中。宁可让用户选错，
 * 由 `parseBackup` 给出「不是 LifeTrack 备份文件」这种明确报错。
 */
export async function pickBackupFile(): Promise<{ name: string; file: BackupFile } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    // 必须为 true：否则 iOS 给的临时 URL 立刻失效，读不到内容
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets[0];
  if (!asset) {
    return null;
  }

  const picked = new File(asset.uri);
  if (!picked.exists) {
    throw new ImportError(`选中的文件读不到：${asset.name}`);
  }
  // 与 parseBackup 相同的入口：格式不对时抛带路径的 ImportError
  return { name: asset.name, file: parseBackup(await picked.text()) };
}
