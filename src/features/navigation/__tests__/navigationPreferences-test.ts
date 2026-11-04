import {
  DEFAULT_TAB_ROUTE,
  TAB_ROUTES,
  defaultNavigationPreferences,
  moveTab,
  normalizeTabOrder,
  parseNavigationPreferences,
  serializeNavigationPreferences,
  type NavigationPreferences,
} from '../navigationPreferences';

describe('parseNavigationPreferences', () => {
  test('缺失、空串与坏 JSON 都回到默认（时间轴在前、默认时间轴）', () => {
    const fallback = defaultNavigationPreferences();
    expect(parseNavigationPreferences(null)).toEqual(fallback);
    expect(parseNavigationPreferences('')).toEqual(fallback);
    expect(parseNavigationPreferences('{不是 JSON')).toEqual(fallback);
  });

  test('读出存好的顺序与默认页', () => {
    const stored = JSON.stringify({
      order: ['stats', 'index', 'definitions', 'settings'],
      defaultTab: 'stats',
    });

    expect(parseNavigationPreferences(stored)).toEqual({
      order: ['stats', 'index', 'definitions', 'settings'],
      defaultTab: 'stats',
    });
  });

  test('不认识的项丢掉、重复项只留第一次，缺的按默认顺序补在末尾', () => {
    const stored = JSON.stringify({
      order: ['stats', 'stats', 'nope', 'index'],
      defaultTab: 'stats',
    });

    expect(parseNavigationPreferences(stored).order).toEqual(['stats', 'index', 'definitions', 'settings']);
  });

  test('默认页认不出来时回到时间轴，而不是少一个标签', () => {
    const stored = JSON.stringify({ order: ['stats'], defaultTab: 'unknown' });

    expect(parseNavigationPreferences(stored)).toEqual({
      order: ['stats', 'index', 'definitions', 'settings'],
      defaultTab: DEFAULT_TAB_ROUTE,
    });
  });

  test('存成别的形状（数组 / 字符串）也只当没记住', () => {
    expect(parseNavigationPreferences(JSON.stringify(['stats']))).toEqual(defaultNavigationPreferences());
    expect(parseNavigationPreferences(JSON.stringify('stats'))).toEqual(defaultNavigationPreferences());
  });
});

describe('serializeNavigationPreferences', () => {
  test('写入再读出完全一致', () => {
    const preferences: NavigationPreferences = {
      order: ['definitions', 'settings', 'index', 'stats'],
      defaultTab: 'settings',
    };

    expect(parseNavigationPreferences(serializeNavigationPreferences({ ...preferences }))).toEqual({
      order: ['definitions', 'settings', 'index', 'stats'],
      defaultTab: 'settings',
    });
  });
});

describe('normalizeTabOrder', () => {
  test('不在列表里的值被忽略，四个标签永远齐全', () => {
    expect(normalizeTabOrder(['settings', 42, null, 'index'])).toEqual([
      'settings',
      'index',
      'stats',
      'definitions',
    ]);
    expect(normalizeTabOrder(undefined)).toEqual([...TAB_ROUTES]);
  });
});

describe('moveTab', () => {
  const order = [...TAB_ROUTES];

  test('左移 / 右移一格，其余顺序不变', () => {
    expect(moveTab(order, 'stats', -1)).toEqual(['stats', 'index', 'definitions', 'settings']);
    expect(moveTab(order, 'stats', 1)).toEqual(['index', 'definitions', 'stats', 'settings']);
  });

  test('两端越界时原样返回（复制一份，不改入参）', () => {
    const left = moveTab(order, 'index', -1);
    const right = moveTab(order, 'settings', 1);

    expect(left).toEqual(order);
    expect(right).toEqual(order);
    expect(left).not.toBe(order);
    expect(order).toEqual([...TAB_ROUTES]);
  });
});
