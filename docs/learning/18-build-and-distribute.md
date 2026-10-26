# 18 构建与分发：把初版装到真机

> 对应目标：**第一阶段收尾之后「怎么真正装到手机上用」**，不是上架。
> 本文是**操作手册**。截至写下时**尚未实跑**：iOS 本机构建被 `xcode-select` 指向
> CommandLineTools 挡住、EAS 流程需要登录 Expo 账号，两条都没有执行过。跑通后会回填实测结果——
> 没跑过的步骤我会明确标出来，不把「应该能行」写成「已验证」。

## 1. 要解决什么

代码写得再好，也只在模拟器里跑过。本文回答一个问题：

> 初版已经能用了，怎么把它装到我自己的手机上？

先给结论：**不需要上架 App Store。** 上架只解决「让陌生人在商店里搜到并下载」，
而「装到自己/家人的手机上用」有更直接的渠道，全程没有审核。

LifeTrack 全本地运行（SQLite，无后端、无账号），所以「分发」纯粹是把一个二进制装到设备上。

## 2. 三种方式与代价

| 方式 | 要审核？ | 花钱？ | 有效期 | 适合 |
| --- | --- | --- | --- | --- |
| Android APK（`eas build -p android --profile preview`） | 否 | 免费 | 长期 | 安卓自用，最省事 |
| iOS 本机直装（`npx expo run:ios --device`） | 否 | 免费 Apple ID 即可 | **7 天** | 只想先试用 |
| iOS ad hoc 内部分发（`eas build -p ios --profile preview`） | 否 | Apple **$99/年** | ~1 年 | iPhone 长期自用（≤100 台设备） |
| TestFlight | 上传到 App Store Connect，**自动审核**（≠ 上架审核） | Apple $99/年 | 90 天/版 | 给几个人用、想自动更新 |
| App Store / Google Play | 是（完整审核） | Apple $99/年、Google $25 一次性 | 长期公开 | 想公开发布 |

三条硬约束（来自 Expo 官方文档，不是猜测）：

1. **Android 不需要任何账号或费用**，EAS 出一个 APK，手机上直接装。
2. **iOS 真机装任何 App 都必须签名**：免费 Apple ID 只能本机 Xcode 直装、**7 天失效**。
3. **iOS 真机的 EAS 构建必须有付费 Apple Developer 账号**——免费账号连「云端代签」这一步都过不去。

## 3. 账号：免费 Apple ID ≠ Apple Developer Program

这两件事经常被混为一谈：

| | 免费 Apple ID（Personal Team） | Apple Developer Program |
| --- | --- | --- |
| 花费 | 0 | **$99/年** |
| 能用 | Xcode 本机装到自己设备 | ad hoc 内部分发 / TestFlight / 上架 |
| 凭证有效期 | **7 天** | ~1 年 |
| 设备数 | 自己的设备 | ad hoc 上限 100 台/年 |
| 给别人装 | 基本别想（每台都要连你的电脑） | 加 UDID 后发个链接即可 |

**怎么确认自己是哪种**：登录 <https://developer.apple.com/account>，
看 Membership 是不是 Active。能进后台、但没付过钱 = 免费 Apple ID。

## 4. 改了哪些文件

| 文件 | 角色 | 本次改动 |
| --- | --- | --- |
| `eas.json` | EAS 构建配置 | **新增**：`development` / `preview` / `production` 三个 profile（见 5.1） |
| `app.json` | Expo 应用配置 | **未改**。`ios.bundleIdentifier` 仍为 `com.lifetrack.app`，是否需要改见第 8 节 |
| `.gitignore` | 忽略清单 | **未改**：`/ios`、`/android` 与各种签名文件（`*.p12` / `*.mobileprovision` / `*.jks` …）本来就被忽略 |

## 5. 路线 A：Android（EAS 云构建，免费）

不需要 Xcode、不需要任何付费账号。EAS 在云端编译。

```bash
# 1. 装 EAS CLI（一次性）
npm install --global eas-cli

# 2. 登录 Expo 账号（在 https://expo.dev/signup 免费注册）
eas login
eas whoami            # 确认登录状态

# 3. 在项目根目录出 APK
eas build -p android --profile preview
```

第一次会问你几件事，都按提示确认：

- 创建 EAS 项目 → 是。EAS 会把 `extra.eas.projectId` 写进 `app.json`。
- `Generate a new Android Keystore` → 是。keystore 由 EAS 生成并保管在服务器，本地不留私钥。

构建完成后终端给一个链接/二维码；**用手机扫二维码即可下载 APK 安装**
（系统会提示「未知来源」，允许这一次即可）。也可以事后到 `eas build:list` 或
<https://expo.dev/builds> 找到那次构建，点 **Install** 拿安装链接。

装一次就长期有效，不像 iOS 有 7 天限制。

