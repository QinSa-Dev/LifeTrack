import { fireEvent, render, screen } from '@testing-library/react-native';

import { RecordRow } from '../RecordRow';
import { makeRecord } from './fixtures';

describe('<RecordRow />', () => {
  test('计数型 +1：右侧只有一颗【+1】，不再摆一个同字的取值', async () => {
    await render(<RecordRow record={makeRecord()} onRepeat={() => {}} />);

    // 取值「+1」与按钮文字撞脸，所以这一行的取值不显示——屏幕上只留按钮那一处。
    expect(screen.getAllByText('+1')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '+1' })).toBeOnTheScreen();
  });

  test('增量大于 1 时仍显示取值，并回落到快照里的属性', async () => {
    await render(<RecordRow record={makeRecord({ value: 3 })} />);

    expect(screen.getByText('+3 200ml')).toBeOnTheScreen();
  });

  test('补录：显示「补录」标记与「补录于」副标题', async () => {
    await render(<RecordRow record={makeRecord({ source: 'backfill' })} />);

    expect(screen.getByText('补录')).toBeOnTheScreen();
    expect(screen.getByText(/补录于/)).toBeOnTheScreen();
  });

  test('有禁止原因：按钮禁用，并显示同文案的标记', async () => {
    await render(<RecordRow record={makeRecord()} onRepeat={() => {}} repeatBlockedReason="已归档" />);

    expect(screen.getByText('已归档')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '+1' })).toBeDisabled();
  });

  test('定义已删除：不再给【+1】，只留一个标记', async () => {
    await render(<RecordRow record={makeRecord()} onRepeat={() => {}} definitionGone />);

    expect(screen.getByText('定义已删除')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '+1' })).not.toBeOnTheScreen();
  });

  test('点行与点【+1】分别走各自的回调', async () => {
    const onPress = jest.fn();
    const onRepeat = jest.fn();
    await render(<RecordRow record={makeRecord()} onPress={onPress} onRepeat={onRepeat} />);

    await fireEvent.press(screen.getByText('喝水'));
    await fireEvent.press(screen.getByRole('button', { name: '+1' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRepeat).toHaveBeenCalledTimes(1);
  });
});
