# LifeTrack 交接文档（HANDOFF）

> 面向**接手的新 agent / 新开发者**。读完这一份就能知道：项目是什么、做到哪了、怎么验证、
> 下一步该做什么、以及必须遵守的约定。细节走读见 `docs/learning/`，本文件只做「当前状态 + 行动指南」。

## 0. 一句话

LifeTrack 是一个**本地优先**的生活记录 App：记录事件（计数 / 周期）与周期症状，按时间轴回看并统计。
技术栈：React Native + Expo SDK 58 + TypeScript + SQLite（expo-sqlite）。
数据全部在设备本地，**无后端、无账号、无云同步**。

## 1. 当前状态快照（写于「周期并入事件类型 + 属性可多条」（v6）完成、并已在本机模拟器真手点验证之后）

- 分支：`main`；工作区干净。
- 最新提交：用 `git log -1` 查看
- schema 版本：**v6**（`PRAGMA user_version = 6`）。v6 做三件互相关联的事：
  1. **周期不再是独立实体**：`cycle_definitions` 整表并入 `event_definitions`（新增 `cycle_mode`
     与两个平均长度列），周期实例 / 每日记录的外键改指 `event_definitions`；
     类型 CHECK 收敛为 `kind IN ('counter','cycle')`；
  2. **「单位」变「属性」且可多条**：`event_definitions.attribute` → `attributes`（JSON 数组文本，
     `DEFAULT '[]'`），记录的 `unit` / `snapshot_unit` → `attributes` / `snapshot_attributes`；
  3. **快捷选项合并成「属性 + 取值」**：`quick_options.label` / `unit` 合成一列 `attribute`。
  历史记录里的 `quantity` 类型**保留不动**（展示 / 统计 / 导入继续接受它）。
  此后的统计、回收站、导入导出、周期增强、月视图、时间轴改版、设置项归拢、**属性可多条**
  都没有再新增迁移（v6 是最近一次）。
- 验证状态（全部真实跑过）：

```bash
npm run typecheck    # 通过
npm run lint         # 通过（0 error / 0 warning）
npm test             # 27 个套件 / 458 个用例通过
npm run format:check # 通过
npx expo export --platform ios   # 通过（本次只改 JS / SQL，无新增原生依赖）
npx expo-doctor      # 8 个旧依赖 patch 版本漂移（与最近改动无关）
maestro test .maestro/flows      # 11/11 通过（6m47s；需先起 Metro，见 .maestro/README.md）
```

> ✅ **已在本机 iOS 模拟器实机跑起来**，并且**写入路径已经用 Maestro 真手点过**（见第 8 节）：
> 点记录、**时间轴行内【+1】（点下去就落库、不弹确认）**、**「逐条 / 合并」切换与就地展开**、
> **点行进记录详情页 → 修改（改发生日期并保存）→ 删除 → 撤销**、回收站恢复/永久删除（含原生二次确认）、
> 导出 JSON 到分享面板、**周期型事件改从「事件」页新建（类型选「周期」）→ 开周期 → 记一天 →
> 边界预演 + 越界保存被拒**、统计环比/同比切换、
> 周期记录软删除 → 撤销 → 回收站恢复 → 彻底删除、**月视图点日期 → 保存 → 症状统计**、
> **在设置里改预测窗口 → 定义页文案跟着变 → 改边界时的重叠预演**，
> 11 条流程全绿，跑完还直接读模拟器的 `lifetrack.db` 核对过（`PRAGMA foreign_key_check` 为空）。
> 走读见 `docs/learning/15-maestro-e2e.md`（时间轴改版那部分见 `16-timeline-row-and-detail.md`，
> 周期并入事件类型见 `11-cycle-tracking.md` 4.13 节）。
> ⚠️ 仍未验证：**Android 与真机**、**组件级测试**。（**「选文件导入」已补上**，见第 8 节与
> `.maestro/README.md` 的「选文件导入」一节：手工两段式，模拟器上跨 App 那段没有端到端闭环。）
>
> 本机访问 GitHub Releases 很慢，`expo start --ios` 会卡在「Fetching Expo Go」超时。变通办法见
> `README.md`「本机 iOS 模拟器实机运行」末尾的排障备注（手动分片下载 Expo Go → `simctl install`）。

