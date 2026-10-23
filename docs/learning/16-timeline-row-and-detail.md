# 16 时间轴行改版与记录详情：即时反馈、快照与事实

> ⚠️ **v6 起「单位」变「属性」**：记录详情里快照那一栏从「单位」变成「属性」
> （`record.attributes` / `snapshot.attributes`，多个用 ` · ` 连接），
> 修改记录时不变的字段也从 `unit` 换成 `attributes`——**属性属于事实、不在编辑页改**这条规则没变。
> 本文里 `unit` 的说法请按此理解；走读见 [08 事件定义](./08-event-definitions.md) 第 9 节。

> 这是「第二阶段（时间轴与记录详情改版）」的走读。它讲的是**交互**的一次重做：
> 列表行从「每行一个删除按钮」变成「行是这条记录的信息 + 一下就能再记一条」，
> 改与删收进**那条记录的详情页**。
>
> 涉及的既有背景见 [09 事件记录](./09-event-recording.md)（快照、occurredAt/recordedAt）、
> [10 补录与撤销](./10-backfill-and-undo.md)（软删除与幂等）、
> [12 统计](./12-statistics.md)（本地时区）、[13 回收站](./13-permanent-delete-and-trash.md)（真删与二次确认）。

## 1. 本次完成什么

| 改动 | 结果 |
| --- | --- |
| 行内右侧 | 不再有【删除】；改为**这条记录的取值** + 【+1】（行本身可点 = 进详情） |
| 【+1】 | 点一下就以该行的取值「现在」再记一条（来源 `quick`）：**不弹二次确认、不给撤销条** |
| 记录详情页 | 新增 `/records/[id]`：只读快照 + 底部「更多操作」（修改 / 删除 / 撤销删除） |
| 修改这条记录 | 只改**事实**（取值 / 发生时间 / 备注）；快照（名称、单位、分组、标签）永不更新 |
| 显示方式 | 「设置 → 偏好设置」里的「逐条 / 合并」分组；合并行显示「共 N 次 · 最近 … · 展开逐条」，点行就地展开 |
| 偏好落点 | `app_meta` 的 `app.timeline_view`（默认**合并**）——**零迁移**，不为它加表或列 |
| 定义状态 | 已归档 → 【+1】禁用并标「已归档」；定义被永久删除 → 标「定义已删除」且不渲染按钮 |
| 仓储 | 新增 `EventRecordRepository.update`（含三道校验，见 4.7） |

**本次明确不做**：无限滚动 / 分页、全局搜索、记录的手势操作（左滑删除）、
「按事件筛选」这类查询能力；也**不改**导入合并对记录的规则（见 4.7 末与 `HANDOFF.md` 第 10 节）。

## 2. 改了哪些文件

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `src/features/records/RecordRow.tsx` | 功能组件 | **重写 props**：去掉 `onDelete` / `deleting`，加上 `onPress` / `onRepeat` / `repeatBlockedReason` / `definitionGone` |
| `src/features/records/RecordGroupRow.tsx` | 功能组件 | **新增**：合并行（最近一次的事实 + 【+1】+ 就地展开的插槽） |
| `src/features/records/groupRecords.ts` | 纯函数 | **新增**：`groupRecordsByDefinition`（按定义分组、组内保序、给 `latest`） |
| `src/features/records/timelineView.ts` | 纯函数 | **新增**：显示方式的类型 / 默认值（合并）/ 解析 / 界面叫法 |
| `src/features/records/format.ts` | 纯函数 | 新增 `formatRowValue`（计数型且增量为 1 时返回 `null`）与 `formatFullTime` |
| `src/app/(tabs)/index.tsx` | 页面 | 时间轴：两种视图（**聚焦时重读偏好**）、行内【+1】、点行进详情、定义状态映射 |
| `src/app/(tabs)/settings.tsx` | 页面 | **后来修改**：加「偏好设置」卡片——「时间轴显示」与「周期预测窗口」两个分组（写 `app_meta`） |
| `src/app/records/[id].tsx` | 页面 | **新增**：单条记录详情（快照 + 「更多操作」里的改 / 删 / 撤销） |
| `src/app/record/[id].tsx` | 页面 | 记录页的「最近记录」也换成取值 + 【+1】；`save` 改成返回 `Promise` 并接受 `{ occurredAt, note }` |
| `src/repositories/eventRecordRepository.ts` | 仓储 | 新增 `update` |
| `src/domain/validation.ts` | 领域 | 新增 `EventRecordEditInput`（只给事实三个字段，不给快照字段） |
| `src/db/schema.ts` | 数据库 | `META_KEYS.timelineView = 'app.timeline_view'`（**无迁移**） |
| `src/features/records/__tests__/` | 测试 | `groupRecords-test` / `timelineView-test` / `format-test` |
| `.maestro/flows/02`、`03`、`09` | 端到端 | 02/03 改走详情页（先经子流程 `use-expanded-view` 钉成「逐条」）；09 覆盖【+1】与「逐条 / 合并」 |

