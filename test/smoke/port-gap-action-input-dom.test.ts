// PG-28 受控 DOM 后端适配器回归：真实 jsdom 监听器 + 真实 DOM 事件（非替身状态机）。
// 环境事实：jsdom 无 PointerEvent → 适配器按特性探测退化 legacy（mouse+touch 单路），
// 断言按实际 domChannel 分派；pointer 家族的真实验证归浏览器采集（Lead 统一接线）。
import { createActionState, type AirActionState } from '../../src/air/action-state';
import { createActionInput, createSessionGate, type AirActionInput } from '../../src/air/action-input';

const LEGACY = typeof window.PointerEvent !== 'function';

function duckTouch (identifier: number, x = 0): Touch {
    // jsdom 无 Touch 构造器：TouchEvent 接受鸭子类型触点（identifier/clientX/clientY），
    // 监听器与事件对象都是真实 DOM 设施，这里构造的只是事件载荷。
    return { identifier, clientX: x, clientY: 0, target: document.body } as unknown as Touch;
}

function fireTouch (canvas: HTMLCanvasElement, type: string, ids: number[]) {
    const touches = ids.map((id) => duckTouch(id));
    canvas.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, touches, changedTouches: touches,
    } as TouchEventInit));
}

function pressKey (target: EventTarget, code: string, repeat = false) {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, repeat }));
}
function releaseKey (target: EventTarget, code: string) {
    target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
}

