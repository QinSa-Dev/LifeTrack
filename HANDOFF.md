# LifeTrack 交接文档（HANDOFF）

> 面向**接手的新 agent / 新开发者**。读完这一份就能知道：项目是什么、做到哪了、怎么验证、
> 下一步该做什么、以及必须遵守的约定。细节走读见 `docs/learning/`，本文件只做「当前状态 + 行动指南」。

## 0. 一句话

LifeTrack 是一个**本地优先**的生活记录 App：记录事件（计数 / 数量）、周期事件与症状，按时间轴回看并统计。
技术栈：React Native + Expo SDK 58 + TypeScript + SQLite（expo-sqlite）。
数据全部在设备本地，**无后端、无账号、无云同步**。

## 1. 当前状态快照（写于「周期事件」完成时）

- 分支：`main`；工作区干净。
- 最新提交：用 `git log -1` 查看（本文件与「周期事件」的文档同步在同一批提交里）
- schema 版本：**v4**（`PRAGMA user_version = 4`）；周期功能**新增了 v4 迁移**（三张表）
- 验证状态（全部真实跑过）：

```bash
npm run typecheck    # 通过
npm run lint         # 通过（0 error / 0 warning）
npm test             # 16 个套件 / 209 个用例通过
npm run format:check # 通过
npx expo export --platform ios   # 通过（js bundle 2.9MB）
```

> ⚠️ **尚未在模拟器 / 真机上手动运行过第二阶段的功能**（事件定义、记录、补录/撤销、周期都只做了静态检查、单测与打包）。
> 接手后建议先用 `npm start` + Expo Go 实机走一遍，再动新代码。

**远端提醒**：本地 `main` 追踪的 `origin/main` 已不存在（`git status` 会提示 upstream gone）。
远端为 `git@github.com:QinSa-Dev/LifeTrack.git`。若要推送，先确认目标分支。

## 2. 环境与命令

Node 用 `fnm` 管理；本机实际是 Node v26.8.1（Expo SDK 58 要求 `^22.13 / ^24.3 / ^26 / ≥27`）。
本仓库 `package.json` 没有 `engines` 字段，版本要求来自 Expo。若 shell 里的 Node 太旧导致测试找不到 `node:sqlite`：

```bash
fnm exec --using=24 -- npm test
# 或先 eval "$(fnm env --use-on-cd)"
```

常用命令：

```bash
npm start                 # Expo 开发服务器（Expo Go 扫码）
npm run verify            # typecheck + lint + test 一把梭
npm test                  # Jest（真实内存 SQLite）
npm test -- src/repositories
npm run format            # Prettier（*.md 已在 .prettierignore，不会被动）
npx expo export --platform ios   # 打包验证，不需要模拟器
npx expo-doctor           # 依赖/配置体检（等价于 npm run doctor）
```

> **新增路由后**：`tsc` 可能报「Href 里没有这个路径」。因为 `typedRoutes` 的类型生成在
> `.expo/types/router.d.ts`（已 gitignore）。跑一次 `npx expo start --offline`（十几秒后 Ctrl-C）即可重新生成。

## 3. 架构与职责边界（硬约定，不可违反）

```
src/app/           expo-router 文件路由（每个文件=一屏；非路由代码不放这里）
src/components/    通用 UI（每个页面都可能用的基础件）
src/features/      具体功能组件（definitions/、records/、cycles/、common/）
src/db/            连接、PRAGMA、迁移、DatabaseProvider、SqlExecutor 抽象
src/repositories/  ★ 唯一写 SQL 的地方，对外只暴露业务语义方法
src/domain/        类型与规则（models / validation / dates / cycles / errors / id），不依赖 React、不依赖数据库
src/theme/         设计令牌
```

- **界面层不出现 SQL**；**仓储层是唯一 SQL 出口**；**领域层做校验与规则**，纯函数优先。
- 每个仓储方法用 `guard(中文操作名, ...)` 包裹，底层异常统一收敛为 `StorageError`。
- 时间作为**带默认值的参数**传入（便于测试固定时间）：`now: IsoDateTime = new Date().toISOString()`。
- 读库得到的外部数据要过**守卫函数**（如 `toKind`），不要用 `as`。

## 4. 数据库现状（迁移只追加，禁止改已发布的迁移）

| 版本 | 内容 | 关键点 |
| --- | --- | --- |
| v1 | `app_meta` | 启动次数 / 安装时间，持久化验证载体 |
| v2 | `event_groups` / `tags` / `event_definitions` / `quick_options` / `event_definition_tags` | 删分组用 `SET NULL` 保定义；删定义 `CASCADE` 清子表 |
| v3 | `event_records` | **故意无外键**，靠快照保历史；`deleted_at` 软删除列；`source` 含 `backfill` |
| v4 | `cycle_definitions` / `cycle_instances` / `cycle_entries` | 定义→实例→记录**均 CASCADE**；`UNIQUE(instance_id, date)` 保「一天一条」；边界规则在仓储层，SQL 只加 `CHECK (end_date IS NULL OR end_date >= start_date)` |