## 3. 相关技术概念

### 3.1 即时反馈 vs 二次确认：什么时候**不该**拦人

**是什么**：破坏性、不可逆的动作需要一个「你确定吗」的关卡；而**可逆的、高频的**动作要尽量
一口气做完。同一件事（记一次、删一条）在不同语境下可能落在这两边的任意一边。

**为什么本项目需要**：原来【+1】记完之后会弹一条「已再记一条：喝水 +1 · 撤销」的提示条
（`UndoBar`），要点「知道了」才走。它虽然不是模态框，但**每次都要一次额外的注意力**——
记录这件事本来是一天要做十几次的动作。

**用在哪**：`src/app/(tabs)/index.tsx` 的 `repeat`——它只做「写、刷新、结束」
（连「刚记的那条」都不留在 state 里）：

```ts
const repeat = (record: EventRecord) => {
  setRepeatingId(record.id);
  setError(null);
  new EventRecordRepository(db)
    .record({
      definitionId: record.definitionId,
      value: record.value,
      unit: record.unit,
      source: 'quick',
    })
    .then(() => {
      load(false);           // 列表刷新 = 反馈（新记录出现在最上面）
    })
    .catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));   // 失败才说话
    })
    .finally(() => {
      setRepeatingId(null);  // 按钮从「+1…」回到「+1」，顺带防连点
    });
};
```

**那撤销怎么办**：挪到**那条记录的详情页**。软删除本来就可逆，所以详情页里的「删除」不弹确认，
只是页面进入「已删除」态、菜单变成「撤销删除」——一次点击仍然只做一件事，
只是它不再占用列表那一屏的地方。

**不用会怎样**：高频动作被确认框拖慢（记一次要三步），而真正危险的动作（永久删除）
反而容易被顺手点掉——「拦在哪」比「拦不拦」重要。

### 3.2 快照 ≠ 事实：可更正的范围

**是什么**：一条事件记录里有两类信息。
**快照**（`snapshot.name` / `unit` / 分组 / 标签）是「记录那一刻世界的样子」；
**事实**（`value`、`occurredAt`、`note`）是「发生了什么」。

**为什么本项目需要**：使用者会打错数字、选错时间——必须能改。
但**不能**因为定义后来改了名，就把历史里的旧名字也一起改掉：那样「历史不可篡改」这条规则就塌了
（见 [09](./09-event-recording.md) 3.3 与 `HANDOFF.md` 领域规则第 1、2 条）。

**用在哪**：`EventRecordEditInput` 只给三个字段：

```ts
export interface EventRecordEditInput {
  value: number;
  occurredAt?: string;
  /** 省略即清空备注：更新是「这条记录的这三个字段整体替换」 */
  note?: string;
}
```

**不改什么**：`definitionId`、`kind`、`unit`、`snapshot.*`、`source`、`recordedAt`。
其中 `source` 也不给——它说明「这条是怎么进来的」，不是使用者能重选的；
把发生时间改早之后，界面**自己**会把它显示成「事后补记的」（`isBackfilled` 是派生的，不是存的）。

**不用会怎样**：要么历史跟着定义漂移（改一次定义名，所有旧记录都变），
要么打错的数字永远错下去。

### 3.3 纯展示偏好：为什么不落业务表

**是什么**：有些状态是「怎么读」，不是「数据是什么」——比如「时间轴逐条还是合并」。

