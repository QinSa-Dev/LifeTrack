# LifeTrack 交接文档（HANDOFF）

> 面向**接手的新 agent / 新开发者**。读完这一份就能知道：项目是什么、做到哪了、怎么验证、
> 下一步该做什么、以及必须遵守的约定。细节走读见 `docs/learning/`，本文件只做「当前状态 + 行动指南」。

## 0. 一句话

LifeTrack 是一个**本地优先**的生活记录 App：记录事件（计数 / 数量）、周期事件与症状，按时间轴回看并统计。
技术栈：React Native + Expo SDK 58 + TypeScript + SQLite（expo-sqlite）。
数据全部在设备本地，**无后端、无账号、无云同步**。

## 1. 当前状态快照（写于「周期内记录回收站」完成、并已在本机模拟器真手点验证之后）

- 分支：`main`；工作区干净。
- 最新提交：用 `git log -1` 查看
- schema 版本：**v5**（`PRAGMA user_version = 5`）；v5 只做一件事——给 `cycle_entries`
  加 `deleted_at`（周期内记录也能软删除）。此前的统计、回收站、导入导出与周期/统计增强
  **都没有新增迁移**（统计与对比是纯聚合，事件记录的回收站是改 `deleted_at`，导入导出是读全表 + 重写已有行）
- 验证状态（全部真实跑过）：

```bash
npm run typecheck    # 通过
npm run lint         # 通过（0 error / 0 warning）
npm test             # 22 个套件 / 338 个用例通过
npm run format:check # 通过
npx expo export --platform ios   # 通过（js bundle 3.1MB；v5 只改 SQL/JS 与文案，无新增原生依赖）
npx expo-doctor      # 19/20：8 个旧依赖 patch 版本漂移（与最近改动无关）
maestro test .maestro/flows      # 8/8 通过（3m11s；需先起 Metro，见 .maestro/README.md）
```

> ✅ **已在本机 iOS 模拟器实机跑起来**，并且**写入路径已经用 Maestro 真手点过**（见第 8 节）：
> 点记录、删除并撤销、回收站恢复/永久删除（含原生二次确认）、导出 JSON 到分享面板、
> 周期边界预演 + 越界保存被拒、统计环比/同比切换、**周期记录软删除 → 撤销 → 回收站恢复 → 彻底删除**，
> 8 条流程全绿，跑完还直接读模拟器的 `lifetrack.db` 核对过（使用者数据一条没少）。
> 走读见 `docs/learning/15-maestro-e2e.md`。
> ⚠️ 仍未验证：**Android 与真机**、**「选文件导入」**（只走到系统分享面板）、**组件级测试**。
>
> 本机访问 GitHub Releases 很慢，`expo start --ios` 会卡在「Fetching Expo Go」超时。变通办法见
> `README.md`「本机 iOS 模拟器实机运行」末尾的排障备注（手动分片下载 Expo Go → `simctl install`）。

**远端提醒**：本地 `main` 比 `origin/main` 领先 3 个提交（远端为 `git@github.com:QinSa-Dev/LifeTrack.git`；
`origin/main` 当前为 `6fa80f6`）。推送前先确认目标分支。

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

端到端（真手点，需要先起 Metro 并开一个模拟器；只在 macOS + Xcode 下可用）：

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17        # Maestro 的 zip 不含 JDK
export PATH="$HOME/.maestro/bin:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer   # 本机 xcode-select 指向 CLT，simctl 要靠它

