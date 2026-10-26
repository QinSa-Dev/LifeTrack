# LifeTrack

本地优先的生活记录 App：记录事件（计数 / 周期）与周期症状，并按时间轴回看与统计。

- 技术栈：React Native + Expo + TypeScript + SQLite（expo-sqlite）
- 平台：iOS / Android
- 数据：**全部存在设备本地**，无独立后端、无账号系统、无云数据库

> 当前进度：**第一阶段（工程基线）已完成**；**第二阶段第 1 项（事件定义 / 分组 / 标签 / 快捷选项 / 归档）已完成**；**第 2 项（counter / quantity 记录与时间轴）已完成**；**补录与撤销已完成**；**周期事件（周期定义 / 实例 / 每日记录）已完成**（新增 v4 迁移，schema 现为 v4）；**统计（从事实数据聚合 / 按天按周趋势 / 按事件合计）与时间轴 FlatList 虚拟化已完成**（无新增迁移，schema 仍为 v4）；**事件记录的回收站与永久删除已完成**（补全「软删除 → 撤销 → 真删」闭环，无新增迁移）；**导入导出（JSON 备份 / CSV 表格导出 / 按 id 合并的导入）已完成**（无新增迁移，schema 仍为 v4）；**周期增强（预测改用实际间隔 / 保存前预演越界日期）已完成**（无新增迁移）；**统计增强（环比 / 同比对比）已完成**（无新增迁移）；**周期内记录的回收站已完成**（追加 v5 迁移给 `cycle_entries` 加 `deleted_at`，与事件记录一样「软删除 → 撤销 → 彻底删除」）；**周期月视图（日历选日期）与按症状统计已完成**（无新增迁移，schema 仍为 v5）；**统计的时间范围下推已完成**（趋势与对比只读窗口内的记录，聚合规则仍留在纯函数里，无新增迁移）；**导入导出收尾已完成**（「选文件导入」真手点通，并修掉它撞出来的 id 版本边界：导入不再只认 UUID v7，老库里的 v4 主键也能导回来，无新增迁移）；**时间轴与记录详情改版已完成**（行内改成「取值 + 【+1】」——【+1】点下去就落库、不弹确认；点行进记录详情页，改 / 删 / 撤销都在那里；「逐条 / 合并」显示方式，偏好存 `app_meta`，无新增迁移）；**周期增强收尾已完成**（预测窗口（默认 3 段）可在「设置」里调 1 / 3 / 5，改边界时把「会和哪一段周期重叠」也提前预告，无新增迁移）；**设置项归拢已完成**（纯展示偏好——时间轴显示方式、周期预测窗口——统一收进「设置 → 偏好设置」并按分组展示，时间轴默认改为「合并」，无新增迁移）；**周期并入事件类型 + 属性可多条已完成**（v6 迁移：`cycle_definitions` 整表并入 `event_definitions`——周期就是事件的一种类型，底部去掉「周期」标签页；「单位」改成自由文本「属性」且可多条、记录时可多选；快捷选项合并成「属性 + 取值」；历史记录里的 `quantity` 类型保留不动，schema 现为 v6）；**自定义字段（标签字段化）已完成**（v7 迁移：全局「标签」实体退出，换成每个事件自己的**带类型字段**——枚举单选 / 多选、时间点、时间段，记录时给字段选值并随快照固化；旧标签数据折成一条「标签」多选字段、历史取值一并搬过来，`tags` / `event_definition_tags` 随之删除；导入 v2 及以前的备份也照同一规则折成字段，备份格式现为 v3，schema 现为 v7）；**统计趋势改版已完成**（趋势先选「看什么」——活跃事件数 / 全部 / 单个事件，默认看本期记录最多的那个事件，不再把所有事件的条数混成一个数；按天/按周与对比基准折进右上角开关；无新增迁移，schema 仍为 v7），其余核心业务尚未开始。

> 🤝 **接手 / 交接**：先读 [`HANDOFF.md`](./HANDOFF.md) —— 它记录当前状态、必须遵守的约定、已知问题与下一步任务；
> 功能走读见 [`docs/learning/`](./docs/learning/README.md)。

---

## 环境要求

| 项目 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 24.22.0 LTS（`^22.13 / ^24.3 / ^26 / ≥27` 均可） | Expo SDK 58 的 engines 要求 |
| npm | 11.x | 本仓库使用 `package-lock.json` |
| Xcode | 26.3（含 iOS SDK 26.2） | 仅 iOS 需要 |
| Android Studio / SDK | platform-tools 37+、platform android-36、build-tools 36.0.0 | 仅 Android 需要 |
| JDK | 17（构建 Android 原生壳时） | Expo Go 方式开发不需要 |

macOS 上本机已通过 `fnm` 管理 Node：所有命令都用 `fnm exec --using=24 -- <cmd>` 执行，
或先 `eval "$(fnm env --use-on-cd)"` 再直接使用 `node` / `npm`。

## 快速开始

```bash
npm install

# 启动开发服务器（会自动生成二维码，用 Expo Go 扫码）
npm start

# 指定平台
npm run ios
npm run android
```

iOS 模拟器 / 真机与 Android 模拟器都可以直接用 **Expo Go** 打开本项目（SDK 58 内置了
`expo-sqlite`），无需先做原生构建。

> **排障**：若启动后报 `Cannot find native module '...'`（例如 `ExpoSQLite`），通常是 Metro
> 的转换缓存过期导致的假故障，用 `npx expo start --clear` 重启开发服务器即可。第一阶段
> Android 首次运行时遇到过这个现象，已确认清理缓存后恢复正常。

> 若后续加入了**不在 Expo Go 内置列表里**的原生模块，就必须改用开发构建：
> `npx expo run:ios` / `npx expo run:android`。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动 Expo 开发服务器 |
| `npm run typecheck` | TypeScript 静态检查（`tsc --noEmit`） |
| `npm run lint` / `npm run lint:fix` | ESLint 检查 / 自动修复 |
| `npm run format` / `npm run format:check` | Prettier 格式化 / 校验 |
| `npm test` / `npm run test:watch` | Jest 单元测试 |
| `npm run verify` | 一把梭：typecheck + lint + test |
| `npm run doctor` | `expo-doctor` 依赖与配置体检 |
| `maestro test .maestro/flows` | 端到端：在 iOS 模拟器上真手点写入路径（需先起 Metro，见 [`.maestro/README.md`](./.maestro/README.md)） |

## 目录结构

