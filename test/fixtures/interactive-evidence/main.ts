/** Independent native fixture; it does not reproduce the inaccessible cloud applications. */
import {
    createAirApp, createActionState, createActionInput, createSessionGate, createStepClock,
    Scene, Node, Camera, MeshRenderer, Material, Color, utils, game,
} from 'cocosair';

const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const cover = document.querySelector<HTMLElement>('#cover')!;
const app = await createAirApp({ canvas, pixelRatioCap: 2 });
if (typeof app.close !== 'function') throw new Error('Fixture requires the public app.close lifecycle');
const closeApp = app.close.bind(app);
const scene = new Scene('ier-evidence');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 5);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 2;
camera.near = 0.1;
camera.far = 20;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(0, 0, 0, 255);
const target = new Node('visible-native-target');
scene.addChild(target);
target.setPosition(-1, 0, 0);
const renderer = target.addComponent(MeshRenderer);
const mesh = utils.createMesh({ positions: [-0.45,-0.45,0,0.45,-0.45,0,-0.45,0.45,0,0.45,0.45,0], indices: [0,1,2,1,3,2] });
mesh.addRef();
const material = new Material();
material.initialize({ effectName: 'builtin-unlit' });
material.setProperty('mainColor', new Color(255, 0, 0, 255));
material.addRef();
renderer.mesh = mesh;
renderer.setSharedMaterial(material, 0);
const state = createActionState({ actions: { move: { sources: [
    { backend: 'dom', pointerId: '*' }, { backend: 'dom', physicalCode: 'KeyD' },
] } } });
const gate = createSessionGate();
gate.activate();
const input = createActionInput({ state, backend: 'dom', canvas, session: gate });
input.attach();
const listeners = new AbortController();
let sequence = 0;
let receivedEvent: Record<string, unknown> = { type: 'startup', sequence: 0, isTrusted: false };
let submittedFrame: Record<string, unknown> = { event: 'UNKNOWN' };
let transitions: unknown[] = [];
let releasePromise: Promise<unknown> | null = null;
let released = false;
const clock = createStepClock();

function observe(event: Event): void {
    const e = event as PointerEvent & KeyboardEvent;
    receivedEvent = { type: e.type, sequence: ++sequence, isTrusted: e.isTrusted,
        pointerId: e.pointerId ?? null, physicalCode: e.code || null,
        clientX: e.clientX ?? null, clientY: e.clientY ?? null,
        timestamp: new Date().toISOString() };
}
canvas.addEventListener('pointerdown', observe, { signal: listeners.signal });
window.addEventListener('keydown', observe, { signal: listeners.signal });
document.querySelector('#reset')!.addEventListener('click', event => {
    observe(event);
    input.reset('manual');
    target.setPosition(-1, 0, 0);
}, { signal: listeners.signal });
document.querySelector('#occlude')!.addEventListener('click', event => {
    observe(event);
    cover.style.display = cover.style.display === 'block' ? 'none' : 'block';
}, { signal: listeners.signal });

function snapshot(): Record<string, unknown> {
    const rect = canvas.getBoundingClientRect();
    return { receivedEvent: { ...receivedEvent },
        modelState: { targetName: target.name, x: target.position.x, y: target.position.y, held: state.held('move'),
            transitions, receivedSequence: sequence, rendererMeshBound: renderer.mesh === mesh },
        layoutReceipt: { css: { width: rect.width, height: rect.height }, backing: { width: canvas.width, height: canvas.height },
            viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio },
        submittedFrame: { ...submittedFrame },
        clock: { method: 'STEP_CLOCK', stepping: clock.stepping, stepped: clock.stepped, enginePaused: game.isPaused() },
        released, attached: input.attached,
    };
}
async function step(): Promise<Record<string, unknown>> {
    if (released || releasePromise) throw new Error('RECIPE_DISPOSED');
    const tick = state.consumeTick();
    transitions = [...tick.transitions];
    for (const transition of tick.transitions) if (transition.kind === 'press') target.setPosition(target.position.x < 0 ? 1 : -1, 0, 0);
    const receipt = await clock.step(1 / 60);
    submittedFrame = { event: 'AFTER_DRAW', ...receipt, inputSequence: sequence, timestamp: new Date().toISOString() };
    status.value = `原生 x=${target.position.x}；输入 ${sequence}；提交 ${receipt.step}。截图独立判断是否可见。`;
    return snapshot();
}
function release(): Promise<unknown> {
    if (releasePromise) return releasePromise;
    const refs = [mesh, material].map(asset => ({ before: asset.refCount, after: -1 }));
    released = true;
    input.dispose();
    gate.deactivate('dispose');
    listeners.abort();
    renderer.mesh = null;
    renderer.setSharedMaterial(null, 0);
    target.removeFromParent();
    target.destroy();
    for (const [index, asset] of [mesh, material].entries()) {
        asset.decRef(); refs[index].after = asset.refCount;
    }
    const unbound = { ownedNodeDetached: target.parent === null, meshBound: renderer.mesh !== null,
        materialBound: renderer.getSharedMaterial(0) !== null, observedAt: 'BEFORE_APP_CLOSE' };
    releasePromise = Promise.resolve(closeApp()).then(() => ({ released, attached: input.attached, refs,
        ...unbound, rendererInvalidAfterClose: !renderer.isValid }));
    return releasePromise;
}
document.querySelector('#release')!.addEventListener('click', () => { void release(); }, { signal: listeners.signal });
window.addEventListener('pagehide', () => { void release(); }, { once: true });
await app.run(scene);
clock.begin();
await step();
(window as unknown as { __ierEvidence: unknown }).__ierEvidence = { snapshot, step, release };
