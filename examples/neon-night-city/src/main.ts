import {
    createAirApp,
    createAirUnlitFogEffect,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Mesh,
    Color,
    Vec3,
    Vec4,
    gfx,
    utils,
    primitives,
    director,
    Director,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const BUILDINGS = 240;
const CARS = 80;
const RAIN = 2400;
async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    const scene = new Scene('Neon night city');
    scene.globals.skybox.useHDR = true;
    scene.globals.ambient.skyIllum = 11000;
    scene.globals.ambient.skyColor = new Vec4(0.45, 0.6, 1, 1);
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(42, 17, 52);
    cameraNode.lookAt(new Vec3(0, 5, 0));
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 52;
    camera.near = 0.1;
    camera.far = 160;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(14, 22, 40);
    const lightNode = new Node('Moon');
    scene.addChild(lightNode);
    lightNode.setRotationFromEuler(-45, -35, 0);
    const moon = lightNode.addComponent(DirectionalLight);
    moon.illuminance = 22000;
    moon.color = new Color(145, 180, 255);
    const fog = scene.globals.fog;
    fog.enabled = true;
    fog.type = 0;
    fog.accurate = true;
    fog.fogColor = new Color(30, 42, 68);
    let fogEnabled = true;
    const applyFog = (): void => {
        fog.fogStart = fogEnabled ? 25 : 1000;
        fog.fogEnd = fogEnabled ? 105 : 1001;
    };
    applyFog();
    let time = 0;
    let frozenRainTime: number | null = null;
    let carsFrozen = false;
    let previous = performance.now();
    let root: Node;
    let windows = 0;
    let buildings: Node[] = [];
    let cars: Node[] = [];
    let meshes: Mesh[] = [];
    let materials: Material[] = [];
    let effect: ReturnType<typeof createAirUnlitFogEffect>;
    let rainMesh: Mesh;
    const rainPositions = new Float32Array(RAIN * 12);
    const rainIndices = new Uint16Array(RAIN * 6);
    const seed = new Float32Array(RAIN * 4);
    const order = Array.from({ length: RAIN }, (_, i) => i);
    const depths = new Float32Array(RAIN);
    const intervals: number[] = [];
    const forward = Vec3.normalize(new Vec3(), new Vec3(-42, -12, -52));
    const right = Vec3.normalize(new Vec3(), new Vec3(-forward.z, 0, forward.x));
    let rng = 0x745103;
    const random = (): number => {
        rng = (Math.imul(1664525, rng) + 1013904223) | 0;
        return (rng >>> 0) / 4294967296;
    };
    for (let i = 0; i < RAIN; i++)
        seed.set([(random() - 0.5) * 85, random() * 40, (random() - 0.5) * 85, 7 + random() * 9], i * 4);
    function material(
        color: Color,
        unlit = false,
        instancing = false,
        transparent = false,
        vertexColor = false,
    ): Material {
        const m = new Material();
        m.initialize({
            ...(unlit ? { effectAsset: effect } : { effectName: 'builtin-standard' }),
            defines: { USE_INSTANCING: instancing, USE_VERTEX_COLOR: vertexColor },
            ...(transparent
                ? {
                      states: {
                          rasterizerState: { cullMode: gfx.CullMode.NONE },
                          depthStencilState: { depthTest: true, depthWrite: false },
                          blendState: {
                              targets: [
                                  {
                                      blend: true,
                                      blendSrc: gfx.BlendFactor.SRC_ALPHA,
                                      blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                                      blendSrcAlpha: gfx.BlendFactor.ONE,
                                      blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
                                  },
                              ],
                          },
                      },
                  }
                : {}),
        });
        m.setProperty('mainColor', color);
        if (!unlit) {
            m.setProperty('roughness', 0.7);
            m.setProperty('metallic', 0.15);
        }
        materials.push(m);
        return m;
    }
    function render(name: string, mesh: Mesh, mat: Material, p: Vec3, scale: Vec3): Node {
        const node = new Node(name);
        root.addChild(node);
        node.setPosition(p);
        node.setScale(scale);
        const r = node.addComponent(MeshRenderer);
        r.mesh = mesh;
        r.setSharedMaterial(mat, 0);
        return node;
    }
    function addMesh(value: Mesh): Mesh {
        meshes.push(value);
        return value;
    }
    const rainGeometry = {
        positions: rainPositions,
        indices16: rainIndices,
        minPos: new Vec3(-44, -2, -44),
        maxPos: new Vec3(44, 42, 44),
    };
    function writeRain(): void {
        const rainTime = frozenRainTime ?? time;
        for (let i = 0; i < RAIN; i++) {
            const s = i * 4;
            const x = seed[s] + Math.sin(rainTime * 0.2 + i) * 0.15;
            const y = (((seed[s + 1] - rainTime * seed[s + 3]) % 40) + 40) % 40;
            const z = seed[s + 2];
            const w = 0.055;
            const height = 0.9;
            const p = i * 12;
            rainPositions.set(
                [
                    x - right.x * w,
                    y,
                    z - right.z * w,
                    x + right.x * w,
                    y,
                    z + right.z * w,
                    x - right.x * w,
                    y + height,
                    z - right.z * w,
                    x + right.x * w,
                    y + height,
                    z + right.z * w,
                ],
                p,
            );
            depths[i] = (x - 42) * forward.x + (y - 17) * forward.y + (z - 52) * forward.z;
        }
        // Transparent quads share a draw, but still require ordering within that mesh.
        order.sort((a, b) => depths[b] - depths[a]);
        order.forEach((drop, i) => {
            const v = drop * 4;
            rainIndices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
        });
    }
    function build(): void {
        rng = 0x91107;
        root = new Node('City');
        scene.addChild(root);
        windows = 0;
        buildings = [];
        cars = [];
        effect = createAirUnlitFogEffect();
        const box = addMesh(utils.createMesh(primitives.box()));
        const ground = addMesh(
            utils.createMesh(primitives.plane({ width: 120, length: 120, widthSegments: 1, lengthSegments: 1 })),
        );
        const buildingMats = [
            material(new Color(48, 60, 86), false, true),
            material(new Color(38, 50, 75), false, true),
            material(new Color(65, 48, 78), false, true),
        ];
        render('Ground', ground, material(new Color(64, 76, 104)), new Vec3(0, -0.05, 0), new Vec3(1, 1, 1));
        const vp: number[] = [];
        const vc: number[] = [];
        const vi: number[] = [];
        function windowQuad(p: number[], color: number[]): void {
            const v = vp.length / 3;
            vp.push(...p);
            for (let i = 0; i < 4; i++) vc.push(...color, 1);
            vi.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
            windows++;
        }
        const palette = [
            [0.1, 0.7, 1],
            [1, 0.18, 0.55],
            [1, 0.7, 0.12],
        ];
        for (let i = 0; i < BUILDINGS; i++) {
            const x = ((i % 16) - 7.5) * 3.8;
            const z = (Math.floor(i / 16) - 7) * 3.8;
            const h = 3.2 + random() * 12;
            const width = 2.2;
            const half = width / 2 + 0.015;
            buildings.push(
                render(`Building-${i}`, box, buildingMats[i % 3], new Vec3(x, h / 2, z), new Vec3(width, h, width)),
            );
            const color = palette[i % 3];
            for (let row = 0; row < Math.floor(h / 0.8); row++)
                for (let col = 0; col < 3; col++) {
                    const a = x - 0.8 + col * 0.55;
                    const y = 0.3 + row * 0.8;
                    const b = z - 0.8 + col * 0.55;
                    windowQuad(
                        [a, y, z + half, a + 0.3, y, z + half, a, y + 0.4, z + half, a + 0.3, y + 0.4, z + half],
                        color,
                    );
                    windowQuad(
                        [x + half, y, b + 0.3, x + half, y, b, x + half, y + 0.4, b + 0.3, x + half, y + 0.4, b],
                        color,
                    );
                }
        }
        const windowMesh = addMesh(
            utils.createMesh({ positions: vp, colors: vc, indices: vi }, undefined, { calculateBounds: true }),
        );
        render(
            'Window Grid',
            windowMesh,
            material(new Color(255, 255, 255), true, false, false, true),
            new Vec3(),
            new Vec3(1, 1, 1),
        );
        const carMats = [material(new Color(255, 95, 40), true, true), material(new Color(70, 240, 255), true, true)];
        for (let i = 0; i < CARS; i++)
            cars.push(render(`Car-${i}`, box, carMats[i % 2], new Vec3(), new Vec3(0.55, 0.25, 1)));
        writeRain();
        rainMesh = addMesh(
            utils.MeshUtils.createDynamicMesh(0, rainGeometry, undefined, {
                maxSubMeshes: 1,
                maxSubMeshVertices: RAIN * 4,
                maxSubMeshIndices: RAIN * 6,
            }),
        );
        render(
            'Rain',
            rainMesh,
            material(new Color(160, 200, 255, 145), true, false, true),
            new Vec3(),
            new Vec3(1, 1, 1),
        );
    }
    function update(): void {
        const now = performance.now();
        const dt = Math.min(0.05, (now - previous) / 1000);
        previous = now;
        time += dt;
        if (!carsFrozen)
            cars.forEach((node, i) => {
                const x = (((i / CARS) * 74 + time * (2 + (i % 4))) % 74) - 37;
                const lane = ((i % 4) - 1.5) * 3.8;
                node.setPosition(x, 0.25, lane);
                node.setRotationFromEuler(0, 90, 0);
            });
        writeRain();
        rainMesh.updateSubMesh(0, rainGeometry);
    }
    const afterDraw = (): void => {
        const now = performance.now();
        if (lastDraw > 0) {
            intervals.push(now - lastDraw);
            if (intervals.length > 60) intervals.shift();
        }
        lastDraw = now;
    };
    let lastDraw = 0;
    function resetMotion(): void {
        time = 0;
        frozenRainTime = null;
        carsFrozen = false;
        previous = performance.now();
        fogEnabled = true;
        applyFog();
        update();
    }
    function destroyCity(): void {
        root.destroy();
        meshes.forEach((m) => m.destroy());
        materials.forEach((m) => m.destroy());
        effect.destroy();
        meshes = [];
        materials = [];
    }
    function reset(): void {
        destroyCity();
        build();
        resetMotion();
    }
    document.querySelector('[data-ui="toggle-fog"]')!.addEventListener('click', () => {
        fogEnabled = !fogEnabled;
        applyFog();
    });
    document.querySelector('[data-ui="reset"]')!.addEventListener('click', reset);
    const getState = (): Record<string, unknown> => ({
        buildingCount: buildings.length,
        carCount: cars.length,
        rainParticleCount: rainPositions.length / 12,
        windowCount: windows,
        fogEnabled,
        fps: intervals.length ? (1000 * intervals.length) / intervals.reduce((a, b) => a + b, 0) : 0,
        fpsScope: 'actual rendered-frame callback intervals; GPU and display-present not measured',
        drawCalls: director.root!.device.numDrawCalls,
    });
    (window as any).__bench = { getState, reset };
    build();
    update();
    director.on(Director.EVENT_BEFORE_UPDATE, update);
    director.on(Director.EVENT_AFTER_DRAW, afterDraw);
    app.run(scene);
    const held = (): { name: string; ref: object }[] => [
        { name: 'fog effect', ref: effect },
        ...meshes.map((ref, i) => ({ name: `mesh-${i}`, ref })),
        ...materials.map((ref, i) => ({ name: `material-${i}`, ref })),
    ];
    installAssetLifecycle({
        label: 'neon-night-city',
        hold: held,
        release: () => {
            director.off(Director.EVENT_BEFORE_UPDATE, update);
            destroyCity();
        },
        reacquire: async () => {
            build();
            resetMotion();
            director.on(Director.EVENT_BEFORE_UPDATE, update);
            return held();
        },
    });
    (window as any).__cityProbe = {
        freezeRain: (value: boolean) => {
            frozenRainTime = value ? time : null;
        },
        freezeCars: (value: boolean) => {
            carsFrozen = value;
        },
        rainOrder: () => order.every((id, i) => i === 0 || depths[order[i - 1]] >= depths[id]),
        attributes: () => ({
            rainVertices: rainPositions.length / 3,
            rainIndices: rainIndices.length,
            windowCount: windows,
            instancing: buildingMatsSupported(),
        }),
    };
    function buildingMatsSupported(): boolean {
        return buildings.every((n) => n.getComponent(MeshRenderer)!.sharedMaterial!.passes[0].batchingScheme !== 0);
    }
    (window as any).__appReady = true;
    (window as any).__probe = () => ({
        ...getState(),
        attributes: (window as any).__cityProbe.attributes(),
        rainSorted: (window as any).__cityProbe.rainOrder(),
    });
}
main().catch((error) => {
    (window as any).__appReady = false;
    throw error;
});
