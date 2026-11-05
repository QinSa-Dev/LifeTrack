# 20 · 组件级测试：在单元测试与端到端之间补一层

## 1. 本次完成了什么

**现在可以做什么**

- 用 `npm test` 跑组件测试：**14 个套件 / 71 个用例**，和原有单元测试一起约 3 秒跑完。
- 覆盖十四块界面规则：通用按钮、时间轴单条记录行、合并行、筛选与排序面板、周期月视图、
  自定义字段取值、撤销提示条、症状统计卡片、记账的顶部时间 / 列表行 / 底部表单 / 账单分析、
  年份选择、导航设置卡。
- 只跑其中一块：`npm test -- src/features/ledger/__tests__/ledgerEntryForm-test.tsx`。

**解决了什么问题**

| 层 | 能证明什么 | 跑一次 |
| --- | --- | --- |
| 单元 / 仓储测试 | SQL、纯函数、领域规则对不对 | 约 2 秒 |
| **组件测试（本次新增）** | 界面在给定数据下**渲染出什么、点了会怎样** | 约 1 秒 |
| Maestro 端到端 | 真模拟器上点得通、真的落进库 | 约 10 分钟 |

在补这一层之前，界面只有「最快 10 分钟」和「一条都没测」两个选项。像
「计数型 +1 的行右侧不再重复显示 +1」「区间外的日期点不动」「三颗『全部』各管一组」
这类规则，以前只能靠人工点或读代码确认；现在改坏了会立刻挂测试。

**明确没有做什么**

- **没有 mock 数据库，也没有渲染带数据库的页面**：测试只覆盖纯展示组件。
- **没有测导航、原生弹窗、文件选择、分享面板**：这些仍由 Maestro 覆盖。
- **没有快照测试，也没有覆盖率门槛**：断言的是行为，不是 DOM 形状。
- **没有替换 Maestro**：组件测试证明「这一块渲染逻辑对」，端到端证明「真的能写进库」，两者不能互相替代。

## 2. 修改了哪些文件

| 文件 | 职责 | 本次修改 |
| --- | --- | --- |
| `package.json` | 依赖与命令 | devDependencies 新增 `@testing-library/react-native@14`；dependencies 补顶层 `expo-asset`（原因见 3.4）；命令不变，仍是 `npm test` |
| `app.json` | Expo 配置 | `expo install` 自动把 `expo-asset` 加进 `plugins`；无参数时插件是空操作，不改变原生行为 |
| `src/components/__tests__/button-test.tsx` | `Button` | 可见文字、`accessibilityLabel` 覆盖读屏名字、`disabled` 拦点击 |
| `src/features/records/__tests__/recordRow-test.tsx` | `RecordRow` | +1 去重、增量 > 1 的取值与属性、补录标记、禁用标记、定义已删、两个回调 |
| `src/features/records/__tests__/recordGroupRow-test.tsx` | `RecordGroupRow` | 合并摘要、展开 / 收起、逐条内容、+1 抄最近一条、定义已删、禁用 |
| `src/features/records/__tests__/timelineQueryPanel-test.tsx` | `TimelineQueryPanel` | 事件名 / 类型 / 来源 / 分组 / 排序各改一项时只动自己，三颗「全部」互不串台，选中态 |
| `src/features/cycles/__tests__/monthCalendar-test.tsx` | `MonthCalendar` | 月份与星期表头、区间内可点、区间外禁用、今天 / 选中态、记录标记、翻月按钮 |
| `src/features/records/__tests__/fieldValuePicker-test.tsx` | `FieldValuePicker` | 单选互斥、多选叠加、时间点输入、时间段两头各改一头、清空回到空数组 |
| `src/features/records/__tests__/undoBar-test.tsx` | `UndoBar` | 撤销 / 关闭两个出口、撤销中改文案并双双禁用 |
| `src/features/cycles/__tests__/symptomStatsCard-test.tsx` | `SymptomStatsCard` | 无记录 / 有记录无症 / 按天数排序与百分比 / 只列前 N 种 / 软删除不计入 |
| `src/features/ledger/__tests__/monthPicker-test.tsx` | `MonthPicker` | 右侧年份、月份下拉默认收起、展开后 12 个月、当前月选中、点月只换月、年份箭头逐年翻 |
| `src/features/ledger/__tests__/ledgerEntryRow-test.tsx` | `LedgerEntryRow` | 备注 / 时间 / 带符号金额、无备注回落到方向、复制 / 删除各走各的回调（未激活的一侧对读屏隐藏） |
| `src/features/ledger/__tests__/ledgerEntryForm-test.tsx` | `LedgerEntryForm` | 空金额拦截、元转分、支出 / 收入切换、输入清洗、提交失败留在表单、取消 |
| `jest.setup.ts` | Jest 全局准备 | 把 `@expo/vector-icons/Ionicons` 换成空组件，避免单测环境没有 asset registry 时字体加载报错（见 3.7） |
| `src/features/records/__tests__/fixtures.ts` | 测试夹具 | 固定时间戳 + `makeRecord` / `makeGroup`；不是测试文件，不会被 `testMatch` 当用例 |