**远端提醒**：远端为 `git@github.com:QinSa-Dev/LifeTrack.git`。本地与它的领先/落后随时在变，
推送前先 `git status -sb` 确认（写这段时为 **0/0，`13d301f`**），并确认目标分支。

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
maestro test .maestro/flows        # 11/11，6m47s
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
| v6 | `cycle_definitions` 并入 `event_definitions`；`attribute`/`unit` → `attributes`（JSON 数组文本） | **周期是事件类型的一种**：重建 `event_definitions`（加 `cycle_mode` + 两个平均长度列，CHECK `(kind = 'cycle') = (cycle_mode IS NOT NULL)`、`kind IN ('counter','cycle')`），把老周期定义按原 id 折成 `kind = 'cycle'`、`cycle_mode` 兜底 `'manual'`，`quantity` 折成 `counter`、`unit` 包成 `attributes`；`quick_options.label`/`unit` 合成 `attribute`；记录的 `unit`/`snapshot_unit` → `attributes`/`snapshot_attributes`；周期实例 / 记录的外键改指 `event_definitions`；最后 `DROP TABLE cycle_definitions`。属性 JSON 一律用 SQLite `json_array()` 生成（不手拼字符串） |

`MIGRATIONS` 在 `src/db/schema.ts`，`LATEST_SCHEMA_VERSION` 自动推导。新增结构 = 追加一个新 `Migration`，
然后同步更新 `src/db/__tests__/migrations-test.ts` 里对版本号与 `applied` 的断言。

## 5. 已实现的领域规则（代码中已体现）

1. 事件定义与历史记录分离：改定义不影响历史（v3 无外键 + 快照）。
2. 历史快照：记录时固化名称/属性/分组/标签。
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
   `findDatesOutside`（在已加载的记录上）实时预演「会有哪几天越界」，
   重叠也用 `findOverlappingInstance` 一并预演（点名撞上的那一段）（见领域规则 13 与 9.1）。
   这条校验只看**未软删除**的记录：回收站里那几天不该挡住缩小边界（否则会被一条看不见的记录卡住）；
   软删除期间缩走边界之后想恢复，`CycleEntryRepository.restore` 会拒绝并说明原因
   （先把边界改回来，或彻底删除）。
8. **同一定义的周期实例不重叠**（进行中 = 开区间），`create` / `update` 都会校验。
9. **周期内记录一天一条**：`UNIQUE(instance_id, date)` + UPSERT（`CycleEntryRepository.save`）；
   写入前校验日期必须在实例区间内；对已软删除的那天再保存 = **复活**（清 `deleted_at`），
   避免「提示保存成功、列表里却没有」。删除分两级：`softDelete`（可 `restore`）与 `remove`。
10. **统计从事实数据算，不落汇总表**：打开统计页时对事实记录实时聚合，只统计未软删除的记录；
    「一天/一周」按设备本地时区划分（ISO 周，周一起算）；同一定义下**属性不一致**的值不合并计量
    （所有记录的属性列表完全一致才给出 `attributeText`）；
    **对比（环比 / 同比）只比条数**（属性不同的值本来就不可相加），且**对照期为 0 时不给变化率**
    （返回 `undefined`，界面说「无法算变化率」，不编造 `+100%`）。
    同比按 **52 周（364 天）** 对齐——星期几与周桶都对得上，代价是它不是自然年，界面因此写「上年同期」
    （`src/features/stats/aggregate.ts` / `labels.ts`）。
11. **导入是合并（取并集），不是覆盖**：本地独有的数据一律保留；同 id 冲突「较新的 `updatedAt` 胜出」，
    完全相同则保留本地不重写；事件记录不可篡改，**只合并软删除标记**（本地已删除不会被旧备份复活）——
    记录本身现在可以在详情页更正（规则 15），但**备份合并仍只看软删除标记**：编辑只在本地生效、
    不会通过备份传到另一份库（记录没有 `updated_at`，见第 10 节）。
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
15. **快照不可改，事实可更正**：`EventRecordRepository.update` 只改**事实**（取值 / 发生时间 / 备注），
    快照（名称、属性、分组、标签）永不更新——定义改名换属性之后，历史仍是记录当时的样子；
    取值仍按类型校验、发生时间仍不能晚于录入时间（与补录同一条规则）、**已软删除的记录拒绝修改**
    （先撤销删除再改，免得「改了又躺在回收站里」对不上）。记录上的属性（`record.attributes`）
    是「这一次标了哪些」，同样属于事实、不可在编辑页改。
16. **【+1】即时落库、不弹二次确认**：点一下就以该行取值「现在」再记一条（来源记 `quick`）。
    撤销与修改都不在列表里做，而在**那条记录的详情页**（`/records/[id]` 的「更多操作」）——
    列表行只留「信息 + 一下就能再记一条」，低频操作（改 / 删）收进详情页。
    计数型且增量为 1 的行不重复显示取值（否则和按钮上的「+1」撞脸）。
17. **纯展示偏好存 `app_meta`，不为它加表或加列，且集中收在「设置」里**：时间轴的「逐条 / 合并」=
    `app.timeline_view`（**默认合并**）、周期预测窗口 = `app.prediction_window`（默认 3 段）；
    读失败只当「没记住」（用默认值），不弹错误卡片打断人。页面在**聚焦时重读**
    （偏好在别的页面改，挂载时只读一次会导致「改完切回来不生效」）。
    已归档定义的【+1】禁用并标「已归档」；定义被永久删除时标「定义已删除」且不再渲染按钮
    （历史不依赖定义，所以这一行仍然能看）。