`MIGRATIONS` 在 `src/db/schema.ts`，`LATEST_SCHEMA_VERSION` 自动推导。新增结构 = 追加一个新 `Migration`，
然后同步更新 `src/db/__tests__/migrations-test.ts` 里对版本号与 `applied` 的断言。

## 5. 已实现的领域规则（代码中已体现）

1. 事件定义与历史记录分离：改定义不影响历史（v3 无外键 + 快照）。
2. 历史快照：记录时固化名称/单位/分组/标签。
3. 归档只改 `is_archived`，不影响历史，只禁止新增记录。
4. 补录只能回到过去：`occurredAt` ≤ `recordedAt`（`requireNotFuture`，按时间比较而非字符串）。
5. 软删除用 `deleted_at`，`softDelete` / `restore` **幂等**，`list` 默认排除；**永久删除**才需二次确认。
6. 永久删除必须**二次确认**（`Alert.alert`），多表写入用独占事务。
   - 已实现：事件定义、周期定义（连带实例与记录）、周期实例（连带记录）、单日周期记录。
   - **未实现**：事件记录（`event_records`）的永久删除入口——现在只有软删除 + 撤销。
7. **周期边界修改不得静默删除越界记录**：`CycleInstanceRepository.update` / `endInstance` 先查
   `cycle_entries` 中落在新区间外的日期，有则抛 `ConflictError`（`details.outsideDates` 列出日期），
   绝不顺手删除。界面原样显示原因。`listOutsideEntryDates` 提供只读预演（界面暂未使用）。
8. **同一定义的周期实例不重叠**（进行中 = 开区间），`create` / `update` 都会校验。
9. **周期内记录一天一条**：`UNIQUE(instance_id, date)` + UPSERT（`CycleEntryRepository.save`）；
   写入前校验日期必须在实例区间内。
10. 统计从事实数据算（未实现，属后续项）。

## 6. 关键文件索引

- 迁移与 schema：`src/db/schema.ts`、`src/db/migrations.ts`
- 连接与门禁：`src/db/client.ts`、`src/db/DatabaseProvider.tsx`、`src/components/DatabaseGate.tsx`
- 领域：`src/domain/models.ts`（含 `toDefinitionSnapshot` / `isVisibleRecord`）、`src/domain/validation.ts`（含 `requireNotFuture`、周期输入类型）、`src/domain/dates.ts`（纯日历日期）、`src/domain/cycles.ts`（周期规则：`findDatesOutside` / `findOverlappingInstance` / `predictNextCycleStart`）
- 仓储：`src/repositories/eventDefinitionRepository.ts`、`eventRecordRepository.ts`（记录 / 补录 / `softDelete` / `restore`）、`cycleInstanceRepository.ts`（含边界「不静默删除」与不重叠校验）、`cycleEntryRepository.ts`（一天一条的 UPSERT）、`cycleDefinitionRepository.ts`、`eventGroupRepository.ts`、`tagRepository.ts`
- 功能组件：`src/features/definitions/`（定义表单）、`src/features/records/`（`format` / `RecordRow` / `UndoBar`）、`src/features/cycles/`（`labels` / `CycleDefinitionForm`）、`src/features/common/datetime.ts`（本地时间 ↔ UTC）
- 界面：`src/app/(tabs)/definitions.tsx`、`src/app/(tabs)/index.tsx`（时间轴 + 撤销）、`src/app/(tabs)/cycles.tsx`、`src/app/record/[id].tsx`（记录 / 补录）、`src/app/events/[id].tsx`、`src/app/cycles/[id].tsx`、`src/app/cycle-instances/[id].tsx`
- 走读文档：`docs/learning/08-event-definitions.md`、`09-event-recording.md`、`10-backfill-and-undo.md`、`11-cycle-tracking.md`

## 7. 必须遵守的工作约定

1. **运行验证再收工**：至少 `npm run typecheck && npm run lint && npm test`；涉及界面/依赖时补 `npx expo export`。
2. **提交粒度**：一个可独立说明的改动一个 commit；中文提交信息，首行「第 N 阶段第 X 项：…”+ 要点。
3. **文档随功能同步**：更新 `README.md`（进度、目录、验收记录）+ `docs/learning/README.md`（进度表、概念、架构图）；
   新功能落地时写一篇 `docs/learning/NN-*.md`。**不写空文档、不把计划写成现状**。
