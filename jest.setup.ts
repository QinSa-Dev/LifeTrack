/**
 * Jest 全局准备。
 *
 * 组件里用到的 `@expo/vector-icons` 会在挂载时异步加载字体文件；单测环境没有
 * 打包后的 asset registry，直接渲染会报 `Module "1" is missing from the asset registry`。
 * 图标对行为没有影响，统一换成空组件，让组件测试只关心文字与按钮。
 */
jest.mock('@expo/vector-icons/Ionicons', () => {
  const mockReact = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: function MockIonicons() {
      return mockReact.createElement(View);
    },
  };
});

/**
 * 组件里用 `useSafeAreaInsets` 给底部安全区留白；单测没有真的 SafeAreaProvider，
 * 官方 mock 会让它回落到全 0 的 insets，同时仍保留 `SafeAreaView` 等真实实现。
 */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
