import { createAirApp, Scene, Node, UITransform, createUICanvas, Input, input, KeyCode,
    createActionState, createActionInput, game, director } from 'cocosair';
import { createTestInput } from '../../../tools/debug/test-input';
import type { AirActionResetReason } from 'cocosair';
const backend = new URLSearchParams(location.search).get('backend') === 'dom' ? 'dom' : 'native';
const canvas = document.querySelector('canvas')!;
const app = await createAirApp({ canvas, designResolution: { width: 480, height: 360, policy: 0 } });
const scene = new Scene('Mixed input'), ui = createUICanvas(scene, 'UI', { designWidth: 480, designHeight: 360 });
const region = new Node('PureUI'); region.layer = ui.layer; region.setPosition(-120, 0, 0);
ui.addChild(region); region.addComponent(UITransform).setContentSize(80, 80);
app.run(scene); game.pause(); director.tick(0);
const counts = { uiStart: 0, globalStart: 0, globalEnd: 0, globalCancel: 0, mouseDown: 0, mouseUp: 0 };
region.on(Input.EventType.TOUCH_START, () => counts.uiStart++);
for (const [type, name] of [[Input.EventType.TOUCH_START, 'globalStart'], [Input.EventType.TOUCH_END, 'globalEnd'],
    [Input.EventType.TOUCH_CANCEL, 'globalCancel'], [Input.EventType.MOUSE_DOWN, 'mouseDown'], [Input.EventType.MOUSE_UP, 'mouseUp']] as const) {
    const handler = () => counts[name]++; input.on(type, handler); app.session!.own(() => input.off(type, handler), 'observe-native-input');
}
const key = (physicalCode: string, keyCode: KeyCode) => backend === 'native'
    ? { backend: 'native' as const, keyCode } : { backend: 'dom' as const, physicalCode };
const state = createActionState({ actions: { fire: { sources: [key('Space', KeyCode.SPACE), key('KeyA', KeyCode.KEY_A),
    { backend, pointerId: '*' }, { backend: 'manual', physicalCode: 'HUD' }] }, pointer: { sources: [{ backend, pointerId: '*' }] } } });
const adapter = createActionInput({ state, backend, canvas, session: app.session }); adapter.attach(); adapter.attach();
const synthetic = createTestInput({ canvas, session: app.session });
app.session!.own(() => { synthetic.dispose(); adapter.dispose(); }, 'mixed-tools');
document.querySelector('#start')!.addEventListener('click', () => adapter.requestFocus());
const hudSource = { backend: 'manual' as const, physicalCode: 'HUD' };
document.querySelector('#hud')!.addEventListener('mousedown', () => state.press('fire', hudSource));
document.querySelector('#hud')!.addEventListener('mouseup', () => state.release('fire', hudSource));
const raw: { type: string; isTrusted: boolean }[] = [];
for (const type of ['keydown', 'keyup', 'mousedown', 'touchstart', 'touchcancel', 'pointerdown', 'pointercancel', 'blur', 'visibilitychange']) {
    const target = type === 'blur' ? window : type === 'visibilitychange' ? document : canvas;
    const handler = (e: Event) => { if (raw.length < 160) raw.push({ type: e.type, isTrusted: e.isTrusted }); };
    target.addEventListener(type, handler); app.session!.own(() => target.removeEventListener(type, handler), 'observe-raw-input');
}
function points(type: 'start' | 'end' | 'cancel', ids: number[]) {
    const rect = canvas.getBoundingClientRect();
    if (backend === 'native') return synthetic.touch(type, ids.map(id => ({ id,
        clientX: rect.left + rect.width * (id === 11 ? 0.25 : 0.75), clientY: rect.top + rect.height / 2 })));
    const kind = type === 'start' ? 'pointerdown' : type === 'end' ? 'pointerup' : 'pointercancel';
    for (const pointerId of ids) canvas.dispatchEvent(new PointerEvent(kind, { bubbles: true, cancelable: true,
        pointerId, pointerType: 'touch', clientX: rect.left + rect.width * 0.75, clientY: rect.top + rect.height / 2 }));
    return { method: 'SYNTHETIC', isTrusted: false, changedIds: ids, type: kind };
}
const snapshot = () => ({ held: state.held('fire'), sources: state.heldSources('fire'), pointers: state.heldSources('pointer'),
    reset: state.lastReset(), counts: { ...counts }, raw: [...raw], hidden: document.hidden, focused: document.hasFocus(),
    attached: adapter.attached, backend, generation: app.session!.generation });
(window as any).__mixed = { ready: true, snapshot, points, tick: () => state.consumeTick(),
    reset: (reason: AirActionResetReason = 'manual') => adapter.reset(reason), activate: () => app.session!.activate(),
    syntheticBlur: () => window.dispatchEvent(new Event('blur')),
    syntheticHidden: () => { Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange')); delete (document as any).hidden; },
    release: () => app.releaseScene!() };
