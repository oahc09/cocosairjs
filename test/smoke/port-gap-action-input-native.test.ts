// PG-28 native 后端适配器回归：事件经真实引擎派发链（PAL keyboard/touch → input 单例 → 适配器）。
// 注入方式 = 往 #GameCanvas 派发合成 DOM 事件（与 Lead 浏览器夹具同一链路；测试注入即合成输入，
// 未经物理设备认证）。jsdom 初始 INPUT_TOUCH=false（无 ontouchstart）：先置位再动态加载引擎链，
// 若特性仍未开启则如实 skip，不冒充通过。
describe('PG-28 native backend adapter (real engine dispatch chain)', () => {
    let mod: typeof import('../../src/air/action-input');
    let stateMod: typeof import('../../src/air/action-state');
    let inputMod: typeof import('../../src/cocos/input');
    let KeyCode: typeof import('../../src/cocos/input/types').KeyCode;
    let touchSupported = false;

    beforeAll(async () => {
        // 必须在引擎 system-info 单例构造前置位（jsdom 判据 ontouchstart !== undefined）。
        (document.documentElement as any).ontouchstart = null;
        mod = await import('../../src/air/action-input');
        stateMod = await import('../../src/air/action-state');
        inputMod = await import('../../src/cocos/input');
        ({ KeyCode } = await import('../../src/cocos/input/types'));
        const { systemInfo } = await import('pal/system-info');
        const { Feature } = await import('../../src/pal/system-info/enum-type');
        touchSupported = systemInfo.hasFeature(Feature.INPUT_TOUCH);

        // Import alone no longer binds native DOM input. Model the admitted startup
        // boundary explicitly in this real PAL graph, without changing global setup.
        const { screenAdapter } = await import('pal/screen-adapter');
        const { state, adapter } = nativeSetup();
        adapter.attach();
        const rawKeyDown = jest.fn();
        inputMod.input.on(inputMod.Input.EventType.KEY_DOWN, rawKeyDown);
        key('keydown', 'KeyA');
        expect(rawKeyDown).not.toHaveBeenCalled();
        expect(state.held('fire')).toBe(false);
        expect(state.consumeTick().transitions).toEqual([]);
        screenAdapter.bindCanvas();
        screenAdapter.bindCanvas(); // Re-entry must not bind another listener set.
        key('keydown', 'KeyA');
        expect(rawKeyDown).toHaveBeenCalledTimes(1);
        expect(state.held('fire')).toBe(true);
        expect(state.consumeTick().transitions.map((edge) => edge.kind)).toEqual(['press']);
        key('keyup', 'KeyA');
        expect(state.consumeTick().transitions.map((edge) => edge.kind)).toEqual(['release']);
        inputMod.input.off(inputMod.Input.EventType.KEY_DOWN, rawKeyDown);
        adapter.dispose();
    });

    function nativeSetup() {
        const state = stateMod.createActionState({
            actions: {
                fire: { sources: [{ backend: 'native', keyCode: KeyCode.KEY_A }] },
                jump: { sources: [{ backend: 'native', keyCode: KeyCode.SPACE }] },
                touch: { sources: [{ backend: 'native', pointerId: '*' }] },
            },
        });
        const adapter = mod.createActionInput({ state, backend: 'native' });
        return { state, adapter };
    }

    function canvasEl(): HTMLCanvasElement {
        return document.getElementById('GameCanvas') as HTMLCanvasElement;
    }
    function key(type: 'keydown' | 'keyup', code: string, repeat = false) {
        canvasEl().dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true, repeat }));
    }
    function touch(type: 'touchstart' | 'touchend' | 'touchcancel', ids: number[]) {
        const touches = ids.map((identifier) => ({ identifier, clientX: 0, clientY: 0 }));
        canvasEl().dispatchEvent(
            new TouchEvent(type, {
                bubbles: true,
                cancelable: true,
                touches: touches as any,
                changedTouches: touches as any,
            } as TouchEventInit),
        );
    }

    test('keyboard flows through the real PAL→input chain; adapter sees engine KeyCode identity', () => {
        const { state, adapter } = nativeSetup();
        adapter.attach();
        key('keydown', 'KeyA');
        expect(state.held('fire')).toBe(true);
        expect(state.heldSources('fire')).toEqual([{ backend: 'native', keyCode: KeyCode.KEY_A }]);
        key('keyup', 'KeyA');
        expect(state.held('fire')).toBe(false);
        expect(state.consumeTick().released).toEqual(['fire']);
        adapter.dispose();
    });

    test('a held key released into an editable uses PAL identity cleanup exactly once', () => {
        const { state, adapter } = nativeSetup();
        const editable = document.createElement('input');
        document.body.appendChild(editable);
        adapter.attach();
        key('keydown', 'Space');
        editable.focus();
        editable.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
        expect(state.held('jump')).toBe(false);
        expect(state.consumeTick().transitions.map((edge) => edge.kind)).toEqual(['press', 'release']);
        editable.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
        expect(state.held('jump')).toBe(false);
        adapter.dispose();
        editable.remove();
    });

    test('repeat keydown arrives as KEY_PRESSING in the chain and never re-arms the press', () => {
        const { state, adapter } = nativeSetup();
        adapter.attach();
        key('keydown', 'KeyA');
        key('keydown', 'KeyA', true); // PAL → KEY_PRESSING
        key('keydown', 'KeyA', true);
        const tick = state.consumeTick();
        expect(tick.pressed).toEqual(['fire']);
        expect(state.consumeTick().pressed).toEqual([]); // 无重放
        adapter.dispose();
    });

    test('duplicate KEY_DOWN without repeat is deduped by the (action, source) contract', () => {
        const { state, adapter } = nativeSetup();
        adapter.attach();
        key('keydown', 'Space');
        key('keydown', 'Space');
        expect(state.consumeTick().pressed).toEqual(['jump']);
        expect(state.heldSources('jump')).toHaveLength(1);
        adapter.dispose();
    });

    test('touch flows through the real chain (isolated engine graph with INPUT_TOUCH enabled)', () => {
        // 环境事实：jsdom 不识别 ontouchstart，而 cocos/core 在 setupFiles 期间已把 system-info
        // 单例按 INPUT_TOUCH=false 冻结（src/cocos/core/platform/sys.ts 引入链）。
        // 这里在隔离模块图中先置位再加载同一份引擎链，触点特性即真实开启，事件经真实
        // PAL touch-input → touchManager → input 单例派发；不造替身。
        jest.isolateModules(() => {
            (document.documentElement as any).ontouchstart = null;
            /* eslint-disable @typescript-eslint/no-var-requires */
            // cocos/game 注册 cclegacy.game（Touch._lastModified 读取 frameStartTime）。
            require('../../src/cocos/game');
            const ai = require('../../src/air/action-input');
            const as = require('../../src/air/action-state');
            /* eslint-enable @typescript-eslint/no-var-requires */
            const state = as.createActionState({
                actions: { touch: { sources: [{ backend: 'native', pointerId: '*' }] } },
            });
            const adapter = ai.createActionInput({ state, backend: 'native' });
            adapter.attach();
            const { input, Input } = require('../../src/cocos/input');
            const rawTouchStart = jest.fn();
            input.on(Input.EventType.TOUCH_START, rawTouchStart);
            touch('touchstart', [7]);
            expect(rawTouchStart).not.toHaveBeenCalled();
            expect(state.heldSources('touch')).toEqual([]);
            const { screenAdapter } = require('pal/screen-adapter');
            screenAdapter.bindCanvas();
            screenAdapter.bindCanvas();
            touch('touchstart', [7]);
            expect(rawTouchStart).toHaveBeenCalledTimes(1);
            expect(state.heldSources('touch')).toEqual([{ backend: 'native', pointerId: 7 }]);
            touch('touchstart', [8]); // 第二触点独立
            expect(
                state
                    .heldSources('touch')
                    .map((t: any) => t.pointerId)
                    .sort(),
            ).toEqual([7, 8]);
            touch('touchend', [7]); // 抬起 7 不清 8
            expect(state.heldSources('touch').map((t: any) => t.pointerId)).toEqual([8]);
            touch('touchcancel', [8]);
            expect(state.held('touch')).toBe(false);
            expect(rawTouchStart).toHaveBeenCalledTimes(2);
            input.off(Input.EventType.TOUCH_START, rawTouchStart);
            adapter.dispose();
        });
    });

    test('session gate admission and explicit reset work on the native backend', () => {
        const { state, adapter } = nativeSetup();
        const gate = mod.createSessionGate();
        const gated = mod.createActionInput({ state, backend: 'native', session: gate });
        gated.attach();
        key('keydown', 'KeyA');
        expect(state.held('fire')).toBe(false);
        gate.activate();
        key('keydown', 'KeyA');
        expect(state.held('fire')).toBe(true);
        gated.reset('restart'); // 调用方显式 reset（如 App restart）
        expect(state.held('fire')).toBe(false);
        expect(state.lastReset()).toMatchObject({ reason: 'restart' });
        key('keyup', 'KeyA'); // 未知 source 的 keyup 为 no-op，不伪造
        expect(state.consumeTick().released).toEqual([]);
        gated.dispose();
    });

    test('native backend also resets on window blur / document hidden with distinct reasons', () => {
        const { state, adapter } = nativeSetup();
        adapter.attach();
        key('keydown', 'KeyA');
        expect(state.held('fire')).toBe(true);
        window.dispatchEvent(new Event('blur')); // native 后端同样按因 reset
        expect(state.held('fire')).toBe(false);
        expect(state.lastReset()).toMatchObject({ reason: 'blur' });
        key('keydown', 'KeyA');
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
        adapter.dispose();
        // dispose 后生命周期监听已摘除：blur 不再触碰 reducer
        const frozen = state.lastReset();
        window.dispatchEvent(new Event('blur'));
        expect(state.lastReset()).toBe(frozen);
    });

    test('editable guard: no keydown admission while an editable element owns focus; keyup unaffected', () => {
        const { state, adapter } = nativeSetup();
        adapter.attach();
        const editable = document.createElement('input');
        document.body.appendChild(editable);
        editable.focus();
        expect(document.activeElement).toBe(editable);
        key('keydown', 'KeyA'); // PAL 不设 rawEvent：适配器以 document.activeElement 显式检查拦截
        expect(state.held('fire')).toBe(false);
        expect(state.consumeTick().transitions).toEqual([]);
        editable.blur();
        key('keydown', 'KeyA');
        expect(state.held('fire')).toBe(true);
        editable.focus(); // 焦点在 editable 时已持有 source 的 keyup 仍释放
        key('keyup', 'KeyA');
        expect(state.held('fire')).toBe(false);
        editable.remove();
        adapter.dispose();
    });

    test('gate onChange on the native backend: deactivate clears held immediately, new generation restarts', () => {
        const { state, adapter } = nativeSetup();
        const gate = mod.createSessionGate();
        const gated = mod.createActionInput({ state, backend: 'native', session: gate });
        gated.attach();
        gate.activate();
        expect(state.lastReset()).toMatchObject({ reason: 'restart' });
        key('keydown', 'KeyA');
        expect(state.held('fire')).toBe(true);
        gate.deactivate('session-handover');
        expect(state.held('fire')).toBe(false); // 立即清场，不等输入事件
        expect(state.lastReset()).toMatchObject({ reason: 'deactivate' });
        gate.activate();
        expect(state.lastReset()).toMatchObject({ reason: 'restart' }); // 新代次撤销旧代次残留
        key('keydown', 'KeyA');
        expect(state.held('fire')).toBe(true);
        gated.dispose();
    });
});
