import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec3,
    Vec4,
    Component,
    MeshRenderer,
    Mesh,
    Material,
    EffectAsset,
    Input,
    input,
    EventMouse,
    gfx,
    utils,
    primitives,
    director,
    Director,
} from 'cocosair';
import { diskEffect, glowEffect, streamEffect, backgroundEffect } from './effects.generated.js';
import { BlackHoleState, backgroundPositions, streamSeeds, streamPosition } from './state.js';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const state = new BlackHoleState();
const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });
const templates = [diskEffect, glowEffect, streamEffect, backgroundEffect];
// Session-owned shader assets register after device initialization (WebProgramLibrary requires capabilities).
let effects: EffectAsset[] = [];
function createEffects(): void {
    effects = templates.map((data) => {
        const json = JSON.parse(JSON.stringify(data));
        const pass = json.techniques[0].passes[0];
        pass.depthStencilState = { depthTest: true, depthWrite: false };
        pass.blendState = {
            targets: [
                {
                    blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE,
                    blendSrcAlpha: gfx.BlendFactor.ONE,
                    blendDstAlpha: gfx.BlendFactor.ONE,
                },
            ],
        };
        const effect = Object.assign(new EffectAsset(), json);
        effect.onLoaded();
        return effect;
    });
}
createEffects();
const scene = new Scene('black-hole-accretion');
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.fov = 70;
camera.near = 0.1;
camera.far = 200;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(1, 2, 5, 255);
const motion = new Vec4(0, 0, 1, 0);
const owned = { nodes: [] as Node[], meshes: [] as Mesh[], materials: [] as Material[] };
let backgroundMesh: Mesh | null = null;
let streamMesh: Mesh | null = null;
let running = true;
let resetCount = 0;
const seeds = streamSeeds();
const frameTimes: number[] = [];

function add(name: string, mesh: Mesh, material: Material, tilt = false): void {
    const node = new Node(name);
    scene.addChild(node);
    if (tilt) node.setRotationFromEuler(-35, 0, 0);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    owned.nodes.push(node);
    owned.meshes.push(mesh);
    owned.materials.push(material);
}
function material(index: number): Material {
    const value = new Material();
    value.initialize({ effectAsset: effects[index] });
    value.setProperty('motion', motion);
    return value;
}
function quad(size: number): Mesh {
    return utils.createMesh({
        positions: [-size, -size, 0, size, -size, 0, size, size, 0, -size, size, 0],
        indices: [0, 1, 2, 0, 2, 3],
    });
}
function build(): void {
    if (effects.length === 0) createEffects();
    const horizon = new Material();
    horizon.initialize({ effectName: 'builtin-unlit' });
    horizon.setProperty('mainColor', Color.BLACK);
    add('Event Horizon', utils.createMesh(primitives.sphere(1.2, { segments: 64 })), horizon);
    add('Accretion Disk', quad(9), material(0), true);
    add('Analytic Additive Glow', quad(9), material(1), true);
    streamMesh = utils.createMesh({ positions: seeds, primitiveMode: gfx.PrimitiveMode.POINT_LIST });
    add('Spiral Star Stream', streamMesh, material(2), true);
    backgroundMesh = utils.createMesh({
        positions: backgroundPositions(),
        primitiveMode: gfx.PrimitiveMode.POINT_LIST,
    });
    add('Background Stars', backgroundMesh, material(3));
    running = true;
}
function release(): void {
    running = false;
    for (const node of owned.nodes) {
        node.removeFromParent();
        node.destroy();
    }
    for (const material of owned.materials) material.destroy();
    for (const mesh of owned.meshes) mesh.destroy();
    for (const effect of effects) effect.destroy();
    effects = [];
    owned.nodes.length = owned.materials.length = owned.meshes.length = 0;
    streamMesh = backgroundMesh = null;
}
function held(): { name: string; ref: object }[] {
    return [
        ...effects.map((ref) => ({ name: ref.name, ref })),
        ...owned.nodes.map((ref) => ({ name: ref.name, ref })),
        ...owned.meshes.map((ref, i) => ({ name: `mesh${i}`, ref })),
        ...owned.materials.map((ref, i) => ({ name: `material${i}`, ref })),
    ];
}
function updateCamera(): void {
    cameraNode.setPosition(0, 0, state.cameraDistance);
    cameraNode.lookAt(new Vec3());
}
function reset(): void {
    state.reset();
    updateCamera();
    resetCount++;
}
function getState() {
    return {
        diskRotation: state.diskRotation,
        accretionPhase: state.accretionPhase,
        cameraDistance: cameraNode.position.length(),
        starStreamCount: streamMesh?.struct.vertexBundles[0].view.count || 0,
        backgroundStarCount: backgroundMesh?.struct.vertexBundles[0].view.count || 0,
    };
}
class Animate extends Component {
    update(dt: number): void {
        if (!running) return;
        state.update(dt);
        updateCamera();
        motion.set(
            state.elapsed,
            state.diskRotation,
            Math.max(1, canvas.height / canvas.getBoundingClientRect().height),
            0,
        );
        for (const value of owned.materials.slice(1)) value.setProperty('motion', motion);
        frameTimes.push(performance.now());
        if (frameTimes.length > 60) frameTimes.shift();
    }
    onEnable(): void {
        input.on(Input.EventType.MOUSE_WHEEL, this.wheel, this);
    }
    onDisable(): void {
        input.off(Input.EventType.MOUSE_WHEEL, this.wheel, this);
    }
    private wheel(event: EventMouse): void {
        state.wheel(event.getScrollY());
    }
}
const driver = new Node('Animation Driver');
scene.addChild(driver);
driver.addComponent(Animate);
updateCamera();
build();
document.querySelector('[data-ui="reset"]')!.addEventListener('click', reset);
(window as any).__airApp = app;
(window as any).__bench = { getState, reset };
(window as any).__blackHoleProbe = () => ({
    resetCount,
    elapsed: state.elapsed,
    targetDistance: state.targetDistance,
    stream: [0, 40, 120, 200].map((index) => streamPosition(seeds[index * 3], seeds[index * 3 + 1], state.elapsed)),
    materialMotion: owned.materials[1]?.getProperty('motion'),
    glowMode: 'analytic-additive-impostor',
    callbackFps:
        frameTimes.length > 1
            ? ((frameTimes.length - 1) * 1000) / (frameTimes[frameTimes.length - 1] - frameTimes[0])
            : 0,
});
installAssetLifecycle({
    label: 'black-hole-accretion',
    hold: held,
    release,
    reacquire: async () => {
        build();
        return held();
    },
});
app.run(scene);
director.once(Director.EVENT_AFTER_DRAW, () => {
    (window as any).__appReady = true;
});
window.addEventListener(
    'pagehide',
    () => {
        release();
        for (const effect of effects) effect.destroy();
    },
    { once: true },
);
