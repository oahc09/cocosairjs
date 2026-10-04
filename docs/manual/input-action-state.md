# 输入动作状态（Action State）

`createActionState` 是纯输入动作 reducer：把"某个物理输入源（按住的键 / 触点）"与"游戏动作"解耦。它不订阅任何事件通道（对引擎只有 `import type` 类型依赖）；事件接线由 `createActionInput` 适配器完成。共同合同见[端口缺口实施合同](../reference/port-gap-contracts.md)。

> 当前源码公开导出 reducer 与适配器，使用者显式选择后端并接线，bootstrap 不自动安装动作监听。Jest 通过原生派发和受控 DOM 测试；`air-action-input-s3-canvas-leave.json` 另有三浏览器×native/dom×默认/自定义 canvas 的12用例，验证真实协议键盘、鼠标和可信 touch tap。报告与剩余范围见[台账](../../ai/ledgers/port-gap-remediation.md)；混合设备取消、多指、hidden/blur 和最终安装包候选仍需补齐，不称完整发布验收。

## 词汇对应

native后端消费原生逐触点派发的 `event.touch`，不遍历整批 `getTouches()`；同批其他触点可能已被UI吞掉。测试注入的多指/部分UI命中配方见[测试输入](test-input-injection.md)。

计划里的 continuous/press 两类使用语义在本实现中的便利形式：

- `mode: 'button'`（默认）＝ press 型离散动作：inactive→active 产生一次 press 边沿；持续按住用 `held()` 查询（continuous 持续语义）。
- `mode: 'axis'` ＝ 连续模拟量：只有 `held()` 与 `axis()`（贡献值之和截断到 [-1,1]），不产生 press/release 边沿。
- 有序 transition 合同由 `consumeTick().transitions` 承担（见下），不是靠 `pressed[]/released[]` 便利 flag。

## 声明动作

```ts
import { createActionState, createActionInput, createSessionGate, KeyCode } from 'cocosair';

const state = createActionState({
    actions: {
        fire: { sources: [{ backend: 'dom', physicalCode: 'KeyF' }] },
        jump: { sources: [{ backend: 'dom', physicalCode: 'Space' }] },
        moveX: { mode: 'axis', sources: [
            { source: { backend: 'dom', physicalCode: 'ArrowLeft' }, value: -1 },
            { source: { backend: 'dom', physicalCode: 'ArrowRight' }, value: 1 },
        ] },
        touch: { sources: [{ backend: 'dom', pointerId: '*' }] }, // 动态指针用模式绑定
    },
});
```

- 一个动作持有 source 集合（或语义）：释放其中一个键/触点只移除该 source，绝不误置 `held=false`。别名键（`'KeyA'` 与 `KeyCode.KEY_A`）是不同 source，永不混同。
- 运行期校验（稳定 `AIR_E_*` 错误，见下）：source 缺 backend/身份字段、把声明期模式（`pointerId:'*'`）当运行期 source、非有限 value（NaN/Infinity）一律拒绝，不污染查询；未知动作名（拼错）在任何查询/派发上一致抛 `AIR_E_UNKNOWN_ACTION`。
- reducer 对外只读数据（`actions`、`heldSources()`、`consumeTick()` 的 transitions、`lastReset()`）均为冻结拷贝，改写快照不影响内部状态。

## 消费边沿（有序 transition 合同）

```ts
const tick = state.consumeTick(); // 每个业务 tick 调一次
if (state.pressed('jump')) doJump();      // 便利 flag（首现去重）
if (state.released('fire')) stopFire();
if (state.axis('moveX') < 0) walkLeft();
for (const t of tick.transitions) { /* 有序、不去重：同动作 press→release→press 保留三项 */ }
```

- `consumeTick()` 返回 `transitions[]`（队列顺序、不去重、携带具体 source）与去重的 `pressed[]/released[]` 便利 flag；0 tick 的快按快放保留到下一次消费，不丢失；无新事件时重复调用返回空，不重放。
- `held()` 随时反映实时状态；多 source 时只在最后一个 source 释放时才落到 false。
- 已活跃 source 的重复 press（按键 repeat）不产生新 press，也不重新武装。
- reducer 不含时钟；业务 accumulator 与测试用 `createStepClock` 互不替代。

## 接线事件（二选一后端）

```ts
const gate = createSessionGate();  // 可选：会话准入门（PG-30 连接点）
const input = createActionInput({
    state,
    backend: 'dom',                // 本页声明使用 dom；native 要改用 KeyCode 身份（如 KeyCode.SPACE）
    canvas,                        // dom 必填且显式传入；native 仅作焦点目标
    session: gate,                 // 缺省恒准入
});
input.attach();                    // 幂等；不抢焦点
gate.activate();                   // Start/Resume 开启会话（触发 reset('restart')，撤销旧代次）
input.requestFocus();              // 仅 Start/Resume 显式调用
```