**为什么本项目需要**：给它建一张表或加一列都行，但那是**用结构去装一个 UI 开关**：
它没有快照、没有引用、没有历史、也不需要被备份（换机之后从默认值开始完全合理）。
`app_meta` 是现成的键值表（v1 就有了），加一个键**零迁移**。

**用在哪**：`src/db/schema.ts` 的 `META_KEYS.timelineView` + `src/features/records/timelineView.ts`：

```ts
export const DEFAULT_TIMELINE_VIEW_MODE: TimelineViewMode = 'merged';

/** 两种显示方式在界面上的叫法（设置页的胶囊用它，避免文案散落）。 */
export const TIMELINE_VIEW_LABELS: Record<TimelineViewMode, string> = {
  expanded: '逐条',
  merged: '合并',
};

/** 把 `app_meta` 里存着的字符串解析成显示方式；空值与不认识的值都回退到默认。 */
export function parseTimelineViewMode(value: string | null | undefined): TimelineViewMode {
  return value === 'expanded' || value === 'merged' ? value : DEFAULT_TIMELINE_VIEW_MODE;
}
```

**两个刻意的细节**：
1. **默认值是「合并」**（按钮就叫「合并」，早先叫「同类合并」）。偏好只在使用者选了之后才写库；
   已经存过值的使用者不受影响。
2. 读失败 / 存了不认识的值 → 回退默认，**不弹错误卡片**：偏好没记住不是错误，
   不值得打断使用者（写失败才报，因为它下次开也记不住）。

**后来又挪了位置**（第 4.9 节）：开关从时间轴页头收进了「设置 → 偏好设置」，
和「周期预测窗口」并成一个分组；时间轴页头只留一句指路的说明。

**不用会怎样**：为每个 UI 开关加表加列，迁移越滚越多，而它们都不承载事实。

### 3.4 派生数据不落库：分组是纯函数

**是什么**：「合并」要在同一个事件的多次记录上算「共 N 次」「最近一条」「展开后是哪些」。

**为什么本项目需要**：这些都能从已有记录**算出来**，存一份就多一份要同步的东西。
库里的记录是按 `occurred_at` 倒序取回来的，一次分组就能得到视图需要的一切。

**用在哪**：`src/features/records/groupRecords.ts`——输入是已排序的数组，输出保序：

```ts
export function groupRecordsByDefinition(records: readonly EventRecord[]): RecordGroup[] {
  const buckets = new Map<string, EventRecord[]>();
  // ……按 definitionId 分桶，组内保持输入顺序（也就是时间倒序）
  // 每组给一个 latest：合并行右侧的取值与【+1】都以它为
}
```

**不用会怎样**：SQL 里写 `GROUP BY` + `MAX(occurred_at)` 也能算，但「取最近一条的**快照**」
「组内保序」这些规则又得在 SQL 里再写一遍（[12](./12-statistics.md) 3.13 节为同样的取舍
把范围下推给了 SQL，但**规则**没有下推）。

### 3.5 无障碍元素怎么拆：行内按钮为什么能单独点到

**是什么**：Maestro（和读屏）按无障碍元素找东西。**可点的行**如果把整行并成一个元素，
行内的按钮就会被吸进去——「删除」不是一个独立元素，点不到（[15](./15-maestro-e2e.md) 3.7 节）。

**为什么本项目需要**：改版后行内有【+1】、行本身也要可点，更需要这层拆分。
`src/components/ListRow.tsx` 的做法是：**文字区**自己当无障碍元素（`accessibilityLabel="标题, 副标题"`），
整行不做无障碍元素；行内按钮各自独立。

**用在哪**：Maestro 里因此能写两种选择器——点行用 `Maestro喝水, .*`（文字区），
点按钮用 `+1`（按钮自己的标签）。这也是为什么行的文字长成
`Maestro喝水, 10-22 18:20 · 手动` 这种「名字, 副标题」的样子。

**不用会怎样**：要么点不中按钮，要么只能靠坐标点——换设备就失效。

## 4. 关键代码逐段解释

### 4.1 `RecordRow` 的 props：从「能删」变成「能再记一条」

