import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { RecordGroupRow } from '../RecordGroupRow';
import { makeGroup } from './fixtures';

const group = makeGroup();

describe('<RecordGroupRow />', () => {
  test('合并行说的是最近一次：共 N 次 + 最近时间 + 展开入口', async () => {
    await render(<RecordGroupRow group={group} expanded={false} onToggle={() => {}} />);

    expect(screen.getByText('喝水')).toBeOnTheScreen();
    expect(screen.getByText(/共 2 次 · 最近 .* · 展开逐条/)).toBeOnTheScreen();
    // 合并行用「最近一次」的取值（3），不是任意一条
    expect(screen.getByText('+3 200ml')).toBeOnTheScreen();
  });

  test('点行切换展开 / 收起', async () => {
    const onToggle = jest.fn();
    await render(<RecordGroupRow group={group} expanded={false} onToggle={onToggle} />);

    await fireEvent.press(screen.getByText('喝水'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('展开后副标题改「收起」，并渲染逐条内容', async () => {
    await render(
      <RecordGroupRow group={group} expanded onToggle={() => {}}>
        <Text>逐条内容</Text>
      </RecordGroupRow>,
    );

    expect(screen.getByText(/收起/)).toBeOnTheScreen();
    expect(screen.getByText('逐条内容')).toBeOnTheScreen();
  });

  test('未展开时不渲染逐条内容', async () => {
    await render(
      <RecordGroupRow group={group} expanded={false} onToggle={() => {}}>
        <Text>逐条内容</Text>
      </RecordGroupRow>,
    );

    expect(screen.queryByText('逐条内容')).not.toBeOnTheScreen();
  });

  test('点【+1】触发 onRepeat（取值取最近一条已在上一行用例里核对）', async () => {
    const onRepeat = jest.fn();
    await render(<RecordGroupRow group={group} expanded={false} onToggle={() => {}} onRepeat={onRepeat} />);

    await fireEvent.press(screen.getByRole('button', { name: '+1' }));

    expect(onRepeat).toHaveBeenCalledTimes(1);
  });

  test('定义已删除：没有【+1】，只有标记', async () => {
    await render(
      <RecordGroupRow
        group={group}
        expanded={false}
        onToggle={() => {}}
        onRepeat={() => {}}
        definitionGone
      />,
    );

    expect(screen.getByText('定义已删除')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '+1' })).not.toBeOnTheScreen();
  });

  test('有禁止原因：按钮禁用', async () => {
    await render(
      <RecordGroupRow
        group={group}
        expanded={false}
        onToggle={() => {}}
        onRepeat={() => {}}
        repeatBlockedReason="已归档"
      />,
    );

    expect(screen.getByText('已归档')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '+1' })).toBeDisabled();
  });
});
