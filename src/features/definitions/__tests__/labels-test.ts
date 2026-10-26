import {
  definitionBadgeLabel,
  describeDefinition,
  eventKindLabel,
  recordKindLabel,
} from '@/features/definitions/labels';

describe('eventKindLabel / recordKindLabel', () => {
  it('事件类型与记录类型的中文名各自固定', () => {
    expect(eventKindLabel('counter')).toBe('计数');
    expect(eventKindLabel('cycle')).toBe('周期');
    // 历史里的 quantity 要标注来源，免得看起来像新功能
    expect(recordKindLabel('counter')).toBe('计数');
    expect(recordKindLabel('quantity')).toBe('数量（历史）');
  });
});

describe('definitionBadgeLabel', () => {
  it('计数型写 +1（说的是动作），周期型写周期', () => {
    expect(definitionBadgeLabel('counter')).toBe('+1');
    expect(definitionBadgeLabel('cycle')).toBe('周期');
  });

  it('换成 +1 不丢类型信息：副标题里仍写着「计数」', () => {
    expect(describeDefinition('counter', [])).toContain('计数');
  });
});

describe('describeDefinition', () => {
  it('有分组时：分组 · 类型', () => {
    expect(describeDefinition('counter', [], '健康')).toBe('健康 · 计数');
  });

  it('没有分组时只写类型——不拿「未分组」把空缺填满', () => {
    expect(describeDefinition('counter', [])).toBe('计数');
    expect(describeDefinition('cycle', [])).not.toContain('未分组');
  });

  it('有属性时接在最后；属性为空则整段不写', () => {
    expect(describeDefinition('counter', ['200ml'], '健康')).toBe('健康 · 计数 · 属性 200ml');
    expect(describeDefinition('counter', [])).toBe('计数');
  });
});
