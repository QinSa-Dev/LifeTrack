import { render, screen } from '@testing-library/react-native';

import type { LedgerEntry } from '@/domain/models';
import { LedgerAnalysis } from '../LedgerAnalysis';

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour).toISOString();
}

let counter = 0;
function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  counter += 1;
  const occurredAt = localIso(2026, 11, 5);
  return {
    id: `018fed00-0000-7000-8000-${String(counter).padStart(12, '0')}`,
    kind: 'expense',
    amountCents: 360,
    note: '早餐',
    occurredAt,
    recordedAt: occurredAt,
    ...overrides,
  };
}

describe('<LedgerAnalysis />', () => {
  test('月账单展示概览、每日柱状图、支出构成与排行', async () => {
    await render(
      <LedgerAnalysis
        entries={[
          makeEntry({ amountCents: 360, note: '早餐' }),
          makeEntry({ amountCents: 640, note: '地铁' }),
          makeEntry({ kind: 'income', amountCents: 10000, note: '工资' }),
        ]}
        period="month"
        year={2026}
        month={11}
      />,
    );

    expect(screen.getByText('收支概览')).toBeOnTheScreen();
    expect(screen.getByText('每日支出')).toBeOnTheScreen();
    expect(screen.getByText('支出构成')).toBeOnTheScreen();
    expect(screen.getByText('支出排行')).toBeOnTheScreen();
    // 两个支出类别在环图图例和排行里各出现一次
    expect(screen.getAllByText('早餐').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('地铁').length).toBeGreaterThanOrEqual(1);
  });

  test('只有收入时给出「没有支出」的说明，不渲染空环图', async () => {
    await render(
      <LedgerAnalysis
        entries={[makeEntry({ kind: 'income', amountCents: 10000, note: '工资' })]}
        period="month"
        year={2026}
        month={11}
      />,
    );

    expect(screen.getByText('支出构成')).toBeOnTheScreen();
    expect(screen.getByText('这段时间没有支出。')).toBeOnTheScreen();
    expect(screen.queryByText('支出排行')).not.toBeOnTheScreen();
  });

  test('年账单展示每月收支（12 个横轴标签）', async () => {
    await render(
      <LedgerAnalysis
        entries={[makeEntry({ amountCents: 360, occurredAt: localIso(2024, 5, 5) })]}
        period="year"
        year={2024}
      />,
    );

    expect(screen.getByText('每月收支')).toBeOnTheScreen();
    expect(screen.getByText('12月')).toBeOnTheScreen();
  });
});
