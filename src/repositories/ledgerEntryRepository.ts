/**
 * 记账仓储（ledger_entries）。
 *
 * 规则很少，但都值得写清楚：
 * 1. **金额以「分」存整数**：累加不会出现浮点误差；界面输入「元」由
 *    `domain/money.ts` 转换，仓储只收整数分。
 * 2. **发生时间不能晚于录入时间**：与事件记录同一条规则（未来还没发生，不构成事实）。
 * 3. **读按发生时间倒序**；同一毫秒内的两条（连续点两下）用 id 兜底，
 *    UUID v7 是单调的，所以顺序仍然确定。
 * 4. **可以更正**：`update` 只改方向 / 金额 / 备注 / 标签，发生时间与录入时间不变。
 *    没有 `updated_at`，备份合并仍按「同 id 保留本地」处理（与事件记录一致）。
 * 5. **删除是真删**：记账没有快照、没有联动数据，一条记录就是一个事实；
 *    界面上有二次确认，删掉不会影响别的表。
 * 6. `list` 的时间范围下推到 SQL：按月看账时不必把全部记录读进内存。
 */

import { guard } from '@/db/guard';
import type { SqlExecutor, SqlParam } from '@/db/types';
import { NotFoundError, ValidationError } from '@/domain/errors';
import { newId } from '@/domain/id';
import { isLedgerKind, type IsoDateTime, type LedgerEntry, type LedgerKind } from '@/domain/models';
import {
  requireId,
  requireIsoDateTime,
  requireLedgerAmountCents,
  requireLedgerKind,
  requireLedgerNote,
  requireLedgerTag,
  requireNotFuture,
  type LedgerEntryEditInput,
  type LedgerEntryInput,
} from '@/domain/validation';

interface LedgerRow {
  id: string;
  kind: string;
  amount_cents: number;
  note: string | null;
  tag: string | null;
  occurred_at: string;
  recorded_at: string;
}

const SELECT_COLUMNS = 'id, kind, amount_cents, note, tag, occurred_at, recorded_at';

function toLedgerKind(value: unknown): LedgerKind {
  if (!isLedgerKind(value)) {
    throw new ValidationError(`记账方向字段不合法：${String(value)}`);
  }
  return value;
}

function toLedgerEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    kind: toLedgerKind(row.kind),
    amountCents: row.amount_cents,
    note: row.note ?? undefined,
    tag: row.tag ?? undefined,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
  };
}

export interface LedgerListRange {
  /** 含（ISO-8601） */
  from?: IsoDateTime;
  /** 不含（ISO-8601）：按月查时传下个月 1 号的本地零点对应的 UTC */
  until?: IsoDateTime;
}

