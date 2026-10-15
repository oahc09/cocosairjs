const params = new URLSearchParams(location.search), backend = params.get('backend') || 'native';
const canvas = document.querySelector('canvas');
if (params.get('canvas') === 'custom') canvas.id = 'ActionCanvas';
const { createAirApp } = await import('/build/cocosair.module.js');
const app = await createAirApp({ canvas });
const { Scene, KeyCode, createActionState, createActionInput } = await import('/build/cocosair.module.js');
app.run(new Scene('Action ownership'));
const key = (code, keyCode) => backend === 'native' ? { backend, keyCode } : { backend, physicalCode: code };
const state = createActionState({ actions: {
    jump: { sources: [key('Space', KeyCode.SPACE), key('KeyA', KeyCode.KEY_A), { backend: 'manual', pointerId: 7 }] },
    shift: { sources: [key('ShiftLeft', KeyCode.SHIFT_LEFT), key('ShiftRight', KeyCode.SHIFT_RIGHT)] },
    pointer: { sources: [{ backend, pointerId: '*' }] },
    move: { mode: 'axis', sources: [{ source: key('ArrowLeft', KeyCode.ARROW_LEFT), value: -1 },
        { source: key('ArrowRight', KeyCode.ARROW_RIGHT), value: 1 }] },
} });
const gate = app.session, adapter = createActionInput({ state, backend, canvas, session: gate });
adapter.attach(); adapter.attach(); gate.own(() => adapter.dispose(), 'action-input');
document.querySelector('#start').addEventListener('click', () => adapter.requestFocus());
const hud = document.querySelector('#hud');
hud.addEventListener('mousedown', () => state.press('jump', { backend: 'manual', pointerId: 7 }));
hud.addEventListener('mouseup', () => state.release('jump', { backend: 'manual', pointerId: 7 }));
let trustedTouch = 0, trustedPointer = 0;
canvas.addEventListener('touchstart', (event) => { if (event.isTrusted) trustedTouch++; });
canvas.addEventListener('pointerdown', (event) => { if (event.isTrusted) trustedPointer++; });
const snapshot = () => ({ jump: state.held('jump'), sources: state.heldSources('jump'), pointer: state.held('pointer'),
    pointers: state.heldSources('pointer'), axis: state.axis('move'), shift: state.heldSources('shift'),
    reset: state.lastReset(), focus: document.activeElement === canvas, generation: gate.generation,
    trustedTouch, trustedPointer, attached: adapter.attached });
(window as any).__actionProbe = { ready: true, snapshot, tick: () => state.consumeTick(),
    reset: (reason = 'manual') => state.reset(reason), pause: () => adapter.reset('pause'),
    deactivate: () => gate.deactivate('deactivate'), activate: () => gate.activate(),
    dispose: () => { adapter.dispose(); let code; try { adapter.attach(); } catch (error) { code = error.code; } return code; },
    release: () => app.releaseScene(), hudPress: () => state.press('jump', { backend: 'manual', pointerId: 7 }),
    hudRelease: () => state.release('jump', { backend: 'manual', pointerId: 7 }) };