```
src/
  app/                    # expo-router 路由（每个文件即一个屏幕）
    _layout.tsx           # 根布局：注入 DatabaseProvider + 数据库门禁
    (tabs)/               # 底部四标签：时间轴 / 统计 / 事件 / 设置
                          #   index 时间轴（FlatList）/ stats 统计 /
                          #   definitions 事件（计数 + 周期同一张列表）/
                          #   settings 诊断 + 偏好设置 + 备份与恢复（导出 JSON / 导出 CSV / 导入合并）
    events/new.tsx        # 新建事件定义（类型选「计数」或「周期」）
    events/[id].tsx       # 编辑事件定义（归档 / 永久删除）
    record/[id].tsx       # 记录一次事件（快捷 / 手动 / 补录）＋ 属性多选 + 最近记录（取值 + 【+1】）
    records/[id].tsx      # 单条记录详情：快照 + 「更多操作」（修改 / 删除 / 撤销删除）
    records/deleted.tsx   # 回收站：软删除的记录恢复 / 永久删除
    cycles/[id].tsx       # 周期型事件详情（周期列表 / 开始新周期 / 生成下一段 / 归档 / 删除）
    cycle-instances/[id].tsx  # 一段周期 + 每日记录 + 边界调整 + 删除
    groups.tsx            # 分组管理
    +not-found.tsx        # 兜底路由
  components/             # 通用 UI（Screen / Card / Button / Badge / AppText / EmptyState
                          #          TextField / Chip / Header / ListRow / DatabaseGate）
  features/               # 非通用的功能组件（不属于每个页面都用的基础 UI）
    definitions/          # 事件定义表单 EventDefinitionForm（类型 / 属性多行 / 周期字段 / 自定义字段 / 快捷选项）
                          #   fields（字段类型标签与提示）、展示文案
    records/              # format（记录值 / 时间 / 来源）、FieldValuePicker（字段取值控件）、
                          # RecordRow（记录行：取值 + 【+1】）、
                          # RecordGroupRow（合并行 + 就地展开）、groupRecords（分组，纯函数）、
                          # timelineView（逐条 / 合并偏好）、UndoBar（软删除后的撤销条）
    cycles/               # 周期展示文案（含做法说明与预测依据）、症状解析、
                          # predictionWindow（预测窗口这个纯偏好的选项 / 解析 / 文案）
    stats/                # aggregate：从事实记录聚合（按定义 / 按天 / 按周 / 概览 / 环比同比），纯函数
                          # labels：对比的说法（差值与百分比；对照期为 0 时不编造百分比）
    backup/               # csv：记录 CSV（RFC 4180 + BOM，纯函数）
                          # transfer：写文件 + 分享 + 选文件（唯一碰文件系统的地方）
    common/               # datetime：本地时间 ↔ UTC（补录与周期共用）
  db/                     # 数据库基础设施
    client.ts             # 唯一连接入口（PRAGMA、单例、失败不覆盖数据）
    migrations.ts         # 版本化迁移执行器（user_version + 独占事务）
    schema.ts             # schema 与迁移清单（v1 app_meta / v2 事件定义 / v3 历史记录 / v4 周期 / v5 周期记录软删除 / v6 周期并入事件 + 属性可多条 / v7 自定义字段替换标签）
    types.ts              # SqlExecutor 抽象（便于用内存 SQLite 测试）
    testing/              # 测试专用：node:sqlite 适配器
  domain/                 # 领域层
    models.ts             # 事件定义 / 记录 / 周期等领域模型 + 快照生成
    validation.ts         # 输入类型与校验规则（表单与仓储共用）
    dates.ts              # 纯日历日期运算（IsoDate，一律按 UTC 解释，不沾时区）
    cycles.ts             # 周期规则（越界 / 重叠 / 长度 / 观察到的间隔 observedCycleLength / 预测 predictNextCycle）
    backup.ts             # 备份格式契约 / 外部 JSON 严格解析 / 合并规则（纯函数）
    errors.ts             # 统一错误类型（AppError + code）
    id.ts                 # UUID v7 主键方案
  repositories/           # 仓储层（SQL 只写在这里）
    eventGroupRepository.ts      # 分组
    eventDefinitionRepository.ts # 事件定义聚合（计数 / 周期共用：定义 + 快捷选项 + 自定义字段；周期型恒不带字段）
    eventRecordRepository.ts     # 历史记录（记录时生成快照、软删除与撤销、update 更正事实）
    metaRepository.ts            # 键值偏好（app_meta；时间轴显示方式用它）
    cycleInstanceRepository.ts   # 周期实例（含「改边界不静默删除」与不重叠校验）
    cycleEntryRepository.ts      # 周期内记录（一天一条，UPSERT）
    backupRepository.ts          # 导出全表 / 合并导入（独占事务 + 事务内体检）
  theme/                  # 设计令牌（颜色 / 间距 / 字号）
docs/
  learning/               # 中文开发指北（面向不熟悉 React / TS 的读者）
    README.md             # 学习导航：已完成功能 → 文档、阅读顺序、概念清单、架构与进度
    01-project-bootstrap.md
    02-react-native-ui.md
    03-typescript-domain-model.md
    04-sqlite-and-repository.md
    05-business-logic-and-data-flow.md
    06-navigation-and-state.md
    07-testing-and-debugging.md
    08-event-definitions.md
    09-event-recording.md
    10-backfill-and-undo.md
    11-cycle-tracking.md
    12-statistics.md
    13-permanent-delete-and-trash.md
    14-backup-and-restore.md
    15-maestro-e2e.md
    16-timeline-row-and-detail.md
    17-custom-fields.md
.maestro/                 # 端到端流程（Maestro）：在 iOS 模拟器上真的点击应用 + 读库核对
  README.md               # 跑法、前置条件、选择器上的坑、「不许 clearState」等约定
  flows/                  # 00 冒烟 / 01 记录 / 02 点行进详情改删撤销 / 03 回收站 / 04 导出 / 05 周期边界 / 06 统计对比 / 07 周期记录软删 / 08 月视图选日期 / 09 【+1】与合并显示 / 10 预测窗口与重叠预演
  import/                 # 09a/09b：选文件导入（手工两段式，中间要宿主把文件拷进「我的 iPhone」）
  subflows/               # 被 runFlow 引用的共用片段（record-once：记一次；use-expanded-view：把时间轴钉成「逐条」）
```

## 开发指北（学习文档）

`docs/learning/` 下是一套**以本仓库真实代码为依据**的中文走读材料：每篇包含「本次完成什么 / 改了哪些文件 /
相关技术概念 / 关键代码逐段解释 / 一次完整数据流的 Mermaid 流程图 / 如何验证 / 常见问题排查 / 学习总结与练习」。

入口：[`docs/learning/README.md`](./docs/learning/README.md)。

推荐顺序：`01 工程基线 → 05 业务与数据流 → 06 导航与状态`（快速走读），
深入类型与数据层时再读 `03 领域模型 → 04 SQLite 与 Repository`，
了解第二阶段第 1 项（事件定义）时读 `08 事件定义`（**属性可多条见第 9 节**），
了解第 2 项（记录与时间轴）时读 `09 事件记录`，
了解补录与撤销时读 `10 补录与撤销`，
了解周期事件时读 `11 周期事件`（预测依据与边界预演以 4.2 / 4.8 节为准，**月视图见 4.10 节**，
**预测窗口与重叠预演见 4.11 / 4.12 节**，**周期并入事件类型见 4.13 节**），
了解统计与时间轴虚拟化时读 `12 统计`（环比 / 同比见 3.9–3.11 节，**按症状统计见 3.12 节**，**时间范围下推见 3.13 节**），
了解回收站与永久删除时读 `13 回收站与永久删除`，
了解备份与恢复（导入导出）时读 `14 备份与恢复`（**格式 v3 与旧备份折算见文首警示**），
了解端到端自动化时读 `15 Maestro 真手点`，
了解自定义字段（标签字段化，v7）时读 `17 自定义字段`。

> 文档随功能同步更新；尚未实现的功能（整体架构演进）暂不写作，避免空文档。

## 领域规则（已确认，代码中已体现）

1. **事件定义与历史记录分离**：改定义不影响已产生的历史。
2. **历史快照**：记录保存当时的定义快照，配置变化不会改写历史。
3. **周期实例与周期内记录独立建模**；但**周期定义不单独建表**——v6 起它就是 `kind = 'cycle'` 的
   事件定义（见规则 15）。
4. **周期边界修改不得静默删除越界记录**。
5. **归档不删除历史**，只影响能否继续记录。
6. **永久删除必须二次确认**，并保证事务一致性。
7. **统计从事实数据计算**，不落冗余汇总表。
8. **导入是合并，不是覆盖**：并进本地数据、本地独有的一律保留；同 id 冲突按「较新的 `updatedAt` 胜出」；
   导入失败**整体回滚**，不留半截数据。
9. **预测必须有依据**：优先用最近若干段**实际间隔**的平均，没有历史才退回配置的平均周期长度，
   两者都没有就**不做预测**（`predictNextCycle` 返回 `undefined`，界面明说「暂不做预测」）。
10. **统计不编造数字**：属性不一致就不合并计量；对比的对照期为 0 时**不给变化率**
    （宁可说「无法算变化率」，也不显示 `+100%`）。
11. **快照不可改，事实可更正**：记录本身可以改（取值 / 发生时间 / 备注），但记录时的名称、
    属性、分组、字段定义与取值是快照，永不更新；改发生时间仍不能晚于录入时间，已软删除的记录要先撤销删除再改。
    记录上标了哪些属性（`record.attributes`）也属于事实，同样不在编辑页改。
12. **即时反馈优先于二次确认**：可逆、高频的动作（【+1】、软删除）**不拦人**；
    不可逆的动作（永久删除）必须二次确认。撤销入口放在「这条记录」自己的页面里，不占列表行。
13. **纯展示偏好不进业务表、且集中放在「设置」里**：时间轴的「逐条 / 合并」与周期预测窗口
    都存在 `app_meta`（`app.timeline_view` 默认合并、`app.prediction_window` 默认 3 段），
    开关统一收在「设置 → 偏好设置」；页面在**聚焦时重读**，改完切回来立刻生效。
14. 首版不做 Todo、云同步、多设备同步。
15. **「周期」是事件的一种类型，不是独立实体**（v6）：类型只有 `counter` / `cycle`，
    周期定义就是 `kind = 'cycle'` 的事件定义（`cycleMode` + 两个平均长度）；
    底部**没有**「周期」标签页，事件页一张列表并列两种类型。
    周期分两种做法：**自动循环**（按规律算出下一段，本轮只做「配置 + 生成下一段」，
    **不做后台自动写库**）与**手动标记**（自己点开始 / 结束，时长不预先限定）。
    历史记录类型仍保留 `counter` / `quantity`（老记录不能改），新建不了 `quantity` 记录。
