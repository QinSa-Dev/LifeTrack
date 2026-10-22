# LifeTrack

本地优先的生活记录 App：记录事件（计数 / 数量）、周期事件与症状，并按时间轴回看与统计。

- 技术栈：React Native + Expo + TypeScript + SQLite（expo-sqlite）
- 平台：iOS / Android
- 数据：**全部存在设备本地**，无独立后端、无账号系统、无云数据库

> 当前进度：**第一阶段（工程基线）已完成**；**第二阶段第 1 项（事件定义 / 分组 / 标签 / 快捷选项 / 归档）已完成**；**第 2 项（counter / quantity 记录与时间轴）已完成**；**补录与撤销已完成**；**周期事件（周期定义 / 实例 / 每日记录）已完成**（新增 v4 迁移，schema 现为 v4）；**统计（从事实数据聚合 / 按天按周趋势 / 按事件合计）与时间轴 FlatList 虚拟化已完成**（无新增迁移，schema 仍为 v4）；**事件记录的回收站与永久删除已完成**（补全「软删除 → 撤销 → 真删」闭环，无新增迁移）；**导入导出（JSON 备份 / CSV 表格导出 / 按 id 合并的导入）已完成**（无新增迁移，schema 仍为 v4）；**周期增强（预测改用实际间隔 / 保存前预演越界日期）已完成**（无新增迁移）；**统计增强（环比 / 同比对比）已完成**（无新增迁移）；**周期内记录的回收站已完成**（追加 v5 迁移给 `cycle_entries` 加 `deleted_at`，与事件记录一样「软删除 → 撤销 → 彻底删除」）；**周期月视图（日历选日期）与按症状统计已完成**（无新增迁移，schema 仍为 v5），其余核心业务尚未开始。

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
    (tabs)/               # 底部五标签：时间轴 / 统计 / 事件 / 周期 / 设置
                          #   index 时间轴（FlatList）/ stats 统计 / definitions / cycles /
                          #   settings 诊断 + 备份与恢复（导出 JSON / 导出 CSV / 导入合并）
    events/new.tsx        # 新建事件定义
    events/[id].tsx       # 编辑事件定义（归档 / 永久删除）
    record/[id].tsx       # 记录一次事件（快捷 / 手动 / 补录）＋ 最近记录删除与撤销
    records/deleted.tsx   # 回收站：软删除的记录恢复 / 永久删除
    cycles/new.tsx        # 新建周期定义
    cycles/[id].tsx       # 周期定义详情（周期列表 / 开始新周期 / 归档 / 删除）
    cycle-instances/[id].tsx  # 一段周期 + 每日记录 + 边界调整 + 删除
    groups.tsx            # 分组管理
    tags.tsx              # 标签管理
    +not-found.tsx        # 兜底路由
  components/             # 通用 UI（Screen / Card / Button / Badge / AppText / EmptyState
                          #          TextField / Chip / Header / ListRow / DatabaseGate）
  features/               # 非通用的功能组件（不属于每个页面都用的基础 UI）
    definitions/          # 事件定义表单 EventDefinitionForm + 展示文案
    records/              # format（记录值 / 时间 / 来源）、RecordRow（记录行）、
                          # UndoBar（软删除后的撤销条）
    cycles/               # 周期定义表单 CycleDefinitionForm + 展示文案（含预测依据）与症状解析
    stats/                # aggregate：从事实记录聚合（按定义 / 按天 / 按周 / 概览 / 环比同比），纯函数
                          # labels：对比的说法（差值与百分比；对照期为 0 时不编造百分比）
    backup/               # csv：记录 CSV（RFC 4180 + BOM，纯函数）
                          # transfer：写文件 + 分享 + 选文件（唯一碰文件系统的地方）
    common/               # datetime：本地时间 ↔ UTC（补录与周期共用）
  db/                     # 数据库基础设施
    client.ts             # 唯一连接入口（PRAGMA、单例、失败不覆盖数据）
    migrations.ts         # 版本化迁移执行器（user_version + 独占事务）
    schema.ts             # schema 与迁移清单（v1 app_meta / v2 事件定义 / v3 历史记录 / v4 周期 / v5 周期记录软删除）
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
    tagRepository.ts             # 标签
    eventDefinitionRepository.ts # 事件定义聚合（定义 + 快捷选项 + 标签关联）
    eventRecordRepository.ts     # 历史记录（记录时生成快照、软删除与撤销）
    cycleDefinitionRepository.ts # 周期定义
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
.maestro/                 # 端到端流程（Maestro）：在 iOS 模拟器上真的点击应用 + 读库核对
  README.md               # 跑法、前置条件、选择器上的坑、「不许 clearState」等约定
  flows/                  # 00 冒烟 / 01 记录 / 02 删除撤销 / 03 回收站 / 04 导出 / 05 周期边界 / 06 统计对比 / 07 周期记录软删 / 08 月视图选日期
  subflows/               # 被 runFlow 引用的共用片段（如「确保 Maestro喝水 存在并记一次」）
