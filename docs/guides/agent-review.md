# Agent Review：复核运行版本和实际画面

这是依托现有 AgentSession 和 MCP 浏览器适配器的源码仓工具，不新增引擎 API，不进入默认浏览器包或 SDK 的可执行入口。

```sh
npm ci
npm run build
npm ci --prefix tools/mcp
node tools/mcp/node_modules/playwright/cli.js install chromium
npm run dev -- --port 7454
```

另开终端（Node.js 22+），如使用自己已安装的 Chromium，可设 `AIR_CHROMIUM`：

```sh
node tools/mcp/agent-review.mjs doctor
node tools/mcp/agent-review.mjs inspect --url http://127.0.0.1:7454/gltf-viewer/
node tools/mcp/agent-review.mjs verify --url http://127.0.0.1:7454/gltf-viewer/ --node node__0 --min-pixels 1000 --out /tmp/air-review-gltf > /tmp/air-review-gltf.json
node tools/mcp/agent-review.mjs verify --url http://127.0.0.1:7454/glass-refraction/ --node 'Gemstone__0' --min-pixels 1000 --out /tmp/air-review-glass > /tmp/air-review-glass.json
```

- `doctor` 检查本地 bundle 来源及浏览器可执行文件是否存在，不启动浏览器，也不证明浏览器能启动。
- `inspect` 只读检查场景；`capture` 采集一张受控推进后的画面，不做场景验收。
- `verify` 检查预期节点、非均匀像素下限、会话可见的运行错误。输出一行 `air-agent-review-v1` JSON；失败退出非零。断言失败也保留已成功取得的 PNG。必须指定全新 `--out` 目录，父目录必须存在。
- 收据记录真实 dev bundle 的 SHA-256、源码绑定收据、页面 URL、会话／场景身份、实际渲染后端、取帧时间／编号及 PNG 哈希。会话内换页或换场景拒绝返回新目标作为旧证据。本地构建必须与浏览器收到的正文和浏览器桥的实际引擎实例相符。这证明的是这一份引擎 bundle，不是页面全部应用脚本和素材的发布签名。
- 每条命令启动并关闭自己的一次性浏览器，不附着已有浏览器；调用者负责启动与停止 dev server。只支持受信任的 loopback 开发页、默认开发 ESM、WebGL 2（当前浏览器适配器走 SwiftShader）；不提供生产控制、持久守护进程或安全沙箱。截帧会推进一帧，不是无副作用读取。
- 通用像素断言按相对第一个 RGBA 像素有明显差异的像素计数，不证明节点可见、指定材质正确或图像与产品图一致。错误计数限于当前会话观察窗口。实交互、局部像素或多 Pass 结论需要另做针对性断言；详见 [Agent MCP](agent-mcp.md) 和 [视觉探针](../../skills/cocosair-agent-session/references/visual-probes.md)。

对应端到端回归：`node tools/mcp/agent-review-browser.mjs`（通过 `AIR_REVIEW_BASE` 指定已启动的 dev server）。正例取两张真帧；负例使用临时 loopback 页面检查均匀帧和错误 bundle，保留独立收据，不改动场景源码。

## 玻璃折射：区分背景捕获与合成故障

```sh
node tools/mcp/agent-review.mjs glass-passes --url http://127.0.0.1:7454/glass-refraction/ --out /tmp/air-review-passes
node tools/mcp/glass-pass-browser.mjs
```

只适用于当前玻璃示例的 WebGL 2 路径。临时使用现有 transmission 控件，在同一会话固定时间步比较 0 和 0.95，结束恢复控件值并关闭浏览器。在各自的 AFTER_DRAW 读取真实 RGBA8 背景附件和最终帧；报告附相机排序、读写纹理绑定、材质实际参数及 PNG 哈希。相机排序来自原生 priority，不是 GPU 指令追踪。

- `BACKGROUND_NOT_CAPTURED`：没有启用的背景捕获。
- `COMPOSITE_INPUT_INVALID` / `COMPOSITE_NO_EFFECT`：背景有真实像素，但输入绑定、先后关系或最终合成响应不成立。没有响应不等于定位到 shader，几何可见性也可能是原因。
- `READBACK_UNVERIFIED` / `BACKGROUND_EMPTY` / `BACKGROUND_CHANGED`：不以缺失证据判定成功。
- `TRANSMISSION_OBSERVED`：两帧背景内容一致且非均匀，真实材质参数变化，最终图像有相应变化。这不是通用 RenderGraph 回放、物理正确性或视觉对标。

端到端测试使用同一示例、同一引擎，另外在隔离页面注入两个故障：关闭背景相机对应的捕获组件，以及仅把玻璃模型移出画面以让合成失效。

## 程序化资产：验证生成、加载和真实画面

```sh
node tools/fixtures/seeded-material-panel.cjs generate --seed 42 --out /tmp/air-seeded-panel
node tools/fixtures/seeded-material-panel.cjs check --seed 42 --out /tmp/air-seeded-panel
node tools/mcp/seeded-panel-browser.mjs
```

这是 AIR 的小型验证夹具，不是新资源格式或通用资产构建器。生成器把固定几何、seed 驱动的 64×64 瓷砖 PNG 和标准 PBR 材质写入常规 GLB，另存原始 PNG 与收据。收据固定生成器 SHA-256、参数、编码工具链版本和两个文件的 SHA-256，不记录生成时刻或目录。复验时按指定 seed 独立重建并逐字节核对，不能只改收据来接受被替换的文件；目标是同工具链复现，不承诺跨编码器版本的字节一致。

测试用三份独立浏览器上下文运行原生 glTF Viewer。两次独立生成的同 seed PNG／GLB／收据字节一致，浏览器画面也一致；改 seed 必须产生可见差异。篡改的 GLB 在提供给 Viewer 前就被拒绝。通用资产构建和登记规范不在此试点内。

## 一起复跑三条验收

仓库的 Code quality 提供独立的 `agent-review` 模式，不改变常规检查的范围。它使用 `tools/mcp` 锁定的 Playwright 和配套 Chromium，在一个新构建、一个 loopback 服务器上顺序运行三条验收，保留对应 SHA、日志和原始证据。这个模式不代表全浏览器验收或发布审批。

本地按前文装好依赖和 Chromium，然后运行 `npm run build`，再执行 `bash tools/mcp/review-ci.sh /tmp/air-agent-review-new`。输出目录必须是绝对路径且尚不存在；复用已安装 Chromium 时可设 `AIR_CHROMIUM`。