16. **属性是自由文本、可以多条**（v6）：事件定义 `attributes: string[]`（周期型恒为 `[]`），
    快捷选项是「属性 + 取值」（`attribute?` 从定义那份列表里挑，不再单独填名称），
    一条记录 `attributes: string[]` 可多选。**记录时属性默认不选**（用户明确选择），
    但展示会**回退**：记录自己没标时用快照里的属性（免得丢掉「一次是什么」）。
17. **已提交的迁移不能再改**：v6 在定稿前改过一次内容（先 `unit → attribute`，后 `attributes`
    JSON 数组），设备上已按旧内容把 `user_version` 记成 6，于是定稿后的 v6 不再执行、
    界面报 `no such column: attributes`——只能删掉设备上的库重建。教训：迁移一旦提交（或跨设备跑过）
    就是历史，改内容要新开一个迁移号。
18. **「标签」不再是全局实体，换成每个事件自己的带类型字段**（v7）：字段有四种类型
    ——`single`（单选）/ `multi`（多选）/ `time`（时间点 `HH:mm`）/ `range`（时间段 `HH:mm–HH:mm`），
    枚举型必须带候选值；**只有计数型事件有字段**（周期型记的是「哪一天」）。
    记录时给字段选值，取值随记录快照固化（快照里存字段定义，历史照样能自证）。
    全局「标签」页与 `tags` / `event_definition_tags` 表一并删除，旧标签折成一条名为「标签」的
    多选字段、历史取值同时搬过来（导入 v2 及以前的备份也照此折算）。

> 规则 3、4 已在**周期事件**里落地：实例与记录各自建表、各自一个仓储；
> 修改边界时先算「哪些日期会越界」，有越界就**拒绝更新并列出日期**，绝不静默删除
> （见 `docs/learning/11-cycle-tracking.md` 与 `src/repositories/cycleInstanceRepository.ts`）。
> 规则 3 的「周期定义不单独建表」与规则 15、16 已在 **v6（周期并入事件类型 + 属性可多条）**里落地：
> `cycle_definitions` 整表并入 `event_definitions`，旧周期定义按原 id 折成 `kind = 'cycle'`
> 且实例 / 每日记录一条不少；「单位」变成可多条的「属性」，快捷选项合并成「属性 + 取值」
> （见 `docs/learning/11-cycle-tracking.md` 的 4.13 节、`08-event-definitions.md` 的 9 节）。
>
> 规则 8 已在**导入导出**里落地：`mergeBackup` 是纯函数（本地 ∪ 备份），
> 写库放一个独占事务并在事务内核对行数 + 外键（见 `docs/learning/14-backup-and-restore.md`）。
>
> 规则 9 已在**周期事件**里落地：`observedCycleLength` / `predictNextCycle` 是纯函数，
> 返回值带 `basis`（`observed` / `configured`）说明依据，界面据此把「算出来的」与「按配置推的」分开讲；
> 同一条越界规则（`findDatesOutside`）既用于保存时的拒绝，也用于保存前的界面预演，
> 重叠规则（`findOverlappingInstance`）同样被提前到保存之前
> （见 `docs/learning/11-cycle-tracking.md` 的 4.2、4.8、4.12 节）。
>
> 规则 10 已在**统计**里落地：属性不一致时 `attributeText` 为 `undefined`；对比时
> `recordCountRate` 在对照期为 0 时也为 `undefined`，由 `features/stats/labels.ts` 说成
> 「无法算变化率」（见 `docs/learning/12-statistics.md` 的 3.10 节）。
>
> 规则 11–13 已在**时间轴行改版与记录详情**里落地：`EventRecordRepository.update` 只收
> 取值 / 发生时间 / 备注三个字段；【+1】点下去直接落库、不给确认条；「逐条 / 合并」与
> 周期预测窗口都存 `app_meta` 并收进「设置 → 偏好设置」
> （见 `docs/learning/16-timeline-row-and-detail.md` 的 4.9 节）。
>
> 规则 18 已在**自定义字段（v7）**里落地：字段有类型、要选值，和「属性」严格分开；
> 历史快照里存的既不是「定义引用」也不是「当前定义」，而是**记录当时的字段定义与取值**
> ——定义后来改了名、换了候选值甚至删了字段，历史照旧能自证
> （见 `docs/learning/17-custom-fields.md` 与 `08-event-definitions.md` 第 10 节）。

## 数据安全约定

- schema 版本记录在 SQLite 自带的 `PRAGMA user_version`，不额外建表。
- 每个迁移在**独占事务**中执行：SQL 与版本号提要么一起成功，要么一起回滚。
- 迁移失败、或数据库版本高于应用支持的版本时，**拒绝启动并保留原数据文件**，
  绝不删除、绝不重建空库覆盖用户数据；界面会展示错误码并提供重试。

## 测试策略

- 单元测试跑在 **真实的内存 SQLite**（Node 内置 `node:sqlite`）上，
  因此迁移 SQL、约束、`PRAGMA` 行为都是真的被执行，而不是对 mock 断言调用顺序。
- 设备侧使用 `expo-sqlite`，与测试环境的 SQLite 版本可能略有差异，
  所以**端到端结论仍以模拟器 / 真机实际运行为准**。
- 界面写入路径由 `.maestro/` 下的 Maestro 流程在**真实模拟器**上点击验证，
  并在跑完之后**直接读模拟器的 `lifetrack.db`** 核对是否真的落盘（见「端到端：Maestro 真手点」）。

## 第一阶段验收记录

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 4 个套件 / 32 个用例通过 |
| `npm run doctor` | 20/20 通过 |
| iOS 模拟器运行 | 见阶段报告 |
| Android 模拟器运行 | 见阶段报告 |
| SQLite 跨重启持久化 | 见阶段报告 |

## 第二阶段第 1 项验收记录（事件定义）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 8 个套件 / 83 个用例通过 |
| schema | v2 迁移（5 张表 + 3 个索引），从 v1 升级只跑 v2、旧数据不丢 |
| iOS 打包 | `npx expo export --platform ios` 通过（1242 modules） |
| 模拟器 / 真机运行 | 本次未跑；后已在本机 iOS 模拟器统一补齐（见文末「本机 iOS 模拟器实机运行」） |

## 第二阶段第 2 项验收记录（记录与时间轴）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 9 个套件 / 108 个用例通过 |
| schema | v3 迁移（`event_records` + 2 个索引），无指向定义的外键，删定义不删历史 |
| iOS 打包 | `npx expo export --platform ios` 通过（1245 modules） |
| 模拟器 / 真机运行 | 本次未跑；后已在本机 iOS 模拟器统一补齐（见文末「本机 iOS 模拟器实机运行」） |

## 第二阶段验收记录（补录与撤销）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 11 个套件 / 137 个用例通过 |
| schema | **无新增迁移**，仍为 v3（补录复用 `source: 'backfill'`，撤销复用已预留的 `deleted_at` 列） |
| 领域规则 | 补录只能回到过去（`requireNotFuture`，按时间比较而非字符串）；软删除可撤销、幂等；永久删除才需二次确认 |
| iOS 打包 | `npx expo export --platform ios` 通过（1248 modules） |
| 模拟器 / 真机运行 | 本次未跑；后已在本机 iOS 模拟器统一补齐（见文末「本机 iOS 模拟器实机运行」） |

## 第二阶段验收记录（周期事件）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 16 个套件 / 209 个用例通过 |
| schema | v4 迁移（`cycle_definitions` / `cycle_instances` / `cycle_entries` + 索引），从 v1 升级只跑 v2/v3/v4 且旧数据不丢 |
| 领域规则 | 边界修改不静默删除越界记录（`ConflictError` + `details.outsideDates`）；同一周期实例不重叠；一天一条（`UNIQUE(instance_id, date)` + UPSERT）；永久删除均二次确认 |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 2.9MB） |
| 模拟器 / 真机运行 | 本次未跑；后已在本机 iOS 模拟器统一补齐（见文末「本机 iOS 模拟器实机运行」） |

## 第二阶段验收记录（统计）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 17 个套件 / 223 个用例通过 |
| `npm run format:check` | 通过 |
| schema | **无新增迁移**，仍为 v4（统计从 `event_records` 实时聚合，不落汇总表） |
| 领域规则 | 统计从事实数据算；只统计未软删除记录；按设备本地时区分天/周（ISO 周，周一起算）；属性不一致的数量不合并计量 |
| 时间轴 | 由 `ScrollView` + `map` 改为 `FlatList` 虚拟化，每行单独成卡 |
| iOS 打包 | `npx expo export --platform ios` 通过（1261 modules，js bundle 2.9MB） |
| 模拟器 / 真机运行 | 本次未跑；后已在本机 iOS 模拟器统一补齐（见文末「本机 iOS 模拟器实机运行」） |

