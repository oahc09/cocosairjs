import { createActionState } from '../../src/air/action-state';

describe('PG-28 caller-owned source identity', () => {
    test('queued edges and held sources retain the event-time identity after caller mutation', () => {
        const source = { backend: 'dom' as const, physicalCode: 'KeyA' };
        const state = createActionState({ actions: { jump: { sources: [source] } } });
        state.press('jump', source);
        source.physicalCode = 'KeyB';
        expect(state.heldSources('jump')).toEqual([{ backend: 'dom', physicalCode: 'KeyA' }]);
        expect(state.consumeTick().transitions[0].source.physicalCode).toBe('KeyA');
        const released = { backend: 'dom' as const, physicalCode: 'KeyA' };
        state.release('jump', released);
        released.physicalCode = 'KeyC';
        expect(state.consumeTick().transitions[0].source.physicalCode).toBe('KeyA');
        expect(state.held('jump')).toBe(false);
    });

    test('axis sources and pointer pattern declarations are copied on admission', () => {
        const pattern = { backend: 'dom' as 'dom' | 'manual', pointerId: '*' as const };
        const state = createActionState({ actions: { move: { mode: 'axis', sources: [pattern] } } });
        pattern.backend = 'manual';
        expect(state.actionsFor({ backend: 'dom', pointerId: 8 })).toEqual(['move']);
        expect(state.actionsFor({ backend: 'manual', pointerId: 8 })).toEqual([]);
        const source = { backend: 'dom' as const, pointerId: 8 };
        state.setAxis('move', source, 0.5);
        source.pointerId = 9;
        expect(state.heldSources('move')[0].pointerId).toBe(8);
        state.setAxis('move', { backend: 'dom', pointerId: 8 }, 0);
        expect(state.axis('move')).toBe(0);
    });
});
