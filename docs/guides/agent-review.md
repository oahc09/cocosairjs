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
