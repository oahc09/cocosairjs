# Agent 调试会话与面板

> 位置：`tools/debug/agent-session.ts`、`tools/debug/panel.ts`。**不属于默认
> cocosair Runtime 导出**：不进入 `build/cocosair.module.js`（smoke-23 真实输出
> 守卫）、不进入 npm 包；仅 dev 页面显式 `import('/__debug/...')` 时由 dev server
> 按需打包加载（`cocosair` 留给页面 importmap，与页面共享同一引擎实例）。

## 1. 启用与数据边界（§6.1）

- 显式 attach：`createAgentSession({ app, writableScenes?: Scene[] })`。
  未列出的 Scene 只能观察（写操作 → `OUT_OF_SCOPE`）。
- 本版仅支持同一开发页面内调用；**无 MCP、无远程 HTTP/WebSocket 控制协议**，
  不向任何外部服务发送截图或场景数据。
- dev 页面的启用入口：右下角 `debug` 按钮（dev server 注入，点击才加载 panel.js，
  默认页面加载请求不含 debug/agent 模块）。
- 面板要求页面显式暴露 `window.__airApp`（不读取隐藏全局引擎状态猜测目标）。
- detach（`close()`）后所有请求返回 `SESSION_CLOSED`；监听器、观察 hook、工具
  UI、session 自有节点/实例/资产全部移除或销毁。

## 2. 观察数据合同（§5）

- `inspectScene()`：sceneId（session 内稳定）、name、节点数、组件数
  （componentsByType 区分 Camera/Light/Renderer）、唯一资源数（byKind），
  以及场景树平铺列表 `{id,name,parentId}`（上限 500 行，超出 `truncated:true`）。
- `inspectNode(id)`：id/name/parentId/childrenIds/active/activeSelf、组件列表
  （type 为真实构造名，不简化）、local transform、world position。
