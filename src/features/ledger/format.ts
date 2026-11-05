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

/** 列表一行的时间：设备本地 `MM-DD HH:mm`。 */
export function formatLedgerTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${localDateText(date).slice(5)} ${localTimeText(date)}`;
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
