# .maestro —— 在模拟器里真手点一遍

这里的 YAML 是 [Maestro](https://maestro.mobile.dev) 的流程文件，用来在 iOS 模拟器上
**真的点击 App**：点记录、点行进记录详情、改 / 删 / 撤销、回收站真删、导出、周期边界预演、
统计对比、周期内记录的软删除与回收站、周期月视图选日期与症状统计、时间轴的【+1】与
「逐条 / 合并」开关、周期预测窗口与重叠预演。**「选文件导入」**（要跨到系统文件选择器）是
`import/` 下的手工两段式，见下文「选文件导入」一节。

它补的是 `HANDOFF.md` 第 8 节里那一串「❌ 写入路径没有真手点过」——
这些路径原先只有单元测试覆盖。走读版说明见 `docs/learning/15-maestro-e2e.md`。

> **v6 起没有「周期」标签页了**：周期是事件的一种类型，底部只剩四个标签
> （时间轴 / 统计 / 事件 / 设置）。`05` / `07` / `08` / `10` 造周期数据时都改成：
> 进「事件」页 →「新建事件」→ 填名字 → 类型点「周期（有开始与结束）」→ 创建，
> 再从列表点进去（行上带「周期」徽标）。

## 为什么用 Maestro

- **不需要给终端开 macOS「辅助功能」权限**。Maestro 在模拟器里装自己的 XCTest driver
  来驱动界面（`osascript` / `cliclick` 那条路会被 TCC 挡住，见下）。
- 按**文字 / id** 找元素，不靠坐标；窗口位置、缩放变了也不会错位。
- 自带 `maestro hierarchy`（打印当前屏幕的视图树）与 `maestro studio`（可视化点选），排错方便。

> 另一条路（`osascript` 点坐标 / `cliclick`）需要把**宿主 App** 加进
> 「系统设置 → 隐私与安全性 → 辅助功能」，否则会报
> `execution error: "osascript" 不允许辅助访问。(-1728)`。Maestro 不需要这一步，
> 所以选它。

## 前置条件

1. Xcode 已装、模拟器已启动一个设备（本项目实测：iPhone 16e / iOS 26.3）。
2. Expo Go 已装在这个模拟器上（bundle id `host.exp.Exponent`）。
3. **Metro 在跑**（要一直在跑，流程里 `openLink` 指的就是它）：
   ```bash
   npx expo start          # 等它打印出 http://localhost:8081
   ```
   注意：用 `CI=1 npx expo start` 起的话热重载是关的，跑测试时反而更稳；
   但要改 App 代码后再测，记得重启 Metro。
4. Maestro 已装（本机装在 `~/.maestro`）。本机 `brew tap mobile-dev-inc/tap` 走不通
   （拉 GitHub 超时），改用手动下载官方 release zip：

   ```bash
   # 走本机代理下载，解开后把 bin/ 与 lib/ 放到 ~/.maestro
   curl -x http://127.0.0.1:7890 -L -o /tmp/maestro.zip \
     https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.11.0/maestro.zip
   ```

   **zip 里不含 JDK**，所以调用时要指一个 Java 17：

   ```bash
   export JAVA_HOME=/opt/homebrew/opt/openjdk@17   # brew install openjdk@17（keg-only，不进 PATH）
   export PATH="$HOME/.maestro/bin:$PATH"
   maestro --version     # 2.11.0
   ```

### 本机的一个坑：`xcrun simctl` 找不到

本机 `xcode-select -p` 指向 `/Library/Developer/CommandLineTools`，所以裸跑
`xcrun simctl …` 会报 `unable to find utility "simctl"`（Metro 启动时那句
`Unable to run simctl` 就是这个原因；Maestro 内部也会用到它）。两种修法：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer   # 一次性
# 或者只对当前命令生效：
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

## 怎么跑

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$HOME/.maestro/bin:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

maestro test .maestro/flows                 # 跑全部（约 6.5 分钟）
maestro test .maestro/flows/00-smoke.yaml   # 只跑一个
maestro test --include-tags smoke .maestro/flows
maestro hierarchy                           # 排错：打印当前屏幕的视图树
maestro studio                              # 交互式：点着看哪个选择器能命中
```

**只跑 `.maestro/flows`**：`subflows/` 里的文件是被 `runFlow` 引用的片段，单独跑没有意义。

截图落在 `~/.maestro/tests/<时间戳>/<流程名>/takeScreenshot/`（`takeScreenshot` 只接受
**相对**文件名，写绝对路径会 FAILED）。

## 约定（重要）

- **`appId` 一律是 `host.exp.Exponent`**（Expo Go），因为本项目在 Expo Go 里跑，
  没有自己的 bundle id。
- **不要用 `launchApp: clearState: true`**。在 Expo Go 里这个 App 就是 Expo Go 自己，
  `clearState` 会把 Expo Go 容器清空——**包括本项目存在容器里的 SQLite 数据库**。
  想清库请显式删记录，别用敲门砖。
- 每条流程开头都做同一套归一化：**先杀再开**
  （`launchApp: {stopApp: true}` → `openLink: exp://127.0.0.1:8081` → 等 `时间轴, tab, 1 of 4`）。
  因为 Expo Go 里 `openLink` **不重载 JS**，上一次停在二级页面就会一直停在那里；
  `stopApp` 只是杀进程，**不清数据**。
- **写路径的流程自产自销**：自己先记一条再删，不去动你手工留下的数据
  （唯一例外：永久删除那一步删的是它自己刚建的那条）。
- 数据是**累加**的：`01` 每跑一次多一条记录、`09` 每跑一次多两条（自己记一条 + 【+1】一条）、
  `05` 每跑一天多一条每日记录，会多出「Maestro…」开头的事件（含周期型）定义。`07` 复用 `05`
  建的那个「Maestro周期」，自己造的那条每日记录在流程末尾被真删，所以不累加。这些都是
  正常的，可以在 App 里删掉（收尾 SQL 见下文）。
- **新装应用多出一条内置事件「喝水」**（只在数据库刚新建时写入，见 `docs/learning/08` 第 12 节）。
  模拟器上跑流程时库早就存在，所以**看不到它**；万一哪天在全新环境跑，事件页会多这一行——
  `00` 的空状态断言都是针对**记录**的（时间轴的「还没有任何记录」、统计的「还没有可统计的数据」），
  不会因为多一条**没有记录**的定义而失败。
- **纯展示偏好会被流程改掉**：时间轴的「逐条 / 合并」存在 `app_meta`（`app.timeline_view`），
  **默认是「合并」**，上一次跑停在哪就是哪。所以碰行的流程（`02` / `03` / `09`）开头都先用子流程
  `use-expanded-view.yaml` 绕到「设置 → 偏好设置」把它钉成「逐条」——合并视图里点一下行是
  **就地展开**，不是进详情。周期预测窗口（`app.prediction_window`）也在同一张卡片里，`10` 会动它。

### 选择器与导航上的几个坑（都是踩过的）

1. **匹配是全文匹配**：底部标签栏的文字是 `事件, tab, 3 of 4`，所以
   `tapOn: '事件'` 找不到；要写 `.*事件, tab.*`。部分匹配一律自己写 `.*`。
2. **可点的列表行会把行内文字并成一个元素**：事件页的行暴露成
   `Maestro喝水, 计数`（标题 + 副标题；**列表不写「未分组」，计数型行右侧的【+1】是另一个元素、
   名字就叫 `+1`**），所以要用 `.*Maestro喝水.*`。
   更麻烦的是**行内按钮也会被并进去**：周期实例页的每日记录行曾是
   `2026-10-22, （无内容）, 删除`——「删除」不是一个独立元素，点不到（读屏同理）。
   修法是让「文字区」自己当无障碍元素、整行不做无障碍元素（`src/components/ListRow.tsx`）；
   改完之后行内按钮都能单独命中，不需要坐标或相对定位。
3. **同名按钮要消歧**，两种办法，优先第一种：
   - **让文案本身不重名**：回收站列表里的按钮叫「永久删除」，弹窗里的确认按钮就叫
     「彻底删除」（`src/app/records/deleted.tsx`）。全文匹配下「彻底删除」全局只有一个，
     选择器不用绕；读屏也能分清哪一步是不可逆的那一步。
   - **相对选择器**：回收站现在有「已删除的记录」与「已删除的周期记录」两个区，
     两区各有一个「恢复」/「永久删除」按钮，用 `below` 指到区标题下：

     ```yaml
     - tapOn:
         text: '恢复'
         below:
           text: '已删除的周期记录'
     ```

   `below` 的判定是「元素在参照物的下方」（按顶边比较），**不是**「最近的那个」，
   所以参照物要选得比目标更靠上、而且唯一——否则会点到别的同名按钮
   （`07` 第一次跑就是这么挂在最后一步的）。
4. **页头也会滚出屏幕**：「返回」在 `Screen scroll` 的滚动内容里，不是固定页头。
   页面一长（周期实例页加了月视图之后尤其明显），滚到下面再 `tapOn: '返回'` 就会
   报 `Element not found`。做法是点之前先把它滚回视野：

   ```yaml
   - scrollUntilVisible:
       element:
         text: '返回'
       direction: UP
   - tapOn: '返回'
   ```

5. **屏幕右上角被 Expo Go 的开发菜单浮球占着**：那颗蓝色齿轮是 Expo Go 的（原生浮层，
   压在所有 RN 视图之上，实测位置约 `[341,60]-[367,86]`），点过去会打开 Expo Go 自己的
   面板而不是你的按钮——`03` 一开始的三次失败全是因为它（当时「更多」菜单按钮放在页头右侧）。
   **别把要点的东西放在页头右侧**；记录详情页的「修改 / 删除」就因此改成了页面底部的
   「更多操作」卡片。（做正式构建 / 独立 App 时没有这颗浮球，但现在项目跑在 Expo Go 里。）
6. **行点下去是什么，取决于当前视图**：逐条视图点行 = 进记录详情页；合并视图点行 =
   就地展开成逐条（副标题从「展开逐条」变「收起」）。**默认是合并**，所以流程要么先用
   子流程 `use-expanded-view.yaml` 钉住「逐条」，要么就按合并的行为断言（`09` 两种都走了一遍）——
   点之前先想清楚此刻是哪种视图。
7. **有的断言写的就是提示文案**：`02` 断言的两句（记录详情页的「记录当时的样子」、
   修改表单的「只改取值 / 时间 / 备注」）是**卡片副标题**，而提示文案是按 `README` 领域规则 20
   一直在精简的——改提示就要一起改这里的断言（最近一次改动见 `docs/learning/08` 第 13 节）。
   更稳的写法是断言**卡片标题或按钮**，但要记住 `assertVisible` 要求元素**真的在屏幕上**：
   长表单里的按钮常在折叠线以下，得先 `scrollUntilVisible`。
8. **「事件」页的「分组」按钮是就地展开、不是跳页**：点它展开一张分组管理卡
   （新建 / 改名 / 删除），按钮文案同时变成「收起分组」，再点收起。
   **没有单独的分组页了**（`src/app/groups.tsx` 已删除，见 `docs/learning/08` 第 14 节）。
   注意 `分组` 这个词在定义表单里也是卡片标题——**全文匹配**下别只写 `分组` 就点，
   要落到具体的按钮文案上。目前没有流程碰它。

### 键盘与遮挡

- 这个 App 的输入框上，**`hideKeyboard` 会失败**（中文输入法）→ 用 `pressKey: Enter`
  （单行输入回车即失焦）。
- **有预填值的输入框没有 placeholder 可点**（记录详情页的「修改」表单就是预填的）：
  按**值的形状**点它（`tapOn: '\d{4}-\d{2}-\d{2}'` 命中日期框；详情里的时间串是
  「2026-10-22 18:20」，整串不匹配，所以不会点错），并且`point: 95%, 50%` 点在它右侧、
  让光标落到文本末尾——**`eraseText` 是往回删字符**，光标停在中间就会删成半截
  （踩过：`2026-10-22` 变成 `2026-01-0122`，被仓储的日期校验挡下来）。
- `number-pad`（如周期型事件的「平均周期长度」）**没有回车键**，所以流程干脆不填那个可选字段。
- 提交按钮常在表单最底部 → 先 `scrollUntilVisible` 再点；
- 页面顶部的提示条（`已保存…`）在滚下来之后看不见 → 断言前先 `scrollUntilVisible` 方向 `UP` 滚回去。
- 统计页的对比 `Chip` 紧贴标签栏，**不滚就点会点到标签栏**（于是跳到时间轴）→ 先滚到
  「对照窗口：…」那行再点。

## 流程清单

| 流程 | 覆盖的路径 | 真实结果 |
| --- | --- | --- |
| `00-smoke.yaml` | 打开 App → 四个标签页都能渲染（时间轴 / 统计 / 事件 / 设置），「新建事件」里同时有计数与周期两种类型 | ✅ 21s |
| `01-record-event.yaml` | 事件页 →（必要时新建定义）→ 记录页「记录」→ 时间轴能看到这条记录 | ✅ 25s |
| `02-timeline-delete-undo.yaml` | 时间轴点行进**记录详情页** → 「更多操作 → 修改这条记录」（改发生日期、保存）→ 「删除这条记录」→「撤销删除」→ 回时间轴那条还在 | ✅ 39s |
| `03-trash-restore-perma.yaml` | 进详情页删除 → 回收站「恢复」；再删 →「永久删除」+ 原生二次确认（净值 0） | ✅ 37s |
| `04-backup-export.yaml` | 设置页「导出 JSON 备份」→ 系统分享面板出现 → 关闭 | ✅ 14s |
| `05-cycle-boundary-preview.yaml` | 在事件页新建「周期」型事件 → 开周期 → 记一天 → 把结束日改到那天之前 → **黄色越界预演** → **保存被仓储拒绝** | ✅ 45s |
| `06-stats-comparison.yaml` | 统计页「较前一段 / 较上年同期」切换 → 对照窗口与结论文案 | ✅ 11s |
| `07-cycle-entry-trash.yaml` | 周期里记一天 → 删除（软删）→「撤销」找回 → 再删 → 回收站「已删除的周期记录」里恢复 → 三删 →「彻底删除」+ 原生二次确认 | ✅ 1m20s |
| `08-cycle-calendar.yaml` | 周期实例页月视图 → 点 `2026-10-02`（「当前选中」跟着变）→ 填症状保存 → 那格变成「有记录（2 个症状）」→ 定义页「症状统计」列出头痛 / 乏力 → 收尾把这条彻底删除 | ✅ 1m4s |
| `09-timeline-repeat-merge.yaml` | 时间轴行内【+1】（点下去就落库，没有确认条）→ 进那条记录的详情页核对来源是「快捷」→ 到设置切「合并」（共 N 次 · 展开逐条）→ 点行就地展开「收起」→ 再切回「逐条」 | ✅ 32s |
| `10-cycle-prediction-and-overlap.yaml` | 自建「Maestro预测」（周期型事件）+ 三段周期 → 定义页断言默认窗口（「按最近 2 段间隔的平均 31 天」）→ 到「设置 → 偏好设置」切「最近 1 段」→ 回定义页文案变成「按最近 1 段间隔的平均 30 天」→ 切回 3 段 → 把进行中那段的开始日压到前一段上 → **重叠预演**点名撞上的那一段 | ✅ 39s |

11/11 通过，合计 6m47s（iPhone 16e / iOS 26.3 / Expo Go，2026-10-23 在 v6「周期并入事件类型 + 属性可多条」上整跑一遍；
上表的逐条耗时是这一次的口径）。随后又在**一个「真跑过 v6 迁移的 v5 夹具库」**上原样整跑一遍：
**11/11 通过，7m20s**（数据不同 → 逐条耗时略有浮动：`01` 24s / `09` 31s / `10` 1m8s / `07` 1m28s /
`04` 13s / `08` 1m4s / `03` 37s / `00` 21s / `05` 44s / `06` 12s / `02` 37s）。
跑法与核对见下文「跑完之后怎么核对」。

`05` / `06` / `07` / `08` / `09` / `10` 分别对应当前最后几项改动（周期边界预演、统计环比同比、
周期内记录软删除、周期月视图与症状统计、时间轴行改版、周期预测窗口与重叠预演），
是「新增功能也要能真手点通」的回归。
`02` / `03` 也跟着改版改成了走详情页（开头先经 `use-expanded-view.yaml` 把视图钉成「逐条」）。

> **上表是 2026-10-23 那一次整跑的口径，此后没有再整跑。** 之后的三项改动
> （新装内置「喝水」、提示文案全量精简、分组管理收进「事件」页）都**没有跑过 Maestro**：
> 前两项只影响全新安装与文案，第三项没有任何流程覆盖。
> 其中文案精简**动到了 `02` 的两条断言**（已改成新文案，是否通过未验证）；
> 若要在真机上重跑，请先看上面的第 7 条。

## 选文件导入（跨 App，需要宿主帮一步）

`04` 只走到系统分享面板就把它关掉了。**「文件真的能存下来、能被选回来」**是另一段路，
它是 `import/` 下的一对流程，**手工两段式**跑（不要放进 `flows/`：两段之间有一步
Maestro 做不到的事，见下面的「坑」）：

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export PATH="$HOME/.maestro/bin:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

# 第 1 段：造标记（定义「Maestro导入」+ 记一次）→ 导出带标记的备份
maestro test .maestro/import/09a-export-marker.yaml

# 宿主帮一步：把 App 缓存里刚导出的文件拷进模拟器的「我的 iPhone」
UDID=$(xcrun simctl list devices booted | sed -n 's/.*(\([0-9A-F-]\{36\}\)) (Booted).*/\1/p' | head -1)
D=~/Library/Developer/CoreSimulator/Devices/"$UDID"/data
MY_IPHONE=$(
  for g in "$D/Containers/Shared/AppGroup"/*/; do
    id=$(plutil -extract MCMMetadataIdentifier raw "$g/.com.apple.mobile_container_manager.metadata.plist" 2>/dev/null)
    [ "$id" = "group.com.apple.FileProvider.LocalStorage" ] && echo "${g}File Provider Storage"
  done
)
SRC=$(ls -t $(find "$D/Containers/Data/Application" -name 'lifetrack-backup-*.json') | head -1)
rm -f "$MY_IPHONE"/*.json && cp "$SRC" "$MY_IPHONE"/

# 第 2 段：把本地那条永久删掉（让文件成为唯一来源）→ 选文件导入 → 断言「新增 1 条」
maestro test .maestro/import/09b-import-merge.yaml
```

**为什么中间要删一条**：文件里每一条 id 本地都有，导入只会「保留本地」，
证明不了文件到底被读进去没有。先把自己那条 `Maestro导入` **永久删除**（真删），
导入就该是「新增 1 条」；最后回到时间轴看到它，还能拿 id 对账——
库里恢复出来的那条 id 与文件里那条**逐字相同**。

### 「选文件导入」踩到的坑

1. **模拟器里「保存到『文件』」不落盘**：分享面板那颗按钮点得动（Maestro 报 `COMPLETED`，
   面板也会关、App 回到设置页显示「已导出 …」），但没有文件落到任何位置——
   「我的 iPhone」（`group.com.apple.FileProvider.LocalStorage`）与 iCloud 的两个 AppGroup
   容器都是空的（这台模拟器没登 iCloud 账号）。所以素材只能由宿主拷进去（上一段那条 `cp`）。
   真机上应当能存下来，**未验证**。
2. **选择器里的文件格子点标签不生效**：格子的无障碍文字是它的标签
   （`lifetrack-backup-2026-10-22.json, json, 17:18, 18 KB`），但 `tapOn` 用它点**不会选中文件**
   （选择器不关、也不返回结果）。要点格子里的**缩略图**，流程里写成相对坐标
   `point: '18%,29%'`——图标模式下第一个格子总在左上角。换设备 / 换动态字体要重新量。
3. **选择器打开时的位置**：默认停在「最近项目」（模拟器上永远是空的），点底部「浏览」
   才会落到上次浏览的目录。流程里先点「浏览」，若没看到文件再点「我的iPhone」。
4. **跑完要清 `Maestro导入`**：它不像 `03` 那样自己删干净（它要留着给第 2 段删一次），
   收尾 SQL 见下一节。

## 跑完之后怎么核对（不止看 PASS）

界面断言会被「文字恰好相同」骗过，所以跑完**直接读模拟器里的库**核对：

```bash
DB=$(DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
     xcrun simctl get_app_container booted host.exp.Exponent data)/Documents/ExponentExperienceData/@anonymous/lifetrack-*/SQLite/lifetrack.db

sqlite3 "$DB" "select count(*), sum(deleted_at is not null) from event_records;"
sqlite3 "$DB" "select count(*), sum(deleted_at is not null) from cycle_entries;"
sqlite3 "$DB" "select snapshot_name, occurred_at from event_records where deleted_at is not null;"
sqlite3 "$DB" "select name from event_definitions where name like 'Maestro%';"   # 收尾时要能删干净
sqlite3 "$DB" "select key, value from app_meta;"   # 纯偏好：app.timeline_view / app.prediction_window
```

跑完全套后的实测（2026-10-23，v6 之后连跑两次）：

1. **一次在「重建的空库」上**：`event_definitions` 只剩 Maestro 造的（跑前库空）；
2. **一次在「真跑过 v6 迁移的 v5 库」上**：先用一次性脚本
   `make-v5-fixture.cjs` + 现成的 `seed.py` 造一个 **v5 库**（4 个定义 + 月经的 2 段周期 / 4 条每日记录 +
   15 条事件记录含 1 条软删），拷进模拟器换掉 `lifetrack.db`，由 App 启动时**真跑 v6 迁移**，
   再跑 `maestro test .maestro/flows`：**11/11 通过，7m20s**。跑完核对：`user_version 5 → 6`、
   `跑步` / `睡眠`（原 `quantity`）折成 `counter` 且 `attributes` = 旧 `unit`（`["公里"]` / `["小时"]`）、
   `月经`（原周期定义）变成 `kind = 'cycle'` + `cycle_mode = 'manual'` 且原 id 不变、
   快捷选项的属性 = 旧 `unit`、周期 2 段 / 4 条每日记录（含 1 条软删）一条不少、
   15 条事件记录（含 1 条 `quantity`）都在、`cycle_definitions` 表已不存在、`PRAGMA foreign_key_check` 为空。

两次跑完都是**没有孤儿行**（`PRAGMA foreign_key_check` 为空）——
`03` / `07` / `08` 各自把自己造的那条删干净了；
`05` 留下的 `Maestro周期` 每日记录还在（越界保存被拒，拒绝没有删数据）；
`10` 留下 `Maestro预测` 定义与三段周期（**没有**每日记录，收尾时一并删）；
`01` / `02` / `09` 会留下几条 `Maestro喝水` 记录（同名事件累加，收尾一起清）。

> **造 v5 夹具库时的一个坑**：`seed.py` 会生成「今天 20:40」这类当天晚些时刻的记录，
> 如果套件跑在 20:40 之前，时间轴里就冒出一条「未来」记录排在测试自己造的那条上面，
> `09` 里「点第一行的【+1】」就会点到它、断言来源「快捷」失败（**代码没问题，是夹具的时间不对**）。
> 夹具脚本里把基准时间统一往前挪了 3 天（而不是改流程），让所有示例记录都落在过去。

v6 之后顺手核对结构也对得上：`event_definitions.attributes` 是 JSON 数组文本
（周期型是 `'[]'`，带 `cycle_mode`），`event_records` 的 `attributes` / `snapshot_attributes`
也都在，`cycle_definitions` 表已经不存在。

> **中途改过的迁移会在设备上「卡住」**：v6 在定稿前改过一次内容
> （先叫 `unit → attribute`，后改成 `attributes` JSON 数组）。设备上已经按旧内容跑过、
> `user_version` 记成 6，于是定稿后的 v6 不会再跑，界面就会报
> `no such column: attributes`。改法只有一条：**删掉设备上的库让它重建**
> （这就是本次开发中发生的事；迁移一旦提交就不能再改，见 `04-sqlite-and-repository.md`）。

> 时间轴的显示偏好存在 `app_meta.app.timeline_view`，周期预测窗口存在
> `app_meta.app.prediction_window`。整套跑完：显示方式停在「逐条」（`09` 的最后一步就是切回来），
> 预测窗口停在默认的 3 段（`10` 最后也切回来了）。某次跑挂在中途、停在「合并」，重新跑下一个流程时
> 它们自己会先钉回「逐条」。想恢复默认就
> `delete from app_meta where key in ('app.timeline_view', 'app.prediction_window');`。

> 收尾时注意两件事：
>
> 1. **`sqlite3` 命令行默认不开外键**，级联删除不会发生。先 `PRAGMA foreign_keys = ON;`，
>    否则删掉事件定义之后，周期实例与每日记录会**留下来当孤儿行**（`PRAGMA foreign_key_check` 会报出来）。
> 2. `event_records` **没有指向 `event_definitions` 的外键**（历史独立于定义，见领域规则第 1 条），
>    所以删掉 `Maestro喝水` 定义**不会**连带删掉它的记录，要显式删。
>
> v6 起周期定义并进了 `event_definitions`（周期就是事件的一种类型），
> `cycle_instances` / `cycle_entries` 的外键直接指向它，所以一条定义就带走了它的全部周期：
>
> ```sql
> PRAGMA foreign_keys = ON;
> DELETE FROM event_definitions WHERE name LIKE 'Maestro%';      -- 级联：快捷选项 + 标签关联 + 周期实例 + 每日记录
> DELETE FROM event_records WHERE snapshot_name LIKE 'Maestro%'; -- 必须显式删（历史无外键）
> ```
>
> 删完再跑一次 `PRAGMA foreign_key_check`（应为空）核对。
> 万一忘了开外键、留下了孤儿行，按外键方向补一次即可：
> `DELETE FROM cycle_instances WHERE definition_id NOT IN (SELECT id FROM event_definitions);`
> 再 `DELETE FROM cycle_entries WHERE instance_id NOT IN (SELECT id FROM cycle_instances);`。

## 已知限制

- **只在 iOS 模拟器上跑过**；Android 与真机未跑。
- **「选文件导入」只在手工两段式里覆盖**（`import/09a` + `import/09b`），而且素材是宿主
  拷进「我的 iPhone」的：模拟器里「保存到『文件』」不落盘（见上一节），跨 App 那一步
  没能端到端闭环；真机未验证。用过的那份素材记得删（`rm -f "$MY_IPHONE"/*.json`）。
- `05` / `07` / `10` 假定运行日期晚于 `2026-10-05`（写这段时是 `2026-10-23`；`10` 还要晚于 `2026-08-05`
  才建得出三段周期）。
- `08` 假定 `Maestro周期` 的 `2026-10-02` 上还没有记录（跑完它会删掉；上次跑到一半留下的
  软删除记录会让最后一步多出一条，去回收站手工清一下就好）。
- `02` 会把那条记录的发生时间改到 `2026-01-01`（用来验证「修改」真的落库）：它因此在
  时间轴里沉到很下面，流程末尾要往下滚才看得到——这不是 bug，是排序真的按发生时间走。
- 重复跑会在库里留下 `Maestro*` 开头的定义与记录（可以随手删掉）。