```ts
export interface RecordRowProps {
  record: EventRecord;
  title?: string;
  subtitle?: string;
  /** 点行进入这条记录的详情页——删除在详情页里，不再占行内位置 */
  onPress?: () => void;
  /** 点【+1】：以这条记录的取值「现在」再记一条；不传则不显示按钮 */
  onRepeat?: () => void;
  repeating?: boolean;
  /** 【+1】不能用的原因（例如定义已归档）：按钮禁用，并显示同文案的标记 */
  repeatBlockedReason?: string;
  /** 定义已被永久删除：连【+1】都不再可能，只留一个标记 */
  definitionGone?: boolean;
}
```

要点：

- `onRepeat` 不传就**不渲染按钮**（比如回收站里的行不需要它）；
- `repeatBlockedReason` 既是禁用理由、也是行上那枚 Badge 的文案（**一处措辞两个用途**，
  按钮为什么点不动，行上就写着）；
- `definitionGone` 时**连按钮都不渲染**——不是禁用，因为这条行永远不可能再记了。

### 4.2 `formatRowValue`：为什么「+1」不显示

```ts
export function formatRowValue(record: EventRecord): string | null {
  if (record.kind === 'counter' && record.value === 1) {
    return null;
  }
  return formatRecordValue(record);
}
```

计数型且增量是 1 时，右侧**已经有一颗写着「+1」的按钮**，旁边再摆一个「+1」的文字，
使用者分不清哪个是说明、哪个是能点的。增量大于 1（「+3」）仍然显示——那是一条信息，
按钮只是「按这个值再来一次」。

### 4.3 `timelineView`：不认识的值怎么办

见 3.3 的代码。规则是「**只有明确等于 `merged` 才是合并，其余一律默认**」——
包括 `null`（没存过）、`'MERGED'`（大小写不对）、`'折叠'`（后来改名了）。
这样以后加第三种视图时，老库里存的值进不来也不会崩。

### 4.4 时间轴页面：一份数据、两种渲染

```ts
type TimelineItem = { type: 'record'; record: EventRecord } | { type: 'group'; group: RecordGroup };

const groups = useMemo(() => groupRecordsByDefinition(records), [records]);

const items: TimelineItem[] = useMemo(
  () =>
    viewMode === 'merged'
      ? groups.map((group) => ({ type: 'group' as const, group }))
      : records.map((record) => ({ type: 'record' as const, record })),
  [groups, records, viewMode],
);
```

`: TimelineItem[]` 是**判别联合**：`renderItem` 里按 `item.type` 分支，
TypeScript 就能保证合并分支与逐条分支各自只碰自己的字段（`item.group` / `item.record`）。
`keyExtractor` 也跟着分支：逐条用 `record.id`，合并用 `definitionId`（同一个事件只有一行）。

### 4.5 定义状态：【+1】的四种处境

```ts
interface RepeatProps {
  onRepeat?: () => void;
  repeatBlockedReason?: string;
  definitionGone?: boolean;
}

const repeatProps = (definitionId: string, onRepeat: () => void): RepeatProps => {
  if (!definitionsLoaded) {
    return {};                                   // 定义还没读到：先不渲染按钮
  }
  const definition = definitions.get(definitionId);
  if (!definition) {
    return { definitionGone: true };              // 定义被永久删除（历史不依赖定义）
  }
  if (definition.isArchived) {
    return { onRepeat, repeatBlockedReason: '已归档' };
  }
  return { onRepeat };
};
```

四种处境互斥，都在这里一处决定：**能记 / 已归档 / 定义已删除 / 还没读到**。
「还没读到」刻意不给按钮：宁可晚一帧出现，也不要先给一个点不动的按钮。

### 4.6 详情页：只读快照 + 底部「更多操作」

`src/app/records/[id].tsx` 的四段：

1. 加载：`new EventRecordRepository(db).getById(id)` → `undefined`（加载中）/ `null`（找不到）；
2. 「这条记录」卡片：**名称、取值、发生时间、录入时间、来源、备注、记录 id**——
   全部来自记录自己的字段与快照，**不查定义**（所以定义改名、归档、被永久删除都不影响这一页）；
3. 「更多操作」卡片：未删除时给「修改这条记录 / 删除这条记录」，已删除时只给「撤销删除」；
4. 修改表单**就地展开在同一张卡片里**（`editing` 状态切换）——点「修改」之后，
   表单出现在手指底下，不用再滚回页首。