18. **「周期」是事件的一种类型，不是独立实体**（v6）：`EventDefinitionKind = 'counter' | 'cycle'`，
    周期定义就是 `kind = 'cycle'` 的 `EventDefinition`（`cycleMode` + 两个平均长度）。
    底部**没有**「周期」标签页：事件页一张列表并列两种类型，计数型点进记录页、周期型点进
    `/cycles/[id]`（内页开一段、逐天记录）。周期分两种做法——
    **自动循环**（按配置好的规律算出下一段，本轮只做「配置 + 生成下一段」，**不做后台自动写库**）
    与**手动标记**（自己点开始 / 点结束，时长不预先限定）。
    历史记录类型仍保留 `RecordKind = 'counter' | 'quantity'`（老记录不能改），
    `toRecordKind(kind)` 对非 `counter` 抛 `ValidationError`，所以**新建不了** `quantity` 记录。
19. **属性是自由文本、可以多条**（v6）：`EventDefinition.attributes: string[]`（周期型恒为 `[]`）、
    `QuickOption = { attribute?, value, sortOrder }`（属性从定义那份列表里挑，**不再单独填名称**）、
    `EventRecord.attributes: string[]`。**记录时属性默认不选**（用户明确选择），
    但展示会**回退**：`recordAttributes(record)` 在记录自己没标时用快照里的属性，
    免得丢掉「一次是什么」；`attributeText(list)` 用 ` · ` 连接、空则 `undefined`。

## 6. 关键文件索引

- 迁移与 schema：`src/db/schema.ts`、`src/db/migrations.ts`
- 连接与门禁：`src/db/client.ts`、`src/db/DatabaseProvider.tsx`、`src/components/DatabaseGate.tsx`
- 领域：`src/domain/models.ts`（含 `toDefinitionSnapshot` / `recordAttributes` / `attributeText` / `toRecordKind` / `isVisibleRecord` / `isVisibleEntry` / `DeletedCycleEntry`）、`src/domain/validation.ts`（含 `requireNotFuture`、`readTextList`（宽松解析属性 JSON）、周期输入类型）、`src/domain/dates.ts`（纯日历日期）、`src/domain/cycles.ts`（周期规则：`findDatesOutside` / `findOverlappingInstance` / `observedCycleLength` / `predictNextCycle`）、`src/domain/backup.ts`（备份格式契约 `BACKUP_FORMAT` / `parseAttributes` / 严格解析 `parseBackup` / 引用完整性 `assertBackupIntegrity` / 合并 `mergeBackup` / 稳定排序 `sortBackupData` / 文件名 `backupFileName`）
- 仓储：`src/repositories/eventDefinitionRepository.ts`（计数型与周期型共用；`normalizeDraft` 保证「周期 ⟺ `cycleMode`」且周期型属性恒为 `[]`）、`eventRecordRepository.ts`（记录 / 补录 / **`update` 更正事实** / `softDelete` / `restore` / `remove` 真删 / `list` 的时间范围下推 `from` / `until`）、`cycleInstanceRepository.ts`（含边界「不静默删除」与不重叠校验）、`cycleEntryRepository.ts`（一天一条的 UPSERT + 复活 + `softDelete` / `restore` / `listDeleted` + 导出用的 `listAll` + 统计用的 `listVisible`）、`eventGroupRepository.ts`、`tagRepository.ts`、`backupRepository.ts`（`exportAll` / `previewImport` / `importAll`）、`metaRepository.ts`（键值偏好，时间轴显示方式用它）
- 功能组件：`src/features/definitions/`（定义表单 `EventDefinitionForm`：**类型（计数 / 周期）+ 属性多行 + 周期字段 + 快捷选项「属性 + 取值」**）、`src/features/records/`（`format`（含 `formatRowValue` / `formatFullTime` / `describeRecord`）/ `RecordRow` / `RecordGroupRow`（合并行 + 就地展开）/ `groupRecords.ts`（按定义分组的纯函数）/ `timelineView.ts`（显示方式偏好）/ `UndoBar`）、`src/features/cycles/`（`labels` 含 `describePrediction` / `describeLatestCycle` / `describeOverlap` / `describeCycleDefinition` / `CYCLE_MODE_LABELS` / `CYCLE_MODE_HINTS` / `predictionWindow.ts`（预测窗口这个纯偏好的选项 / 解析 / 文案）/ `calendar` 月视图纯计算 / `MonthCalendar` 网格 / `SymptomStatsCard`）、`src/features/stats/aggregate.ts`（统计聚合与窗口对比，纯函数；`TREND_RANGES` 是窗口长度的唯一来源，`statsReadRange` 算出「至少要读到哪一段」，`DefinitionTotal.attributeText`）、`src/features/stats/symptoms.ts`（按症状统计，纯函数）、`src/features/stats/labels.ts`（对比与症状的说法，纯函数）、`src/features/backup/csv.ts`（记录 CSV，多个属性用 ` | ` 连接）、`src/features/backup/transfer.ts`（唯一碰文件系统/系统选择器的地方）、`src/features/common/datetime.ts`（本地时间 ↔ UTC）
- 界面：`src/app/(tabs)/definitions.tsx`（**事件页：计数 / 周期同一张列表**，计数进记录页、周期进 `/cycles/[id]`）、`src/app/(tabs)/index.tsx`（时间轴：逐条 / 合并 + 行内【+1】，`FlatList`）、`src/app/(tabs)/stats.tsx`（统计）、`src/app/(tabs)/settings.tsx`（诊断 + **偏好设置（时间轴显示 / 周期预测窗口）** + 备份与恢复）、`src/app/events/new.tsx`、`src/app/events/[id].tsx`（编辑定义）、`src/app/record/[id].tsx`（记录 / 补录，**属性多选 chips**）、`src/app/records/[id].tsx`（**单条记录详情：快照 + 修改 / 删除 / 撤销**）、`src/app/records/deleted.tsx`（回收站）、`src/app/cycles/[id].tsx`（周期型事件详情：开一段 / 生成下一段 / 归档 / 删除；非周期型定义会提示并给「去记录页」）、`src/app/cycle-instances/[id].tsx`
- 走读文档：`docs/learning/08-event-definitions.md`、`09-event-recording.md`、`10-backfill-and-undo.md`、`11-cycle-tracking.md`、`12-statistics.md`、`13-permanent-delete-and-trash.md`、`14-backup-and-restore.md`、`15-maestro-e2e.md`、`16-timeline-row-and-detail.md`
- 端到端：`.maestro/README.md`（跑法与约定）、`.maestro/flows/00`–`10`（11 条流程）、`.maestro/subflows/record-once.yaml`（记一次）、`.maestro/subflows/use-expanded-view.yaml`（把时间轴钉成「逐条」）

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

