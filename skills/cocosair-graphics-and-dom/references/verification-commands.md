# Graphics and DOM verification commands

This reference contains the runnable-test and low-level-probe sections of
`docs/manual/graphics-and-dom.md` at commit
`66d11fd0c3c189b7dfa6d20645222e237352f9f3`. It is documentation, not a
browser execution result. Commands require a source checkout, an existing
bundle, and the stated browser tooling; copying the skills tree does not
copy the engine, examples, browsers or tools. Source-location strings below
are provenance within that checkout, not missing skill navigation targets.
Use the [environment rules](context.md) to locate the appropriate environment.

The excerpt preserves commands, prerequisites, write behavior, known failures
and the limits of each result. Other API setup sections remain in the
canonical manual available in the located checkout or installed package.

## 可运行测试场景

| 示例                                                                                    | 内容                                                                    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| graphics-svg-paints（源码定位：`examples/graphics-svg-paints/src/main.ts`）             | 原生 Graphics、渐变孔洞、非正方形 pattern、SVG 预览/实际下载与像素回环  |
| sprite-mask-blend（源码定位：`examples/sprite-mask-blend/src/main.ts`）                 | red/alpha、soft/threshold/inverted、原生粒子的 normal/add 对照          |
| dom-overlay-texture（源码定位：`examples/dom-overlay-texture/src/main.ts`）             | 真实输入/点击、移动/旋转、锚点、纹理 resize 后 GPU 显示、解绑与资源释放 |
| html-texture-experimental（源码定位：`examples/html-texture-experimental/src/main.ts`） | 实时表单纹理、DOM repaint、不可变 snapshot、普通浏览器 unsupported 分支 |

每页有“运行断言”和“释放资源”。释放后控件禁用；重新测试请重新加载页面。修改展示模式后状态回到 READY，避免把上一次 PASS 当作新模式的结果。

```powershell
node tools/dev/dev-server.cjs --example graphics-svg-paints
# 也可将 --example 替换为其他三个示例 ID。
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/graphics-examples.cjs --browser=all --out=output/graphics-examples/attempt-01.json
node tools/verify/graphics-examples.cjs --browser=all --mobile --out=output/graphics-examples/mobile-01.json
node tools/verify/graphics-examples.cjs --browser=chromium --channel=chrome --experimental-html --static --out=output/graphics-examples/static-01.json
node node_modules/typescript/bin/tsc -p tools/verify/graphics-examples.tsconfig.json
```

定向 runner 检查真实按钮、GPU 像素、SVG 下载内容、桌面/移动布局和释放的幂等性。`--static` 通过实际 Gallery builder 在临时目录构建这四个示例，并使用静态 JS/相对 entry 加载；不会重写默认 `build/examples/` 或正典证据。子集通过不代表整个 Gallery 构建通过。示例仍保留 draft 状态，未自动执行正式 stable 晋级。

普通展示使用原生主循环，运行断言/更新动作时暂停并用单一步进时钟。DOM 纹理场景同时检查原始 GPU 像素和实际 PNG 截图中的像素；runner 需要 Playwright 与 pngjs 工具环境。只凭 readPixels 不能证明合成显示正确，截图不匹配会使该场景失败。

本轮桌面到移动 viewport 切换在 WebKit DOM 场景出现间歇性黑图，PNG 门禁已捕获为 FAIL。独立移动启动通过不替代这一失败项；状态与复现记录见 实施记录（源码定位：`ai/plans/pixi-capability-implementation.md`）。

## 底层合同探针

```powershell
# 使用本机现有 Playwright 工具环境；不要为了运行检查改项目 dependencies。
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/graphics-and-dom.cjs --browser=all --out=output/graphics-dom/attempt-01.json
# Chromium 可额外开启实验特性；失败不能改记成正常功能通过。
node tools/verify/graphics-and-dom.cjs --browser=chromium --experimental-html --out=output/graphics-dom/experimental-01.json
# 使用较新的系统 Chrome 验证实验实现，不代表普通 Chromium 也具备它。
node tools/verify/graphics-and-dom.cjs --browser=chromium --channel=chrome --experimental-html --out=output/graphics-dom/chrome-01.json
```

输出路径必须是新文件；JSON 与同名 `-artifacts/` 截图保存本轮指纹。工具只读服务已有 bundle，不构建、不安装浏览器；测试执行范围不是整个 Gallery 或 release readiness。

HTML 实验 API 正在迁移。模块同时兼容旧 `layoutsubtree` 与新 `content="drawable"` 属性，并使用具备预分配能力的 `texElementSubImage2D`。不支持仅有旧 `texElementImage2D` 的浏览器。变更来源见 [Chrome API 迁移说明](https://developer.chrome.com/blog/html-in-canvas-ot-changes)。本轮系统 Chrome 的实际结果以执行计划链接的 JSON 为准；默认浏览器中的 UNSUPPORTED 不会转换成实验功能通过。

WebGPU transient MSAA 仍未实现：当前 WebGPU 子图缺少公开后端接线及外部编译资产，见 上游记录（源码定位：`docs/UPSTREAM.md`）。建立新后端、对应 shader 管线和跨浏览器合同后才能评估 transient attachments；WebGL2 resolve 不提供同一机制。
