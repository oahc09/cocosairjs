import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    Vec3,
    Vec4,
    Material,
    EffectAsset,
    MeshRenderer,
    Component,
    gfx,
    utils,
    director,
    Director,
    game,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const STAR_COUNT = 50000;
const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const readout = document.querySelector('#readout') as HTMLElement;
// Readiness is separate from the self-validating trial protocol. External
// declared validators and the frozen-spec runner own behavior/pixel acceptance.
const sceneStatus = { id: 'starfield-galaxy', ready: false };
(window as any).__sceneReadyStatus = sceneStatus;
let phase = 0,
    epoch = 0,
    targetDistance = 120;
const parallax = { x: 0, y: 0 },
    targetParallax = { x: 0, y: 0 };
const frameTimes: number[] = [];
let fps = 0;

function starPositions(): number[] {
    let seed = 41717;
    const random = (): number => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const positions: number[] = [];
    for (let i = 0; i < STAR_COUNT; ++i) {
        const core = i < 7000;
        const radius = core ? Math.pow(random(), 1.5) * 13 : 9 + Math.pow(random(), 0.65) * 66;
        const theta = core
            ? random() * Math.PI * 2
            : ((i % 4) * Math.PI) / 2 + Math.log(radius / 9) * 2.4 + (random() - 0.5) * 0.45;
        positions.push(
            Math.cos(theta) * radius,
            (random() - 0.5) * (core ? 12 : 3) * (1 - radius / 95),
            Math.sin(theta) * radius,
        );
    }
    return positions;
}

async function main(): Promise<void> {
    // The static Gallery bundles src/main.ts into main.boot.js at the example root.
    const response = await fetch(new URL('galaxy.effect.json', document.baseURI));
    if (!response.ok) throw new Error(`galaxy effect HTTP ${response.status}`);
    const json = await response.json();
    json.techniques[0].passes[0].depthStencilState = { depthTest: true, depthWrite: false };
    json.techniques[0].passes[0].blendState = {
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
    const app = await createAirApp({ canvas });
    (window as any).__airApp = app;
    const scene = new Scene('Fifty thousand suns');
    const cameraNode = new Node('Observatory Camera');
    scene.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 76;
    camera.near = 0.1;
    camera.far = 1000;
    camera.clearColor = new Color(2, 5, 13, 255);
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    const model = new Node('Galaxy');
    scene.addChild(model);
    const renderer = model.addComponent(MeshRenderer);
    let material: Material, effect: EffectAsset, mesh: any;
    function build(): void {
        const source = JSON.parse(JSON.stringify(json));
        effect = Object.assign(new EffectAsset(), source);
        effect.onLoaded();
        material = new Material();
        material.initialize({ effectAsset: effect });
        mesh = utils.createMesh({
            positions: starPositions(),
            primitiveMode: gfx.PrimitiveMode.POINT_LIST,
            minPos: { x: -76, y: -7, z: -76 },
            maxPos: { x: 76, y: 7, z: 76 },
        });
        renderer.mesh = mesh;
        renderer.material = material;
    }
    function positionCamera(distance: number): void {
        const yaw = parallax.x * 0.26,
            elevation = 0.62 + parallax.y * 0.12;
        cameraNode.setPosition(
            Math.sin(yaw) * Math.cos(elevation) * distance,
            Math.sin(elevation) * distance,
            Math.cos(yaw) * Math.cos(elevation) * distance,
        );
        cameraNode.lookAt(Vec3.ZERO);
    }
    build();
    positionCamera(120);
    class GalaxyMotion extends Component {
        update(dt: number): void {
            phase += dt * 0.065;
            const weight = 1 - Math.exp(-dt * 3);
            parallax.x += (targetParallax.x - parallax.x) * weight;
            parallax.y += (targetParallax.y - parallax.y) * weight;
            positionCamera(Vec3.len(cameraNode.position) + (targetDistance - Vec3.len(cameraNode.position)) * weight);
            if (material?.isValid)
                material.setProperty('motion', new Vec4(phase, Math.min(devicePixelRatio || 1, 2), 0, 0));
        }
    }
    model.addComponent(GalaxyMotion);
    function reset(): void {
        ++epoch;
        phase = 0;
        targetDistance = 120;
        parallax.x = parallax.y = targetParallax.x = targetParallax.y = 0;
        positionCamera(120);
        material.setProperty('motion', new Vec4(0, Math.min(devicePixelRatio || 1, 2), 0, 0));
    }
    canvas.addEventListener(
        'pointermove',
        (event) => {
            const rect = canvas.getBoundingClientRect();
            targetParallax.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
            targetParallax.y = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
        },
        { capture: true },
    );
    canvas.addEventListener(
        'wheel',
        (event) => {
            event.preventDefault();
            targetDistance = Math.max(40, Math.min(400, targetDistance * Math.exp(event.deltaY * 0.0015)));
        },
        { capture: true, passive: false },
    );
    document.querySelector('[data-bench="reset"]')!.addEventListener('click', reset);
    const getState = (): object => ({
        starCount: renderer.mesh?.struct.vertexBundles[0].view.count || 0,
        rotationPhase: material.passes[0].getUniform(material.passes[0].getHandle('motion'), new Vec4()).x,
        cameraDistance: Vec3.len(cameraNode.position),
        cameraPosition: { x: cameraNode.position.x, y: cameraNode.position.y, z: cameraNode.position.z },
        parallaxOffset: { ...parallax },
        fps,
        hudVisible: !document.querySelector('#hud')!.hasAttribute('hidden'),
        epoch,
        fpsSource: 'real-render-loop-2s; not GPU or display-present',
    });
    (window as any).__bench = { getState, reset };
    director.on(Director.EVENT_AFTER_DRAW, () => {
        if (!game.isPaused()) {
            const now = performance.now();
            frameTimes.push(now);
            while (frameTimes.length && frameTimes[0] < now - 2000) frameTimes.shift();
            if (frameTimes.length > 1) fps = ((frameTimes.length - 1) * 1000) / (frameTimes.at(-1)! - frameTimes[0]);
        }
        readout.textContent = `STARS ${renderer.mesh?.struct.vertexBundles[0].view.count || 0} · ${fps.toFixed(1)} FRAMES/S · RANGE ${Vec3.len(cameraNode.position).toFixed(1)}`;
        sceneStatus.ready = true;
        if (!(window as any).__appReady) (window as any).__appReadyAtMs = performance.now();
        (window as any).__appReady = true;
    });
    const held = (): { name: string; ref: object }[] => [
        { name: 'star-mesh', ref: mesh },
        { name: 'star-material', ref: material },
        { name: 'star-effect', ref: effect },
    ];
    installAssetLifecycle({
        label: 'starfield-galaxy',
        hold: held,
        release: () => {
            renderer.mesh = null;
            renderer.material = null;
            mesh.destroy();
            material.destroy();
            EffectAsset.remove(effect);
            effect.destroy();
        },
        reacquire: async () => {
            build();
            reset();
            return held();
        },
    });
    app.run(scene);
}
main().catch((error) => {
    (window as any).__exampleError = String(error);
    console.error(error);
});
