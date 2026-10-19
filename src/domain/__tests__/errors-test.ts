import { AppError, ValidationError, isAppError, toAppError } from '@/domain/errors';

describe('AppError 体系', () => {
  it('子类带正确的 code 与 name', () => {
    const error = new ValidationError('名称不能为空');
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('VALIDATION');
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('名称不能为空');
  });

  it('保留原始错误与结构化上下文', () => {
    const original = new Error('SQLITE_BUSY');
    const error = new AppError('STORAGE', '写入失败', {
      cause: original,
      details: { table: 'app_meta' },
    });

    expect(error.cause).toBe(original);
    expect(error.details).toEqual({ table: 'app_meta' });
  });

  it('isAppError 只认自家类型', () => {
    expect(isAppError(new ValidationError('x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError('x')).toBe(false);
  });
});

describe('toAppError', () => {
  it('已经是 AppError 时原样返回', () => {
    const original = new ValidationError('x');
    expect(toAppError(original)).toBe(original);
  });

  it('把普通 Error 包装为 UNKNOWN 并保留 cause', () => {
    const original = new Error('boom');
    const wrapped = toAppError(original);
    expect(wrapped.code).toBe('UNKNOWN');
    expect(wrapped.message).toBe('boom');
    expect(wrapped.cause).toBe(original);
  });

  it('把非 Error 值也归一为 AppError', () => {
    const wrapped = toAppError(42, '兜底信息');
    expect(wrapped.code).toBe('UNKNOWN');
    expect(wrapped.message).toBe('兜底信息');
  });
});