## 3. 涉及哪些技术概念

### 3.1 组件测试补的是哪一段

- **单元测试**：一个函数、一个仓储方法。快，但看不到 JSX 分支。
- **组件测试**：把组件渲染成一棵可查询的树，模拟点击 / 输入，断言「屏幕上出现什么」。
  不启动模拟器，也不连数据库。
- **端到端测试**：从真实点击到真实 SQLite。慢，但能证明整条链路。

组件测试刻意**不碰真实数据库**：一旦需要 DB、路由或原生模块，就说明该交给 Maestro，
或者先把逻辑抽成纯函数（项目里 `formatRowValue`、`groupRecordsByDefinition`、
`timelineQuery`、`calendar` 都是这么做的）。

### 3.2 查询优先按「用户和读屏能感知到的接口」

`@testing-library/react-native`（RNTL）不鼓励按组件名或样式查，而是按角色、名字、文字查：

```tsx
// 按无障碍角色 + 名字找按钮：名字可能是可见文字，也可能是 accessibilityLabel
screen.getByRole('button', { name: '删除「健康」' });

// 按日期格的朗读文字找：正则只匹配稳定的前半段
screen.getByLabelText(/日历 2026-10-03/);

// 断言「没有」用 queryBy，不要用 getBy
expect(screen.queryByText('未分组')).not.toBeOnTheScreen();
```

两个匹配器直接读 `accessibilityState`，不是读样式：

- `toBeDisabled()`：月视图区间外的日期、归档事件的【+1】；
- `toBeSelected()`：筛选胶囊、月视图选中的那天。

这条习惯和 Maestro 一样：**可访问性文字就是测试接口**（见 [15](./15-maestro-e2e.md)）。
它顺带保证读屏用户拿到的是同一套信息。

### 3.3 `render` 和 `fireEvent` 都是异步的，必须 `await`

RNTL 14 起，`render`、`fireEvent`、`rerender`、`unmount` 全部返回 Promise。
漏掉 `await` 不会立刻报错，而是先出现：

```
You seem to have overlapping act() calls, this is not supported.
```

然后**后续用例莫名其妙找不到元素**。本次第一版就踩了这个坑：前 5 条过、后 3 条挂。
正确写法：

```tsx
test('点【+1】触发回调', async () => {
  const onRepeat = jest.fn();
  await render(<RecordRow record={makeRecord()} onRepeat={onRepeat} />);

  await fireEvent.press(screen.getByRole('button', { name: '+1' }));

  expect(onRepeat).toHaveBeenCalledTimes(1);
});
```

Jest 的 `test` 回调也要写成 `async`。**这是新写组件测试时最容易忘的一条。**

### 3.4 为什么补了顶层 `expo-asset`

Jest 第一次跑组件测试时报：

```
Cannot find module 'expo-asset' from 'node_modules/expo-font/build/FontLoader.js'
```

原因不是应用缺依赖，而是解析路径：`expo-asset` 被 npm 嵌套装在
`node_modules/expo/node_modules/expo-asset`，而 `expo-font` 在顶层，Node 从它向上找时找不到。
`components/index.ts` 会带出 `Header` → `@expo/vector-icons` → `expo-font`，
所以连只测 `RecordRow` 也会触发。

处理方式是 `npx expo install expo-asset`，把它提到顶层。`expo export` 与模拟器此前都正常，
这次改动**只是让 Node/Jest 也能解析到同一个包**，不是修运行时 bug。

### 3.5 断言行为，不复制实现

几个例子说明这些用例想守住什么：

| 用例 | 守的规则 |
| --- | --- |
| `getAllByText('+1')` 长度为 1 | 计数型 +1 的取值**不显示**，否则和按钮文字撞脸。若哪天把取值也渲染出来，数量变 2，测试挂 |
| 增量 3 时 `getByText('+3 200ml')` | 增量大于 1 仍要显示取值，且属性回落到快照 |
| 未展开时 `queryByText('逐条内容')` 为空 | 合并行折叠时**不渲染**子行，而不是渲染后藏起来 |
| 三颗「全部」只点第一颗 | 类型 / 来源 / 分组是三个独立筛选项，不能一起清空 |
| 区间外日期 `toBeDisabled()` 且回调未调用 | 界面先挡一层，仓储的越界校验仍是最后一道 |

没有一条断言依赖字号、颜色或内部 state；改样式不会误伤。

### 3.6 受控组件：断言回调之后要自己「把值送回去」

`FieldValuePicker`、`TimelineQueryPanel` 这类组件都是**受控**的：点一下只调 `onChange`，
界面会不会变取决于调用方。组件测试里如果不 `rerender`，下一次点击仍按**初始 props** 算，
例如「多选先加一个再删掉刚加的」就会得到意料之外的结果。写法：

```tsx
await fireEvent.press(screen.getByRole('button', { name: '一般' }));
expect(onChange).toHaveBeenLastCalledWith(['好', '一般']);

// 受控组件：把回调结果重新交给它，界面才会更新
await screen.rerender(<FieldValuePicker field={field} values={['好', '一般']} onChange={onChange} />);
```