## 第二阶段验收记录（永久删除 / 回收站）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 17 个套件 / 228 个用例通过 |
| `npm run format:check` | 通过 |
| schema | **无新增迁移**，仍为 v4（真删就是 `DELETE` 已有行；后者已由 v5 补上周期记录的软删除） |
| 领域规则 | 软删除（可撤销）与真删（不可逆）分成两个方法、两个入口；真删必须界面二次确认；删不存在的行抛 `NotFoundError` |
| 范围 | 事件记录先有回收站；周期内记录当时仍是直接真删，后已由 v5 补齐（见下方「周期内记录回收站」验收记录） |
| iOS 打包 | 见「统计」验收记录（同一批变更，未单独打包） |
| 模拟器 / 真机运行 | 见下方「本机 iOS 模拟器实机运行」 |

## 第二阶段验收记录（导入导出）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | **20 个套件 / 277 个用例通过**（本次新增 49 个） |
| `npm run format:check` | 通过 |
| schema | **无新增迁移**，仍为 v4（导出只读、导入只重写已有行） |
| 导出 | 七张业务表打包成 JSON，**含归档定义与软删除记录**；`format` / `formatVersion` / `schemaVersion` 三层元信息 |
| 导入 | 取并集合并（本地独有必保留）；同 id 按 `updatedAt` 较新者胜；事件记录只合并软删除标记 |
| 一致性 | 单个独占事务：清空 → 写回 → **事务内**核对行数 + `PRAGMA foreign_key_check`；失败整体回滚 |
| 预演 | `previewImport` 只读算出「新增 / 覆盖 / 保留」，`Alert` 确认后才写库 |
| 外部数据 | 严格逐字段解析，错误带路径（如 `data.eventRecords[0].value`）；引用完整性 + 周期记录区间校验 |
| 新增依赖 | `expo-file-system` / `expo-sharing` / `expo-document-picker`（**均在 Expo Go 内置**，无需 development build） |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB） |
| 依赖体检 | `npx expo-doctor` 19/20：8 个**旧依赖** patch 版本漂移（与本次无关，本次新增的 3 个模块版本与 SDK 58 期望一致） |
| 模拟器 / 真机运行 | 本次没跑（分享面板、系统文件选择器都是原生 UI）。后来补齐：「导出 JSON → 分享面板」由 `.maestro/flows/04` 覆盖；**「选文件导入」**由 `.maestro/import/09a` + `09b` 的手工两段式覆盖（见下「导入导出收尾」一节）。仍**未跑**的是 Android 与真机 |

## 第二阶段验收记录（周期功能增强）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | **21 个套件 / 291 个用例通过** |
| `npm run format:check` | 通过 |
| schema | **无新增迁移**，仍为 v4（只改了预测的计算方式与界面提示，没动表结构） |
| 预测 | 三级优先：最近 3 段「相邻开始日之差」的平均 → 定义里配置的平均周期长度 → `undefined`（不预测） |
| 预测依据 | 返回值带 `basis` / `observedGaps`；界面说清「按最近 N 段间隔的平均 X 天」还是「按配置的 X 天」 |
| 边界预演 | 改边界时**保存之前**就提示「会有哪几天落在区间外」；与仓储保存时的拒绝共用纯函数 `findDatesOutside` |
| 收敛 | 删掉仓储里重复的只读查询 `listOutsideEntryDates`（记录已在界面上，无需再查一次库） |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB） |
| 模拟器 / 真机运行 | **未跑**：预测与预演都只在逻辑与单测层面验证过，没有手点 → 后已用 Maestro 补齐（越界预演 + 保存被拒，见文末「端到端：Maestro 真手点」） |

## 第二阶段验收记录（统计增强：环比 / 同比）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | **22 个套件 / 319 个用例通过**（本次新增 28 个） |
| `npm run format:check` | 通过 |
| schema | **无新增迁移**，仍为 v4（对比是纯函数现算，不建汇总表） |
| 环比 | 本期是最近 N 天 / N 周（与趋势图共用同一个 `RANGES`）；对照期是紧挨着的同样长度前一段 |
| 同比 | 本期整体往前挪 **52 周（364 天）**，星期几与周桶都对得上；界面写「上年同期」并显示两个窗口的日期范围 |
| 口径 | 只比**条数**（不同单位的值本来就不可相加）；逐事件给出本期 / 对照期条数与差值 |
| 不给数字 | 对照期为 0 时 `recordCountRate` 为 `undefined`，界面说「无法算变化率」，**不显示编造的 +100%** |
| 界面 | 趋势卡片新增「对比」选择（较前一段 / 较上年同期）＋一句结论；「按事件统计」每行补一句窗口对比 |
| 文案单测 | `src/features/stats/labels.ts` + 13 个用例覆盖「有记录 / 对照期为空 / 两边都空」三种说法 |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB） |
| 模拟器 / 真机运行 | **未跑**：两个对比 `Chip` 与文案没有手点过（本机无法自动化点击）；Android 未跑 → 后已用 Maestro 补齐（见文末「端到端：Maestro 真手点」） |

## 第二阶段验收记录（周期内记录回收站）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | **22 个套件 / 338 个用例通过**（本次新增 19 个） |
| `npm run format:check` | 通过 |
| schema | **v5 迁移**：`ALTER TABLE cycle_entries ADD COLUMN deleted_at TEXT`（追加新迁移而不是改 v4；旧行自动为 NULL = 未删除） |
| 真实数据库升级 | 在模拟器上把使用者的 v4 库升到 v5：`user_version 4 → 5`，15 条事件记录 / 4 条周期记录 / 1 条软删一条没少，`PRAGMA foreign_key_check` 干净 |
| 删除分两级 | 周期页「删除」= 软删除（写 `deleted_at`，页面出现「撤销」提示条）；回收站里才「彻底删除」——整条链路上唯一不可撤销的一步，原生弹窗二次确认 |
| 回收站 | 一个页面管两种记录：原「已删除的记录」+ 新的「已删除的周期记录」（日期 · 所属周期与区间 · 删除时间，带恢复 / 永久删除） |
| 复活语义 | 对已软删除的那天再保存 = 复活（`deleted_at` 清空）——否则会出现「提示保存成功、列表里却没有」 |
| 区间规则 | 恢复也要重新过「日期在实例区间内」：软删除期间边界可能已缩走，这时恢复被拒并说明原因（先把边界改回来，或彻底删除） |
| 边界与回收站 | 边界预演 / 越界校验只看**未软删除**的记录（回收站里那几天不挡边界）；备份的完整性检查也放行「已软删除且落在区间外」的行 |
| 备份 | 周期记录带上 `deletedAt`（可选字段：旧备份缺失即未删除，新旧互认；导入合并按 `updatedAt` 较新者胜） |
| 无障碍修正 | `ListRow` 整行可点时，行内按钮曾被合并进整行那一个元素（读屏读不到、自动化也点不到）→ 改成「文字区」自己当无障碍按钮 |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB；只动了 SQL/JS 与文案，无新增原生依赖） |
| 端到端 | 新增 Maestro 流程 `07`：软删除 → 撤销 → 回收站恢复 → 彻底删除（原生二次确认）；当日全套 **8/8 通过**（现为 9 条流程，见下方「端到端：Maestro 真手点」） |

## 第二阶段验收记录（周期月视图与按症状统计）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | **24 个套件 / 381 个用例通过**（本次新增 43 个） |
| `npm run format:check` | 通过 |
| schema | **仍为 v5，无新增迁移**：症状统计复用 `cycle_entries.symptoms`，月视图不落库（每次由记录现算） |
| 月视图 | 周期实例页新增「月视图」：月初补白到周一、**区间外的日子变灰且点不动**（仓储也会拒绝，不如一开始就不给点）、今天带细边框、有记录的日子涂底色 + 「有症状」小圆点；默认停在今天所在的月；翻月只在「这个月里还有落在区间内的日子」时可用；边界缩走之后自动把月份拉回区间内 |
| 选日期 | **点一天 = 把那一天填进同一个表单**（与点列表行同一个入口），卡片下方 `当前选中：2026-10-02` 跟着变；保存 / 校验 / 软删除仍然只有一条路 |
| 症状统计 | 按症状汇总天数与占比：**分母是「记了症状的记录数」**（不是全部记录），同一天里重复写的同一个症状只算一次，软删除的记录不计入；**不做同义归一**（`头痛` ≠ `头疼`，没有词典就不替使用者合并） |
| 两处入口 | 周期定义页「症状统计」（只算这个定义）+ 统计页「周期症状」（全部周期记录，只列前 5 种）；两处共用同一个展示组件，口径在纯函数里 |
| 数据层 | 新增 `CycleEntryRepository.listVisible(definitionId?)`：跨实例返回**可见**周期记录（导出用的 `listAll` 仍含软删除，两者在注释里写明差别） |
| 统计页空状态 | 改成「事件记录与周期记录**都**为空」才显示空状态：只用周期的使用者也能看到症状汇总 |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB；只动了 JS / 文案，无新增原生依赖） |
| 端到端 | 新增 Maestro 流程 `08`：点 `2026-10-02` → 填症状保存 → 断言那格变成「有记录（2 个症状）」+ 定义页「其中 1 条记了症状，共 2 种」→ 自产自销删干净；全套 **9/9 通过**，见下方「端到端：Maestro 真手点」 |

