/**
 * 底部导航的偏好：**标签顺序**与**默认打开的页面**。
 *
 * 两者都只影响「怎么进入应用」，不改库里的事实、也不改任何一页的内容，
 * 所以和时间轴显示方式一样存进 `app_meta`（零迁移），不新建表。
 *
 * 路由名就是 Expo Router 的文件名（`index` / `stats` / `definitions` / `settings`）；
 * 显示用的中文名与路径也放在这里，避免标签栏和设置页各写一份。
 */

/** 五个标签页的路由名，同时也是默认顺序。 */
export const TAB_ROUTES = ['index', 'ledger', 'stats', 'definitions', 'settings'] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

/** 标签栏与设置页共用的中文名。 */
export const TAB_ROUTE_LABELS: Record<TabRoute, string> = {
  index: '时间轴',
  ledger: '记账',
  stats: '统计',
  definitions: '事件',
  settings: '设置',
};

/** 默认打开某个标签时，交给 `router.replace` 的路径。 */
export const TAB_ROUTE_HREFS: Record<TabRoute, '/' | '/ledger' | '/stats' | '/definitions' | '/settings'> = {
  index: '/',
  ledger: '/ledger',
  stats: '/stats',
  definitions: '/definitions',
  settings: '/settings',
};

/** 首次安装默认打开时间轴。 */
export const DEFAULT_TAB_ROUTE: TabRoute = 'index';

export interface NavigationPreferences {
  /** 五个标签从左到右的顺序；保证恰好包含 `TAB_ROUTES` 各一次 */
  order: TabRoute[];
  /** 每次冷启动默认打开哪一个；只影响启动，不改变当前正在看的页面 */
  defaultTab: TabRoute;
}

/** 造一份新的默认偏好（每次返回新数组，避免调用方改到共享常量）。 */
export function defaultNavigationPreferences(): NavigationPreferences {
  return { order: [...TAB_ROUTES], defaultTab: DEFAULT_TAB_ROUTE };
}

export function isTabRoute(value: unknown): value is TabRoute {
  return typeof value === 'string' && (TAB_ROUTES as readonly string[]).includes(value);
}

/**
 * 把任意值收拾成一个**完整、无重复、只含已知路由**的顺序。
 *
 * 读偏好时永远不因为存坏了就少一个标签：不认识的项丢掉、重复的只留第一次，
 * 缺的按默认顺序补在末尾。这样以后加标签页时，老偏好也能自动带上新标签。
 */
export function normalizeTabOrder(value: unknown): TabRoute[] {
  const seen = new Set<TabRoute>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isTabRoute(item)) {
        seen.add(item);
      }
    }
  }
  for (const route of TAB_ROUTES) {
    seen.add(route);
  }
  return [...seen];
}

interface StoredNavigationPreferences {
  order?: unknown;
  defaultTab?: unknown;
}

/**
 * 解析 `app_meta` 里的一段 JSON。
 *
 * 缺失、空串、坏 JSON 都回退到默认；顺序按 `normalizeTabOrder` 收拾；
 * 默认页只认这几个已知路由，认不出来就回到时间轴。
 */
export function parseNavigationPreferences(value: string | null | undefined): NavigationPreferences {
  const fallback = defaultNavigationPreferences();
  if (!value) {
    return fallback;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fallback;
  }

  const stored = typeof parsed === 'object' && parsed !== null ? (parsed as StoredNavigationPreferences) : {};
  const order = normalizeTabOrder(stored.order);
  const defaultTab = isTabRoute(stored.defaultTab) ? stored.defaultTab : DEFAULT_TAB_ROUTE;
  return { order, defaultTab };
}

/** 存进 `app_meta` 的形状；解析与写入严格互逆。 */
export function serializeNavigationPreferences(preferences: NavigationPreferences): string {
  return JSON.stringify({ order: preferences.order, defaultTab: preferences.defaultTab });
}

/**
 * 把某个标签左移（`-1`）或右移（`1`）一格。
 *
 * 越界时原样返回一份新数组：调用方（按钮）会在两端禁用，
 * 但纯函数自己也不制造重复或空洞。
 */
export function moveTab(order: readonly TabRoute[], route: TabRoute, offset: -1 | 1): TabRoute[] {
  const index = order.indexOf(route);
  const target = index + offset;
  const next = [...order];
  if (index < 0 || target < 0 || target >= next.length) {
    return next;
  }

  const [moved] = next.splice(index, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(target, 0, moved);
  return next;
}
