# Native Thin Film

在仓库服务器打开 `examples/shader-thin-film/`。单个 Cocos WebGL2 canvas 显示 circle/rounded-box 内侧虹彩，侧栏支持十个参数和暂停、恢复、重置、释放。普通页面使用原生 pacer；`?test=1` 由 collector 使用独立 step clock，不自动增加第二个渲染循环。

参数的 type/default/range/unit/updateMode 同源于 [parameters.json](parameters.json)。shape 属于 structure 参数，会先解绑/销毁旧自有资产后重建；其他参数更新材质 uniform。未知键、错误类型、NaN/Infinity、非法 enum/范围在调用 SDK 前整体拒绝。释放后终态拒绝。

参考与差异见 [UPSTREAM.md](UPSTREAM.md)，实现/证据/限制见 [thin-film.md](../../docs/effects/thin-film.md)。历史采集的 WebKit 同页 live resize PNG 呈现未通过；不以正常初始截图或 GPU 回读替代这项验收。

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/shaders-thin-film-browser.cjs --browser=all --phase=functional --out=output/shaders-absorption/e02-new.json
node tools/verify/shaders-thin-film-browser.cjs --verify=output/shaders-absorption/e02-new.json
```

输出必须为新路径，不覆盖旧尝试；performance 模式仅在独占性能窗口运行。所有计时/PNG验证属于 Engine Gate；Agent Gate 未执行。

最终只读索引校验：`node tools/verify/shaders-thin-film-summary.cjs --verify=docs/evidence/shaders-absorption/e02-thin-film-summary.json`。历史冻结采集的 Chromium 六维 PASS；Firefox 请求 DPR2 的 mobile 性能只观测到 DPR1（LIMITED）；WebKit 同页 resize compositor BLOCKED。完整 Engine Gate 保持 BLOCKED，不能用 schema-valid 或其他正常 PNG 补偿这些未达项。全量实际数据位于 `output/shaders-absorption/`，仓库 evidence 只保轻量 summary。

Gallery metadata 的 `api.claims` 和源码行号是可执行调用绑定，不等于 API 验收 PASS。**已实现 `window.__lifecycle` / `__lifecycleHold`**：`installShaderLifecycle` 桥接实例级 create/retire 到共享合同，`validation.lifecycle` 声明 `resource-released`。Lead 已在三浏览器的 step/native 两种模式实际采集生命周期；当前证据由下述新 Gate 绑定，旧报告保留其原指纹。历史独立 collector 300 实例周期证据保留为历史。

## 2026-10-10 复验

Windows WebKit 采集器使用 `shaders-browser-launch.cjs` 移除 Playwright 默认的 `--disable-accelerated-compositing`；同页 live resize 已通过原 compositor PNG oracle。未修改 SDK、重载页面或增加渲染 canvas。Gallery 桥接已实测 retire/reacquire、并发 Promise、引用归零和终态；原生 pacer 与 step clock 分别采证。

当前完整验收以 [Wave 1 当前 Gate](../../docs/evidence/shaders-absorption/wave1-r21-current-gate.json) 的输入指纹和结果为准。上文历史冻结报告不升级为当前 PASS。示例保持 Gallery draft；Agent Gate 独立且尚未运行。
