import { fireEvent, render, screen } from '@testing-library/react-native';

import { LedgerEntryForm } from '../LedgerEntryForm';

function renderForm(onSubmit = jest.fn().mockResolvedValue(undefined)) {
  const onClose = jest.fn();
  return render(<LedgerEntryForm onSubmit={onSubmit} onClose={onClose} />).then(() => ({
    onSubmit,
    onClose,
  }));
}

describe('<LedgerEntryForm />', () => {
  test('默认记支出；金额为空时拦下并提示，不提交', async () => {
    const { onSubmit } = await renderForm();

    expect(screen.getByText('记一笔')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '支出' })).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: '记下' }));

    expect(screen.getByText('请输入大于 0 的金额')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('输入金额与备注后提交：元转成分，备注原样带走', async () => {
    const { onSubmit, onClose } = await renderForm();

    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '3.6');
    await fireEvent.changeText(screen.getByPlaceholderText('上班地铁'), '上班地铁');
    await fireEvent.press(screen.getByRole('button', { name: '记下' }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'expense',
      amountCents: 360,
      note: '上班地铁',
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('切到收入后再提交，方向跟着变', async () => {
    const { onSubmit } = await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: '收入' }));
    expect(screen.getByRole('button', { name: '收入' })).toBeSelected();

    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '100');
    await fireEvent.press(screen.getByRole('button', { name: '记下' }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: 'income', amountCents: 10000, note: '' });
  });

  test('输入框会清掉非数字字符并限制两位小数', async () => {
    await renderForm();

    const amount = screen.getByPlaceholderText('0.00');
    await fireEvent.changeText(amount, '¥3.678');

    expect(amount.props.value).toBe('3.67');
  });

  test('提交失败时把错误留在表单里，并恢复可再试', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('磁盘满了'));
    const { onSubmit: submit, onClose } = await renderForm(onSubmit);

    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '3.6');
    await fireEvent.press(screen.getByRole('button', { name: '记下' }));

    expect(await screen.findByText('磁盘满了')).toBeOnTheScreen();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '记下' })).toBeEnabled();
  });

  test('取消直接关闭，不提交任何东西', async () => {
    const { onSubmit, onClose } = await renderForm();

    await fireEvent.press(screen.getByRole('button', { name: '取消' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
