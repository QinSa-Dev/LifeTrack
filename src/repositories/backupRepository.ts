/**
 * 备份仓储（导出 / 导入）。SQL 只写在这里。
 *
 * 这一层只做三件事，规则本身在 `domain/backup.ts`（纯函数，可单测）：
 *
 * 1. **导出**：把七张业务表读成领域对象，交给 `createBackup` 打包。
 *    归档的定义、软删除的记录**都要导出**——否则「备份」就不是无损的。
 *    `app_meta`（安装时间 / 启动次数）是本机诊断信息，不进备份。
 * 2. **导入 = 合并**：先读本地现有数据，用纯函数算出「本地 ∪ 备份」的结果，
 *    再在**一个独占事务**里整体重写：清空 → 按依赖顺序写回 → 事务内体检 → 提交。
 *    任何一步失败都整体回滚，**不留半截数据**（对应错误码 `IMPORT`）。
 * 3. **体检**：写回后按表数一遍行数，并跑 `PRAGMA foreign_key_check`，
 *    数字对不上或外键有断裂就抛错回滚——避免「写成功了但数据是坏的」。
 *
 * 注意：**不要**在这个文件里调用其它仓储的写方法（它们自己也开事务，嵌套会失败）。
 * 读取可以复用其它仓储的 `list*`（只读、不开事务）。
 */

import { guard } from '@/db/guard';
import { LATEST_SCHEMA_VERSION } from '@/db/schema';
import type { SqlExecutor } from '@/db/types';
import {
  assertBackupCompatible,
  assertBackupIntegrity,
  createBackup,
  mergeBackup,
  type BackupData,
  type BackupFile,
  type ImportSummary,
} from '@/domain/backup';
import { ImportError } from '@/domain/errors';
import type { IsoDateTime } from '@/domain/models';

import { CycleDefinitionRepository } from './cycleDefinitionRepository';
import { CycleEntryRepository } from './cycleEntryRepository';
import { CycleInstanceRepository } from './cycleInstanceRepository';
import { EventDefinitionRepository } from './eventDefinitionRepository';
import { EventGroupRepository } from './eventGroupRepository';
import { EventRecordRepository } from './eventRecordRepository';
import { TagRepository } from './tagRepository';

/** 清空顺序：先子表后父表（外键 + CASCADE 之下顺序并不严格，但这样最直白）。 */
const DELETE_ORDER = [
  'cycle_entries',
  'cycle_instances',
  'cycle_definitions',
  'event_records',
  'event_definition_tags',
  'quick_options',
  'event_definitions',
  'tags',
  'event_groups',
] as const;

// 写入顺序是上面清空顺序的逆序：父表（分组 / 标签 / 定义 / 周期定义）先写，
// 子表（快捷选项 / 关联 / 记录 / 实例 / 周期记录）后写，`writeAll` 里逐表照着来。

