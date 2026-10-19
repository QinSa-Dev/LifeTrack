# LifeTrack 交接文档（HANDOFF）

> 面向**接手的新 agent / 新开发者**。读完这一份就能知道：项目是什么、做到哪了、怎么验证、
> 下一步该做什么、以及必须遵守的约定。细节走读见 `docs/learning/`，本文件只做「当前状态 + 行动指南」。

## 0. 一句话

LifeTrack 是一个**本地优先**的生活记录 App：记录事件（计数 / 数量）、周期事件与症状，按时间轴回看并统计。
技术栈：React Native + Expo SDK 58 + TypeScript + SQLite（expo-sqlite）。
数据全部在设备本地，**无后端、无账号、无云同步**。

## 1. 当前状态快照（写于第二阶段第 2 项完成时）

- 分支：`main`；工作区干净。
- 最新提交：`a79adde 第二阶段第 2 项：同步文档（README + 学习指北 + 新增 09）`
- schema 版本：**v3**（`PRAGMA user_version = 3`）
- 验证状态（全部真实跑过）：

```bash
npm run typecheck    # 通过
npm run lint         # 通过（0 error / 0 warning）
npm test             # 9 个套件 / 108 个用例通过
npm run format:check # 通过
npx expo export --platform ios   # 通过（1245 modules）
```

> ⚠️ **尚未在模拟器 / 真机上手动运行过第二阶段的功能**（第 1、2 项都只做了静态检查、单测与打包）。
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
src/features/      具体功能组件（definitions/、records/）
src/db/            连接、PRAGMA、迁移、DatabaseProvider、SqlExecutor 抽象
src/repositories/  ★ 唯一写 SQL 的地方，对外只暴露业务语义方法
src/domain/        类型与规则（models / validation / errors / id），不依赖 React、不依赖数据库
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

`MIGRATIONS` 在 `src/db/schema.ts`，`LATEST_SCHEMA_VERSION` 自动推导。新增结构 = 追加一个新 `Migration`，
然后同步更新 `src/db/__tests__/migrations-test.ts` 里对版本号与 `applied` 的断言。

## 5. 已实现的领域规则（代码中已体现）

1. 事件定义与历史记录分离：改定义不影响历史（v3 无外键 + 快照）。
2. 历史快照：记录时固化名称/单位/分组/标签。
3. 归档只改 `is_archived`，不影响历史，只禁止新增记录。
4. 永久删除必须**二次确认**（`Alert.alert`），多表写入用独占事务。
5. 软删除用 `deleted_at`（列已就位，`list` 默认排除）。
6. 统计从事实数据算（未实现，属后续项）。

## 6. 关键文件索引

- 迁移与 schema：`src/db/schema.ts`、`src/db/migrations.ts`
- 连接与门禁：`src/db/client.ts`、`src/db/DatabaseProvider.tsx`、`src/components/DatabaseGate.tsx`
- 领域：`src/domain/models.ts`（含 `toDefinitionSnapshot`）、`src/domain/validation.ts`
- 仓储：`src/repositories/eventDefinitionRepository.ts`、`eventRecordRepository.ts`、`eventGroupRepository.ts`、`tagRepository.ts`
- 界面：`src/app/(tabs)/definitions.tsx`、`src/app/(tabs)/index.tsx`、`src/app/record/[id].tsx`、`src/app/events/[id].tsx`
- 走读文档：`docs/learning/08-event-definitions.md`、`docs/learning/09-event-recording.md`

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

- ✅ 静态检查、108 个单元用例（真实内存 SQLite）、iOS 打包。
- ❌ 模拟器 / 真机手动运行；界面交互的自动化测试（项目暂无组件测试）。
- ❌ `source: 'backfill'`（补录）路径：类型与数据库就位，但无 UI、无用例。

## 9. 下一步任务：第二阶段 —— 补录与撤销

这是规划里紧接着要做的一项。目标：让用户**记录过去发生的事实**，并能**撤销最近一次操作**。
本项会第一次真正用到已经预留好的 `deleted_at` 与 `source: 'backfill'`。

### 9.1 补录（backfill）

- **数据层已就绪**：`EventRecordRepository.record(...)` 已支持显式传入 `occurredAt`，
  `requireIsoDateTime` 会校验 ISO-8601 格式；`source` 允许 `'backfill'`。
- **要做的**：在 `/record/[id]` 增加「补录」入口，让用户选择过去的日期/时间。
- **一个需要先决策的点**（写代码前先定）：
  - 方案 A：用 `TextField` + 严格校验（如 `YYYY-MM-DD HH:mm`），**零新依赖，Expo Go 可直接跑**；
  - 方案 B：引入 `@react-native-community/datetimepicker`，体验好但**不在 Expo Go 内置**，需要 development build。
  - 按 AGENTS.md，优先方案 A 或先确认是否接受 dev build。
- **注意**：`occurred_at` 与 `recorded_at` 必须分开（不要用「现在」盖掉事实时间）；时间轴已按 `occurred_at` 排序。
  时区策略要明确（建议统一存 UTC ISO-8601，展示时转本地）。

### 9.2 撤销（软删除）

- **数据层已就绪**：`event_records.deleted_at` 列；`EventRecordRepository.list` 默认 `deleted_at IS NULL`，
  `includeDeleted` 可列出；`isVisibleRecord(record)` 判定可见性。
- **要做的**：
  - 给 `EventRecordRepository` 增加 `softDelete(id, now)` 与 `restore(id)`（UPDATE `deleted_at`，非真删）。
  - 界面：时间轴/记录页提供「删除」，并给一个「撤销」入口（记录最近一次被软删的 id 即可，不必上第三方状态库）。
  - 撤销用到的状态若跨页面，按 `docs/learning/06` 3.9 的标准评估：优先 `Context + useReducer`。
- **边界**：软删除是「可撤销」，**永久删除是另一码事**（第 6 条规则，需二次确认，属后续「永久删除一致性」项）。

### 9.3 建议的提交拆分（沿用本项目习惯）

1. `补录：仓储与校验补充 + 用例`（若需要新增校验/方法）
2. `补录：记录页界面`
3. `撤销：软删除仓储与界面`
4. `同步文档（README + 学习指北 + 新增 10-*）`

每步跑 `npm run verify`；新增路由后记得重新生成 typed routes。

## 10. 已知问题 / 技术债（记录在案，别忽略也别顺手乱改）

- **`MetaRepository.incrementLaunchCount` 是「读-改-写」，非原子**（`docs/learning/04` 4.6）。
  当前只用于启动计数，无实际损失；写真正的计数逻辑时不要照抄这个模式，改用原子 SQL 或事务。
- **`isVisibleRecord` 仍未被直接单元测试**（`isRecordable` 已被「归档拒绝记录」间接覆盖）。
  做撤销时顺手补一条正向/反向用例（注意它判断的是 `=== undefined`）。
- **界面无自动化测试**：项目至今没有组件测试；若做复杂交互，考虑引入 `@testing-library/react-native`。
- **列表用 `ScrollView` + `map`**：时间轴当前 `LIMIT 100`；数据变大要改 `FlatList` 虚拟化。

## 11. 快速自检清单（接手后第一件事）

```bash
git status                 # 应干净
npm install                # 若 node_modules 不全
npm run verify             # 应为：9 套件 / 108 用例通过
npx expo export --platform ios   # 应能打包
npm start                  # Expo Go 扫码，手动走一遍：建事件 → 记录 → 看时间轴 → 归档/删除
```

走完之后，再按第 9 节开始「补录与撤销」。