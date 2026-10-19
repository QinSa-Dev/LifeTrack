# LifeTrack

本地优先的生活记录 App：记录事件（计数 / 数量）、周期事件与症状，并按时间轴回看与统计。

- 技术栈：React Native + Expo + TypeScript + SQLite（expo-sqlite）
- 平台：iOS / Android
- 数据：**全部存在设备本地**，无独立后端、无账号系统、无云数据库

> 当前进度：**第一阶段（工程基线）已完成**；**第二阶段第 1 项（事件定义 / 分组 / 标签 / 快捷选项 / 归档）已完成**；**第 2 项（counter / quantity 记录与时间轴）已完成**；**补录与撤销已完成**（无新增迁移，schema 仍为 v3），其余核心业务尚未开始。

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
    (tabs)/               # 底部三标签：时间轴 / 事件 / 设置
    events/new.tsx        # 新建事件定义
    events/[id].tsx       # 编辑事件定义（归档 / 永久删除）
    record/[id].tsx       # 记录一次事件（快捷 / 手动 / 补录）＋ 最近记录删除与撤销
    groups.tsx            # 分组管理
    tags.tsx              # 标签管理
    +not-found.tsx        # 兜底路由
  components/             # 通用 UI（Screen / Card / Button / Badge / AppText / EmptyState
                          #          TextField / Chip / Header / ListRow / DatabaseGate）
  features/               # 非通用的功能组件（不属于每个页面都用的基础 UI）
    definitions/          # 事件定义表单 EventDefinitionForm + 展示文案
    records/              # format（记录值 / 时间 / 来源）、datetime（本地 ↔ UTC 补录时间）、
                          # RecordRow（记录行）、UndoBar（软删除后的撤销条）
  db/                     # 数据库基础设施
    client.ts             # 唯一连接入口（PRAGMA、单例、失败不覆盖数据）
    migrations.ts         # 版本化迁移执行器（user_version + 独占事务）
    schema.ts             # schema 与迁移清单（v1 app_meta / v2 事件定义 / v3 历史记录）
    types.ts              # SqlExecutor 抽象（便于用内存 SQLite 测试）
    testing/              # 测试专用：node:sqlite 适配器
  domain/                 # 领域层
    models.ts             # 事件定义 / 记录 / 周期等领域模型 + 快照生成
    validation.ts         # 输入类型与校验规则（表单与仓储共用）
    errors.ts             # 统一错误类型（AppError + code）
    id.ts                 # UUID v7 主键方案
  repositories/           # 仓储层（SQL 只写在这里）
    eventGroupRepository.ts      # 分组
    tagRepository.ts             # 标签
    eventDefinitionRepository.ts # 事件定义聚合（定义 + 快捷选项 + 标签关联）
    eventRecordRepository.ts     # 历史记录（记录时生成快照、软删除与撤销）
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
```

## 开发指北（学习文档）

`docs/learning/` 下是一套**以本仓库真实代码为依据**的中文走读材料：每篇包含「本次完成什么 / 改了哪些文件 /
相关技术概念 / 关键代码逐段解释 / 一次完整数据流的 Mermaid 流程图 / 如何验证 / 常见问题排查 / 学习总结与练习」。

入口：[`docs/learning/README.md`](./docs/learning/README.md)。

推荐顺序：`01 工程基线 → 05 业务与数据流 → 06 导航与状态`（快速走读），
深入类型与数据层时再读 `03 领域模型 → 04 SQLite 与 Repository`，
了解第二阶段第 1 项（事件定义）时读 `08 事件定义`，
了解第 2 项（记录与时间轴）时读 `09 事件记录`，
了解补录与撤销时读 `10 补录与撤销`。

> 文档随功能同步更新；未实现的功能（备份恢复、整体架构演进）暂不写作，避免空文档。

## 领域规则（已确认，代码中已体现）

1. **事件定义与历史记录分离**：改定义不影响已产生的历史。
2. **历史快照**：记录保存当时的定义快照，配置变化不会改写历史。
3. **周期实例与周期内记录独立建模**。
4. **周期边界修改不得静默删除越界记录**。
5. **归档不删除历史**，只影响能否继续记录。
6. **永久删除必须二次确认**，并保证事务一致性。
7. **统计从事实数据计算**，不落冗余汇总表。
8. 首版不做 Todo、云同步、多设备同步。

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
| 模拟器 / 真机运行 | **尚未执行**（本次仅做静态检查、单测与打包验证） |

## 第二阶段第 2 项验收记录（记录与时间轴）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 9 个套件 / 108 个用例通过 |
| schema | v3 迁移（`event_records` + 2 个索引），无指向定义的外键，删定义不删历史 |
| iOS 打包 | `npx expo export --platform ios` 通过（1245 modules） |
| 模拟器 / 真机运行 | **尚未执行**（本次仅做静态检查、单测与打包验证） |

## 第二阶段验收记录（补录与撤销）

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（0 error / 0 warning） |
| `npm test` | 11 个套件 / 137 个用例通过 |
| schema | **无新增迁移**，仍为 v3（补录复用 `source: 'backfill'`，撤销复用已预留的 `deleted_at` 列） |
| 领域规则 | 补录只能回到过去（`requireNotFuture`，按时间比较而非字符串）；软删除可撤销、幂等；永久删除才需二次确认 |
| iOS 打包 | `npx expo export --platform ios` 通过（1248 modules） |
| 模拟器 / 真机运行 | **尚未执行**（本次仅做静态检查、单测与打包验证） |

## 不在范围内（首版）

Web 端、局域网 HTTP 服务、多端同步、云端备份、账号体系。

## 许可

见 [LICENSE](./LICENSE)。