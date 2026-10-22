# .maestro —— 在模拟器里真手点一遍

这里的 YAML 是 [Maestro](https://maestro.mobile.dev) 的流程文件，用来在 iOS 模拟器上
**真的点击 App**：点记录、删除并撤销、回收站真删、导出、周期边界预演、统计对比、
周期内记录的软删除与回收站、周期月视图选日期与症状统计。**「选文件导入」**（要跨到系统
文件选择器）是 `import/` 下的手工两段式，见下文「选文件导入」一节。

它补的是 `HANDOFF.md` 第 8 节里那一串「❌ 写入路径没有真手点过」——
这些路径原先只有单元测试覆盖。走读版说明见 `docs/learning/15-maestro-e2e.md`。

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

maestro test .maestro/flows                 # 跑全部（约 5 分钟）
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
  （`launchApp: {stopApp: true}` → `openLink: exp://127.0.0.1:8081` → 等 `时间轴, tab, 1 of 5`）。
  因为 Expo Go 里 `openLink` **不重载 JS**，上一次停在二级页面就会一直停在那里；
  `stopApp` 只是杀进程，**不清数据**。
- **写路径的流程自产自销**：自己先记一条再删，不去动你手工留下的数据
  （唯一例外：永久删除那一步删的是它自己刚建的那条）。
- 数据是**累加**的：`01` 每跑一次多一条记录、`05` 每跑一天多一条每日记录，
  会多出「Maestro…」开头的事件 / 周期定义。`07` 复用 `05` 建的那个「Maestro周期」，
  自己造的那条每日记录在流程末尾被真删，所以不累加。这些都是正常的，可以在 App 里删掉。

### 选择器与导航上的几个坑（都是踩过的）

1. **匹配是全文匹配**：底部标签栏的文字是 `事件, tab, 3 of 5`，所以
   `tapOn: '事件'` 找不到；要写 `.*事件, tab.*`。部分匹配一律自己写 `.*`。
2. **可点的列表行会把行内文字并成一个元素**：事件页的行暴露成
   `Maestro喝水, 未分组 · 计数, 计数`，所以要用 `.*Maestro喝水.*`。
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

### 键盘与遮挡

- 这个 App 的输入框上，**`hideKeyboard` 会失败**（中文输入法）→ 用 `pressKey: Enter`
  （单行输入回车即失焦）。
- `number-pad`（如周期定义里的「平均周期长度」）**没有回车键**，所以流程干脆不填那个可选字段。
- 提交按钮常在表单最底部 → 先 `scrollUntilVisible` 再点；
- 页面顶部的提示条（`已保存…`）在滚下来之后看不见 → 断言前先 `scrollUntilVisible` 方向 `UP` 滚回去。
- 统计页的对比 `Chip` 紧贴标签栏，**不滚就点会点到标签栏**（于是跳到时间轴）→ 先滚到
  「对照窗口：…」那行再点。

## 流程清单

| 流程 | 覆盖的路径 | 真实结果 |
| --- | --- | --- |
| `00-smoke.yaml` | 打开 App → 五个标签页都能渲染（时间轴 / 统计 / 事件 / 周期 / 设置） | ✅ 14s |
| `01-record-event.yaml` | 事件页 →（必要时新建定义）→ 记录页「记录」→ 时间轴能看到这条记录 | ✅ 23s |
| `02-timeline-delete-undo.yaml` | 时间轴「删除」→ 出现「已删除：…」→「撤销」→ 记录回来 | ✅ 8s |
| `03-trash-restore-perma.yaml` | 删除 → 回收站「恢复」；再删除 →「永久删除」+ 原生二次确认（净值 0） | ✅ 29s |
| `04-backup-export.yaml` | 设置页「导出 JSON 备份」→ 系统分享面板出现（`lifetrack-backup-2026-10-22`, `JSON · 19 KB`）→ 关闭 | ✅ 11s |
| `05-cycle-boundary-preview.yaml` | 建周期定义 → 开周期 → 记一天 → 把结束日改到那天之前 → **黄色越界预演** → **保存被仓储拒绝** | ✅ 37s |
| `06-stats-comparison.yaml` | 统计页「较前一段 / 较上年同期」切换 → 对照窗口与结论文案 | ✅ 13s |
| `07-cycle-entry-trash.yaml` | 周期里记一天 → 删除（软删）→「撤销」找回 → 再删 → 回收站「已删除的周期记录」里恢复 → 三删 →「彻底删除」+ 原生二次确认 | ✅ 1m20s |
| `08-cycle-calendar.yaml` | 周期实例页月视图 → 点 `2026-10-02`（「当前选中」跟着变）→ 填症状保存 → 那格变成「有记录（2 个症状）」→ 定义页「症状统计」列出头痛 / 乏力 → 收尾把这条彻底删除 | ✅ 1m3s |

9/9 通过，合计 4m39s（iPhone 16e / iOS 26.3 / Expo Go 58.0.5）。

`05` / `06` / `07` / `08` 分别对应当前最后四项改动（周期边界预演、统计环比同比、
周期内记录软删除、周期月视图与症状统计），是「新增功能也要能真手点通」的回归。

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
```

跑完全套后的实测：使用者的 `15 条记录 / 4 条周期记录`（含 1 条软删的 `喝水`、10-18）一条没少；
回收站里**没有 `Maestro*` 残留**——`03` / `07` / `08` 各自把自己造的那条删干净了；
`05` 留下的 `Maestro周期` 每日记录还在（越界保存被拒，拒绝没有删数据）。
收尾时把 `Maestro*` 的定义与记录删掉，库就回到使用者的 `15 条 / 1 条软删`。

> 收尾时注意两件事：
>
> 1. **`sqlite3` 命令行默认不开外键**，级联删除不会发生。先 `PRAGMA foreign_keys = ON;`，
>    否则删掉周期定义之后，实例与每日记录会**留下来当孤儿行**（`PRAGMA foreign_key_check` 会报出来）。
> 2. `event_records` **没有指向 `event_definitions` 的外键**（历史独立于定义，见领域规则第 1 条），
>    所以删掉 `Maestro喝水` 定义**不会**连带删掉它的记录，要显式删。
>
> ```sql
> PRAGMA foreign_keys = ON;
> DELETE FROM cycle_definitions WHERE name LIKE 'Maestro%';     -- 级联：实例 + 每日记录
> DELETE FROM event_definitions WHERE name LIKE 'Maestro%';     -- 级联：快捷选项（记录不会跟走）
> DELETE FROM event_records WHERE snapshot_name LIKE 'Maestro%'; -- 必须显式删
> ```
>
> 删完再跑一次 `PRAGMA foreign_key_check`（应为空）核对。
> 万一忘了开外键、留下了孤儿行，按外键方向补一次即可：
> `DELETE FROM cycle_instances WHERE definition_id NOT IN (SELECT id FROM cycle_definitions);`
> 再 `DELETE FROM cycle_entries WHERE instance_id NOT IN (SELECT id FROM cycle_instances);`。

## 已知限制

- **只在 iOS 模拟器上跑过**；Android 与真机未跑。
- **「选文件导入」只在手工两段式里覆盖**（`import/09a` + `import/09b`），而且素材是宿主
  拷进「我的 iPhone」的：模拟器里「保存到『文件』」不落盘（见上一节），跨 App 那一步
  没能端到端闭环；真机未验证。用过的那份素材记得删（`rm -f "$MY_IPHONE"/*.json`）。
- `05` / `07` 假定运行日期晚于 `2026-10-05`（写这段时是 `2026-10-22`）。
- `08` 假定 `Maestro周期` 的 `2026-10-02` 上还没有记录（跑完它会删掉；上次跑到一半留下的
  软删除记录会让最后一步多出一条，去回收站手工清一下就好）。
- 重复跑会在库里留下 `Maestro*` 开头的定义与记录（可以随手删掉）。