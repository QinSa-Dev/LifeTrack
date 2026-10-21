# LifeTrack 开发指北（学习导航）

这套文档不是 React / TypeScript / SQLite 的通用教程，而是**围绕 LifeTrack 仓库里真实存在的代码**写的走读材料。
每一节都引用真实文件、真实函数名和真实命令；如果某个能力还没实现，文档会明确说「尚未实现」，不会把计划写成现状。

> 读者前提：了解基本编程逻辑，但不熟悉 React / React Native / TypeScript。
> 英文技术名词保留，第一次出现时解释。

## 一、现在进展到哪一步

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 第一阶段 | 工程基线：Expo 工程、导航骨架、领域模型类型、统一错误、UUID 方案、SQLite 初始化、版本化迁移、Repository 层、主题与基础 UI、检查与测试命令 | **已完成并已验证** |
| 第二阶段第 1 项 | 事件定义 / 分组 / 标签 / 快捷选项 / 归档 | **已完成**（本文档 `08`） |
| 第二阶段第 2 项 | counter / quantity 记录与时间轴 | **已完成**（本文档 `09`） |
| 第二阶段（补录与撤销） | 补录过去发生的事实、软删除与撤销 | **已完成**（本文档 `10`） |
| 第二阶段（周期事件） | 周期定义 / 周期实例 / 周期内记录、区间规则 | **已完成**（本文档 `11`） |
| 第二阶段（统计） | 时间轴统计（从事实数据聚合）、时间轴 FlatList 虚拟化 | **已完成**（本文档 `12`） |
| 第二阶段（永久删除） | 事件记录的回收站与真删（「软删除 → 撤销 → 真删」闭环） | **已完成**（本文档 `13`） |
| 第二阶段剩余项 | 导入导出、周期日历/症状统计、周期记录回收站 | 未开始 |

第一阶段「已完成」的含义是：下面的命令都真实跑过并且通过了。

```bash
npm run typecheck   # TypeScript 静态检查
npm run lint        # ESLint
npm test            # Jest：4 个套件 / 32 个用例
npm run doctor      # expo-doctor：20/20
```

第二阶段各项完成后（目前 `npm test` 为 17 个套件 / 228 个用例），新增命令同样跑过：

```bash
npm run typecheck                        # 通过
npm run lint                             # 通过（0 error / 0 warning）
npm test                                 # 17 个套件 / 228 个用例
npm run format:check                     # 通过
npx expo export --platform ios           # 打包通过（js bundle 2.9MB）
```

运行验证（都是模拟器，不是真机）：

- **第一阶段**：iOS Simulator（iPhone 17 Pro / iOS 26.3 / Expo Go 58.0.4）与 Android 模拟器
  （Pixel 9 / API 36 / Expo Go 58.0.4）都能打开应用、渲染标签页，并且 SQLite 数据能跨重启保留。
- **第二阶段**：已在本机 iOS Simulator（iPhone 16e / iOS 26.3 / Expo Go 58.0.5）实机打开，
  用 deep link 逐页走了一遍，**时间轴、统计、事件、周期、设置五个标签页**加上
  **回收站、记录页、周期实例页**都能正常渲染真实 SQLite 数据，Metro 无 JS 报错。
  为了让页面有内容，示例数据是**直接写进模拟器数据库**的。
- **仍未验证（如实记录）**：本机没有可用的自动化点击（模拟器未授予辅助功能权限），
  所以**没有手动点按走通写入路径**（点一下记录、删除并撤销、回收站恢复/永久删除的二次确认弹窗）；
  这些目前只有单元测试覆盖。Android 与真机也没有跑过。

## 二、已完成功能 → 对应文档

