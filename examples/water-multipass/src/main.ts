import {
    createAirApp,
    createAirRenderTarget,
    Scene,
    Node,
    Camera,
    Color,
    MeshRenderer,
    Material,
    EffectAsset,
    Mesh,
    Vec3,
    Vec4,
    Mat4,
    utils,
    primitives,
    director,
    Director,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

type Channel = 'final' | 'reflection' | 'refraction' | 'depth' | 'caustics';
type Target = ReturnType<typeof createAirRenderTarget>;
const ABOVE = 1 << 20,
    BELOW = 1 << 21,
    WATER = 1 << 22,
    CAUSTIC = 1 << 23,
    OVERLAY = 1 << 24,
    DEBUG = 1 << 25;
const INITIAL_TIME = 1.25,
    SEED = 1.7;
const state = {
    time: INITIAL_TIME,
    seed: SEED,
    paused: true,
    reflection: true,
    refraction: true,
    depth: true,
    caustics: true,
    overlays: true,
    rain: false,
    channel: 'final' as Channel,
    waveAmplitude: 0.115,
    distortion: 0.025,
    absorption: 1,
    mouseHits: 0,
    resizeCount: 0,
    frames: 0,
};

/** Dense real 3D height-field geometry, also used for refracted light landing. */
function grid(size: number, cells: number): Parameters<typeof utils.createMesh>[0] {
    const positions: number[] = [],
        normals: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
    for (let z = 0; z <= cells; z++)
        for (let x = 0; x <= cells; x++) {
            positions.push((x / cells - 0.5) * size, 0, (z / cells - 0.5) * size);
            normals.push(0, 1, 0);
            uvs.push(x / cells, z / cells);
        }
    for (let z = 0; z < cells; z++)
        for (let x = 0; x < cells; x++) {
            const a = z * (cells + 1) + x,
                b = a + cells + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    return { positions, normals, uvs, indices };
}

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    const scene = new Scene('Multipass Water');
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const definitions = await Promise.all(
        ['scene', 'water', 'caustic', 'debug', 'overlay'].map(async (name) => {
            const result = await fetch(new URL(`${name}.effect.json`, document.baseURI));
            if (!result.ok) throw new Error(`${name} effect: HTTP ${result.status}`);
            return [name, await result.json()] as const;
        }),
    );
    let root: Node, cameras: Record<string, Camera>, targets: Record<string, Target>;
    let effects: EffectAsset[] = [],
        meshes: Mesh[] = [],
        materials: Material[] = [];
    let detach: (() => void)[] = [],
        fish: Node[] = [],
        splashes: Node[] = [],
        rain: Node[] = [];
    let debugUnbind: (() => void) | undefined;
    let water: Material, debug: Material, caustic: Material, floor: Material, debugNode: Node;
    let fin: Node;
    let finDepthMaterial: Material, finNoDepthMaterial: Material;
    const captureMatrices = {
        reflection: new Mat4(),
        refraction: new Mat4(),
        inverse: new Mat4(),
        view: new Mat4(),
        caustic: new Mat4(),
    };
    const cameraPosition = new Vec3(7.8, 6.1, 9.2),
        cameraLook = new Vec3(0, -0.4, 0);
    const impact = new Vec4(0, 0, INITIAL_TIME, 0);

    function makeMaterial(id: string, tint?: Vec4, depthTest?: boolean): Material {
        const effect = effects.find((item) => item.name === `air-water-multipass-${id}`)!;
        const material = new Material();
        material.initialize({
            effectAsset: effect,
            ...(depthTest === undefined ? {} : { states: { depthStencilState: { depthTest } } }),
        });
        if (tint) material.setProperty('tint', tint);
        materials.push(material);
        return material;
    }
    function mesh(data: Parameters<typeof utils.createMesh>[0]): Mesh {
        const value = utils.createMesh(data, undefined, { calculateBounds: true });
        meshes.push(value);
        return value;
    }
    function object(
        name: string,
        shape: Mesh,
        material: Material,
        layer: number,
        pos: Vec3,
        scale = new Vec3(1, 1, 1),
    ): Node {
        const node = new Node(name);
        root.addChild(node);
        node.layer = layer;
        node.setPosition(pos);
        node.setScale(scale);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = shape;
        renderer.setSharedMaterial(material, 0);
        return node;
    }
    function camera(name: string, layer: number, priority: number, color: Color): Camera {
        const node = new Node(name);
        root.addChild(node);
        node.setPosition(cameraPosition);
        node.lookAt(cameraLook);
        const component = node.addComponent(Camera);
        component.fov = 48;
        component.near = 0.1;
        component.far = 50;
        component.visibility = layer;
        component.priority = priority;
        component.clearColor = color;
        component.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        return component;
    }
    function waveUniforms(): void {
        const value = new Vec4(state.waveAmplitude, state.time, state.seed, +state.rain);
        water.setProperty('wave', value);
        caustic.setProperty('wave', value);
        water.setProperty('impact', impact);
        caustic.setProperty('impact', impact);
        water.setProperty('optics', new Vec4(state.distortion, state.absorption, 0, 0));
        water.setProperty('channels', new Vec4(+state.reflection, +state.refraction, +state.depth, +state.caustics));
        floor.setProperty('objectParams', new Vec4(1, +state.caustics, 0, 0));
    }
    function updateClip(component: Camera, normalY: number): void {
        const native = component.camera!;
        native.update(true);
        // Start from a fresh ordinary projection: never compound last frame's oblique matrix.
        Mat4.perspective(
            native.matProj,
            native.fov,
            native.aspect,
            native.nearClip,
            native.farClip,
            native.fovAxis === Camera.FOVAxis.VERTICAL,
            native.getClipSpaceMinz(),
            director.root!.device.capabilities.clipSpaceSignY,
        );
        Mat4.invert(native.matProjInv, native.matProj);
        // Plane transforms as inverse-transpose(view), equivalent to transpose(camera world matrix).
        const inverseTranspose = new Mat4();
        Mat4.transpose(inverseTranspose, native.node!.worldMatrix);
        const plane = new Vec4(0, normalY, 0, -0.035).transformMat4(inverseTranspose);
        native.calculateObliqueMat(plane);
    }
    function bindDebug(): void {
        debugUnbind?.();
        debugUnbind = undefined;
        debugNode.active = state.channel !== 'final';
        if (state.channel === 'final') return;
        if (state.channel === 'depth') debugUnbind = targets.refraction.bindDepth(debug, 'displayMap');
        else debugUnbind = targets[state.channel].bindColor(debug, 'displayMap');
        debug.setProperty('debugParams', new Vec4(+(state.channel === 'depth'), 25, 0, 0));
    }
    function build(): void {
        root = new Node('Water Scene');
        scene.addChild(root);
        effects = definitions.map(([, json]) => {
            const effect = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(json)));
            effect.onLoaded();
            return effect;
        });
        const width = Math.max(16, canvas.width),
            height = Math.max(16, canvas.height);
        targets = {
            reflection: createAirRenderTarget({
                name: 'Water reflection',
                width,
                height,
                scale: 0.75,
                colorFormat: 'rgba16f',
                depthFormat: 'depth24-stencil8',
                samples: 4,
                sampleFallback: 'lower',
            }),
            refraction: createAirRenderTarget({
                name: 'Water refraction',
                width,
                height,
                scale: 0.75,
                colorFormat: 'rgba16f',
                depthFormat: 'depth24-stencil8',
                samples: 4,
                sampleFallback: 'lower',
            }),
            caustics: createAirRenderTarget({
                name: 'Water caustics',
                width: 512,
                height: 512,
                colorFormat: 'rgba16f',
                depthFormat: 'none',
                samples: 1,
            }),
        };
        cameras = {
            caustics: camera('Caustic Camera', CAUSTIC, -40, new Color(0, 0, 0, 255)),
            reflection: camera('Reflection Camera', ABOVE, -30, new Color(67, 108, 140, 255)),
            refraction: camera('Refraction Camera', BELOW | ABOVE, -20, new Color(11, 50, 63, 255)),
            main: camera('Main Camera', ABOVE | BELOW | WATER | OVERLAY, 0, new Color(40, 71, 90, 255)),
            debug: camera('Channel Camera', DEBUG, 10, new Color(0, 0, 0, 255)),
        };
        cameras.debug.clearFlags = Camera.ClearFlag.DONT_CLEAR;
        cameras.caustics.projection = Camera.ProjectionType.ORTHO;
        cameras.caustics.orthoHeight = 6;
        cameras.caustics.node.setPosition(0, 12, 0);
        cameras.caustics.node.lookAt(new Vec3(0, -2, 0), new Vec3(0, 0, -1));
        cameras.reflection.node.setPosition(cameraPosition.x, -cameraPosition.y, cameraPosition.z);
        cameras.reflection.node.lookAt(new Vec3(cameraLook.x, -cameraLook.y, cameraLook.z), new Vec3(0, -1, 0));
        water = makeMaterial('water');
        debug = makeMaterial('debug');
        caustic = makeMaterial('caustic');
        floor = makeMaterial('scene', new Vec4(0.61, 0.55, 0.33, 1));
        const orange = makeMaterial('scene', new Vec4(0.94, 0.39, 0.11, 1));
        const teal = makeMaterial('scene', new Vec4(0.08, 0.78, 0.64, 1));
        const wood = makeMaterial('scene', new Vec4(0.37, 0.2, 0.1, 1));
        const rock = makeMaterial('scene', new Vec4(0.3, 0.37, 0.39, 1));
        const finMaterial = makeMaterial('overlay', new Vec4(0.2, 0.82, 0.84, 0.45));
        finDepthMaterial = finMaterial;
        finNoDepthMaterial = makeMaterial('overlay', new Vec4(0.2, 0.82, 0.84, 0.45), false);
        const splashMaterial = makeMaterial('overlay', new Vec4(0.77, 0.94, 1, 0.43));
        const plane = mesh(grid(10, 100)),
            cube = mesh(primitives.box()),
            sphere = mesh(primitives.sphere(0.5, { segments: 20 }));
        const overlayQuad = mesh({
            positions: [-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0],
            uvs: [0, 0, 1, 0, 0, 1, 1, 1],
            indices: [0, 1, 2, 1, 3, 2],
        });
        object('Water Surface', plane, water, WATER, new Vec3());
        object('Caustic Ray Landing', plane, caustic, CAUSTIC, new Vec3());
        object('Sand Receiver', mesh(grid(12, 8)), floor, BELOW, new Vec3(0, -2, 0));
        object('Orange Reflection Marker', cube, orange, ABOVE, new Vec3(-2.3, 0.8, -1.8), new Vec3(1.2, 1.6, 0.7));
        object('Cyan Refraction Marker', cube, teal, BELOW, new Vec3(1.8, -1.3, 1.2), new Vec3(1.2, 0.8, 1.0));
        // A real straddling object, present in both capture masks, verifies near-plane clipping.
        object('Pier Straddling Water', cube, wood, ABOVE, new Vec3(-3.1, -0.3, 0.7), new Vec3(0.45, 3.0, 0.45));
        object('Pier Deck', cube, wood, ABOVE, new Vec3(-3.4, 0.45, 1.0), new Vec3(1.6, 0.22, 3.6));
        for (let i = 0; i < 7; i++)
            object(
                `Bottom Rock ${i}`,
                sphere,
                rock,
                BELOW,
                new Vec3(Math.sin(i * 2.7) * 3.7, -1.78, Math.cos(i * 1.9) * 3.4),
                new Vec3(0.5 + i * 0.08, 0.45, 0.65),
            );
        fish = Array.from({ length: 3 }, (_, i) =>
            object(`Fish Body ${i}`, sphere, teal, BELOW, new Vec3(i - 1, -0.65, 0), new Vec3(0.85, 0.28, 0.35)),
        );
        fin = object(
            'Transparent Fish Fin',
            overlayQuad,
            finMaterial,
            OVERLAY,
            new Vec3(0.6, 0.06, 1.2),
            new Vec3(0.8, 0.65, 1),
        );
        fin.getComponent(MeshRenderer)!.priority = 1;
        splashes = Array.from({ length: 12 }, (_, i) => {
            const node = object(
                `Splash ${i}`,
                overlayQuad,
                splashMaterial,
                OVERLAY,
                new Vec3(),
                new Vec3(0.12, 0.35, 1),
            );
            node.getComponent(MeshRenderer)!.priority = 2;
            return node;
        });
        rain = Array.from({ length: 24 }, (_, i) =>
            object(`Rain Drop ${i}`, overlayQuad, splashMaterial, OVERLAY, new Vec3(), new Vec3(0.022, 0.45, 1)),
        );
        debugNode = object(
            'Channel Display',
            mesh({
                positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
                uvs: [0, 0, 1, 0, 0, 1, 1, 1],
                indices: [0, 1, 2, 1, 3, 2],
            }),
            debug,
            DEBUG,
            new Vec3(),
        );
        targets.reflection.bindColor(water, 'reflectionMap');
        targets.refraction.bindColor(water, 'refractionMap');
        targets.refraction.bindDepth(water, 'depthMap');
        targets.caustics.bindColor(floor, 'causticMap');
        detach.push(
            targets.caustics.attachCamera(cameras.caustics, () => {
                captureMatrices.caustic.set(cameras.caustics.camera!.matViewProj);
                floor.setProperty('causticVP', captureMatrices.caustic);
                // Model UBO upload happened before camera-BEGIN; flush these late material writes.
                for (const pass of floor.passes) pass.update();
            }),
        );
        detach.push(
            targets.reflection.attachCamera(cameras.reflection, () => {
                updateClip(cameras.reflection, 1);
                captureMatrices.reflection.set(cameras.reflection.camera!.matViewProj);
                water.setProperty('reflectionVP', captureMatrices.reflection);
                for (const pass of water.passes) pass.update();
            }),
        );
        detach.push(
            targets.refraction.attachCamera(cameras.refraction, () => {
                updateClip(cameras.refraction, -1);
                captureMatrices.refraction.set(cameras.refraction.camera!.matViewProj);
                captureMatrices.inverse.set(cameras.refraction.camera!.matViewProjInv);
                captureMatrices.view.set(cameras.refraction.camera!.matView);
                water.setProperty('refractionVP', captureMatrices.refraction);
                water.setProperty('inverseRefractionVP', captureMatrices.inverse);
                debug.setProperty('inverseRefractionVP', captureMatrices.inverse);
                debug.setProperty('refractionView', captureMatrices.view);
                for (const pass of water.passes) pass.update();
                for (const pass of debug.passes) pass.update();
            }),
        );
        water.setProperty('eye', new Vec4(cameraPosition.x, cameraPosition.y, cameraPosition.z, 1));
        waveUniforms();
        bindDebug();
        animate();
    }
    function animate(): void {
        for (let i = 0; i < fish.length; i++) {
            const t = state.time * 0.45 + i * 2.1;
            fish[i].setPosition(
                Math.sin(t) * 2.6,
                (i === 0 ? -0.15 : -0.7) + Math.sin(t * 1.7) * 0.07,
                Math.cos(t) * 1.9,
            );
            fish[i].setRotationFromEuler(0, (t * 180) / Math.PI + 90, 0);
        }
        fin.active = state.overlays;
        fin.setPosition(fish[0].position.x, fish[0].position.y - 0.05, fish[0].position.z);
        fin.setRotation(fish[0].rotation);
        for (let i = 0; i < splashes.length; i++) {
            const t = state.time * 1.6 + i * 0.41,
                phase = t % 1;
            splashes[i].active = state.overlays;
            splashes[i].setPosition(
                impact.x + Math.sin(i * 2.4) * (0.35 + phase * 0.5),
                Math.sin(phase * Math.PI) * 0.65 + 0.04,
                impact.y + Math.cos(i * 2.4) * (0.35 + phase * 0.5),
            );
            splashes[i].setScale(0.07, 0.08 + Math.sin(phase * Math.PI) * 0.23, 1);
        }
        for (let i = 0; i < rain.length; i++) {
            rain[i].active = state.rain && state.overlays;
            const cellX = (i % 6) - 3,
                cellZ = Math.floor(i / 6) - 2;
            const phase = state.time * 0.85 + Math.sin(cellX * 12.73 + cellZ * 45.91) * 437.1;
            const age = phase - Math.floor(phase);
            rain[i].setPosition((cellX + 0.5) * 1.6, 0.15 + (1 - age) * 3.4, (cellZ + 0.5) * 1.6);
        }
    }
    let last = performance.now();
    function update(): void {
        const now = performance.now();
        if (!state.paused) state.time += Math.min((now - last) / 1000, 0.05);
        last = now;
        waveUniforms();
        animate();
        const status = document.getElementById('status')!;
        status.textContent = `t=${state.time.toFixed(2)} · ${targets.refraction.info.width}×${targets.refraction.info.height} · actual ${targets.refraction.info.samples}× MSAA · move pointer over water`;
    }
    function resize(): void {
        targets.reflection.resize(canvas.width, canvas.height);
        targets.refraction.resize(canvas.width, canvas.height);
        state.resizeCount++; // Existing bindColor/bindDepth registrations rebind the newly owned attachments.
        bindDebug();
    }
    function release(): void {
        director.off(Director.EVENT_BEFORE_UPDATE, update);
        root.active = false;
        debugUnbind?.();
        debugUnbind = undefined;
        for (const off of detach) off();
        detach = [];
        root.destroy();
        for (const target of Object.values(targets)) target.dispose();
        for (const material of materials) material.destroy();
        for (const geometry of meshes) geometry.destroy();
        for (const effect of effects) {
            EffectAsset.remove(effect);
            effect.destroy();
        }
        effects = [];
        meshes = [];
        materials = [];
        fish = [];
        splashes = [];
        rain = [];
    }
    function held(): { name: string; ref: object; released?: () => boolean }[] {
        return [
            ...effects.map((ref, i) => ({ name: `effect-${i}`, ref })),
            ...meshes.map((ref, i) => ({ name: `mesh-${i}`, ref })),
            ...materials.map((ref, i) => ({ name: `material-${i}`, ref })),
            ...Object.entries(targets).map(([name, target]) => ({
                name,
                ref: target.renderTexture,
                released: () => !target.renderTexture.window,
            })),
            ...Object.entries(targets).flatMap(([name, target]) => [
                { name: `${name}-color-view`, ref: target.texture },
                ...(target.depthTexture ? [{ name: `${name}-depth-view`, ref: target.depthTexture }] : []),
            ]),
        ];
    }
    build();
    app.run(scene);
    director.on(Director.EVENT_BEFORE_UPDATE, update);
    let previousSize = `${canvas.width}x${canvas.height}`;
    director.on(Director.EVENT_AFTER_DRAW, () => {
        state.frames++;
        const size = `${canvas.width}x${canvas.height}`;
        if (size !== previousSize) {
            previousSize = size;
            resize();
        }
    });
    function setChannel(value: Channel): void {
        state.channel = value;
        bindDebug();
    }
    const flags = ['reflection', 'refraction', 'depth', 'caustics', 'rain', 'overlays'] as const;
    for (const key of flags)
        document.getElementById(key)!.addEventListener('click', () => {
            state[key] = !state[key];
            document.getElementById(key)!.textContent =
                `${key[0].toUpperCase() + key.slice(1)} ${state[key] ? 'on' : 'off'}`;
            waveUniforms();
            animate();
        });
    document
        .getElementById('channel')!
        .addEventListener('change', (event) => setChannel((event.target as HTMLSelectElement).value as Channel));
    document.getElementById('play')!.addEventListener('click', () => {
        state.paused = !state.paused;
        document.getElementById('play')!.textContent = state.paused ? 'Play' : 'Pause';
    });
    document.getElementById('reset')!.addEventListener('click', () => {
        state.time = INITIAL_TIME;
        state.seed = SEED;
        state.paused = true;
        state.waveAmplitude = 0.115;
        state.distortion = 0.025;
        state.absorption = 1;
        state.mouseHits = 0;
        impact.set(0, 0, INITIAL_TIME, 0);
        for (const key of flags) {
            state[key] = key !== 'rain';
            document.getElementById(key)!.textContent =
                `${key[0].toUpperCase() + key.slice(1)} ${state[key] ? 'on' : 'off'}`;
        }
        document.getElementById('play')!.textContent = 'Play';
        (document.getElementById('channel') as HTMLSelectElement).value = 'final';
        setChannel('final');
        waveUniforms();
        animate();
    });
    function setParameter(key: 'waveAmplitude' | 'distortion' | 'absorption' | 'seed', value: number): void {
        const maximum = key === 'waveAmplitude' ? 0.18 : key === 'distortion' ? 0.06 : key === 'absorption' ? 3 : 1000;
        if (!Number.isFinite(value) || value < 0 || value > maximum) throw new Error(`invalid water ${key}`);
        state[key] = value;
        waveUniforms();
    }
    canvas.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        const ray = cameras.main.screenPointToRay(
            ((event.clientX - rect.left) * canvas.width) / rect.width,
            ((rect.bottom - event.clientY) * canvas.height) / rect.height,
        );
        const t = -ray.o.y / ray.d.y;
        if (t > 0 && Math.abs(ray.o.x + t * ray.d.x) < 5 && Math.abs(ray.o.z + t * ray.d.z) < 5) {
            state.mouseHits++;
            // Pointer-induced ripple and transparent geometry use the actual ray/plane intersection.
            impact.set(ray.o.x + t * ray.d.x, ray.o.z + t * ray.d.z, state.time, 1);
            waveUniforms();
            animate();
        }
    });
    installAssetLifecycle({
        label: 'water-multipass',
        hold: held,
        release,
        reacquire: async () => {
            build();
            director.on(Director.EVENT_BEFORE_UPDATE, update);
            return held();
        },
    });
    (window as any).__water = {
        setTime: (time: number) => {
            if (!Number.isFinite(time)) throw new Error('finite time required');
            state.paused = true;
            state.time = time;
            waveUniforms();
            animate();
        },
        setChannel,
        setParameter,
        setFinDepthTest: (enabled: boolean) =>
            fin.getComponent(MeshRenderer)!.setSharedMaterial(enabled ? finDepthMaterial : finNoDepthMaterial, 0),
        finSamples: () =>
            [0.75, 0.12].map((height) => {
                const point = new Vec3(0, height, 0).transformMat4(fin.worldMatrix);
                const screen = cameras.main.worldToScreen(point);
                return {
                    x: Math.round(screen.x),
                    y: Math.round(canvas.height - screen.y),
                    world: [point.x, point.y, point.z],
                    alpha: 0.45,
                    tint: [0.2, 0.82, 0.84],
                };
            }),
        setFlag: (key: (typeof flags)[number], value: boolean) => {
            state[key] = value;
            waveUniforms();
            animate();
        },
        resize,
        targets: () => targets,
        matrices: () => captureMatrices,
        expectedDepthSamples: () =>
            [new Vec3(-4, -2, -2), new Vec3(0, -2, -3), new Vec3(3.7, -2, -1)].map((point) => {
                const screen = cameras.refraction.worldToScreen(point);
                const viewPoint = new Vec4(point.x, point.y, point.z, 1).transformMat4(captureMatrices.view);
                return {
                    world: [point.x, point.y, point.z],
                    x: Math.round((screen.x / targets.refraction.info.width) * canvas.width),
                    y: Math.round(canvas.height - (screen.y / targets.refraction.info.height) * canvas.height),
                    expected: -viewPoint.z / 25,
                };
            }),
    };
    (window as any).__probe = () => ({
        ...state,
        targets: Object.fromEntries(Object.entries(targets).map(([name, value]) => [name, value.info])),
        geometry: {
            waterVertices: 10201,
            waterTriangles: 20000,
            fish: fish.length,
            splashes: splashes.length,
            rainDrops: rain.filter((node) => node.active).length,
        },
        cameraOrder: Object.values(cameras).map((component) => ({
            name: component.node.name,
            priority: component.priority,
            mask: component.visibility,
        })),
        overlayState: materials
            .filter((material) => material.effectAsset?.name.endsWith('-overlay'))
            .map((material) => ({
                depthWrite: material.passes[0].depthStencilState.depthWrite,
                blend: material.passes[0].blendState.targets[0].blend,
            })),
        drawCalls: director.root!.device.numDrawCalls,
    });
    await new Promise<void>((resolve) => {
        const done = (): void => {
            director.off(Director.EVENT_AFTER_DRAW, done);
            resolve();
        };
        director.on(Director.EVENT_AFTER_DRAW, done);
    });
    (window as any).__appReady = true;
}
main().catch((error) => {
    (window as any).__appReady = false;
    console.error(error);
});
