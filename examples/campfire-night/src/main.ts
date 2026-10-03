import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    PointLight,
    MeshRenderer,
    Material,
    Mesh,
    Vec3,
    Vec4,
    Color,
    utils,
    primitives,
    director,
    Director,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

/** Original implementation from the public E06 scene specification; no external assets. */
async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    const scene = new Scene('Campfire night');
    scene.globals.skybox.useHDR = true;
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 48;
    camera.near = 0.1;
    camera.far = 50;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    const moonNode = new Node('Moon');
    scene.addChild(moonNode);
    moonNode.setRotationFromEuler(-55, -30, 0);
    const moon = moonNode.addComponent(DirectionalLight);
    const fireNode = new Node('Fire Light');
    scene.addChild(fireNode);
    fireNode.setPosition(0, 0.8, 0);
    const fire = fireNode.addComponent(PointLight);
    fire.color = new Color(255, 115, 35);
    fire.range = 7;
    const state = {
        timeOfDay: 0,
        fireLightIntensity: 0.55,
        fireflyCount: 20,
        treeCount: 14,
        cameraOrbitAngle: 0,
        orbitEnabled: true,
    };
    let targetDay = 0;
    let time = 0;
    let last = performance.now();
    let paused = false;
    const meshes: Mesh[] = [];
    const materials: Material[] = [];
    let ownedRoot: Node;
    let flames: Node[] = [];
    let sparks: Node[] = [];
    let flies: Node[] = [];
    function mesh(geometry: Parameters<typeof utils.createMesh>[0]): Mesh {
        const value = utils.createMesh(geometry);
        meshes.push(value);
        return value;
    }
    function material(name: string, color: Color, unlit = false): Material {
        const value = new Material();
        value.name = name;
        value.initialize({ effectName: unlit ? 'builtin-unlit' : 'builtin-standard' });
        value.setProperty('mainColor', color);
        if (!unlit) {
            value.setProperty('roughness', 0.9);
            value.setProperty('metallic', 0);
        }
        materials.push(value);
        return value;
    }
    function object(name: string, geometry: Mesh, mat: Material, position: Vec3, scale = new Vec3(1, 1, 1)): Node {
        const node = new Node(name);
        ownedRoot.addChild(node);
        node.setPosition(position);
        node.setScale(scale);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = geometry;
        renderer.setSharedMaterial(mat, 0);
        renderer.receiveShadow = MeshRenderer.ShadowReceivingMode.ON;
        renderer.shadowCastingMode = /^(Tree-|Trunk-|Log-)/.test(name) ? 1 : 0;
        return node;
    }
    function build(): void {
        ownedRoot = new Node('Camp');
        scene.addChild(ownedRoot);
        const box = mesh(primitives.box());
        const leaf = mesh(primitives.cone(0.8, 2.2, { radialSegments: 7, heightSegments: 1 }));
        const dot = mesh(primitives.sphere(0.5, { segments: 6 }));
        const ground = mesh(primitives.plane({ width: 14, length: 14, widthSegments: 1, lengthSegments: 1 }));
        const bark = material('Bark', new Color(100, 65, 35));
        const foliage = material('Foliage', new Color(42, 105, 70));
        const dirt = material('Ground', new Color(110, 100, 65));
        const flameMat = material('Flame', new Color(255, 110, 20), true);
        const sparkMat = material('Spark', new Color(255, 220, 95), true);
        const flyMat = material('Firefly', new Color(130, 255, 130), true);
        object('Ground', ground, dirt, new Vec3(0, -0.08, 0));
        for (let i = 0; i < state.treeCount; i++) {
            const a = (i * Math.PI * 2) / state.treeCount;
            const x = Math.cos(a) * 4.5;
            const z = Math.sin(a) * 4.5;
            object(`Trunk-${i}`, box, bark, new Vec3(x, 0.7, z), new Vec3(0.28, 1.4, 0.28));
            object(`Tree-${i}`, leaf, foliage, new Vec3(x, 2, z));
        }
        for (let i = 0; i < 4; i++) {
            const log = object(`Log-${i}`, box, bark, new Vec3(0, 0.12, 0), new Vec3(1.6, 0.18, 0.18));
            log.setRotationFromEuler(0, i * 45, 0);
        }
        flames = Array.from({ length: 32 }, (_, i) =>
            object(`Flame-${i}`, dot, flameMat, new Vec3(), new Vec3(0.1, 0.16, 0.1)),
        );
        sparks = Array.from({ length: 48 }, (_, i) =>
            object(`Spark-${i}`, dot, sparkMat, new Vec3(), new Vec3(0.025, 0.025, 0.025)),
        );
        flies = Array.from({ length: state.fireflyCount }, (_, i) =>
            object(`Firefly-${i}`, dot, flyMat, new Vec3(), new Vec3(0.04, 0.04, 0.04)),
        );
    }
    function applyLighting(): void {
        const day = state.timeOfDay;
        moon.illuminance = 2500 + day * 47500;
        moon.color = new Color(125 + day * 130, 165 + day * 80, 245 - day * 15);
        scene.globals.ambient.skyIllum = 1800 + day * 10200;
        scene.globals.ambient.skyColor = new Vec4(0.35 + day * 0.35, 0.45 + day * 0.3, 0.7 + day * 0.1, 1);
        camera.clearColor = new Color(9 + day * 100, 16 + day * 140, 35 + day * 170);
        fire.luminousFlux = 900 * state.fireLightIntensity;
    }
    function update(): void {
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        if (!paused) {
            time += dt;
            state.timeOfDay +=
                Math.sign(targetDay - state.timeOfDay) * Math.min(Math.abs(targetDay - state.timeOfDay), dt / 3);
            state.fireLightIntensity = 0.55 + Math.sin(time * 2.3) * 0.12 + Math.sin(time * 5.1) * 0.09;
            if (state.orbitEnabled) state.cameraOrbitAngle += dt * 0.13;
        }
        applyLighting();
        const a = state.cameraOrbitAngle;
        cameraNode.setPosition(Math.sin(a) * 8.5, 4.8, Math.cos(a) * 8.5);
        cameraNode.lookAt(new Vec3(0, 0.7, 0));
        flames.forEach((node, i) => {
            const age = (time * 0.75 + i / flames.length) % 1;
            const angle = i * 2.399;
            node.setPosition(Math.cos(angle) * (1 - age) * 0.3, 0.25 + age * 1.15, Math.sin(angle) * (1 - age) * 0.3);
            node.setScale(0.12 * (1 - age), 0.2 * (1 - age), 0.12 * (1 - age));
        });
        sparks.forEach((node, i) => {
            const age = (time * 0.25 + i / sparks.length) % 1;
            const angle = i * 2.399 + age * 0.7;
            node.setPosition(Math.cos(angle) * age * 0.7, 0.5 + age * 2.3, Math.sin(angle) * age * 0.7);
        });
        flies.forEach((node, i) => {
            const a = i * 2.399 + time * 0.1;
            const radius = 2.4 + Math.sin(time * 0.8 + i) * 0.5;
            node.setPosition(Math.cos(a) * radius, 0.7 + Math.sin(time * 1.1 + i) * 0.4, Math.sin(a) * radius);
            const scale = 0.02 + 0.03 * (0.5 + 0.5 * Math.sin(time * 2 + i));
            node.setScale(scale, scale, scale);
        });
    }
    const reset = (): void => {
        targetDay = 0;
        time = 0;
        state.timeOfDay = 0;
        state.cameraOrbitAngle = 0;
        state.orbitEnabled = true;
        state.fireLightIntensity = 0.55;
        last = performance.now();
        update();
    };
    document.querySelector('[data-ui="day-night"]')!.addEventListener('click', () => {
        targetDay = targetDay > 0 ? 0 : 1;
    });
    document.querySelector('[data-ui="orbit-toggle"]')!.addEventListener('click', () => {
        state.orbitEnabled = !state.orbitEnabled;
    });
    document.querySelector('[data-ui="reset"]')!.addEventListener('click', reset);
    (window as any).__bench = { getState: () => ({ ...state }), reset };
    (window as any).__nightProbe = {
        capture: () =>
            new Promise((resolve) =>
                director.once(Director.EVENT_AFTER_DRAW, () => {
                    const canvas = document.querySelector('canvas')!;
                    const copy = document.createElement('canvas');
                    copy.width = canvas.width;
                    copy.height = canvas.height;
                    const ctx = copy.getContext('2d')!;
                    ctx.drawImage(canvas, 0, 0);
                    const regions = {
                        sky: [0.2, 0.02, 0.8, 0.15],
                        environment: [0.3, 0.58, 0.7, 0.85],
                        center: [0.4, 0.35, 0.6, 0.7],
                    };
                    const result: Record<string, unknown> = {};
                    for (const [name, r] of Object.entries(regions)) {
                        const pixels = ctx.getImageData(
                            Math.floor(r[0] * copy.width),
                            Math.floor(r[1] * copy.height),
                            Math.floor((r[2] - r[0]) * copy.width),
                            Math.floor((r[3] - r[1]) * copy.height),
                        ).data;
                        const rgb = [0, 0, 0];
                        let warm = 0;
                        let lit = 0;
                        for (let i = 0; i < pixels.length; i += 4) {
                            for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
                            if (pixels[i] > pixels[i + 2] * 1.3 && pixels[i] > 50) warm++;
                            if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 75) lit++;
                        }
                        result[name] = {
                            rgb: rgb.map((v) => v / (pixels.length / 4)),
                            warm,
                            lit,
                            pixels: pixels.length / 4,
                        };
                    }
                    resolve(result);
                }),
            ),
        setShadow: (type: 'none' | 'planar' | 'map') => {
            scene.globals.shadows.planeDirection = new Vec3(0, 1, 0);
            scene.globals.shadows.planeHeight = -0.075;
            scene.globals.shadows.planeBias = 0.001;
            scene.globals.shadows.enabled = type !== 'none';
            scene.globals.shadows.type = type === 'map' ? 1 : 0;
            moon.shadowEnabled = type === 'map';
        },
        freeze: () => {
            paused = true;
            state.orbitEnabled = false;
        },
        resume: () => {
            paused = false;
            last = performance.now();
        },
        setDay: (value: number) => {
            state.timeOfDay = value;
            targetDay = value;
            applyLighting();
        },
        setFire: (value: number) => {
            state.fireLightIntensity = value;
            applyLighting();
        },
        units: () => ({
            isHDR: director.root!.pipeline.pipelineSceneData.isHDR,
            exposure: camera.camera!.exposure,
            directionalIlluminance: moon.illuminance,
            ambientSkyIllum: scene.globals.ambient.skyIllum,
            fireLuminousFlux: fire.luminousFlux,
            localMeterScale: 10000,
        }),
    };
    build();
    update();
    director.on(Director.EVENT_BEFORE_UPDATE, update);
    app.run(scene);
    const held = (): { name: string; ref: object }[] => [
        ...meshes.map((ref, i) => ({ name: `mesh-${i}`, ref })),
        ...materials.map((ref, i) => ({ name: `material-${i}`, ref })),
    ];
    installAssetLifecycle({
        label: 'campfire-night',
        hold: held,
        release: () => {
            director.off(Director.EVENT_BEFORE_UPDATE, update);
            ownedRoot.destroy();
            meshes.forEach((m) => m.destroy());
            materials.forEach((m) => m.destroy());
            meshes.length = 0;
            materials.length = 0;
        },
        reacquire: async () => {
            build();
            director.on(Director.EVENT_BEFORE_UPDATE, update);
            return held();
        },
    });
    (window as any).__appReady = true;
    (window as any).__probe = async () => ({
        state: { ...state },
        flameCount: flames.length,
        sparkCount: sparks.length,
        pixels: await (window as any).__nightProbe.capture(),
        units: (window as any).__nightProbe.units(),
    });
}
main().catch((error) => {
    (window as any).__appReady = false;
    throw error;
});
