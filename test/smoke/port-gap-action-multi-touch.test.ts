// Real PAL -> Input dispatch -> adapter, with only the UI swallow boundary controlled.
// The browser fixture verifies the same case against actual UITransform hit testing.
describe('native per-contact dispatch with a partly swallowed touch batch', () => {
    test('the globally dispatched contact cannot import a UI-owned sibling into action state', () => {
        jest.isolateModules(() => {
            (document.documentElement as any).ontouchstart = null;
            require('../../src/cocos/game');
            const { input, Input } = require('../../src/cocos/input');
            const { createActionInput } = require('../../src/air/action-input');
            const { createActionState } = require('../../src/air/action-state');
            const state = createActionState({ actions: { point: { sources: [{ backend: 'native', pointerId: '*' }] } } });
            const adapter = createActionInput({ state, backend: 'native' });
            input._registerEventDispatcher({ priority: 1, dispatchEvent: (event: any) => event.touch?.getID() !== 11, onThrowException: () => {} });
            const canvas = document.getElementById('GameCanvas')!;
            const dispatch = (type: string, ids: number[]) => {
                const changed = ids.map((identifier) => ({ identifier, clientX: 10, clientY: 20 }));
                canvas.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: changed as any, touches: changed as any }));
            };
            adapter.attach();
            dispatch('touchstart', [11,12,13]);
            expect(state.heldSources('point').map((s: any) => s.pointerId)).toEqual([12,13]);
            expect(state.consumeTick().transitions.map((e: any) => e.source.pointerId)).toEqual([12,13]);
            dispatch('touchend', [11,12]);
            expect(state.heldSources('point').map((s: any) => s.pointerId)).toEqual([13]);
            expect(state.consumeTick().transitions.map((e: any) => e.source.pointerId)).toEqual([12]);
            dispatch('touchcancel', [13]);
            expect(state.held('point')).toBe(false);
            expect(state.consumeTick().transitions.map((e: any) => e.source.pointerId)).toEqual([13]);
            adapter.dispose();
        });
    });
});
