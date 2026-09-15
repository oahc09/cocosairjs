# automation — 开发期观察/操作工具闭环（V0.5.1 T2 + T3/T4）

## 演示内容

通过 `import('/__debug/agent-session.js')` 显式加载 Agent Development Session（V0.5.1 T3/T4，
不属于默认 runtime 包），在真实运行场景上完成一次可核验的闭环（计划书 §6 门禁 G4）：

1. `createAgentSession({ app, writableScenes: [scene] })` 显式 attach（可写范围显式给出）；
2. `inspectScene` 观察：区分节点数/组件数/唯一资源数，发现已有节点 ID；
3. 操作：`createNode` → `setTransform` → `addComponent`（白名单内）；
4. `inspectNode` 回读验证写生效、ID 稳定；
5. 非法请求无副作用：白名单外组件 / 重复 requestId / 未知 targetId / 只读 session 写操作，
   分别返回 `INVALID_ARGUMENT` / `STALE_TARGET` / `OUT_OF_SCOPE`；
6. `captureFrame` 在 AFTER_DRAW 受控时机截图，操作前后两张不同 → 是新帧；
7. `getRuntimeErrors` 结构与环形缓冲；
8. `close()` 清理自有节点与监听器，之后所有请求返回 `SESSION_CLOSED`。

## 前置 DOM

`index.html` 中 `<canvas id="GameCanvas">`；页面日志区为运行时注入的 `<pre>`。

## 启动（仅 dev server）

```bash
npm run dev -- --example automation
# → http://127.0.0.1:7454/automation/
```

## 预期操作与观察

- 页面无交互要求；打开即自动执行闭环并在左上角日志区逐行输出 PASS/FAIL；
- 全部通过时最后一行为 `闭环完成：N pass / 0 fail`；
- 浏览器控制台同步输出相同内容。

## 能力边界

- 依赖 dev server 的 `/__debug/` 路由：静态托管或 npm 包内打开时降级为明确报错，不静默；
- 无外部模型、无 AI 服务调用；本版无 MCP/远程控制协议（同一开发页面内调用）。
