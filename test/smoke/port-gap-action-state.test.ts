// PG-28 纯 reducer 回归（真实生产代码合同测试，无替身算法；引擎仅因 KeyCode 类型链路加载）。
import * as fs from 'fs';
import * as path from 'path';
import { KeyCode } from '../../src/cocos/input/types';
import {
    createActionState,
    airActionSourceKey,
    type AirActionSource,
    type AirActionPointerPattern,
} from '../../src/air/action-state';

const domKey = (code: string): AirActionSource => ({ backend: 'dom', physicalCode: code });
const nativeKey = (keyCode: KeyCode): AirActionSource => ({ backend: 'native', keyCode });
const domPointer = (id: number): AirActionSource => ({ backend: 'dom', pointerId: id });
const hud = (id: number): AirActionSource => ({ backend: 'manual', pointerId: id });

describe('PG-28 source identity', () => {
    test('alias keys on different channels are distinct sources, never conflated', () => {
        expect(airActionSourceKey(domKey('KeyA'))).not.toBe(airActionSourceKey(nativeKey(KeyCode.KEY_A)));
        expect(airActionSourceKey(domKey('KeyA'))).not.toBe(airActionSourceKey(domKey('KeyB')));
        expect(airActionSourceKey(domPointer(1))).not.toBe(airActionSourceKey(domPointer(2)));
        expect(airActionSourceKey(hud(1))).not.toBe(airActionSourceKey(domPointer(1)));
    });

    test('actionsFor routes adapter events through the declared source set', () => {
        const state = createActionState({
            actions: {
                confirm: { sources: [domKey('Enter'), { source: nativeKey(KeyCode.KEY_A) }] },
                cancel: { sources: [domKey('Escape')] },
            },
        });
        expect(state.actionsFor(domKey('Enter'))).toEqual(['confirm']);
        expect(state.actionsFor(nativeKey(KeyCode.KEY_A))).toEqual(['confirm']);
        expect(state.actionsFor(domKey('Escape'))).toEqual(['cancel']);
        expect(state.actionsFor(domKey('KeyZ'))).toEqual([]);
    });

    test('pointer patterns bind dynamic pointer ids without enumerating them', () => {
        const state = createActionState({
            actions: { touch: { sources: [{ backend: 'dom', pointerId: '*' }] } },
        });
        expect(state.actionsFor(domPointer(3))).toEqual(['touch']);
        expect(state.actionsFor(domPointer(99))).toEqual(['touch']);
        expect(state.actionsFor(hud(3))).toEqual([]); // 其他后端不匹配模式
        state.press('touch', domPointer(3));
        state.press('touch', domPointer(4));
        expect(state.heldSources('touch').map((s) => s.pointerId).sort()).toEqual([3, 4]);
        state.release('touch', domPointer(3));
        expect(state.heldSources('touch').map((s) => s.pointerId)).toEqual([4]);
    });

    test('duplicate source inside one action is rejected up front', () => {
        expect(() => createActionState({
            actions: { a: { sources: [domKey('KeyA'), domKey('KeyA')] } },
        })).toThrow(/duplicate source/);
    });
});

describe('PG-28 source-set OR semantics', () => {
    test('releasing A keeps ArrowLeft held (keyboard independence)', () => {
        const state = createActionState({
            actions: { move: { sources: [domKey('KeyA'), domKey('ArrowLeft')] } },
        });
        expect(state.press('move', domKey('KeyA'))).toBe(true);
        expect(state.press('move', domKey('ArrowLeft'))).toBe(true);
        expect(state.held('move')).toBe(true);
        expect(state.heldSources('move')).toHaveLength(2);
        state.release('move', domKey('KeyA'));
        expect(state.held('move')).toBe(true);
        expect(state.heldSources('move').map((s) => s.physicalCode)).toEqual(['ArrowLeft']);
        state.release('move', domKey('ArrowLeft'));
        expect(state.held('move')).toBe(false);
    });

    test('multi-pointer and keyboard coexist; releasing one touch clears neither keyboard nor other touch', () => {
        const state = createActionState({
            actions: {
                fire: { sources: [nativeKey(KeyCode.SPACE)] },
                touch: {},
            },
        });
        state.press('fire', nativeKey(KeyCode.SPACE));
        state.press('touch', domPointer(3));
        state.press('touch', domPointer(4));
        state.press('touch', hud(9)); // HUD 显式 source 与系统触点共存
        expect(state.heldSources('touch').map((s) => s.pointerId).sort()).toEqual([3, 4, 9]);
        state.release('touch', domPointer(3));
        expect(state.held('touch')).toBe(true);
        expect(state.held('fire')).toBe(true); // 释放一个触点不清键盘动作
        state.release('touch', hud(9));
        expect(state.heldSources('touch').map((s) => s.pointerId)).toEqual([4]);
        expect(state.release('touch', domPointer(3))).toBe(false); // 重复释放是 no-op
    });

    test('manual HUD press/release works without pre-declared bindings; unknown action throws', () => {
        const state = createActionState({ actions: { skill: { mode: 'button' } } });
        expect(state.press('skill', hud(1))).toBe(true);
        expect(state.held('skill')).toBe(true);
        state.release('skill', hud(1));
        expect(state.held('skill')).toBe(false);
        expect(() => state.press('nonexistent', hud(1))).toThrow(expect.objectContaining({ code: 'AIR_E_UNKNOWN_ACTION' }));
    });
});