npx expo start                     # 另一个终端，保持运行
maestro test .maestro/flows        # 8/8，3m11s
maestro hierarchy                  # 排错：打印当前屏幕的视图树
```

> 约定与坑（**跑之前务必读** `.maestro/README.md`）：`appId` 用 `host.exp.Exponent`；
> **不要用 `clearState`**（Expo Go 里会连项目 SQLite 一起清掉）；每条流程用
> `launchApp: {stopApp: true}` + `openLink` 归一化；写路径流程自产自销。

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
.maestro/          端到端流程（Maestro）：在真实模拟器上点击写入路径 + 读库核对（不是应用代码）
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
| v5 | `cycle_entries.deleted_at`（`ALTER TABLE ADD COLUMN`） | 周期内记录也能软删除；**追加而不改 v4**（已发布迁移是历史）；旧行自动为 NULL = 未删除，不需要回填；恢复时重新校验「日期在实例区间内」 |

`MIGRATIONS` 在 `src/db/schema.ts`，`LATEST_SCHEMA_VERSION` 自动推导。新增结构 = 追加一个新 `Migration`，
然后同步更新 `src/db/__tests__/migrations-test.ts` 里对版本号与 `applied` 的断言。

## 5. 已实现的领域规则（代码中已体现）

1. 事件定义与历史记录分离：改定义不影响历史（v3 无外键 + 快照）。
2. 历史快照：记录时固化名称/单位/分组/标签。
3. 归档只改 `is_archived`，不影响历史，只禁止新增记录。
4. 补录只能回到过去：`occurredAt` ≤ `recordedAt`（`requireNotFuture`，按时间比较而非字符串）。
5. 软删除用 `deleted_at`，`softDelete` / `restore` **幂等**，`list` 默认排除；**永久删除**才需二次确认。
6. 永久删除必须**二次确认**（`Alert.alert`），多表写入用独占事务。
   - 已实现：事件定义、周期定义（连带实例与记录）、周期实例（连带记录）、单日周期记录（回收站页）、事件记录（回收站页）。
   - 周期内记录与事件记录现在**都**走「软删除 → 撤销 → 彻底删除」；回收站是同一个页面，
     分「已删除的记录」与「已删除的周期记录」两区。弹窗的确认按钮叫「彻底删除」、
     列表按钮叫「永久删除」——**故意不同名**，这样读屏与自动化都能分清点的是哪一个。
7. **周期边界修改不得静默删除越界记录**：`CycleInstanceRepository.update` / `endInstance` 先查
   `cycle_entries` 中落在新区间外的日期，有则抛 `ConflictError`（`details.outsideDates` 列出日期），
   绝不顺手删除。界面原样显示原因；并且在**保存之前**就用同一个纯函数
   `findDatesOutside`（在已加载的记录上）实时预演「会有哪几天越界」（见领域规则 13 与 9.1）。
   这条校验只看**未软删除**的记录：回收站里那几天不该挡住缩小边界（否则会被一条看不见的记录卡住）；
   软删除期间缩走边界之后想恢复，`CycleEntryRepository.restore` 会拒绝并说明原因
   （先把边界改回来，或彻底删除）。
8. **同一定义的周期实例不重叠**（进行中 = 开区间），`create` / `update` 都会校验。
9. **周期内记录一天一条**：`UNIQUE(instance_id, date)` + UPSERT（`CycleEntryRepository.save`）；
   写入前校验日期必须在实例区间内；对已软删除的那天再保存 = **复活**（清 `deleted_at`），
   避免「提示保存成功、列表里却没有」。删除分两级：`softDelete`（可 `restore`）与 `remove`。
10. **统计从事实数据算，不落汇总表**：打开统计页时对事实记录实时聚合，只统计未软删除的记录；
    「一天/一周」按设备本地时区划分（ISO 周，周一起算）；数量型不同单位的值不合并计量；
    **对比（环比 / 同比）只比条数**（不同单位的值本来就不可相加），且**对照期为 0 时不给变化率**
    （返回 `undefined`，界面说「无法算变化率」，不编造 `+100%`）。
    同比按 **52 周（364 天）** 对齐——星期几与周桶都对得上，代价是它不是自然年，界面因此写「上年同期」
    （`src/features/stats/aggregate.ts` / `labels.ts`）。
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
- 领域：`src/domain/models.ts`（含 `toDefinitionSnapshot` / `isVisibleRecord` / `isVisibleEntry` / `DeletedCycleEntry`）、`src/domain/validation.ts`（含 `requireNotFuture`、周期输入类型）、`src/domain/dates.ts`（纯日历日期）、`src/domain/cycles.ts`（周期规则：`findDatesOutside` / `findOverlappingInstance` / `observedCycleLength` / `predictNextCycle`）、`src/domain/backup.ts`（备份格式契约 `BACKUP_FORMAT` / 严格解析 `parseBackup` / 引用完整性 `assertBackupIntegrity` / 合并 `mergeBackup` / 稳定排序 `sortBackupData` / 文件名 `backupFileName`）
- 仓储：`src/repositories/eventDefinitionRepository.ts`、`eventRecordRepository.ts`（记录 / 补录 / `softDelete` / `restore` / `remove` 真删）、`cycleInstanceRepository.ts`（含边界「不静默删除」与不重叠校验）、`cycleEntryRepository.ts`（一天一条的 UPSERT + 复活 + `softDelete` / `restore` / `listDeleted` + 导出用的 `listAll`）、`cycleDefinitionRepository.ts`、`eventGroupRepository.ts`、`tagRepository.ts`、`backupRepository.ts`（`exportAll` / `previewImport` / `importAll`）
- 功能组件：`src/features/definitions/`（定义表单）、`src/features/records/`（`format` / `RecordRow` / `UndoBar`）、`src/features/cycles/`（`labels` 含 `describePrediction` / `CycleDefinitionForm`）、`src/features/stats/aggregate.ts`（统计聚合与窗口对比，纯函数）、`src/features/stats/labels.ts`（对比的说法，纯函数）、`src/features/backup/csv.ts`（记录 CSV）、`src/features/backup/transfer.ts`（唯一碰文件系统/系统选择器的地方）、`src/features/common/datetime.ts`（本地时间 ↔ UTC）
- 界面：`src/app/(tabs)/definitions.tsx`、`src/app/(tabs)/index.tsx`（时间轴 + 撤销，`FlatList`）、`src/app/(tabs)/stats.tsx`（统计）、`src/app/(tabs)/cycles.tsx`、`src/app/(tabs)/settings.tsx`（诊断 + 备份与恢复）、`src/app/record/[id].tsx`（记录 / 补录）、`src/app/records/deleted.tsx`（回收站）、`src/app/events/[id].tsx`、`src/app/cycles/[id].tsx`、`src/app/cycle-instances/[id].tsx`
- 走读文档：`docs/learning/08-event-definitions.md`、`09-event-recording.md`、`10-backfill-and-undo.md`、`11-cycle-tracking.md`、`12-statistics.md`、`13-permanent-delete-and-trash.md`、`14-backup-and-restore.md`、`15-maestro-e2e.md`
- 端到端：`.maestro/README.md`（跑法与约定）、`.maestro/flows/00`–`07`（8 条流程）、`.maestro/subflows/record-once.yaml`

## 7. 必须遵守的工作约定

1. **运行验证再收工**：至少 `npm run typecheck && npm run lint && npm test`；涉及界面/依赖时补 `npx expo export`。
   碰到**界面交互/写入路径**（点一下会写库的地方）时，跑一遍 `maestro test .maestro/flows`
   （需先起 Metro；新增写入路径就顺手加一条流程，并跑完读库核对）。
2. **提交粒度**：一个可独立说明的改动一个 commit；中文提交信息，首行「第 N 阶段第 X 项：…”+ 要点。
3. **文档随功能同步**：更新 `README.md`（进度、目录、验收记录）+ `docs/learning/README.md`（进度表、概念、架构图）；
   新功能落地时写一篇 `docs/learning/NN-*.md`。**不写空文档、不把计划写成现状**。
4. **不手写 `ios/`、`android/`**（CNG）；原生配置改 `app.json` / config plugin。
5. **新增原生依赖前先确认 Expo Go 是否内置**；内置才可直接跑，否则需要 development build。
6. **别动已验收代码去「顺手美化」**；发现问题记录下来，按规划在对应阶段处理。
7. `npm run format` 后再提交（仓库用 Prettier，`*.md` 不参与）。

## 8. 已验证 vs 未验证

- ✅ 静态检查、338 个单元用例（真实内存 SQLite）、iOS 打包（3.1MB）。
- ✅ **本机 iOS 模拟器实机运行**（iPhone 16e / iOS 26.3 / Expo Go 58.0.5）：5 个标签页 + 回收站 +
  记录页 + 周期实例页都正常渲染真实 SQLite 数据，Metro 无 JS 报错。明细见 `README.md`
  的「本机 iOS 模拟器实机运行」一节。
- ✅ **写入路径已经真手点过**（Maestro，`8/8` 通过，3m11s）：点一下记录、删除并撤销、
  回收站「恢复 / 永久删除」（含原生二次确认）、导出 JSON 到系统分享面板、
  改周期边界的越界预演 + 越界保存被拒绝、统计页的环比 / 同比切换、
  **周期内记录软删除 → 撤销 → 回收站恢复 → 彻底删除**。
  流程在 `.maestro/`，走读见 `docs/learning/15-maestro-e2e.md`，结果明细见 `README.md`
  的「端到端：Maestro 真手点」一节。
  另外，跑完会**直接读模拟器里的 `lifetrack.db`** 核对：使用者数据一条没少，
  流程只新增自己造的 `Maestro*` 数据（收尾会把这些清掉）。
- ✅ **v4 → v5 的真实库升级也验过**：在模拟器上把使用者的 v4 库升到 v5（`user_version 4 → 5`），
  15 条事件记录 / 4 条周期记录 / 1 条软删一条没少，`PRAGMA foreign_key_check` 干净。
- ❌ **没在 Android 与真机上跑过**（Maestro 流程也只写了 iOS 路径）。
- ❌ **「选文件导入」没真手点过**：`04` 只走到系统分享面板并关掉；系统文件选择器是另一个 App 的 UI，
  跨 App 取文件还没做。`expo-file-system` / `expo-sharing` / `expo-document-picker`
  因此只验证到「导出写得出文件、面板弹得出来」。
- ❌ 界面交互的**组件级**自动化测试仍没有（项目里只有单元测试 + Maestro 端到端两层）。

## 9. 下一步任务：第二阶段剩余项

「回收站与永久删除」、「导入导出」、「周期功能的增强（预测依据 / 边界预演）」与
「统计的增强（环比 / 同比）」都已完成
（见 `docs/learning/13-permanent-delete-and-trash.md`、`14-backup-and-restore.md`、
`11-cycle-tracking.md` 的 4.2 与 4.8 节、`12-statistics.md` 的 3.9–3.11 节）。剩下的候选按推荐顺序：

### 9.1 周期功能的增强（推荐，穿插）

已完成：预测改用「最近 N 段实际间隔的平均」（含 `basis` 依据）、保存边界前预演越界日期、
周期内记录的回收站（v5：`cycle_entries.deleted_at`，与事件记录共用回收站页面）。剩下：

- 日历式月视图（可点选日期）与按症状统计。
- 预测窗口（当前固定 3 段）做成界面上可调；窗口越小越贴合最近状态、越容易被一次异常周期带偏。
- 边界预演目前只讲「越界」，不讲「与哪一段冲突」；`findOverlappingInstance` 的数据就在手边，可一并提示。

### 9.2 统计的增强（可选，穿插）

已完成：环比 / 同比对比（窗口对齐、差值与变化率、对照期为 0 时不给百分比，见
`docs/learning/12-statistics.md` 的 3.9–3.11、4.6 节）。剩下：

- 统计页一次性读取全部记录再做聚合（没有把时间范围下推到 SQL）；若记录量很大，可在仓储层加
  `occurred_at` 范围过滤后再聚合，纯函数接口不用变。对比同样是对两个窗口各扫一遍，值得一起压测。
- 「按周」的本期包含还没过完的本周；可考虑另给一个「只比已结束的周」的口径（现在没有，因为那偏外推）。

### 9.3 导入导出的收尾（可选）

- **「选文件导入」还没手测过**：导出 → 分享面板这条已经由 `.maestro/flows/04` 覆盖；
  剩下的是「存到「文件」→ 选回来导入」——文件选择器属另一个 App，要另写流程（跨 App 操作，
  先想清楚断言什么、怎么不污染使用者数据）。Android 上的 `expo-sharing` / `expo-document-picker`
  行为同样未知。
- 备份文件可以做得更「防呆」：导入时若 `format` 对但 `data` 整个缺失，目前按空备份处理——
  可考虑提示「这看起来不是一份完整备份」。
- 导出体积优化（当前是缩进 JSON，记录很多时偏大）。

### 提交与验证习惯

沿用提交拆分：数据层（迁移/仓储 + 用例）→ 界面 → 文档同步（README + 学习指北 + 新增 `NN-*.md`）。
每步跑 `npm run verify`；新增路由后重新生成 typed routes（见第 2 节）；**新增原生依赖先确认 Expo Go 内置**。

## 10. 已知问题 / 技术债（记录在案，别忽略也别顺手乱改）

- **`MetaRepository.incrementLaunchCount` 是「读-改-写」，非原子**（`docs/learning/04` 4.6）。
  当前只用于启动计数，无实际损失；写真正的计数逻辑时不要照抄这个模式，改用原子 SQL 或事务。
- **界面只有端到端、没有组件级测试**：Maestro 流程（`.maestro/`）能证明「点得通、落得进库」，
  但跑得慢、只能盖住主干路径；细粒度的界面交互（条件渲染、空状态、错误态）若要自动化，
  仍需 `@testing-library/react-native`。
- **时间轴只取最近 100 条**：已用 `FlatList` 虚拟化，但没有分页 / 无限滚动；更早的记录要去事件页看。
- **统计页全量读取记录**：`EventRecordRepository.list()` 无上限，记录很多时会一次性读进内存再聚合；
  可在仓储层加 `occurred_at` 范围过滤后再聚合（纯函数接口不用变，见第 9.2 节）。
  对比（`compareWindows` / `compareDefinitions`）会对两个窗口各扫一遍全量记录，同样受益。
- **撤销状态不跨页面**：离开页面后撤销入口消失（记录仍是软删除状态）。若要跨页面持久化，按 `docs/learning/06` 3.9 评估（优先 `Context + useReducer`，不要直接上第三方库）。
- **软删除的周期记录可以落在实例区间外**：软删除不挡边界（这是有意的），所以「软删 → 缩边界」之后
  回收站里那条就在区间外；恢复会被拒并提示先改回边界。备份的完整性检查因此对已软删除的行放行区间校验
  （否则 App 自己导出的备份会被自己拒绝）。
- **回收站的周期区没有按实例筛选**：`listDeleted()` 返回全部软删除的周期记录（数量很小），
  没有「只看这一段的回收站」入口；记在案，量大了再说。
- **补录采用的是文本输入而非原生日期选择器**：因为原生 picker 不在 Expo Go 内置，会强制引入 development build。
  若将来接受 dev build，可再评估 `@react-native-community/datetimepicker`。
- **周期预测的窗口固定为 3 段**：`predictNextCycle` 的 `window` 已是参数、领域层可测，
  但界面没给用户选择的入口（见 9.1 最后两条）。
- **边界预演是「提示」而不是「校验」**：界面用纯函数算出来的结论不参与拦截，
  真正的拒绝仍在保存时由仓储执行；两者共用 `findDatesOutside`，所以不会对不上。
- **周期界面没有日历视图**：现在是「标签页 → 定义详情 → 实例详情」三层下钻，月历点选属增强项。
- **导入导出的文件层只覆盖了一半**：`.maestro/flows/04` 证明「导出能写出文件、分享面板能弹出」；
  「选文件导入」与 Android 上的行为仍未验证（见 9.3）。
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
npm run verify             # 应为：22 套件 / 338 用例通过
npx expo export --platform ios   # 应能打包（3.1MB 左右）
npm start                  # Expo Go 扫码（或走下面的自动流程）

# 端到端：另开终端，Metro 保持运行
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$HOME/.maestro/bin:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
maestro test .maestro/flows      # 应为 8/8 通过（3m11s）
sqlite3 "$(xcrun simctl get_app_container booted host.exp.Exponent data)"/Documents/ExponentExperienceData/@anonymous/lifetrack-*/SQLite/lifetrack.db \
  "select count(*), sum(deleted_at is not null) from event_records;"   # 跑完核对：多的应该只有 Maestro* 那条记录
```

