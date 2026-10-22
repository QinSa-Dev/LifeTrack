# LifeTrack 交接文档（HANDOFF）

> 面向**接手的新 agent / 新开发者**。读完这一份就能知道：项目是什么、做到哪了、怎么验证、
> 下一步该做什么、以及必须遵守的约定。细节走读见 `docs/learning/`，本文件只做「当前状态 + 行动指南」。

## 0. 一句话

LifeTrack 是一个**本地优先**的生活记录 App：记录事件（计数 / 数量）、周期事件与症状，按时间轴回看并统计。
技术栈：React Native + Expo SDK 58 + TypeScript + SQLite（expo-sqlite）。
数据全部在设备本地，**无后端、无账号、无云同步**。

## 1. 当前状态快照（写于「回收站与永久删除」完成、并已在本机模拟器跑起来之后）

- 分支：`main`；工作区干净。
- 最新提交：用 `git log -1` 查看
- schema 版本：**v4**（`PRAGMA user_version = 4`）；统计、回收站与导入导出**都没有新增迁移**
  （统计是纯聚合，回收站是 `DELETE` 已有行，导入导出是读全表 + 重写已有行）
- 验证状态（全部真实跑过）：

```bash
npm run typecheck    # 通过
npm run lint         # 通过（0 error / 0 warning）
npm test             # 21 个套件 / 291 个用例通过
npm run format:check # 通过
npx expo export --platform ios   # 通过（js bundle 3.1MB）
npx expo-doctor      # 19/20：8 个旧依赖 patch 版本漂移（与最近改动无关）
```

> ✅ **已在本机 iOS 模拟器实机跑起来**（见第 8 节）：第二阶段的功能都能打开、渲染真实数据。
> ⚠️ 但**写入路径没有真手点过**（点记录 / 删除撤销 / 回收站真删 / 导出分享 / 选文件导入），
> 只靠单元测试；Android 与真机未跑。
> 接手后建议：`npm start` + Expo Go 手动点一遍再动新代码。
>
> 本机访问 GitHub Releases 很慢，`expo start --ios` 会卡在「Fetching Expo Go」超时。变通办法见
> `README.md`「本机 iOS 模拟器实机运行」末尾的排障备注（手动分片下载 Expo Go → `simctl install`）。

