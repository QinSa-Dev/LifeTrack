#!/usr/bin/env node
/**
 * 把 `package.json` 的 version 同步到 `app.json` 的 `expo.version`。
 *
 * 由 `npm version <minor|patch|major>` 的 `version` 生命周期自动调用（见 package.json），
 * 保证「关于」页显示的版本、原生 versionName 和 git tag 始终是同一个号。
 * 手动运行 `npm run version` 也可以，但正常发版不需要。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const appPath = join(root, 'app.json');
const appConfig = JSON.parse(readFileSync(appPath, 'utf8'));

if (appConfig.expo.version === version) {
  console.log(`app.json 已是 v${version}，无需修改`);
} else {
  appConfig.expo.version = version;
  writeFileSync(appPath, `${JSON.stringify(appConfig, null, 2)}\n`);
  console.log(`app.json 的 expo.version → ${version}`);
}