| 已完成的可见能力 | 读哪一篇 |
| --- | --- |
| `npm start` 起开发服务器，用 Expo Go 打开应用，工程能打包能跑 | [01-project-bootstrap.md](./01-project-bootstrap.md) |
| 看到卡片、按钮、徽章、空状态这些界面元素，以及浅色主题 | [02-react-native-ui.md](./02-react-native-ui.md) |
| 领域模型（事件定义 / 记录 / 快照 / 周期）、统一错误、UUID v7 主键 | [03-typescript-domain-model.md](./03-typescript-domain-model.md) |
| SQLite 初始化、版本化迁移、Repository 写入读取 | [04-sqlite-and-repository.md](./04-sqlite-and-repository.md) |
| 「启动次数 +1」这个最小持久化闭环：从界面动作到落盘再到回读 | [05-business-logic-and-data-flow.md](./05-business-logic-and-data-flow.md) |
| 底部标签页（现为时间轴 / 事件 / 周期 / 设置）、页面之间怎么跳、状态怎么在组件间传递 | [06-navigation-and-state.md](./06-navigation-and-state.md) |
| 怎么跑检查与测试、测试覆盖了什么、遇到问题怎么查 | [07-testing-and-debugging.md](./07-testing-and-debugging.md) |
| 事件定义 / 分组 / 标签 / 快捷选项 / 归档：v2 迁移、表单、二级路由、多表聚合 | [08-event-definitions.md](./08-event-definitions.md) |
| 记录一次事件（counter / quantity）、快照、时间轴：v3 迁移、发生时间 vs 录入时间 | [09-event-recording.md](./09-event-recording.md) |
| 补录与撤销：本地时间 ↔ UTC、日期解析与溢出、软删除的幂等与撤销 | [10-backfill-and-undo.md](./10-backfill-and-undo.md) |
| 周期事件：日历日期运算、区间重叠、边界修改「不静默删除」、一天一条的 UPSERT | [11-cycle-tracking.md](./11-cycle-tracking.md) |
| 统计：从事实数据聚合（不落汇总表）、本地时区分天/周、单位不一致不合并、时间轴 FlatList 虚拟化 | [12-statistics.md](./12-statistics.md) |
| 回收站与永久删除：软删除 vs 真删、`Alert` 二次确认、单条 DELETE 的原子性 | [13-permanent-delete-and-trash.md](./13-permanent-delete-and-trash.md) |

### 为什么还缺几篇编号

建议目录里还列了和「数据备份恢复」「整体架构演进」对应的篇章。
按「不以文件名和猜测充数、不制造空文档」的原则，它们会在功能真正落地时再写——
导入导出（JSON/CSV）与架构演进仍属于第二阶段后续项，**代码还不存在**。

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
8. **[08 事件定义](./08-event-definitions.md)** —— 第二阶段第 1 项：从 v2 迁移到表单、二级路由与多表聚合的前后端闭环。
9. **[09 事件记录](./09-event-recording.md)** —— 第二阶段第 2 项：v3 迁移、快照写入、occurredAt/recordedAt 与时间轴。
10. **[10 补录与撤销](./10-backfill-and-undo.md)** —— 补录（本地时间 ↔ UTC、日期解析）与软删除/撤销（幂等）。
11. **[11 周期事件](./11-cycle-tracking.md)** —— 周期定义 / 实例 / 每日记录：日历日期运算、区间规则，以及「改边界不悄悄删记录」。
12. **[12 统计](./12-statistics.md)** —— 从事实数据聚合（不落汇总表）、本地时区分天/周、单位不一致不合并，以及时间轴 `FlatList` 虚拟化。
13. **[13 回收站与永久删除](./13-permanent-delete-and-trash.md)** —— 软删除与真删分成两级，回收站承载「恢复 / 永久删除」。

