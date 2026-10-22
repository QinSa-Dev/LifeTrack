# 15 在模拟器里真手点：Maestro 端到端流程

> 对应工作：**补上「写入路径没人点过」这个缺口**——用 Maestro 在 iOS 模拟器上真的点击应用，
> 点记录、删除并撤销、回收站恢复/永久删除、导出分享面板、周期边界预演、统计对比切换。
> 本文以仓库真实文件（`.maestro/`）与真实运行结果为依据。跑不到的部分会明确写出来。

## 1. 本次完成什么

在此之前，`HANDOFF.md` 第 8 节里有一串「❌ 写入路径没有真手点过」：单元测试把仓储和纯函数
都盖住了，但**「点一下记录到底会不会写进库」这件事，只有推理，没有证据**。原因是本机没有可用的
自动化点击（模拟器没给辅助功能权限，`osascript` 会被 TCC 挡）。

这一项把那一串 ❌ 变成 ✅（有边界的 ✅，见第 6 节）：

| 能力 | 说明 |
| --- | --- |
| 7 条流程 | `.maestro/flows/00`–`06`，覆盖冒烟 + 6 条写入/交互路径 |
| 1 条子流程 | `.maestro/subflows/record-once.yaml`：确保「Maestro 喝水」定义存在并记一次 |
| 自产自销 | 写路径的流程只动自己造的数据；唯一的真删删的也是它自己刚建的那条 |
| 可重复跑 | 每条流程先 `launchApp: stopApp: true` + `openLink` 归一化，互不依赖 |
| 断言之外的核对 | 除了界面断言，还会**直接读模拟器里的 `lifetrack.db`** 核对结果 |

## 2. 改了哪些文件

| 文件 | 作用 |
| --- | --- |
| `.maestro/flows/00-smoke.yaml` | 冒烟：打开五个标签页都能渲染真实数据 |
| `.maestro/flows/01-record-event.yaml` | 事件页 →（必要时新建定义）→ 记录页「记录」→ 时间轴可见 |
| `.maestro/flows/02-timeline-delete-undo.yaml` | 时间轴「删除」→「已删除：…」→「撤销」 |
| `.maestro/flows/03-trash-restore-perma.yaml` | 回收站「恢复」；再删 →「永久删除」+ 原生二次确认 |
| `.maestro/flows/04-backup-export.yaml` | 设置页「导出 JSON 备份」→ 系统分享面板出现 → 关闭 |
| `.maestro/flows/05-cycle-boundary-preview.yaml` | 开周期 → 记一天 → 把结束日改到那天之前 → 黄色越界预演 → 保存被拒 |
| `.maestro/flows/06-stats-comparison.yaml` | 统计页「较前一段 / 较上年同期」切换 |
| `.maestro/subflows/record-once.yaml` | 被 01 / 03 用 `runFlow` 调用的共用片段 |
| `.maestro/README.md` | 跑法、前置条件、约定（尤其「**不许** `clearState`」） |

**没有改动任何 `src/` 下的代码**——这一项只加测试资产与文档。

## 3. 相关技术概念

### 3.1 为什么是 Maestro，而不是坐标点击

「让 agent 点模拟器」有两条路：

| 路线 | 代价 |
| --- | --- |
| `osascript` / `cliclick` 点坐标 | 需要把**宿主 App** 加进「系统设置 → 隐私与安全性 → 辅助功能」，否则报 `execution error: "osascript" 不允许辅助访问。(-1728)`；而且窗口一挪就点错 |
| **Maestro** | 在模拟器里装自己的 XCTest driver 驱动界面（`maestro` 官方 iOS driver），**不需要辅助功能权限**；按文字/id 找元素，不靠坐标 |

选后者。代价是它自己是一套新工具（要装、要学选择器语义）。

### 3.2 它怎么找到元素：可访问性文字（accessibilityText）

iOS 上 Maestro 读的是元素的 **accessibility 文字**，对 React Native 来说就是 `Text` 的内容、
以及被标成单个可访问元素的容器文字。所以：

- 断言/点击的目标必须是**屏幕上真实存在的文字**（不是代码里的变量名）；
- 想用一个元素的文字做锚点时，先 `maestro hierarchy` 看它到底被暴露成什么。

### 3.3 匹配是**全文匹配**，部分匹配要自己写 `.*`

这是本项踩的第一个坑。`assertVisible: '时间轴'` 能过，是因为页面头部标题恰好就是「时间轴」；
但底部标签栏的文字是 **`时间轴, tab, 1 of 5`**（Maestro 帮忙拼了「第几个 tab」），
所以 `tapOn: '事件'` **找不到任何东西**。