- ✅ 静态检查、458 个单元用例（真实内存 SQLite）、iOS 打包。
- ✅ **本机 iOS 模拟器实机运行**（iPhone 16e / iOS 26.3 / Expo Go）：**4 个标签页** + 回收站 +
  记录页 + 周期实例页都正常渲染真实 SQLite 数据，Metro 无 JS 报错。明细见 `README.md`
  的「本机 iOS 模拟器实机运行」一节。
- ✅ **写入路径已经真手点过**（Maestro，`11/11` 通过，6m47s）：点一下记录、
  **行内【+1】即时落库**、**「逐条 / 合并」切换与就地展开**、**点行进详情 → 修改 → 删除 → 撤销**、
  回收站「恢复 / 永久删除」（含原生二次确认）、导出 JSON 到系统分享面板、
  **「事件」页新建周期型事件 → 开周期 → 越界预演 + 越界保存被拒绝**、统计页的环比 / 同比切换、
  周期内记录软删除 → 撤销 → 回收站恢复 → 彻底删除、
  **周期月视图点日期 → 保存 → 定义页症状统计**、
  **在设置里改预测窗口 → 定义页文案跟着变 → 改边界时的重叠预演**。
  流程在 `.maestro/`，走读见 `docs/learning/15-maestro-e2e.md`（时间轴改版见 `16`，周期增强见 `11`），
  结果明细见 `README.md` 的「端到端：Maestro 真手点」一节。
  另外，跑完会**直接读模拟器里的 `lifetrack.db`** 核对：`PRAGMA foreign_key_check` 为空
  （没有孤儿实例 / 每日记录），流程只新增自己造的 `Maestro*` 数据（收尾会把这些清掉）。
- ✅ **v6 的真实库升级也验过**：先用 `make-v5-fixture.cjs` + 现成的 `seed.py` 造一个 **v5 库**
  （4 个定义 + 月经的 2 段周期 / 4 条每日记录 + 15 条事件记录含 1 条软删），拷进模拟器换掉 `lifetrack.db`，
  由 App 启动时**真跑 v6 迁移**：`user_version 5 → 6`、`跑步` / `睡眠`（原 `quantity`）折成 `counter`
  且 `attributes` = 旧 `unit`（`["公里"]` / `["小时"]`）、`月经`（原周期定义）变成 `kind = 'cycle'` +
  `cycle_mode = 'manual'` 且原 id 不变、快捷选项的属性 = 旧 `unit`、周期数据一条不少、
  `cycle_definitions` 表已不存在、`PRAGMA foreign_key_check` 干净；**随后在这个「迁移过的库」上把
  Maestro 全套又跑了一遍：11/11 通过，7m20s**（不只是迁移脚本对，应用在升级后的库上也照常工作）。
  迁移本身另有一份一次性脚本（`check-v6.cjs`）在 v5 夹具库上验证过转义、索引与 `_old`/`_new` 残留。
