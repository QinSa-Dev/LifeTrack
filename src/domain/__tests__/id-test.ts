import { ValidationError } from '@/domain/errors';
import { assertEntityId, isUuidV7, newId, uuidv7 } from '@/domain/id';

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

describe('assertEntityId', () => {
  it('通过生成的 v7', () => {
    const id = uuidv7();
    expect(assertEntityId(id)).toBe(id);
  });

  it('也通过早期版本写进库的 v4：导入不能把自家备份拒了', () => {
    // 这条 id 的形状就是踩过的那个坑：老数据（分组 / 记录 / 周期）都是 v4
    const v4 = '550e8400-e29b-41d4-a716-446655440000';
    expect(assertEntityId(v4)).toBe(v4);
    expect(assertEntityId(v4, 'data.eventGroups[0].id')).toBe(v4);
  });

  it('拒绝结构上就不是 id 的值，并带上字段名', () => {
    expect(() => assertEntityId('not-a-uuid', 'recordId')).toThrow(/recordId/);
    expect(() => assertEntityId('', 'recordId')).toThrow(ValidationError);
    // 少一位 / 多一位都不算 UUID
    expect(() => assertEntityId('018fed00-0000-7000-8000-00000000000')).toThrow(ValidationError);
    expect(() => assertEntityId('018fed00-0000-7000-8000-0000000000000')).toThrow(ValidationError);
    // 大小写不同会是**另一个** id，库里存的一律是小写，不认大写
    expect(() => assertEntityId('550E8400-E29B-41D4-A716-446655440000')).toThrow(ValidationError);
  });
});