describe('PG-28 dom backend adapter (real DOM listeners)', () => {
    let canvas: HTMLCanvasElement;
    let state: AirActionState;
    let adapter: AirActionInput;
    let added = 0;
    let removed = 0;
    let addSpy: jest.SpyInstance;
    let removeSpy: jest.SpyInstance;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        canvas.id = 'ActionCanvas';
        canvas.tabIndex = 0;
        document.body.appendChild(canvas);
        state = createActionState({
            actions: {
                fire: { sources: [{ backend: 'dom', physicalCode: 'KeyF' }] },
                jump: { sources: [{ backend: 'dom', physicalCode: 'Space' }] },
                touch: { sources: [{ backend: 'dom', pointerId: '*' }] },
            },
        });
        addSpy = jest.spyOn(EventTarget.prototype, 'addEventListener');
        removeSpy = jest.spyOn(EventTarget.prototype, 'removeEventListener');
        adapter = createActionInput({ state, backend: 'dom', canvas });
    });

    afterEach(() => {
        adapter.dispose();
        addSpy.mockRestore();
        removeSpy.mockRestore();
        canvas.remove();
    });

    test('attach is idempotent: double attach does not double-count one physical keydown', () => {
        adapter.attach();
        adapter.attach();
        pressKey(canvas, 'KeyF');
        const tick = state.consumeTick();
        expect(tick.pressed).toEqual(['fire']);
        expect(state.held('fire')).toBe(true);
        expect(state.heldSources('fire')).toHaveLength(1);
    });

    test('window capture precedes canvas-level masking: stopPropagation on canvas cannot hide keys', () => {
        adapter.attach();
        const masker = (event: Event) => event.stopPropagation();
        canvas.addEventListener('keydown', masker); // 模拟游戏内 canvas 层屏蔽（非捕获、后注册）
        pressKey(canvas, 'KeyF');
        canvas.removeEventListener('keydown', masker);
        expect(state.held('fire')).toBe(true);
    });

    test('repeat keydown does not re-arm the press edge', () => {
        adapter.attach();
        pressKey(canvas, 'KeyF'); // 首次
        pressKey(canvas, 'KeyF', true); // OS repeat
        pressKey(canvas, 'KeyF', true);
        const tick = state.consumeTick();
        expect(tick.pressed).toEqual(['fire']);
        expect(state.consumeTick().pressed).toEqual([]);
        releaseKey(canvas, 'KeyF');
        expect(state.consumeTick().released).toEqual(['fire']);
    });

    test('editable keydown is not admitted, but keyup of a held source still releases', () => {
        adapter.attach();
        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(true);
        const editable = document.createElement('input');
        document.body.appendChild(editable);
        editable.focus();
        pressKey(editable, 'KeyF'); // editable 内 keydown：不准入
        pressKey(editable, 'KeyG'); // 未绑定键同样不准入
        expect(state.held('fire')).toBe(true);
        expect(state.actionsFor({ backend: 'dom', physicalCode: 'KeyG' })).toEqual([]);
        releaseKey(editable, 'KeyF'); // 已持有 source 的 keyup 仍释放
        expect(state.held('fire')).toBe(false);
        editable.remove();
    });

    test('window blur resets held state with reason blur; hidden resets with reason hidden', () => {
        adapter.attach();
        pressKey(canvas, 'KeyF');
        window.dispatchEvent(new Event('blur'));
        expect(state.held('fire')).toBe(false);
        expect(state.lastReset()).toMatchObject({ reason: 'blur' });

        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(true);
        const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        try {
            document.dispatchEvent(new Event('visibilitychange'));
        } finally {
            delete (document as any).hidden;
            if (desc) Object.defineProperty(Document.prototype, 'hidden', desc);
        }
        expect(state.held('fire')).toBe(false);
        expect(state.lastReset()).toMatchObject({ reason: 'hidden' });
    });

    test('session gate: no events while inactive, admission returns after activate', () => {
        const gate = createSessionGate();
        const gated = createActionInput({ state, backend: 'dom', canvas, session: gate });
        gated.attach();
        expect(gate.active).toBe(false);
        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(false); // 禁用 token 无事件
        const generation = gate.activate();
        expect(generation).toBe(1);
        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(true);
        gate.deactivate('session-over');
        expect(gate.deactivateReason).toBe('session-over');
        // onChange 订阅：退役立即同步 reset('deactivate')，不等下一个输入事件
        expect(state.held('fire')).toBe(false);
        expect(state.lastReset()).toMatchObject({ reason: 'deactivate' });
        releaseKey(canvas, 'KeyF');
        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(false); // 准入门仍拦截已退役会话的新事件
        gated.dispose();
        expect(state.lastReset()).toMatchObject({ reason: 'dispose' });
        expect(state.held('fire')).toBe(false);
    });

    test('explicit canvas pointer and multi-touch independence on the legacy channel', () => {
        adapter.attach();
        if (LEGACY) {
            expect(adapter.domChannel).toBe('legacy');
            // 双指独立：identifier 3/4 各自成 source
            fireTouch(canvas, 'touchstart', [3, 4]);
            expect(state.heldSources('touch').map((t) => t.pointerId).sort()).toEqual([3, 4]);
            fireTouch(canvas, 'touchend', [3]); // 只抬起 3
            expect(state.heldSources('touch').map((t) => t.pointerId)).toEqual([4]);
            fireTouch(canvas, 'touchcancel', [4]); // 4 被 cancel 释放
            expect(state.held('touch')).toBe(false);
            // 键盘与触点共存：释放触点不清键盘
            pressKey(canvas, 'KeyF');
            fireTouch(canvas, 'touchstart', [5]);
            fireTouch(canvas, 'touchend', [5]);
            expect(state.held('fire')).toBe(true);
        } else {
            expect(adapter.domChannel).toBe('pointer');
            canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3 }));
            canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4 }));
            expect(state.heldSources('touch').map((t) => t.pointerId).sort()).toEqual([3, 4]);
            window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 }));
            expect(state.heldSources('touch').map((t) => t.pointerId)).toEqual([4]);
            window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 4 }));
            expect(state.held('touch')).toBe(false);
        }
    });

    test('attach never steals focus; requestFocus is explicit for Start/Resume', () => {
        adapter.attach();
        expect(document.activeElement).not.toBe(canvas);
        expect(adapter.requestFocus()).toBe(true);
        expect(document.activeElement).toBe(canvas);
    });

    test('100 resets/restarts keep listeners at baseline and the adapter functional', () => {
        adapter.attach();
        const addedAfterAttach = addSpy.mock.calls.length;
        for (let i = 0; i < 100; i += 1) adapter.reset('restart');
        expect(addSpy.mock.calls.length).toBe(addedAfterAttach); // reset 不增删监听
        pressKey(canvas, 'KeyF');
        expect(state.consumeTick().pressed).toEqual(['fire']);
        expect(state.lastReset()).toMatchObject({ reason: 'restart', count: 100 });
    });

    test('dispose is reentrantly idempotent; detached listeners leave no residue', () => {
        adapter.attach();
        const addedAfterAttach = addSpy.mock.calls.length;
        adapter.dispose();
        const removedAfterDispose = removeSpy.mock.calls.length;
        expect(removedAfterDispose).toBe(addedAfterAttach); // 移除数 == 安装数（回基准）
        adapter.dispose(); // 重入幂等
        expect(removeSpy.mock.calls.length).toBe(removedAfterDispose);
        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(false);
        expect(state.consumeTick().pressed).toEqual([]);
        expect(state.lastReset()).toMatchObject({ reason: 'dispose' });
    });

    test('detach alone keeps reducer state; dom backend requires explicit canvas', () => {
        adapter.attach();
        pressKey(canvas, 'KeyF');
        adapter.detach();
        expect(state.held('fire')).toBe(true); // 结构性解绑不伪造 reset
        pressKey(canvas, 'KeyF'); // 无监听 → 无变化
        expect(state.heldSources('fire')).toHaveLength(1);
        expect(() => createActionInput({ state: createActionState({ actions: { a: {} } }), backend: 'dom' }))
            .toThrow(/explicit canvas/);
    });
});