> **为什么不是页头右上角的下拉菜单**：这个 App 现在跑在 Expo Go 里，而 Expo Go 的开发菜单
> 浮球正好压在屏幕右上角。实测点那个位置会打开 Expo Go 自己的面板（Maestro 连挂三次）。
> 换成页面底部的卡片之后既躲开了它，也让删除离阅读位置远一点（见 3.6）。

### 4.7 仓储 `update`：三道校验

```ts
async update(id: string, input: EventRecordEditInput): Promise<EventRecord> {
  const targetId = requireId(id, '事件记录 id');
  const occurredAtInput = input.occurredAt;
  const note = optionalText(input.note);

  return guard('修改事件记录', async () => {
    const existing = await this.getById(targetId);
    if (!existing) {
      throw new NotFoundError(`事件记录不存在：${targetId}`);
    }
    if (existing.deletedAt !== undefined) {
      throw new ConflictError('这条记录已被删除，先撤销删除再修改');
    }

    const value = requireRecordValue(existing.kind, input.value);
    const occurredAt = requireNotFuture(
      requireIsoDateTime(occurredAtInput ?? existing.occurredAt, '发生时间'),
      existing.recordedAt,
      '发生时间',
    );

    await this.db.runAsync(
      'UPDATE event_records SET value = ?, note = ?, occurred_at = ? WHERE id = ?',
      value,
      note ?? null,
      occurredAt,
      targetId,
    );
    return this.mustReadOne(targetId);
  });
}
```

三道校验与新增记录**是同一套规则**，不是另写一份：

1. `requireRecordValue(existing.kind, …)`——计数型不接受 0 / 负数，数量型要数字；
2. `requireNotFuture(occurredAt, existing.recordedAt)`——发生时间不能晚于**录入时间**
   （未来还没发生，不构成事实；与补录同一条规则）；
3. 已软删除的记录拒绝修改——先撤销删除再改，免得「改了又躺在回收站里」对不上账。

写完用 `mustReadOne` 重新读一遍返回，界面拿到的就是**库里真实的样子**。
`UPDATE` 只动这四个字段，快照一个字都没碰（3.2）。

> 记录的 `deletedAt` 不在这里改：软删除与恢复有自己的方法（`softDelete` / `restore`），
> 它们是幂等的（[10](./10-backfill-and-undo.md) 3.4）。

**一个已知边界**：`event_records` 没有 `updated_at`（历史不参与时间戳竞争），
所以导入合并对记录**只比较软删除标记**——在 A 机改了取值再导出，导入到一份没改过的 B 库时，
会被「保留本地」挡住。要让编辑也通过备份传播，得给记录加 `updated_at`（迁移 + 合并规则 + 格式），
`HANDOFF.md` 第 10 节把它记成了待评估项，**没有顺手做**。

### 4.8 「不弹确认」在代码里的样子

除了 3.1 里那个 `repeat`，还有两处一起构成这条设计：

- 时间轴**没有** `repeatNotice` / `undoRepeat` 这类 state——`UndoBar` 不再被这个页面引用；
- `RecordRow` 的 【+1】按钮在请求期间变成「+1…」并禁用（`repeating`），
  回来的那一刻按钮复位、列表已经刷新——**反馈来自列表本身**（新记录出现在最上面）。

### 4.9 开关挪到「设置」里：偏好该住在哪一层

时间轴页头原先并排放着「逐条 / 合并」两个胶囊，首页顶到「回收站」旁边。后来把它们**收进
「设置 → 偏好设置」**，和一栏「周期预测窗口」并成一个分组。

三条理由：

1. **页头该回答「这一页是什么」**，不该放会改变页面读法的开关；首页顶着一排胶囊，
   每次扫列表都要先越过它。
2. **设置项集中才好找**。时间轴显示方式、周期预测窗口都是同一类东西（纯展示偏好、都存 `app_meta`），
   散在各自的页面上，使用者记不住「那个开关在哪」。
3. **顺手修正一个错位**：预测窗口本来是**全局**的，早先却挂在某一个周期定义页上——看起来像只改这一个。
   挪进设置之后，语义与位置对上了。

挪动带出两个实现细节，都值得记：

