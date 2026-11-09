# 本地 Agent MCP 开发闭环

这是从 67.js 的 Agent 工具设计借鉴的第一阶段实现，不是其渲染器移植。源码独立实现，继续使用原生 Cocos 对象和已有 AgentSession。

## 启动

从仓库根目录安装开发依赖并准备经过验证的主引擎构建。MCP 工具依赖单独安装，既不加入主 package.json，也不进入默认 SDK：

```bash
npm ci
npm run build
npm ci --prefix tools/mcp
node tools/mcp/node_modules/playwright/cli.js install chromium
npm run dev -- --port 7454
```

在 MCP 客户端配置 stdio 命令，使用当前仓库的绝对路径：

```json
{
  "mcpServers": {
    "cocosair": {
      "command": "node",
      "args": ["/absolute/path/to/cocosairjs/tools/mcp/cli.mjs", "--url", "http://127.0.0.1:7454/hello-cube/"]
    }
  }
}
```

工具包要求 Node.js 22+，不改变主 SDK 的 Node 声明。也可通过宿主环境变量 AIR_CHROMIUM 指定已安装的 Chromium 可执行文件；该路径不是 MCP 参数。需要写场景时由启动者显式增加 `--writable`。每个进程启动自己独立的无登录态 Chromium，不连接用户的既有浏览器。页面必须显式提供 `window.__airApp` 并已经运行场景。

## 工具

- `air_capabilities`：会话的工具协议版本、可写状态、限制和不支持项；不是引擎全能力清单。
- `air_inspect`：scene/node/assets/errors。先读 scene 获取真实节点 ID，禁止猜 ID。
- `air_create_node`：在许可场景下创建一个原生 Node，最多 128 个；重复 requestId 在现有 AgentSession 的 60 秒、有限容量窗口内拒绝。超出窗口不提供恰好一次保证，切勿盲目重试。
- `air_set_transform`：一个节点的 local position/rotationEuler/scale，先验证后应用。返回 before/after、committed 与受控帧结果。写入已成功但随后的绘制失败时，仍明确报告 committed，不能当作没有执行。
- `air_capture`：推进一帧并在 AFTER_DRAW 读取 PNG，返回实际尺寸、sceneId、frameIndex、sampledAt。它会推进应用状态，不是无副作用读取，也不保证任意物理/脚本可重放。
- `air_close`：释放会话持有的资源并关闭其浏览器。修改已有节点不会被自动撤销。重复关闭安全；之后观察/修改/截图拒绝，能力描述仍可查询。

推荐闭环：capabilities → inspect scene → inspect node → set transform → capture → inspect errors。发生错误先读取结构化错误；会话关闭、场景替换或超时后，重新启动并重新观察，不复用旧 ID。

## 安全与生命周期

仅接受启动时固定的 `http://127.0.0.1:端口/路径/` 页面，无查询、片段和凭据。页面/资源请求限制为这个 origin，拒绝所有 HTTP 重定向，禁用 WebSocket、service worker、下载和弹窗。页面仍是受信任的本地开发代码，**此工具不是恶意 JavaScript 的安全沙箱**。不要指向不信任的服务或生产应用。

无 eval、任意代码工具、任意文件路径、远端资产 URL 或资产加载操作。复用 AgentSession 的可写范围和稳定 ID。场景替换后拒绝操作，不静默把新场景设为可写。批量事务、checkpoint、撤销、全局 revision、材质修改、资产 catalog、多视角 review 和视频导出均未实现。

输入 schema 严格拒绝未知字段。请求串行处理，最多 8 个排队调用；观察 JSON 上限 128 KiB、PNG 上限 1 MiB、浏览器 viewport 固定 640×480。Node 创建有 128 个累计上限；这不是总 GPU 内存估算。超限返回明确错误，不把截断数据冒充完整报告。

写操作和 capture 使用已有 createStepClock，在结束时释放独占时钟。并发 capture/step 的失败均先完成各自清理，再释放 lease。10 秒工具超时触发 fail-closed 浏览器关闭；浏览器内清理最多等 500ms，然后执行物理关闭。超时写入结果可能不确定，错误会明确提示。stdin EOF / SIGINT / SIGTERM 同样清理拥有的浏览器。

## 验证与写入范围

```bash
npm test --prefix tools/mcp
node tools/mcp/check-bridge-types.cjs
node node_modules/jest/bin/jest.js --runInBand test/smoke/mcp-bridge.test.ts test/smoke/smoke-22-agent-session.test.ts test/smoke/smoke-23-debug-isolation.test.ts
npm run test:browser --prefix tools/mcp
```

最后一项需要前述 dev server、可运行 Chromium、WebGL2 和主引擎产物；默认测试 hello-cube，可用 AIR_MCP_URL 指定同样含 Cube 节点的本地测试页。它使用真实 SDK stdio client，不是把 JavaScript 函数调用伪装成 MCP。覆盖只读拒绝、非法参数、节点移动后的新帧与前景像素消失、重复 requestId、节点创建、错误读取及关闭。

根开发依赖中的 pngjs 用于像素验证。可选 AIR_MCP_EVIDENCE 指向宿主选定的输出目录，会写入 before/after PNG；未设置时不写截图。工具不会自动创建该环境变量，也不接受 Agent 提供的输出路径。单元测试不写业务文件；浏览器测试会启动/关闭临时浏览器、在其独立页面内修改并恢复 Cube，不修改源文件。npm ci 写 node_modules；浏览器安装写 Playwright 缓存；build 会更新构建身份与产物，按仓库构建合同处理。

这些是定向验收，不代表完整 Gallery、跨浏览器、性能或发布门禁通过。历史 build 与源码、当前工具验证范围应分别记录。
