import { DEFAULT_PREDICTION_WINDOW } from '@/domain/cycles';
import {
  DEFAULT_PREDICTION_WINDOW_SETTING,
  PREDICTION_WINDOW_OPTIONS,
  describePredictionWindow,
  parsePredictionWindow,
} from '@/features/cycles/predictionWindow';

describe('parsePredictionWindow', () => {
  it('把存下来的数字字符串读回来', () => {
    expect(parsePredictionWindow('5')).toBe(5);
  });

  it('缺失 / 空串 / 非数字一律回退默认值，而不是让预测算不出来', () => {
    expect(parsePredictionWindow(null)).toBe(DEFAULT_PREDICTION_WINDOW_SETTING);
    expect(parsePredictionWindow(undefined)).toBe(DEFAULT_PREDICTION_WINDOW_SETTING);
    expect(parsePredictionWindow('')).toBe(DEFAULT_PREDICTION_WINDOW_SETTING);
    expect(parsePredictionWindow('最近三段')).toBe(DEFAULT_PREDICTION_WINDOW_SETTING);
  });

  it('小于 1 的窗口没有意义（领域层会返回 undefined），回退默认值', () => {
    expect(parsePredictionWindow('0')).toBe(DEFAULT_PREDICTION_WINDOW_SETTING);
    expect(parsePredictionWindow('-1')).toBe(DEFAULT_PREDICTION_WINDOW_SETTING);
  });

  it('默认值与领域层的常量一致', () => {
    expect(DEFAULT_PREDICTION_WINDOW_SETTING).toBe(DEFAULT_PREDICTION_WINDOW);
  });

  it('界面档位都落在「回读后还是它自己」的范围内', () => {
    for (const option of PREDICTION_WINDOW_OPTIONS) {
      expect(parsePredictionWindow(String(option))).toBe(option);
    }
  });
});

describe('describePredictionWindow', () => {
  it('说成「最近 N 段」', () => {
    expect(describePredictionWindow(3)).toBe('最近 3 段');
  });
});