## 第二阶段验收记录（统计的时间范围下推）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` / `npm run lint` | 通过 / 通过（0 error / 0 warning） |
| `npm test` | **24 个套件 / 388 个用例通过**（本次新增 7 个：`statsReadRange` 4 个 + 仓储半开区间 2 个 + 下推一致性 1 个） |
| `npm run format:check` | 通过 |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB；只动了 JS 与文档，无新增原生依赖） |
| schema | **仍为 v5，无新增迁移**：只给 `EventRecordRepository.list()` 加了 `from` / `until`，走既有的 `idx_event_records_occurred_at` |
| 实测（Node 内置 SQLite，2 万条记录 / 6 个定义） | 统计页取数 **163ms → 89ms**：窗口那三个纯函数从「扫全表」变成「只扫窗口内的 3464 条」（71ms → 7ms）；累计口径的概览 / 按事件统计仍要读全量（43 + 35ms），这就是当前的地板 |
| 为什么没把聚合也搬进 SQL | 那能到 ~18ms，但「最近一条记录的快照名」「所有记录单位一致才给单位」「同条数按名称排序」都要在 SQL 里再写一遍（还要处理 `unit` 的 `NULL` / `''`、带 `+08:00` 偏移时 `MAX(occurred_at)` 并不是最大）——**规则只写一遍**比省这 70ms 重要，所以只下推范围 |
| 界面数字没变 | 范围**只求超集**：`statsReadRange` 取「按天/按周 × 环比/同比」四种窗口的并集，按 UTC 零点前后各留一天；精确的「某个时刻属于哪一天」仍由纯函数按设备本地时区判定，多读的行会被过滤掉。同一批跨两年的记录「喂全量 vs 只喂范围」的结果有 `toEqual` 用例压着 |
| iOS 运行 | Maestro 全套 **9/9 通过**（含断言对比文案与对照窗口日期的 `06`、渲染统计页的 `00`）——界面上的数字逐字未变；跑完读库核对，使用者的数据一条没少 |
| 顺带修的文档 | `.maestro/README.md` 的收尾 SQL：`sqlite3` 命令行默认**不开外键**，级联删除不会发生（漏了就留下孤儿行，`PRAGMA foreign_key_check` 会报出来），已写清 `PRAGMA foreign_keys = ON` 与补救语句 |

## 第二阶段验收记录（导入导出收尾：选文件导入）

这是导入导出这项**最后一块没验过的路**：`04` 只走到系统分享面板，
「文件真的能存下来、能被选回来」始终没有真手点过。这次把它走通，并且在半路撞出一个真 bug。

| 项目 | 结果 |
| --- | --- |
| `npm run verify` | 通过：**24 个套件 / 390 个用例**（typecheck + lint + test，本次 +2：`assertEntityId` 的 v4/形状用例 + `parseBackup` 的「v4 主键也认」回归） |
| `npm run format:check` | 通过 |
| schema | **仍为 v5，无新增迁移**（改的是领域层校验，不碰表） |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB；只动 JS 与文档，无新增原生依赖） |
| iOS 运行 | Maestro `flows` 全套 **9/9 通过**（4m49s）——改的是领域层校验，界面文案逐字未变 |
| 选文件导入（手工两段式，`.maestro/import/`） | `09a` 造标记 + 导出 → 宿主把文件拷进模拟器「我的 iPhone」→ `09b` 永久删除本地那条 → **设置页「从备份导入（合并）」→ 系统文件选择器选文件 → 二次确认框**（`文件：lifetrack-backup-2026-10-22.json` / `备份内容：定义 5 个、记录 16 条、周期 1 个` / `合并结果：新增 1 条、覆盖 0 条、保留本地 31 条`）→ 提示 `导入完成：新增 1 条、覆盖 0 条、保留本地 31 条` → **时间轴里那条真的回来了** |
| 双证据 | 界面断言之外读库核对：恢复出来的那条记录 `id` 与备份文件里那条**逐字相同**（`01a162e7-c6bd-7000-9977-86e8baea5606`）——证明它确实是从文件写进来的，不是界面错觉 |
| **手测抓到的 bug** | 选中自家备份后报 `失败：data.eventGroups[0].id 不是合法的 UUID v7：9d28cb67-…`——**App 自己导出的备份被自己拒绝**。库里早期版本写下的 id 是 v4（使用者的 15 条记录 / 分组 / 周期全是），而导入端只认 v7。修法：导入边界改成 `assertEntityId`（认 UUID 的**形状**，不认**版本**；生成仍必须是 v7），并补上 v4 的回归用例。详述见 [`docs/learning/14`](./docs/learning/14-backup-and-restore.md) 的 3.9 节 |
| 为什么单元测试没测出来 | fixture 里的 id 全是照 v7 形状造的，比真实老库「干净」——「老 id 能不能进来」只有拿真库导一次才会露出来 |
| 模拟器上的边界（诚实记录） | 分享面板的「保存到"文件"」**点得动但不落盘**：面板关闭、App 回到设置页显示「已导出 …」，但「我的 iPhone」（`group.com.apple.FileProvider.LocalStorage`）与 iCloud 的两个 AppGroup 容器都是空的（这台模拟器没登 iCloud 账号）。所以素材由宿主 `cp` 进「我的 iPhone」，**跨 App 那一步没能在模拟器上端到端闭环**；真机未验证 |
| 选择器里的坑 | 文件格子的无障碍文字是它的标签，但点标签**不会选中文件**（选择器不关、也不返回结果）；要点格子里的缩略图（图标模式下第一个格子总在左上角，流程里用相对坐标） |
| 落盘核对 | 跑完读库并清理，回到使用者基线：**15 条记录**（1 条软删 `喝水` 10-18）、4 个定义、2 个分组、2 个标签、周期 1 定义 + 2 实例 + 4 记录；`PRAGMA foreign_key_check` 为空、无孤儿子表行 |

## 第二阶段验收记录（时间轴行改版与记录详情）

交互上的一次重做：原来「每行一个删除按钮」，现在是「行 = 这条记录的信息 + 一下就能再记一条」，
改与删收进那条记录的详情页——目标就是「简洁快速」。

| 项目 | 结果 |
| --- | --- |
| `npm run verify` | 通过：**27 个套件 / 411 个用例**（本次 +6：`EventRecordRepository.update` 的六条；`groupRecords` / `timelineView` / `format` 的用例在同批里一起加的） |
| `npm run format:check` | 通过 |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB；只动 JS 与文档，无新增原生依赖） |
| schema | **仍为 v5，无新增迁移**：显示偏好只是 `app_meta` 里的一个键（`app.timeline_view`） |
| 行内右侧 | 这条记录的**取值** + 【+1】；行本身可点 = 进记录详情页。计数型且增量为 1 的行不重复显示取值（否则和按钮上的「+1」撞脸） |
| 【+1】不弹确认 | 点下去即以该行取值「现在」再记一条（来源「快捷」）：**不弹二次确认、不给撤销条**（原来的「已再记一条…」提示条删掉了）；撤销与修改都在那条记录的详情页里 |
| 记录详情页 | 新增 `/records/[id]`：快照（记录时的名称）、取值、发生/录入时间、来源、备注、记录 id，加上底部「更多操作」（修改 / 删除 / 撤销删除）。**只读记录快照、不查定义**，所以定义改名、归档甚至被永久删除都不改变这一页 |
| 修改这条记录 | 只改**事实**（取值 / 发生时间 / 备注）：`EventRecordRepository.update` 复用新增记录那套校验（取值按类型、发生时间不能晚于录入时间）+ 拒绝修改已软删除的记录；快照一个字都不碰。改完来源会自己显示成「事后补记的」（派生，不是存的） |
| 显示方式开关 | 「逐条 / 合并」（**后来默认改为「合并」**，且开关从列表头挪进「设置 → 偏好设置」——见下一节）：合并行显示「共 N 次 · 最近 … · 展开逐条」，点行就地展开成逐条、再点收起；偏好写 `app_meta`，重启后记得住 |
| 定义状态 | 已归档定义的【+1】禁用并带「已归档」标记；定义被永久删除时标「定义已删除」且不渲染按钮（历史不依赖定义） |
| 布局上的一个环境约束 | 页头右侧**不能放按钮**：Expo Go 的开发菜单浮球压在那里（原生浮层），点过去会打开 Expo Go 自己的面板（Maestro 连挂三次才发现）。所以「修改 / 删除」放在页面底部的「更多操作」卡片里 |
| iOS 运行 | 本次改版当时 Maestro `flows` 全套 **10/10 通过**（5m42s）：`02` / `03` 改走详情页，`09` 覆盖【+1】与「逐条 / 合并」（含就地展开）；**最终状态（含后来的设置项归拢）为 11/11，见下一节** |
| 落盘核对 | 跑完读库：无 `Maestro*` 残留，回到使用者基线 **15 条记录**（1 条软删 `喝水`）、4 定义、2 分组、2 标签、5 快捷选项、1 周期定义 + 2 实例 + 4 每日记录；`PRAGMA foreign_key_check` 为空；`app_meta` 停在 `app.timeline_view = expanded`（当时的默认值） |
| 未覆盖 | `01` / `02` / `09` 每次跑会留下 `Maestro喝水` 记录（同名事件累加，收尾 SQL 一起清）；`02` 会把那条的时间改到 `2026-01-01`，所以它在时间轴里沉到下面（排序是对的）；**Android 与真机未跑**；组件级测试仍没有 |
| 走读 | [`docs/learning/16-timeline-row-and-detail.md`](./docs/learning/16-timeline-row-and-detail.md) |

