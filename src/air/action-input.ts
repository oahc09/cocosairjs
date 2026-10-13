/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
/**
 * Cocos Air — 输入动作适配器（PG-28，port-gap-remediation §11/§12 S3）。
 *
 * 把真实输入通道接到 [[createActionState]] 纯 reducer 上。后端二选一：
 *  - `native`：订阅引擎 `input` 单例（保持既有 PAL 鼠标转 TOUCH 通道，本模块不重建）；
 *    键盘 source 用引擎 `KeyCode`。editable 准入以两层显式检查保证：PAL 若携带
 *    rawEvent 则检查其 target；否则检查 document.activeElement（真实 PAL 当前不设
 *    rawEvent，activeElement 层即生效路径）。
 *  - `dom`：受控 DOM 后端，键盘以 `window` 捕获阶段监听（先于任何 canvas 屏蔽），
 *    物理键身份取 `KeyboardEvent.code`；指针走 PointerEvent（环境不支持时退化为
 *    mouse+touch 二选一，绝不双路订阅）。
 *
 * 合同要点（docs/reference/port-gap-contracts.md「输入动作」）：
 *  - 适配器不做任何坐标换算、不派发二次事件；press 准入依赖 active-session token
 *    （[[AirActionSessionGate]]，PG-30 可接），已退役会话的 release 同样被拦截——
 *    会话退役必须伴随 reset，本适配器通过 gate 的可选 onChange 订阅同步完成
 *    （deactivate→reset('deactivate')，activate 新代次→reset('restart')），不依赖
 *    下一个输入事件；外部 gate 未实现 onChange 时仅做准入门，清场由调用方负责；
 *  - editable 中的 keydown 不准入；已持有 source 的 keyup 仍释放；
 *  - blur/hidden 订阅对两种后端一致安装（native 后端同样按因 reset），detach 精确清理；
 *  - Start/Resume 由调用方显式 requestFocus()，attach 不抢焦点、普通 HUD 不 reset；
 *  - 默认不 preventDefault（不干扰页面滚动/文本输入）；repeat 不重新产生 press；
 *  - 自定义 canvas 必须显式传入（dom 后端必填；native 后端仅用于 requestFocus 目标）；
 *  - attach/detach 幂等且 reset/restart 不增删监听；dispose 是终态：dispose 后 attach
 *    抛 AIR_E_DISPOSED（不重入、不泄漏），reset/requestFocus 为文档化 no-op；
 *  - detach 只做结构解绑并保留 reducer 状态；dispose = reset('dispose') + detach + 解绑 gate。
 */

import { input, Input } from '../cocos/input';
import type { EventKeyboard, EventTouch } from '../cocos/input/types';
import type { AirActionResetReason, AirActionSource, AirActionState } from './action-state';
import { AirActionError } from './action-state';
import { code2KeyCode } from '../pal/input/keycodes';

export type { AirActionResetReason };

/** @en Session change payload delivered to gate subscribers. @zh 会话状态迁移通知载荷。 */
export interface AirActionSessionChange {
    readonly generation: number;
    readonly active: boolean;
    readonly reason: string | null;
}

/**
 * @en Session admission gate (PG-30 connection point). `onChange`/`offChange` are optional
 * so externally owned gates stay structurally compatible; when present, the adapter
 * subscribes and resets on transitions.
 * @zh 会话准入门（PG-30 连接点）。onChange/offChange 可选：外部 gate 不实现也能接入
 * （仅准入门语义）；实现时适配器会订阅迁移并同步 reset。
 */
export interface AirActionSessionGate {
    /** @en Current session generation; increments on every activate(). @zh 当前会话代次；每次 activate() 递增。 */
    readonly generation: number;
    /** @en Whether the session currently admits input. @zh 当前会话是否准入输入。 */
    readonly active: boolean;
    /** @en Reason passed to the last deactivate(); null while active. @zh 最近一次 deactivate 的原因；活跃期为 null。 */
    readonly deactivateReason: string | null;
    /** @en Begin (or restart) a session generation. @zh 开启/重启会话代次。 */
    activate(): number;
    /** @en Retire the session; further input is rejected until activate(). @zh 退役当前会话；activate() 前拒绝输入。 */
    deactivate(reason?: string): void;
    /** @en Optional transition notification for adapter-side reset. @zh 可选：状态迁移通知，适配器据此同步 reset。 */
    onChange?(listener: (change: AirActionSessionChange) => void): void;
    /** @en Optional counterpart of [[onChange]]. @zh 与 onChange 配对的解绑。 */
    offChange?(listener: (change: AirActionSessionChange) => void): void;
}

