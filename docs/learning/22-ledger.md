# 22 记账：记一笔、按月看、左滑复制

> 这一篇讲第五个标签页「记账」。它和前面的事件记录是**两套数据**：事件记录回答「今天做了什么」，
> 记账回答「今天花了 / 赚了多少」。两者共用本地 SQLite 与同一套备份，但表、规则、页面都独立。

## 1. 本次完成什么

- 底部新增第五个标签页「记账」（默认顺序：时间轴 → 记账 → 统计 → 事件 → 设置）。
- 页面顶部是**年份**（左右箭头逐年翻），下面一次摆出 **12 个月**，默认当前月，点一下就换月。
- 月份下面是当月的**支出 / 收入 / 结余**合计。
- 右下角「记一笔」打开表单：支出 / 收入二选一、金额（数字键盘、最多两位小数）、备注（可空）。
- 保存后**立即**出现在列表里，不需要刷新。
- 列表行**左滑**露出「复制 / 删除」：
  - 复制＝以**当前时间**再记一条，金额、备注、方向都不变（然后切到当前月，保证看得见）；
  - 删除＝原生二次确认后真删（记账没有快照、没有联动数据，不做软删除）。
- 记账条目进入 JSON 备份；备份格式从 **v3 升到 v4**，旧备份里没有 `ledgerEntries` 时按空数组处理。
- 新增迁移 **v8** 建 `ledger_entries` 表；新增 Maestro 流程 `15`，真实模拟器上跑通
  「记一笔 → 左滑复制 → 删两条收尾」。

## 2. 数据模型（v8）

```sql
CREATE TABLE ledger_entries (
  id           TEXT    PRIMARY KEY NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('expense', 'income')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note         TEXT,
  occurred_at  TEXT    NOT NULL,
  recorded_at  TEXT    NOT NULL,
  CHECK (note IS NULL OR length(note) <= 100)
);

CREATE INDEX idx_ledger_entries_occurred_at ON ledger_entries(occurred_at DESC);
```

对应的 TypeScript 类型（`src/domain/models.ts`）：

```ts
export type LedgerKind = 'expense' | 'income';

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  /** 正整数，单位「分」；支出 / 收入由 kind 区分，金额本身不带符号 */
  amountCents: number;
  note?: string;
  occurredAt: IsoDateTime;
  recordedAt: IsoDateTime;
}
```

**为什么金额存「分」而不是小数**：`0.1 + 0.2 !== 0.3`，用浮点数记几笔再求和就会出现「差一分」。
界面输入的是元（`3.6`），`src/domain/money.ts` 负责 `元文本 → 整数分` 与反向展示；
数据库与仓储只认整数分。金额上限 `999,999,999.99` 元（`MAX_LEDGER_AMOUNT_CENTS`），
挡住手滑输入一长串数字。

**为什么没有 `updated_at` / `deleted_at`**：记账条目是不可变事实，没有编辑入口；删除就是真删。
因此备份合并时它也按「不可篡改」处理：同 id 只保留本地，不拿备份覆盖（与事件记录同一原则）。
以后若要支持编辑或软删除，需要像事件记录那样补列、补迁移、补合并规则，不能直接改这条约定。

## 3. 月份与时间边界

页面状态是 `{ year, month }`，月份从 **1** 开始（与界面一致，不是 JS `Date` 的 0 起）。
`currentYearMonth()` 按**设备本地时区**取「今年这个月」。

`monthRangeIso({ year, month })` 把某个月算成 UTC 区间 `[from, until)`：

```ts
const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
const end = new Date(year, month, 1, 0, 0, 0, 0);
return { from: start.toISOString(), until: end.toISOString() };
```

两个细节：

- 用本地零点构造再 `toISOString()`，而不是直接拼 `2026-11-01T00:00:00Z`。否则东八区
  「11 月 1 日 00:30」记的账会被算到 10 月。
- `until` 是**开区间**：12 月 1 日 00:00:00 整属于 12 月，不属于 11 月。

仓储把区间下推 SQL（`occurred_at >= ? AND occurred_at < ?`），按月看账不会把全部记录读进内存。
排序是 `ORDER BY occurred_at DESC, id DESC`：同一毫秒连续记两笔时，UUID v7 单调，顺序仍然确定。

## 4. 页面与交互

| 文件 | 作用 |
| --- | --- |
| `src/app/(tabs)/ledger.tsx` | 页面：加载当月、记一笔、左滑复制 / 删除、错误与空状态 |
| `src/features/ledger/MonthPicker.tsx` | 年份箭头 + 12 个月胶囊（只收 `value` / `onChange`） |
| `src/features/ledger/LedgerEntryRow.tsx` | 一行账：备注（没备注用「支出 / 收入」）、本地时间、带符号金额、左滑动作 |
| `src/features/ledger/LedgerEntryForm.tsx` | 底部表单：方向胶囊、金额输入、备注、提交 / 取消 |
| `src/features/ledger/format.ts` | 展示文案与当月合计（纯函数） |
| `src/features/ledger/month.ts` | 年月状态、月份区间、标签（纯函数） |

### 4.1 记一笔

