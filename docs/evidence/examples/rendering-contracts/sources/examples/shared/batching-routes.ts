import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Color,
    MeshRenderer,
    Material,
    Mesh,
    Vec3,
    utils,
    primitives,
    director,
    Director,
} from 'cocosair';
import { installAssetLifecycle } from './asset-lifecycle.js';

/** Three native routes, with equal visible geometry and explicit ownership. */
export async function runBatchRoute(route: 'shared' | 'merged' | 'dynamic'): Promise<void> {
    const query = new URLSearchParams(location.search);
    const count = Number(query.get('count') || 256);
    const instancing = route === 'shared' && query.get('instancing') === '1';
    const maxCount = route === 'shared' ? 4096 : 100000;
    if (!Number.isInteger(count) || count < 1 || count > maxCount) throw new Error(`count must be 1..${maxCount}`);
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const spacing = Math.min(3 / columns, 2.2 / rows);
    const size = spacing * 0.7;
    const probe = {
        id: `batching-${route}`,
        ready: false,
        ok: false,
        checks: [] as { name: string; ok: boolean; detail: string }[],
        state: { route, count, instancing } as Record<string, unknown>,
    };
    (window as any).__trialProbe = probe;
    const check = (name: string, ok: boolean, detail: string): void => {
        probe.checks.push({ name, ok, detail });
        if (!ok) throw new Error(`[batching-${route}] ${name}: ${detail}`);
    };
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    const scene = new Scene(`batching-${route}`);
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 5);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1.6;
    camera.near = 0.1;
    camera.far = 20;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(15, 18, 24, 255);
    let group: Node;
    let mesh: Mesh;
    let material: Material;
    let wave = 0;
    let updateMs = 0;
    const positions = new Float32Array(count * 12);
    const basePositions = new Float32Array(count * 12);
    const indices = count * 4 > 65536 ? new Uint32Array(count * 6) : new Uint16Array(count * 6);
    for (let i = 0; i < count; i++) {
        const cx = ((i % columns) - (columns - 1) / 2) * spacing;
        const cy = (Math.floor(i / columns) - (rows - 1) / 2) * spacing;
        const h = size / 2;
        const p = i * 12;
        const index = i * 6;
        const v = i * 4;
        basePositions.set([cx - h, cy - h, 0, cx + h, cy - h, 0, cx - h, cy + h, 0, cx + h, cy + h, 0], p);
        indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], index);
    }
    const geometry = {
        positions,
        ...(indices instanceof Uint16Array ? { indices16: indices } : { indices32: indices }),
        minPos: new Vec3(-1.7, -1.3, -0.01),
        maxPos: new Vec3(1.7, 1.3, 0.01),
    };
    let setupMs = 0;
    function update(): void {
        const start = performance.now();
        wave += 1 / 60;
        for (let i = 0; i < count; i++) {
            const offset = Math.sin(wave * 2 + (i % columns) * 0.2) * spacing * 0.15;
            for (let v = 0; v < 4; v++) {
                const p = i * 12 + v * 3;
                positions[p] = basePositions[p] + offset;
            }
        }
        mesh.updateSubMesh(0, geometry);
        updateMs = performance.now() - start;
    }
    function build(): void {
        const start = performance.now();
        wave = 0;
        positions.set(basePositions);
        group = new Node('BatchRoot');
        scene.addChild(group);
        material = new Material();
        // Shared resources do not imply GPU instancing. Enable it only for the explicit comparison arm.
        material.initialize({ effectName: 'builtin-unlit', defines: { USE_INSTANCING: instancing } });
        material.setProperty('mainColor', new Color(75, 225, 140, 255));
        if (route === 'shared') {
            mesh = utils.createMesh(primitives.quad());
            for (let i = 0; i < count; i++) {
                const node = new Node(`Quad-${i}`);
                group.addChild(node);
                const p = i * 12;
                node.setPosition(
                    (basePositions[p] + basePositions[p + 3]) / 2,
                    (basePositions[p + 1] + basePositions[p + 7]) / 2,
                    0,
                );
                node.setScale(size, size, 1);
                const renderer = node.addComponent(MeshRenderer);
                renderer.mesh = mesh;
                renderer.setSharedMaterial(material, 0);
            }
        } else {
            mesh =
                route === 'merged'
                    ? utils.createMesh({
                          positions: Array.from(positions),
                          indices: Array.from(indices),
                          minPos: geometry.minPos,
                          maxPos: geometry.maxPos,
                      })
                    : utils.MeshUtils.createDynamicMesh(0, geometry, undefined, {
                          maxSubMeshes: 1,
                          maxSubMeshVertices: count * 4,
                          maxSubMeshIndices: count * 6,
                      });
            const renderer = group.addComponent(MeshRenderer);
            renderer.mesh = mesh;
            renderer.setSharedMaterial(material, 0);
        }
        if (route === 'dynamic') director.on(Director.EVENT_BEFORE_UPDATE, update);
        setupMs = performance.now() - start;
    }
    function release(): void {
        director.off(Director.EVENT_BEFORE_UPDATE, update);
        group.destroy();
        material.destroy();
        mesh.destroy();
    }
    const held = (): { name: string; ref: object }[] => [
        { name: 'mesh', ref: mesh },
        { name: 'material', ref: material },
    ];
    const nextFrame = (): Promise<void> => new Promise((resolve) => director.once(Director.EVENT_AFTER_DRAW, resolve));
    function samplePixels(): { lit: number; bytes: Uint8ClampedArray } {
        const canvas = document.querySelector('canvas')!;
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        const ctx = copy.getContext('2d')!;
        ctx.drawImage(canvas, 0, 0);
        const bytes = ctx.getImageData(0, 0, copy.width, copy.height).data;
        let lit = 0;
        for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 1] > 140 && bytes[i + 1] > bytes[i] + 40) lit++;
        return { lit, bytes };
    }
    async function pixelFrame(): Promise<{ lit: number; bytes: Uint8ClampedArray }> {
        return new Promise((resolve) => director.once(Director.EVENT_AFTER_DRAW, () => resolve(samplePixels())));
    }
    build();
    app.run(scene);
    for (let i = 0; i < 5; i++) await nextFrame();
    const initial = await pixelFrame();
    check('batch-pixels-visible', initial.lit > 300, `green pixels=${initial.lit}`);
    const device = director.root!.device;
    check(
        'batch-draw-count',
        device.numDrawCalls === (route === 'shared' ? (instancing ? Math.ceil(count / 1024) : count) : 1),
        `actual draws=${device.numDrawCalls}`,
    );
    if (route === 'dynamic') {
        for (let i = 0; i < 10; i++) await nextFrame();
        const later = await pixelFrame();
        let changed = 0;
        for (let i = 0; i < initial.bytes.length; i++) if (initial.bytes[i] !== later.bytes[i]) changed++;
        check('dynamic-pixel-change', changed > 100, `changed channels=${changed}`);
    }
    probe.state.litPixels = initial.lit;
    probe.state.setupMs = setupMs;
    probe.state.drawCalls = device.numDrawCalls;
    const percentile = (values: number[], fraction: number): number =>
        [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
    async function measure(samples = 180): Promise<Record<string, unknown>> {
        if (!Number.isInteger(samples) || samples < 60 || samples > 600) throw new Error('samples must be 60..600');
        const intervals: number[] = [];
        const draws: number[] = [];
        const updates: number[] = [];
        const renderMs: number[] = [];
        for (let i = 0; i < 30; i++) await nextFrame();
        let previous = performance.now();
        let beforeDraw = 0;
        const before = (): void => {
            beforeDraw = performance.now();
        };
        director.on(Director.EVENT_BEFORE_DRAW, before);
        for (let i = 0; i < samples; i++) {
            await nextFrame();
            const now = performance.now();
            intervals.push(now - previous);
            previous = now;
            draws.push(device.numDrawCalls);
            updates.push(updateMs);
            renderMs.push(now - beforeDraw);
        }
        director.off(Director.EVENT_BEFORE_DRAW, before);
        const canvas = document.querySelector('canvas')!;
        const result = {
            route,
            instancing,
            count,
            samples,
            warmupFrames: 30,
            setupMs,
            framebuffer: [canvas.width, canvas.height],
            dpr: devicePixelRatio,
            draws: [Math.min(...draws), Math.max(...draws)],
            frameIntervalMs: { p50: percentile(intervals, 0.5), p95: percentile(intervals, 0.95) },
            cpuRenderSubmissionMs: { p50: percentile(renderMs, 0.5), p95: percentile(renderMs, 0.95) },
            cpuDynamicUpdateMs: { p50: percentile(updates, 0.5), p95: percentile(updates, 0.95) },
            gpuTimeMs: null,
            presentTiming: null,
            timingScope: 'rAF intervals and CPU submission only; no GPU or display-present proof',
        };
        probe.state.measurement = result;
        return result;
    }
    (window as any).__batchProbe = { measure, pixels: async () => (await pixelFrame()).lit };
    (window as any).__probe = async () => {
        const canvas = document.querySelector('canvas')!;
        return {
            route,
            count,
            instancing,
            draws: device.numDrawCalls,
            instances: device.numInstances,
            vertexCount: mesh.struct.vertexBundles[0].view.count,
            litPixels: (await pixelFrame()).lit,
            canvas: { width: canvas.width, height: canvas.height },
        };
    };
    installAssetLifecycle({
        label: `batching-${route}`,
        hold: held,
        release,
        reacquire: async () => {
            build();
            await nextFrame();
            return held();
        },
    });
    probe.ready = true;
    probe.ok = true;
}