如果只想快速走读一遍项目，读 **01 → 05 → 06** 这三篇就够；03、04 是用来建立类型与数据层认知的，
08–13 用来了解业务功能是怎么一步步搭起来的。

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
| 表单受控输入（`TextInput` + `useState`）、多选与可选中 Chip | React / RN | 08 |
| `Alert` 二次确认、`router.push` 带参跳转、typed routes 与动态段 `[id]` | React Native / expo-router | 08 |
| 仓储聚合根：一张「定义」背后三张表、批量读取避免 N+1、`withExclusiveTransactionAsync` 多表写入 | 架构 / SQLite | 08 |
| 外键行为：`ON DELETE SET NULL` vs `ON DELETE CASCADE` 的语义差异 | SQLite | 08 |
| 历史快照不可篡改：记录时固化定义，删改定义不影响历史 | 领域设计 | 09 |
| `occurredAt`（事实发生）与 `recordedAt`（录入）分离、时间轴按 `occurred_at` 排序 | 领域设计 / SQL | 09 |
| 软删除（`deleted_at` + `isVisibleRecord`）与「无外键保历史」的取舍 | SQLite / 架构 | 09 |
| 本地时间 ↔ UTC ISO-8601 的转换、日期解析与溢出校验（`Date` 的字段回读法） | JavaScript / 领域 | 10 |
| 补录的「不能是未来」校验：为什么用 `Date.parse` 而非字符串比较 | 领域设计 | 10 |
| 幂等写入（重复软删除不覆盖原时间、重复恢复不报错） | 领域设计 / SQLite | 10 |
| 乐观撤销（先删再给撤销入口）vs `Alert` 二次确认：各自适用场景 | 交互 / React Native | 10 |
| 纯日历日期（`IsoDate`）与「时刻」的区别、用 `Date.UTC` 做日历加减 | 领域设计 / JavaScript | 11 |
| 字典序即时间序：定长 `YYYY-MM-DD` 字符串可直接比较 | JavaScript / SQL | 11 |
| `ConflictError` vs `ValidationError`：输入不合法 vs 输入合法但与现有数据冲突 | 领域设计 | 11 |
| 「不许静默丢数据」：把规则做成一次会拒绝的校验，并在报错里带上下文（`details`） | 领域设计 / 架构 | 11 |
| 区间重叠判定（进行中 = 开区间）、`UNIQUE(instance_id, date)` + UPSERT 表达「一天一条」 | SQL / 领域设计 | 11 |
| 三层下钻路由（标签页 → 定义详情 → 实例详情）与新增路由后的 typed routes 重新生成 | expo-router | 11 |
| 反向断言测试：不只验证「被拒绝」，还验证「被拒绝后数据一条没少」 | 测试 | 11 |
| 「统计从事实算」而不是维护汇总表：以事实数据为唯一真相 | 架构 / 领域设计 | 12 |
| 纯函数聚合（分桶函数 `keyOf` 参数化）、本地时区分天/周的边界 | 领域设计 / JavaScript | 12 |
| 统计敢于「不给数字」：单位不一致不合并计量 | 领域设计 / 交互 | 12 |
| `FlatList` 虚拟化、`ListHeaderComponent` / `ListEmptyComponent`、容器与行的职责分离 | React Native | 12 |
| 「删除」其实是两级：可撤销的软删除 + 不可逆的真删 | 领域设计 | 13 |
| 二次确认（`Alert`）：破坏性操作的界面护栏；仓储只负责原子地删 | 交互 / React Native | 13 |
| 不必为单条 `DELETE` 套事务；`changes === 0` 视为「不存在」而不是成功 | SQLite / 架构 | 13 |

## 五、还没有学到的内容

这些会在对应功能落地后才讲，现在不提前堆术语：

- 表单与输入（`TextInput`、受控组件、输入校验）—— 已在 [08](./08-event-definitions.md) 引入，不再是「未学到」。
- 长列表性能（`FlatList`）—— 已在 [12](./12-statistics.md) 引入（时间轴改虚拟化）；更复杂的列表交互（下拉刷新、
  分组吸顶）还没用到。
- 统计与汇总 —— 分天/分周的聚合已在 [12](./12-statistics.md) 落地；**环比/同比**还没做。
- 日历式界面（可点选的月视图、按症状统计）—— 周期已能记录与回看，但还没有日历与统计视图。
- 记录的**永久删除**与一致性 —— 已在 [13](./13-permanent-delete-and-trash.md) 落地（事件记录的回收站与真删）；
  **周期内记录**仍是直接真删，回收站属后续项。
- JSON / CSV 导入导出、冲突合并、事务一致性校验 —— 第二阶段后续项。
- 深链接与通知跳转 —— 目前只有 `scheme: "lifetrack"` 配置，没有业务用途。
- 深色主题 —— `theme/index.ts` 里留了 `useTheme()` 的接口，但还没接。

## 六、当前整体架构（第一阶段 + 第二阶段已完成的各项）