/** @en Create the default session gate with transition notification. @zh 创建带迁移通知的默认会话门。 */
export function createSessionGate (): AirActionSessionGate {
    let generation = 0;
    let active = false;
    let reason: string | null = null;
    const listeners = new Set<(change: AirActionSessionChange) => void>();
    const notify = (): void => {
        for (const listener of [...listeners]) listener({ generation, active, reason });
    };
    return {
        get generation () { return generation; },
        get active () { return active; },
        get deactivateReason () { return reason; },
        activate () {
            generation += 1;
            active = true;
            reason = null;
            notify();
            return generation;
        },
        deactivate (r) {
            active = false;
            reason = r ?? null;
            notify();
        },
        onChange (listener) {
            listeners.add(listener);
        },
        offChange (listener) {
            listeners.delete(listener);
        },
    };
}

/** @en Options for [[createActionInput]]. @zh createActionInput 选项。 */
export interface AirActionInputOptions {
    /** @en Reducer created by [[createActionState]]. @zh 纯 reducer。 */
    readonly state: AirActionState;
    /** @en Exactly one backend; default 'native'. @zh 二选一后端；默认 'native'。 */
    readonly backend?: 'native' | 'dom';
    /**
     * @en Explicit canvas. Required for 'dom' (pointer event target); used as the focus
     * target for 'native'. Never auto-discovered here.
     * @zh 显式 canvas。'dom' 后端必填（指针事件目标）；'native' 后端仅作焦点目标。不做自动探测。
     */
    readonly canvas?: HTMLCanvasElement;
    /** @en Session admission gate; omit to admit always (PG-30 may supply its own). @zh 会话准入门；缺省恒准入（PG-30 可后续提供）。 */
    readonly session?: AirActionSessionGate;
    /** @en preventDefault on admitted events; default false (never over-prevent). @zh 对准入事件 preventDefault；默认 false（不过度阻止默认行为）。 */
    readonly preventDefault?: boolean;
}

