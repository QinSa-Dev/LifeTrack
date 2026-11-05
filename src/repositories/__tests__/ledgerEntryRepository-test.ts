import { runMigrations } from '@/db/migrations';
import { MIGRATIONS } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/db/testing/nodeSqliteAdapter';
import { NotFoundError, ValidationError } from '@/domain/errors';
import { monthRangeIso } from '@/features/ledger/month';
import { LedgerEntryRepository } from '@/repositories/ledgerEntryRepository';

describe('LedgerEntryRepository', () => {
  let db: TestDatabase;
  let ledger: LedgerEntryRepository;

  beforeEach(async () => {
    db = createTestDatabase();
    await runMigrations(db, MIGRATIONS);
    ledger = new LedgerEntryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('记一笔后能读回，金额是整数分、备注与标签去掉首尾空白', async () => {
    const created = await ledger.create(
      { kind: 'expense', amountCents: 360, note: '  上班地铁  ', tag: '  通勤  ' },
      '2026-11-05T08:00:00.000Z',
    );

    expect(created.kind).toBe('expense');
    expect(created.amountCents).toBe(360);
    expect(created.note).toBe('上班地铁');
    expect(created.tag).toBe('通勤');
    expect(created.occurredAt).toBe('2026-11-05T08:00:00.000Z');
    expect(created.recordedAt).toBe('2026-11-05T08:00:00.000Z');

    expect(await ledger.list()).toEqual([created]);
  });

  it('省略备注与标签时读回 undefined，而不是 null', async () => {
    const created = await ledger.create({ kind: 'income', amountCents: 10000 }, '2026-11-05T08:00:00.000Z');
    expect(created.note).toBeUndefined();
    expect(created.tag).toBeUndefined();
    expect(await ledger.list()).toEqual([created]);
  });

  it('按 id 读回一笔；不存在时返回 null', async () => {
    const created = await ledger.create(
      { kind: 'expense', amountCents: 360, note: '上班地铁', tag: '通勤' },
      '2026-11-05T08:00:00.000Z',
    );

    expect(await ledger.getById(created.id)).toEqual(created);
    expect(await ledger.getById('018fed00-0000-7000-8000-000000000999')).toBeNull();
    await expect(ledger.getById('   ')).rejects.toThrow(ValidationError);
  });

  it('更正方向 / 金额 / 备注 / 标签：整体替换，发生时间与录入时间不变', async () => {
    const created = await ledger.create(
      {
        kind: 'expense',
        amountCents: 360,
        note: '旧备注',
        tag: '旧标签',
        occurredAt: '2026-11-04T08:00:00.000Z',
      },
      '2026-11-05T08:00:00.000Z',
    );

    const updated = await ledger.update(created.id, {
      kind: 'income',
      amountCents: 12345,
      note: '  新备注  ',
      tag: '  新标签  ',
    });

    expect(updated).toEqual({
      id: created.id,
      kind: 'income',
      amountCents: 12345,
      note: '新备注',
      tag: '新标签',
      occurredAt: created.occurredAt,
      recordedAt: created.recordedAt,
    });
    expect(await ledger.getById(created.id)).toEqual(updated);
    expect(await ledger.list()).toEqual([updated]);
  });

  it('更正时可以清空备注与标签；不存在的 id 报 NotFoundError', async () => {
    const created = await ledger.create(
      { kind: 'expense', amountCents: 360, note: '旧备注', tag: '旧标签' },
      '2026-11-05T08:00:00.000Z',
    );

    const updated = await ledger.update(created.id, {
      kind: 'expense',
      amountCents: 360,
      note: '',
      tag: '   ',
    });
    expect(updated.note).toBeUndefined();
    expect(updated.tag).toBeUndefined();

    await expect(
      ledger.update('018fed00-0000-7000-8000-000000000999', {
        kind: 'expense',
        amountCents: 100,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('更正时沿用同一套校验：非法方向 / 金额 / 备注 / 标签都拒绝', async () => {
    const created = await ledger.create({ kind: 'expense', amountCents: 360 }, '2026-11-05T08:00:00.000Z');

    await expect(
      // @ts-expect-error 故意传非法方向，验证运行时校验
      ledger.update(created.id, { kind: 'transfer', amountCents: 100 }),
    ).rejects.toThrow(ValidationError);
    await expect(ledger.update(created.id, { kind: 'expense', amountCents: 0 })).rejects.toThrow(
      ValidationError,
    );
    await expect(
      ledger.update(created.id, { kind: 'expense', amountCents: 100, note: 'x'.repeat(101) }),
    ).rejects.toThrow(ValidationError);
    await expect(
      ledger.update(created.id, { kind: 'expense', amountCents: 100, tag: 'x'.repeat(31) }),
    ).rejects.toThrow(ValidationError);

    // 校验失败不应改掉原来的记录
    expect(await ledger.getById(created.id)).toEqual(created);
  });

  it('列表按发生时间倒序；同一时刻用 id 兜底，结果稳定', async () => {
    const now = '2026-11-05T12:00:00.000Z';
    const first = await ledger.create(
      { kind: 'expense', amountCents: 100, occurredAt: '2026-11-04T08:00:00.000Z' },
      now,
    );
    const later = await ledger.create(
      { kind: 'expense', amountCents: 200, occurredAt: '2026-11-05T08:00:00.000Z' },
      now,
    );
    const earlier = await ledger.create(
      { kind: 'income', amountCents: 300, occurredAt: '2026-11-03T08:00:00.000Z' },
      now,
    );

    expect((await ledger.list()).map((entry) => entry.id)).toEqual([later.id, first.id, earlier.id]);
  });

  it('按月查询按设备本地时区切边界：本地 11 月 1 日 00:30 算 11 月', async () => {
    const now = new Date(2026, 11, 1).toISOString();
    const inNovember = new Date(2026, 10, 1, 0, 30).toISOString();
    const lateOctober = new Date(2026, 9, 31, 23, 30).toISOString();
    const december = new Date(2026, 11, 1).toISOString();

    await ledger.create({ kind: 'expense', amountCents: 360, occurredAt: inNovember }, now);
    await ledger.create({ kind: 'expense', amountCents: 100, occurredAt: lateOctober }, now);
    const atBoundary = await ledger.create({ kind: 'expense', amountCents: 200, occurredAt: december }, now);

    expect(await ledger.list(monthRangeIso({ year: 2026, month: 11 }))).toHaveLength(1);
    expect((await ledger.list(monthRangeIso({ year: 2026, month: 10 }))).map((e) => e.amountCents)).toEqual([
      100,
    ]);
    // `until` 是开区间：12 月 1 日零点整不属于 11 月
    const november = await ledger.list(monthRangeIso({ year: 2026, month: 11 }));
    expect(november.map((e) => e.id)).not.toContain(atBoundary.id);
  });

  it('年份范围按本地年份取最早与最晚；没有数据时是 null', async () => {
    const now = new Date(2026, 10, 5, 12).toISOString();
    await ledger.create(
      { kind: 'expense', amountCents: 100, occurredAt: new Date(2024, 2, 1, 8).toISOString() },
      now,
    );
    await ledger.create(
      { kind: 'expense', amountCents: 200, occurredAt: new Date(2026, 0, 1, 0, 30).toISOString() },
      now,
    );

    expect(await ledger.yearBounds()).toEqual({ earliestYear: 2024, latestYear: 2026 });

    await db.runAsync('DELETE FROM ledger_entries');
    expect(await ledger.yearBounds()).toBeNull();
  });

  it('金额必须大于 0 且为整数分', async () => {
    const now = '2026-11-05T08:00:00.000Z';
    await expect(ledger.create({ kind: 'expense', amountCents: 0 }, now)).rejects.toThrow(ValidationError);
    await expect(ledger.create({ kind: 'expense', amountCents: -1 }, now)).rejects.toThrow(ValidationError);
    await expect(ledger.create({ kind: 'expense', amountCents: 3.6 }, now)).rejects.toThrow(ValidationError);
  });

  it('方向不合法、备注 / 标签过长、发生时间晚于录入时间都拒绝', async () => {
    const now = '2026-11-05T08:00:00.000Z';
    await expect(
      // @ts-expect-error 故意传非法方向，验证运行时校验
      ledger.create({ kind: 'transfer', amountCents: 100 }, now),
    ).rejects.toThrow(ValidationError);
    await expect(
      ledger.create({ kind: 'expense', amountCents: 100, note: 'x'.repeat(101) }, now),
    ).rejects.toThrow(ValidationError);
    await expect(
      ledger.create({ kind: 'expense', amountCents: 100, tag: 'x'.repeat(31) }, now),
    ).rejects.toThrow(ValidationError);
    await expect(
      ledger.create({ kind: 'expense', amountCents: 100, occurredAt: '2026-11-06T08:00:00.000Z' }, now),
    ).rejects.toThrow(ValidationError);
  });

  it('结束时间必须晚于起始时间，坏时间文本也拒绝', async () => {
    await expect(
      ledger.list({ from: '2026-11-05T00:00:00.000Z', until: '2026-11-05T00:00:00.000Z' }),
    ).rejects.toThrow(ValidationError);
    await expect(ledger.list({ from: '昨天' })).rejects.toThrow(ValidationError);
  });

  it('删除是真删；删不存在的记录报 NotFoundError', async () => {
    const created = await ledger.create({ kind: 'expense', amountCents: 360 }, '2026-11-05T08:00:00.000Z');
    await ledger.remove(created.id);

    expect(await ledger.list()).toEqual([]);
    await expect(ledger.remove(created.id)).rejects.toThrow(NotFoundError);
  });
});
