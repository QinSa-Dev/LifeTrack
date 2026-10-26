# 17 自定义字段（标签字段化）

> 这一步解决的问题：v7 之前，「标签」是一个**全局共享的实体**——所有事件定义从同一张 `tags`
> 表里挑标签贴上（多对多）。这看着省事，实际很别扭：标签名是全局唯一的，你没法给「喝水」和
> 「跑步」各用一套自己的分类；标签也没有类型，只能是一个名字。
>
> v7 把「标签」拆掉，换成**每个事件定义自己的一组自定义字段**：字段有名字、有类型
> （单选 / 多选 / 时间点 / 时间段），记录时按字段选值。旧的标签数据不会丢——迁移把它们
> 折成一条叫「标签」的多选字段，历史取值一并搬过来。

相关代码：

- `src/domain/models.ts`：`FieldKind` / `DefinitionField` / `FieldSnapshot` / `FieldValue` 与 `describeFieldValue`
- `src/domain/validation.ts`：`requireFieldKind` / `requireTimeOfDay` / `normalizeFieldInput` / `normalizeFieldValues`
- `src/db/schema.ts`：`MIGRATION_V7_CUSTOM_FIELDS`
- `src/repositories/eventDefinitionRepository.ts` / `eventRecordRepository.ts`：读写字段与取值
- `src/domain/backup.ts`：备份格式 v3 与旧备份折算
- `src/features/definitions/fields.ts` / `src/features/records/FieldValuePicker.tsx`：界面

---

## 1. 领域模型：四种字段类型

`src/domain/models.ts` 里，字段类型是一个联合类型：

```ts
export type FieldKind = 'single' | 'multi' | 'time' | 'range';
```

| 类型 | 含义 | 取值个数 | 有没有候选值 |
| --- | --- | --- | --- |
| `single` | 枚举单选 | 1 | 有 |
| `multi` | 枚举多选 | 若干 | 有 |
| `time` | 时间点，如 `08:30` | 1 | 无 |
| `range` | 时间段，如 `08:30`–`09:15` | 2（开始、结束） | 无 |

「枚举型」由一个小助手判定，校验和界面都靠它分流：

```ts
export function isEnumFieldKind(kind: FieldKind): boolean {
  return kind === 'single' || kind === 'multi';
}
```

定义上的字段带 `sortOrder`（用户排的顺序），记录快照里的字段则不带——快照只保留
「展示与校验需要的东西」（`FieldSnapshot` 没有 `sortOrder`）。

### 1.1 字段与「属性」是两个概念

这是最容易混的地方，代码里也反复强调：

- **属性（`attributes`）**：自由文本、可多条、只描述「这一次是什么」（`杯`、`200ml`、`温水`）。
  应用不做单位换算、不做一致性校验，用户怎么写就怎么显示。`EventDefinition.attributes`
  与 `EventRecord.attributes` 都是 `string[]`。
- **字段（`fields` / `fieldValues`）**：**有类型、要从候选里选值**，记录时按字段收集。

一句话：属性是「你怎么描述」，字段是「你从哪几个选项里选」。两者并存，互不替代。

### 1.2 记录上的取值：`FieldValue`

```ts
export interface FieldValue {
  fieldId: string;
  /** 单选 1 个、多选若干、时间点 1 个、时间段 2 个（开始、结束）；空数组表示这次没选 */
  values: string[];
}
```

用「一个字段一条 `FieldValue`」而不是 `Record<fieldId, string[]>`，是为了**顺序稳定**、
方便落库成 JSON 数组，也方便校验时逐条报错。

展示文本由纯函数 `describeFieldValue(field, value)` 负责：多选用 ` · ` 连接，时间段用 `–` 连接，
空取值返回 `undefined`（界面据此决定要不要渲染这一行）。

---

## 2. 校验：把四种类型的规则拼成一条写库规则

`src/domain/validation.ts` 里，每个类型各有一个原子校验：

```ts
requireFieldKind(value)                       // 只接受 single / multi / time / range
requireTimeOfDay(value, field = '时间')       // 24 小时制 HH:mm（补零）
```

`HH:mm` 用的是定长正则：

```ts
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
```

定长有个好处：**字典序就是时间序**。所以「时间段」的结束不能早于开始时，直接比字符串即可，
不需要把 `08:30` 解析成分钟数。

