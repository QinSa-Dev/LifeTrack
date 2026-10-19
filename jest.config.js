/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // 只把 __tests__ 下的 *-test.ts(x) 当作测试，避免把测试辅助文件当成用例
  testMatch: ['<rootDir>/src/**/__tests__/**/*-test.ts?(x)'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/app/**', '!src/**/__tests__/**', '!src/**/testing/**'],
};
