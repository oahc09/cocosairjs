# V0.6 G0 — 前置版本正式交接（V0.5 → V0.5.1 → V0.6）

> 依据《Cocos Air Runtime Release Evolution 任务书》§1。本文将任务书要求的每项硬前置映射到
> 冻结 revision 与证据位置；任一缺失即 V0.6 = BLOCKED。结论：**全部在场，V0.6 放行**。

- V0.5 最终交付 revision：`aec5882`（三轮 Review 修复后，G5 报告见 `docs/versions/acceptance-v0.5.md`）
- V0.5.1 最终交付 revision：**`f519d86`**（T0–T7 + 第二轮 Review 修复；V0.6 自此 revision 开工）
- 交接日期：2026-09-16

## 1. V0.5 交付物（§1 上半）

| 任务书要求 | 证据位置 | 状态 |
|---|---|---|
| Final Revision / G5 Report | `aec5882` + `docs/versions/acceptance-v0.5.md` | ✅ |
| GLTFLoader / GLTFAsset / GLTFInstance | `src/air/assets/gltf/loader.ts` `asset.ts`（公共 API，smoke-07/11/12） | ✅ |
| Extension Registry / GLTFParserContext / getExtensionSupport() | `src/air/assets/gltf/extension-registry.ts` `parser-context.ts`；`loader.getExtensionSupport()`（smoke-10） | ✅ |
| Stable Error Codes | `src/air/assets/gltf/diagnostics.ts`（GLTFErrorCode 稳定集合；smoke-10/11 断言） | ✅ |
| Draco / Meshopt / Basis(KTX2) Decoder | `build/gltf-decoders/{draco,meshopt,basis}/`（smoke-13/14；`tools/verify/decoder-audit.cjs` ok） | ✅ |
| Decoder Version/Source/SHA-256/License | `build/gltf-decoders/MANIFEST.md`（双向哈希核对）+ `docs/gltf/gltf-decoder-deployment.md` | ✅ |
| capabilities.json | `examples/gltf-catalog/capabilities.json`（生成器 `npm run capabilities` → `tools/verify/update-capabilities.cjs`；浏览器证据 `docs/gltf/gltf-validation.md`） | ✅ |
| Package / Build / Dev Tooling | `package.json` scripts；`tools/build/` `tools/dev/` | ✅ |
| npm pack / offline decoder evidence | `tools/verify/consumer-acceptance.cjs`（真 import，exportCount 368）+ `docs/versions/v051-package-consumption.md` | ✅ |
| Performance Baseline | `docs/gltf/gltf-performance-baseline.md`（BoxTextured 30 轮冻结基线 4.1ms） | ✅ |
| Lifecycle Baseline | 同上 §4（12 轮 load→instantiate→destroy 零泄漏行为证据） | ✅ |
| glTF Documentation | `docs/gltf/gltf-runtime.md` `gltf-extension-reference.md` `gltf-decoder-deployment.md` `gltf-validation.md` `gltf-catalog.md` | ✅ |

## 2. V0.5.1 交付物（§1 下半）

| 任务书要求 | 证据位置 | 状态 |
|---|---|---|
| Final Revision / Final Gate(DoD) Report | `f519d86` + `docs/versions/v051-verification.md`（强制命令全绿，23 套件/161 测试） | ✅ |
| Package Consumer Evidence | `tools/verify/consumer-acceptance.cjs` 输出（ok / exportCount 368 / README 链接校验） | ✅ |
| Final Example Index | `docs/versions/v051-examples.md`（导航 `/index.html`；starter/hello-cube/transform/camera/static-model/gltf-viewer/skinned-animation/input/automation/gltf-catalog） | ✅ |
| Inspection Contract | `docs/versions/v051-agent-development.md` §2（inspectScene/inspectNode/inspectAsset，ID 稳定合同） | ✅ |
| Agent Development Session Contract | `docs/versions/v051-agent-development.md` §1–§5（操作/错误码/requestId 窗口/共享资产所有权） | ✅ |
| Stable Runtime ID Contract | 同上 §2（session 内稳定、同名不同 ID、销毁/换场景 → STALE_TARGET） | ✅ |
| Frame Capture Contract | 同上 §4（AFTER_DRAW、场景快照、CAPTURE_FAILED 语义） | ✅ |
| Runtime Error Contract | 同上 §5（环形缓冲、hub 订阅分发、hook 恢复） | ✅ |
| Debug Tool Artifact | `tools/debug/{agent-session,panel}.ts`（默认 bundle 零 debug 标识，smoke-23） | ✅ |
| Runtime Baseline | `docs/versions/v051-runtime-baseline.md` + `docs/evidence/v051-runtime-baseline.json`（回归比 0.512） | ✅ |
| Documentation Index | `docs/v051-{package-consumption,examples,agent-development,runtime-baseline,verification}.md` + V0.5 五篇 glTF 文档 | ✅ |

## 3. 结论与冻结

- 交付物 **全部在场**：`V0.6 = GO`。
- V0.6 全部 Benchmark / Recipe 的 Run Manifest 中 `cocosairRevision` 自 `f519d86` 起；
  后续 revision 变更按任务书 §43 记录，不回溯改写本文。
- 下一步（§77 执行序）：Agent Driver → Manual Driver → Command Sandbox →
  Filesystem/Trial Isolation → Metrics → Reference/Agent Track → Golden 10 → G1。
