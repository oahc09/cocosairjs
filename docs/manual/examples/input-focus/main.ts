import {
    createAirApp,
    createSessionScope,
    createActionState,
    createActionInput,
    Scene,
    Node,
    Camera,
    Color,
    Director,
    director,
    MeshRenderer,
    Material,
    utils,
    primitives,
} from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' }),
    scene = new Scene('Focus matrix');
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 6);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 2;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(21, 32, 43, 255);
const actor = new Node('Action counter');
scene.addChild(actor);
const renderer = actor.addComponent(MeshRenderer);
const mesh = utils.createMesh(primitives.box({ width: 0.5, height: 0.5, length: 0.5 })),
    material = new Material();
material.initialize({ effectName: 'builtin-unlit' });
material.setProperty('mainColor', new Color(255, 154, 60));
renderer.mesh = mesh;
renderer.setSharedMaterial(material, 0);
app.run(scene);
const scope = createSessionScope(),
    state = createActionState({ actions: { move: { sources: [{ backend: 'dom', physicalCode: 'KeyA' }] } } });
const input = createActionInput({ state, backend: 'dom', canvas: app.canvas, session: scope });
input.attach();
scope.own(() => input.dispose(), 'action-input');
let presses = 0;
const consume = () => {
    for (const transition of state.consumeTick().transitions)
        if (transition.kind === 'press') {
            presses++;
            actor.setPosition(((presses % 5) - 2) * 0.5, 0, 0);
        }
    document.querySelector('#status')!.textContent =
        `Presses: ${presses}; held: ${state.held('move')}; active: ${scope.active}`;
};
director.on(Director.EVENT_BEFORE_UPDATE, consume);
scope.own(() => director.off(Director.EVENT_BEFORE_UPDATE, consume), 'focus-frame');
const listeners = new AbortController();
scope.own(() => listeners.abort(), 'focus-listeners');
document.querySelector('#start')!.addEventListener(
    'click',
    () => {
        scope.activate();
        input.requestFocus();
    },
    { signal: listeners.signal },
);
document.querySelector('#leave')!.addEventListener(
    'click',
    () => {
        scope.deactivate('leave');
    },
    { signal: listeners.signal },
);
app.canvas.addEventListener('click', () => input.requestFocus(), { signal: listeners.signal });
let closing: Promise<unknown> | undefined;
const close = () =>
    (closing ??= (async () => {
        await scope.dispose();
        const receipt = await app.close!();
        mesh.destroy();
        material.destroy();
        return receipt;
    })());
window.addEventListener(
    'pagehide',
    () => {
        void close();
    },
    { signal: listeners.signal },
);
export const verification = {
    app,
    scope,
    state,
    input,
    actor,
    close,
    get presses() {
        return presses;
    },
};