## 第二阶段验收记录（周期增强收尾 + 设置项归拢）

两件事一起做：**周期增强收尾**（预测窗口可调、重叠也提前预告）与**设置项归拢**（纯展示偏好统一进「设置」、
按分组展示；时间轴默认改为「合并」）。

| 项目 | 结果 |
| --- | --- |
| `npm run verify` | 通过：**28 个套件 / 421 个用例**（新增 `predictionWindow-test`，`labels-test` 补窗口参数与 `describeOverlap`，`timelineView-test` 补默认值与界面叫法） |
| `npm run format:check` | 通过 |
| iOS 打包 | `npx expo export --platform ios` 通过（js bundle 3.1MB；只动 JS 与文档，无新增原生依赖） |
| schema | **仍为 v5，无新增迁移**：两个偏好都只是 `app_meta` 的键（`app.timeline_view`、`app.prediction_window`） |
| 预测窗口 | 默认「最近 3 段」，可在「设置 → 偏好设置 → 周期预测窗口」改成 1 / 3 / 5 段；它是**全局**的（对所有周期定义生效），所以不在定义页上；定义页只显示预测依据并指路到设置 |
| 为什么是 1 / 3 / 5 | 窗口是「拿最近几段**间隔**取平均」，N 段间隔要 N+1 段实例。2 与 3 在真实数据量下几乎分不出来；1 与 3 只要 3 段实例就能看出差别——每个档位都能真的看出效果 |
| 重叠预演 | 改边界时若压到同一定义的另一段周期，保存**之前**就提示，并**点名是哪一段**（`会和已有的一段周期重叠（2026-09-01 ~ 2026-09-05）`）；与仓储保存时的拒绝共用纯函数 `findOverlappingInstance`（`excludeId` 传自己） |
| 偏好住在哪 | 「时间轴显示」与「周期预测窗口」并在「设置」的一张「偏好设置」卡片里，分两组展示；页头不再放开关（页头留给「这一页是什么」） |
| 聚焦时重读 | 偏好在**别的页面**改，时间轴必须**每次聚焦重读**（挂载时只读一次的话，改完切回来不生效，要重启）——这个坑在显示方式那里踩过一次 |
| 界面文案 | 时间轴页头按当前模式换措辞（合并：「点行就地展开逐条…」；逐条：「点行看详情…」），并注明「显示方式可在『设置』里改」 |
| iOS 运行 | Maestro `flows` 全套 **11/11 通过**（6m32s，iPhone 16e / iOS 26.3 / Expo Go 58.0.5）：新增 `10` 覆盖「默认预测文案 → 在设置里改窗口 → 文案跟着变 → 切回默认 → 重叠预演」；`09` 改为经设置切换「逐条 / 合并」；`02` / `03` 新增子流程 `use-expanded-view.yaml`（先去设置钉成「逐条」）；`00` 补设置页断言 |
| 顺带修的 | `04`（导出）与 `00`（冒烟）因设置页变长而需要先滚动到目标：`04` 用 `centerElement` 把按钮停到屏幕中间，否则它停在屏幕底部会被标签栏截走点击（实测点到了「统计」标签） |
| 落盘核对 | 跑完读库：使用者数据一条没少；`Maestro预测` 留下 1 个定义 + 3 段周期（无每日记录）；`app_meta` 停在 `app.timeline_view = expanded`（`09` 末尾切回）与 `app.prediction_window = 3`（`10` 末尾切回默认）；收尾 SQL 见 [`.maestro/README.md`](./.maestro/README.md) |
| 未覆盖 | **Android 与真机未跑**；「在设置里改窗口 → 定义页文案跟着变」这条跨页面链路只有端到端覆盖，没有组件级断言 |
| 走读 | [`docs/learning/11-cycle-tracking.md`](./docs/learning/11-cycle-tracking.md) 的 4.11 / 4.12 节、[`docs/learning/16-timeline-row-and-detail.md`](./docs/learning/16-timeline-row-and-detail.md) 的 4.9 节 |

## 第二阶段验收记录（周期并入事件类型 + 属性可多条，v6）

三件事一起做：**周期不再是独立实体**（并入事件定义）、**「单位」变可多条的「属性」**、
**快捷选项合并成「属性 + 取值」**。这是首次在两轮之间**新增迁移**（v5 之后），所以重点在升级。

| 项目 | 结果 |
| --- | --- |
| `npm run verify` | 通过：**27 个套件 / 458 个用例**（全量更新既有用例并补 v6 覆盖：类型 / 属性 / 快捷选项 / 周期字段 / 数据折算 / 8 个索引） |
| `npm run format:check` | 通过 |
| iOS 打包 | `npx expo export --platform ios` 通过（只动 JS / SQL，无新增原生依赖） |
| schema | **v6 迁移**（`cycle_as_event_kind_and_attributes`）：重建 `event_definitions`（加 `cycle_mode` + 两个平均长度列）、周期实例 / 记录的外键改指它、`DROP TABLE cycle_definitions`；`attribute` → `attributes`（JSON 数组文本）、记录的 `unit` / `snapshot_unit` → `attributes` / `snapshot_attributes`；`quick_options.label` / `unit` → `attribute` |
| 迁移的硬约束 | CHECK `kind IN ('counter','cycle')` 与 `(kind = 'cycle') = (cycle_mode IS NOT NULL)`；`event_records` 的 kind CHECK **仍是** `('counter','quantity')`（老记录不能改）；属性 JSON 一律用 SQLite `json_array()` 生成，不手拼字符串 |
| 折算规则 | 老 `quantity` 定义 → `counter`（属性 = 旧 `unit`）；老周期定义按**原 id** 折成 `kind = 'cycle'`、`cycleMode` 兜底 `manual`；旧 `quick_options` 属性取 `CASE WHEN unit 为空 THEN label ELSE unit END` |
| 真实数据库升级 | **真跑过**：用 `make-v5-fixture.cjs` + 现成的 `seed.py` 造一个 **v5 库**（4 个定义 + 月经的 2 段周期 / 4 条每日记录 + 15 条事件记录含 1 条软删），拷进模拟器换掉 `lifetrack.db`，由 App 启动时跑 v6：`user_version 5 → 6`、`跑步` / `睡眠`（原 `quantity`）折成 `counter` 且 `attributes` = 旧 `unit`、`月经`（原周期定义）变成 `kind = 'cycle'` + `cycle_mode = 'manual'` 且原 id 不变、快捷选项属性 = 旧 `unit`、周期数据一条不少、`cycle_definitions` 表已不存在、`PRAGMA foreign_key_check` 干净；另有一份一次性脚本 `check-v6.cjs` 在 v5 夹具库上验证过（转义、索引、无 `_old`/`_new` 残留） |
| 领域模型 | `EventDefinitionKind = 'counter' | 'cycle'`；`EventDefinition.attributes: string[]`（周期型恒 `[]`）；`QuickOption = { attribute?, value, sortOrder }`（去掉 `label`）；`EventRecord.attributes: string[]`；历史 `RecordKind` 保留 `counter` / `quantity` |
| 展示回退 | `recordAttributes(record)`：记录自己没标属性时回退用快照里的；`attributeText(list)` 用 ` · ` 连接、空则 `undefined` |
| 界面 | 底部去掉「周期」标签页（**4 个**）；事件页一张列表并列两种类型、周期行进 `/cycles/[id]`；新建事件可把类型点成「周期」让表单换成周期字段（两种做法各带一句说明）；定义表单可增删**多条属性**；记录页属性**多选 chips（默认不选）** + 快捷记录「属性（+取值）」 |
| 自动循环的边界 | 本轮**只做「配置 + 生成下一段」**：内页出现「生成这一段」，点它按规律写入下一段；**不做后台自动写库** |
| 已知行为变化 | v6 把 `quantity` 定义折成 `counter`，但老快捷选项的取值可能不是整数（如 0.5）——**编辑那个定义会因「计数型要求正整数」被拒**；历史记录不受影响。详见 `HANDOFF.md` 技术债 |
| iOS 运行 | Maestro `flows` 全套 **11/11 通过**（6m47s，在重建的空库上）；随后又在**一个「真跑过 v6 迁移的 v5 库」**上原样整跑一遍：**11/11 通过，7m20s**。`00` 改成四个标签页并在「新建事件」里确认两种类型；`05` / `07` / `08` / `10` 造周期数据统一改成「事件」页新建周期型事件；`02` 的快照文案改成「名称与属性」 |
| 落盘核对 | 跑完读库：`PRAGMA foreign_key_check` 为空（无孤儿实例 / 每日记录）；周期型定义 `attributes` 是 `'[]'` 且带 `cycle_mode`；记录 / 快照的 `attributes` 都在；`cycle_definitions` 表已不存在 |
| 未覆盖 | **Android 与真机未跑**；自动循环的「按规律自动生成 / 到期自动开始结束」只有「生成下一段」被覆盖；组件级测试仍没有 |
| 走读 | [`docs/learning/11-cycle-tracking.md`](./docs/learning/11-cycle-tracking.md) 的 4.13 节、[`docs/learning/08-event-definitions.md`](./docs/learning/08-event-definitions.md) 的 9 节 |

