/**
 * 记账的展示与汇总（纯函数）。
 *
 * 金额在库里是整数「分」，这里只负责把它说成人话；真正的转换在 `domain/money.ts`。
 */

import { formatCents } from '@/domain/money';
import type { LedgerEntry, LedgerKind } from '@/domain/models';
import { localDateText, localTimeText } from '@/features/common/datetime';

export interface LedgerTotals {
  /** 支出合计（分） */
  expenseCents: number;
  /** 收入合计（分） */
  incomeCents: number;
  /** 结余 = 收入 − 支出（分，可以为负） */
  balanceCents: number;
}

/** 一行右侧的金额：支出带 `-`，收入带 `+`，都固定两位小数。 */
export function formatLedgerAmount(kind: LedgerKind, amountCents: number): string {
  return `${kind === 'expense' ? '-' : '+'}¥${formatCents(amountCents)}`;
}

/** 汇总用的金额：允许负结余，负号放在货币符号前面（`-¥12.30`）。 */
export function formatLedgerTotal(cents: number): string {
  return cents < 0 ? `-¥${formatCents(-cents)}` : `¥${formatCents(cents)}`;
}

/** 列表一行的时间：设备本地 `HH:mm`（日期已经由分组标题说清）。 */
export function formatLedgerTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return localTimeText(date);
}

export interface LedgerDayGroup {
  /** 设备本地 `YYYY-MM-DD`，同时用作分组标题与 React key */
  date: string;
  entries: LedgerEntry[];
}

/**
 * 把按时间倒序的记录按**设备本地日期**分组。
 *
 * 只做分组、不重新排序：仓储已经按 `occurred_at DESC` 排好，
 * 同一天内保持原顺序（同一毫秒的连续记录也不会被打乱）。
 * 日期用本地时区算，否则东八区凌晨的记录会被分到前一天。
 */
export function groupLedgerEntriesByDay(entries: readonly LedgerEntry[]): LedgerDayGroup[] {
  const groups = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const date = new Date(entry.occurredAt);
    // 非法时间不入库，但纯函数仍要不崩：原样当分组键。
    const key = Number.isNaN(date.getTime()) ? entry.occurredAt : localDateText(date);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return Array.from(groups, ([date, dayEntries]) => ({ date, entries: dayEntries }));
}

/** 没有备注时用方向当标题，列表不会出现一行空白。 */
export function ledgerEntryTitle(entry: Pick<LedgerEntry, 'kind' | 'note'>): string {
  return entry.note ?? (entry.kind === 'expense' ? '支出' : '收入');
}

/** 当月合计：只加总传进来的记录（调用方负责只给这个月的可见记录）。 */
export function summarizeLedger(entries: readonly Pick<LedgerEntry, 'kind' | 'amountCents'>[]): LedgerTotals {
  let expenseCents = 0;
  let incomeCents = 0;
  for (const entry of entries) {
    if (entry.kind === 'expense') {
      expenseCents += entry.amountCents;
    } else {
      incomeCents += entry.amountCents;
    }
  }
  return { expenseCents, incomeCents, balanceCents: incomeCents - expenseCents };
}

/** 删除确认里说清删的是哪一笔。 */
export function describeLedgerEntry(entry: LedgerEntry): string {
  return `${formatLedgerAmount(entry.kind, entry.amountCents)} · ${ledgerEntryTitle(entry)}`;
}
