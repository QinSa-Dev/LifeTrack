import { fireEvent, render, screen } from '@testing-library/react-native';

import type { EventGroup } from '@/domain/models';
import { TimelineQueryPanel } from '../TimelineQueryPanel';
import { DEFAULT_TIMELINE_QUERY, type TimelineQuery } from '../timelineQuery';

const group: EventGroup = {
  id: 'group-1',
  name: '健康',
  sortOrder: 0,
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
};

async function renderPanel(
  query: TimelineQuery = DEFAULT_TIMELINE_QUERY,
  groups: readonly EventGroup[] = [group],
) {
  const onChange = jest.fn();
  await render(<TimelineQueryPanel query={query} groups={groups} onChange={onChange} />);
  return onChange;
}

describe('<TimelineQueryPanel />', () => {
  test('输入事件名：只改 name，其余筛选与排序原样带回去', async () => {
    const query: TimelineQuery = {
      filter: { name: '', kind: 'counter', source: 'quick', groupId: null },
      sort: 'count',
    };
    const onChange = await renderPanel(query);

    await fireEvent.changeText(screen.getByPlaceholderText('写下关键字'), '喝');

    expect(onChange).toHaveBeenCalledWith({
      filter: { name: '喝', kind: 'counter', source: 'quick', groupId: null },
      sort: 'count',
    });
  });

  test('选类型：选中态由 query 决定，回调只改 kind', async () => {
    const onChange = await renderPanel({ filter: { name: '' }, sort: 'time' });

    await fireEvent.press(screen.getByRole('button', { name: '计数' }));

    expect(onChange).toHaveBeenCalledWith({ filter: { name: '', kind: 'counter' }, sort: 'time' });
  });

  test('选来源：回调只改 source', async () => {
    const onChange = await renderPanel();

    await fireEvent.press(screen.getByRole('button', { name: '快捷' }));

    expect(onChange).toHaveBeenCalledWith({ filter: { name: '', source: 'quick' }, sort: 'time' });
  });

  test('分组筛选：有分组时才出现「未分组」，它存成 null（不是「不限」）', async () => {
    const onChange = await renderPanel();

    await fireEvent.press(screen.getByRole('button', { name: '未分组' }));
    expect(onChange).toHaveBeenCalledWith({ filter: { name: '', groupId: null }, sort: 'time' });

    await fireEvent.press(screen.getByRole('button', { name: '健康' }));
    expect(onChange).toHaveBeenCalledWith({ filter: { name: '', groupId: 'group-1' }, sort: 'time' });
  });

  test('没有分组时不显示分组那一组筛选', async () => {
    await renderPanel(DEFAULT_TIMELINE_QUERY, []);

    expect(screen.queryByText('未分组')).not.toBeOnTheScreen();
    expect(screen.queryByText('健康')).not.toBeOnTheScreen();
  });

  test('排序：点「按次数」只换排序键，筛选原样保留', async () => {
    const onChange = await renderPanel({
      filter: { name: '喝', kind: 'counter', groupId: null },
      sort: 'time',
    });

    await fireEvent.press(screen.getByRole('button', { name: '按次数' }));

    expect(onChange).toHaveBeenCalledWith({
      filter: { name: '喝', kind: 'counter', groupId: null },
      sort: 'count',
    });
  });

  test('三颗「全部」各管一组：点类型那颗不会顺手清掉来源与分组', async () => {
    const query: TimelineQuery = {
      filter: { name: '', kind: 'counter', source: 'quick', groupId: null },
      sort: 'time',
    };
    const onChange = await renderPanel(query);

    // 顺序：类型 / 来源 / 分组
    const allChips = screen.getAllByText('全部');
    expect(allChips).toHaveLength(3);
    await fireEvent.press(allChips[0]!);

    expect(onChange).toHaveBeenCalledWith({
      filter: { name: '', kind: undefined, source: 'quick', groupId: null },
      sort: 'time',
    });
  });

  test('当前选中的类型 / 来源 / 排序都以选中态暴露给读屏', async () => {
    await renderPanel({
      filter: { name: '', kind: 'quantity', source: 'backfill' },
      sort: 'recorded',
    });

    expect(screen.getByRole('button', { name: '数量（历史）' })).toBeSelected();
    expect(screen.getByRole('button', { name: '补录' })).toBeSelected();
    expect(screen.getByRole('button', { name: '按最近修改' })).toBeSelected();
  });
});
