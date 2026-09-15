# V0.5.1 T0 — V0.5 冻结交接记录

> 日期 2026-09-15。本文件为 V0.5.1 开工前的 V0.5 最终交付冻结记录（计划书 §2 G0）。

## V0.5 最终交付 revision

| 项 | 值 |
|---|---|
| G5 判定提交 | `3c0ffc0`（三轮 Review 修复；HEAD at freeze） |
| 上游基线 | cocos-creator/engine cocos4 @ 4.0.0-alpha.33（snapshot 2026-09-12，docs/00、docs/12） |
| 官方样本 revision | glTF-Sample-Assets `90d7ede14c7e280af263824604b427a1ca02cb66`；Asset-Generator `3d99767e` |
| decoder 清单 | build/gltf-decoders/MANIFEST.md（meshoptimizer 1.2.0 / draco3d 1.5.7 / three r168 basis） |

## 工具链

| 项 | 版本 |
|---|---|
| Node | v24.14.0 |
| npm | 11.11.1 |
| TypeScript | ^5.x（见 package.json devDependencies） |
| Jest | 29.x |
| 浏览器 | HeadlessChrome 153（WebGL2，ANGLE） |

## G5 证据链（可重复执行）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 |
| `npm run test` | 21 套件 / 134 测试 PASS |
| `npm run verify:web-only` | PASSED |
| `npm run build` / `build:min` / `build:dts` | 全绿 |
| `npm run verify:decoders` | ok（pack 离线 + 哈希 + 许可 + 零内嵌） |
| `npm run capabilities` | 21 扩展（17 browser-evidence / 4 smoke-only / 0 cataloged） |
| `npx tsc -p output/dts-consumer/tsconfig.json` | NodeNext 消费 EXIT:0 |
| 15 浏览器证据脚本 | 全 ok |

## §3 公共接口（冻结）

GLTFLoader / GLTFAsset / GLTFInstance、LoaderOptions、取消/进度、register/unregister、
getExtensionSupport、setMeshoptDecoder / setDRACODecoder / setKTX2Transcoder、
configureGLTFLoaderDefaults、createAirApp。完整 d.ts 消费：`output/dts-consumer/tsconfig.json`。

## 包 / 构建 / dev / 示例 / 文档基线

- package.json：type=commonjs，files=["build/","src/","README.md","LICENSE","UPSTREAM.md","THIRD_PARTY_LICENSES.md"]，
  main/module=build/cocosair.module.js，types=build/cocosair.module.d.ts。
- dev server：tools/dev/dev-server.cjs（importmap + reload + MIME）。
- 示例集：starter / hello-cube / static-model / skinned-animation / gltf-viewer / gltf-catalog / shared。
- 文档：gltf-runtime / gltf-extension-reference / gltf-decoder-deployment / gltf-validation /
  gltf-performance-baseline / gltf-catalog / acceptance-v0.5。

## 已知限制

见 [acceptance-v0.5.md §3](acceptance-v0.5.md)（7 条，包括透射排序、无 worker 集成、
clearcoat/aniso 切线近似等）。
