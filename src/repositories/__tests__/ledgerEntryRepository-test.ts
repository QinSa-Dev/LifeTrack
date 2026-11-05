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

  it('记一笔后能读回，金额是整数分、备注去掉首尾空白', async () => {
    const created = await ledger.create(
      { kind: 'expense', amountCents: 360, note: '  上班地铁  ' },
      '2026-11-05T08:00:00.000Z',
    );

    expect(created.kind).toBe('expense');
    expect(created.amountCents).toBe(360);
    expect(created.note).toBe('上班地铁');
    expect(created.occurredAt).toBe('2026-11-05T08:00:00.000Z');
    expect(created.recordedAt).toBe('2026-11-05T08:00:00.000Z');

    expect(await ledger.list()).toEqual([created]);
  });

  it('省略备注时读回 undefined，而不是 null', async () => {
    const created = await ledger.create({ kind: 'income', amountCents: 10000 }, '2026-11-05T08:00:00.000Z');
    expect(created.note).toBeUndefined();
    expect(await ledger.list()).toEqual([created]);
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

  it('金额必须大于 0 且为整数分', async () => {
    const now = '2026-11-05T08:00:00.000Z';
    await expect(ledger.create({ kind: 'expense', amountCents: 0 }, now)).rejects.toThrow(ValidationError);
    await expect(ledger.create({ kind: 'expense', amountCents: -1 }, now)).rejects.toThrow(ValidationError);
    await expect(ledger.create({ kind: 'expense', amountCents: 3.6 }, now)).rejects.toThrow(ValidationError);
  });

  it('方向不合法、备注过长、发生时间晚于录入时间都拒绝', async () => {
    const now = '2026-11-05T08:00:00.000Z';
    await expect(
      // @ts-expect-error 故意传非法方向，验证运行时校验
      ledger.create({ kind: 'transfer', amountCents: 100 }, now),
    ).rejects.toThrow(ValidationError);
    await expect(
      ledger.create({ kind: 'expense', amountCents: 100, note: 'x'.repeat(101) }, now),
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
