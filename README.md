# LifeTrack

本地优先的生活记录 App：记录事件（计数 / 数量）、周期事件与症状，并按时间轴回看与统计。

- 技术栈：React Native + Expo + TypeScript + SQLite（expo-sqlite）
- 平台：iOS / Android
- 数据：**全部存在设备本地**，无独立后端、无账号系统、无云数据库

> 当前进度：**第一阶段（工程基线）已完成**，第二阶段（核心业务）尚未开始。

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
  components/             # 通用 UI（Screen / Card / Button / Badge / AppText / EmptyState）
  db/                     # 数据库基础设施
    client.ts             # 唯一连接入口（PRAGMA、单例、失败不覆盖数据）
    migrations.ts         # 版本化迁移执行器（user_version + 独占事务）
    schema.ts             # schema 与迁移清单
    types.ts              # SqlExecutor 抽象（便于用内存 SQLite 测试）
    testing/              # 测试专用：node:sqlite 适配器
  domain/                 # 领域层
    models.ts             # 事件定义 / 记录 / 周期等领域模型
    errors.ts             # 统一错误类型（AppError + code）
    id.ts                 # UUID v7 主键方案
  repositories/           # 仓储层（SQL 只写在这里）
  theme/                  # 设计令牌（颜色 / 间距 / 字号）
```

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

## 不在范围内（首版）

Web 端、局域网 HTTP 服务、多端同步、云端备份、账号体系。

## 许可

见 [LICENSE](./LICENSE)。