规矩：**默认按正则全文匹配**；要用片段就显式写 `.*事件, tab.*`。

### 3.4 列表行的文字会被**合并成一个**元素

- 时间轴的 `RecordRow`（不可点）把标题、取值、时间、删除按钮暴露成**分开**的多个元素；
- 事件页/周期页的 `ListRow`（可点）会被合并成**一条**，例如
  `Maestro喝水, 未分组 · 计数, 计数`。

所以点「事件列表里的某个定义」要写 `.*Maestro喝水.*`，不能写 `Maestro喝水`（全文匹配不上）。

### 3.5 键盘：`hideKeyboard` 在中文输入法下会失败

`hideKeyboard` 报
`Couldn't hide the keyboard. This can happen if the app uses a custom input or doesn't expose a standard dismiss action.`
改用 **`pressKey: Enter`**：单行 `TextInput` 回车即失焦（RN 默认 `blurOnSubmit`），键盘跟着收起。

另外**数字键盘（`keyboardType="number-pad"`）没有回车键**，`pressKey: Enter` 也救不了。
所以流程里刻意**不填**「平均周期长度」这个可选字段（`CycleDefinitionForm.tsx` 里它是 number-pad）。

### 3.6 Expo Go 里「重新打开」不等于「重新加载」

`openLink: exp://127.0.0.1:8081` 在同一个项目上只是把 App bring 到前台，**不会重载 JS**、
更不会回到根路由。上一次跑完停在回收站，下一次就还停在回收站（于是断言「时间轴」失败）。

归一化的写法是**先杀再开**：

```yaml
- launchApp:
    stopApp: true          # 杀掉 Expo Go（不清数据）
- openLink: exp://127.0.0.1:8081
- extendedWaitUntil:
    visible: '时间轴, tab, 1 of 5'   # 用标签栏文字当锚点，确认真的落在根页面
    timeout: 120000
```

**绝对不要用 `launchApp: clearState: true`**：在 Expo Go 里这个 App 就是 Expo Go 自己，
`clearState` 会清空容器——**包括本项目的 SQLite 库**。

### 3.7 原生弹窗是**独立的 window**，用相对选择器消歧

回收站「永久删除」会弹 `Alert`，弹窗里的确认按钮文字**和列表行里的按钮一模一样**（都叫「永久删除」）。
按文字点会撞车（弹窗在视图树里排在列表之后）。

解法是**相对选择器**：弹窗正文里有「无法恢复」，确认按钮在它**下面**，而列表行的按钮不在它下面。

```yaml
- tapOn:
    text: '永久删除'
    below:
      text: '.*无法恢复.*'
```

（`below` / `above` / `leftOf` / `rightOf` 是 Maestro 的几何相对选择器，iOS 上可用。）

### 3.8 点击落在**标签栏**上：先滚动再点

统计页的对比 `Chip` 在页面最底部，紧贴标签栏。**不滚动就点，坐标会落到标签栏上**，
于是「点了对比」的结果是**跳到了时间轴**（本项踩过的第二个坑：断言「概览」失败，dump 出来是时间轴）。

所以流程里先 `scrollUntilVisible` 到它下面那行「对照窗口：…」，让 `Chip` 完整露出来再点。

### 3.9 断言之外，还要**直接读库**核对

界面断言会被「元素文字恰好相同」骗过（比如回收站那步）。真正的证据在库里：

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun simctl get_app_container booted host.exp.Exponent data
# → …/Documents/ExponentExperienceData/@anonymous/lifetrack-<uuid>/SQLite/lifetrack.db
```

```bash
sqlite3 lifetrack.db "select count(*), sum(deleted_at is not null) from event_records;"
```

这就是「点记录到底有没有写进库」的最终答案（第 6 节有真实数字）。

## 4. 关键片段逐条解释

### 4.1 子流程：自己造数据，不依赖手工数据

`subflows/record-once.yaml` 先判断「Maestro 喝水」在不在，不在就新建（`runFlow` + `when`），
然后点进去记一次：

```yaml
- runFlow:
    when:
      notVisible: '.*Maestro喝水.*'
    commands:
      - tapOn: '+ 新建事件'
      - tapOn: '例如：喝水'
      - inputText: 'Maestro喝水'
      - pressKey: Enter
      - scrollUntilVisible:
          element:
            text: '创建'
          direction: DOWN
      - tapOn: '创建'