- **后端不混用**：动作声明里的 source 绑定可以覆盖多条通道，但每个适配器只订阅一个后端；键盘事件只会来自 attach 的那一路（native 走引擎 `KeyCode`，dom 走 `KeyboardEvent.code`），不会因另一路的绑定产生双计数。
- `native` 保持引擎既有鼠标转 TOUCH 通道（不重建平行通道）；`dom` 键盘监听 `window` 捕获阶段（先于 canvas 屏蔽），指针走 PointerEvent（不支持的环境退化 mouse+touch 单路，绝不双路订阅）。
- editable（input/textarea/select/contentEditable）中的 keydown 不准入：dom 检查 `event.target`；native 以 PAL rawEvent.target 为主、`document.activeElement` 兜底的显式检查保证。已持有 source 的 keyup 仍释放：native 用 PAL 同一物理键码表在 window capture 做释放清理，因焦点移走而未到 canvas 的 keyup 也不残留。它不接纳第二条 keydown 通道、不派发第二次引擎事件；重复释放幂等。
- 鼠标离开 canvas 时释放该鼠标 source，其他键、HUD 和触点继续持有。鼠标在 canvas 外的抬起仍有 window 释放清理；浏览器协议坐标移出整个窗口不等于物理操作系统已派发离窗事件。
- 会话退役：`gate.deactivate()` 触发 onChange 订阅，适配器**立即** `reset('deactivate')`（不等下一个输入事件）；`activate()` 新代次触发 `reset('restart')` 撤销旧代次残留。外部自有 gate 未实现 `onChange/offChange` 时结构兼容，仅做准入门，清场由调用方负责。
- 失焦/隐藏订阅对两种后端一致安装（native 后端同样按因 `blur`/`hidden` reset），detach 精确对称清理；`pause`/`restart`/`deactivate` 由调用方显式 reset。`reset` 不增删监听器，100 次 restart 后监听器仍在基准。
- DOM 适配器默认不 `preventDefault`；native 保留 PAL 对 canvas 的原有 stop/prevent 行为，不抢编辑控件焦点。

## 生命周期与错误

- `attach()`/`detach()` 幂等；`detach()` 只做结构解绑并保留 reducer 状态。
- **`dispose()` 是终态**：reset('dispose') + detach + 解绑 gate 订阅；dispose 后再 `attach()` 抛 `AIR_E_DISPOSED`（不可重入安装、不泄漏监听），`reset()`/`requestFocus()` 为文档化 no-op。需要重新使用就创建新适配器。
- 稳定错误码：`AIR_E_INVALID_SOURCE`（source 身份不合法）、`AIR_E_INVALID_VALUE`（非有限数值）、`AIR_E_UNKNOWN_ACTION`（未声明动作名）、`AIR_E_DISPOSED`（dispose 后 attach）。

## HUD 显式 press/release

HUD 按钮不要依赖全局触点归属：用自己的 source 显式调用，避免"全局 touch 不知绑哪个动作"。

```ts
button.on(TOUCH_START, () => state.press('fire', { backend: 'manual', pointerId: buttonId }));
button.on(TOUCH_END,   () => state.release('fire', { backend: 'manual', pointerId: buttonId }));
```

`manual` source 与系统键/触点互不干扰；释放一个 HUD source 不清键盘或其它触点。

## 诊断检查器（可选，默认关闭）

`tools/debug/input-inspector.ts` 提供只读快照：默认 disabled、最多 80 条环形缓冲、至多 2Hz、不记录文本/密码/全页面按键、不持久化、不联网；诊断开关不改变任何动作计数。该模块属于开发工具，默认运行时不引入。

所有返回快照及嵌套 source 均冻结。旧 `snapshot(true)` 参数不会越过2Hz上限，`clear()`和开关切换也不重置节流窗口；非法采样频率或容量抛 `AIR_E_INSPECTOR_OPTIONS`。

## 边界

三浏览器×两后端×默认/自定义canvas的组合序列已验证：可信协议键鼠与显式合成多触点共存，释放鼠标或取消一个触点不清其他source；native UI吞掉的触点不进入全局动作。DOM后端仅读自己的DOM通道，不继承原生UI吞噬规则。HUD移焦不清键盘owner，editable中已持有keyup仍释放，100个repeat只出首次press，100次restart/generation仍能收键。

多指取消及blur/hidden注入均明确标记SYNTHETIC；不是物理设备或后台OS输入认证。无头浏览器打开另一个标签没有产生document.hidden，因此真实后台切换仍为NOT_RUN，不能拿合成visibilitychange替代。运行结果和最终候选范围见台账。

Lead S23另测Chromium原生冻结/恢复及最小化/还原命令：页面仍为visible，未产生可信visibilitychange。冻结不是隐藏；这份环境校准不能作为hidden时清场的验收证据。

- 结合 `createAirApp` 可将适配器绑定 `app.session`，并用 `app.session.own(() => input.dispose())` 归还监听器。`releaseScene` 失活会立即清状态，随后清理解绑；新场景使用新 scope 和新适配器。
- 会话所有权、releaseScene/close 范围由 PG-30 定义；`AirActionSessionGate` 是它的连接点，不代替会话管理。
