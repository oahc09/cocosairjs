# 确定性测试输入

`tools/debug/test-input.ts` 提供显式启用的 `createTestInput`，用于手工步进测试。它向指定 canvas 派发合成 DOM 键盘/触摸事件，经原有 PAL、`input` 和 UI 命中派发链到达业务监听器；不直接调用业务回调，不复制鼠标转触摸算法。工具不在默认运行时导出，也不安装监听器、定时器或另一套渲染时钟。

合成事件的 `isTrusted` 为 false，会绕过物理键盘的焦点准入；返回值仅证明事件已派发，不保证业务回调成功。真实焦点、默认行为、OS 输入及设备仍用[浏览器输入合同](porting-input-and-inspection.md)分别验收。原生 PAL 必须已绑定同一 canvas，并支持触摸通道；不支持的环境不能据一次 DOM dispatch 声称引擎已收到触摸。

## 与单时钟配对

本仓开发服务器可以解析工具 TS；独立部署测试页需显式编译该模块。先初始化引擎、运行场景，再启用测试工具：

```ts
const clock = createStepClock();
clock.begin(); // 暂停真实循环，之后只由测试调用step。
const { createTestInput } = await import('/tools/debug/test-input.js');
const synthetic = createTestInput({ canvas: app.canvas, session: app.session });
app.session.own(() => synthetic.dispose(), 'test-input');

synthetic.key('down', 'KeyA');
await clock.step(1 / 60);
synthetic.key('up', 'KeyA');

// clientX/Y为CSS视口坐标。PAL负责映射到物理屏幕/设计坐标，不预乘DPR。
const first = { id: 11, clientX: 240, clientY: 180 };
const second = { id: 12, clientX: 420, clientY: 300 };
synthetic.touch('start', [first, second]);
synthetic.touch('end', [first]);
synthetic.touch('cancel', [second]);
synthetic.dispose();
```

输入派发不自动推进帧，零 tick 快按/快放仍由生产动作 reducer 保留有序边沿。`clock.step()` 必须在暂停状态调用；工具不会代替业务定步 accumulator 或自动调用 `clock.end()`。回执为冻结的 `{ method: 'SYNTHETIC', channel: 'DOM_PAL', isTrusted: false, type, changedIds }`，不能标为可信输入。

## 身份与所有权

- `key('down'|'up', code)` 使用 `KeyboardEvent.code`；同键再次down设置repeat，原生PAL按自己的KeyCode映射派发。未知code不保证产生有效原生键码。
- `touch('start'|'move'|'end'|'cancel', points)` 中id为正安全整数，0保留给原生鼠标模拟触点。start要求新id，其余阶段要求本工具已持有id；重复id、非有限坐标或非法序列整批拒绝，状态不变。
- `activeIds` 为冻结快照。触点列表包含当前活动触点与本次变化触点；引擎按当前 `event.touch` 分别做UI命中，全局动作适配器只处理真正到达全局的那一个触点，不导入被UI吞掉的兄弟触点。
- 显式session失活或代次变更后拒绝新注入。`dispose()` 幂等，向仍持有的键发送up、触点发送cancel，随后为终态；新会话新建工具。消费方应避免与真实设备使用相同id，工具不接管真实设备的触点。

错误码为 `AIR_E_TEST_INPUT_ARGUMENT`（canvas/phase/id/坐标/code）、`AIR_E_TEST_INPUT_SEQUENCE`（触点状态）、`AIR_E_TEST_INPUT_INACTIVE`（会话）、`AIR_E_TEST_INPUT_DISPOSED`（终态）。工具没有自动后台输入或恢复上下文功能。

## 当前证据

`test/smoke/port-gap-test-input.test.ts` 验证实际DOM事件、无效批次不污染、会话/终态及配对释放；`port-gap-action-multi-touch.test.ts` 验证真实PAL→Input→适配器并以受控UI边界检查部分吞噬。真实UITransform命中、同批多指取消、单步更新和独立可信协议键盘/tap由 `tools/verify/air-test-input-browser.cjs` 在三浏览器采集。报告分别标明合成与可信协议来源；可信协议不是实体硬件认证，完整混合设备/后台切换与最终候选状态见[台账](../../ai/ledgers/port-gap-remediation.md)。