export class BackupRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  /**
   * 读出全部业务数据（归档 / 软删除的记录都包含在内）。
   * 公开是因为「导出前的预览统计」也用它。
   */
  async readAll(): Promise<BackupData> {
    return guard('读取备份数据', async () => {
      const eventGroups = new EventGroupRepository(this.db);
      const tags = new TagRepository(this.db);
      const definitions = new EventDefinitionRepository(this.db);
      const records = new EventRecordRepository(this.db);
      const cycleDefinitions = new CycleDefinitionRepository(this.db);
      const cycleInstances = new CycleInstanceRepository(this.db);
      const cycleEntries = new CycleEntryRepository(this.db);

      const [groupList, tagList, definitionList, recordList, cycleDefinitionList, instanceList, entryList] =
        await Promise.all([
          eventGroups.list(),
          tags.list(),
          definitions.list({ includeArchived: true }),
          records.list({ includeDeleted: true }),
          cycleDefinitions.list({ includeArchived: true }),
          cycleInstances.list(),
          cycleEntries.listAll(),
        ]);

      return {
        eventGroups: groupList,
        tags: tagList,
        eventDefinitions: definitionList,
        eventRecords: recordList,
        cycleDefinitions: cycleDefinitionList,
        cycleInstances: instanceList,
        cycleEntries: entryList,
      };
    });
  }

  /** 打包成备份文件（纯函数负责排序与元信息）。 */
  async exportAll(now: IsoDateTime = new Date().toISOString(), appVersion?: string): Promise<BackupFile> {
    const data = await this.readAll();
    return createBackup(data, { schemaVersion: LATEST_SCHEMA_VERSION, exportedAt: now, appVersion });
  }

  /**
   * 导入（合并）：本地独有的数据一定保留，同 id 冲突按领域层的规则合并。
   * 返回各集合的「新增 / 覆盖 / 保留」计数，供界面展示。
   */
  async importAll(file: BackupFile): Promise<ImportSummary> {
    return guard('导入备份', async () => {
      const { data, summary } = await this.planImport(file);

      await this.db.withExclusiveTransactionAsync(async (txn) => {
        await this.clearAll(txn);
        await this.writeAll(txn, data);
        // 事务内体检：不通过就抛错 → 回滚，外部看到的是「什么都没发生」
        await assertConsistent(txn, data);
      });

      return summary;
    });
  }

  /**
   * 只读预演：真的导入会发生什么（校验 + 合并都跑一遍，但不写库）。
   * 界面可以在用户点「导入」之前先把「将新增 / 覆盖 / 保留」摆出来。
   */
  async previewImport(file: BackupFile): Promise<ImportSummary> {
    return guard('预演导入', async () => (await this.planImport(file)).summary);
  }

  /** 校验版本与完整性 → 读本地 → 合并。写库前的准备都在这一个地方。 */
  private async planImport(file: BackupFile): Promise<{ data: BackupData; summary: ImportSummary }> {
    assertBackupCompatible(file, LATEST_SCHEMA_VERSION);
    assertBackupIntegrity(file.data);

    const current = await this.readAll();
    return mergeBackup(current, file.data);
  }

  private async clearAll(txn: SqlExecutor): Promise<void> {
    for (const table of DELETE_ORDER) {
      await txn.runAsync(`DELETE FROM ${table}`);
    }
  }

  private async writeAll(txn: SqlExecutor, data: BackupData): Promise<void> {
    // 依赖顺序：分组 → 标签 → 事件定义（含快捷选项 / 标签关联）→ 事件记录
    //          → 周期定义 → 周期实例 → 周期记录
    for (const group of data.eventGroups) {
      await txn.runAsync(
        `INSERT INTO event_groups (id, name, color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        group.id,
        group.name,
        group.color ?? null,
        group.sortOrder,
        group.createdAt,
        group.updatedAt,
      );
    }

    for (const tag of data.tags) {
      await txn.runAsync(
        `INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        tag.id,
        tag.name,
        tag.color ?? null,
        tag.createdAt,
        tag.updatedAt,
      );
    }

    for (const definition of data.eventDefinitions) {
      await txn.runAsync(
        `INSERT INTO event_definitions
           (id, name, kind, unit, group_id, color, icon, is_archived, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        definition.id,
        definition.name,
        definition.kind,
        definition.unit ?? null,
        definition.groupId ?? null,
        definition.color ?? null,
        definition.icon ?? null,
        definition.isArchived ? 1 : 0,
        definition.sortOrder,
        definition.createdAt,
        definition.updatedAt,
      );
      for (const option of definition.quickOptions) {
        await txn.runAsync(
          `INSERT INTO quick_options (id, definition_id, label, value, unit, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          option.id,
          definition.id,
          option.label,
          option.value,
          option.unit ?? null,
          option.sortOrder,
        );
      }
      for (const tagId of definition.tagIds) {
        await txn.runAsync(
          'INSERT INTO event_definition_tags (definition_id, tag_id) VALUES (?, ?)',
          definition.id,
          tagId,
        );
      }
    }

    for (const record of data.eventRecords) {
      await txn.runAsync(
        `INSERT INTO event_records
           (id, definition_id, kind, value, unit, occurred_at, recorded_at, note, source, deleted_at,
            snapshot_name, snapshot_unit, snapshot_group_id, snapshot_tag_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.definitionId,
        record.kind,
        record.value,
        record.unit ?? null,
        record.occurredAt,
        record.recordedAt,
        record.note ?? null,
        record.source,
        record.deletedAt ?? null,
        record.snapshot.name,
        record.snapshot.unit ?? null,
        record.snapshot.groupId ?? null,
        JSON.stringify(record.snapshot.tagIds),
      );
    }

    for (const definition of data.cycleDefinitions) {
      await txn.runAsync(
        `INSERT INTO cycle_definitions
           (id, name, average_cycle_length_days, average_period_length_days, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        definition.id,
        definition.name,
        definition.averageCycleLengthDays ?? null,
        definition.averagePeriodLengthDays ?? null,
        definition.isArchived ? 1 : 0,
        definition.createdAt,
        definition.updatedAt,
      );
    }

    for (const instance of data.cycleInstances) {
      await txn.runAsync(
        `INSERT INTO cycle_instances (id, definition_id, start_date, end_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        instance.id,
        instance.definitionId,
        instance.startDate,
        instance.endDate ?? null,
        instance.note ?? null,
        instance.createdAt,
        instance.updatedAt,
      );
    }

    for (const entry of data.cycleEntries) {
      await txn.runAsync(
        `INSERT INTO cycle_entries (id, instance_id, date, phase, symptoms, feelings, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.id,
        entry.instanceId,
        entry.date,
        entry.phase ?? null,
        JSON.stringify(entry.symptoms),
        entry.feelings ?? null,
        entry.note ?? null,
        entry.createdAt,
        entry.updatedAt,
      );
    }
  }
}

/** 每张表在合并结果里应该有多少行（含由定义派生的两张子表）。 */
function expectedCounts(data: BackupData): readonly { table: string; expected: number }[] {
  const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
  return [
    { table: 'event_groups', expected: data.eventGroups.length },
    { table: 'tags', expected: data.tags.length },
    { table: 'event_definitions', expected: data.eventDefinitions.length },
    { table: 'quick_options', expected: sum(data.eventDefinitions.map((d) => d.quickOptions.length)) },
    { table: 'event_definition_tags', expected: sum(data.eventDefinitions.map((d) => d.tagIds.length)) },
    { table: 'event_records', expected: data.eventRecords.length },
    { table: 'cycle_definitions', expected: data.cycleDefinitions.length },
    { table: 'cycle_instances', expected: data.cycleInstances.length },
    { table: 'cycle_entries', expected: data.cycleEntries.length },
  ];
}

/**
 * 事务内的体检：行数对得上、外键没断裂。
 * 抛出即回滚，所以「导入失败」永远不会留下改了一半的数据。
 */
async function assertConsistent(txn: SqlExecutor, data: BackupData): Promise<void> {
  for (const { table, expected } of expectedCounts(data)) {
    const row = await txn.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    const actual = row?.count ?? -1;
    if (actual !== expected) {
      throw new ImportError(`导入后 ${table} 的行数是 ${actual}，与预期（${expected}）不一致，已回滚。`);
    }
  }

  let violations: readonly unknown[] | null = null;
  try {
    violations = await txn.getAllAsync<unknown>('PRAGMA foreign_key_check');
  } catch {
    // 引擎不支持该 PRAGMA 时跳过这一项；外键本身仍由 foreign_keys = ON 的约束兜底
    violations = null;
  }
  if (violations !== null && violations.length > 0) {
    throw new ImportError(`导入后检测到 ${violations.length} 处外键引用不一致，已回滚。`);
  }
}
