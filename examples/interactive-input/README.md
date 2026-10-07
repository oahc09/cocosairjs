# Canvas 与 HTML 混合输入

运行 `npm run dev -- --example interactive-input`。Canvas 拖动由应用拥有；HTML button 保持标准 click；原生 range 自己编辑；rail 只消费横向 wheel，竖向 wheel/touch 留给浏览器滚动文档。`?control=html` 使用相同 DOM 且不导入 SDK，可比较取消后的 click 与原生滚动。

页面复用 `createActionState`、DOM `createActionInput` 和 `createSessionGate`。一个按钮 click 产生一对手动 press/release，由原生 pacer 消费一次。键盘 KeyD 使用现有 DOM 适配器；Enter、Space、Tab 依赖 HTML 原生行为。没有全局兼容 click 或 hover 禁用时间窗。

按钮保留 Text 节点，仅值变化时改 textContent。勾选“每帧重建文字”演示应用自己破坏节点身份的写法；节点变化与 click 是否被浏览器接收分开记录，不预设每个浏览器都会丢 click。

## 容器和取消

嵌入页为原生 GameDiv、Cocos3dGameContainer、canvas 设置宿主内 100% 宽高。初版缺少 wrapper 高度导致 canvas 溢出并遮挡按钮，已作为页面布局问题纠正；不是输入 SDK 的丢事件结论。

Reset、模式切换、resize、blur、hidden、pointercancel 和拖出 Canvas 推进会话代次并清空当前接触。适配器 gate 的失活立即清场。旧 pointerup 不能提交新拖动；取消中的 range input 会恢复最后已接纳值，下一次可信 pointerdown/键盘编辑重新准入。

释放先解绑所有 DOM/引擎监听，再将 renderer 的 mesh/material 借用置空，归还自有引用并关闭 app。release 缓存同一 Promise；所有控件终态禁用。页面关闭复用这条释放路径。

## 观测

`window.__mixedInput.snapshot()` 只读返回原始可信事件序列、会话、模型、实际 Node pose、相机 VP、布局、AFTER_DRAW 提交和资源引用；`release()` 返回实际引用与解绑回执。AFTER_DRAW 不是物理显示时刻。

采集器为每次连续操作记录前后模型、真实事件、提交帧和独立 PNG。按相机 VP 与模型位置重算红色目标的像素质心，至少 300 目标像素且误差 ≤2 CSS px；不能用 visibleUpdates 计数代替画面。合同测试生成的 PNG 仅验证拒收规则，不称浏览器证据。

滚动记录原生 deltaMode 与 deltaX/Y；当前项目 units = -delta ×5。竖向只观察文档 scrollY，不再转发；横向由 rail preventDefault 并更新值。两条责任不叠加。

## 范围

原云端混合输入页、原 touchCancel JSON 和实体触摸设备未提供。此例来源为 recreated，参考比较 NOT_RUN。Playwright touchscreen.tap 是浏览器 touch 通路，mobile viewport 下的 mouse click 不作为替代。Chromium CDP 可注入可信 touchMove、多指和 cancel；当前 Firefox/WebKit 工具仅有 tap，未支持的操作保留 NOT_RUN。无真实 blur/visibilitychange 的 headless 焦点转换也不能用 dispatchEvent 补绿。

当前采集及失败尝试将在本批台账记录；完整任务和发布验收不由这一页的子集通过代替。

## 本批实际结果（Lead，2026-10-08）

[规范报告](../../docs/evidence/examples/interactive-engine-improvements/input-s3.json)含三引擎×SDK/HTML两路径共400次独立连续操作及400 PNG，每条事件/模型/pose/提交/像素检查通过；SDK/HTML的mouse button、touch tap和mouse Canvas drag各20次，另Chromium两路径的CDP touch drag各20次。WebKit的触摸兼容click报告mouse，来源按实际前置touch pointerdown认定，不能反过来把该tap误标鼠标。

62条补充观察涵盖held click、Enter/Space/Tab、稳定/逐帧重建Text、即时hover、拖出/Reset/切模式/已观测resize/晚到range、竖向wheel只滚120 CSSpx一次与横向rail，以及Chromium多指/cancel/原生touch滚动。标准HTML对照零SDK请求。三SDK实例两资产均1→0，两路径release同Promise且退役后帧/监听无新增。

完整CLI实际exit=1、scopePassed=false：32项协议/焦点NOT_RUN保留；Chromium SDK路径仍收到两条PAL对不可取消touchcancel调用preventDefault的原生诊断。没有屏蔽console error；这条诊断也不把400次真实功能与画面观察改写成失败。完整范围仍未通过，不宣称已修PAL或实体触屏验收完成。

[实际报告审计](../../docs/evidence/examples/interactive-engine-improvements/input-s3-audit.json)29种操作、取消、覆盖、身份、滚动和释放篡改均引入独立拒绝；基线完整范围为失败，审计按新增拒绝原因判断，没有用既有PAL错误让所有坏克隆自动“拒绝成功”。聚焦26/26合同测试通过，合成PNG不是上述浏览器截图。

[首两轮失败记录索引](../../docs/evidence/examples/interactive-engine-improvements/input-failed-attempts-index.json)保留原始报告身份与错误；完整原始累计轨迹留在output。归档报告仅去除重复累计事件并保留每行eventTrace，PNG路径改到正式目录，其余测量未改。原始参考、物理显示时刻、实体设备和未支持的多触点协议仍NOT_RUN。