手动走一遍（想看得更细时）：

```
建事件 → 记录 → 补录 → 看时间轴 → 删除并撤销 → 归档/删除定义
切到「统计」：看概览 / 按天按周趋势 / 按事件统计；删一条记录再看数字是否变化
统计页切「较前一段 / 较上年同期」：对照窗口日期应相隔 52 周；对照期为空时不该出现百分比
时间轴删一条 → 进「回收站」→ 恢复 / 永久删除（应弹二次确认）
建周期定义 → 开始新周期 → 记某天的阶段/症状 → 结束周期
再开第二段（间隔不同）→ 回定义详情看预测是否按「实际间隔」给，且写明依据
把结束日提前到某条记录之前 → 应立刻出现黄色预演提示，保存被拒绝（数据不能少）
删除某天的记录 → 软删除（出现「撤销」提示条，不弹确认）；删除整段周期 → 二次确认
周期里记一天 → 点「删除」→ 出现「撤销」提示条 → 撤销找回；再删 → 回收站「已删除的周期记录」里恢复 / 彻底删除
设置页：导出 JSON 备份 → 存到「文件」→ 再导入这份备份
（第二次导入应提示「新增 0 条」；导出 CSV 用表格软件打开看列是否错位）
```

走完之后，再按第 9 节挑下一项开始。