- 表单默认「支出」，金额输入 `keyboardType="decimal-pad"`，备注 `maxLength=100`。
- 输入时用 `sanitizeAmountInput` 即时清洗：只留数字与第一个小数点、小数最多两位、整数最多九位。
  粘贴进来的 `¥3.678` 会变成 `3.67`，不会让输入框进入「怎么保存都失败」的死局。
- 真正提交时再用 `parseAmountToCents` + `requireLedgerAmountCents` 判断；空串 / `.` / 多个小数点 /
  超过两位小数都会得到「请输入大于 0 的金额」或仓储的校验错误。
- 备注 `trim()` 后为空就存 `NULL`，读回来是 `undefined`，列表不会出现一行空白。

### 4.2 左滑复制

要求是「左滑记录可以快速复制一条，时间是当前时间」。实现没有引入手势库，而是用 React Native 自带的
`PanResponder` + `Animated.Value`：

- 横向位移超过 8px 且明显大于纵向位移，才接管手势（不影响列表纵向滚动）。
- 最多左移 `ACTIONS_WIDTH`，松手时过一半就停在展开位，否则弹回。
- 展开后露出「复制 / 删除」两个按钮；按钮的无障碍名字带标题
  （`复制「上班地铁」` / `删除「上班地铁」`），读屏与 Maestro 都能精确到行。
- 复制走 `LedgerEntryRepository.create`，`occurredAt` / `recordedAt` 都取**当前时刻**；
  如果当前选中的不是本月，复制后自动切到当前月，否则用户会以为「点了没反应」。
- 删除先 `Alert.alert` 二次确认（标题「删除这笔账？」，正文带金额与备注），确认后真删。

`Animated.Value`、`PanResponder` 与「当前是否展开」都不需要触发渲染，但必须跨渲染保持同一份。
它们一起放进 `useState` 的惰性初始化里（只创建一次），既满足这个要求，也避开 React Compiler
「渲染期读写 ref」的 lint 规则。细节见 `LedgerEntryRow.tsx` 的注释。

## 5. 备份格式 v4

- `BACKUP_FORMAT_VERSION` 从 `3` 升到 `4`，`BackupData` 新增 `ledgerEntries: LedgerEntry[]`。
- 解析沿用严格守卫：`kind` 只认 `expense` / `income`；`amountCents` 必须是正整数且不超上限；
  `note` 可空、最多 100 字符；`occurredAt` ≤ `recordedAt`；错误带路径
  （`data.ledgerEntries[0].amountCents`）。
- **旧备份兼容**：缺失的集合按空处理，所以 v3 及更早的备份导入后只是没有账，不会报错。
- 合并按「不可变事实」：同 id 保留本地，新 id 追加；`ledgerEntries` 参与稳定排序与重复 id 体检。
- 导入在同一个独占事务里删 / 写**八张表**（原来七张 + `ledger_entries`），
  并核对行数与 `PRAGMA foreign_key_check`；失败整体回滚。

## 6. 测试与验收

- 纯函数：`domain/__tests__/money-test.ts`、`features/ledger/__tests__/month-test.ts`、`format-test.ts`。
- 仓储：`repositories/__tests__/ledgerEntryRepository-test.ts`（真实内存 SQLite：整数分、备注 trim、
  倒序、本地时区月边界、非法金额 / 方向 / 备注 / 未来时间、真删与 `NotFoundError`）。
- 组件：`monthPicker-test`、`ledgerEntryRow-test`、`ledgerEntryForm-test`（RNTL，不连数据库）。
- 备份：`domain/__tests__/backup-test.ts` 增加记账往返、逐字段拒绝、合并与重复 id；
  `backupRepository-test.ts` 的导出 / 导入 / 计数覆盖第八张表。
- 端到端：`.maestro/flows/15-ledger.yaml`。真实模拟器上跑过：
  记一笔 `3.6` / 备注 `Maestro记账` → 左滑点「复制」→ 月合计从 `-¥3.60` 变 `-¥7.20` →
  删两条（原生二次确认）→ 列表里不再有这条备注，自产自销。整跑 **16/16，10m58s**（2026-11-05）。

## 7. 已知取舍

- **没有编辑入口**：记错只能删了重记。记账条目少、字段少，先不做编辑页；以后要做，
  得同时决定「备份合并是否还坚持不可变」。
- **不能补记过去的日期**：表单只记当前时间。需求是「快速记一笔」；补记需要再加日期选择，
  也会让「复制到当前时间」的语义变复杂。
- **删除是真删，不进回收站**：一条账没有快照、没有联动数据，误删的代价比事件记录小；
  表单外有二次确认兜底。若以后要软删除，需加 `deleted_at` 与迁移，并同步备份。
- **左滑动作对读屏是「隐藏但仍可聚焦」**：两个按钮在行背后，视觉上要滑动才出现，
  但无障碍树里一直存在。当前用带标题的名字保证点得准；若要做成真正按需出现，
  需要把展开状态提升为 React state（会多一次渲染）。
- **按月加载，不做跨月分页**：一个月的数据量有限；若单月达到数万条，需要再给列表加分页 / 窗口。
- **月份只能一年一年翻**：没有「回到今天」按钮。当前月是默认值，翻远了要自己翻回来；
  如果常用，可以加一颗「本月」快捷入口。