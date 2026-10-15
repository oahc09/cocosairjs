# 许可风险检查报告

日期：2026-10-13。依据：`docs/license-decisions.json`、`docs/THIRD_PARTY_LICENSES.md`、`licenses/`（42 文件）、
`build/gltf-decoders/`，门禁实跑 `npm run verify:licenses`。

## 结论

`npm run verify:licenses` 实跑：**13 项登记，0 FAIL / 1 ATTENTION**。除下述一项外，全部义务已满足。
项目本体是 MIT（`LICENSE`，`Copyright (c) 2025 SUD`），与 `package.json` 的 `"license": "MIT"` 一致。

## 默认 bundle 内嵌的第三方运行时

| 组件                             | 许可                                                                     | 义务                 |
| -------------------------------- | ------------------------------------------------------------------------ | -------------------- |
| Spine runtime（`spine-core.js`） | **Spine Runtimes License Agreement 2019-05-01**（Esoteric Software LLC） | **唯一非 MIT**，见下 |
| DragonBonesJS                    | MIT                                                                      | 署名                 |
| Box2D                            | MIT                                                                      | 署名                 |
| cannon.js                        | MIT                                                                      | 署名                 |
| zlib.js                          | MIT                                                                      | 署名                 |
| notepack.io                      | MIT                                                                      | 署名                 |
| Cocos PAL（公开 MIT 快照）       | MIT                                                                      | 署名 + NOTICE        |

### Spine —— 唯一需要特别注意的项

`licenses/LICENSE_spine.txt` 要求：**再分发必须附带本许可与版权声明**，且**产品的每个用户须自备 Spine Editor 许可**。
这是"每产品用户"义务，不是逐文件声明义务。

**r48 处置（2026-09-25，owner 批复）**：保留默认产物 + `docs/THIRD_PARTY_LICENSES.md §7` 即为显式声明。
现状已满足"随包发布许可文本"一项；"每用户自备 Editor 许可"一项需集成方自行核验。

**实际风险面小于字面**：`docs/notes/spine-asset-sourcing.md` 实测记录 alpha.34 Web 侧只有 wasm/asm 后端，
随仓库抽取的 `spine-core.js` 实为枚举/类型桩，emscripten 运行资产并未取得（D2 受阻），
故**默认产物目前不含 Esoteric 的完整运行时实现**。

> 提示：`licenses/SPINE_license.txt`（v2.3）与 `licenses/LICENSE_spine.txt` 并存，但前者不在
> `verify-licenses.cjs` 的 REGISTRY 中。建议确认该旧文件是否仍有分发意义，避免包内出现两份口径不同的 Spine 许可。

## 变体产物（不进默认 bundle）

| 组件                                     | 许可                           | 形态                                         |
| ---------------------------------------- | ------------------------------ | -------------------------------------------- |
| Spark 高斯泼溅 `@sparkjsdev/spark` 2.3.1 | MIT                            | `ships: variant`                             |
| **spark-rs WASM + wasm-bindgen glue**    | MIT（Rust crate 许可面未转录） | `ships: variant`，**`disposition: pending`** |
| fflate 0.8.2（SPZ 解压）                 | MIT                            | `ships: variant`，不随 npm 包发布            |

### 未闭合项：spark-rs（本次 ATTENTION 的唯一来源）

- 登记 `disposition: pending`（2026-10-12），`blocking: false`。
- 语义：**在 owner 闭合该处置前，spark 变体产物不得作为 release 交付物**。
- 缺口：WASM 静态链接的 Rust crates 许可未转录。
- 默认产物不受影响（默认 bundle 无 spark 节点）。

## glTF 解码器（`ships: source`，随包发布但不进 bundle）

| 组件                          | 许可           | 文件                                                  |
| ----------------------------- | -------------- | ----------------------------------------------------- |
| meshoptimizer 1.2.0           | MIT            | `build/gltf-decoders/meshopt/LICENSE.md`              |
| draco3d 1.5.7                 | **Apache-2.0** | `build/gltf-decoders/draco/LICENSE.md`（归属 + 全文） |
| Basis Universal（three r168） | **Apache-2.0** | `build/gltf-decoders/basis/LICENSE.md`（归属 + 全文） |

两个 Apache-2.0 组件带归属与 NOTICE 类义务，现由各自 `LICENSE.md`（归属说明 + 全文）满足。

## `docs/THIRD_PARTY_LICENSES.md §6` 未闭合的 GitHub 前待办

原文两条勾选项，**均未完成**：

- [ ] 复核 `src/air/builtin/*` fixtures 与上游 LICENSE 头的归档一致性（当前 fixture 文件未携带上游版权头，
      属上游 `tests/` 的派生数据；公开发布前补充声明或改用程序化生成）。
      现状：`builtin-effects.ts` / `builtin-glsl4.ts` / `builtin-material.ts` 开头为 `/* eslint-disable */`，
      本次已按用户口径统一加 SUD 头。**此项需按本报告的处置更新勾选状态。**
- [ ] 如启用 `licenses/` 目录中列出的第三方组件（本快照未包含对应实现），逐项补齐声明。

## 打包与发布面

- `package.json files[]` 含 `"licenses/"` —— 许可原文随 npm 包发布，满足 Spine 的"再分发附许可"义务。
- **`docs/THIRD_PARTY_LICENSES.md` 不在 `files[]`**，仅经 `docs/*.md` 间接随包。若它被视为对外许可说明的正典，
  建议显式加入 `files[]`，使其不依赖 `docs/*.md` 的 glob 偶然命中。
- 不随包发布：`build/spark.module.js`、`build/spark-types/`、`build/fflate/`。
- 元数据缺口（不阻塞，记录在案）：`@cocos/dragonbones-js` 的 npm 包无 `LICENSE` 也无 `license` 字段；
  `@cocos/box2d`、`@cocos/cannon` 无 `license` 字段但包内带 `LICENSE` 文件（门禁按文件逐字节比对）。

## 建议

1. 闭合 `spark-rs` 的 Rust crate 许可转录，把 `disposition` 从 `pending` 改为 `accepted` 或明确移除该资产。
2. 更新 `§6` 第一条勾选项状态（本次已统一加头，需把"未携带版权头"的表述改为已处置并说明依据）。
3. 复核 `licenses/SPINE_license.txt`（v2.3）是否仍需分发。
4. 考虑把 `docs/THIRD_PARTY_LICENSES.md` 显式加入 `package.json files[]`。
5. 首次 GitHub 推送前确认仓库可见性与 Spine 义务的对外表述是否一致（README §许可 + 本报告）。