describe('PG-28 press edges and repeat discipline', () => {
    test('100 repeats produce exactly one press; repeat does not re-arm', () => {
        const state = createActionState({ actions: { jump: {} } });
        let activated = 0;
        for (let i = 0; i < 100; i += 1) {
            if (state.press('jump', domKey('Space'))) activated += 1;
        }
        expect(activated).toBe(1);
        const tick = state.consumeTick();
        expect(tick.pressed).toEqual(['jump']);
        expect(tick.released).toEqual([]);
        const replay = state.consumeTick();
        expect(replay.transitions).toEqual([]); // 不重放
        expect(replay.pressed).toEqual([]);
        expect(replay.released).toEqual([]);
    });

    test('zero-tick quick press+release survives to the next business tick without loss', () => {
        const state = createActionState({ actions: { jump: {} } });
        state.press('jump', domKey('Space'));
        state.release('jump', domKey('Space'));
        expect(state.held('jump')).toBe(false);
        const tick = state.consumeTick();
        expect(tick.pressed).toEqual(['jump']);
        expect(tick.released).toEqual(['jump']);
        expect(state.pressed('jump')).toBe(true);
        expect(state.released('jump')).toBe(true);
        // 下一次消费清空边沿，不重放
        const next = state.consumeTick();
        expect(next.pressed).toEqual([]);
        expect(next.released).toEqual([]);
        expect(state.pressed('jump')).toBe(false);
    });

    test('edges within one tick keep queue order (quick press/release sequences)', () => {
        const state = createActionState({ actions: { a: {}, b: {} } });
        state.press('a', domKey('KeyA'));
        state.press('b', domKey('KeyB'));
        state.release('a', domKey('KeyA'));
        state.release('b', domKey('KeyB'));
        const tick = state.consumeTick();
        expect(tick.pressed).toEqual(['a', 'b']);
        expect(tick.released).toEqual(['a', 'b']);
        expect(state.held('a')).toBe(false);
        expect(state.held('b')).toBe(false);
    });

    test('multiple business ticks consume once each; pending presses do not leak across reset', () => {
        const state = createActionState({ actions: { a: {} } });
        state.press('a', domKey('KeyA'));
        state.press('a', domKey('ArrowLeft'));
        state.reset('pause'); // 待处理边沿随 reset 丢弃，不伪造边沿
        const dropped = state.consumeTick();
        expect(dropped.transitions).toEqual([]);
        expect(dropped.pressed).toEqual([]);
        expect(state.pressed('a')).toBe(false);
        // reset 后绑定仍可用
        expect(state.press('a', domKey('KeyA'))).toBe(true);
        expect(state.consumeTick().pressed).toEqual(['a']);
    });
});

describe('PG-28 axis actions', () => {
    const left = domKey('ArrowLeft');
    const right = domKey('ArrowRight');
    function axisState () {
        return createActionState({
            actions: {
                moveX: { mode: 'axis', sources: [{ source: left, value: -1 }, { source: right, value: 1 }] },
            },
        });
    }
    test('sum of active contributions, clamped to [-1, 1]; axis actions produce no press edges', () => {
        const state = axisState();
        expect(state.axis('moveX')).toBe(0);
        state.press('moveX', left);
        expect(state.axis('moveX')).toBe(-1);
        state.press('moveX', right);
        expect(state.axis('moveX')).toBe(0);
        state.release('moveX', left);
        expect(state.axis('moveX')).toBe(1);
        expect(state.held('moveX')).toBe(true);
        const axisTick = state.consumeTick();
        expect(axisTick.transitions).toEqual([]); // 轴动作无边沿
        expect(axisTick.pressed).toEqual([]);
    });
    test('analog setAxis writes clamp and treats 0 as release', () => {
        const state = axisState();
        const stick = hud(7);
        state.setAxis('moveX', stick, 0.35);
        expect(state.axis('moveX')).toBeCloseTo(0.35);
        state.setAxis('moveX', stick, -2);
        expect(state.axis('moveX')).toBe(-1);
        state.setAxis('moveX', stick, 0);
        expect(state.held('moveX')).toBe(false);
        expect(() => {
            const buttons = createActionState({ actions: { b: {} } });
            buttons.setAxis('b', hud(1), 1);
        }).toThrow(/non-axis/);
    });
});

