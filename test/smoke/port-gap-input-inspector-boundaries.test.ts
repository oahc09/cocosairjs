import { createActionState } from '../../src/air/action-state';
import { createInputInspector } from '../../tools/debug/input-inspector';

describe('PG-28 inspector hard limits', () => {
    test('force, clear and enable toggles cannot bypass the sampling ceiling', () => {
        const state = createActionState({ actions: { jump: {} } });
        const inspector = createInputInspector(state, { snapshotHz: 100, limit: 100 });
        const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
        try {
            inspector.setEnabled(true); expect(inspector.snapshot(true)).not.toBeNull();
            inspector.clear(); expect(inspector.snapshot(true)).toBeNull();
            inspector.setEnabled(false); inspector.setEnabled(true);
            expect(inspector.snapshot(true)).toBeNull();
            clock.mockReturnValue(1499); expect(inspector.snapshot()).toBeNull();
            clock.mockReturnValue(1500); expect(inspector.snapshot()).not.toBeNull();
            expect(Object.isFrozen(inspector.entries())).toBe(true);
        } finally { clock.mockRestore(); }
    });

    test('non-finite or invalid limits fail explicitly', () => {
        const state = createActionState({ actions: { jump: {} } });
        for (const options of [{ limit: NaN }, { limit: 1.5 }, { limit: 0 }, { snapshotHz: NaN }, { snapshotHz: Infinity }]) {
            expect(() => createInputInspector(state, options)).toThrow(expect.objectContaining({ code: 'AIR_E_INSPECTOR_OPTIONS' }));
        }
    });
});
