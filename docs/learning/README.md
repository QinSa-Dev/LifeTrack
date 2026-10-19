# LifeTrack 开发指北（学习导航）

这套文档不是 React / TypeScript / SQLite 的通用教程，而是**围绕 LifeTrack 仓库里真实存在的代码**写的走读材料。
每一节都引用真实文件、真实函数名和真实命令；如果某个能力还没实现，文档会明确说「尚未实现」，不会把计划写成现状。

> 读者前提：了解基本编程逻辑，但不熟悉 React / React Native / TypeScript。
> 英文技术名词保留，第一次出现时解释。

## 一、现在进展到哪一步

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 第一阶段 | 工程基线：Expo 工程、导航骨架、领域模型类型、统一错误、UUID 方案、SQLite 初始化、版本化迁移、Repository 层、主题与基础 UI、检查与测试命令 | **已完成并已验证** |
| 第二阶段第 1 项 | 事件定义 / 分组 / 标签 / 快捷选项 / 归档 | 未开始 |
| 第二阶段第 2–8 项 | counter、quantity、补录与撤销、周期、时间轴与统计、导入导出、永久删除一致性 | 未开始 |

第一阶段「已完成」的含义是：下面的命令都真实跑过并且通过了。

```bash
npm run typecheck   # TypeScript 静态检查
npm run lint        # ESLint
npm test            # Jest：4 个套件 / 32 个用例
npm run doctor      # expo-doctor：20/20
```

运行验证（模拟器，不是真机）：iOS Simulator（iPhone 17 Pro / iOS 26.3 / Expo Go 58.0.4）与 Android 模拟器
（Pixel 9 / API 36 / Expo Go 58.0.4）都能打开应用、渲染三个标签页，并且 SQLite 数据能跨重启保留。

## 二、已完成功能 → 对应文档

| 已完成的可见能力 | 读哪一篇 |
| --- | --- |
| `npm start` 起开发服务器，用 Expo Go 打开应用，工程能打包能跑 | [01-project-bootstrap.md](./01-project-bootstrap.md) |
| 看到卡片、按钮、徽章、空状态这些界面元素，以及浅色主题 | [02-react-native-ui.md](./02-react-native-ui.md) |
| 领域模型（事件定义 / 记录 / 快照 / 周期）、统一错误、UUID v7 主键 | [03-typescript-domain-model.md](./03-typescript-domain-model.md) |
| SQLite 初始化、版本化迁移、Repository 写入读取 | [04-sqlite-and-repository.md](./04-sqlite-and-repository.md) |
| 「启动次数 +1」这个最小持久化闭环：从界面动作到落盘再到回读 | [05-business-logic-and-data-flow.md](./05-business-logic-and-data-flow.md) |
| 底部三个标签页、页面之间怎么跳、状态怎么在组件间传递 | [06-navigation-and-state.md](./06-navigation-and-state.md) |
| 怎么跑检查与测试、测试覆盖了什么、遇到问题怎么查 | [07-testing-and-debugging.md](./07-testing-and-debugging.md) |

### 为什么暂时没有 08、09

建议目录里还列了 `08-data-backup-and-restore.md` 和 `09-architecture-and-future-extension.md`。
它们对应的功能（JSON/CSV 导入导出、整体架构演进）属于第二阶段第 7 项及之后，**代码还不存在**。
按照「不以文件名和猜测充数、不制造空文档」的原则，这两篇会在功能落地时再写。

`06-navigation-and-state.md` 提前写了，是因为「目录结构与基础导航」本身就是第一阶段的交付物，
而且状态管理（Context + Hook）在第一阶段就已经有了真实代码可讲。

## 三、推荐阅读顺序

第一次读，按编号顺着读：

1. **[01 工程基线](./01-project-bootstrap.md)** —— 先把「这个项目是什么、怎么跑起来、每个配置文件管什么」搞清楚。
2. **[02 React Native 界面](./02-react-native-ui.md)** —— 认识 JSX、组件、props 和样式，明白屏幕上的东西是怎么画出来的。
3. **[03 TypeScript 领域模型](./03-typescript-domain-model.md)** —— 认识 type / interface / 联合类型 / 类型守卫，以及 LifeTrack 的业务约束是怎么写进类型里的。
4. **[04 SQLite 与 Repository](./04-sqlite-and-repository.md)** —— 认识数据库、迁移、事务，以及为什么 SQL 只能写在仓储层。
5. **[05 业务逻辑与数据流](./05-business-logic-and-data-flow.md)** —— 把上面四篇串起来，走一遍「启动次数」这个真实的最小闭环。
6. **[06 导航与状态](./06-navigation-and-state.md)** —— 页面之间怎么连、状态怎么流。
7. **[07 测试与调试](./07-testing-and-debugging.md)** —— 怎么证明代码是对的，出问题怎么排查。

如果只想快速走读一遍项目，读 **01 → 05 → 06** 这三篇就够；03、04 是用来建立类型与数据层认知的。

## 四、已经接触过的技术概念