只想验证「这一下提交什么」时，单独断言 `onChange` 就够了；要验证「选中的胶囊真的变了」，
就必须补这一次 `rerender`。

### 3.7 图标组件为什么要全局 mock

记账行与记账页用到 `@expo/vector-icons/Ionicons`。它在挂载时会异步加载字体；单测环境没有
Metro 打包后的 asset registry，直接渲染会报：

```
Module "1" is missing from the asset registry
```

图标对行为没有影响，所以 `jest.setup.ts` 里把它换成一个空 `View`：

```ts
jest.mock('@expo/vector-icons/Ionicons', () => {
  const mockReact = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return { __esModule: true, default: () => mockReact.createElement(View) };
});
```

`jest.config.js` 通过 `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']` 加载它。
这样组件测试仍按文字 / 角色查询，不会因为一个装饰图标把整页渲染拖垮。

## 4. 覆盖范围与边界

| 测试文件 | 用例 | 覆盖的行为 |
| --- | --- | --- |
| `button-test.tsx` | 3 | 可见文字、读屏名字可覆盖、禁用时点击无效 |
| `recordRow-test.tsx` | 6 | 取值展示规则、补录标记、归档 / 定义已删、点行与点【+1】 |
| `recordGroupRow-test.tsx` | 7 | 合并摘要、展开 / 收起、子内容条件渲染、【+1】取最近一条 |
| `timelineQueryPanel-test.tsx` | 8 | 五类筛选与排序的局部更新、无分组时的隐藏、选中态 |
| `monthCalendar-test.tsx` | 6 | 网格与表头、区间边界、今天 / 选中、记录标记、翻月 |
| `fieldValuePicker-test.tsx` | 7 | 单选 / 多选 / 时间点 / 时间段的取值与回调 |
| `undoBar-test.tsx` | 3 | 两个出口互不串台、撤销中改为「撤销中…」并禁用 |
| `symptomStatsCard-test.tsx` | 5 | 三种空态、按天数排序与百分比、只列前 N 种、软删除不计入 |
| `monthPicker-test.tsx` | 3 | 右侧年份、月份下拉默认收起、展开后 12 个月、当前月选中、点月只换月、年份箭头 |
| `yearPicker-test.tsx` | 2 | 默认收起、展开列出年份、当前年选中、选完自动收起 |
| `ledgerEntryRow-test.tsx` | 5 | 备注 / 时间 / 带符号金额、无备注回落到方向、点行回调、标签胶囊、复制 / 删除回调 |
| `ledgerEntryForm-test.tsx` | 8 | 空金额、元转分、方向切换、输入清洗、提交失败、取消、标签长度、编辑模式预填 |
| `ledgerAnalysis-test.tsx` | 3 | 月账单概览 / 每日柱状图 / 构成 / 排行、只有收入时说明、年账单 12 个月标签 |
| `navigationSettingsCard-test.tsx` | 5 | 五个标签顺序与两端禁用、左移 / 右移、默认页选择、偏好写失败提示 |

合计 **14 个套件 / 71 个用例**。

**仍未覆盖**

- 带数据库的页面：分组管理卡、事件表单、记录详情、回收站、设置。
  这些需要 Provider + `expo-sqlite` 或更完整的 mock，成本高于本次目标。
- 导航与路由参数、`Alert` 二次确认、文件选择 / 分享面板。
- 加载中 / 错误态 / 空状态在真实页面里的组合。
- 样式与布局（没有快照，也不打算用快照替代行为断言）。

下一批候选：事件定义表单的校验分支（需要先解决 `useReadyDatabase` 的依赖，
或把校验抽成纯函数）、`GroupManager` 的「改名要带全字段」与键盘提交、
`RecordRow` / `RecordGroupRow` 在时间轴里展开后的子行顺序（数据层已由
`groupRecords-test` 兜底）。

## 5. 怎么跑

```bash
npm test                                  # 全部：54 个套件 / 692 个用例
npm test -- src/components/__tests__      # 只跑组件测试
npm test -- src/features/ledger/__tests__ # 只跑记账相关
npm run verify                            # typecheck + lint + test
npm run format:check                      # 提交前
```

组件测试不需要模拟器、不需要 Metro、不写文件、不连数据库，所以可以在任何机器上跑。

## 6. 已知的取舍

- **三颗「全部」按渲染顺序取**：测试里用 `getAllByText('全部')[1]` 之前先断言共 3 颗。
  如果以后调整筛选组的顺序，这条用例要跟着改——这是「不加 `testID`」的代价，
  换来的是测试和用户看到的结构一致。
- **`+1` 按钮对读屏仍是通用名字**：组件测试无法区分「哪一行的 +1」，
  这是产品上有意为之（见 `HANDOFF.md` 第 10 节），不是测试缺口。
- **没有覆盖率门槛**：新增套件后总覆盖率会变，但 `npm test` 默认不采集覆盖率；
  仍以「关键规则有没有用例」为准，不追数字。