- `inspectAsset()`：复用 `tools/verify/runtime-assets.js` 报告
  （counts/resources/references/diagnostics/**unchecked**）；未知状态不写成 PASS；
  不增加资产引用、不创建 MaterialInstance、不执行 custom resolver。
- ID 规则：session 内稳定（对象键），同名节点不同 ID；节点销毁或不在当前运行
  场景树 → `STALE_TARGET`；数据 JSON 可序列化、无活对象/循环引用。

## 3. 操作合同（§6.2）

请求：`dispatch({ requestId, action, targetId?, params? })` →
`Promise<{ requestId, ok, result | error }>`；错误码：`INVALID_ARGUMENT` /
`STALE_TARGET` / `OUT_OF_SCOPE` / `UNSUPPORTED_ACTION` / `LOAD_FAILED` /
`SESSION_CLOSED`（capture 另有 `CAPTURE_FAILED`）。

| action | 行为 | 边界 |
|---|---|---|
| createNode | 在许可父节点下创建原 Node | 不生成场景 DSL |
| addComponent | 白名单：MeshRenderer/Camera/DirectionalLight/PointLight/SphereLight/SpotLight/Animation | 白名单外 → `INVALID_ARGUMENT`；不动态 import |
| setTransform | `space: local/world` × position/rotationEuler/scale | **先验证全部参数再统一应用**（失败请求零副作用）；scale 支持 world 语义（`setWorldScale`）；world 欧拉角本版要求父级无旋转 |
| loadAsset | `GLTFLoader.loadAsync(url)` | glTF 稳定错误码保留在 `error.cause.code`；失败记入错误缓冲；session 明式 `addRef` 持有一份引用 |
| instantiateAsset | 资产现有 `instantiate()`；`params.parentId` 需可写 | 实例生命周期沿用 GLTFInstance.dispose |

- 同步变更串行执行；无事务/跨命令回滚承诺。
- **共享资产所有权**：加载走的 asset-manager 按 URL 缓存，同 URL 可能返回被其他
  session/业务共享的同一 `GLTFAsset`。session 对加载结果持有独立引用计数
  （`addRef`/`decRef`），close 只释放自己这份，**绝不 `destroy()`**——两个 session
  加载同 URL 后关闭其一，另一方的资产与业务侧缓存均不受影响（回归测试覆盖）。
- requestId：执行中或保留窗口内（60s，FIFO 上限 512）重复 → `INVALID_ARGUMENT`
  （**不要盲目重试 create/addComponent**）；重启 dev server 或页面后不跨实例去重。
- close() 清理 session 自有节点/实例/资产；**对已有节点的显式编辑不自动撤销**；
  关闭中完成的异步加载立即释放（响应 `SESSION_CLOSED` 或 `LOAD_FAILED`，不悬挂）。

## 4. captureFrame（§6.3）

- 在 `Director.EVENT_AFTER_DRAW`（GL 提交完成后）读 canvas，返回
  `{ png(dataURL), width, height, sceneId, frameIndex, sampledAt }`；
- 默认不改变播放状态；超时（默认 5s）、canvas 不可读/跨域污染 → 结构化
  `CAPTURE_FAILED`，**不交付旧截图冒充新帧**；空场景合法。
- 生命周期：进行中的 capture 登记在 session 内——`close()` 取消监听与定时器并以
  `SESSION_CLOSED` 拒绝；绘制回调发现场景已替换（与请求时快照不同）→ `CAPTURE_FAILED`，
  不返回另一场景的画面；`sceneId` 取请求时快照。

## 5. 错误收集（§6.4）

- 复用 `tools/dev/air-prelude.js` 的分发 hub（`window.__airErrorHub.subscribe`）：
  **hub 存在时只订阅**（不安装自有 window error/unhandledrejection 监听、不包裹
  WebGL 函数），同一事件只产生一条记录，`unhandled-rejection` 类别经 hub 原样保留；
  无 hub 时才安装自有 hook（window 监听 + getContext 包裹），最后一个 session
  detach 时按 capture 标志精确恢复原函数。
- `getRuntimeErrors({ since?, limit? })` → `{ errors, dropped }`；条目含
  seq/time/category（window-error/unhandled-rejection/shader/link/session-load）/
  message/requestId；环形缓冲默认 200 条（首个 session 固定），暴露 dropped 与
  `clearRuntimeErrors()`；不调用 gl.getError 消耗引擎错误队列。
- attach 幂等（多 session 共享同一 collector/hub 订阅）；不承诺捕获 attach 前
  已丢失的错误。

## 6. Debug 面板（T5）

- 分区：Scene Tree（点击选择）→ Node 只读详情 / Asset 清单与诊断 / 运行错误 /
  性能摘要（draws、shader/link 错误、fps、JS heap）/ 截图（AFTER_DRAW PNG 预览 + 下载）。
- 数据与操作全部经同一 session；第一版不做通用属性编辑器（操作演示见 automation 示例）。
- 窄屏可用（`min(360px, 42vw)`）、键盘可用（**Alt+D** 开关、Esc 关闭）、
  面板错误只显示在面板内不进主循环；关闭后无 DOM/监听器/rAF 残留（G5 实测）。

## 7. 门禁结果

- G3/G4 单测：`test/smoke/smoke-22-agent-session.test.ts`（23 用例：ID 稳定性、
  STALE_TARGET、OUT_OF_SCOPE、requestId 窗口、关闭中异步、CAPTURE_FAILED、
  环形缓冲上限、hook 恢复、监听器泄漏回归、共享缓存资产关闭安全、
  setTransform 原子性与 setWorldScale、pending capture 生命周期、
  close 全映射清理、hub 去重与类别保留）。
- G4 浏览器闭环：automation 示例 13 pass / 0 fail（真实 WebGL 截图 + 新帧差异）。
- G5 面板浏览器验证：`tools/verify/devtools-panel-browser.cjs` 7/7
  （显式启用、树+详情、错误定位、截图、性能、Alt+D、关闭无残留）。
- 隔离守卫：smoke-23（默认 bundle 零 debug 标识 + 包清单 + 示例动态 import 形态）。