- ✅ **「选文件导入」也真手点过了**（导入导出的最后一块）：手工两段式
  `.maestro/import/09a`（造标记 + 导出）→ 宿主把文件拷进模拟器「我的 iPhone」→
  `.maestro/import/09b`（永久删除本地那条 → 设置页「从备份导入（合并）」→ 系统文件选择器选文件 →
  二次确认框「新增 1 条、覆盖 0 条、保留本地 31 条」→ 时间轴里那条真的回来了，**id 与文件里逐字相同**）。
  边界（诚实记录）：模拟器上分享面板的「保存到"文件"」**点得动但不落盘**（没登 iCloud 账号），
  所以素材是宿主 `cp` 进去的，**跨 App 那一步没有端到端闭环**；真机未验证。
  这一步还**撞出一个真 bug**：自家备份被自己拒（导入端只认 UUID v7，而老库里是 v4），
  已修（`assertEntityId`，见第 10 节与技术债）。
- ❌ **没在 Android 与真机上跑过**（Maestro 流程也只写了 iOS 路径）。
- ❌ 界面交互的**组件级**自动化测试仍没有（项目里只有单元测试 + Maestro 端到端两层）。

## 9. 下一步任务：第二阶段剩余项

「回收站与永久删除」、「导入导出」、「周期功能的增强（预测依据 / 边界预演）」、
「统计的增强（环比 / 同比）」、「时间轴与记录详情改版」与**「周期并入事件类型 + 属性可多条」（v6）**
都已完成
（见 `docs/learning/13-permanent-delete-and-trash.md`、`14-backup-and-restore.md`、
`11-cycle-tracking.md` 的 4.2 / 4.8 / 4.13 节、`12-statistics.md` 的 3.9–3.11 节、
`16-timeline-row-and-detail.md`）。剩下的候选按推荐顺序：

### 9.1 周期功能的增强（✅ 已完成）

已完成：预测改用「最近 N 段实际间隔的平均」（含 `basis` 依据）、保存边界前预演越界日期、
周期内记录的回收站（v5：`cycle_entries.deleted_at`，与事件记录共用回收站页面）、
日历式月视图（点选日期）与按症状统计（`docs/learning/11-cycle-tracking.md` 4.10 节、
`12-statistics.md` 3.12 节），以及最后的收尾：

- ~~预测窗口（当前固定 3 段）做成界面上可调~~ → 已做：默认「最近 3 段」，
  在「设置 → 偏好设置 → 周期预测窗口」里选 1 / 3 / 5 段（全局生效，存 `app_meta.app.prediction_window`，
  见 `11-cycle-tracking.md` 4.11 节）。
- ~~边界预演目前只讲「越界」，不讲「与哪一段冲突」~~ → 已做：`findOverlappingInstance` 提到保存之前，
  提示里**点名撞上的那一段**（见 `11-cycle-tracking.md` 4.12 节）。

### 9.2 统计的增强（可选，穿插）

已完成：环比 / 同比对比（窗口对齐、差值与变化率、对照期为 0 时不给百分比，见
`docs/learning/12-statistics.md` 的 3.9–3.11、4.6 节）、**把时间范围下推给 SQL**
（趋势与对比只读窗口内的记录，见 `12-statistics.md` 的 3.13 节）。剩下：

- 「按周」的本期包含还没过完的本周；可考虑另给一个「只比已结束的周」的口径（现在没有，因为那偏外推）。
- 「概览」与「按事件统计」是**累计**口径，仍要读全量（实测 2 万条记录时约占统计页耗时的一半）。
  真要再往下压，只能把聚合本身搬进 SQL（`GROUP BY` + 快照名 / 属性一致性），那会把现在集中在
  纯函数里的规则复制一份到 SQL——已在第 10 节记成待评估项，不顺手做。

### 9.3 导入导出的收尾（✅ 已完成）

- ~~**「选文件导入」还没手测过**~~ → 已补：`.maestro/import/09a` + `09b` 的**手工两段式**
  （跑法与坑见 `.maestro/README.md`）。同时修掉了它撞出来的 id 版本边界
  （导入端原本只认 UUID v7，老库里的 v4 主键会被自己拒掉；现改为 `assertEntityId` 认形状不认版本）。
  剩下的边界：**模拟器里「保存到"文件"」不落盘**，素材由宿主拷入，跨 App 那段没有端到端闭环；
  Android 上的 `expo-sharing` / `expo-document-picker` 行为同样未知。