## 第二阶段验收记录（自定义字段：标签字段化，v7）

**「标签」不再是全局实体**，换成每个事件定义自己的一组**带类型字段**（单选 / 多选 / 时间点 / 时间段）；
记录时给字段选值并随快照固化。旧的标签数据不丢——**只有计数型定义**把标签折成一条名为「标签」的
多选字段、历史取值一并搬来；`tags` / `event_definition_tags` 表随之删除。

| 项目 | 结果 |
| --- | --- |
| `npm run verify` | 通过：**26 个套件 / 460 个用例**（全量更新既有用例并补 v7 覆盖：字段类型 / 校验 / 快照 / 迁移折算 / 备份折算） |
| `npm run format:check` | 通过 |
| schema | **v7 迁移**（`custom_fields_replace_tags`）：新增 `event_definition_fields`（`kind CHECK (kind IN ('single','multi','time','range'))`、`options` JSON、`ON DELETE CASCADE`）；重建 `event_records`，`snapshot_tag_ids` → `snapshot_fields` + `field_values`；最后 `DROP event_definition_tags` → `DROP tags` |
| 迁移的硬约束 | 只有 `kind = 'counter'` 的定义才折字段（周期型记的是「哪一天」，其标签随之丢弃）；候选值 = 挂着的标签 ∪ 记录快照里出现过的标签（**兜住历史值**），按名称排序；折出来的字段 id 用 `migrationUuid()`，`up()` 不依赖会演进的业务代码 |
| 重建表 | `CREATE event_records_new` → 逐行 `INSERT ... SELECT`（把每行的快照标签值算成字段取值）→ `DROP TABLE event_records` → `RENAME` → 重建两个索引 |
| 领域模型 | `FieldKind = 'single' \| 'multi' \| 'time' \| 'range'`；`DefinitionField`（带 `sortOrder`）/ `FieldSnapshot`（不带）/ `FieldValue = { fieldId, values }`；`describeFieldValue`（多选 ` · `、区间 `–`、空则 `undefined`） |
| 校验 | `normalizeFieldInput`（枚举型**必须至少一个候选值**，时间点 / 时间段强制清空候选值）；`normalizeFieldValues`（枚举值必须在候选内、`HH:mm` 定长校验；**记录路径默认忽略不认识的字段**，备份导入传 `false`） |
| 备份 | 格式升到 `formatVersion = 3`、集合从 6 个变 5 个（无 `tags`）；**v2 及以前的备份照同一规则折算**（`foldTags`，记录据定义折出的字段挂取值）；`assertBackupIntegrity` 校字段 id 唯一、`fieldValues` ↔ `snapshot.fields` 一致、周期型不带字段 |
| CSV | 第 9 列由「标签」变「**字段值**」（`字段名：展示值`，多字段用 ` \| ` 连接） |
| 界面 | 事件定义表单多一块「自定义字段」编辑器（计数型才显示）；记录页按类型渲染取值控件（`FieldValuePicker`）；记录详情 / 时间轴 / CSV 用 `describeFieldValue` 展示；全局「标签」页与入口删除 |
| 未覆盖 | **Android 与真机未跑**；**界面层没有组件测试**；**没有为本特性新增 Maestro 流程**（字段编辑与取值控件只有类型检查与人工确认兜底） |
| 走读 | [`docs/learning/17-custom-fields.md`](./docs/learning/17-custom-fields.md)、[`docs/learning/08-event-definitions.md`](./docs/learning/08-event-definitions.md) 的第 10 节 |

## 第二阶段验收记录（统计趋势改版：先选看什么）

原来的趋势只有一种口径：**把所有事件混在一起数条数**——「喝水 3 条 + 跑步 2 条 + 吃药 1 条」
画成一根 6 的条。不同事件的记录不可相加，用户看到的第一反应是「不懂它在表达什么」。
现在趋势卡片先选「看什么」，再画：

| 项目 | 结果 |
| --- | --- |
| `npm run verify` | 通过：**26 个套件 / 466 个用例**（新增 `definitionCount`、`recordsOfDefinition`、`describeActiveComparison` 共 6 个用例） |
| `npm run format:check` | 通过 |
| schema | **无新增迁移**，仍为 v7（统计仍是纯函数现算，只是多算一个「不同事件数」） |
| 看什么 | 选择器 = 「活跃事件数」/「全部」/ 每个近期出现过的事件；默认看**本期记录最多的那个事件**（`compareDefinitions` 已按本期条数排序），本期没有就退到近来最多、再退到「活跃事件数」 |
| 单个事件 | `recordsOfDefinition` 先过滤再交给 `aggregateByDay` / `aggregateByWeek`——「过去一周喝水每天有多少」 |
| 活跃事件数 | `PeriodTotal.definitionCount`：该桶里出现过几个**不同**事件（同日同事件多条只算一个），衡量覆盖 / 坚持度 |
| 对比 | 口径跟着选择走：单个事件用 `describeDefinitionChange`、全部用 `describeComparison`、活跃事件数用新增的 `describeActiveComparison`（单位是「个事件」） |
| 低频选项折叠 | 「按天/按周」与「较前一段/较上年同期」收进趋势卡片右上角的开关（折叠时显示当前口径「按天 · 较前一段」，点「展开」才出现两行 Chip）；为此给通用 `Card` 加了可选 `right` |
| 未覆盖 | **Android 与真机未跑**；选择器与折叠开关是纯 JSX，**没有组件测试**，只有类型检查与人工确认兜底；**没有为本改动新增 Maestro 流程** |
| 走读 | [`docs/learning/12-statistics.md`](./docs/learning/12-statistics.md) 的第 3.14、4.4 节 |

## 第二阶段验收记录（本机 iOS 模拟器实机运行）

这一节记录**真正把应用跑起来之后**看到的结果，不是静态检查。