```

三个细节：**`inputText` 的中文能直接打进去**（不用换 ASCII）；提交按钮在表单最底部，
要先 `scrollUntilVisible`；键盘要先收起来，否则点击会打在键盘上。

> 名字统一带 `Maestro` 前缀，跑完一眼就能认出「这是测试造的」。

### 4.2 记录一次：默认值就够，不需要敲数量

记录页的「手动记录」数量框默认就是 `1`，而且它**没有 placeholder**（无法用文字定位）。
流程直接用默认值，只点「记录」，然后断言顶部提示：

```yaml
- tapOn: '记录'
- assertVisible: '.*已记录：.*'
```

### 4.3 删除 → 撤销：软删除是可以反悔的

```yaml
- tapOn:
    text: '删除'
    index: 0        # 时间轴第一行 = 最新那条
- assertVisible: '.*已删除：.*'
- tapOn: '撤销'
- assertNotVisible: '.*已删除：.*'
```

`index: 0` 是 Maestro 的同名元素消歧手段（这里有多行「删除」按钮）。
这条流程**净值 0**：删的是最新一条，随即又恢复，不动库。

### 4.4 回收站：恢复与真删都验，且只动自己那条

回收站按 `deleted_at DESC` 排序，所以「第一条」就是刚删的那条（自己的）。
流程：记一条 → 删 → 回收站「恢复」→ 时间轴能看到 → 再删 →「永久删除」→
原生二次确认（用 `below` 定位）→ 结束后回收站里**只剩用户自己原来那条**。

### 4.5 导出：面板上的文字是「保存到“文件”」

iOS 26 的系统分享面板里那颗按钮叫 **`保存到“文件”`**（带弯引号），不是「存储到文件」；
面板自带的关闭按钮在可访问性上叫 **`dismiss popup`**。断言和关闭都按这两条写。

> 这一条还顺带证明了**备份文件真的写出来了**：面板上显示文件名
> `lifetrack-backup-2026-10-22` 与 `JSON · 19 KB`。没写出来面板不会弹。

### 4.6 周期：先「记进去」，再制造「越界」

```yaml
- tapOn: '保存记录'          # 今天这条落在区间内 → 存得进
- tapOn: '2026-10-05'        # 把结束日改到 2026-10-05（今天在其后）
- assertVisible: '.*落在区间外.*'   # 黄色预演立刻出现
- tapOn: '保存边界'
- assertVisible: '.*落在新边界之外.*'  # 仓储拒绝，原因原样显示
- assertVisible: '.*已取消修改.*'
```

这条是**「新功能也要能真手点通」**的回归：既验证界面**保存前**本地算出的预演，
也验证仓储**保存时**真的拒绝（不静默删记录）。

### 4.7 统计：切 Chip 之后看「对照窗口」和「说法」

先滚到「对照窗口：…」那行，再点 `较前一段` / `较上年同期`，断言窗口行与结论文案存在。
真跑出来的结论行是：

> 本期 17 条，上年同期没有记录，**无法算变化率**；对照窗口：**2025-10-10 ~ 2025-10-23**（本期 2026-10-09 ~ 2026-10-22）

346 → 少一天的那处偏移正是 **52 周（364 天）** 对齐的效果（星期几与周桶都对得上），
而「对照期为空时不给百分比」这条纪律也在界面上得到确认。

## 5. 一次完整数据流：跑一遍 03，然后看库

1. `maestro test .maestro/flows/03-trash-restore-perma.yaml`
2. 流程在事件页确保「Maestro 喝水」存在 → 记录页点「记录」→ 库里**多一条**未删除记录；
3. 回时间轴 → 点第一行「删除」→ 该行 `deleted_at` 被写上（软删除）；
4. 进回收站 → 点「恢复」→ `deleted_at` 被清空（记录回到时间轴）；
5. 再点「删除」→ 进回收站 → 点「永久删除」→ 弹窗确认 → **整行从表里消失**；
6. 读库核对：总行数**与跑之前一致**（+1 −1），`deleted_at is not null` 的仍然是用户原来那 1 条。

## 6. 如何验证

### 关键命令

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$HOME/.maestro/bin:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

npx expo start                     # 另开一个终端：Metro 要一直在跑
maestro test .maestro/flows        # 跑全部
maestro test .maestro/flows/00-smoke.yaml
maestro hierarchy                  # 排错：打印当前屏幕的视图树
```

### 真实跑过的结果

