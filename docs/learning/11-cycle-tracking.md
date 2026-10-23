# 11 周期事件：日历日期、区间规则与「不静默删除」

> 对应功能：**第二阶段——周期事件**（周期定义 / 周期实例 / 周期内记录）。
> 本文以仓库真实代码为依据。凡是「没做过」的验证，会明确写出来。
> 这一项**新增了 v4 迁移**（三张表），schema 从 v3 升到 v4。

## 1. 本次完成什么

前面几项解决的是「事件」（喝了一次水、走了一段路）。这一项补上另一类记录：**周期**——
它是一个**区间**，区间里有**每一天的状态**。比如「生理期」这个定义下，有「10-01 ~ 10-05」这一段周期的实例，
实例里 10-02 这天记录「经期 / 头痛 / 有点累」。

| 能力 | 说明 |
| --- | --- |
| 周期定义 | 名称 + 可选的「平均周期长度」「平均经期长度」；平均周期长度只用来**预测**下次开始日 |
| 周期实例 | 一段真实区间：`startDate` ~ `endDate`；`endDate` 为空表示**进行中** |
| 周期内记录 | 某一天的阶段、症状、感受、备注；**一天一条**，重复保存即覆盖 |
| 预测 | 按「最近一段开始日 + 周期长度」给出下次预测；长度优先用**实际观察到的间隔平均**，没有历史才退回配置值，都没有就**不预测**（不猜）。「最近若干段」的窗口可调（第 4.11 节） |
| 归档 | 归档只表示「不再开新周期」，**已有周期与记录都留着** |
| 删除分两级 | **某天的记录**：软删除（可撤销，回收站里再彻底删除，见第 4.9 节）；**定义 / 整段实例**：不可逆的永久删除，`Alert` 二次确认 |
| 边界预演 | 改边界时**保存之前**就提示「会有哪几天落到区间外」「会和哪一段周期重叠」，不必等报错（第 4.8、4.12 节） |

这一项真正的新东西是三条**领域规则**，它们不是「顺手删掉就行」，而是要在代码里站住：

1. **周期边界修改不得静默删除越界记录**——把区间改小、导致某些记录落在区间外时，**拒绝修改并说明原因**，
   绝不偷偷删数据（见第 3.3 节）。
2. **同一定义的周期实例不重叠**——否则「这是第几天」会含糊（见第 3.4 节）。
3. **一天一条**——用 `UNIQUE(instance_id, date)` + UPSERT 从结构上保证（见第 3.5 节）。

**后来补的增强**（本文档已同步，见第 4.2、4.8、4.11、4.12 节）：

- 预测不再只看配置值：改成「最近若干段实际间隔的平均」，并把**依据**（算出来的 / 按配置推的）显示出来。
- 预测的**窗口可调**：默认「最近 3 段」，可在「设置 → 偏好设置」里改成 1 / 3 / 5 段（第 4.11 节）。
- 越界提示提前到保存之前：界面用已加载的记录 + 同一个纯函数实时预演，
  因此删掉了仓储里那个重复的只读查询 `listOutsideEntryDates`（规则只留一份）。
- **重叠也提前提示**：改边界时若压到同一定义的另一段周期，保存前就点名是哪一段（第 4.12 节）。
- **月视图（可点选的日历）**：实例页多了一张「月视图」卡片，点某一天 = 把那一天填进同一个表单（第 4.10 节）。

**当时明确不做、后来又做的**：日历式可点选的月视图（第 4.10 节）；按症状统计挂在统计侧，
见 [12 统计](./12-statistics.md) 3.12 节。
**至今仍未做**：周期与事件的统一时间轴。

## 2. 改了哪些文件

| 文件 | 角色 | 本次新增/修改 |
| --- | --- | --- |
| `src/domain/dates.ts` | 领域 | **新增**：纯日历日期运算（`isValidIsoDate` / `addDays` / `daysBetween` / `isDateWithin`） |
| `src/domain/cycles.ts` | 领域 | **新增**：周期规则纯函数（`findDatesOutside` / `findOverlappingInstance` / `instanceLengthDays` / `latestInstance`）；后来补上 `observedCycleLength` / `predictNextCycle`（取代原来的 `predictNextCycleStart`） |
| `src/domain/validation.ts` | 领域 | 新增 `requireIsoDate` / `optionalIsoDate` / `requireDateRange` / `optionalPositiveInteger` / `normalizeTextList` 与三个周期输入类型 |
| `src/db/schema.ts` | 数据库 | **新增 `MIGRATION_V4_CYCLE`**：`cycle_definitions` / `cycle_instances` / `cycle_entries` + 索引；后来加 `META_KEYS.predictionWindow = 'app.prediction_window'`（**无迁移**） |
| `src/repositories/cycleDefinitionRepository.ts` | 仓储 | **新增**：定义 CRUD + 归档 |
| `src/repositories/cycleInstanceRepository.ts` | 仓储 | **新增**：实例 CRUD；`update` 内的越界检查（本项核心）与重叠检查 |
| `src/repositories/cycleEntryRepository.ts` | 仓储 | **新增**：按 `(instance_id, date)` UPSERT 保存某天记录；日期必须落在区间内 |
| `src/features/common/datetime.ts` | 功能组件 | 从 `features/records/datetime.ts` **移动**过来（周期也要用「今天」） |
| `src/features/cycles/labels.ts` | 功能组件 | **新增**：文案与症状文本解析；后来 `describeLatestCycle` 接受窗口参数、新增 `describeOverlap`（重叠预演的文案） |
| `src/features/cycles/predictionWindow.ts` | 功能组件 | **后来新增**：预测窗口这个**纯偏好**的取值选项 / 默认值 / 解析 / 文案（存 `app_meta`，**零迁移**；第 4.11 节） |
| `src/features/cycles/CycleDefinitionForm.tsx` | 功能组件 | **新增**：新建 / 编辑周期定义共用表单 |
| `src/app/(tabs)/cycles.tsx` | 页面 | **新增**：周期标签页（定义列表）；副标题里的预测按设置的窗口算 |
| `src/app/cycles/new.tsx`、`src/app/cycles/[id].tsx` | 页面 | **新增**：新建定义 / 定义详情（周期列表、开始新周期、归档、删除） |
| `src/app/cycle-instances/[id].tsx` | 页面 | **新增**：一段周期 + 每日记录 + 边界调整 + 删除；后来加「月视图」卡片（第 4.10 节）与重叠预演（第 4.12 节） |
| `src/features/cycles/calendar.ts` | 功能组件 | **后来新增**：月视图的纯计算（`buildMonthGrid` / `shiftMonth` / `monthIntersectsRange` / `clampMonthToRange` / `indexEntriesByDate` / `describeCalendarDay`） |
| `src/features/cycles/MonthCalendar.tsx` | 功能组件 | **后来新增**：月视图网格（纯展示，无状态） |
| `src/app/(tabs)/_layout.tsx` | 页面 | 底部由三标签变**四标签**（时间轴 / 事件 / 周期 / 设置） |
| `src/app/(tabs)/settings.tsx` | 页面 | **后来修改**：加「偏好设置」卡片——预测窗口（与时间轴显示方式并成一组）在这里改（第 4.11 节） |

