import {
  MAX_LEDGER_AMOUNT_CENTS,
  formatCents,
  parseAmountToCents,
  sanitizeAmountInput,
} from '@/domain/money';

describe('parseAmountToCents', () => {
  test('常见写法都能转成整数分', () => {
    expect(parseAmountToCents('3.6')).toBe(360);
    expect(parseAmountToCents('3.60')).toBe(360);
    expect(parseAmountToCents('3')).toBe(300);
    expect(parseAmountToCents('.5')).toBe(50);
    expect(parseAmountToCents('0.01')).toBe(1);
    expect(parseAmountToCents(' 12.34 ')).toBe(1234);
  });

  test('空串、多个小数点、超过两位小数与非数字都拒绝', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('.')).toBeNull();
    expect(parseAmountToCents('3.666')).toBeNull();
    expect(parseAmountToCents('3..6')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-3.6')).toBeNull();
    expect(parseAmountToCents('1,000')).toBeNull();
  });
});

describe('sanitizeAmountInput', () => {
  test('只留数字与第一个小数点，小数最多两位', () => {
    expect(sanitizeAmountInput(' ¥3.6 ')).toBe('3.6');
    expect(sanitizeAmountInput('3.6.7')).toBe('3.67');
    expect(sanitizeAmountInput('3.678')).toBe('3.67');
    expect(sanitizeAmountInput('abc')).toBe('');
    expect(sanitizeAmountInput('.5')).toBe('.5');
  });

  test('整数部分最多 9 位，挡住手滑输入一长串', () => {
    expect(sanitizeAmountInput('1234567890.12')).toBe('123456789.12');
    expect(parseAmountToCents('999999999.99')).toBe(MAX_LEDGER_AMOUNT_CENTS);
  });
});

describe('formatCents', () => {
  test('固定两位小数，负数保留符号', () => {
    expect(formatCents(360)).toBe('3.60');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(-1230)).toBe('-12.30');
  });
});
