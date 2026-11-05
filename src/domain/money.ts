/**
 * 金额的解析与展示（纯函数，不碰 React、不碰数据库）。
 *
 * 存储一律是整数「分」，因为钱不能拿浮点数累加：
 * `0.1 + 0.2 !== 0.3`，记账累计几次之后就会出现「差一分」。
 * 界面输入的是元（例如 `3.6`），这里负责「元文本 ↔ 分」，
 * 并且**只做格式转换**，金额是否合法由 `domain/validation` 判断。
 */

/** 单笔金额上限：999,999,999.99 元。挡住手滑输入一长串数字。 */
export const MAX_LEDGER_AMOUNT_CENTS = 99_999_999_999;

/**
 * 把用户输入的「元」文本转成「分」。
 *
 * 接受 `3` / `3.6` / `3.60` / `.5`；空串、多个小数点、超过两位小数、
 * 非数字都返回 `null`（由调用方转成表单错误，不抛错）。
 */
export function parseAmountToCents(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d*(?:\.\d{0,2})?$/.test(trimmed)) {
    return null;
  }
  if (trimmed === '' || trimmed === '.') {
    return null;
  }

  const [yuanPart = '', fractionPart = ''] = trimmed.split('.');
  const yuan = yuanPart === '' ? 0 : Number(yuanPart);
  const cents = Number(fractionPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(yuan) || !Number.isSafeInteger(cents)) {
    return null;
  }
  const total = yuan * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * 输入框的即时清洗：只留数字与第一个小数点，小数最多两位。
 *
 * 这样「数字键盘」之外粘进来的内容（空格、`¥`、第二个点）不会让输入框变成
 * 一个怎么保存都失败的死局；真正的合法性仍由 `parseAmountToCents` 判断。
 */
export function sanitizeAmountInput(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, '');
  const [head = '', ...rest] = cleaned.split('.');
  const fraction = rest.join('').slice(0, 2);
  const integer = head.slice(0, 9);
  return rest.length > 0 ? `${integer}.${fraction}` : integer;
}

/** 分 → 元文本，固定两位小数（`360` → `3.60`）。 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}