## 3. 相关技术概念

### 3.1 「哪一天」和「哪一刻」不是一回事

前两项记录的是**时刻**：`occurredAt` 是 UTC ISO-8601（`2026-10-19T08:30:00.000Z`），
因为「几点几分」只有在时区里才有意义，所以要存成绝对时间。

周期记录的是**日历上的某一天**：`startDate: '2026-10-01'`。它没有时刻、没有时区。
如果硬把它当成时刻存，会出现「北京时间 10-01 的零点」和「UTC 10-01 的零点」这类问题——
同一段周期在不同时区看起来会差一天。

所以 `src/domain/dates.ts` 的约定是：**一律按 UTC 解释，只用日历字段做加减**。

```ts
/** 解析成 UTC 零点的毫秒值；格式不合法或日期不存在时返回 null。 */
function parseIsoDate(value: string): number | null {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  // …
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  // JS 会把「2 月 31 日」归一成 3 月，用回读字段挡掉不存在的日期
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return ms;
}
```

**为什么本项目需要**：`addDays('2026-12-31', 1)` 必须等于 `'2027-01-01'`，且跨月、跨年、闰年都对。
用 `Date.UTC` 加 `n * 86400000` 毫秒是安全的（UTC 没有夏令时）；如果换成「本地时区」，跨夏令时那天会算错。

**不用会出什么问题**：把「哪一天」当成本地时间处理，用户在东八区晚上 11 点记录，
换到别的时区查看就少一天。日期的加减也会在夏令时切换日出错。

> 「今天是几号」这件事**没放在领域层**——它与设备时区有关，所以留在
> `src/features/common/datetime.ts` 的 `localDateText(new Date())`。两者不要混用。

### 3.2 日期解析：为什么解析后要「回读字段」

`new Date(2026, 1, 31)`（2 月 31 日）不会报错，JS 会悄悄归一成 3 月 3 日。
所以解析完必须**用回读的年 / 月 / 日**和输入比较，不一致就认为非法：

```ts
export function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}
```

`requireIsoDate` 再把它包成带字段名的中文错误（`validation.ts`）：

```ts
export function requireIsoDate(value: string, field = '日期'): IsoDate {
  const trimmed = value.trim();
  if (!isValidIsoDate(trimmed)) {
    throw new ValidationError(`${field}不是合法的日历日期（应为 YYYY-MM-DD）：${value}`);
  }
  return trimmed;
}
```

这和第 10 篇里 `parseLocalDateTime` 的「回读法」是同一种手法，只是这里没有时间部分。

### 3.3 「不静默删除」：把规则做成一次**会拒绝的校验**

这是本项最重要的一条。场景：一段周期是 `10-01 ~ 10-10`，里面 10-08 有记录。
如果用户把结束日改成 `10-05`，那 10-08 就落在区间外了。

有三种做法，语义完全不同：

| 做法 | 后果 |
| --- | --- |
| 顺手删掉 10-08 那条 | **静默丢数据**——用户不知道发生了什么，且不可恢复 |
| 留着不管 | 数据自相矛盾：一条「属于这段周期」的记录，日期却在周期之外 |
| **拒绝修改并说明原因** | 用户自己决定：是改回边界，还是先处理那条记录 |

本项目选第三种。规则先写成**纯函数**（`src/domain/cycles.ts`），方便单独测试：

```ts
/** 取出若干日期中**落在区间外**的那些（保持输入顺序）。 */
export function findDatesOutside(dates: readonly IsoDate[], startDate: IsoDate, endDate?: IsoDate): IsoDate[] {
  return dates.filter((date) => !isDateWithin(date, startDate, endDate));
}
```

仓储层的 `update` 在读-写之间调用它，有越界就抛 `ConflictError`：

```ts
// src/repositories/cycleInstanceRepository.ts
private async assertNoOutsiders(txn: SqlExecutor, instanceId: string, range: DateRange): Promise<void> {
  const rows = await txn.getAllAsync<DateRow>(
    'SELECT date FROM cycle_entries WHERE instance_id = ? ORDER BY date ASC',
    instanceId,
  );
  const outside = findDatesOutside(
    rows.map((row) => row.date),
    range.startDate,
    range.endDate,
  );
  if (outside.length > 0) {
    throw new ConflictError(
      `有 ${outside.length} 条记录落在新边界之外（${outside.join('、')}），已取消修改。` +
        '请先处理这些记录，或把边界改回包含它们。',
      { details: { outsideDates: outside } },
    );
  }
}
```

注意报错里**列出了具体日期**，并且放进 `details`。界面因此能原样显示原因；测试也能断言
「报错里带着 `outsideDates: ['2026-10-02']`」。

**为什么用 `ConflictError` 而不是 `ValidationError`**：这不是「输入格式不对」，
而是「输入合法，但和现有数据冲突」。错误类型分得清，调用方才能选择不同处理方式。

### 3.4 区间重叠：进行中的区间是「开区间」

同一周期的两段区间不能重叠，否则「第几天」会有两种算法。判定在领域层：

```ts
/** 用于「进行中」区间的开区间上界：`YYYY-MM-DD` 字典序下足够大。 */
const OPEN_ENDED = '9999-12-31';

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const aEnd = a.endDate ?? OPEN_ENDED;
  const bEnd = b.endDate ?? OPEN_ENDED;
  return a.startDate <= bEnd && b.startDate <= aEnd;
}
```

`YYYY-MM-DD` 是定长补零的字符串，**字典序与时间先后一致**，所以直接用 `<` / `<=` 比较就够了，
不需要先转成 `Date`。这是本项目里反复使用的一个小技巧。

「进行中」没有结束日，怎么比？把它看成延伸到 `9999-12-31`。这样一段进行中的
周期会挡住它之后的所有区间——语义正好：上一段没结束，就还不该开下一段。

