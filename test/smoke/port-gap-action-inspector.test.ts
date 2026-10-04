// PG-28 可选输入检查器回归：默认关闭、80 上限、2Hz 节流、纯只读（诊断开关不改变动作计数）。
import { createActionState } from '../../src/air/action-state';
import { createInputInspector } from '../../tools/debug/input-inspector';
import * as fs from 'fs';
import * as path from 'path';

const sourceText = fs.readFileSync(path.resolve(__dirname, '../../tools/debug/input-inspector.ts'), 'utf8');

function domKey (code: string) {
    return { backend: 'dom' as const, physicalCode: code };
}

describe('PG-28 optional input inspector', () => {
    function setup () {
        const state = createActionState({
            actions: {
                fire: { sources: [domKey('KeyF')] },
                moveX: { mode: 'axis', sources: [{ source: domKey('ArrowLeft'), value: -1 }, { source: domKey('ArrowRight'), value: 1 }] },
            },
        });
        const inspector = createInputInspector(state);
        return { state, inspector };
    }

    test('default disabled: no snapshots, no entries, reducer untouched', () => {
        const { state, inspector } = setup();
        expect(inspector.enabled).toBe(false);
        state.press('fire', domKey('KeyF'));
        expect(inspector.snapshot(true)).toBeNull();
        expect(inspector.entries()).toEqual([]);
        expect(state.held('fire')).toBe(true); // 关闭也不影响 reducer
    });

    test('enabled snapshots are read-only and always throttled at 2Hz', async () => {
        const { state, inspector } = setup();
        inspector.setEnabled(true);
        state.press('fire', domKey('KeyF'));
        state.press('moveX', domKey('ArrowLeft'));
        state.consumeTick(); // pressed() 只反映最近一次消费的 tick
        const first = inspector.snapshot(true)!;
        expect(first.actions.find((a) => a.action === 'fire')).toMatchObject({ held: true, pressed: true });
        expect(first.actions.find((a) => a.action === 'moveX')).toMatchObject({ held: true, axis: -1 });
        expect(first.actions.find((a) => a.action === 'moveX')!.heldSources).toEqual([
            { backend: 'dom', physicalCode: 'ArrowLeft' },
        ]);
        // 节流：force 快照刷新了节流窗口，间隔内的非 force 快照被拒
        expect(inspector.snapshot()).toBeNull();
        expect(inspector.snapshot(true)).toBeNull();
        expect(Object.isFrozen(first.actions[0].heldSources[0])).toBe(true);
        expect(Object.isFrozen(first)).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 520));
        expect(inspector.snapshot()).not.toBeNull(); // ≥500ms 后放行（2Hz）
    });

    test('ring is capped at 80 with dropped counter; clear resets', () => {
        const { inspector } = setup();
        inspector.setEnabled(true);
        const clock = jest.spyOn(Date, 'now');
        for (let i = 0; i < 85; i += 1) { clock.mockReturnValue(i * 500); inspector.snapshot(true); }
        clock.mockRestore();
        expect(inspector.entries()).toHaveLength(80);
        expect(inspector.dropped()).toBe(5);
        expect(inspector.entries()[0]!.at <= inspector.entries()[79]!.at).toBe(true);
        inspector.clear();
        expect(inspector.entries()).toEqual([]);
        expect(inspector.dropped()).toBe(0);
    });

    test('diagnostic switch does not change action counts or reset records (pure read)', () => {
        const { state, inspector } = setup();
        state.press('fire', domKey('KeyF'));
        const heldBefore = state.heldSources('fire').length;
        const resetBefore = state.lastReset();
        inspector.setEnabled(true);
        for (let i = 0; i < 10; i += 1) inspector.snapshot(true);
        const entries = inspector.entries();
        inspector.setEnabled(false);
        expect(state.heldSources('fire')).toHaveLength(heldBefore);
        expect(state.lastReset()).toBe(resetBefore); // 未产生任何 reset
        expect(entries.every((e) => e.actions.length === 2)).toBe(true); // 只见枚举动作
        state.press('fire', domKey('KeyF')); // repeat no-op 依旧成立
        expect(state.heldSources('fire')).toHaveLength(heldBefore);
    });

    test('source contract: no DOM listeners, no network, no persistence primitives', () => {
        for (const forbidden of ['addEventListener', 'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'document.cookie', 'WebSocket', 'indexedDB']) {
            expect(sourceText.includes(forbidden)).toBe(false);
        }
    });
});