| 概念 | 属于 | 出现在哪篇 |
| --- | --- | --- |
| npm / package.json / 依赖版本号 `~` `^` | 工程 | 01 |
| Expo / Expo Go / Metro 打包 / 开发服务器 | 工程 | 01 |
| `app.json` 配置与 Config Plugin、CNG（不手写 ios/android 目录） | 工程 | 01 |
| TypeScript 配置：`strict`、`noUncheckedIndexedAccess`、路径别名 `@/*` | 工程 | 01、03 |
| 编译期类型检查 与 运行时行为 的区别 | TypeScript | 01、03、07 |
| JSX、组件、props、`children`、条件渲染 | React | 02 |
| View / Text / Pressable / ScrollView / ActivityIndicator | React Native | 02 |
| `StyleSheet.create`、样式数组、flex 布局、SafeAreaView | React Native | 02 |
| `type` vs `interface`、可选属性、联合类型、`as const` | TypeScript | 03 |
| 类型守卫（type predicate）、泛型 `<T>` | TypeScript | 03 |
| 类继承、`instanceof`、`new.target.name`、`cause` | TypeScript / JS | 03 |
| UUID v7、字节与位运算、单调递增 | 领域设计 | 03 |
| SQLite 文件数据库、表 / 主键 / 行、`PRAGMA` | SQLite | 04 |
| WAL、`foreign_keys`、`busy_timeout` | SQLite | 04 |
| 事务与原子性（`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`） | SQLite | 04 |
| 数据库迁移、`PRAGMA user_version`、幂等 | 数据库工程 | 04 |
| UPSERT（`ON CONFLICT DO UPDATE`）、参数化查询 `?` | SQL | 04 |
| Repository 模式、依赖倒置（`SqlExecutor` 接口） | 架构 | 04 |
| `async/await`、`Promise`、`Promise.all`、异常处理 | JavaScript | 03、04、05 |
| React Context、`useState` / `useEffect` / `useMemo` / `useCallback` | React | 05、06 |
| 自定义 Hook、`useFocusEffect` | React / expo-router | 05、06 |
| 文件即路由、`_layout.tsx`、Stack / Tabs、类型化路由 | expo-router | 06 |
| Jest：`describe` / `it` / `expect`、fixture、真实依赖 vs mock | 测试 | 07 |
| `tsc` / ESLint / Prettier 三者分工 | 工程 | 07 |

## 五、还没有学到的内容

这些会在对应功能落地后才讲，现在不提前堆术语：

- 表单与输入（`TextInput`、受控组件、输入校验）—— 第二阶段第 1 项会用到。
- 长列表性能（`FlatList`）与列表交互 —— 第二阶段时间轴会用到。
- 日期与时间的处理策略（`occurredAt` / `recordedAt` / 时区）—— 第二阶段补录会用到。
- 软删除与撤销（`deletedAt`、undo 栈）—— 第二阶段第 4 项。
- JSON / CSV 导入导出、冲突合并、事务一致性校验 —— 第二阶段第 7、8 项。
- 深链接与通知跳转 —— 目前只有 `scheme: "lifetrack"` 配置，没有业务用途。
- 深色主题 —— `theme/index.ts` 里留了 `useTheme()` 的接口，但还没接。

## 六、当前整体架构（第一阶段）

```
                      ┌─────────────────────────────────────┐
   src/app/           │ expo-router 文件路由（每个文件=一屏）  │
                      │ _layout.tsx  →  Stack                │
                      │  (tabs)/_layout.tsx → Tabs（三标签）  │
                      └───────────────┬─────────────────────┘
                                      │ 屏里只用通用组件 + Hook
                      ┌───────────────▼─────────────────────┐
   src/components/    │ AppText / Badge / Button / Card      │
                      │ Screen / EmptyState                  │
                      │ DatabaseGate（数据库门禁）             │
                      └───────────────┬─────────────────────┘
                                      │ 只读 Hook，不写 SQL
                      ┌───────────────▼─────────────────────┐
   src/db/            │ DatabaseProvider（Context：状态机）   │
                      │ client.ts（唯一连接入口 + PRAGMA）    │
                      │ migrations.ts（user_version + 事务）  │
                      │ schema.ts（迁移清单）                 │
                      │ types.ts（SqlExecutor 抽象）          │
                      └───────────────┬─────────────────────┘
                                      │ 仓储是唯一写 SQL 的地方
                      ┌───────────────▼─────────────────────┐
   src/repositories/  │ MetaRepository（app_meta 读写）       │
                      └───────────────┬─────────────────────┘
                                      │
                      ┌───────────────▼─────────────────────┐
   src/domain/        │ models.ts 领域模型                    │
                      │ errors.ts 统一错误（AppError + code） │
                      │ id.ts     UUID v7                    │
                      └─────────────────────────────────────┘
                                      │
                              SQLite 文件 lifetrack.db
```

职责边界（这是本项目的硬约定，第二阶段也要遵守）：

- **界面层** 只负责展示与交互，不出现 SQL。
- **仓储层** 是唯一写 SQL 的地方，对外只暴露业务语义方法。
- **领域层** 定义类型与规则，不依赖 React、也不依赖数据库。
- **数据库基础设施层** 负责连接、PRAGMA、迁移、错误归一。

## 七、文档写作约定

- 代码片段都从仓库真实文件里摘，符号名（函数名、组件名、类型名）与当前代码一致；行号会变，所以优先用符号名定位。
- 每个「概念」都按 4 个问题讲：它是什么、为什么本项目需要、用在哪个真实文件、不用会出什么问题。
- 明确区分「编译期检查」和「运行时行为」。
- 验证章节里会写清楚：**哪些是真跑过的，哪些没跑过**。
- 发现现有代码有问题时，会直接写问题、影响和改进方案，而不是只描述现状。