```

## 开发指北（学习文档）

`docs/learning/` 下是一套**以本仓库真实代码为依据**的中文走读材料：每篇包含「本次完成什么 / 改了哪些文件 /
相关技术概念 / 关键代码逐段解释 / 一次完整数据流的 Mermaid 流程图 / 如何验证 / 常见问题排查 / 学习总结与练习」。

入口：[`docs/learning/README.md`](./docs/learning/README.md)。

推荐顺序：`01 工程基线 → 05 业务与数据流 → 06 导航与状态`（快速走读），
深入类型与数据层时再读 `03 领域模型 → 04 SQLite 与 Repository`，
了解第二阶段第 1 项（事件定义）时读 `08 事件定义`，
了解第 2 项（记录与时间轴）时读 `09 事件记录`，
了解补录与撤销时读 `10 补录与撤销`，
了解周期事件时读 `11 周期事件`（预测依据与边界预演以 4.2 / 4.8 节为准，**月视图见 4.10 节**），
了解统计与时间轴虚拟化时读 `12 统计`（环比 / 同比见 3.9–3.11 节，**按症状统计见 3.12 节**），
了解回收站与永久删除时读 `13 回收站与永久删除`，
了解备份与恢复（导入导出）时读 `14 备份与恢复`，
了解端到端自动化时读 `15 Maestro 真手点`。

> 文档随功能同步更新；尚未实现的功能（统计的时间范围下推 SQL、整体架构演进）暂不写作，避免空文档。

## 领域规则（已确认，代码中已体现）

1. **事件定义与历史记录分离**：改定义不影响已产生的历史。
2. **历史快照**：记录保存当时的定义快照，配置变化不会改写历史。
3. **周期实例与周期内记录独立建模**。
4. **周期边界修改不得静默删除越界记录**。
5. **归档不删除历史**，只影响能否继续记录。
6. **永久删除必须二次确认**，并保证事务一致性。
7. **统计从事实数据计算**，不落冗余汇总表。
8. **导入是合并，不是覆盖**：并进本地数据、本地独有的一律保留；同 id 冲突按「较新的 `updatedAt` 胜出」；
   导入失败**整体回滚**，不留半截数据。
9. **预测必须有依据**：优先用最近若干段**实际间隔**的平均，没有历史才退回配置的平均周期长度，
   两者都没有就**不做预测**（`predictNextCycle` 返回 `undefined`，界面明说「暂不做预测」）。
10. **统计不编造数字**：单位不一致就不合并计量；对比的对照期为 0 时**不给变化率**
    （宁可说「无法算变化率」，也不显示 `+100%`）。
11. 首版不做 Todo、云同步、多设备同步。

> 规则 3、4 已在**周期事件**里落地：实例与记录各自建表、各自一个仓储；
> 修改边界时先算「哪些日期会越界」，有越界就**拒绝更新并列出日期**，绝不静默删除
> （见 `docs/learning/11-cycle-tracking.md` 与 `src/repositories/cycleInstanceRepository.ts`）。
>
> 规则 8 已在**导入导出**里落地：`mergeBackup` 是纯函数（本地 ∪ 备份），
> 写库放一个独占事务并在事务内核对行数 + 外键（见 `docs/learning/14-backup-and-restore.md`）。
>
> 规则 9 已在**周期事件**里落地：`observedCycleLength` / `predictNextCycle` 是纯函数，
> 返回值带 `basis`（`observed` / `configured`）说明依据，界面据此把「算出来的」与「按配置推的」分开讲；
> 同一条越界规则（`findDatesOutside`）既用于保存时的拒绝，也用于保存前的界面预演
> （见 `docs/learning/11-cycle-tracking.md` 的 4.2、4.8 节）。
>
> 规则 10 已在**统计**里落地：单位不一致时 `unit` 为 `undefined`；对比时
> `recordCountRate` 在对照期为 0 时也为 `undefined`，由 `features/stats/labels.ts` 说成
> 「无法算变化率」（见 `docs/learning/12-statistics.md` 的 3.10 节）。

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
| 领域规则 | 统计从事实数据算；只统计未软删除记录；按设备本地时区分天/周（ISO 周，周一起算）；不同单位的数量不合并计量 |
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
| 模拟器 / 真机运行 | **未跑**：分享面板、系统文件选择器都是原生 UI，三个按钮没有手动点过（本机无法自动化点击）。Android 未跑 → 后已用 Maestro 补齐「导出 JSON → 分享面板」，**「选文件导入」仍未覆盖**（见文末「端到端：Maestro 真手点」） |

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

## 第二阶段验收记录（本机 iOS 模拟器实机运行）

这一节记录**真正把应用跑起来之后**看到的结果，不是静态检查。

| 项目 | 结果 |
| --- | --- |
| 环境 | Xcode 26.3 · iPhone 16e 模拟器 · iOS 26.3 · Expo Go 58.0.5（SDK 58 内置 `expo-sqlite`，无需原生构建） |
| 启动方式 | `npm start` 起 Metro，Expo Go 打开 `exp://127.0.0.1:8081` |
| 打包 | Metro 成功打包 1393 个模块；`npx expo export --platform ios` 2.9MB |
| 数据库 | 设置页显示 `已连接` / `schema v5` / `本次迁移：无（已是最新 v5）`；`app_meta` 正常写入安装时间与启动次数 |
| 逐页验证范围 | 时间轴、统计、事件、周期、设置 5 个标签页 + 回收站 + 记录页（`/record/[id]`）+ 周期实例页（`/cycle-instances/[id]`） |
| 渲染内容 | 时间轴显示 14 条记录（来源区分「快捷 / 手动 / 补录」、取值带单位）；统计显示概览 14 条 / 4 个事件、覆盖区间与按天趋势；事件页分「进行中 3 个 / 已归档 1 个」；周期页显示平均周期天数与 2 段；回收站显示 1 条软删除记录与「恢复 / 永久删除」按钮 |
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
| 流程 | 9 条：冒烟 / 记录一次 / 删除并撤销 / 回收站恢复+永久删除 / 导出 JSON 分享面板 / 周期边界预演+越界保存被拒 / 统计环比同比切换 / 周期记录软删除+撤销+回收站 / **周期月视图选日期+症状统计** |
| 运行结果 | **`9/9 Flows Passed`**，合计 4m39s（逐条：01 18s / 07 1m20s / 04 10s / 08 1m3s / 03 30s / 00 15s / 05 44s / 06 13s / 02 8s） |
| 记录一次 | 事件页自建「Maestro喝水」定义（中文 `inputText` 直接可用）→ 记录页点「记录」→ 顶部提示 `已记录：Maestro喝水 +1` → 时间轴出现该行 |
| 删除并撤销 | 时间轴第一行点「删除」→ 出现 `已删除：…` → 点「撤销」→ 提示条消失、记录回来（**净值 0**） |
| 回收站 | 「恢复」→ 回时间轴；再删 →「永久删除」→ **原生二次确认弹窗**（弹窗按钮叫「彻底删除」，与列表按钮「永久删除」不同名，全文匹配下没有歧义）→ 记录真的从库里消失 |
| 周期记录软删除 | 周期里记一天 → 点「删除」→ 行消失并出现「撤销」提示条（`已删除 2026-10-22 的记录（可在「时间轴 → 回收站」找回）`）→「撤销」后回到列表 → 再删 → 回收站「已删除的周期记录」里「恢复」（该区随之消失）→ 三删 →「彻底删除」+ 原生二次确认 → 库里再也查不到 |
| 月视图选日期 | 周期实例页月视图默认停在 `2026 年 10 月`（1 号在「四」这一列，对齐正确）→ 点 `日历 2026-10-02，无记录` 这一格 → `当前选中：2026-10-02` → 填 `头痛,乏力` 保存 → 顶部 `已保存 2026-10-02 的记录` → 那格变成 `日历 2026-10-02，有记录（2 个症状）`（底色 + 红点）→ 定义页「症状统计」出现 `头痛 1 天 · 100%` / `乏力 1 天 · 100%` 与 `…其中 1 条记了症状，共 2 种` → 收尾删掉后又回到 `无记录` |
| 导出 | 设置页「导出 JSON 备份」→ 系统分享面板出现，显示文件名 `lifetrack-backup-2026-10-22` 与 `JSON · 19 KB` → 关闭（面板上的按钮是 `保存到“文件”`） |
| 周期边界预演 | 开一段 `2026-10-01` 起的周期 → 记今天一条 → 把结束日改到 `2026-10-05` → **黄色预演**「会有 1 条记录落在区间外（2026-10-22）…保存会被拒绝，这些记录不会被删除」→ 点保存 → 仓储拒绝并原样显示原因 |
| 统计对比 | 「较上年同期」结论行实测：**「本期 17 条，上年同期没有记录，无法算变化率」**，对照窗口 `2025-10-10 ~ 2025-10-23`（本期 `2026-10-09 ~ 2026-10-22`）——正是 52 周（364 天）对齐；对照期为空时**不出现百分比** |
| 落盘核对 | 跑完直接读模拟器里的 `lifetrack.db`：使用者的 **15 条记录 / 4 条周期记录**（含 1 条软删的 `喝水`，10-18）一条没少，回收站**无 `Maestro*` 残留**；「越界保存被拒」之后那条每日记录**还在**（拒绝没有删数据）；收尾把测试造的 `Maestro*` 定义与记录删干净，库回到 `15 条 / 1 条软删`（`PRAGMA foreign_key_check` 干净）。注意 `event_records` **没有指向 `event_definitions` 的外键**（历史独立于定义），删定义不会连带删记录，要显式删 |
| 数据安全 | 写路径流程**自产自销**：只新增自己造的 `Maestro*` 数据，真删只删自己刚建的那条；**不使用 `clearState`**（在 Expo Go 里会连项目 SQLite 一起清掉）；周期区按钮用相对选择器 `below: 已删除的周期记录` 避开使用者自己的软删记录 |
| 未覆盖 | **Android 与真机未跑**；**「选文件导入」未覆盖**（只走到系统分享面板，文件选择器属另一个 App 的 UI）；`05` / `07` 假定运行日期晚于 `2026-10-05`，`08` 另假定 `Maestro周期` 的 `2026-10-02` 上还没有记录；**组件级测试仍没有**（见 `HANDOFF.md` 技术债清单） |

## 不在范围内（首版）

Web 端、局域网 HTTP 服务、多端同步、**云端**备份、账号体系。

> 说明：**本地文件**的备份与恢复已经支持（导出 JSON → 自己保管 → 导入合并，见上面「导入导出」验收记录）；
> 这里排除的是「云端备份 / 多端同步」这类需要服务端的能力。

## 许可

见 [LICENSE](./LICENSE)。