# 端口输入、切换与场景检查

这些配方使用现有原生 API。当前依据为源码和既有合同测试；本轮浏览器结果见[台账](../../ai/ledgers/port-gap-remediation.md)，尚未完成的范围不能由本页推断为PASS。

## 单路触摸与纯输入区域

桌面鼠标 down/move/up 已由 `Input._simulateEventTouch` 转成 TOUCH_START/MOVE/END。UI节点和全局 input都可以只订阅触摸通道，避免再订阅鼠标而双计数。UI命中可能阻止全局事件，局部交互应订阅对应节点。

```ts
import { Scene, Node, UITransform, Input, createUICanvas } from 'cocosair.js';

const scene = new Scene('Input');
const ui = createUICanvas(scene);
const region = new Node('DragRegion');
region.layer = ui.layer;
region.addComponent(UITransform).setContentSize(240, 160);
ui.addChild(region);
const onStart = () => { /* 开始当前业务拖动 */ };
region.on(Input.EventType.TOUCH_START, onStart);
// 不需要 Sprite、Label或透明贴图；需在正确的UI相机/层级中。
// 会话结束：region.off(Input.EventType.TOUCH_START, onStart);
```

原生鼠标合成触点使用ID 0；真实触摸、取消和混合设备序列必须分别验证。不能把一段桌面点击结果推广为所有设备共存合同。离开画布不自动证明已发送TOUCH_CANCEL，动作状态层应按blur/hidden/pause显式reset。

键盘绑定、import前自定义canvas预绑定、Start/Resume聚焦和editable规则见[脚本组件流程](script-component-workflow.md)。自定义画布同时显式传入 `new SceneStack(scene, { canvas: app.canvas })`；栈的默认画布查询仍使用 `GameCanvas`。

## Code First 切场景

| 操作 | 适用场景 | 生命周期边界 |
| --- | --- | --- |
| `app.run(new Scene(...))` | 原生替换整个场景 | `runSceneImmediate` 替换旧场景；全局 input监听、业务Promise和资产引用须独立收口 |
| `new SceneStack(scene)` | 同一Scene内的页面导航 | 页面Node active=false保留状态；pop/LRU销毁子树；过渡输入屏蔽，dispose清理栈监听 |
| `director.loadScene(name)` | 已配置bundle场景资产 | 依赖原生bundle/.scene资产；不负责发现Code First工厂 |
| 整页reload | 重建全局引擎及import时平台绑定 | 丢弃当前文档状态并重新boot；不等于场景内最小释放 |

`Scene.destroy()` 明确不销毁相关资产。组件在onDisable退订；业务scope撤销异步generation、归还自己addRef的引用。已实现的 `app.releaseScene()` 回执与配对示例见[安全启动与释放](safe-startup-and-release.md)。三浏览器各100次实际绘制/释放已通过，回执记录实际清理状态和保留范围；GPU 分配量仍为 unavailable，10分钟稳定性待验，不能由节点失效推断无泄漏。

## 复用现有检查工具

开发服务器可解析 `tools/debug/` 的TS；应用显式接入，默认运行时包不包含这些工具。

```ts
import { createAgentSession } from '/tools/debug/agent-session.js';
import { createDebugPanel } from '/tools/debug/panel.js';

const session = createAgentSession({ app });
const summary = session.inspectScene();
console.log(summary.nodes, summary.truncated);
const panel = createDebugPanel({ app });
// inspector给节点稳定ID；已有节点需要显式writableScenes授权才允许写入。
// 调试结束：panel.close(); session.close();
```

场景与资源列表上限为500行，`truncated`表明结果未完整，不可拿截断计数统计整个场景。`session.close()`幂等移除自有hook、取消capture、归还自有引用；关闭后请求报 `SESSION_CLOSED`。panel.close同时关闭panel创建的session，但独立创建的session仍需自行close。

蒙皮节点的 `session.inspectNode(id).visual.mesh.skinning` 分列请求模式、有效模型/传输、实际palette容量、根空间bounds与反射标志；合法自动texture不会被当错误。观察不创建材质实例或改变引用，内部数组缺失时返回null，最多展示80个palette并披露截断。使用边界见[蒙皮手册](skinning-code-first.md#容量与只读观察)，不能由该摘要推断GPU分配量或所有剔除原因。

`session.inspectNode(id).layer` 和 `visual.mesh.visibility` 展示当前节点层、model标签及最多80个相机的掩码/启用/视锥观察。原生过滤是“mask包含全部Node.layer，或与model.visFlags有交集”，两支满足任一即可。`LAYER_MASK`、`FRUSTUM`、`MODEL_DISABLED`、`CAMERA_DISABLED` 等原因不会写入引擎错误通道；正常剔除允许没有错误。`PASSES_OBSERVED_FILTERS` 只表示已观察的过滤条件通过，还需检查材质、shader、LOD及实际像素。

观察读取原生当前缓存，不主动更新矩阵、相机或绘制；尚未完成绑定返回null/`MODEL_NOT_READY`，缺少可用bounds或视锥检测返回`FRUSTUM_UNCHECKED`。独立使用 `tools/debug/render-visibility.ts` 时须显式传入原生 `geometry.intersect.aabbFrustum`，不能以未知结果判定可见。三浏览器8种渲染状态及重复只读观察已有像素对照，仍不认证所有渲染管线或GPU分配量。

## 编程前检查签名

```powershell
node tools/verify/air-signature-usage.cjs --types path/to/main.ts
node tools/verify/air-signature-usage.test.cjs
```

检查器只读取指定JS/TS文件，解析真实原生类型，同时输出TypeScript诊断与三种语义误用：Scene.addComponent兼容stub、消费addChild的void返回、IGeometry直接赋给Mesh。使用 `node.addComponent(Camera)`、保留child引用、`utils.createMesh(primitives.box(...))`。

检查器不是整个应用的证明：any/dynamic别名、运行时可见性、焦点、资源释放和像素另需实际验证。旧公开签名和导出不因增加检查器而变化。