describe('PG-28 reset reasons', () => {
    test('each lifecycle reason is recorded distinctly and monotonically', () => {
        const state = createActionState({ actions: { a: { sources: [domKey('KeyA')] } } });
        state.press('a', domKey('KeyA'));
        state.reset('blur');
        expect(state.lastReset()).toMatchObject({ reason: 'blur', count: 1 });
        expect(state.held('a')).toBe(false);
        state.press('a', domKey('KeyA'));
        state.reset('hidden');
        expect(state.lastReset()).toMatchObject({ reason: 'hidden', count: 2 });
        state.reset('pause');
        state.reset('restart');
        state.reset('deactivate');
        state.reset('dispose');
        state.reset('manual');
        expect(state.lastReset()).toMatchObject({ reason: 'manual', count: 7 });
        expect(state.held('a')).toBe(false);
    });
});

describe('PG-28 ordered transitions contract (Lead review fix 1)', () => {
    test('same-tick press→release→press survives as three ordered transitions', () => {
        const state = createActionState({ actions: { jump: {} } });
        const src = domKey('Space');
        state.press('jump', src);
        state.release('jump', src);
        state.press('jump', src); // 同一 tick 二次按下
        const tick = state.consumeTick();
        expect(tick.transitions.map((t) => t.kind)).toEqual(['press', 'release', 'press']);
        expect(tick.transitions.every((t) => t.action === 'jump')).toBe(true);
        // 便利 flag 保持首现去重语义
        expect(tick.pressed).toEqual(['jump']);
        expect(tick.released).toEqual(['jump']);
        expect(state.held('jump')).toBe(true); // 末态活跃
    });

    test('multi-action interleaved edges keep queue order in transitions', () => {
        const state = createActionState({ actions: { a: {}, b: {} } });
        state.press('a', domKey('KeyA'));
        state.press('b', domKey('KeyB'));
        state.release('a', domKey('KeyA'));
        state.press('b', domKey('ArrowRight')); // 同 tick b 的第二个 source
        const tick = state.consumeTick();
        expect(tick.transitions.map((t) => `${t.action}:${t.kind}`)).toEqual(['a:press', 'b:press', 'a:release', 'b:press']);
    });

    test('no new events -> repeated consumeTick returns empty transitions (no replay)', () => {
        const state = createActionState({ actions: { a: {} } });
        state.press('a', domKey('KeyA'));
        expect(state.consumeTick().transitions).toHaveLength(1);
        for (let i = 0; i < 3; i += 1) {
            const tick = state.consumeTick();
            expect(tick.transitions).toEqual([]);
            expect(tick.pressed).toEqual([]);
            expect(tick.released).toEqual([]);
        }
    });

    test('multi-source OR: each release produces exactly one transition; held only falls when the last source leaves', () => {
        const state = createActionState({ actions: { move: { sources: [domKey('KeyA'), domKey('ArrowLeft')] } } });
        const s1 = domKey('KeyA');
        const s2 = domKey('ArrowLeft');
        state.press('move', s1);
        state.press('move', s2);
        state.release('move', s1); // 任一 source 释放不误置 held=false
        expect(state.held('move')).toBe(true);
        state.release('move', s2);
        expect(state.held('move')).toBe(false);
        const tick = state.consumeTick();
        expect(tick.transitions.map((t) => t.kind)).toEqual(['press', 'press', 'release', 'release']);
        expect(tick.transitions[2]!.source.physicalCode).toBe('KeyA');
        expect(tick.transitions[3]!.source.physicalCode).toBe('ArrowLeft');
    });

    test('transitions carry the concrete source identity', () => {
        const state = createActionState({ actions: { fire: { sources: [nativeKey(KeyCode.KEY_A)] } } });
        state.press('fire', nativeKey(KeyCode.KEY_A));
        const tick = state.consumeTick();
        expect(tick.transitions[0]!.source).toEqual({ backend: 'native', keyCode: KeyCode.KEY_A });
    });
});

