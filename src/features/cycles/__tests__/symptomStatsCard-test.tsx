import { render, screen } from '@testing-library/react-native';

import type { CycleEntry } from '@/domain/models';
import { SymptomStatsCard } from '../SymptomStatsCard';

const T = '2026-10-01T08:00:00.000Z';

/** 一条周期内记录；默认没有症状，每个用例只覆盖自己关心的字段。 */
function makeEntry(overrides: Partial<CycleEntry> = {}): CycleEntry {
  return {
    id: 'entry-1',
    instanceId: 'instance-1',
    date: '2026-10-01',
    symptoms: [],
    createdAt: T,
    updatedAt: T,
    ...overrides,
  };
}

describe('<SymptomStatsCard />', () => {
  test('一条记录都没有：写明空态，空态提示可由调用方覆盖', async () => {
    await render(<SymptomStatsCard entries={[]} title="这一段的症状" emptyHint="这一段还没有记录。" />);

    expect(screen.getByText('这一段的症状')).toBeOnTheScreen();
    expect(screen.getByText('还没有周期内记录')).toBeOnTheScreen();
    expect(screen.getByText('这一段还没有记录。')).toBeOnTheScreen();
  });

  test('有记录但都没填症状：分开说，不显示 0 天的症状行', async () => {
    await render(
      <SymptomStatsCard
        entries={[makeEntry({ id: 'e1', date: '2026-10-01' }), makeEntry({ id: 'e2', date: '2026-10-02' })]}
      />,
    );

    expect(screen.getByText('2 条记录，都还没有记症状')).toBeOnTheScreen();
    expect(screen.getByText('已经记了 2 条周期记录，但都还没有填过症状。')).toBeOnTheScreen();
  });

  test('按天数从多到少列出，百分比按「记了症状的记录数」算，软删除的记录不计入', async () => {
    await render(
      <SymptomStatsCard
        entries={[
          makeEntry({ id: 'e1', date: '2026-10-01', symptoms: ['头痛', '乏力'] }),
          makeEntry({ id: 'e2', date: '2026-10-02', symptoms: ['头痛'] }),
          makeEntry({ id: 'e3', date: '2026-10-03' }),
          makeEntry({ id: 'e4', date: '2026-10-04', symptoms: ['头痛'], deletedAt: T }),
        ]}
      />,
    );

    expect(screen.getByText('3 条记录，其中 2 条记了症状，共 2 种')).toBeOnTheScreen();
    expect(screen.getByText('头痛')).toBeOnTheScreen();
    expect(screen.getByText('2 天 · 100%')).toBeOnTheScreen();
    expect(screen.getByText('乏力')).toBeOnTheScreen();
    expect(screen.getByText('1 天 · 50%')).toBeOnTheScreen();
    expect(screen.getByText(/百分比按「记了症状的记录数」算/)).toBeOnTheScreen();
  });

  test('限了条数：只列前 N 种，并说明还有几种没列出', async () => {
    await render(
      <SymptomStatsCard entries={[makeEntry({ symptoms: ['头痛', '乏力', '腰酸'] })]} limit={2} />,
    );

    expect(screen.getByText('头痛')).toBeOnTheScreen();
    expect(screen.getByText('乏力')).toBeOnTheScreen();
    expect(screen.queryByText('腰酸')).not.toBeOnTheScreen();
    expect(screen.getByText('只列出前 2 种，还有 1 种没有列出。')).toBeOnTheScreen();
  });

  test('没限条数时，不出现「还有几种没列出」的说明', async () => {
    await render(<SymptomStatsCard entries={[makeEntry({ symptoms: ['头痛', '乏力', '腰酸'] })]} />);

    expect(screen.getByText('腰酸')).toBeOnTheScreen();
    expect(screen.queryByText(/只列出前/)).not.toBeOnTheScreen();
  });
});