- 备份文件可以做得更「防呆」：导入时若 `format` 对但 `data` 整个缺失，目前按空备份处理——
  可考虑提示「这看起来不是一份完整备份」。
- 导出体积优化（当前是缩进 JSON，记录很多时偏大）。

### 9.4 时间轴与记录详情改版（✅ 已完成）

目标就是「简洁快速」：列表行只保留「这条记录的信息 + 一下就能再记一条」。

- 行内右侧 = 取值 + 【+1】；点行进记录详情页（`/records/[id]`），改 / 删 / 撤销都在那里。
- 【+1】点下去即时落库，**不弹二次确认、不给撤销条**。
- 时间轴显示方式「逐条 / 合并」与周期预测窗口都收进「设置 → 偏好设置」按分组展示
  （偏好存 `app_meta`：`app.timeline_view` **默认合并**、`app.prediction_window` 默认 3 段）。
- 仓储新增 `EventRecordRepository.update`（只改事实，快照不动）。

走读：`docs/learning/16-timeline-row-and-detail.md`；端到端：`.maestro/flows/02`、`03`、`09`。

### 9.5 后面两项

1. **自定义字段（标签字段化）**（**未开始**）：事件的「标签」从全局实体改成每个事件自己的自定义字段
   （枚举单选 / 多选、时间点、时间段），全局标签入口与标签管理页退化，改在编辑事件 / 分组时内联建；
   记录时把字段值写进快照，CSV 加「字段值」列，schema 预计 v7。
   ⚠️ 注意：本轮已经把「属性」做成**自由文本、可多条**并占了 `formatVersion = 2`
   （见规则 19），这一步要在此基础上追加「带类型的字段」——别把它和「属性」混成一个概念。
2. **周期并入事件**（✅ 已完成，v6）：周期是事件类型的一种，不再有单独菜单——新建事件时可选「周期事件」
   并切到周期字段；周期分「自动循环」与「手动标记」两种做法。
   实际落地：`cycle_definitions` 并入 `event_definitions`（kind 收敛为 `counter` / `cycle`），
   底部去掉「周期」标签页（事件页一张列表并列两种类型），旧周期定义按原 id 折成 `kind = 'cycle'`
   且历史实例 / 每日记录全部保留。走读见 `11-cycle-tracking.md` 4.13 节。
   **未做（有意）**：自动循环「打开 App 时懒补齐后续段落」——本轮只做「配置 + 生成下一段」，
   后台自动写库留待以后（要动的话得先想清楚「补到哪一天为止」与重复生成的幂等）。

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
- **统计页的「累计」卡片要读全量**：`EventRecordRepository.list()` 无上限。趋势与对比已经把时间范围
  下推给 SQL（`list({ from, until })` + `statsReadRange`，见 `12-statistics.md` 3.13 节），但「概览」与
  「按事件统计」是**有史以来**的口径，仍会把全部记录读进内存再聚合（2 万条记录时，全量读 + 两个
  累计聚合约占统计页耗时的一半）。再往下压就得把聚合搬进 SQL（`GROUP BY definition_id` + 取最近
  一条快照 / 属性一致性），代价是同一套规则在 SQL 里再写一遍（纯函数那份 `summarize` /
  `aggregateByDefinition` 会失去调用方）——**先测量再决定**，本次已把数字记在 3.13 节。
- **撤销状态不跨页面**：离开页面后撤销入口消失（记录仍是软删除状态）。若要跨页面持久化，按 `docs/learning/06` 3.9 评估（优先 `Context + useReducer`，不要直接上第三方库）。
  时间轴现在**没有**撤销条（【+1】点下去就完事），撤销在记录详情页里；`UndoBar` 仍服务于
  记录页与回收站 / 周期记录那几处。
- **记录可以更正，但编辑不会通过备份传播**：`event_records` 没有 `updated_at`（它是历史，
  不参与时间戳竞争），所以导入合并对记录**只比较软删除标记**——在 A 机改了取值再导出，
  导入到一份**没改过**的 B 库会被「保留本地」挡住。要传播就得给记录加 `updated_at`
  （迁移 + 合并规则 + 备份格式），收益有限，**记在案不顺手做**。
- **软删除的周期记录可以落在实例区间外**：软删除不挡边界（这是有意的），所以「软删 → 缩边界」之后
  回收站里那条就在区间外；恢复会被拒并提示先改回边界。备份的完整性检查因此对已软删除的行放行区间校验
  （否则 App 自己导出的备份会被自己拒绝）。
- **回收站的周期区没有按实例筛选**：`listDeleted()` 返回全部软删除的周期记录（数量很小），
  没有「只看这一段的回收站」入口；记在案，量大了再说。
- **补录采用的是文本输入而非原生日期选择器**：因为原生 picker 不在 Expo Go 内置，会强制引入 development build。
  若将来接受 dev build，可再评估 `@react-native-community/datetimepicker`。