4. **不手写 `ios/`、`android/`**（CNG）；原生配置改 `app.json` / config plugin。
5. **新增原生依赖前先确认 Expo Go 是否内置**；内置才可直接跑，否则需要 development build。
6. **别动已验收代码去「顺手美化」**；发现问题记录下来，按规划在对应阶段处理。
7. `npm run format` 后再提交（仓库用 Prettier，`*.md` 不参与）。

## 8. 已验证 vs 未验证

- ✅ 静态检查、209 个单元用例（真实内存 SQLite）、iOS 打包。
- ❌ 模拟器 / 真机手动运行；界面交互的自动化测试（项目暂无组件测试）。

## 9. 下一步任务：第二阶段剩余项

「周期事件」已完成（见 `docs/learning/11-cycle-tracking.md`）。剩下的候选按推荐顺序：

### 9.1（推荐）时间轴与统计

- 统计**从事实数据算**（领域规则 10），不落冗余汇总表；查询必须过滤软删除（`deleted_at IS NULL` 或 `isVisibleRecord`）。
- 需要按 `occurred_at` 分天/周聚合；数据变大时时间轴要从 `ScrollView` + `map` 换成 `FlatList`。

### 9.2 永久删除一致性（较小、可穿插）

- 事件记录（`event_records`）的**永久删除**还没有入口（周期那边已经有：定义 / 实例 / 单日记录）。
- 需要为记录加永久删除（`Alert` 二次确认），并确认「软删除 → 撤销 → 永久删除」的状态转换没有漏洞。
- 注意：删定义不删历史是**有意为之**，别顺手改成级联。

### 9.3 导入导出

- JSON / CSV 导入导出 + 冲突合并 + 事务一致性校验；领域规则是「导入失败不留半截数据」（整体事务）。

### 9.4 周期功能的增强（可选，穿插）

- 日历式月视图（可点选日期）与按症状统计。
- 预测目前只用「上一段开始日 + 平均周期长度」；可改成最近 N 段的平均（领域层加纯函数，不足两段则不预测）。
- 界面还没用上 `CycleInstanceRepository.listOutsideEntryDates`：可在用户点保存前预演「这次改动会甩出哪些日期」。

### 提交与验证习惯

沿用提交拆分：数据层（迁移/仓储 + 用例）→ 界面 → 文档同步（README + 学习指北 + 新增 `NN-*.md`）。
每步跑 `npm run verify`；新增路由后重新生成 typed routes（见第 2 节）。

## 10. 已知问题 / 技术债（记录在案，别忽略也别顺手乱改）

- **`MetaRepository.incrementLaunchCount` 是「读-改-写」，非原子**（`docs/learning/04` 4.6）。
  当前只用于启动计数，无实际损失；写真正的计数逻辑时不要照抄这个模式，改用原子 SQL 或事务。
- **界面无自动化测试**：项目至今没有组件测试；若做复杂交互，考虑引入 `@testing-library/react-native`。
- **列表用 `ScrollView` + `map`**：时间轴当前 `LIMIT 100`；数据变大要改 `FlatList` 虚拟化。
- **撤销状态不跨页面**：离开页面后撤销入口消失（记录仍是软删除状态）。若要跨页面持久化，按 `docs/learning/06` 3.9 评估（优先 `Context + useReducer`，不要直接上第三方库）。
- **补录采用的是文本输入而非原生日期选择器**：因为原生 picker 不在 Expo Go 内置，会强制引入 development build。
  若将来接受 dev build，可再评估 `@react-native-community/datetimepicker`。
- **周期内记录是「真删」**：`CycleEntry` 模型里没有软删除标记，删掉那天就没了（界面有 `Alert` 二次确认）。
  若要做「删除后撤销」，需要给 `cycle_entries` 加 `deleted_at`（追加迁移）并让查询过滤它。
- **周期预测只用一段历史**：`predictNextCycleStart` 是「上一段开始日 + 平均周期长度」。
  多段平均属增强项（见 9.4），别在界面里就地算。
- **周期界面没有日历视图**：现在是「标签页 → 定义详情 → 实例详情」三层下钻，月历点选属增强项。

## 11. 快速自检清单（接手后第一件事）

```bash
git status                 # 应干净
npm install                # 若 node_modules 不全
npm run verify             # 应为：16 套件 / 209 用例通过
npx expo export --platform ios   # 应能打包
npm start                  # Expo Go 扫码，手动走一遍：
                           #   建事件 → 记录 → 补录 → 看时间轴 → 删除并撤销 → 归档/删除定义
                           #   建周期定义 → 开始新周期 → 记某天的阶段/症状 → 结束周期
                           #   把结束日提前到某条记录之前 → 应被拒绝并列出该日期（数据不能少）
                           #   删除某天的记录 / 删除整段周期 → 都应有二次确认
```

走完之后，再按第 9 节挑下一项开始。