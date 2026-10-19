import { ValidationError } from '@/domain/errors';
import {
  normalizeIdList,
  optionalText,
  requireId,
  requireIsoDateTime,
  requireKind,
  requireName,
  requireQuickOptionValue,
  requireRecordSource,
  requireRecordValue,
  requireSortOrder,
} from '@/domain/validation';

describe('校验与规整规则', () => {
  describe('requireName', () => {
    it('去首尾空白', () => {
      expect(requireName('  喝水  ')).toBe('喝水');
    });

    it('空串 / 纯空白抛 ValidationError，并带上字段名', () => {
      expect(() => requireName('', '分组名称')).toThrow(ValidationError);
      expect(() => requireName('   ', '分组名称')).toThrow(/分组名称/);
    });

    it('不因为「0」这类字符串而误判', () => {
      expect(requireName('0')).toBe('0');
    });
  });

  describe('optionalText', () => {
    it('undefined / null / 空白都归一为 undefined', () => {
      expect(optionalText(undefined)).toBeUndefined();
      expect(optionalText(null)).toBeUndefined();
      expect(optionalText('   ')).toBeUndefined();
    });

    it('有内容时去空白返回', () => {
      expect(optionalText('  杯 ')).toBe('杯');
    });
  });

  describe('requireKind', () => {
    it('接受 counter / quantity', () => {
      expect(requireKind('counter')).toBe('counter');
      expect(requireKind('quantity')).toBe('quantity');
    });

    it('拒绝其它值', () => {
      expect(() => requireKind('count')).toThrow(ValidationError);
      expect(() => requireKind(1)).toThrow(ValidationError);
    });
  });

  describe('requireSortOrder', () => {
    it('整数（含 0 与负数）通过', () => {
      expect(requireSortOrder(0)).toBe(0);
      expect(requireSortOrder(-1)).toBe(-1);
    });

    it('小数拒绝', () => {
      expect(() => requireSortOrder(1.5)).toThrow(ValidationError);
    });
  });

  describe('requireQuickOptionValue', () => {
    it('计数型只接受正整数', () => {
      expect(requireQuickOptionValue('counter', 1)).toBe(1);
      expect(() => requireQuickOptionValue('counter', 0.5)).toThrow(ValidationError);
      expect(() => requireQuickOptionValue('counter', 0)).toThrow(ValidationError);
    });

    it('数量型接受正小数', () => {
      expect(requireQuickOptionValue('quantity', 0.5)).toBe(0.5);
      expect(() => requireQuickOptionValue('quantity', -0.5)).toThrow(ValidationError);
    });

    it('非数字拒绝', () => {
      expect(() => requireQuickOptionValue('counter', Number.NaN)).toThrow(ValidationError);
      expect(() => requireQuickOptionValue('counter', Number.POSITIVE_INFINITY)).toThrow(ValidationError);
    });
  });

  describe('normalizeIdList', () => {
    it('去空、去重、保持顺序', () => {
      expect(normalizeIdList(['b', 'a', 'b', '  ', 'c'])).toEqual(['b', 'a', 'c']);
    });
  });

  describe('requireId', () => {
    it('去空白后非空通过', () => {
      expect(requireId('  abc  ')).toBe('abc');
    });

    it('空串抛 ValidationError 并带字段名', () => {
      expect(() => requireId('  ', '事件定义 id')).toThrow(/事件定义 id/);
    });
  });

  describe('requireRecordSource', () => {
    it('接受 manual / quick / backfill', () => {
      expect(requireRecordSource('manual')).toBe('manual');
      expect(requireRecordSource('quick')).toBe('quick');
      expect(requireRecordSource('backfill')).toBe('backfill');
    });

    it('拒绝其它值', () => {
      expect(() => requireRecordSource('auto')).toThrow(ValidationError);
    });
  });

  describe('requireIsoDateTime', () => {
    it('接受带 Z 或带偏移的时间戳', () => {
      expect(requireIsoDateTime('2026-10-19T08:00:00.000Z')).toBe('2026-10-19T08:00:00.000Z');
      expect(requireIsoDateTime('2026-10-19T08:00:00+08:00')).toBe('2026-10-19T08:00:00+08:00');
    });

    it('拒绝不合法的字符串', () => {
      expect(() => requireIsoDateTime('昨天')).toThrow(ValidationError);
      expect(() => requireIsoDateTime('2026-10-19')).toThrow(ValidationError);
    });
  });

  describe('requireRecordValue', () => {
    it('计数型要求正整数', () => {
      expect(requireRecordValue('counter', 2)).toBe(2);
      expect(() => requireRecordValue('counter', 0.5)).toThrow(ValidationError);
    });

    it('数量型允许正小数', () => {
      expect(requireRecordValue('quantity', 0.5)).toBe(0.5);
      expect(() => requireRecordValue('quantity', 0)).toThrow(ValidationError);
    });
  });
});
