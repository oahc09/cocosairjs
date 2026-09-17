# License Inventory（V0.8 §89 / V1.0 §96-G-LICENSE）

> 逐项列出仓库内全部第三方代码与资产及其许可。生成脚本：`tools/verify/license-inventory.cjs`。

## 1. Source Code（上游引擎）

| 组件 | 来源 | 许可 | 修改 |
|---|---|---|---|
| cocos/ pal/ exports/ | Cocos Engine 4.0.0-alpha.33 | MIT | ✅ 大量裁剪与修改，详见 `UPSTREAM.md` |
| Cocos Air 新增（src/air/） | 本项目 | MIT | 原创代码 |

## 2. Third-party Runtime Dependencies（build/gltf-decoders/）

| 组件 | 版本 | 许可 | 来源 | Hash 见 MANIFEST |
|---|---|---|---|---|
| Draco (draco3d.js + wasm) | 1.5.7 | Apache-2.0 | github.com/google/draco | ✅ |
| Meshopt (meshopt_decoder.cjs) | 1.2.0 | MIT | github.com/zeux/meshoptimizer | ✅ |
| Basis Universal (basis_transcoder.js + wasm) | 1.16 | Apache-2.0 | github.com/BinomialLLC/basis_universal | ✅ |

## 3. Fixtures / Example Assets

| 资产 | 来源 | 许可 | 用途 |
|---|---|---|---|
| BoxTextured.glb | Khronos glTF-Sample-Models | CC0 1.0 | glTF 加载基准 |
| SimpleSkin.gltf + .bin | Khronos glTF-Sample-Models | CC0 1.0 | 蒙皮测试 |
| AnimatedMorphCube.glb | Khronos glTF-Sample-Models | CC0 1.0 | Morph 测试 |
| 各 `.LICENSE.md` | 上游 | 各自许可 | 逐文件记录 |
| Benchmark fixtures（B001-B100） | 本项目生成 | MIT | Recipe/Benchmark 场景 |

## 4. DevTools / NPM Dependencies

| 包 | 许可 | 用途 |
|---|---|---|
| esbuild | MIT | 构建 |
| jest / ts-jest | MIT | 测试 |
| playwright | Apache-2.0 | 浏览器测试 |
| jsdom | MIT | Consumer 验收 |
| typescript | Apache-2.0 | 类型检查 |

## 5. Required In Package（files 白名单内的许可文件）

- `LICENSE`（MIT）
- `THIRD_PARTY_LICENSES.md`（第三方许可汇总）
- `UPSTREAM.md`（上游修改记录）
- `build/gltf-decoders/*/LICENSE.md`（各 decoder 许可全文）