| 项目 | 结果 |
| --- | --- |
| 环境 | Xcode 26.3 · iPhone 16e 模拟器 · iOS 26.3 · Expo Go 58.0.5（SDK 58 内置 `expo-sqlite`，无需原生构建） |
| 启动方式 | `npm start` 起 Metro，Expo Go 打开 `exp://127.0.0.1:8081` |
| 打包 | Metro 成功打包 1393 个模块；`npx expo export --platform ios` 2.9MB |
| 数据库 | 设置页显示 `已连接` / `schema v5` / `本次迁移：无（已是最新 v5）`（当时是 v5；**现为 v6**，见上一节）；`app_meta` 正常写入安装时间与启动次数 |
| 逐页验证范围 | 时间轴、统计、事件、周期、设置 5 个标签页（**当时还有「周期」标签，v6 起为 4 个**）+ 回收站 + 记录页（`/record/[id]`）+ 周期实例页（`/cycle-instances/[id]`） |
| 渲染内容 | 时间轴显示 14 条记录（来源区分「快捷 / 手动 / 补录」、取值带属性）；统计显示概览 14 条 / 4 个事件、覆盖区间与按天趋势；事件页分「进行中 3 个 / 已归档 1 个」；周期页显示平均周期天数与 2 段；回收站显示 1 条软删除记录与「恢复 / 永久删除」按钮 |
| 运行期报错 | Metro 日志无 JS 报错、无红屏 |
| 示例数据 | **直接写入模拟器数据库**（4 个定义 / 15 条记录 / 2 段周期 / 4 条每日记录），不是通过界面点出来的 |
| 未覆盖 | 本次只做了「逐页打开 + 渲染」；写入路径（点记录、删除并撤销、回收站恢复/永久删除的 Alert）后来用 Maestro 补齐，见下方「端到端：Maestro 真手点」。Android 与真机未跑 |

> 排障备注：本机访问 GitHub Releases 带宽很低，`expo start --ios` 自动下载 Expo Go 会超时。
> 稳妥做法是手动分片下载 `Expo-Go-58.0.5.tar.gz`（约 148MB）→ 解包得到的目录本身就是 app bundle
> （`CFBundleIdentifier = host.exp.Exponent`）→ 重命名为 `Expo Go.app` → `xcrun simctl install booted`。
> 之后 `xcrun simctl openurl booted "exp://127.0.0.1:8081"` 即可打开。

## 第二阶段验收记录（端到端：Maestro 真手点）

这一节记录**用 Maestro 在模拟器上真的点击应用**之后看到的结果——补上此前「写入路径没有真手点过」的缺口。
流程文件在 `.maestro/`（跑法见 [`./.maestro/README.md`](./.maestro/README.md)，走读见
[`docs/learning/15-maestro-e2e.md`](./docs/learning/15-maestro-e2e.md)）。

| 项目 | 结果 |
| --- | --- |
| 工具 | Maestro 2.11.0（官方 release zip 手动安装；`JAVA_HOME=/opt/homebrew/opt/openjdk@17`、`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`） |
| 环境 | iPhone 16e 模拟器 · iOS 26.3 · Expo Go 58.0.5 · Metro（`localhost:8081`） |
| 为什么不用坐标点击 | 坐标点击（`osascript` / `cliclick`）需要 macOS「辅助功能」权限；Maestro 自带的 XCTest driver 不需要，且按文字/id 找元素 |
| 流程 | 11 条：冒烟 / 记录一次 / 点行进详情改删撤销 / 回收站恢复+永久删除 / 导出 JSON 分享面板 / 周期边界预演+越界保存被拒 / 统计环比同比切换 / 周期记录软删除+撤销+回收站 / 周期月视图选日期+症状统计 / 【+1】与「逐条 / 合并」/ 预测窗口与重叠预演 |
| 运行结果 | 最初 9 条时 **`9/9 Flows Passed`**（4m39s）；**最新一次全量跑为 `11/11 Flows Passed`，6m47s**（v6 那批改动之后，iPhone 16e / iOS 26.3 / Expo Go）；随后又在**一个「真跑过 v6 迁移的 v5 库」**上原样整跑一遍：**11/11 通过，7m20s**——流程清单与逐条耗时见 [`.maestro/README.md`](./.maestro/README.md) |
| 记录一次 | 事件页自建「Maestro喝水」定义（中文 `inputText` 直接可用）→ 记录页点「记录」→ 顶部提示 `已记录：Maestro喝水 +1` → 时间轴出现该行 |
| 删除并撤销 | 时间轴第一行点「删除」→ 出现 `已删除：…` → 点「撤销」→ 提示条消失、记录回来（**净值 0**） |
| 回收站 | 「恢复」→ 回时间轴；再删 →「永久删除」→ **原生二次确认弹窗**（弹窗按钮叫「彻底删除」，与列表按钮「永久删除」不同名，全文匹配下没有歧义）→ 记录真的从库里消失 |
| 周期记录软删除 | 周期里记一天 → 点「删除」→ 行消失并出现「撤销」提示条（`已删除 2026-10-22 的记录（可在「时间轴 → 回收站」找回）`）→「撤销」后回到列表 → 再删 → 回收站「已删除的周期记录」里「恢复」（该区随之消失）→ 三删 →「彻底删除」+ 原生二次确认 → 库里再也查不到 |
| 月视图选日期 | 周期实例页月视图默认停在 `2026 年 10 月`（1 号在「四」这一列，对齐正确）→ 点 `日历 2026-10-02，无记录` 这一格 → `当前选中：2026-10-02` → 填 `头痛,乏力` 保存 → 顶部 `已保存 2026-10-02 的记录` → 那格变成 `日历 2026-10-02，有记录（2 个症状）`（底色 + 红点）→ 定义页「症状统计」出现 `头痛 1 天 · 100%` / `乏力 1 天 · 100%` 与 `…其中 1 条记了症状，共 2 种` → 收尾删掉后又回到 `无记录` |
| 导出 | 设置页「导出 JSON 备份」→ 系统分享面板出现，显示文件名 `lifetrack-backup-2026-10-22` 与 `JSON · 19 KB` → 关闭（面板上的按钮是 `保存到“文件”`） |
| 周期边界预演 | 开一段 `2026-10-01` 起的周期 → 记今天一条 → 把结束日改到 `2026-10-05` → **黄色预演**「会有 1 条记录落在区间外（2026-10-22）…保存会被拒绝，这些记录不会被删除」→ 点保存 → 仓储拒绝并原样显示原因 |
| 统计对比 | 「较上年同期」结论行实测：**「本期 17 条，上年同期没有记录，无法算变化率」**，对照窗口 `2025-10-10 ~ 2025-10-23`（本期 `2026-10-09 ~ 2026-10-22`）——正是 52 周（364 天）对齐；对照期为空时**不出现百分比** |
| 落盘核对 | 跑完直接读模拟器里的 `lifetrack.db`：使用者的 **15 条记录 / 4 条周期记录**（含 1 条软删的 `喝水`）一条没少，回收站**无 `Maestro*` 残留**；「越界保存被拒」之后那条每日记录**还在**（拒绝没有删数据）；收尾把测试造的 `Maestro*` 定义与记录删干净，库回到 `15 条 / 1 条软删`（`PRAGMA foreign_key_check` 干净）。`event_records` **没有指向 `event_definitions` 的外键**（历史独立于定义），删定义不会连带删记录，要显式删；但 v6 起周期实例 / 每日记录**有**指向事件定义的外键（CASCADE），删一条周期型定义会一并带走它的周期 |
| v6 那次整跑 | 因为 v6 在定稿前改过内容（设备上 `user_version` 已记成 6、迁移不会重跑），先把模拟器上的库**删掉重建**再跑（这是开发期的取舍，见「数据安全约定」与规则 17）。跑前是空库，所以落盘核对只剩 `Maestro*` 数据：`event_definitions.attributes` 是 JSON 数组文本（周期型 `'[]'` 且带 `cycle_mode`）、记录 / 快照的 `attributes` 都在、`cycle_definitions` 表已不存在 |
| 数据安全 | 写路径流程**自产自销**：只新增自己造的 `Maestro*` 数据，真删只删自己刚建的那条；**不使用 `clearState`**（在 Expo Go 里会连项目 SQLite 一起清掉）；周期区按钮用相对选择器 `below: 已删除的周期记录` 避开使用者自己的软删记录 |
| 未覆盖 | **Android 与真机未跑**；「选文件导入」已在**手工两段式**里补上（`.maestro/import/09a` + `09b`，见上一节与 [`.maestro/README.md`](./.maestro/README.md)），但模拟器上「保存到"文件"」不落盘、素材由宿主拷入，跨 App 那段没有端到端闭环；`05` / `07` / `10` 假定运行日期晚于 `2026-10-05`，`08` 另假定 `Maestro周期` 的 `2026-10-02` 上还没有记录；**组件级测试仍没有**（见 `HANDOFF.md` 技术债清单） |

## 不在范围内（首版）

Web 端、局域网 HTTP 服务、多端同步、**云端**备份、账号体系。

> 说明：**本地文件**的备份与恢复已经支持（导出 JSON → 自己保管 → 导入合并，见上面「导入导出」验收记录）；
> 这里排除的是「云端备份 / 多端同步」这类需要服务端的能力。

## 许可

见 [LICENSE](./LICENSE)。