describe('PG-28 adapter lifecycle remediations (Lead review fixes 2-4)', () => {
    let canvas: HTMLCanvasElement;
    let state: AirActionState;
    let adapter: AirActionInput;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        canvas.id = 'ActionCanvas2';
        canvas.tabIndex = 0;
        document.body.appendChild(canvas);
        state = createActionState({
            actions: { fire: { sources: [{ backend: 'dom', physicalCode: 'KeyF' }] } },
        });
        adapter = createActionInput({ state, backend: 'dom', canvas });
    });

    afterEach(() => {
        adapter.dispose();
        canvas.remove();
    });

    test('gate onChange triggers immediate reset on deactivate and restart on new generation', () => {
        const gate = createSessionGate();
        const gated = createActionInput({ state, backend: 'dom', canvas, session: gate });
        gated.attach();
        gate.activate(); // 首个代次：立即记录 restart（创建即订阅，不等输入事件）
        expect(state.lastReset()).toMatchObject({ reason: 'restart', count: 1 });
        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(true);
        gate.deactivate('pg30-retire');
        // 不等下一个输入事件：held 立即清空并按因记录
        expect(state.held('fire')).toBe(false);
        expect(state.lastReset()).toMatchObject({ reason: 'deactivate', count: 2 });
        pressKey(canvas, 'KeyF'); // 退役后仍被准入门拦截
        expect(state.held('fire')).toBe(false);
        gate.activate(); // 新代次：撤销旧代次残留
        expect(state.lastReset()).toMatchObject({ reason: 'restart', count: 3 });
        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(true);
        gated.dispose();
    });

    test('externally owned gate without onChange stays structurally compatible (admission only)', () => {
        let active = false;
        const bareGate = {
            generation: 0,
            get active () { return active; },
            deactivateReason: null as string | null,
            activate () { active = true; return ++bareGate.generation; },
            deactivate (reason?: string) { active = false; bareGate.deactivateReason = reason ?? null; },
        };
        const gated = createActionInput({ state, backend: 'dom', canvas, session: bareGate });
        gated.attach();
        bareGate.activate();
        pressKey(canvas, 'KeyF');
        expect(state.held('fire')).toBe(true);
        bareGate.deactivate('external');
        // 无 onChange 的外部 gate：只做准入门，清场由调用方负责（合同如实，不假装已 reset）
        expect(state.held('fire')).toBe(true);
        expect(state.lastReset()).toBeNull();
        releaseKey(canvas, 'KeyF'); // release 也被拦截
        expect(state.held('fire')).toBe(true);
        gated.dispose(); // dispose reset 清场
        expect(state.held('fire')).toBe(false);
    });

    test('dispose unbinds the gate listener: transitions after dispose do not touch state', () => {
        const gate = createSessionGate();
        const gated = createActionInput({ state, backend: 'dom', canvas, session: gate });
        gated.dispose();
        const disposeReset = state.lastReset();
        expect(disposeReset).toMatchObject({ reason: 'dispose' });
        gate.deactivate('after-dispose');
        gate.activate();
        gate.deactivate('again');
        expect(state.lastReset()).toBe(disposeReset); // 解绑后迁移不再触碰 reducer
    });

    test('dispose is terminal: attach after dispose throws AIR_E_DISPOSED without leaking listeners', () => {
        const addSpy = jest.spyOn(EventTarget.prototype, 'addEventListener');
        const removeSpy = jest.spyOn(EventTarget.prototype, 'removeEventListener');
        try {
            adapter.attach();
            const addedAfterAttach = addSpy.mock.calls.length;
            adapter.dispose();
            expect(removeSpy.mock.calls.length).toBe(addedAfterAttach); // 无泄漏
            expect(() => adapter.attach()).toThrow(expect.objectContaining({ code: 'AIR_E_DISPOSED' }));
            expect(addSpy.mock.calls.length).toBe(addedAfterAttach); // 失败的 attach 未安装任何监听
            pressKey(canvas, 'KeyF');
            expect(state.held('fire')).toBe(false);
        } finally {
            addSpy.mockRestore();
            removeSpy.mockRestore();
        }
    });

    test('blur/hidden lifecycle listeners are removed on detach/dispose (precise cleanup)', () => {
        // 对具体目标实例安装 spy（jsdom 的 Window 不走 EventTarget.prototype，原型 spy 计数不可靠）
        const addSpies = [jest.spyOn(window, 'addEventListener'), jest.spyOn(canvas, 'addEventListener'), jest.spyOn(document, 'addEventListener')];
        const removeSpies = [jest.spyOn(window, 'removeEventListener'), jest.spyOn(canvas, 'removeEventListener'), jest.spyOn(document, 'removeEventListener')];
        try {
            adapter.attach();
            const added = addSpies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
            expect(added).toBeGreaterThan(0);
            adapter.detach();
            const removed = removeSpies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
            expect(removed).toBe(added); // 精确对称移除，无泄漏
            // 移除后 blur 不再触发 reset
            window.dispatchEvent(new Event('blur'));
            expect(state.lastReset()).toBeNull();
        } finally {
            for (const spy of [...addSpies, ...removeSpies]) spy.mockRestore();
        }
    });
});
