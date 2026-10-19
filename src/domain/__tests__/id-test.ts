import { ValidationError } from '@/domain/errors';
import { assertUuidV7, isUuidV7, newId, uuidv7 } from '@/domain/id';

describe('uuidv7', () => {
  it('格式符合 UUID v7（版本位 7、变体位为 8/9/a/b）', () => {
    const id = uuidv7();
    expect(isUuidV7(id)).toBe(true);
    expect(id).toHaveLength(36);
    expect(id.charAt(14)).toBe('7');
    expect('89ab').toContain(id.charAt(19));
  });

  it('按生成顺序严格递增（即使传入更早的时间戳也不回退）', () => {
    const stamps = [
      1_700_000_000_000,
      1_700_000_000_000,
      1_700_000_000_005,
      1_699_000_000_000, // 补录：比上一个小
      1_700_000_000_005,
    ];
    const ids = stamps.map((stamp) => uuidv7(stamp));

    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('时间越晚的 id 越大（可作为排序键）', () => {
    const earlier = uuidv7(1_800_000_000_000);
    const later = uuidv7(1_800_000_001_000);
    expect(later > earlier).toBe(true);
  });

  it('批量生成不重复', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5_000; i += 1) {
      ids.add(newId());
    }
    expect(ids.size).toBe(5_000);
  });

  it('非法时间戳抛 ValidationError', () => {
    expect(() => uuidv7(-1)).toThrow(ValidationError);
    expect(() => uuidv7(Number.NaN)).toThrow(ValidationError);
    expect(() => uuidv7(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
  });
});

describe('assertUuidV7', () => {
  it('通过合法 id', () => {
    const id = uuidv7();
    expect(assertUuidV7(id)).toBe(id);
  });

  it('拒绝非法值并带上字段名', () => {
    expect(() => assertUuidV7('not-a-uuid', 'recordId')).toThrow(/recordId/);
    expect(() => assertUuidV7('550e8400-e29b-41d4-a716-446655440000')).toThrow(ValidationError);
  });
});