```
                      ┌─────────────────────────────────────────────┐
   src/app/           │ expo-router 文件路由（每个文件=一屏）          │
                      │ _layout.tsx  →  Stack                        │
                      │  (tabs)/_layout.tsx → Tabs（五标签）          │
                      │  (tabs)/index.tsx（时间轴，FlatList）          │
                      │  (tabs)/stats.tsx（统计：概览 / 趋势 / 按事件） │
                      │  events/new.tsx / events/[id].tsx             │
                      │  record/[id].tsx（记录 / 补录 / 删除）          │
                      │  records/deleted.tsx（回收站：恢复 / 永久删除） │
                      │  cycles/new.tsx / cycles/[id].tsx（周期定义）  │
                      │  cycle-instances/[id].tsx（一段周期 + 每日记录）│
                      │  groups.tsx / tags.tsx / +not-found           │
                      └───────────────┬─────────────────────────────┘
                                      │ 通用组件 + 功能组件 + Hook
                      ┌───────────────▼─────────────────────────────┐
   src/components/    │ 基础 UI：AppText / Badge / Button             │
                      │ Card / Screen / EmptyState                    │
                      │ 表单与导航：TextField / Chip / Header          │
                      │ ListRow / DatabaseGate（数据库门禁）           │
                      ├─────────────────────────────────────────────┤
   src/features/      │ definitions/：EventDefinitionForm             │
                      │ records/：format / RecordRow / UndoBar        │
                      │ cycles/：labels / CycleDefinitionForm         │
                      │ stats/：aggregate（从事实数据聚合，纯函数）    │
                      │ common/：datetime（本地时间 ↔ UTC）            │
                      └───────────────┬─────────────────────────────┘
                                      │ 只读 Hook，不写 SQL
                      ┌───────────────▼─────────────────────────────┐
   src/db/            │ DatabaseProvider（Context：状态机）            │
                      │ client.ts（唯一连接入口 + PRAGMA）             │
                      │ migrations.ts（user_version + 事务）           │
                      │ schema.ts（迁移清单 v1 / v2 / v3 / v4）        │
                      │ types.ts（SqlExecutor 抽象）                   │
                      └───────────────┬─────────────────────────────┘
                                      │ 仓储是唯一写 SQL 的地方
                      ┌───────────────▼─────────────────────────────┐
   src/repositories/  │ MetaRepository（app_meta 读写）                │
                      │ EventGroupRepository（分组）                    │
                      │ TagRepository（标签）                           │
                      │ EventDefinitionRepository（定义聚合）           │
                      │ EventRecordRepository（历史 + 快照 + 软删除）    │
                      │ CycleDefinitionRepository（周期定义）           │
                      │ CycleInstanceRepository（周期实例 + 边界规则）   │
                      │ CycleEntryRepository（每天一条，UPSERT）        │
                      └───────────────┬─────────────────────────────┘
                                      │
                      ┌───────────────▼─────────────────────────────┐
   src/domain/        │ models.ts 领域模型 + 快照生成                  │
                      │ validation.ts 输入类型与校验规则               │
                      │ dates.ts  纯日历日期运算（不沾时区）            │
                      │ cycles.ts 周期规则（越界 / 重叠 / 预测）        │
                      │ errors.ts 统一错误（AppError + code）          │
                      │ id.ts     UUID v7                             │
                      └─────────────────────────────────────────────┘
                                      │
                              SQLite 文件 lifetrack.db
```

职责边界（这是本项目的硬约定，后续阶段也要遵守）：

- **界面层** 只负责展示与交互，不出现 SQL。
- **功能组件层（`src/features/`）** 放只服务于某个功能的组合组件（如事件定义表单）；通用 UI 仍在 `src/components/`。
- **仓储层** 是唯一写 SQL 的地方，对外只暴露业务语义方法。
- **领域层** 定义类型与规则（含输入校验），不依赖 React、也不依赖数据库。
- **数据库基础设施层** 负责连接、PRAGMA、迁移、错误归一。

## 七、文档写作约定

- 代码片段都从仓库真实文件里摘，符号名（函数名、组件名、类型名）与当前代码一致；行号会变，所以优先用符号名定位。
- 每个「概念」都按 4 个问题讲：它是什么、为什么本项目需要、用在哪个真实文件、不用会出什么问题。
- 明确区分「编译期检查」和「运行时行为」。
- 验证章节里会写清楚：**哪些是真跑过的，哪些没跑过**。
- 发现现有代码有问题时，会直接写问题、影响和改进方案，而不是只描述现状。