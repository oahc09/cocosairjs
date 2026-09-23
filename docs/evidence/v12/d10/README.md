# D10 证据包 — 批次 E（gfx-webgpu）在本基线快照内的不可达性

采集时间：2026-09-22（r26）。基线：`cocos4 @ 4.0.0-alpha.34`（commit `557b06f7e6`，冻结点 `fffd9a514a`）。

结论：**gfx-webgpu 的 26 个源码文件已按官方原文逐字节抽取并登记，但其类型核对、变体构建与运行时出图在本快照内均不可达**，
原因全部落在「上游 `native/external/emscripten/**` 不随引擎仓库快照分发」这一条基线事实上，非 Air 引入。
是否为其补齐第三方 wasm 资产属计划书页须确认项，登记为决策点 **D10**。

## 复现命令与对应日志

| 日志 | 命令 | 关键输出 |
|---|---|---|
| `air-typecheck-without-exclusion.log` | 未加豁免时 `npm run typecheck`（根 `tsconfig.json`） | 12 条硬错，全部落在 `cocos/gfx/webgpu/webgpu-define.ts` 与 `cocos/webgpu/instantiated.ts`：`TS6053` 缺 `src/native/external/emscripten/**.d.ts`、`TS2307` 缺 `external:emscripten/webgpu/{webgpu_wasm,glslang,twgsl}.{js,wasm}` 类型、`TS1343` `import.meta` 与 `module: commonjs` 冲突、`TS2307 'console'`（上游 `webgpu-define.ts:39` 笔误）、`TS2550 matchAll/at` 需 `lib≥es2020/es2022`（上游 `lib` 为 `es2017`） |
| `upstream-typecheck-on-snapshot.log` | `E:/AIProMax/github/cocosair.js/node_modules/.bin/tsc -p tsconfig.json --noEmit`，cwd = `cocos4` | `exit=2`，10×`TS2688`：上游 tsconfig 的 `types` 里 `./native/external/emscripten/{external-wasm,webgpu/webgpu,bullet/bullet,physx/physx,spine/spine,meshopt/meshopt_decoder,box2d/box2d}`、`./@types/consts`（需 `npm run build:const` 生成）、`./node_modules/@cocos/cannon/CANNON`、`./node_modules/@types/jest/index` 全部解析不到 —— **上游自身在本快照内无法完成类型核对** |
| `air-variant-build-gfx-webgpu.log` | `AIR_FEATURES=<默认 26 项>,gfx-webgpu AIR_OUT_DIR=E:/AIProMax/cocosair-scratch/build-webgpu-E node tools/build/build.cjs --format esm` | `exit=1`：`[build] FAILED: Could not load external:emscripten/webgpu/glslang.js (imported by src/cocos/gfx/webgpu/instantiated.ts): ENOENT ... src\native\external\emscripten\webgpu\glslang.js` —— 打包器把 `external:emscripten/*` 解析到 `src/native/**`，而 `native/` 按约定不入 Air |

## 目录侧事实

```
cocos4/native/external            → 不存在（`ls` No such file or directory；git ls-files native 有 2631 项但均为源码/构建脚本，无 external/）
cocos4/package.json scripts       → "update:native-external": "node ./native/utils/update-external.js"（wasm 资产由该命令联网拉取）
cocos4/cocos/gfx/index.ts         → 对 webgpu 零引用；唯一引用 webgpu-define.ts / instantiated.ts 的是 cocos/gfx/index.ems.ts（emscripten 平台变体）
```

## 因此本批次交付到哪一步

- 抽取：26 文件 `wrote 26/26; byte-identical 26; DIFF 0; MISSING 0`，manifest + upstream-file-map 已登记（`npm run verify:file-map` PASS）。
- 类型面：上游逐字节一致的 `@types/webGPU.d.ts`（3258 行）已落位并进入 `src/tsconfig.json` 的 `types`（与上游 tsconfig 对齐）。
- 类型核对：按上游引用图对等豁免（根 `tsconfig.json` 三项 exclude），豁免范围由 `smoke-30` 的「批次 E / D10」三条断言钉死：清单精确锁定、子图外零引进口、抽取件仍在簿记内。
- 接线与构建：**不登记** `cc.config.json` 的 `features["gfx-webgpu"]`（r26 一度登记后回退：登记即被 `dtsBundler` 并入发布类型面，
  `cc.d.ts` 多出 `export class WebGPUDevice` 而默认 bundle 导出表无此符号，+60,649 B 类型/产物不一致）；变体构建如上表 BLOCKED（`exit=1`）。
- 类型核对与声明图：根 `tsconfig.json` 与 `src/tsconfig.json` 各加同名三项 exclude，范围由 smoke-30 的「批次 E / D10」三条断言锁定。
- 默认产物：批次 E 前后三份发布产物**逐字节不变** —— dev `6,081,668 B`（sha256 `35496aebda06…`）/
  min `3,499,182 B`（`8795c8685ace…`）/ d.ts `3,082,360 B`（`sha256sum -c` OK）（护栏 7）。
- 未做（需 D10 决策）：`WEBGPU=true` 常量通道与 `createAirApp({ device: 'webgpu' })` 探测链路、`examples/webgpu-basic`、Chromium 出图与三浏览器回退矩阵。