- **必须「聚焦时重读」**。偏好是在**别的页面**改的，时间轴如果只在挂载时读一次 `app_meta`，
  改完切回来不会变（要重启才生效）：

  ```ts
  // src/app/(tabs)/index.tsx
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      new MetaRepository(db)
        .get(META_KEYS.timelineView)
        .then((stored) => {
          if (!cancelled) setViewMode(parseTimelineViewMode(stored));
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [db]),
  );
  ```

- **页头改留一句指路**，并且跟着模式换措辞——合并视图点行是「就地展开」，逐条视图点行才是「看详情」：

  ```tsx
  {viewMode === 'merged'
    ? '点行就地展开逐条，点【+1】按同样的取值再记一条（显示方式可在「设置」里改）'
    : '点行看详情，点【+1】按同样的取值再记一条（显示方式可在「设置」里改）'}
  ```

代价是**端到端流程要跟着走**：02 / 03 要「点行进详情」，默认却是合并（点行是展开），
于是抽了一个子流程 `use-expanded-view.yaml`，先绕到设置里钉成「逐条」再回来。
（第 6 节的验证清单、`09` 的合并断言都据此更新过。）

## 5. 一次完整数据流：点一下【+1】

前提：时间轴「逐条」视图，第一行是「喝水 +1」（`10-22 18:20 · 手动`）。

| 步骤 | 发生了什么 | 代码位置 |
| --- | --- | --- |
| 1 | 手指落在行内【+1】按钮上（**不是**文字区） | `RecordRow` 的 `Button` → `onRepeat` |
| 2 | 时间轴把这一行的 id 记进 `repeatingId`，按钮变「+1…」 | `index.tsx` 的 `repeat` |
| 3 | `EventRecordRepository.record({ definitionId, value, unit, source: 'quick' })` 写库 | 仓储 `record` |
| 4 | 仓储取定义的当前快照写入这条新记录（快照随记录走，与定义此后无关） | `toDefinitionSnapshot` |
| 5 | `.then` 里 `load(false)` 重新读最近 100 条 | `index.tsx` 的 `load` |
| 6 | 列表重排：新记录 `occurredAt = now` 排在最上面 | `FlatList` |
| 7 | `finally` 把 `repeatingId` 清空，按钮回到「+1」 | `RecordRow` |

**没有第 8 步**：没有确认条、没有「是否撤销」的追问。想撤销就点这一行 → 详情页 → 删除。

## 6. 如何验证

```bash
npm run verify           # typecheck + lint + test：28 个套件 / 421 个用例
npm run format:check     # 通过
npx expo export --platform ios   # 通过（js bundle 3.1MB）
```

单测覆盖了纯函数与仓储：

```bash
npm test -- src/features/records     # groupRecords / timelineView / format
npm test -- src/repositories          # 含 EventRecordRepository.update 的六条用例
```

`update` 那六条分别压：改取值与备注且**快照纹丝不动**、省略备注即清空、
改发生时间（含「晚于录入时间」被拒且**没有写坏原值**）、取值仍按类型校验、
已软删除拒绝改（撤销后能改）、不存在的 id 抛 `NotFoundError`。

端到端（真的点，需要先起 Metro）：

```bash
maestro test .maestro/flows       # 11/11 通过，7m36s
```

其中与本篇直接相关的三条：

- `02-timeline-delete-undo.yaml`：点行进详情 → 「更多操作 → 修改这条记录」改发生日期并保存
  （断言来源变成「事后补记的」）→ 删除 → 撤销删除 → 回时间轴那条还在；
- `03-trash-restore-perma.yaml`：从详情页删除 → 回收站恢复 → 再删 → 永久删除（含原生二次确认）；
- `09-timeline-repeat-merge.yaml`：【+1】→ 进那条记录的详情页核对来源是「快捷」→
  到「设置 → 偏好设置」切「合并」→ 回时间轴，点行就地展开「收起」→ 再切回「逐条」。

02 / 03 / 09 开头都先跑子流程 `use-expanded-view.yaml`（去设置里钉成「逐条」），
因为**默认是合并**：合并行点一下是就地展开，不是进详情（见 4.9 节）。

跑完**读库核对**（界面断言会被「文字恰好相同」骗过）：

```bash
sqlite3 "$DB" "select count(*), sum(deleted_at is not null) from event_records;"
sqlite3 "$DB" "select key, value from app_meta;"   # app.timeline_view
```