### 2.1 定义输入：`normalizeFieldInput`

```ts
export function normalizeFieldInput(input: FieldInput): FieldInput {
  const name = requireName(input.name, '字段名称');
  const kind = requireFieldKind(input.kind);
  const options = isEnumFieldKind(kind) ? normalizeTextList(input.options) : [];
  // 枚举型必须至少有一个候选值（时间点 / 时间段则强制清空候选值）
  // ...
}
```

关键点：**枚举型必须至少有一个候选值**，时间点 / 时间段则强制把候选值清空。这样数据库里
不会出现「时间点字段带着一堆没用的候选值」这种自相矛盾的状态。

### 2.2 记录取值：`normalizeFieldValues`

记录一条事实时，取值必须对照**定义上的字段**逐条校验：

```ts
export function normalizeFieldValues(
  fields: readonly FieldLike[],
  inputs: readonly FieldValueInput[],
  options: { dropUnknownFields?: boolean } = {},
): FieldValue[] {
  const dropUnknown = options.dropUnknownFields ?? true;
  // ...
}
```

- 枚举型：每个值都必须在候选值里，否则抛 `ValidationError`；
- 时间点 / 时间段：用 `requireTimeOfDay` 校验格式，时间段还必须**开始与结束两处都填**
  且**结束不早于开始**（值统一去空白、丢掉空串，所以「只填了一半」会被拦下并说清楚）；
- **空取值**：全空不报错，但会被丢掉（不写进库）。
- **不认识的字段 id**：`dropUnknownFields` 默认 `true`（记录路径）→ 直接忽略。
  定义改了、字段删了，旧表单残留的字段不该把整次记录拦下来。

> 为什么默认要「忽略未知字段」？因为记录是高频动作，宁可宽容也别拦人；而**备份导入**
> 走的是另一套（`dropUnknownFields: false`）——导入时数据必须自洽，遇到不认识的字段
> 应当报错而不是默默丢。

---

## 3. 迁移 v7：把标签折成字段，并重建记录表

`MIGRATION_V7_CUSTOM_FIELDS`（`src/db/schema.ts`）是整个特性里最麻烦的一块，因为它要
**在迁移里搬数据**。步骤：

1. **读旧标签**：`tags` 表（id → 名称）+ `event_definition_tags`（定义 → 挂着的标签）。
2. **读记录**：扫一遍 `event_records.snapshot_tag_ids`，收集「记录里出现过」的标签 id。
   为什么要多这一步？因为历史记录的标签可能已经不在定义上了（定义改过、标签删过），
   字段的候选值必须**兜住历史取值**，否则旧记录会指向一个候选值里没有的名字。
3. **造字段**：给「本来有标签」的定义各造一条名为「标签」的 `multi` 字段，
   候选值 = 挂着的标签 ∪ 记录里出现过的标签，按名称排序。
   **只有计数型定义才折**——周期型记的是「哪一天」，不用自定义字段，它的标签随之丢弃。
4. **重建 `event_records`**：`snapshot_tag_ids` 换成 `snapshot_fields` + `field_values`。
   做法是标准的「建新表 → 逐行搬 → 删旧表 → 改名 → 重建索引」：

   ```sql
   CREATE TABLE event_records_new ( ... snapshot_fields TEXT NOT NULL DEFAULT '[]',
                                        field_values    TEXT NOT NULL DEFAULT '[]' );
   -- 逐行 INSERT ... SELECT，把每行的快照标签值算成字段取值
   DROP TABLE event_records;
   ALTER TABLE event_records_new RENAME TO event_records;
   CREATE INDEX idx_event_records_occurred_at ON event_records(occurred_at DESC);
   CREATE INDEX idx_event_records_definition_id ON event_records(definition_id);
   ```

5. **删表**：先删子表 `event_definition_tags`，再删 `tags`（顺序反了会被外键挡住）。

两个容易踩的坑，代码里都有注释：

- **SQLite 不能 `DROP COLUMN` 掉一个还要重建索引的表**，所以走「重建表」而不是改列；
- 迁移里用的 id 由 `migrationUuid()` 生成（不依赖会演进的业务代码），
  折出来的字段 id 与「定义 id + 名称」解耦，迁移自己自洽。

