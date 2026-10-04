import {
    createAirApp,
    Scene,
    Node,
    Camera,
    MeshRenderer,
    Material,
    Color,
    Vec3,
    Layers,
    utils,
    createPrimitiveGeometry,
    director,
    game,
    createUICanvas,
    Canvas,
    UITransform,
    Label,
    createActionState,
    createActionInput,
    createSessionGate,
    KeyCode,
    Texture2D,
    SpriteFrame,
    Sprite,
    NodePool,
} from 'cocosair';
import type { Asset, AirActionTick } from 'cocosair';
import { createOptionalServiceRecipe } from './optional-recipe';

// The harness owns the clock; recipes never start a second pacer.
const app = await createAirApp({ canvas: '#GameCanvas', designResolution: { width: 480, height: 360, policy: 0 } });
const scene = new Scene('PortRecipes');
const ui = createUICanvas(scene, 'RecipeCanvas', { designWidth: 480, designHeight: 360 });
ui.getComponent(Canvas)!.cameraComponent!.clearColor = new Color(0, 0, 0, 255);
ui.active = false;
app.run(scene);
game.pause();
let renderedFrames = 0;
async function render(): Promise<void> {
    director.tick(0);
    await Promise.resolve();
    director.tick(0);
    renderedFrames += 2;
}
function pixel(x = 240, y = 180): number[] {
    const gl = app.canvas.getContext('webgl2')!,
        bytes = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return [...bytes];
}
function hudInk(): number {
    const gl = app.canvas.getContext('webgl2')!,
        bytes = new Uint8Array(360 * 70 * 4);
    gl.readPixels(60, 145, 360, 70, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let count = 0;
    for (let i = 0; i < bytes.length; i += 4) if (bytes[i] > 200 && bytes[i + 1] > 200 && bytes[i + 2] > 200) count++;
    return count;
}
const vector = (v: Readonly<Vec3>) => [v.x, v.y, v.z];
function caught(name: string, call: () => unknown) {
    try {
        call();
        return { name, error: null, errorCode: null, method: 'REAL_BROWSER' };
    } catch (error) {
        const e = error as Error & { code?: string };
        return {
            name,
            error: String(e),
            errorCode: typeof e.code === 'string' ? e.code : e.name,
            legacyCode: e.code ?? null,
            method: 'REAL_BROWSER',
        };
    }
}
function guard(condition: boolean, code: string): void {
    if (!condition) throw Object.assign(new Error(code), { code });
}
function rootNode(name: string, parent: Node = scene): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    return node;
}
function cameraFor(root: Node) {
    const node = rootNode('Camera', root);
    node.setPosition(0, 0, 8);
    const camera = node.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 3;
    camera.visibility = Layers.Enum.DEFAULT;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(0, 0, 0, 255);
    return { node, camera };
}
function boxFor(root: Node) {
    const node = rootNode('Box', root),
        mesh = utils.createMesh(createPrimitiveGeometry({ type: 'box', width: 1, height: 1, length: 1 }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new Color(255, 0, 0, 255));
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    return { node, mesh, material, renderer };
}
async function retire(root: Node, assets: Asset[] = []) {
    root.destroy();
    assets.forEach((a) => a.destroy());
    await render();
    return { rootValid: root.isValid, assetsValid: assets.map((a) => a.isValid), refs: assets.map((a) => a.refCount) };
}
interface Recipe {
    construct(): Promise<unknown>;
    run(): Promise<unknown>;
    pauseRestart(): Promise<unknown>;
    release(): Promise<unknown>;
    negatives(): Promise<unknown>;
    step?(dt: number): Promise<unknown>;
    snapshot?(): unknown;
    pauseInput?(): Promise<unknown>;
    restartInput?(): Promise<unknown>;
}
const recipes: Record<string, Recipe> = {};
// R1: native rendering, named geometry parameters, actual pixels.
{
    let root: Node,
        camera: Camera,
        box: ReturnType<typeof boxFor>,
        disposed = false;
    recipes['r1-code3d'] = {
        async construct() {
            ui.active = false;
            root = rootNode('Code3D');
            ({ camera } = cameraFor(root));
            box = boxFor(root);
            await render();
            return {
                pixel: pixel(),
                meshValid: box.mesh.isValid,
                materialValid: box.material.isValid,
                boxParent: box.node.parent === root,
            };
        },
        async run() {
            box.node.setRotationFromEuler(15, 30, 0);
            await render();
            return { pixel: pixel(), rotation: vector(box.node.eulerAngles) };
        },
        async pauseRestart() {
            box.node.active = false;
            await render();
            const pausedPixel = pixel();
            box.node.active = true;
            box.node.setRotationFromEuler(0, 0, 0);
            await render();
            return { pausedPixel, restartedPixel: pixel(), rotation: vector(box.node.eulerAngles) };
        },
        async negatives() {
            const width = camera.orthoWidth;
            return {
                cases: [
                    caught('negative-half-width', () => {
                        camera.orthoWidth = -1;
                    }),
                    caught('invalid-geometry-size', () => createPrimitiveGeometry({ type: 'box', width: -1 })),
                ],
                widthBefore: width,
                widthAfter: camera.orthoWidth,
                meshValid: box.mesh.isValid,
            };
        },
        async release() {
            if (disposed) return { alreadyReleased: true };
            disposed = true;
            box.renderer.mesh = null;
            box.renderer.setSharedMaterial(null, 0);
            return retire(root, [box.mesh, box.material]);
        },
    };
}
// R2: native PAL/input -> action reducer -> business accumulator -> native Label.
{
    const state = createActionState({
        actions: { right: { sources: [{ backend: 'native', keyCode: KeyCode.KEY_D }] } },
    });
    const gate = createSessionGate(),
        adapter = createActionInput({ state, backend: 'native', canvas: app.canvas, session: gate });
    let root: Node,
        label: Label,
        acc = 0,
        steps = 0,
        x = 0,
        paused = false,
        disposed = false;
    const ticks: AirActionTick[] = [];
    const snapshot = () => ({
        x,
        steps,
        accumulator: acc,
        held: state.held('right'),
        pressed: state.pressed('right'),
        ticks: [...ticks],
        label: label.string,
        inkPixels: hudInk(),
        attached: adapter.attached,
        generation: gate.generation,
        renderedFrames,
    });
    async function step(dt: number) {
        guard(Number.isFinite(dt) && dt >= 0, 'RECIPE_INVALID_DT');
        guard(!disposed, 'RECIPE_DISPOSED');
        if (!paused) {
            acc += dt;
            let count = 0;
            while (acc + 1e-12 >= 1 / 60 && count++ < 5) {
                acc -= 1 / 60;
                ticks.push(state.consumeTick());
                steps++;
                if (state.held('right')) x += 2;
            }
        }
        label.string = `X=${x} steps=${steps}`;
        await render();
        return snapshot();
    }
    recipes['r2-input-hud'] = {
        async construct() {
            ui.active = true;
            root = rootNode('InputHUD', ui);
            const node = rootNode('HUD', root);
            node.addComponent(UITransform).setContentSize(360, 70);
            label = node.addComponent(Label);
            label.fontSize = 28;
            label.string = 'X=0 steps=0';
            gate.activate();
            adapter.attach();
            adapter.requestFocus();
            await render();
            return snapshot();
        },
        async run() {
            return step(0);
        },
        step,
        snapshot,
        async pauseInput() {
            paused = true;
            gate.deactivate('pause');
            return step(0);
        },
        async restartInput() {
            paused = false;
            gate.activate();
            return step(0);
        },
        async pauseRestart() {
            paused = true;
            gate.deactivate('pause');
            const before = snapshot();
            await step(3 / 60);
            const after = snapshot();
            paused = false;
            x = 0;
            steps = 0;
            acc = 0;
            ticks.length = 0;
            gate.activate();
            await step(0);
            return { before, after, restarted: snapshot() };
        },
        async negatives() {
            return {
                cases: [
                    caught('unknown-action', () => state.held('misspelled')),
                    caught('nonfinite-axis', () =>
                        state.setAxis('right', { backend: 'manual', physicalCode: 'HUD' }, NaN),
                    ),
                ],
                state: snapshot(),
            };
        },
        async release() {
            adapter.dispose();
            gate.deactivate('dispose');
            disposed = true;
            const result = await retire(root);
            ui.active = false;
            return {
                ...result,
                attached: adapter.attached,
                held: state.held('right'),
                reattach: caught('terminal-attach', () => adapter.attach()),
            };
        },
    };
}
// R3: pointer-lock permission must come from a trusted browser button click.
{
    let root: Node,
        cameraNode: Node,
        box: ReturnType<typeof boxFor>,
        yaw = 0,
        moves = 0,
        changes = 0,
        trustedMoves = 0,
        disposed = false;
    const acceptedMoves: { dx: number; dy: number; trusted: boolean }[] = [];
    let lastError: string | null = null,
        requestTrusted = false,
        paused = false;
    const button = document.getElementById('lockBtn') as HTMLButtonElement;
    const onChange = () => {
            changes++;
        },
        onError = () => {
            lastError = 'pointerlockerror';
        };
    const onMove = (event: MouseEvent) => {
        if (event.isTrusted) trustedMoves++;
        if (!disposed && !paused && document.pointerLockElement === app.canvas) {
            moves++;
            acceptedMoves.push({ dx: event.movementX, dy: event.movementY, trusted: event.isTrusted });
            yaw += event.movementX * 0.2;
            cameraNode.setRotationFromEuler(0, yaw, 0);
            void render();
        }
    };
    const onRequest = (event: MouseEvent) => {
        requestTrusted = event.isTrusted;
        if (disposed || paused) {
            lastError = 'RECIPE_INACTIVE';
            return;
        }
        try {
            const result = app.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            result?.catch((e) => {
                lastError = String(e);
            });
        } catch (e) {
            lastError = String(e);
        }
    };
    const snapshot = () => ({
        locked: document.pointerLockElement === app.canvas,
        yaw,
        moves,
        trustedMoves,
        changes,
        lastError,
        requestTrusted,
        paused,
        disposed,
        acceptedMoves: acceptedMoves.map((v) => ({ ...v })),
    });
    recipes['r3-pointer-lock'] = {
        async construct() {
            ui.active = false;
            root = rootNode('FPS');
            cameraNode = cameraFor(root).node;
            box = boxFor(root);
            button.hidden = false;
            document.addEventListener('pointerlockchange', onChange);
            document.addEventListener('pointerlockerror', onError);
            // PAL stops canvas mouse events from bubbling; inspect the same DOM
            // event during capture without adding another native input dispatch.
            document.addEventListener('mousemove', onMove, true);
            button.addEventListener('click', onRequest);
            await render();
            return snapshot();
        },
        async run() {
            await render();
            return { ...snapshot(), pixel: pixel() };
        },
        snapshot,
        async pauseInput() {
            paused = true;
            if (document.pointerLockElement === app.canvas) document.exitPointerLock();
            await new Promise((resolve) => setTimeout(resolve, 50));
            return snapshot();
        },
        async restartInput() {
            paused = false;
            yaw = 0;
            cameraNode.setRotationFromEuler(0, 0, 0);
            await render();
            return snapshot();
        },
        async pauseRestart() {
            paused = true;
            if (document.pointerLockElement === app.canvas) document.exitPointerLock();
            await new Promise((resolve) => setTimeout(resolve, 50));
            const before = snapshot();
            onMove(new MouseEvent('mousemove', { movementX: 50 }));
            const after = snapshot();
            paused = false;
            yaw = 0;
            cameraNode.setRotationFromEuler(0, 0, 0);
            await render();
            return { before, after, restarted: snapshot() };
        },
        async negatives() {
            const detached = document.createElement('canvas');
            return {
                cases: [
                    caught('inactive-pointer-capture', () => app.canvas.setPointerCapture(987654321)),
                    caught('detached-pointer-capture', () => detached.setPointerCapture(987654321)),
                ],
                snapshot: snapshot(),
                limitations: [
                    'DOM pointer-capture negatives do not certify pointer-lock denial',
                    'Paused movement is synthetic; trusted movement checked separately',
                ],
            };
        },
        async release() {
            disposed = true;
            if (document.pointerLockElement === app.canvas) document.exitPointerLock();
            document.removeEventListener('pointerlockchange', onChange);
            document.removeEventListener('pointerlockerror', onError);
            document.removeEventListener('mousemove', onMove, true);
            button.removeEventListener('click', onRequest);
            button.hidden = true;
            box.renderer.mesh = null;
            box.renderer.setSharedMaterial(null, 0);
            return { ...(await retire(root, [box.mesh, box.material])), snapshot: snapshot() };
        },
    };
}
// R4: original world bases. Guards below belong to the application recipe.
{
    let root: Node,
        cam: ReturnType<typeof cameraFor>,
        box: ReturnType<typeof boxFor>,
        disposed = false;
    const target = () => {
        guard(!disposed && box.node.isValid, 'RECIPE_TARGET_DISPOSED');
        return box.node;
    };
    const moveTarget = (position: { x: number; y: number; z: number }) => {
        guard([position.x, position.y, position.z].every(Number.isFinite), 'RECIPE_INVALID_TARGET');
        target().setPosition(position.x, position.y, position.z);
    };
    const groundBasis = (basis: Vec3) => {
        guard(Math.hypot(basis.x, basis.z) > 1e-6, 'RECIPE_VERTICAL_BASIS');
        return new Vec3(basis.x, 0, basis.z).normalize();
    };
    const track = (mode: 'chase' | 'flight') => {
        const node = target(),
            offset = mode === 'chase' ? new Vec3(0, 2, 6) : new Vec3(4, 4, 6);
        cam.node.setPosition(node.worldPosition.clone().add(offset));
        cam.node.lookAt(node.worldPosition);
        return {
            mode,
            target: vector(node.worldPosition),
            camera: vector(cam.node.worldPosition),
            forward: vector(cam.node.forward),
            vehicleForward: vector(node.forward),
            groundForward: vector(groundBasis(cam.node.forward)),
        };
    };
    recipes['r4-camera-modes'] = {
        async construct() {
            ui.active = false;
            root = rootNode('CameraModes');
            cam = cameraFor(root);
            box = boxFor(root);
            box.node.setRotationFromEuler(0, 90, 0);
            const result = track('chase');
            await render();
            return { ...result, pixel: pixel() };
        },
        async run() {
            moveTarget(new Vec3(2, 0, -1));
            const chase = track('chase');
            await render();
            const chasePixel = pixel();
            const flight = track('flight');
            await render();
            return { chase, flight, chasePixel, flightPixel: pixel() };
        },
        async pauseRestart() {
            const before = { target: vector(target().worldPosition), camera: vector(cam.node.worldPosition) };
            await render();
            const after = { target: vector(target().worldPosition), camera: vector(cam.node.worldPosition) };
            moveTarget(new Vec3());
            const restarted = track('chase');
            await render();
            return { before, after, restarted, pixel: pixel() };
        },
        async negatives() {
            const before = vector(cam.node.worldPosition);
            const cases = [
                caught('nonfinite-target', () => moveTarget({ x: NaN, y: 0, z: 0 })),
                caught('zero-ground-basis', () => groundBasis(new Vec3(0, 1, 0))),
            ];
            return {
                cases,
                cameraBefore: before,
                cameraAfter: vector(cam.node.worldPosition),
                method: 'APPLICATION_POLICY_WITH_NATIVE_NODE',
            };
        },
        async release() {
            disposed = true;
            box.renderer.mesh = null;
            box.renderer.setSharedMaterial(null, 0);
            return { ...(await retire(root, [box.mesh, box.material])), terminal: caught('retired-target', target) };
        },
    };
}
// R5: Sprite borrows its frame. Explicit leases survive hiding and pooling.
{
    let root: Node, texture: Texture2D, frame: SpriteFrame, nodes: Node[], sprites: Sprite[];
    const pool = new NodePool();
    let disposed = false;
    const refs = () => ({
        texture: texture.refCount,
        frame: frame.refCount,
        pool: pool.size(),
        nodesValid: nodes.map((n) => n.isValid),
    });
    function makeNode(name: string, x: number) {
        const node = rootNode(name, root);
        node.setPosition(x, 0, 0);
        node.addComponent(UITransform).setContentSize(64, 64);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        frame.addRef();
        sprite.spriteFrame = frame;
        return { node, sprite };
    }
    recipes['r5-shared-assets'] = {
        async construct() {
            ui.active = true;
            root = rootNode('SharedAssets', ui);
            texture = new Texture2D();
            texture.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
            texture.uploadData(new Uint8Array([0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255]));
            texture.addRef();
            frame = new SpriteFrame();
            frame.texture = texture;
            frame.packable = false;
            frame.addRef();
            const made = [-100, 0, 100].map((x, i) => makeNode(`Shared${i}`, x));
            nodes = made.map((v) => v.node);
            sprites = made.map((v) => v.sprite);
            await render();
            return {
                ...refs(),
                pixels: [140, 240, 340].map((x) => pixel(x)),
                sameFrame: sprites.every((s) => s.spriteFrame === frame),
            };
        },
        async run() {
            const before = refs();
            nodes[0].active = false;
            pool.put(nodes[1]);
            await render();
            const hidden = refs(),
                hiddenPixels = [140, 240, 340].map((x) => pixel(x));
            nodes[0].active = true;
            const reused = pool.get()!;
            root.addChild(reused);
            await render();
            const old = nodes[0],
                peers = [nodes[1], nodes[2]];
            sprites[0].spriteFrame = null;
            frame.decRef();
            old.destroy();
            await render();
            const replacement = makeNode('Replacement', -100);
            nodes[0] = replacement.node;
            sprites[0] = replacement.sprite;
            await render();
            return {
                before,
                hidden,
                hiddenPixels,
                reusedSameNode: reused === nodes[1],
                after: refs(),
                pixels: [140, 240, 340].map((x) => pixel(x)),
                replacement: {
                    oldValid: old.isValid,
                    newValid: replacement.node.isValid,
                    peersPreserved: peers[0] === nodes[1] && peers[1] === nodes[2],
                    refs: refs(),
                },
            };
        },
        async pauseRestart() {
            const before = refs();
            root.active = false;
            await render();
            const pausedPixel = pixel();
            root.active = true;
            await render();
            return { before, after: refs(), pausedPixel, restartedPixel: pixel() };
        },
        async negatives() {
            pool.put(nodes[0]);
            const once = pool.size();
            pool.put(nodes[0]);
            const twice = pool.size();
            const reused = pool.get()!;
            root.addChild(reused);
            const empty = pool.get();
            await render();
            return {
                cases: [
                    {
                        name: 'duplicate-pool-put',
                        once,
                        twice,
                        sameNode: reused === nodes[0],
                        method: 'NATIVE_NODE_POOL',
                    },
                    { name: 'empty-pool-get', value: empty, size: pool.size(), method: 'NATIVE_NODE_POOL' },
                ],
                refs: refs(),
                pixel: pixel(),
            };
        },
        async release() {
            if (disposed) return { alreadyReleased: true };
            disposed = true;
            sprites.forEach((sprite) => {
                sprite.spriteFrame = null;
                frame.decRef();
            });
            pool.clear();
            const beforeOwnerRelease = refs();
            frame.decRef();
            texture.decRef();
            guard(frame.refCount === 0 && texture.refCount === 0, 'RECIPE_OUTSTANDING_LEASE');
            const result = await retire(root, [frame, texture]);
            await render();
            ui.active = false;
            return {
                ...result,
                beforeOwnerRelease,
                refs: refs(),
                frameValid: frame.isValid,
                textureValid: texture.isValid,
            };
        },
    };
}
// R6: optional services share the existing scene and paused frame clock.
{
    let root: Node, peer: Node, recipe: ReturnType<typeof createOptionalServiceRecipe>;
    const button = document.getElementById('optionalBtn') as HTMLButtonElement;
    let trustedRun: boolean | null = null,
        trustedCanvasGestures = 0,
        runResult: unknown,
        runError: string | null = null;
    const onRun = (event: MouseEvent) => {
        trustedRun = event.isTrusted;
        void recipes['r6-optional-svcs'].run().then(
            (value) => {
                runResult = value;
            },
            (error) => {
                runError = String(error);
            },
        );
    };
    const onGesture = (event: MouseEvent) => {
        if (event.isTrusted) trustedCanvasGestures++;
    };
    recipes['r6-optional-svcs'] = {
        async construct() {
            ui.active = true;
            root = rootNode('OptionalHost', ui);
            peer = rootNode('CallerOwnedPeer', root);
            recipe = createOptionalServiceRecipe({
                scene,
                host: root,
                baseURL: new URL(
                    app.canvas.dataset.recipeAssets || '/docs/manual/examples/manual-port-recipes/optional-assets/',
                    location.href,
                ).href,
                render,
            });
            button.hidden = false;
            button.addEventListener('click', onRun);
            app.canvas.addEventListener('mouseup', onGesture, true);
            const observed = await recipe.construct();
            return { ...observed, inkPixels: hudInk(), startAlreadyReady: director.getScene() === scene };
        },
        async run() {
            const observed = await recipe.run();
            return { ...observed, inkPixels: hudInk(), trustedRun, trustedCanvasGestures };
        },
        async pauseRestart() {
            const observed = await recipe.pauseRestart();
            await render();
            return { ...observed, inkPixels: hudInk() };
        },
        async negatives() {
            const cases = await recipe.negatives();
            return { cases, inkPixels: hudInk(), peerValid: peer.isValid };
        },
        snapshot: () => ({ trustedRun, runResult, runError, trustedCanvasGestures }),
        async release() {
            const observed = await recipe.release(),
                samePromise = recipe.release() === recipe.release();
            const peerBeforeCallerCleanup = peer.isValid && peer.parent === root;
            button.removeEventListener('click', onRun);
            app.canvas.removeEventListener('mouseup', onGesture, true);
            button.hidden = true;
            const retired = await retire(root);
            ui.active = false;
            return { ...observed, ...retired, samePromise, peerBeforeCallerCleanup };
        },
    };
}
// Every release call returns the identical terminal promise, including repeated disposal.
for (const recipe of Object.values(recipes)) {
    const construct = recipe.construct,
        release = recipe.release;
    let constructed = false,
        receipt: Promise<unknown> | undefined;
    recipe.construct = async () => {
        guard(!receipt, 'RECIPE_DISPOSED');
        guard(!constructed, 'RECIPE_ALREADY_CONSTRUCTED');
        constructed = true;
        return construct();
    };
    for (const name of ['run', 'pauseRestart', 'negatives', 'step', 'pauseInput', 'restartInput'] as const) {
        const operation = recipe[name];
        if (!operation) continue;
        // Business recipe guard, independent of the native engine API.
        (recipe as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
            guard(constructed, 'RECIPE_NOT_CONSTRUCTED');
            guard(!receipt, 'RECIPE_DISPOSED');
            return (operation as (...values: unknown[]) => Promise<unknown>)(...args);
        };
    }
    recipe.release = () => {
        guard(constructed, 'RECIPE_NOT_CONSTRUCTED');
        return (receipt ??= release());
    };
}
(window as unknown as { __portRecipes: unknown }).__portRecipes = {
    ready: true,
    ids: Object.keys(recipes),
    recipes,
    render,
    snapshot: () => ({
        renderedFrames,
        enginePaused: game.isPaused(),
        diagnostics: app.diagnostics?.snapshot() ?? null,
    }),
    close: () => app.close?.(),
};
document.getElementById('hud')!.textContent = 'PG-33: phase-driven core recipes';
document.getElementById('lockBtn')!.hidden = true;
document.getElementById('optionalBtn')!.hidden = true;
