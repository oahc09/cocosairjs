import { createAirApp, Scene, Node, UITransform, Input, input, createUICanvas, game } from 'cocosair';

const canvas = document.querySelector('canvas')!;
const app = await createAirApp({ canvas });
const scene = new Scene('InputProbe');
const ui = createUICanvas(scene);
const region = new Node('NonRenderingInputRegion');
region.layer = ui.layer;
region.addComponent(UITransform).setContentSize(240, 160);
ui.addChild(region);
const state = {
    ready: false, keyDown: 0, keyUp: 0, captureDown: 0, bubbleDown: 0,
    region: { start: 0, move: 0, end: 0, cancel: 0 },
    global: { start: 0, move: 0, end: 0, cancel: 0 },
    trusted: [] as { type: string; trusted: boolean }[],
};
window.addEventListener('keydown', () => { state.captureDown++; }, true);
window.addEventListener('keydown', () => { state.bubbleDown++; });
input.on(Input.EventType.KEY_DOWN, () => { state.keyDown++; });
input.on(Input.EventType.KEY_UP, () => { state.keyUp++; });
for (const [key, type] of Object.entries({ start: Input.EventType.TOUCH_START, move: Input.EventType.TOUCH_MOVE,
    end: Input.EventType.TOUCH_END, cancel: Input.EventType.TOUCH_CANCEL })) {
    region.on(type, () => { state.region[key]++; });
    input.on(type, () => { state.global[key]++; });
}
for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel']) {
    canvas.addEventListener(type, (event) => { state.trusted.push({ type, trusted: event.isTrusted }); }, true);
}
app.run(scene);
await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
state.ready = true;
(window as any).__airInputProbe = { state, app, scene, ui, region, game,
    snapshot: () => JSON.parse(JSON.stringify(state)),
    resetCounts: () => { state.keyDown = state.keyUp = state.captureDown = state.bubbleDown = 0;
        for (const counts of [state.region, state.global]) for (const key of Object.keys(counts)) counts[key] = 0;
        state.trusted.length = 0; },
};
