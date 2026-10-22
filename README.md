# LifeTrack

本地优先的生活记录 App：记录事件（计数 / 数量）、周期事件与症状，并按时间轴回看与统计。

- 技术栈：React Native + Expo + TypeScript + SQLite（expo-sqlite）
- 平台：iOS / Android
- 数据：**全部存在设备本地**，无独立后端、无账号系统、无云数据库

> 当前进度：**第一阶段（工程基线）已完成**；**第二阶段第 1 项（事件定义 / 分组 / 标签 / 快捷选项 / 归档）已完成**；**第 2 项（counter / quantity 记录与时间轴）已完成**；**补录与撤销已完成**；**周期事件（周期定义 / 实例 / 每日记录）已完成**（新增 v4 迁移，schema 现为 v4）；**统计（从事实数据聚合 / 按天按周趋势 / 按事件合计）与时间轴 FlatList 虚拟化已完成**（无新增迁移，schema 仍为 v4）；**事件记录的回收站与永久删除已完成**（补全「软删除 → 撤销 → 真删」闭环，无新增迁移）；**导入导出（JSON 备份 / CSV 表格导出 / 按 id 合并的导入）已完成**（无新增迁移，schema 仍为 v4）；**周期增强（预测改用实际间隔 / 保存前预演越界日期）已完成**（无新增迁移），其余核心业务尚未开始。

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
    stats/                # aggregate：从事实记录聚合（按定义 / 按天 / 按周 / 概览），纯函数
    backup/               # csv：记录 CSV（RFC 4180 + BOM，纯函数）
                          # transfer：写文件 + 分享 + 选文件（唯一碰文件系统的地方）
    common/               # datetime：本地时间 ↔ UTC（补录与周期共用）
  db/                     # 数据库基础设施
    client.ts             # 唯一连接入口（PRAGMA、单例、失败不覆盖数据）
    migrations.ts         # 版本化迁移执行器（user_version + 独占事务）
    schema.ts             # schema 与迁移清单（v1 app_meta / v2 事件定义 / v3 历史记录 / v4 周期）
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
了解周期事件时读 `11 周期事件`（预测依据与边界预演以 4.2 / 4.8 节为准），
了解统计与时间轴虚拟化时读 `12 统计`，
了解回收站与永久删除时读 `13 回收站与永久删除`，
了解备份与恢复（导入导出）时读 `14 备份与恢复`。

> 文档随功能同步更新；尚未实现的功能（周期日历视图、统计增强、整体架构演进）暂不写作，避免空文档。

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
10. 首版不做 Todo、云同步、多设备同步。

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
| schema | **无新增迁移**，仍为 v4（真删就是 `DELETE` 已有行） |
| 领域规则 | 软删除（可撤销）与真删（不可逆）分成两个方法、两个入口；真删必须界面二次确认；删不存在的行抛 `NotFoundError` |
| 范围 | 事件记录已有回收站；周期内记录仍是直接真删（未做回收站） |
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
| 模拟器 / 真机运行 | **未跑**：分享面板、系统文件选择器都是原生 UI，三个按钮没有手动点过（本机无法自动化点击）。Android 未跑 |

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
| 模拟器 / 真机运行 | **未跑**：预测与预演都只在逻辑与单测层面验证过，没有手点（见下方「本机 iOS 模拟器实机运行」的说明） |

## 第二阶段验收记录（本机 iOS 模拟器实机运行）

这一节记录**真正把应用跑起来之后**看到的结果，不是静态检查。

| 项目 | 结果 |
| --- | --- |
| 环境 | Xcode 26.3 · iPhone 16e 模拟器 · iOS 26.3 · Expo Go 58.0.5（SDK 58 内置 `expo-sqlite`，无需原生构建） |
| 启动方式 | `npm start` 起 Metro，Expo Go 打开 `exp://127.0.0.1:8081` |
| 打包 | Metro 成功打包 1393 个模块；`npx expo export --platform ios` 2.9MB |
| 数据库 | 设置页显示 `已连接` / `schema v4` / `本次迁移：无（已是最新 v4）`；`app_meta` 正常写入安装时间与启动次数 |
| 逐页验证范围 | 时间轴、统计、事件、周期、设置 5 个标签页 + 回收站 + 记录页（`/record/[id]`）+ 周期实例页（`/cycle-instances/[id]`） |
| 渲染内容 | 时间轴显示 14 条记录（来源区分「快捷 / 手动 / 补录」、取值带单位）；统计显示概览 14 条 / 4 个事件、覆盖区间与按天趋势；事件页分「进行中 3 个 / 已归档 1 个」；周期页显示平均周期天数与 2 段；回收站显示 1 条软删除记录与「恢复 / 永久删除」按钮 |
| 运行期报错 | Metro 日志无 JS 报错、无红屏 |
| 示例数据 | **直接写入模拟器数据库**（4 个定义 / 15 条记录 / 2 段周期 / 4 条每日记录），不是通过界面点出来的 |
| 未覆盖 | 本机未授予模拟器辅助功能权限，无法自动化点击，因此**没有手动走通写入路径**（点一下记录、删除并撤销、回收站恢复/永久删除的 Alert）。写入路径目前仍只有单元测试覆盖。Android 与真机未跑 |

> 排障备注：本机访问 GitHub Releases 带宽很低，`expo start --ios` 自动下载 Expo Go 会超时。
> 稳妥做法是手动分片下载 `Expo-Go-58.0.5.tar.gz`（约 148MB）→ 解包得到的目录本身就是 app bundle
> （`CFBundleIdentifier = host.exp.Exponent`）→ 重命名为 `Expo Go.app` → `xcrun simctl install booted`。
> 之后 `xcrun simctl openurl booted "exp://127.0.0.1:8081"` 即可打开。

## 不在范围内（首版）

Web 端、局域网 HTTP 服务、多端同步、**云端**备份、账号体系。

> 说明：**本地文件**的备份与恢复已经支持（导出 JSON → 自己保管 → 导入合并，见上面「导入导出」验收记录）；
> 这里排除的是「云端备份 / 多端同步」这类需要服务端的能力。

## 许可

见 [LICENSE](./LICENSE)。