- ~~**周期预测的窗口固定为 3 段**~~ → 已做（`11-cycle-tracking.md` 4.11 节）：窗口在「设置 → 偏好设置」里可选
  1 / 3 / 5 段，存 `app_meta.app.prediction_window`。
- **边界预演是「提示」而不是「校验」**：界面用纯函数算出来的结论不参与拦截，
  真正的拒绝仍在保存时由仓储执行；越界与重叠两半都共用同一个纯函数
  （`findDatesOutside` / `findOverlappingInstance`），所以不会对不上。
- **设置里改偏好后必须「聚焦时重读」**：时间轴在 `useFocusEffect` 里重读 `app_meta`
  （挂载时只读一次的话，改完切回来不生效）。以后再加「住在设置里、作用在别处」的偏好，
  记得按这个模式来——这是本轮踩过的坑（见 `16-timeline-row-and-detail.md` 4.9 节）。
- **周期界面只有「月」这一种粒度**：月视图（`MonthCalendar`）不落库、每次由可见记录现算，
  也没有周视图 / 年视图；周期很长时翻月找某天仍是唯一路径。
- **症状统计没有时间窗口**：`aggregateSymptoms` 只吃「一组记录」，界面给的是全量（定义页按定义、
  统计页按全部），没有「最近 N 段 / 某个区间」的口径；要做的话在调用方先筛 `entries` 即可。
- **症状名不做同义归一**：`头痛` / `头疼` 分开统计（没有词典就不替使用者合并），也没有「合并两个症状」的入口。
- **导入导出的文件层**：`.maestro/flows/04` 证明「导出能写出文件、分享面板能弹出」；
  `.maestro/import/09a`+`09b` 证明「选文件 → 合并 → 落库」这一段（手工两段式）。
  仍未验证的是**模拟器里「保存到"文件"」不落盘**（没登 iCloud 账号）与**Android 上的行为**。
- **导入边界只认 id 的「形状」，不认版本**（`assertEntityId`，见 `docs/learning/14` 3.9）：
  这是**故意**的——库里早期是 v4、新写的才是 v7，只认 v7 会让老用户的备份导不回来
  （本轮手测正是撞在这上面）。所以「统一成 v7」不是待办：改历史 id 要连快照 / 引用 / 备份一起改，收益为零。
- **导入的「读」与「写」不在同一个事务窗口**：`readAll()` 在事务外（受 `withExclusiveTransactionAsync`
  只能在回调内用 `txn` 的限制），单用户单连接场景无影响；若将来出现后台写入，需要改成事务内读取或加乐观校验。
- **v6 把「数量」型定义折成了「计数」型，但历史快捷选项的取值可能不是整数**：老库里一个
  `quantity` 定义（如「饮水」+ 单位「升」+ 快捷选项 0.5）迁移后变成 `counter`，
  它的快捷选项 **取值 0.5 在保存定义 / 记录时会被 `requireQuickOptionValue` 拒绝**
  （计数型要求正整数）。历史记录不受影响（记录类型仍是 `quantity`，能正常展示与统计），
  但**编辑那个定义就会报错**——需要用户把取值改成整数，或把那条定义归档 / 删掉重建成新的事件。
  这是「类型收敛」的必然代价，记在案；若反馈多，可在迁移里把非整数取值取整或丢弃（本轮没做）。
- **属性 JSON 是宽松解析的**：`readTextList` 解析失败会退化成 `[]`（不抛错），
  因为属性只是展示信息，坏一个不值得让整页打不开；但这也意味着**手改坏的 JSON 会静默丢属性**。
- **记录上的属性不可在编辑页改**：`EventRecordEditInput` 只改取值 / 时间 / 备注——
  属性是「这一次标了哪些」，属于事实；要改只能删了重记（本轮有意不做「改属性」）。
- **属性没有「定义侧」与「记录侧」的一致性校验**：记录可以标定义列表以外的属性文本
  （现在不会发生，因为界面只给列表里的；但备份导入或将来别的入口可以）。目前靠界面约束，领域层不拦。
- **`app_meta` 不参与备份**：这是有意的（安装时间/启动次数是本机信息），但意味着「换机恢复」后
  安装时间会重新算——若要保留，需要在导入时按需挑选键。
- **CSV 只导出不导入**：CSV 没有主键与快照，无法无损往返；若要「从表格导入」，需要一套「按事件名匹配」
  的映射规则与冲突策略（属于新功能，不是补丁）。
- **导入导出没有体积/性能测试**：几万条记录下的导出耗时与文件大小未测。
- **界面布局受 Expo Go 的浮球约束**：Expo Go 的开发菜单浮球压在屏幕右上角（原生浮层，
  实测约 `[341,60]-[367,86]`），页头右侧的按钮在 Expo Go 里**点不到**（Maestro 会点到浮球，
  `03` 一开始的三次失败就是这个）。所以记录详情页的改 / 删放在页面底部的「更多操作」卡片里，
  而不是页头右侧菜单。做独立构建时没有这颗浮球，届时可以再评估放回页头。
