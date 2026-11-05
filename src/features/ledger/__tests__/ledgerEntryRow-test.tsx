import { fireEvent, render, screen } from '@testing-library/react-native';

import type { LedgerEntry } from '@/domain/models';
import { LedgerEntryRow } from '../LedgerEntryRow';

const T1 = '2026-11-05T00:30:00.000Z';

function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: '018fed00-0000-7000-8000-000000000801',
    kind: 'expense',
    amountCents: 360,
    note: '上班地铁',
    occurredAt: T1,
    recordedAt: T1,
    ...overrides,
  };
}

describe('<LedgerEntryRow />', () => {
  test('一行说清备注、时间与带符号的金额', async () => {
    await render(<LedgerEntryRow entry={makeEntry()} onCopy={() => {}} onDelete={() => {}} />);

    expect(screen.getByText('上班地铁')).toBeOnTheScreen();
    expect(screen.getByText('-¥3.60')).toBeOnTheScreen();
    expect(screen.getByText(/^11-05/)).toBeOnTheScreen();
  });

  test('没有备注时用方向当标题，收入带正号', async () => {
    await render(
      <LedgerEntryRow
        entry={makeEntry({ kind: 'income', amountCents: 10000, note: undefined })}
        onCopy={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByText('收入')).toBeOnTheScreen();
    expect(screen.getByText('+¥100.00')).toBeOnTheScreen();
  });

  test('左滑后的「复制 / 删除」各走各的回调，名字里带上这一条', async () => {
    const onCopy = jest.fn();
    const onDelete = jest.fn();
    await render(<LedgerEntryRow entry={makeEntry()} onCopy={onCopy} onDelete={onDelete} />);

    await fireEvent.press(screen.getByRole('button', { name: '复制「上班地铁」' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: '删除「上班地铁」' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