## 7. 常见问题与排查

### 问题：点【+1】之后「什么都没发生」

**先看**：列表最上面有没有多出一条。新记录的 `occurredAt` 是现在，所以它一定在最上面；
如果当前滚到了列表中间，是看不到变化的。**没有确认条是设计**（3.1）。

**再确认**：按钮是不是一直是「+1…」——那就是请求没回来（写库失败时页面顶部会有「操作失败」卡片）。

### 问题：点行没进详情，反而把行「展开」了

**原因**：默认就是「合并」视图。合并行的一下先用来**就地展开**（副标题会从
「展开逐条」变成「收起」），展开之后再点其中的某一条才是进详情（4.4）。
想一进来就「点行 = 看详情」，去「设置 → 偏好设置 → 时间轴显示」选「逐条」。

### 问题：改了发生日期之后，那条记录在时间轴里找不到了

**原因**：时间轴按 `occurred_at` 倒序。把日期改到很早，它就沉到列表下面去了——
排序是对的，向下滚即可。`02` 流程末尾也是这么处理的。

### 问题：时间轴上怎么没有删除按钮了

**原因**：删除搬进了**记录详情页**（`/records/[id]` 底部「更多操作」）。列表行只留
「信息 + 【+1】」，为的是让最常用的动作不被低频动作挤掉（第 3.1 节）。

### 问题：Maestro 点页头右侧的按钮，结果打开了 Expo Go 的面板

**原因**：Expo Go 的开发菜单浮球压在屏幕右上角（`~[341,60]-[367,86]`），是原生浮层，
压在 RN 视图之上。**别把要点的东西放在页头右侧**（4.6）。
做独立构建时没有这颗浮球，届时可以再评估放回页头。

### 问题：Maestro 里改「预填输入框」的值，删成了半截

**原因**：`eraseText` 是**从光标往回删**。预填的输入框没有 placeholder 可点，`tapOn` 默认
点在元素中心 → 光标落在文本中间 → 只删掉左半边（实测 `2026-10-22` 变成 `2026-01-0122`，
被仓储的日期校验挡下来）。做法是先按「值的形状」点它、再点它右侧 95% 让光标到末尾：

```yaml
- tapOn:
    text: '\d{4}-\d{2}-\d{2}'
    point: 95%, 50%
- eraseText: 20
- inputText: '2026-01-01'
```

## 8. 学习总结与练习

**记住这几条**：

1. **拦住不可逆的，放走可逆的**：永久删除要二次确认（[13](./13-permanent-delete-and-trash.md)），
   【+1】和软删除不要。
2. **快照不可改，事实可更正**：`update` 只收三个字段这件事，是规则在类型上的体现。
3. **同一套校验只写一遍**：`update` 复用 `requireRecordValue` / `requireNotFuture`，
   与新增记录共用规则，不会出现「新建拦得住、改就绕过去」。
4. **纯展示偏好不进业务表**：`app_meta` + 默认值 + 不认识就回退。
5. **偏好住在「设置」里，页面只在聚焦时读**：开关集中一处，别散在各页页头；
   改完切回来要立刻生效，就得每次聚焦重读，不能只在挂载时读一次（4.9）。
6. **派生数据现算**：分组是纯函数，库里不加「组」这张表。
7. **无障碍元素要拆**：文字区与行内按钮分开，读屏与自动化才能各自命中。

**练习**（都能在仓库里做，改完记得跑 `npm run verify`）：

1. 给时间轴加一个「只看某个事件」的筛选：复用 `groupRecordsByDefinition` 的分组键，
   在页面里加一个 Chip（想想它该不该存进 `app_meta`——4.9 节刚挪过一次开关，先想清楚位置）。
2. 给「合并」行加一个「展开后高亮最近一次」的样式：`RecordGroupRow` 的 `children`
   是插槽，`index.tsx` 里已经把逐条交给 `RecordRow` 渲染，从哪里传一个 `first` 标记最省事？
3. 试着给 `update` 加「把发生时间改到未来」的用例并观察仓储抛什么错；
   再想想：如果允许改到未来，哪些地方（统计的「本期」、时间轴的排序）会变得难以解释？