- **「合并」视图里点行 = 就地展开，不是进详情**：这是个刻意的取舍（合并行的一下
  先用来「看逐条」），但它意味着在合并视图里进详情要先展开再点那一条。**而且「合并」现在是默认视图**
  （想「点行 = 看详情」要去「设置 → 偏好设置」选「逐条」）。如果以后觉得别扭，
  可以给合并行加一个「详情」次级入口（注意别再放到右上角，见上一条）。

## 11. 快速自检清单（接手后第一件事）

```bash
git status                 # 应干净
npm install                # 若 node_modules 不全
npm run verify             # 应为：27 套件 / 458 用例通过
npx expo export --platform ios   # 应能打包
npm start                  # Expo Go 扫码（或走下面的自动流程）

# 端到端：另开终端，Metro 保持运行
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$HOME/.maestro/bin:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
maestro test .maestro/flows      # 应为 11/11 通过（6m47s）
sqlite3 "$(xcrun simctl get_app_container booted host.exp.Exponent data)"/Documents/ExponentExperienceData/@anonymous/lifetrack-*/SQLite/lifetrack.db \
  "select count(*), sum(deleted_at is not null) from event_records;"   # 跑完核对：多的应该只有 Maestro* 那条记录
```

> ⚠️ 如果模拟器上跑的是**定稿前那一版 v6**（`user_version` 已是 6 但加载时报
> `no such column: attributes`），说明设备上的迁移内容与仓库里的不一致——删掉设备上的库
> （`.../SQLite/lifetrack.db*`）让它重建即可。**已提交的迁移不能再改**，这是本轮踩过的坑：
> v6 在定稿前改过一次内容（先 `unit → attribute`，后 `attributes` JSON 数组）。

手动走一遍（想看得更细时）：

```
建事件 → 记录 → 补录 → 看时间轴 → 点行进详情 → 改 / 删 / 撤销 → 归档/删除定义
建事件时填「属性」（可多条，如「200ml」「温水」）→ 记录页上多选属性（默认不选）→ 记一条 →
  时间轴那行应带属性（没选时回退成定义里的属性，不会空着）
新建事件时把类型点成「周期（有开始与结束）」：表单应换成周期字段（做法 + 周期长度 + 持续天数），
  两种做法各带一句说明；创建后事件页那条带「周期」徽标，点它进周期内页（不是记录页）
时间轴点【+1】：应立刻多一条（来源「快捷」），不弹任何确认；到「设置 → 偏好设置 → 时间轴显示」
  切「合并」：一个事件一行，点行就地展开成逐条、再点收起（重启 App 后应记得住上次的选择）
进那条记录的详情页 → 底部「更多操作」：改发生日期并保存（来源应变成「事后补记的」）、
  删除（页面出现「已删除」）、再撤销删除（记录回来）
切到「统计」：看概览 / 按天按周趋势 / 按事件统计；删一条记录再看数字是否变化
统计页切「较前一段 / 较上年同期」：对照窗口日期应相隔 52 周；对照期为空时不该出现百分比
回收站：恢复 / 永久删除（应弹二次确认）
周期型事件内页 → 开始新周期 → 记某天的阶段/症状 → 结束周期
做法是「自动循环」时：内页出现「生成这一段」，点它按规律写入下一段（本轮不自动写库）
再开第二段（间隔不同）→ 回定义详情看预测是否按「实际间隔」给，且写明依据
到「设置 → 偏好设置 → 周期预测窗口」改成「最近 1 段」→ 回定义详情：预测文案应跟着变（不必重启）
把结束日提前到某条记录之前 → 应立刻出现黄色预演提示，保存被拒绝（数据不能少）
把开始日改到前一段里 → 应出现「会和已有的一段周期重叠（…）」并点名那一段
删除某天的记录 → 软删除（出现「撤销」提示条，不弹确认）；删除整段周期 → 二次确认
周期里记一天 → 点「删除」→ 出现「撤销」提示条 → 撤销找回；再删 → 回收站「已删除的周期记录」里恢复 / 彻底删除
进周期实例页 → 月视图点一天 → 表单日期变成那天 → 保存 → 那格涂底色（有症状还带小圆点）
回周期定义页 → 「症状统计」列出症状与「N 天 · 百分比」；统计页拉到底也有「周期症状」
设置页：导出 JSON 备份 → 存到「文件」→ 再导入这份备份
（第二次导入应提示「新增 0 条」；导出 CSV 用表格软件打开看列是否错位）
```

走完之后，再按第 9 节挑下一项开始。