describe('PG-28 runtime validation and stable errors (Lead review fix 5)', () => {
    test('non-finite axis values are rejected with AIR_E_INVALID_VALUE and never pollute queries', () => {
        const state = createActionState({ actions: { moveX: { mode: 'axis' } } });
        for (const bad of [NaN, Infinity, -Infinity]) {
            expect(() => state.setAxis('moveX', hud(1), bad)).toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_VALUE' }));
            expect(() => state.press('moveX', hud(2), bad)).toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_VALUE' }));
        }
        expect(state.axis('moveX')).toBe(0);
        expect(state.held('moveX')).toBe(false);
        // 声明期同样拒绝
        expect(() => createActionState({ actions: { bad: { mode: 'axis', sources: [{ source: hud(1), value: NaN }] } } }))
            .toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_VALUE' }));
    });

    test('invalid sources are rejected with AIR_E_INVALID_SOURCE at declaration and runtime', () => {
        const state = createActionState({ actions: { a: {} } });
        expect(() => state.press('a', {} as AirActionSource)).toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_SOURCE' }));
        expect(() => state.press('a', { backend: 'magic' } as unknown as AirActionSource)).toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_SOURCE' }));
        expect(() => state.press('a', { backend: 'dom' })).toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_SOURCE' })); // 无身份字段
        expect(() => state.press('a', { backend: 'dom', pointerId: '*' as unknown as number })).toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_SOURCE' }));
        expect(() => state.press('a', { backend: 'native', keyCode: 'KeyA' as unknown as KeyCode })).toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_SOURCE' }));
        expect(() => state.press('a', { backend: 'dom', pointerId: NaN })).toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_SOURCE' }));
        // 声明期：模式缺 backend
        expect(() => createActionState({ actions: { a: { sources: [{ pointerId: '*' } as AirActionPointerPattern] } } }))
            .toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_SOURCE' }));
    });

    test('unknown action names throw AIR_E_UNKNOWN_ACTION consistently across queries and mutations', () => {
        const state = createActionState({ actions: { a: {} } });
        for (const call of [
            () => state.held('nope'),
            () => state.pressed('nope'),
            () => state.released('nope'),
            () => state.axis('nope'),
            () => state.mode('nope'),
            () => state.heldSources('nope'),
            () => state.press('nope', hud(1)),
            () => state.release('nope', hud(1)),
            () => state.setAxis('nope', hud(1), 1),
        ]) {
            expect(call).toThrow(expect.objectContaining({ code: 'AIR_E_UNKNOWN_ACTION' }));
        }
    });

    test('public readonly data is frozen and copied: snapshots cannot mutate internal identity', () => {
        const state = createActionState({ actions: { a: { sources: [domKey('KeyA')] } } });
        expect(Object.isFrozen(state.actions)).toBe(true);
        state.press('a', domKey('KeyA'));
        const sources = state.heldSources('a');
        expect(Object.isFrozen(sources)).toBe(true);
        expect(Object.isFrozen(sources[0])).toBe(true);
        // 改写快照不影响内部身份（冻结对象在严格模式下赋值抛错）
        expect(() => { (sources[0] as { pointerId?: number }).pointerId = 999; }).toThrow();
        expect(state.heldSources('a')[0]!.pointerId).toBeUndefined();
        expect(state.actionsFor(domKey('KeyA'))).toEqual(['a']);
        // tick 数据同样冻结
        const tick = state.consumeTick();
        expect(Object.isFrozen(tick)).toBe(true);
        expect(Object.isFrozen(tick.transitions)).toBe(true);
        expect(Object.isFrozen(tick.transitions[0])).toBe(true);
        expect(() => { (tick.transitions[0] as { action: string }).action = 'hacked'; }).toThrow();
        // reset 记录冻结
        state.reset('blur');
        expect(Object.isFrozen(state.lastReset())).toBe(true);
    });

    test('reducer keeps engine dependency type-only (no runtime cocos import in action-state)', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/air/action-state.ts'), 'utf8');
        expect(source).toMatch(/import type \{ KeyCode \} from '\.\.\/cocos\/input\/types';/);
        expect(source).not.toMatch(/import \{[^}]*KeyCode[^}]*\} from '\.\.\/cocos\/input\/types';/);
        // 除该 type-only 导入外不得再从 cocos/* 引入运行时值
        expect(source.match(/from '\.\.\/cocos\//g)).toHaveLength(1);
    });
});