```
[Passed] 00 冒烟 · 打开 App 并走一遍五个标签页 (14s)
[Passed] 01 记录一次事件（自建定义 → 手动记录 → 时间轴可见） (18s)
[Passed] 02 时间轴 · 删除 → 撤销 (8s)
[Passed] 03 回收站 · 恢复 + 永久删除（自产自销） (30s)
[Passed] 04 设置 · 导出 JSON 备份 → 系统分享面板 (10s)
[Passed] 05 周期 · 边界预演 + 越界保存被拒 (39s)
[Passed] 06 统计 · 环比 / 同比切换 (12s)
7/7 Flows Passed in 2m 12s
```

跑完的库核对（跑之前 17 条 / 1 条软删 → 跑之后 18 条 / 1 条软删，
多出来的是 01 那条新记录；03 那条记了又真删，净值 0）：

| 检查 | 结果 |
| --- | --- |
| 软删条数 | 仍是 **1**，且是用户自己那条（`喝水`，10-18）——**我的真删只删了自己造的** |
| 回收站内容 | 只有用户那条 `喝水`，没有 `Maestro*` 残留 |
| 周期 | 用户 `月经` 的 2 段 + 4 条每日记录**未被动过** |
| 越界保存被拒之后 | `Maestro周期` 那条 `2026-10-22` 的每日记录**还在**（拒绝没有删数据） |

### 没覆盖什么（诚实记录）

- **Android 与真机没跑**；只在 iPhone 16e / iOS 26.3 / Expo Go 58.0.5 上跑过。
- **「选文件导入」没覆盖**：系统文件选择器是另一个 App 的 UI，本项只走到分享面板就关掉了。
  「导出 → 存到「文件」→ 再选回来导入」这条完整链路仍属未验证。
- **周期流程有日期前提**：`05` 要求运行日期晚于 `2026-10-05`（写这段时是 `2026-10-22`）。
- **数据是累加的**：`01` 每跑一次多一条记录，`05` 每跑一天多一条每日记录；跑多了会出现
  `Maestro…` 开头的定义与记录，可以在 App 里删掉。
- **`03` 的真删只删自己刚建的那条**，不代表「用户数据被永久删除」这条路径被覆盖过。

## 7. 常见问题与排查

### 问题：`Element not found: Text matching regex: 事件`

底部标签栏的文字是 `事件, tab, 3 of 5`，全文匹配不上。用 `.*事件, tab.*`。

### 问题：明明屏幕上看得见，断言却说不可见

三个常见原因：① 部分匹配没写 `.*`；② 元素在**折叠线以下**（要 `scrollUntilVisible`）；
③ 列表行文字被**合并**成了一条长字符串（用 `.*` 包住你认识的那段）。

### 问题：点击「点了没反应」，或者跳到了别的页面

点击打在**键盘**或**标签栏**上了。前者用 `pressKey: Enter` 收键盘；
后者先 `scrollUntilVisible` 把目标滚进安全区再点。

### 问题：`maestro hierarchy` 报 `unable to find utility "simctl"`

本机 `xcode-select -p` 指向 `/Library/Developer/CommandLineTools`。加上
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`，或一次性
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`。

### 问题：跑完库里的数据变多了，是不是把我数据弄坏了

流程只**新增**自己造的 `Maestro*` 数据；`02` / `03` 净值 0。真删那一步删的也是它自己刚建的那条。
要清理就在 App 里删掉 `Maestro*` 定义/记录。**别用 `clearState` 清库**（会连库一起清掉）。

## 8. 学习总结与练习

这一项学到的东西，超出「写 YAML」：

- **可访问性文字就是测试的接口**。元素没有稳定的文字/id，自动化就只能靠坐标——而坐标最脆。
  写界面时顺手把文字写清楚，测试成本会低一个量级。
- **断言要挑「只有这里才有」的文字**。同名按钮（列表里的「永久删除」vs 弹窗里的「永久删除」）
  必须用相对选择器或作用域消歧，否则断言会骗人。
- **界面断言 + 直接读库**才是完整证据链：前者证明「用户看到的」，后者证明「真的落盘了」。
- **测试要自产自销、可重复跑**：不依赖手工数据、不用 `clearState`、跑完净值 0。

练习：

1. 给 `03` 补一条**反向断言**：真删之后，断言回收站里那条 `Maestro喝水` 真的不在了，
   再读库确认总行数减一（把「界面 + 库」两条证据写在同一条流程的注释里）。
2. 把「导入」也接上：先用 `04` 导出一份备份，再写一条流程打开文件选择器选中它
   （提示：这需要跨 App 操作，先想清楚断言什么、以及怎么不污染用户数据）。
3. 用 `maestro studio` 打开记录页，看看「补录」开关打开后多了哪些元素，
   给它写一条「补录过去时间」的流程（注意 `requireNotFuture` 的边界）。