---

## 4. 备份格式 v3：旧备份也要折成字段

数据库迁移解决「本机旧库」，但用户手里可能还有**旧版本导出的 JSON**。这两件事的规则必须
对得上，否则「从备份恢复」会绕过迁移的折算逻辑。

`src/domain/backup.ts` 里：

- 备份格式版本升到 `BACKUP_FORMAT_VERSION = 3`，`BackupData` 里不再有 `tags` 集合；
- 解析上下文 `ParseContext` 记下 `foldTags`（`formatVersion < 3` 时为真）；
- `parseDefinition`：计数型定义若带 `tagIds`，用 `foldTagField` 折出「标签」多选字段，
  并登记到 `context.legacyTagFields`；
- `parseRecord`：定义先于记录解析，记录据此把 `tagIds` / `snapshot.tagIds` 折成同一条
  字段的取值（`snapshotFields` / `fieldValues`）。

**一份备份要么是 v3（有 `fields`），要么是 v2 及以前（有 `tagIds`）**，两者不混。
v2 记录里 `row.tagIds` 与 `snapshot.tagIds` 必须一致，不一致就直接报错——文件被改坏了。

完整性校验也从「标签引用是否存在」改成 `assertBackupIntegrity` 里的三条：

1. 同一份备份里字段 id 不重复；
2. 每条记录的 `fieldValues` 都能在 `snapshot.fields` 里找到对应字段（快照自洽）；
3. 周期型定义不带字段。

---

## 5. 界面

- **编辑事件**（`src/features/definitions/EventDefinitionForm.tsx`）：计数型定义多一个「自定义字段」
  卡片，可以增删字段、改名、选类型、编候选值。周期型不显示这块。
- **字段类型文案**（`src/features/definitions/fields.ts`）：类型标签与输入提示集中在这里，
  表单与详情页共用，避免两处措辞不一致。
- **记录取值**（`src/features/records/FieldValuePicker.tsx`）：按字段类型渲染不同控件——
  单选用一排 chip、多选可多选、时间点 / 时间段用时间输入。
- **记录详情 / 时间轴 / CSV 导出**：都用 `describeFieldValue` 把取值拼成一行文本，
  导出到 CSV 时对应「字段值」这一列。

---

## 6. 怎么验证

已经**真跑过**的：

```bash
npm run typecheck     # 通过
npm run lint          # 通过（0 error / 0 warning）
npm test              # 26 个套件 / 460 个用例通过
npm run format:check  # 通过
```

测试里覆盖了：

- 迁移 v7：标签表被删、新字段表就位、`event_records` 带上 `snapshot_fields` / `field_values`；
- **从 v6 库升级**：计数型定义的标签折成「标签」多选字段、历史取值一并搬来、
  周期型的标签被丢弃、`PRAGMA foreign_key_check` 无异常、没有 `_old` / `_new` 残留；
- 仓库层：记录时把字段定义与取值固化成快照，改定义后历史不变；
- 取值校验：候选之外的枚举值、非法时间点都被拒绝，且**一条记录都不会落库**；
- 备份：v2 备份里的标签折成字段、v3 的字段 / 取值原样往返、字段快照不自洽就报错。

**没跑过**的（与本仓库既有的技术债一致，别当它验证过）：

- 真机 / Android 上的表现（一直没在真机上跑过）；
- 界面层没有组件测试，字段编辑与取值控件只有类型检查与人工确认兜底；
- Maestro 端到端流程没有为本特性新增用例。

---

## 7. 动手练习

1. 打开 `src/domain/validation.ts`，看 `requireFieldAssignment` 的 `range` 分支：
   它已经用字符串比较拦住了「结束早于开始」。想一想为什么这里直接比字符串就够用，
   如果把时间写成 `8:30`（没补零）会怎样。
2. 在 `MIGRATION_V7_CUSTOM_FIELDS` 里，如果把第 2 步「扫一遍记录收集历史标签」删掉，
   会发生什么？找一条具体的旧记录说明它的后果。
3. 想一想：为什么记录路径默认 `dropUnknownFields: true`，而备份导入用 `false`？
   如果两边反过来会怎样？
4. 读 `assertBackupIntegrity`，构造一份「字段 id 重复」的备份，验证它确实被拒。