**远端提醒**：本地 `main` 比 `origin/main` 领先 4 个提交（远端为 `git@github.com:QinSa-Dev/LifeTrack.git`；
`origin/main` 当前为 `1ada659`）。推送前先确认目标分支。

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
src/features/      具体功能组件（definitions/、records/、cycles/、stats/、backup/、common/）
src/db/            连接、PRAGMA、迁移、DatabaseProvider、SqlExecutor 抽象
src/repositories/  ★ 唯一写 SQL 的地方，对外只暴露业务语义方法
src/domain/        类型与规则（models / validation / dates / cycles / backup / errors / id），不依赖 React、不依赖数据库
src/theme/         设计令牌
```

- **界面层不出现 SQL**；**仓储层是唯一 SQL 出口**；**领域层做校验与规则**，纯函数优先。
- **文件系统与系统选择器只在 `src/features/backup/transfer.ts`**（导出/导入的文件读写），界面只调它。
- **领域层不依赖 db 层**：`createBackup` 需要的 `schemaVersion` 由调用方（仓储）传参，别在领域层引 `LATEST_SCHEMA_VERSION`。
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
   - 已实现：事件定义、周期定义（连带实例与记录）、周期实例（连带记录）、单日周期记录、事件记录（回收站页）。
   - **未实现**：周期内记录（`cycle_entries`）的回收站——它仍是直接真删（模型里没有 `deleted_at`）。
7. **周期边界修改不得静默删除越界记录**：`CycleInstanceRepository.update` / `endInstance` 先查
   `cycle_entries` 中落在新区间外的日期，有则抛 `ConflictError`（`details.outsideDates` 列出日期），
   绝不顺手删除。界面原样显示原因；并且在**保存之前**就用同一个纯函数
   `findDatesOutside`（在已加载的记录上）实时预演「会有哪几天越界」（见领域规则 13 与 9.1）。
8. **同一定义的周期实例不重叠**（进行中 = 开区间），`create` / `update` 都会校验。
9. **周期内记录一天一条**：`UNIQUE(instance_id, date)` + UPSERT（`CycleEntryRepository.save`）；
   写入前校验日期必须在实例区间内。
10. **统计从事实数据算，不落汇总表**：打开统计页时对事实记录实时聚合，只统计未软删除的记录；
    「一天/一周」按设备本地时区划分（ISO 周，周一起算）；数量型不同单位的值不合并计量
    （`src/features/stats/aggregate.ts`）。
11. **导入是合并（取并集），不是覆盖**：本地独有的数据一律保留；同 id 冲突「较新的 `updatedAt` 胜出」，
    完全相同则保留本地不重写；事件记录不可篡改，**只合并软删除标记**（本地已删除不会被旧备份复活）。
    导入在单个独占事务里重写九张表，并在事务内核对行数 + `PRAGMA foreign_key_check`，
    **失败整体回滚，不留半截数据**（`src/domain/backup.ts` / `src/repositories/backupRepository.ts`）。
12. **外部输入（备份 JSON）严格解析**：逐字段守卫、错误带路径（`data.eventRecords[0].value`）、
    写库前校验引用完整性（含 SQL 约束没覆盖的「周期记录日期必须在实例区间内」）；
    缺失的**集合**按空处理（兼容旧备份），存在但写错的条目一律拒绝。
    例外：事件记录的 `definitionId` 不校验（v3 无外键，历史可指向已删定义）。
13. **预测先看实际观察到的间隔，最后才用配置值，都没有就不预测**：`predictNextCycle` 三级优先
    （最近 N=3 段「相邻开始日之差」的平均 → 定义里配置的平均周期长度 → `undefined`），
    返回 `basis` / `observedGaps` 让界面说清依据；间隔按日历日算（`observedCycleLength`）。
14. **同一条规则只写一遍**：`findDatesOutside` 既用于仓储保存时的拒绝，也用于界面保存前的预演，
    所以两者不可能不一致；因为记录已在界面上，仓储里那个重复的只读查询 `listOutsideEntryDates` 已删除。

## 6. 关键文件索引

- 迁移与 schema：`src/db/schema.ts`、`src/db/migrations.ts`
- 连接与门禁：`src/db/client.ts`、`src/db/DatabaseProvider.tsx`、`src/components/DatabaseGate.tsx`
- 领域：`src/domain/models.ts`（含 `toDefinitionSnapshot` / `isVisibleRecord`）、`src/domain/validation.ts`（含 `requireNotFuture`、周期输入类型）、`src/domain/dates.ts`（纯日历日期）、`src/domain/cycles.ts`（周期规则：`findDatesOutside` / `findOverlappingInstance` / `observedCycleLength` / `predictNextCycle`）、`src/domain/backup.ts`（备份格式契约 `BACKUP_FORMAT` / 严格解析 `parseBackup` / 引用完整性 `assertBackupIntegrity` / 合并 `mergeBackup` / 稳定排序 `sortBackupData` / 文件名 `backupFileName`）
- 仓储：`src/repositories/eventDefinitionRepository.ts`、`eventRecordRepository.ts`（记录 / 补录 / `softDelete` / `restore` / `remove` 真删）、`cycleInstanceRepository.ts`（含边界「不静默删除」与不重叠校验）、`cycleEntryRepository.ts`（一天一条的 UPSERT + 导出用的 `listAll`）、`cycleDefinitionRepository.ts`、`eventGroupRepository.ts`、`tagRepository.ts`、`backupRepository.ts`（`exportAll` / `previewImport` / `importAll`）
- 功能组件：`src/features/definitions/`（定义表单）、`src/features/records/`（`format` / `RecordRow` / `UndoBar`）、`src/features/cycles/`（`labels` 含 `describePrediction` / `CycleDefinitionForm`）、`src/features/stats/aggregate.ts`（统计聚合，纯函数）、`src/features/backup/csv.ts`（记录 CSV）、`src/features/backup/transfer.ts`（唯一碰文件系统/系统选择器的地方）、`src/features/common/datetime.ts`（本地时间 ↔ UTC）
- 界面：`src/app/(tabs)/definitions.tsx`、`src/app/(tabs)/index.tsx`（时间轴 + 撤销，`FlatList`）、`src/app/(tabs)/stats.tsx`（统计）、`src/app/(tabs)/cycles.tsx`、`src/app/(tabs)/settings.tsx`（诊断 + 备份与恢复）、`src/app/record/[id].tsx`（记录 / 补录）、`src/app/records/deleted.tsx`（回收站）、`src/app/events/[id].tsx`、`src/app/cycles/[id].tsx`、`src/app/cycle-instances/[id].tsx`
- 走读文档：`docs/learning/08-event-definitions.md`、`09-event-recording.md`、`10-backfill-and-undo.md`、`11-cycle-tracking.md`、`12-statistics.md`、`13-permanent-delete-and-trash.md`、`14-backup-and-restore.md`

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

- ✅ 静态检查、291 个单元用例（真实内存 SQLite）、iOS 打包（3.1MB）。
- ✅ **本机 iOS 模拟器实机运行**（iPhone 16e / iOS 26.3 / Expo Go 58.0.5）：5 个标签页 + 回收站 +
  记录页 + 周期实例页都正常渲染真实 SQLite 数据，Metro 无 JS 报错。明细见 `README.md`
  的「本机 iOS 模拟器实机运行」一节。
- ❌ **没有手动走通写入路径**：本机无法自动化点击（模拟器未授予辅助功能权限），所以「点一下记录」
  「删除并撤销」「回收站恢复/永久删除的二次确认」「导出 JSON/CSV 的分享面板」「从备份导入的文件选择器」
  「改周期边界时的越界预演」都只由单元测试覆盖，没有真手点过。也**没在 Android 与真机上跑过**。
- ❌ 界面交互的自动化测试（项目暂无组件测试）。
- ❌ 导入导出的**文件层面**未验证：`expo-file-system` / `expo-sharing` / `expo-document-picker`
  只保证「能打包」，没有真机验证过「文件存得下来、选得回来」。

## 9. 下一步任务：第二阶段剩余项

「回收站与永久删除」、「导入导出」与「周期功能的增强（预测依据 / 边界预演）」都已完成
（见 `docs/learning/13-permanent-delete-and-trash.md`、`14-backup-and-restore.md`、
`11-cycle-tracking.md` 的 4.2 与 4.8 节）。剩下的候选按推荐顺序：

### 9.1 周期功能的增强（推荐，穿插）

已完成：预测改用「最近 N 段实际间隔的平均」（含 `basis` 依据）、保存边界前预演越界日期。
剩下：

- 日历式月视图（可点选日期）与按症状统计。
- 周期内记录（`cycle_entries`）的回收站（现在删了就没）。
- 预测窗口（当前固定 3 段）做成界面上可调；窗口越小越贴合最近状态、越容易被一次异常周期带偏。
- 边界预演目前只讲「越界」，不讲「与哪一段冲突」；`findOverlappingInstance` 的数据就在手边，可一并提示。

### 9.2 统计的增强（可选，穿插）

- 目前只做「按天 / 按周」的条数与合计，没有环比/同比。
- 统计页一次性读取全部记录再做聚合（没有把时间范围下推到 SQL）；若记录量很大，可在仓储层加
  `occurred_at` 范围过滤后再聚合，纯函数接口不用变。

### 9.3 导入导出的收尾（可选）

- **真机 / 模拟器手测一遍**：导出 → 分享 → 存文件 → 选回来导入（本次唯一没验证的环节）。
- 备份文件可以做得更「防呆」：导入时若 `format` 对但 `data` 整个缺失，目前按空备份处理——
  可考虑提示「这看起来不是一份完整备份」。
- 导出体积优化（当前是缩进 JSON，记录很多时偏大）。

### 提交与验证习惯

沿用提交拆分：数据层（迁移/仓储 + 用例）→ 界面 → 文档同步（README + 学习指北 + 新增 `NN-*.md`）。
每步跑 `npm run verify`；新增路由后重新生成 typed routes（见第 2 节）；**新增原生依赖先确认 Expo Go 内置**。

## 10. 已知问题 / 技术债（记录在案，别忽略也别顺手乱改）

- **`MetaRepository.incrementLaunchCount` 是「读-改-写」，非原子**（`docs/learning/04` 4.6）。
  当前只用于启动计数，无实际损失；写真正的计数逻辑时不要照抄这个模式，改用原子 SQL 或事务。
- **界面无自动化测试**：项目至今没有组件测试；若做复杂交互，考虑引入 `@testing-library/react-native`。
- **时间轴只取最近 100 条**：已用 `FlatList` 虚拟化，但没有分页 / 无限滚动；更早的记录要去事件页看。
- **统计页全量读取记录**：`EventRecordRepository.list()` 无上限，记录很多时会一次性读进内存再聚合；
  可在仓储层加 `occurred_at` 范围过滤后再聚合（纯函数接口不用变，见第 9.2 节）。
- **撤销状态不跨页面**：离开页面后撤销入口消失（记录仍是软删除状态）。若要跨页面持久化，按 `docs/learning/06` 3.9 评估（优先 `Context + useReducer`，不要直接上第三方库）。
- **补录采用的是文本输入而非原生日期选择器**：因为原生 picker 不在 Expo Go 内置，会强制引入 development build。
  若将来接受 dev build，可再评估 `@react-native-community/datetimepicker`。
- **周期内记录是「真删」**：`CycleEntry` 模型里没有软删除标记，删掉那天就没了（界面有 `Alert` 二次确认）。
  若要做「删除后撤销」，需要给 `cycle_entries` 加 `deleted_at`（追加迁移）并让查询过滤它。
- **周期预测的窗口固定为 3 段**：`predictNextCycle` 的 `window` 已是参数、领域层可测，
  但界面没给用户选择的入口（见 9.1 最后两条）。
- **边界预演是「提示」而不是「校验」**：界面用纯函数算出来的结论不参与拦截，
  真正的拒绝仍在保存时由仓储执行；两者共用 `findDatesOutside`，所以不会对不上。
- **周期界面没有日历视图**：现在是「标签页 → 定义详情 → 实例详情」三层下钻，月历点选属增强项。
- **导入导出的文件层未手测**：`transfer.ts` 的三个入口（分享 / 选文件）没有真机点过；
  Android 上的 `expo-sharing` / `expo-document-picker` 行为未知（见 9.3）。
- **导入的「读」与「写」不在同一个事务窗口**：`readAll()` 在事务外（受 `withExclusiveTransactionAsync`
  只能在回调内用 `txn` 的限制），单用户单连接场景无影响；若将来出现后台写入，需要改成事务内读取或加乐观校验。
- **`app_meta` 不参与备份**：这是有意的（安装时间/启动次数是本机信息），但意味着「换机恢复」后
  安装时间会重新算——若要保留，需要在导入时按需挑选键。
- **CSV 只导出不导入**：CSV 没有主键与快照，无法无损往返；若要「从表格导入」，需要一套「按事件名匹配」
  的映射规则与冲突策略（属于新功能，不是补丁）。
- **导入导出没有体积/性能测试**：几万条记录下的导出耗时与文件大小未测。

## 11. 快速自检清单（接手后第一件事）

```bash
git status                 # 应干净
npm install                # 若 node_modules 不全
npm run verify             # 应为：21 套件 / 291 用例通过
npx expo export --platform ios   # 应能打包（3.1MB 左右）
npm start                  # Expo Go 扫码，手动走一遍：
                           #   建事件 → 记录 → 补录 → 看时间轴 → 删除并撤销 → 归档/删除定义
                           #   切到「统计」：看概览 / 按天按周趋势 / 按事件统计；删一条记录再看数字是否变化
                           #   时间轴删一条 → 进「回收站」→ 恢复 / 永久删除（应弹二次确认）
                           #   建周期定义 → 开始新周期 → 记某天的阶段/症状 → 结束周期
                           #   再开第二段（间隔不同）→ 回定义详情看预测是否按「实际间隔」给，且写明依据
                           #   把结束日提前到某条记录之前 → 应立刻出现黄色预演提示，保存被拒绝（数据不能少）
                           #   删除某天的记录 / 删除整段周期 → 都应有二次确认
                           #   设置页：导出 JSON 备份 → 存到「文件」→ 再导入这份备份
                           #   （第二次导入应提示「新增 0 条」；导出 CSV 用表格软件打开看列是否错位）
```

走完之后，再按第 9 节挑下一项开始。