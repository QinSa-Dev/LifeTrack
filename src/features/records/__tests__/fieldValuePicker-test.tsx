import { fireEvent, render, screen } from '@testing-library/react-native';

import { FieldValuePicker } from '../FieldValuePicker';
import { makeField } from './fixtures';

describe('<FieldValuePicker />', () => {
  test('单选：给每个候选值一颗胶囊，选中的那颗是选中态', async () => {
    await render(<FieldValuePicker field={makeField()} values={['一般']} onChange={() => {}} />);

    expect(screen.getByText('心情（单选）')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '一般' })).toBeSelected();
    expect(screen.getByRole('button', { name: '好' })).not.toBeSelected();
  });

  test('单选：点未选中的值替换掉原来的，点已选中的值清空', async () => {
    const onChange = jest.fn();
    await render(<FieldValuePicker field={makeField()} values={['一般']} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: '好' }));
    expect(onChange).toHaveBeenLastCalledWith(['好']);

    await fireEvent.press(screen.getByRole('button', { name: '一般' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('多选：点一个追加一个（保留已选顺序），再点同一个去掉它', async () => {
    const onChange = jest.fn();
    const field = makeField({ kind: 'multi' });
    await render(<FieldValuePicker field={field} values={['好']} onChange={onChange} />);

    expect(screen.getByText('心情（多选）')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '好' })).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: '一般' }));
    expect(onChange).toHaveBeenLastCalledWith(['好', '一般']);

    // 受控组件：把回调结果重新交给它，界面才会更新
    await screen.rerender(<FieldValuePicker field={field} values={['好', '一般']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: '一般' })).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: '好' }));
    expect(onChange).toHaveBeenLastCalledWith(['一般']);
  });

  test('时间点：显示当前值，输入后原样交给回调，清空输入得到空数组', async () => {
    const onChange = jest.fn();
    await render(<FieldValuePicker field={makeField({ kind: 'time' })} values={[]} onChange={onChange} />);

    expect(screen.getByText('心情（时间点）')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('08:30'), '7:05');
    expect(onChange).toHaveBeenLastCalledWith(['7:05']);

    await fireEvent.changeText(screen.getByPlaceholderText('08:30'), '  ');
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('时间段：开始 / 结束各一个输入框，改一头保留另一头', async () => {
    const onChange = jest.fn();
    await render(
      <FieldValuePicker
        field={makeField({ kind: 'range' })}
        values={['08:30', '09:15']}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('心情（时间段）')).toBeOnTheScreen();
    expect(screen.getByText('开始')).toBeOnTheScreen();
    expect(screen.getByText('结束')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByPlaceholderText('08:30'), '08:45');
    expect(onChange).toHaveBeenLastCalledWith(['08:45', '09:15']);

    await fireEvent.changeText(screen.getByPlaceholderText('09:15'), '09:30');
    expect(onChange).toHaveBeenLastCalledWith(['08:30', '09:30']);
  });

  test('时间段：只填一头也照原样上交（合法性留给仓储校验）', async () => {
    const onChange = jest.fn();
    await render(<FieldValuePicker field={makeField({ kind: 'range' })} values={[]} onChange={onChange} />);

    await fireEvent.changeText(screen.getByPlaceholderText('08:30'), '08:30');
    expect(onChange).toHaveBeenLastCalledWith(['08:30', '']);
  });

  test('时间段：最后一头也清空时回到空数组，不留下空字符串', async () => {
    const onChange = jest.fn();
    await render(
      <FieldValuePicker field={makeField({ kind: 'range' })} values={['08:30']} onChange={onChange} />,
    );

    await fireEvent.changeText(screen.getByPlaceholderText('08:30'), '');

    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
