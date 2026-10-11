# Noise Dissolve（E01）

以原生 CocosAirJS 材质完成三 octave Perlin fBM 溶解。打开开发服务器的 `/examples/shader-noise-dissolve/`，使用 progress、scale、softness、连续 seed、invert 控件及棋盘/不透明输入；暂停、恢复、重置、销毁、重建均走原生 pacer。页面只有 GameCanvas，未创建独立渲染 canvas 或 RAF。

参数范围和默认值唯一来源是 [src/parameters.ts](src/parameters.ts)。普通模式使用纹理原始 RGB 和缩放后的 alpha 做 native SRC_ALPHA 混合。`?test=1` 隐藏控件、暂停原生 pacer，由单一 createStepClock 采证；不是普通观看模式。

数学、数值/PNG oracle、生命周期和当前验收范围见 [noise-dissolve.md](../../docs/effects/noise-dissolve.md)。上游及必须保留的许可见 [UPSTREAM.md](UPSTREAM.md) 和 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。

```powershell
node examples/shader-noise-dissolve/generate-effects.mjs
node node_modules/typescript/bin/tsc -p tools/verify/shaders-noise-dissolve.tsconfig.json
$env:NODE_PATH='output/playwright/tooling/node_modules'
npx jest --runInBand test/smoke/shaders-noise-dissolve.test.ts
node tools/verify/shaders-noise-dissolve.cjs --browser=all --functional --out=output/shaders-absorption/e01-new-functional.json
```

所有输出路径必须新建（wx）。`--verify=<report>` 只读复验完整六维 Engine Gate；功能子集有 Performance NOT_RUN 时不返回完整 PASS。性能采集只能在 Lead 授权的独占窗口追加 `--performance-authorized`，不可和其他浏览器收集器并行。

历史冻结状态（2026-10-09）：Chromium 六维Engine Gate通过；Firefox Performance LIMITED；WebKit Runtime同页live resize后GPU readback正确而compositor PNG不符，按独立控制证据记INFRA_FAILURE/BLOCKED，Performance LIMITED。Firefox三档与WebKit两档CPU计时全0低于观测精度，不是零成本或性能退化主张。真实三浏览器九配置每配置60steady样本，216 PASS/5 LIMITED/1 BLOCKED；整体未通过，Agent Gate未执行。本例保持 draft。

最终 [轻量证据摘要](../../docs/evidence/shaders-absorption/e01-summary.json) 绑定大型 raw/最终分类报告和47项篡改审计。原采集总CLI实际exit1保留，18个独立只读子验证exit0仅表示 `VALIDATION_OF_REAL_BROWSER_CAPTURE`，不冒称重采集或完整验收成功。

Gallery 规格结构已补齐 ready、五类 validation、coverage、screenshot 和源码行 api.evidence；`Texture2D.uploadData` 的调用仍在实现/数学文档中，Gallery claim 绑定当前公开 inventory 的 `Texture2D`。状态仍为 draft，规格结构有效不等于浏览器 Gate 完成。

**已实现 `window.__lifecycle` / `__lifecycleHold`。** 通过 `installShaderLifecycle` 桥接实例级 create/retire/recreate 到共享 `installAssetLifecycle` 合同。`validation.lifecycle` 声明 `resource-released`。Lead 已在三浏览器的 step/native 两种模式实际采集生命周期；当前证据由下述新 Gate 绑定，旧报告保留其原指纹。历史独立 E01 collector 300 实例证据保留为历史。

## 2026-10-10 复验

Windows WebKit 采集器使用 `shaders-browser-launch.cjs` 移除 Playwright 默认的 `--disable-accelerated-compositing`；同页 live resize 已通过原 compositor PNG oracle。未修改 SDK、重载页面或增加渲染 canvas。Gallery 桥接已实测 retire/reacquire、并发 Promise、引用归零和终态；原生 pacer 与 step clock 分别采证。

当前完整验收以 [Wave 1 当前 Gate](../../docs/evidence/shaders-absorption/wave1-r21-current-gate.json) 的输入指纹和结果为准。上文历史冻结报告不升级为当前 PASS。示例保持 Gallery draft；Agent Gate 独立且尚未运行。