export class LedgerEntryRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  /** 读一段时间内的账（发生时间倒序）。`from` / `until` 都是可选的。 */
  async list(range: LedgerListRange = {}): Promise<LedgerEntry[]> {
    return guard('读取记账记录', async () => {
      const clauses: string[] = [];
      const params: SqlParam[] = [];
      if (range.from !== undefined) {
        clauses.push('occurred_at >= ?');
        params.push(requireIsoDateTime(range.from, '起始时间'));
      }
      if (range.until !== undefined) {
        clauses.push('occurred_at < ?');
        params.push(requireIsoDateTime(range.until, '结束时间'));
      }
      if (
        range.from !== undefined &&
        range.until !== undefined &&
        Date.parse(range.until) <= Date.parse(range.from)
      ) {
        throw new ValidationError('结束时间必须晚于起始时间');
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await this.db.getAllAsync<LedgerRow>(
        `SELECT ${SELECT_COLUMNS} FROM ledger_entries ${where}
         ORDER BY occurred_at DESC, id DESC`,
        ...params,
      );
      return rows.map(toLedgerEntry);
    });
  }

  /** 导出备份用：不设时间范围。 */
  async listAll(): Promise<LedgerEntry[]> {
    return this.list();
  }

  /** 详情页按 id 读一笔；不存在返回 null（由页面显示「找不到」）。 */
  async getById(id: string): Promise<LedgerEntry | null> {
    const targetId = requireId(id, '记账 id');
    return guard('读取一笔账', async () => {
      const row = await this.db.getFirstAsync<LedgerRow>(
        `SELECT ${SELECT_COLUMNS} FROM ledger_entries WHERE id = ?`,
        targetId,
      );
      return row ? toLedgerEntry(row) : null;
    });
  }

  /**
   * 有记账数据的年份范围（给账单页的年份下拉）。
   * 用最早 / 最晚一条的发生时间换算成**本地年份**；没有数据时返回 null。
   */
  async yearBounds(): Promise<{ earliestYear: number; latestYear: number } | null> {
    return guard('读取记账年份范围', async () => {
      const row = await this.db.getFirstAsync<{ earliest: string | null; latest: string | null }>(
        'SELECT MIN(occurred_at) AS earliest, MAX(occurred_at) AS latest FROM ledger_entries',
      );
      if (!row?.earliest || !row.latest) {
        return null;
      }
      const earliestYear = new Date(row.earliest).getFullYear();
      const latestYear = new Date(row.latest).getFullYear();
      if (!Number.isInteger(earliestYear) || !Number.isInteger(latestYear)) {
        return null;
      }
      return {
        earliestYear: Math.min(earliestYear, latestYear),
        latestYear: Math.max(earliestYear, latestYear),
      };
    });
  }

  /**
   * 记一笔。`occurredAt` 省略就是「现在」；左滑复制也走这里，
   * 由调用方把发生时间设成当前时刻。
   */
  async create(input: LedgerEntryInput, now: IsoDateTime = new Date().toISOString()): Promise<LedgerEntry> {
    return guard('记录一笔账', async () => {
      const recordedAt = requireIsoDateTime(now, '录入时间');
      const occurredAt = requireNotFuture(
        requireIsoDateTime(input.occurredAt ?? recordedAt, '记账时间'),
        recordedAt,
        '记账时间',
      );
      const kind = requireLedgerKind(input.kind);
      const amountCents = requireLedgerAmountCents(input.amountCents);
      const note = requireLedgerNote(input.note);
      const tag = requireLedgerTag(input.tag);
      const id = newId();

      await this.db.runAsync(
        `INSERT INTO ledger_entries (id, kind, amount_cents, note, tag, occurred_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        kind,
        amountCents,
        note ?? null,
        tag ?? null,
        occurredAt,
        recordedAt,
      );

      return {
        id,
        kind,
        amountCents,
        note,
        tag,
        occurredAt,
        recordedAt,
      };
    });
  }

  /**
   * 更正一笔账：方向、金额、备注、标签整体替换。
   *
   * 发生时间 / 录入时间保持原样——改金额或备注不代表这笔钱换了发生时间。
   * 删除后再改会得到 `NotFoundError`；界面从列表进详情，正常不会撞上。
   */
  async update(id: string, input: LedgerEntryEditInput): Promise<LedgerEntry> {
    const targetId = requireId(id, '记账 id');
    const kind = requireLedgerKind(input.kind);
    const amountCents = requireLedgerAmountCents(input.amountCents);
    const note = requireLedgerNote(input.note);
    const tag = requireLedgerTag(input.tag);

    return guard('修改一笔账', async () => {
      const result = await this.db.runAsync(
        `UPDATE ledger_entries
         SET kind = ?, amount_cents = ?, note = ?, tag = ?
         WHERE id = ?`,
        kind,
        amountCents,
        note ?? null,
        tag ?? null,
        targetId,
      );
      if (result.changes === 0) {
        throw new NotFoundError(`找不到这笔账：${targetId}`);
      }
      return this.mustReadOne(targetId);
    });
  }

  /** 真删（界面负责二次确认）。 */
  async remove(id: string): Promise<void> {
    return guard('删除一笔账', async () => {
      const result = await this.db.runAsync('DELETE FROM ledger_entries WHERE id = ?', id);
      if (result.changes === 0) {
        throw new NotFoundError(`找不到这笔账：${id}`);
      }
    });
  }

  /** `update` 之后读回：刚才那行一定还在，否则说明并发删除，按未找到处理。 */
  private async mustReadOne(id: string): Promise<LedgerEntry> {
    const row = await this.db.getFirstAsync<LedgerRow>(
      `SELECT ${SELECT_COLUMNS} FROM ledger_entries WHERE id = ?`,
      id,
    );
    if (!row) {
      throw new NotFoundError(`找不到这笔账：${id}`);
    }
    return toLedgerEntry(row);
  }
}
