# .maestro —— 在模拟器里真手点一遍

这里的 YAML 是 [Maestro](https://maestro.mobile.dev) 的流程文件，用来在 iOS 模拟器上
**真的点击 App**：点记录、删除并撤销、回收站真删、导出、周期边界预演、统计对比、
周期内记录的软删除与回收站。

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

maestro test .maestro/flows                 # 跑全部（约 2 分钟）
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

### 选择器上的三个坑（都是踩过的）

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
| `07-cycle-entry-trash.yaml` | 周期里记一天 → 删除（软删）→「撤销」找回 → 再删 → 回收站「已删除的周期记录」里恢复 → 三删 →「彻底删除」+ 原生二次确认 | ✅ 56s |

8/8 通过，合计 3m11s（iPhone 16e / iOS 26.3 / Expo Go 58.0.5）。

`05` / `06` / `07` 分别对应当前最后三项改动（周期边界预演、统计环比同比、
周期内记录软删除），是「新增功能也要能真手点通」的回归。

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
回收站里**没有 `Maestro*` 残留**——`03` / `07` 各自把自己造的那条删干净了；
`05` 留下的 `Maestro周期` 每日记录还在（越界保存被拒，拒绝没有删数据）。
收尾时把 `Maestro*` 的定义与记录删掉，库就回到使用者的 `15 条 / 1 条软删`。

## 已知限制

- **只在 iOS 模拟器上跑过**；Android 与真机未跑。
- **「选文件导入」没覆盖**：只走到系统分享面板，没有跨 App 去文件选择器。
- `05` / `07` 假定运行日期晚于 `2026-10-05`（写这段时是 `2026-10-22`）。
- 重复跑会在库里留下 `Maestro*` 开头的定义与记录（可以随手删掉）。