### 5.1 `eas.json` 里三个 profile 各是什么

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "autoIncrement": true }
  }
}
```

- `development`：调试用的开发构建（含 `expo-dev-client`，需要先 `npx expo install expo-dev-client`），
  连开发服务器用，**不会**提交商店。本文的两条路线都用不到它，留着是给以后本地迭代用。
- `preview`：**本文的主角**。`distribution: internal` 让 EAS 生成可分享的安装链接，
  且**不需要开发服务器**；Android 显式指定 `buildType: apk`（默认会出 AAB，AAB 只能走 Play）。
- `production`：上架用（AAB + 自动递增版本号），现在不用。

`cli.appVersionSource: "remote"` 表示版本号由 EAS 远程管理，本地 `app.json` 不用手动改
`android.versionCode`。

## 6. 路线 B：iPhone + 免费 Apple ID（本机 Xcode）

免费账号**不能**用 EAS 出 iOS 真机包，只能本机 `xcodebuild` 直装。

### 6.1 前置：三个一次性准备

```bash
# 1. 让 Xcode（而不是 CommandLineTools）当「当前开发者目录」
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# 验证：能列出模拟器就算好了
xcrun simctl list devices available | head
```

```text
# 2. 打开一次 Xcode，登录 Apple ID
#    Xcode 菜单 → Settings → Accounts → 左下角 + → Apple ID
#    登录后会生成一个 Personal Team（免费签名身份）
# 3. iPhone 用数据线连上电脑，在手机上打开「开发者模式」
#    设置 → 隐私与安全性 → 开发者模式 → 打开（会重启手机）
```

> **注意**：第 1 步是 `sudo`，要你自己输密码。本文写下时这台机器的
> `xcode-select -p` 指向 `/Library/Developer/CommandLineTools`，`xcrun simctl` 直接报
> `unable to find utility "simctl"`——不修的话第 6.2 步一定失败。

### 6.2 构建并安装

```bash
npx expo run:ios --device --configuration Release
```

- 第一次会自动 `prebuild`，生成 `ios/` 目录（`.gitignore` 已忽略，不会污染仓库）。
- `-d, --device` 会列出可用设备让你选；`--configuration Release` 表示独立运行，
  **不依赖**电脑上的 Metro（默认 Debug 则要一直开着开发服务器）。
- 构建几分钟；装好后 App 独立运行。
- **7 天后凭证过期，App 就打不开了**，重新跑这一条命令即可。

如果 Xcode 抱怨「多个 Team」或选不到团队，在 `app.json` 里补上团队 ID（[怎么找](https://developer.apple.com/help/account/manage-your-team/locate-your-team-id/)）：

```json
{ "expo": { "ios": { "appleTeamId": "XXXXXXXXXX" } } }
```

## 7. 路线 C：付费 $99 之后（ad hoc / TestFlight）

以后买了 Apple Developer Program，路线 B 的「7 天重装」就可以去掉：

```bash
# ad hoc：装一次管一年（设备要先登记 UDID）
eas device:create                       # 生成一个链接/二维码，用 iPhone 打开即登记
eas build -p ios --profile preview      # 出一个 ad hoc IPA
```

> 新注册的设备不是马上能用：Expo 登记 ≠ Apple 登记，设备要等第一次被写进
> provisioning profile 后才在 Apple 侧生效，**新会员可能还要等 24–72 小时**。

想给家人也装、或者想要自动更新，走 TestFlight：

```bash
eas build -p ios --profile production
eas submit -p ios --profile production  # 上传到 App Store Connect，之后在 TestFlight 里分发
```

TestFlight 不用管 UDID，但每个构建要先过一次自动审核，且构建 90 天后过期。

## 8. bundle identifier 要注意

App ID 在苹果那边**全球唯一**。`app.json` 现在写的是 `com.lifetrack.app`——
「LifeTrack」这种通用名字很可能已经被别人注册，那样安装会报
`The app identifier "com.lifetrack.app" cannot be registered to your development team`。

**建议改成带自己标识的反写**，例如 `com.qinsa.lifetrack`。改之前要知道：

- **换了 bundle id 就是另一个 App**：模拟器 / 旧设备上现有的数据不会带过去（SQLite 是按 App 隔离的）。
- 改完要 `npx expo prebuild --clean` 重新生成原生工程。
- Android 的 `android.package` 同理，但和 iOS 是两套，可以只改一个。

## 9. 关键概念

### 9.1 development / preview / production 三档构建

**是什么**：EAS 构建用「profile」区分用途。`development` 是带调试工具的开发构建，
`preview` 是可内部分发的准生产构建，`production` 是给商店的发布构建。

**为什么**：同一份代码，调试要连开发服务器、测试要独立可分享、发布要压缩并与商店版本号挂钩，
三者的原生配置不同。用 profile 而不是改代码，是为了不互相污染。

**用在哪**：`eas.json` 的 `build` 下三个键；`eas build --profile <name>` 选一个。

### 9.2 APK 与 AAB

**是什么**：Android 两种产物。APK 可直接安装；AAB 是给 Play 商店上传的格式，商店再按设备下发优化后的 APK。

**为什么**：内部分发要 APK（能直接点开装），上架要 AAB。`distribution: internal` 默认就出 APK，
`preview` 里再显式写 `buildType: apk` 是把它钉死，避免以后有人改了 profile 就出一堆装不上的 AAB。

### 9.3 ad hoc / TestFlight / 商店

**是什么**：iOS 三种分发途径。ad hoc = 把设备 UDID 列进 provisioning profile，只有名单里的设备能装；
TestFlight = 上传到 App Store Connect，测试者在 TestFlight App 里装；商店 = 面向所有人。

**为什么**：iOS 没有「随便下个包就装」这回事，所有安装都受签名与设备名单约束。
免费 Apple ID 连 ad hoc 都做不了，所以只能本机直装。

### 9.4 为什么 iOS 真机一定要签名，而 Android 不用

**是什么**：iOS 由系统在校验「这个二进制是不是被信任的证书签过、这台设备是否在名单里」；
Android 允许用户显式接受「未知来源」的 APK。

**为什么**：这是两家平台的安全模型差异，不是 Expo 的限制。所以 Android 侧零成本，
iOS 侧要么本机签、要么花钱签。

### 9.5 7 天过期到底过期的是什么

**是什么**：免费 Personal Team 签发的 provisioning profile 有效期是 7 天。

**为什么**：苹果用它把「免费开发」限制在「自己开发自己调试」，而不是「拿它长期分发 App」。

**表现**：第 8 天点图标会闪退 / 提示无法验证 App。**代码和数据都还在**，
重新跑一次 6.2 的命令重新授权即可（SQLite 数据不会丢）。

## 10. 常见问题与排查

### 问题：`xcodebuild: error: tool 'xcodebuild' requires Xcode, but active developer directory ... is a command line tools instance`

**原因**：装了 Xcode，但 `xcode-select` 指向 CommandLineTools（常见于装过命令行工具之后）。
**解决**：`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`。

### 问题：`unable to find utility "simctl", not a developer tool or in PATH`

同一个原因，同一解法。修好后 `xcrun simctl list devices` 应该能列出模拟器。

### 问题：`The app identifier "com.lifetrack.app" cannot be registered ...`

**原因**：bundle id 被别的开发者占了（见第 8 节）。
**解决**：改 `ios.bundleIdentifier` 为带自己标识的反写，然后 `npx expo prebuild --clean`。

### 问题：装了 App，第 8 天打不开了

**不是 bug**：免费 Apple ID 的 7 天凭证到期（见 9.5）。重跑 `npx expo run:ios --device --configuration Release`。

### 问题：Android 安装时提示「未知来源 / 不允许安装」

**正常**：APK 不是从 Play 来的。在弹窗里允许「来自此来源」即可。

### 问题：`eas build` 一直排队

**正常**：免费额度并发低。构建本身几分钟，排队可能更久。急着看结果就等，或者在
<https://expo.dev/builds> 看进度，不必在终端干等。

### 问题：`expo-doctor` 报 8 条「依赖漂移」，会不会影响构建

**不会**：那是版本建议，不是构建错误。构建能不能过看的是 `npm run verify` 与原生配置。
真要收，另开一次 `npx expo install --fix`，别和分发混在一起做。

### 问题：iOS 真机能不能用 EAS 免费构建

**不能**。官方明确：所有装到 iPhone 真机的构建都需要付费 Apple Developer 账号签名。
免费账号只有「本机 Xcode 直装」这一条路。

## 11. 怎么验证 / 还没验证什么

**能提前验的（不需要设备）**：

```bash
npm run verify        # 代码本身没问题
npm run doctor        # 依赖与配置体检
eas whoami            # EAS CLI 与登录状态
xcrun simctl list devices available | head   # Xcode 是否选对（6.1 第 1 步）
```

**跑通后要回填到本文的实测结果**（现在这里还是空的，因为这些都没跑过）：

| 步骤 | 预期 | 实测 |
| --- | --- | --- |
| `eas build -p android --profile preview` | 出 APK，手机装上能开 | **未跑** |
| `npx expo run:ios --device --configuration Release` | 装上 iPhone，独立运行 | **未跑** |
| 7 天后重开 App | 打不开，重装后恢复 | **未跑** |
| `eas device:create` + iOS preview（付费后） | 装一次管一年 | **未跑** |

**明确不在本文范围**：上架 App Store / Google Play、EAS Update 热更新、CI 构建、
多环境（dev/staging/prod）配置。这些等真正需要时再单开一篇。