### 3.5 「一天一条」用 UPSERT 表达

`cycle_entries` 上建了唯一索引：

```sql
CREATE UNIQUE INDEX idx_cycle_entries_instance_date ON cycle_entries(instance_id, date);
```

于是「保存某一天的记录」就写成一个 UPSERT，不用先查「这天有没有记录」：

```ts
// src/repositories/cycleEntryRepository.ts
await this.db.runAsync(
  `INSERT INTO cycle_entries (id, instance_id, date, phase, symptoms, feelings, note, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(instance_id, date) DO UPDATE SET
     phase = excluded.phase,
     symptoms = excluded.symptoms,
     feelings = excluded.feelings,
     note = excluded.note,
     updated_at = excluded.updated_at,
     deleted_at = NULL`,
  // …
);
```

最后那句 `deleted_at = NULL` 是 v5 加的（发生了软删除之后，保存 = **复活**）：
不这样做就会出现「提示保存成功、列表里却没有」——那天仍是软删除状态，被列表过滤掉了。
详见第 4.9 节。

**为什么本项目需要**：界面的交互是「点某一天 → 填写 → 保存」。如果保存分成
「新建」和「更新」两条路，页面就要自己判断「这天填过没有」，还容易判断错。
UPSERT 让保存**天然幂等**：同一天保存两次，结果一样（`created_at` 保持第一次的时间）。

`ON CONFLICT` 的目标由唯一索引提供；这也是把「业务约束」交给数据库兜底的一个例子——
就算将来有人从别处写库，也不可能写出同一天两条。第 10 篇的软删除幂等是**代码**保证的，
这里是**结构**保证的。

### 3.6 两个仓储，而不是一个聚合

第 1 项里 `EventDefinitionRepository` 是「一张定义背后三张表」的聚合根。
周期这边**故意拆成两个**：`CycleInstanceRepository`（实例）与 `CycleEntryRepository`（记录）。

原因是最初的领域建模就把它们当成两个独立概念（`CycleInstance.endDate` 的注释写着
「未结束时为空；修改边界不得静默删除已越界的记录」）。拆分后：

- 实例仓储负责**边界**（含越界检查、重叠检查）；
- 记录仓储负责**一天的数据**（含「日期必须在区间内」的校验）。

代价是两个仓储都要读对方的表（实例要读 `cycle_entries` 的日期，记录要读 `cycle_instances` 的区间）。
这是可接受的：仓储层本来就是「唯一能写 SQL 的地方」，跨表读取不需要绕路。

收益是规则落点清晰：**「改边界」的校验不会散落到记录仓储里**。

### 3.7 三层下钻的路由

事件是两层：标签页 → 记录。（`(tabs)/definitions.tsx` → `record/[id].tsx`）
周期是三层：**标签页 → 定义详情 → 实例详情**。

```
(tabs)/cycles.tsx              /cycles             定义列表
cycles/new.tsx                 /cycles/new         新建定义
cycles/[id].tsx                /cycles/[id]        定义详情（该定义的周期列表）
cycle-instances/[id].tsx       /cycle-instances/[id]   一段周期 + 每日记录
```

`/cycles` 同时是「标签页」和「`/cycles/...` 目录」的前缀。expo-router 允许这样做：
`(tabs)/cycles.tsx` 只对应精确路径 `/cycles`，而 `cycles/new.tsx` / `cycles/[id].tsx`
是它下面的子路径，两者不冲突（静态段 `new` 优先于动态段 `[id]`）。

使用 `typedRoutes` 时，**新增路由后 `tsc` 会报「Href 里没有这个路径」**，
因为类型生成在 `.expo/types/router.d.ts`（已 gitignore）。跑一次 `npx expo start --offline`
重新生成即可（见 `HANDOFF.md` 第 2 节）。

## 4. 关键代码逐段解释

### 4.1 区间判定（`src/domain/dates.ts`）

```ts
export function isDateWithin(date: IsoDate, startDate: IsoDate, endDate?: IsoDate): boolean {
  if (date < startDate) {
    return false;
  }
  if (endDate !== undefined && date > endDate) {
    return false;
  }
  return true;
}
```

闭区间（含首尾）：「10-01 ~ 10-05」包含 10-05 那天。
`endDate` 为空只约束下界——这正是「进行中」的语义。

### 4.2 预测：先看实际观察到的间隔，没有依据就不预测

```ts
// 最近 window 个「相邻开始日之差」取平均；少于两段实例就返回 undefined
export function observedCycleLength(
  instances: readonly CycleInstance[],
  window: number = DEFAULT_PREDICTION_WINDOW,   // 默认 3
): ObservedCycleLength | undefined {
  const starts = [...new Set(instances.map((instance) => instance.startDate))].sort();
  if (starts.length < 2) {
    return undefined;
  }
  // 取最后 window 个间隔（starts 已按字典序 = 时间序排序）…
}

export function predictNextCycle(
  instances: readonly CycleInstance[],
  definition: CycleDefinition,
  window: number = DEFAULT_PREDICTION_WINDOW,   // 默认 3，可调（第 4.11 节）
): CyclePrediction | undefined {
  const latest = latestInstance(instances);
  if (!latest) {
    return undefined;
  }

  const observed = observedCycleLength(instances, window);
  if (observed !== undefined) {
    return { nextStart: addDays(latest.startDate, observed.averageDays), lengthDays: observed.averageDays, basis: 'observed', observedGaps: observed.gaps };
  }

  const configuredLength = definition.averageCycleLengthDays;
  if (configuredLength === undefined) {
    return undefined;
  }
  return { nextStart: addDays(latest.startDate, configuredLength), lengthDays: configuredLength, basis: 'configured', observedGaps: 0 };
}
```

三级优先，且**每一级的依据都能从返回值看出来**：

| 情况 | 用的长度 | `basis` | 界面上怎么说 |
| --- | --- | --- | --- |
| 有两段以上周期 | 最近若干段间隔的平均 | `observed` | 「按最近 3 段间隔的平均 28 天」 |
| 只有一段，但配置了平均长度 | 配置值 | `configured` | 「按定义里配置的平均周期长度 28 天」 |
| 两者都没有 | —— | 返回 `undefined` | 「暂不做预测」 |

两点值得注意：

- **没有配平均周期长度时也返回 `undefined`，而不是猜一个默认值（比如 28 天）**。
  这让「预测」这个词始终有依据（老版本只看配置值，现在只要有历史就能预测）。
- 为什么优先用观察值：配置值是用户手填的**期望**，相邻两次开始日的实际间隔才是这个人的**真实节律**。
  间隔按**日历日**算（`daysBetween`），不受时区与夏令时影响。

### 4.3 创建实例：先校验定义，再校验重叠（`cycleInstanceRepository.create`）

```ts
await this.db.withExclusiveTransactionAsync(async (txn) => {
  const definition = await txn.getFirstAsync<DefinitionRow>(
    'SELECT id, name, is_archived FROM cycle_definitions WHERE id = ?',
    definitionId,
  );
  if (!definition) {
    throw new NotFoundError(`周期定义不存在：${definitionId}`);
  }
  if (definition.is_archived === 1) {
    throw new ConflictError(`周期「${definition.name}」已归档，不能新开周期`);
  }

  await this.assertNoOverlap(txn, definitionId, range);

  await txn.runAsync(`INSERT INTO cycle_instances …`);
});
```

`withExclusiveTransactionAsync` 保证「读一遍现有实例 → 判断不重叠 → 写入」是一个原子动作。
否则两个并发的「开始新周期」可能都读到「还没有实例」，然后双双写入重叠的区间。

### 4.4 更新实例：越界检查排在重叠检查之前

```ts
async update(id, input: CycleInstanceUpdateInput, now = new Date().toISOString()) {
  const range = requireDateRange(input.startDate, input.endDate);
  // …
  await this.db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<CycleInstanceRow>('SELECT definition_id FROM cycle_instances WHERE id = ?', targetId);
    if (!existing) {
      throw new NotFoundError(`周期实例不存在：${targetId}`);
    }

    await this.assertNoOutsiders(txn, targetId, range);          // ← 本项核心
    await this.assertNoOverlap(txn, existing.definition_id, range, targetId);

    await txn.runAsync('UPDATE cycle_instances SET start_date = ?, end_date = ?, … WHERE id = ?', …);
  });
  return this.mustReadOne(targetId);
}
```

注意更新接口**不接受 `definitionId`**（类型是 `CycleInstanceUpdateInput`）：
一个周期实例不会「中途换定义」，否则历史含义会变。

`excludeId` 让重叠检查在更新时排除自己——不然「不动边界、只改备注」也会被判成和自己重叠。

### 4.5 记录写入前校验区间（`cycleEntryRepository.save`）

```ts
const instance = await this.db.getFirstAsync<InstanceRangeRow>(
  'SELECT start_date, end_date FROM cycle_instances WHERE id = ?',
  targetId,
);
if (!instance) {
  throw new NotFoundError(`周期实例不存在：${targetId}`);
}
const range = { startDate: instance.start_date, endDate: instance.end_date ?? undefined };
if (!isEntryWithinRange(date, range)) {
  throw new ValidationError(`${date} 不在这个周期的区间内（${range.startDate} ~ ${range.endDate ?? '进行中'}）。`);
}
```

**为什么必须校验**：如果放任用户在区间外写记录，那这些记录之后会被「改边界」的越界检查
当成障碍，数据就自相矛盾了。**在写入口挡住，比在出口补救便宜。**

### 4.6 界面上「保存边界」如何把拒绝的原因显示出来

```tsx
// src/app/cycle-instances/[id].tsx
new CycleInstanceRepository(db)
  .update(instance.id, { startDate: boundaryStart, endDate: boundaryEnd, note: instance.note })
  .then((updated) => {
    setFlash(`边界已更新：${updated.startDate} ~ ${updated.endDate ?? '进行中'}`);
  })
  .catch((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  });
```

`AppError` 的 `message` 已经是中文、带着越界日期，页面直接显示就行。
用户看到的是：「有 1 条记录落在新边界之外（2026-10-08），已取消修改。请先处理这些记录……」
—— 而不是「操作失败」。

### 4.7 「开始新周期」的默认开始日

```ts
const latest = latestInstance(loadedInstances);
const today = localDateText(new Date());
setNewStart(latest?.endDate ? maxIsoDate(today, addDays(latest.endDate, 1)) : today);
```

取「今天」和「上一段结束后一天」中较晚的那个。这样默认值**永远不会和上一段重叠**
（仓储会拒绝重叠），用户不改也能开成。进行中时按钮直接禁用，并提示先结束上一段。

### 4.8 边界预演：把「会甩出哪些日期」提前到保存之前

第 4.4 节里的越界检查发生在**保存时**：用户把结束日改小、点保存，才被告知「有 1 条记录落在外面」。
更好的做法是**边改边提示**，而且不需要再查一次库——因为这段周期的记录本来就在页面上：

```tsx
// src/app/cycle-instances/[id].tsx
const outsideDates = useMemo(() => {
  const start = boundaryStart.trim();
  const end = boundaryEnd.trim();
  if (!isValidIsoDate(start) || (end !== '' && (!isValidIsoDate(end) || end < start))) {
    return []; // 输入还没填完整：不给结论，免得显示成「全部越界」
  }
  return findDatesOutside(
    entries.map((entry) => entry.date), // 已加载的这条周期的全部记录
    start,
    end === '' ? undefined : end,
  );
}, [entries, boundaryStart, boundaryEnd]);
```

```tsx
{outsideDates.length > 0 ? (
  <AppText variant="body" color={palette.warning}>
    按这个边界，会有 {outsideDates.length} 条记录落在区间外（{outsideDates.join('、')}）：保存会被拒绝，这些记录不会被删除。
  </AppText>
) : null}
```

四个设计点：

1. **规则只有一份**：这里用的是仓储越界检查里的**同一个** `findDatesOutside`，
   所以「界面提示的」与「保存时拒绝的」不可能不一致。
2. **不必再查库**：记录已经在 `entries` 里，本地算即可——没有额外的异步，也就没有
   「结果回来晚了、显示成上一次输入的结论」这类竞态。
   正是因为这个原因，仓储里那个重复的只读查询 `listOutsideEntryDates` **被删掉了**；
   真正把关的仍然是保存时的 `assertNoOutsiders`。
3. **不完整的输入不给结论**：不是合法日期、或结束日早于开始日时一律不提示，
   否则会把「输入还没填好」显示成「全部记录都越界」。
4. **提示不等于校验**：用警告色，文案写明「保存会被拒绝」。

### 4.9 某天的记录也能软删除（v5）

原来的「删除某天的记录」是真删，只有 `Alert` 二次确认兜着。v5 给 `cycle_entries` 加了
`deleted_at`，与事件记录对齐：「删除」先软删（可撤销），回收站里再决定恢复还是彻底删除。

```ts
// src/repositories/cycleEntryRepository.ts
async softDelete(id: string, now: IsoDateTime = new Date().toISOString()): Promise<CycleEntry> {
  // … 幂等：已删除直接返回原记录
  await this.db.runAsync(
    'UPDATE cycle_entries SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
    deletedAt,
    targetId,
  );
  return this.mustReadOne(targetId);
}
```

这次改动牵动了周期这边**三处规则**，每一处都要跟着更新，否则就自相矛盾：

| 规则 | 原来 | 现在 |
| --- | --- | --- |
| 写入校验 | 日期必须在实例区间内 | 不变；`restore` 也**重新**校验（软删期间边界可能已缩走） |
| 边界越界检查（4.4 节） | 查这条周期的全部记录日期 | 只查 **`deleted_at IS NULL`** 的：回收站里那几天不该挡住缩小边界 |
| 列表 / 统计 | `listByInstance` 全给 | 默认过滤软删；`listAll`（导出用）仍带全部 |

还有一个「保存即复活」（第 3.5 节）与一条备份侧的连带修改（软删除的记录允许落在区间外，
否则 App 自己导出的备份会在导入时被自己拒绝）——完整经过见
[13 回收站与永久删除](./13-permanent-delete-and-trash.md) 第 6 节。

界面上，这一段周期的页面删除后出现「撤销」提示条（复用时间轴的 `UndoBar`），
提示条里写明回收站在哪；回收站页则多了一个「已删除的周期记录」区
（一行显示：**日期 · 所属周期与区间 · 删除时间**，带「恢复 / 永久删除」）。

### 4.10 月视图：把「哪一天有记录」摊开在一个月里（日历）

列表能回答「这段周期记了哪些天」，但要回答「这几周的日子密不密、哪天忘了记」得靠日历。
实例页因此多了一张「月视图」卡片——**不落库**，每次由可见记录现算。

三件事分开写，各有各的纯函数：

| 层 | 文件 | 负责 |
| --- | --- | --- |
| 日期算术 | `src/domain/dates.ts` | `startOfMonth` / `daysInMonth` / `addMonths`（日号超出目标月份**夹到月末**）/ `weekdayIndex`（**周一为 0**） |
| 月视图纯计算 | `src/features/cycles/calendar.ts` | 网格补白、翻月、月份与区间相交、把标记与朗读文字算出来 |
| 摆出来 | `src/features/cycles/MonthCalendar.tsx` | 七列网格 + 上下月按钮；**无状态、无副作用** |

网格的难点不在画，而在**补白**：月初要空出 `weekdayIndex(1 号)` 格才对得上一~日这行表头，
月末补到 7 的整数倍，闰年 2 月（29 天）也不能破：

```ts
// src/features/cycles/calendar.ts
export function buildMonthGrid(month: IsoDate): MonthCalendarCell[] {
  const first = startOfMonth(month);
  const yearMonth = first.slice(0, 8); // `2026-10-`
  const lead = weekdayIndex(first);    // 2026-10-01 是周四 → 3
  const total = daysInMonth(first);    // 31

  const cells: MonthCalendarCell[] = [];
  for (let blank = 0; blank < lead; blank += 1) cells.push({});
  for (let day = 1; day <= total; day += 1) cells.push({ date: `${yearMonth}${padDay(day)}` });
  while (cells.length % 7 !== 0) cells.push({});
  return cells;
}
```

**区间之外的日子是灰的、点不动**。这不是偷懒：仓储保存时本来就会拒绝（第 4.5 节），
与其让使用者填完再吃一个错误，不如一开始就不给点——`isDateWithin` 判一下即可。
同理，翻月用 `monthIntersectsRange` 判断「这个月里还有落在区间内的日子」，
没有就禁用按钮；把边界缩走之后，界面还会用 `clampMonthToRange` 把当前月份拉回区间内，
避免停在一整屏都不能点的月份上。

**点一天 = 把那天填进同一个表单**，与点列表行是同一个入口（`editEntry` 回填、空表单只是换日期），
所以「一天一条」的 UPSERT、区间校验、软删除仍然只有一条路：

```tsx
const pickCalendarDate = (date: string) => {
  const existing = entries.find((entry) => entry.date === date);
  if (existing) {
    editEntry(existing);        // 与列表行完全一样的回填
    return;
  }
  setForm({ ...EMPTY_FORM, date });   // 没有记录：只把日期换过去，等着填
};
```

每格的**朗读文字**也由纯函数产出，形状固定（同时是自动化测试的抓手，见第 6 节）：

```
日历 2026-10-22，今天，有记录（经期，2 个症状）
日历 2026-10-02，无记录
日历 2026-10-30，不在周期区间内
```

前缀「日历」是有用的：每日记录列表里的行标题就是 `2026-10-02`，没有前缀两者在自动化里会撞车
（见 [15 端到端](./15-maestro-e2e.md) 的选择器一节）。

标记（哪几天有记录、有几天症状）由 `indexEntriesByDate` 在**可见记录**上算：
软删除的那天不出现在月视图上，与列表、统计口径一致。

### 4.11 预测窗口：一个「纯偏好」，存在 `app_meta` 里

第 4.2 节的 `observedCycleLength` 一直有个 `window` 参数，但**界面没给入口**——永远是默认的 3。
这一项把它变成「设置」里的一个选项。

**先定性：这是「怎么读」，不是「存了什么」**。窗口只参与「算下一个开始日」，不改任何历史记录，
所以它**不该**进业务表：加一张表、加一列都要迁移，而它连一条记录都算不上。
`app_meta` 是 v1 就有的键值表，写一个键**零迁移**（与 `app.timeline_view` 同一套路，见
[16 时间轴行与详情](./16-timeline-row-and-detail.md) 3.3 节）：

```ts
// src/db/schema.ts
export const META_KEYS = {
  // …
  predictionWindow: 'app.prediction_window',
} as const;
```

纯计算照例单独成模块，**不含 React、不碰数据库**，所以能被单测直接钉住：

```ts
// src/features/cycles/predictionWindow.ts
export const PREDICTION_WINDOW_OPTIONS = [1, 3, 5] as const;
export const DEFAULT_PREDICTION_WINDOW_SETTING = DEFAULT_PREDICTION_WINDOW; // 3

/** 不认识 / 空值一律回退到默认，脏数据不该把界面卡住。 */
export function parsePredictionWindow(value: string | null | undefined): number {
  const parsed = Number(value);
  return PREDICTION_WINDOW_OPTIONS.includes(parsed as 1 | 3 | 5)
    ? parsed
    : DEFAULT_PREDICTION_WINDOW_SETTING;
}

export function describePredictionWindow(window: number): string {
  return `最近 ${window} 段`;
}
```

**为什么选项是 `1 / 3 / 5`，而不是 `2 / 3 / 5`**：窗口是「拿最近几段**间隔**取平均」，
而 N 段间隔需要 N+1 段周期实例。真实数据里，2 与 3 的表现几乎分不出来（要至少 4 段间隔、
也就是 5 段实例才可能差开一天）；而 1 与 3 只要 3 段实例（2 个间隔）就能看出差别。
选 `1 / 3 / 5` 是为了每个档位都能在「用得下去的数据量」下真的看出效果，
而不是摆三个按下去没反应的按钮。

**写入只有一处，读取有三处**。「设置」里点胶囊才写库（先改本地状态让界面立刻响应，再落库，
写失败只提示不回滚——偏好没记住不影响任何数据）；读的地方是周期列表页、定义页、实例页。
三处都用**聚焦时重读**而不是挂载时读一次：

```ts
// src/app/(tabs)/cycles.tsx — 每次回到这个标签页都重读一次
useFocusEffect(
  useCallback(() => {
    let cancelled = false;
    new MetaRepository(db)
      .get(META_KEYS.predictionWindow)
      .then((stored) => {
        if (!cancelled) setWindow(parsePredictionWindow(stored));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [db]),
);
```

偏好是在**别的页面**改的，挂载时只读一次的话，改完切回来不会更新（要重启才生效）——
这个坑在时间轴显示方式那里也踩过一次，两处现在都是聚焦时重读。

定义页上**不再放控件**，只留一句指路：「预测窗口在『设置 → 偏好设置』里统一改」。
它是**全局**的（对所有周期定义生效），塞进某一个定义的页面会让人以为只改这一个。

### 4.12 边界预演的另一半：会不会压到另一段周期

第 4.8 节只预演了「越界」；「重叠」仍然只在点保存时才由仓储拒绝。重叠和越界是同一个来源的问题：
数据就在页面上——**同一定义的全部实例**已经在 `definitionInstances` 里，
所以同样能提前算，同样不用再查库：

```tsx
// src/app/cycle-instances/[id].tsx
const overlappingInstance = useMemo(() => {
  const start = boundaryStart.trim();
  const end = boundaryEnd.trim();
  if (!isValidIsoDate(start) || (end !== '' && (!isValidIsoDate(end) || end < start))) {
    return undefined; // 输入没填完整：不给结论
  }
  return findOverlappingInstance(
    definitionInstances,
    { startDate: start, endDate: end === '' ? undefined : end },
    instance?.id,   // 排除自己，不然「不动边界」也会被判成和自己重叠
  );
}, [definitionInstances, boundaryStart, boundaryEnd, instance?.id]);
```

界面上只多一行字，措辞由 `labels.ts` 的 `describeOverlap` 给出，**带上到底和哪一段撞了**——
只说「重叠了」等于没说：

```
会和已有的一段周期重叠（2026-09-01 ~ 2026-09-05）
```

四条原则与第 4.8 节完全一致：**规则只有一份**（界面与仓储共用 `findOverlappingInstance`）、
**不必再查库**、**不完整的输入不给结论**、**提示不等于校验**（真正的拒绝仍在保存时）。

```mermaid
sequenceDiagram
  participant U as 用户
  participant S as cycle-instances/[id].tsx
  participant R as CycleInstanceRepository
  participant D as SQLite

  U->>S: 把「结束日期」由 2026-10-10 改成 2026-10-05，点「保存边界」
  S->>R: update(id, { startDate: '2026-10-01', endDate: '2026-10-05' })
  R->>D: BEGIN IMMEDIATE（独占事务）
  R->>D: SELECT definition_id FROM cycle_instances WHERE id = ?
  D-->>R: 存在
  R->>D: SELECT date FROM cycle_entries WHERE instance_id = ? ORDER BY date
  D-->>R: ['2026-10-02', '2026-10-08']
  Note over R: findDatesOutside(…, '2026-10-01', '2026-10-05') → ['2026-10-08']
  R-->>S: 抛 ConflictError（details.outsideDates = ['2026-10-08']）
  R->>D: ROLLBACK（没有写任何东西）
  S->>U: 红色提示：有 1 条记录落在新边界之外（2026-10-08），已取消修改…
  Note over D: cycle_instances.end_date 仍是 2026-10-10；<br/>cycle_entries 两条都在
```

用户随后有三个选择：把边界改回包含 10-08、删掉 10-08 那条记录（二次确认）、或放弃这次修改。

## 6. 如何验证

### 关键命令

```bash
npm run typecheck                        # TypeScript
npm run lint                             # ESLint
npm test                                 # Jest（真实内存 SQLite）
npm run format:check                     # Prettier
npx expo export --platform ios           # 打包（不需要模拟器）
```

### 真实跑过的结果

```bash
npm test    # 24 个套件 / 381 个用例通过（含预测与边界预演增强、v5 软删除、月视图）
npx expo export --platform ios   # 通过（js bundle 3.1MB）
maestro test .maestro/flows      # 9/9 通过（含周期边界预演、周期记录软删除、月视图选日期，见 docs/learning/15）
```

「周期增强收尾」（第 4.11、4.12 节）之后重跑：

```bash
npm test    # 28 个套件 / 421 个用例通过（新增预测窗口的解析与文案、重叠文案）
npx expo export --platform ios   # 通过（js bundle 3.1MB，没有新增原生依赖）
maestro test .maestro/flows      # 11/11 通过（新增 10 周期预测窗口与重叠预演）
```

其中与周期直接相关的用例：

- `src/domain/__tests__/dates-test.ts`：格式、闰年、2 月 31 日、跨月跨年、闭区间、进行中只约束下界；
  以及月视图用的 `startOfMonth` / `daysInMonth`（平年闰年 2 月）/ `addMonths`（跨年、**日号夹到月末**）/ `weekdayIndex`（周一为 0、周日为 6）。
- `src/features/cycles/__tests__/calendar-test.ts`：格子数是 7 的整数倍、2026-10 补 3 格且 1 号在第 4 格、
  2024-02 含 29 日、日期连续；`monthLabel` / `shiftMonth` / `monthIntersectsRange` / `clampMonthToRange`；
  `indexEntriesByDate` 跳过软删除；`describeCalendarDay` 四种形状。
- `src/domain/__tests__/cycles-test.ts`：`findDatesOutside`、`rangesOverlap`（含进行中）、长度；
  以及 `observedCycleLength`（取最近 N 个间隔、不足两段不猜、乱序不影响结果）与
  `predictNextCycle`（观察值优先于配置值、退回配置值、两者都没有则不预测）。
- `src/features/cycles/__tests__/labels-test.ts`：`describePrediction` 把「算出来的 / 按配置推的 / 不预测」
  三种说法分开；列表副标题里的预测也用实际间隔；`describeLatestCycle` 的窗口参数（1 段 vs 3 段措辞不同）；
  `describeOverlap` 带出撞上的那一段区间。
- `src/features/cycles/__tests__/predictionWindow-test.ts`：选项是 `1 / 3 / 5`、默认 3、
  `parsePredictionWindow` 认识三种取值且不认识的一律回退、`describePredictionWindow` 的措辞。
- `src/db/__tests__/migrations-test.ts`：v4 三表存在、两项 `CHECK`、`UNIQUE(instance_id, date)`、
  外键生效、级联删除、「记录与实例独立」；v1 升级只跑 v2 之后的迁移且旧数据不丢；
  v5 加上 `deleted_at` 列（可空、旧行为 NULL）、从 v4 旧库升级后老记录都在且都视为未删除。
- `src/repositories/__tests__/cycleInstanceRepository-test.ts`：定义必须存在且未归档、区间非法、
  重叠拒绝、**缩小边界被拒后「边界没变、记录一条没少」**、`details.outsideDates`、`endInstance`、级联删除；
  以及**回收站里的记录不挡边界**（软删除之后可以缩到它外面，未删的那条被完整保留）。
- `src/repositories/__tests__/cycleEntryRepository-test.ts`：UPSERT 更新同一天（`id` 不变、`created_at` 不变）、
  区间外被拒且不写库、症状去空去重、空数组存成 `'[]'`；v5 的软删除幂等、
  恢复幂等、「保存即复活」、`listDeleted` 的顺序与上下文、恢复被区间拒绝（失败后仍是软删除状态）；
  以及 `listVisible`（跨实例只返回可见记录、传定义 id 只返回该定义的记录、不存在的定义返回空数组）。

### 测试覆盖了什么

最关键的是**反向断言**：不只验证「越界时抛错」，还验证**数据一条都没少、边界一个字段都没变**：

```ts
await expect(
  instances.update(created.id, { startDate: '2026-10-01', endDate: '2026-10-05' }, T2),
).rejects.toThrow(ConflictError);

// 反向断言：边界没变、记录一条没少
const after = await instances.getById(created.id);
expect(after?.endDate).toBe('2026-10-10');
expect((await entries.listByInstance(created.id)).map((entry) => entry.date)).toEqual([
  '2026-10-02',
  '2026-10-08',
]);
```

只断言「抛了错」是不够的——「抛错之前其实已经删了记录」同样是 bug。

### 没覆盖什么（诚实记录）

- **当时没有在模拟器 / 真机上手动运行过**：本项与第二阶段其它项一样，只做了静态检查、单元测试与打包验证。
  （后来用 Maestro 在真实界面上补了点：周期边界预演 `05`、周期记录软删除 `07`、月视图选日期 `08`，见
  [15 端到端](./15-maestro-e2e.md)；Android 与真机仍未跑。）
- **没有组件 / 界面测试**：项目至今没有引入 `@testing-library/react-native`，
  所以「点某一行回填表单」「`Alert` 二次确认」「点日历的某一格」这些交互没有自动化验证。
- **边界预演、软删除与月视图只有端到端覆盖**：`outsideDates` 用的是被单测覆盖的纯函数 `findDatesOutside`，
  「输入没填完整时不提示」「提示文案带出了哪些日期」「软删除 → 撤销 → 回收站恢复」与
  「点某一天之后那格变成『有记录』」这些交互层结论，只有 Maestro 流程（`05` / `07` / `08`，
  见 [15](./15-maestro-e2e.md)）在真实界面上断言过，没有组件级断言。
  （`buildMonthGrid` / `describeCalendarDay` 这些**纯计算**本身是有单测的，缺的是「组件确实按它渲染」。）
- **「设置里改窗口 → 预测文案跟着变」也只有端到端覆盖**（Maestro `10`）：窗口的解析与文案是纯函数、
  有单测，但「在设置里点一下、切回周期页就不一样了」这条**跨页面 + 聚焦时重读**的链路，
  靠的是真机界面断言，没有组件级验证。
- **没有并发测试**：`withExclusiveTransactionAsync` 的行为在真实设备上与测试环境可能不同。

## 7. 常见问题与排查

### 问题：把结束日提前，界面报「有 N 条记录落在新边界之外」

这不是 bug，是本项要的**行为**。先看报错里列出的日期，决定：

1. 把那几天的记录删掉（在「每日记录」里点「删除」，是软删除；确认不需要了就进回收站彻底删除），再改边界；
2. 或者把边界改回包含它们；
3. 或者干脆另开一段周期。

### 问题：改边界时下面出现一行黄色的「会有 N 条记录落在区间外」

那是**保存前的预演**（第 4.8 节），不是错误：它告诉你「如果就这么保存，会被拒绝」，
并列出具体是哪几天。此时记录还在，什么都不会被删。三种处理方式同上。

### 问题：改边界时出现「会和已有的一段周期重叠（…）」

也是**保存前的预演**（第 4.12 节）。它顺手把**是哪一段**也说出来了，所以照着那行区间改回去就行：
同一周期定义的两段实例不能重叠（第 3.4 节），否则「这是第几天」会有两种算法。
注意进行中的那一段是**开区间**——只约束下界，改它的开始日时特别容易压到它前面的那一段。

### 问题：想改「按最近几段」算预测，在哪儿改

在「设置 → 偏好设置 → 周期预测窗口」（第 4.11 节），选项是「最近 1 / 3 / 5 段」。
它是**全局**的（对所有周期定义生效），所以不在某个定义自己的页面上；定义页只显示当前的预测依据，
并指路到设置。改完切回周期页立刻生效（不必重启）。

### 问题：「开始新周期」按钮是灰的

两种情况：定义**已归档**，或已经有一段**进行中**的周期。
后者需要先在那段周期的详情页点「结束于今天」或填一个结束日再「保存边界」。

### 问题：填了开始日却报「与已有周期重叠」

同一定义的两段区间不能重叠。检查是否和上一段的区间有交集——
注意「上一段还没结束（进行中）」时会挡住它之后的所有日期。

### 问题：想记录某天，却报「不在这个周期的区间内」

要么把那段周期的边界改到包含这天，要么把这天记到正确的周期里。
**不会**允许「属于这段周期、却在这段周期之外」的记录存在。

### 问题：同一天填了两次，会不会有两条记录

不会。`cycle_entries` 上有 `UNIQUE(instance_id, date)`，`save` 用的是 UPSERT：
第二次是**更新**，`created_at` 仍是第一次的时间。界面上「点某一行 → 保存」也是同一条路径。

### 问题：删掉整段周期后，记录去哪了

`cycle_entries` 对 `cycle_instances` 是 `ON DELETE CASCADE`，会一起删掉。
所以界面上的「永久删除这段周期」会先弹二次确认，并告知将删除几条记录。
删**周期定义**同理，会连带删掉它所有的实例与记录。

### 问题：删了某天的记录，还能找回来吗

能——「删除」是软删除，会先出现在回收站（时间轴头部入口）的「已删除的周期记录」区，
可以恢复或彻底删除；当次页面上也会立刻出现一个「撤销」提示条。
只有软删除期间这段周期的边界又被缩小、导致那天落在区间外时，「恢复」才会被拒绝并说明原因
（先把边界改回来，或彻底删除它）。详见 [13](./13-permanent-delete-and-trash.md) 第 6 节。

### 问题：月视图里有些日子点不动

那是**区间之外**的日子（灰掉、点不动）。仓储保存时本来也会拒绝，
不如一开始就不给点。把那段周期的边界改到包含这天，或者把那一天记到正确的周期里。

### 问题：点了月视图里的某天，怎么没有那天的记录

点一天不会凭空造记录。那天**已经记过**就把内容回填到下方表单（等同于点列表行）；
**没记过**只是把表单的日期换成那天，等填完点「保存记录」才有记录。
所以点完可以看卡片下方那行 `当前选中：2026-10-02`，它是表单当前日期，不是「已保存」。

### 问题：症状统计里的百分比是怎么算的

分母是**「记了症状的记录数」**，不是全部记录数——「头痛出现在 3 天」的意思是
「在这 3 天里有头痛」，不该把「没记症状的天」也算进分母。同一天里重复写的同一个症状只算一次；
`头痛` 与 `头疼` 算两种（不做同义归一）。详见 [12 统计](./12-statistics.md) 3.12 节。

## 8. 学习总结与练习

本项练习到的能力：

- **把「哪一天」和「哪一刻」分开处理**：`IsoDate` 一律按 UTC 解释，`IsoDate + 时刻` 才关时区。
- **用纯函数承载领域规则**：`findDatesOutside` / `rangesOverlap` 不碰数据库，单独可测。
- **让「预测」有依据可查**：返回值里带上 `basis` / `observedGaps`，界面才能把
  「算出来的」与「按配置推的」分开讲，而不是笼统说「预测」。
- **同一份规则同时喂给「提前提示」和「最终校验」**：界面与仓储共用 `findDatesOutside`，
  提示与拒绝不可能对不上；因为数据已经在手上，也就不需要再有一个只读查询方法。
- **「不许静默丢数据」怎么落地**：把规则做成一次会 `throw` 的校验，并在报错里带上足够的上下文。
- **`ConflictError` 与 `ValidationError` 的区分**：前者是「和现有数据冲突」，后者是「输入本身不合法」。
- **UPSERT + 唯一索引**表达「一天一条」，让保存天然幂等。
- **给已有表加软删除要连着改一串规则**：写入/恢复的区间校验、边界的越界检查、
  备份的完整性检查、UPSERT 的「复活」语义——每一条都要跟着更新，否则规则之间会互相矛盾
  （第 4.9 节那张表）。
- **字典序即时间序**：定长 `YYYY-MM-DD` 字符串可以直接比较，不必转 `Date`。
- **把「月历」拆成三层**：日期算术（`domain/dates.ts`）→ 网格与标记的纯计算（`features/cycles/calendar.ts`）
  → 只会摆的组件（`MonthCalendar.tsx`）。补白、闰年、翻月边界因此都能单测，组件没有状态。
- **「点一天」不新开一条路**：复用同一个表单与 `editEntry`，所以保存 / 校验 / 软删除的规则不需要写第二遍。
- **给无障碍文字定一个固定形状**：`日历 2026-10-22，今天，有记录（经期，2 个症状）` 既是读屏文案，
  也是自动化里唯一能点准那一格的抓手——顺手解决的问题，比事后补选择器便宜。
- **三层下钻路由**与 `typedRoutes` 的重新生成。

可以自己动手的练习：

1. 给 `cycleInstanceRepository` 加一个 `listOngoing(definitionId)`，
   并在周期标签页把「进行中」的那段高亮出来。提示：`end_date IS NULL`。
2. ~~把 `predictNextCycle` 的 `window` 做成界面上可调的选项~~ ——**已做**，见第 4.11 节
   （选项是「最近 1 / 3 / 5 段」，开关收在「设置 → 偏好设置」里）。再想一步：为什么不是 `2 / 3 / 5`？
   （提示：N 段**间隔**要 N+1 段实例；2 与 3 在若干年的真实记录里几乎看不出差别。）
3. ~~把重叠也提前到保存之前~~ ——**已做**，见第 4.12 节（共用 `findOverlappingInstance`，
   文案点名是哪一段）。再想一步：如果新区间压到的是**进行中**的那一段，提示的措辞应该有什么不同？
   （提示：`CycleInstance` 的 `endDate` 为 `undefined` 表示进行中，见 3.4 节的开区间。）
4. 想一想：如果允许「周期实例换定义」（把一段周期从「生理期」改到另一个定义），
   需要额外校验什么？为什么本项选择**不允许**？
5. `buildMonthGrid` 现在只补白到周一、只按 7 的整数倍收尾。试试写一个
   「周视图」（只渲染某一周 7 格）或「年视图」（12 个小月历），要求仍然**先写纯函数再写组件**：
   哪些函数可以复用？哪些必须新写？（提示：`startOfMonth` / `weekdayIndex` / `addMonths` 都还能用。）
6. 月视图目前把「有记录」和「有症状」画成底色 + 小圆点。如果要画「阶段」（例如经期/排卵期用不同颜色），
   需要改哪一层？（提示：`indexEntriesByDate` 已经把 `phase` 带出来了，缺的是颜色映射——那属于主题，
   不该塞进纯计算。）