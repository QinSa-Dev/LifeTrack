/**
 * 事件记录的 CSV 导出（纯函数，不碰数据库与文件系统）。
 *
 * 定位：**给人看的快照**——用表格软件打开、做透视或核对数字都方便。
 * 因此：
 *
 * 1. **只导出，不导入**：CSV 没有主键与快照，无法无损往返；
 *    真正的备份/恢复走 JSON（`domain/backup.ts`），CSV 不参与合并。
 * 2. **一次导出只覆盖事件记录**：这是最常用的「事实数据」。
 *    定义 / 周期等配置类数据量小、结构嵌套，用 JSON 表达更合适。
 * 3. **表头用中文**：这是给用户看的文件；字段名与 JSON 里的英文键不同，
 *    是有意为之（JSON 给程序，CSV 给人）。
 * 4. **一律按 RFC 4180 转义**（含逗号 / 引号 / 换行的字段加引号、内部引号翻倍），
 *    行尾用 CRLF，并在开头加 BOM——否则 Excel 打开中文会乱码。
 */

import type { EventDefinitionKind, EventRecord, RecordSource } from '@/domain/models';

const SOURCE_LABELS: Record<RecordSource, string> = {
  manual: '手动',
  quick: '快捷',
  backfill: '补录',
};

const KIND_LABELS: Record<EventDefinitionKind, string> = {
  counter: '计数',
  quantity: '数量',
};

/** 分隔标签 / 分组名称时用竖线，避免与 CSV 的逗号语义打架 */
const LIST_SEPARATOR = ' | ';

export const RECORDS_CSV_HEADERS = [
  '发生时间',
  '录入时间',
  '来源',
  '事件',
  '类型',
  '取值',
  '单位',
  '分组',
  '标签',
  '备注',
  '状态',
  '删除时间',
  '记录ID',
] as const;

export interface RecordsCsvOptions {
  /** 标签 id → 名称；缺失时退回 id，保证信息不丢 */
  tagNameById?: ReadonlyMap<string, string>;
  /** 分组 id → 名称；缺失时退回 id */
  groupNameById?: ReadonlyMap<string, string>;
}

/** RFC 4180：含逗号、引号或换行的字段要加引号，内部引号翻倍。 */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 记录一行 CSV（不含表头 / BOM），导出顺序即传入顺序。 */
export function recordsToCsv(records: readonly EventRecord[], options: RecordsCsvOptions = {}): string {
  const lines = [RECORDS_CSV_HEADERS.map(escapeCsvField).join(',')];

  for (const record of records) {
    lines.push(
      [
        record.occurredAt,
        record.recordedAt,
        SOURCE_LABELS[record.source],
        record.snapshot.name,
        KIND_LABELS[record.kind],
        // 取值保留原始数字（不加「+」），方便表格软件直接求和
        String(record.value),
        record.unit ?? '',
        resolveIds(record.snapshot.groupId ? [record.snapshot.groupId] : [], options.groupNameById),
        resolveIds(record.snapshot.tagIds, options.tagNameById),
        record.note ?? '',
        record.deletedAt === undefined ? '有效' : '已删除',
        record.deletedAt ?? '',
        record.id,
      ]
        .map(escapeCsvField)
        .join(','),
    );
  }

  // CRLF + 末尾换行：Excel / Numbers 都能正确识别
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function resolveIds(ids: readonly string[], names?: ReadonlyMap<string, string>): string {
  return ids.map((id) => names?.get(id) ?? id).join(LIST_SEPARATOR);
}