export interface AirActionInput {
    /** @en Selected backend. @zh 选定后端。 */
    readonly backend: 'native' | 'dom';
    /** @en DOM listener family actually installed ('pointer' or 'legacy' for the dom backend). @zh dom 后端实际安装的监听族（'pointer' 或退化的 'legacy'）。 */
    readonly domChannel: 'pointer' | 'legacy' | null;
    /** @en Whether listeners are currently installed. @zh 当前是否已安装监听。 */
    readonly attached: boolean;
    /** @en Install listeners once; no-op when already attached; throws AIR_E_DISPOSED after dispose. @zh 安装监听（幂等）；已安装为 no-op；dispose 后抛 AIR_E_DISPOSED。 */
    attach(): void;
    /** @en Remove listeners exactly; idempotent, keeps reducer state. @zh 精确移除监听（幂等），保留 reducer 状态。 */
    detach(): void;
    /** @en Explicit focus request for Start/Resume; never called by attach; no-op after dispose. @zh Start/Resume 显式请求焦点；attach 不调用；dispose 后为 no-op。 */
    requestFocus(): boolean;
    /** @en Forward a reset reason to the reducer (pause/restart/deactivate/...); no-op after dispose. @zh 按原因转发 reset（pause/restart/deactivate/...）；dispose 后为 no-op。 */
    reset(reason: AirActionResetReason): void;
    /** @en Terminal: reset('dispose') + detach + gate unbind; idempotent; re-attach impossible. @zh 终态：reset('dispose') + detach + 解绑 gate；幂等；不可再 attach。 */
    dispose(): void;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget (target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    if (EDITABLE_TAGS.has(target.tagName)) return true;
    const editable = (target as HTMLElement).isContentEditable;
    return editable === true || target.getAttribute?.('contenteditable') === 'true';
}

/**
 * @en Create the adapter binding one real input backend to the reducer.
 * @zh 创建把单一真实输入后端接到 reducer 的适配器。
 */
export function createActionInput (options: AirActionInputOptions): AirActionInput {
    const { state } = options;
    const backend = options.backend ?? 'native';
    const canvas = options.canvas ?? null;
    if (backend === 'dom' && !canvas) {
        throw new AirActionError('AIR_E_INVALID_SOURCE', 'backend "dom" requires an explicit canvas');
    }
    const gate = options.session ?? null;
    const preventDefault = options.preventDefault === true;
    const domChannel: 'pointer' | 'legacy' | null = backend === 'dom'
        ? (typeof window !== 'undefined' && typeof (window as any).PointerEvent === 'function' ? 'pointer' : 'legacy')
        : null;

    let attachedOnce = false; // 统一安装标记（native + 生命周期订阅 + dom 监听一起算）
    let disposed = false;
    let nativeAttached = false;
    let domRegistrations: DomRegistration[] | null = null;
    let lifecycleRegistrations: DomRegistration[] | null = null;

    interface DomRegistration {
        target: EventTarget;
        type: string;
        handler: EventListener;
        capture: boolean;
    }

    const admitted = (): boolean => !gate || gate.active;

    // ── 共享处理逻辑 ──

    const keyDown = (source: AirActionSource) => {
        if (!admitted()) return;
        for (const action of state.actionsFor(source)) state.press(action, source);
    };
    const keyUp = (source: AirActionSource) => {
        if (!admitted()) return; // 会话退役由 reset 清场，release 不越过已退役会话
        for (const action of state.actionsFor(source)) state.release(action, source);
    };
    const pointerDown = (source: AirActionSource) => {
        if (!admitted()) return;
        for (const action of state.actionsFor(source)) state.press(action, source);
    };
    const pointerUp = (source: AirActionSource) => {
        if (!admitted()) return;
        for (const action of state.actionsFor(source)) state.release(action, source);
    };

    // ── native 处理器 ──

    const editableGuardTarget = (event: EventKeyboard): EventTarget | null => {
        // 真实 PAL 当前不设 rawEvent：primary 用 rawEvent.target（未来 PAL 合同），fallback
        // 用 document.activeElement —— 两层都是显式检查，不依赖 PAL 行为假设。
        const raw = (event as EventKeyboard).rawEvent;
        if (raw && 'target' in raw) return raw.target ?? null;
        return typeof document !== 'undefined' ? document.activeElement : null;
    };
    const onNativeKeyDown = (event: EventKeyboard) => {
        if (isEditableTarget(editableGuardTarget(event))) return; // editable keydown 不准入
        keyDown({ backend: 'native', keyCode: event.keyCode });
    };
    const onNativeKeyUp = (event: EventKeyboard) => {
        // 已持有 source 的 keyup 仍释放：不做 editable 过滤。
        keyUp({ backend: 'native', keyCode: event.keyCode });
    };
    const nativeTouch = (event: EventTouch, kind: 'down' | 'up') => {
        // Input dispatches each changed contact separately through UI, setting touch
        // before every dispatch. getTouches() still includes swallowed siblings.
        const touch = event.touch;
        if (!touch) return;
        const source: AirActionSource = { backend: 'native', pointerId: touch.getID() };
        if (kind === 'down') pointerDown(source);
        else pointerUp(source);
    };
    const onNativeTouchStart = (event: EventTouch) => nativeTouch(event, 'down');
    const onNativeTouchEnd = (event: EventTouch) => nativeTouch(event, 'up');
    const onNativeTouchCancel = (event: EventTouch) => nativeTouch(event, 'up');
    const onNativeMouseLeave = () => pointerUp({ backend: 'native', pointerId: 0 });
    // PAL key events target the canvas. A held key released after focus moves to an
    // editable/HUD needs an ownership cleanup, using PAL's same physical-key map.
    // This never admits a press or dispatches a second engine event.
    const onNativeDomKeyUp = (event: KeyboardEvent) => {
        const keyCode = code2KeyCode[event.code];
        if (keyCode !== undefined) keyUp({ backend: 'native', keyCode });
    };

    // ── dom 处理器（window 捕获先于 canvas 屏蔽）──

    const onDomKeyDown = (event: KeyboardEvent) => {
        if (event.repeat) return; // repeat 不重新武装（DOM 层去重）
        if (isEditableTarget(event.target)) return; // editable keydown 不准入
        if (preventDefault && admitted()) event.preventDefault();
        keyDown({ backend: 'dom', physicalCode: event.code });
    };
    const onDomKeyUp = (event: KeyboardEvent) => {
        // 已持有 source 的 keyup 仍释放：不做 editable 过滤。
        keyUp({ backend: 'dom', physicalCode: event.code });
    };
    const domPointerId = (event: MouseEvent): number => {
        const pointerId = (event as PointerEvent).pointerId;
        return typeof pointerId === 'number' ? pointerId : 0; // 旧鼠标事件无 pointerId，视为 0 号指针
    };
    const onDomPointerDown = (event: PointerEvent) => {
        pointerDown({ backend: 'dom', pointerId: domPointerId(event) });
    };
    const onDomPointerUp = (event: PointerEvent) => {
        pointerUp({ backend: 'dom', pointerId: domPointerId(event) });
    };
    const onDomPointerLeave = (event: PointerEvent) => {
        if (event.pointerType === 'mouse') onDomPointerUp(event);
    };
    const onDomMouseDown = (event: MouseEvent) => {
        pointerDown({ backend: 'dom', pointerId: domPointerId(event) });
    };
    const onDomMouseUp = (event: MouseEvent) => {
        pointerUp({ backend: 'dom', pointerId: domPointerId(event) });
    };
    const eachChangedTouch = (event: TouchEvent, fn: (touch: { identifier: number }) => void): void => {
        // 真浏览器给 TouchList（item()），jsdom 直传初始化数组（下标访问）：两种形态都读。
        const list = event.changedTouches as unknown as { length: number; item?: (i: number) => Touch | null } & readonly Touch[];
        const count = list.length;
        for (let i = 0; i < count; i += 1) {
            const touch = typeof list.item === 'function' ? list.item(i) : list[i];
            if (touch) fn({ identifier: touch.identifier });
        }
    };
    const onDomTouchStart = (event: TouchEvent) => {
        eachChangedTouch(event, (touch) => pointerDown({ backend: 'dom', pointerId: touch.identifier }));
    };
    const onDomTouchEnd = (event: TouchEvent) => {
        eachChangedTouch(event, (touch) => pointerUp({ backend: 'dom', pointerId: touch.identifier }));
    };

    // ── 生命周期（两种后端一致安装、一致清理）──

    const onWindowBlur = () => state.reset('blur');
    const onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.hidden) state.reset('hidden');
    };

    const domRegistrationsFor = (): DomRegistration[] => {
        const list: DomRegistration[] = [];
        const win = window as EventTarget;
        list.push({ target: win, type: 'keydown', handler: onDomKeyDown as EventListener, capture: true });
        list.push({ target: win, type: 'keyup', handler: onDomKeyUp as EventListener, capture: true });
        if (domChannel === 'pointer') {
            list.push({ target: canvas!, type: 'pointerdown', handler: onDomPointerDown as EventListener, capture: false });
            list.push({ target: canvas!, type: 'pointerleave', handler: onDomPointerLeave as EventListener, capture: false });
            // 抬起点监听 window 捕获：canvas 外松开也能释放（leave/cancel 不滞留）。
            list.push({ target: win, type: 'pointerup', handler: onDomPointerUp as EventListener, capture: true });
            list.push({ target: win, type: 'pointercancel', handler: onDomPointerUp as EventListener, capture: true });
        } else {
            list.push({ target: canvas!, type: 'mousedown', handler: onDomMouseDown as EventListener, capture: false });
            list.push({ target: canvas!, type: 'mouseleave', handler: onDomMouseUp as EventListener, capture: false });
            list.push({ target: win, type: 'mouseup', handler: onDomMouseUp as EventListener, capture: true });
            list.push({ target: canvas!, type: 'touchstart', handler: onDomTouchStart as EventListener, capture: false });
            list.push({ target: win, type: 'touchend', handler: onDomTouchEnd as EventListener, capture: true });
            list.push({ target: win, type: 'touchcancel', handler: onDomTouchEnd as EventListener, capture: true });
        }
        return list;
    };
    const lifecycleRegistrationsFor = (): DomRegistration[] => {
        const win = window as EventTarget;
        const doc = document as EventTarget;
        const registrations: DomRegistration[] = [
            { target: win, type: 'blur', handler: onWindowBlur, capture: false },
            { target: doc, type: 'visibilitychange', handler: onVisibilityChange, capture: false },
        ];
        if (backend === 'native') registrations.push({ target: win, type: 'keyup', handler: onNativeDomKeyUp as EventListener, capture: true });
        return registrations;
    };

    // ── gate 订阅：退役/新代次立即清场，不等下一个输入事件 ──

    const gateChangeListener = (change: AirActionSessionChange): void => {
        if (disposed) return;
        if (!change.active) state.reset('deactivate');
        else state.reset('restart'); // 新代次：撤销旧代次残留
    };
    const gateSupportsChange = gate !== null && typeof gate.onChange === 'function' && typeof gate.offChange === 'function';

    const installLifecycle = (): void => {
        lifecycleRegistrations = lifecycleRegistrationsFor();
        for (const reg of lifecycleRegistrations) reg.target.addEventListener(reg.type, reg.handler, reg.capture);
    };
    const uninstallLifecycle = (): void => {
        if (!lifecycleRegistrations) return;
        for (const reg of lifecycleRegistrations) reg.target.removeEventListener(reg.type, reg.handler, reg.capture);
        lifecycleRegistrations = null;
    };
    const ensureNotDisposed = (): void => {
        if (disposed) {
            throw new AirActionError('AIR_E_DISPOSED', 'adapter is disposed; create a new instance to attach again');
        }
    };

    // 创建即订阅：gate 迁移立即清场（deactivate→reset('deactivate')，新代次→reset('restart')），
    // 不等下一个输入事件；dispose 时解绑。
    if (gateSupportsChange) gate!.onChange!(gateChangeListener);

    return {
        backend,
        get domChannel () { return domChannel; },
        get attached () { return attachedOnce; },

        attach () {
            ensureNotDisposed();
            if (this.attached) return;
            if (backend === 'native') {
                input.on(Input.EventType.KEY_DOWN, onNativeKeyDown);
                input.on(Input.EventType.KEY_UP, onNativeKeyUp);
                input.on(Input.EventType.TOUCH_START, onNativeTouchStart);
                input.on(Input.EventType.TOUCH_END, onNativeTouchEnd);
                input.on(Input.EventType.TOUCH_CANCEL, onNativeTouchCancel);
                input.on(Input.EventType.MOUSE_LEAVE, onNativeMouseLeave);
                nativeAttached = true;
            } else {
                domRegistrations = domRegistrationsFor();
                for (const reg of domRegistrations) reg.target.addEventListener(reg.type, reg.handler, reg.capture);
            }
            // blur/hidden 订阅与后端无关：两种后端都按因 reset。
            installLifecycle();
            attachedOnce = true;
        },

        detach () {
            if (!this.attached) return;
            if (backend === 'native') {
                if (!nativeAttached) return;
                input.off(Input.EventType.KEY_DOWN, onNativeKeyDown);
                input.off(Input.EventType.KEY_UP, onNativeKeyUp);
                input.off(Input.EventType.TOUCH_START, onNativeTouchStart);
                input.off(Input.EventType.TOUCH_END, onNativeTouchEnd);
                input.off(Input.EventType.TOUCH_CANCEL, onNativeTouchCancel);
                input.off(Input.EventType.MOUSE_LEAVE, onNativeMouseLeave);
                nativeAttached = false;
            } else if (domRegistrations) {
                for (const reg of domRegistrations) reg.target.removeEventListener(reg.type, reg.handler, reg.capture);
                domRegistrations = null;
            }
            uninstallLifecycle();
            attachedOnce = false;
        },

        requestFocus () {
            if (disposed || !canvas) return false;
            canvas.focus();
            return typeof document !== 'undefined' && document.activeElement === canvas;
        },

        reset (reason) {
            if (disposed) return; // dispose 后 reset 为文档化 no-op（终态不可再变化）
            state.reset(reason);
        },

        dispose () {
            if (disposed) return; // 重入 dispose 幂等：不重复 reset、不重复 detach、gate 已解绑
            disposed = true;
            if (gateSupportsChange) gate!.offChange!(gateChangeListener);
            state.reset('dispose');
            this.detach();
        },
    };
}
