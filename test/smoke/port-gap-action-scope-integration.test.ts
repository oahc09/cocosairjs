import { createSessionScope } from '../../src/air/session-scope';
import { createActionState } from '../../src/air/action-state';
import { createActionInput } from '../../src/air/action-input';

test('production action adapter consumes the scene scope generation and detaches its subscription', async () => {
    const scope = createSessionScope(); scope.activate();
    const canvas = document.createElement('canvas'); document.body.appendChild(canvas);
    const state = createActionState({ actions: { fire: { sources: [{ backend: 'dom', physicalCode: 'KeyF' }] } } });
    const input = createActionInput({ state, backend: 'dom', canvas, session: scope }); input.attach();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
    expect(state.held('fire')).toBe(true);
    scope.deactivate('release'); expect(state.held('fire')).toBe(false); expect(state.lastReset()?.reason).toBe('deactivate');
    scope.activate(); expect(state.lastReset()?.reason).toBe('restart');
    input.dispose(); const count = state.lastReset()!.count;
    scope.deactivate('after-dispose'); expect(state.lastReset()!.count).toBe(count);
    await scope.dispose();
});
