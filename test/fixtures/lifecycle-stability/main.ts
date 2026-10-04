import { createAirApp, Scene, Node, Camera, Color, Material, MeshRenderer, Texture2D,
    utils, primitives, Component, Director, director, game } from 'cocosair';
let reloads = 0, frames = 0, updates = 0, simulatedSeconds = 0, businessHits = 0;
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings', contextLoss: { reload: () => reloads++ } });
const gl = app.canvas.getContext('webgl2')!, draws: Record<string, number> = {};
for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const original = gl[name].bind(gl); draws[name] = 0;
    gl[name] = (...args) => { draws[name]++; return original(...args); };
}
const shared = new Texture2D();
shared.reset({ width: 1, height: 1, format: Texture2D.PixelFormat.RGBA8888 });
shared.uploadData(new Uint8Array([255, 0, 0, 255])); shared.addRef();
let current: { scene: Scene; node: Node; mesh: ReturnType<typeof utils.createMesh>; material: Material } | undefined;
let lastPixel: number[] = [], sampleAt = 0;
const samples: any[] = [];
class Driver extends Component { update(dt: number) { updates++; simulatedSeconds += dt; } }
function pixel() { const b = new Uint8Array(4); gl.readPixels(160, 120, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); return [...b]; }
function setup(name: string) {
    const scene = new Scene(name), cameraNode = new Node('Camera'), node = new Node('Private');
    scene.addChild(cameraNode); scene.addChild(node); cameraNode.setPosition(0, 0, 10);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 3;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 255);
    const mesh = utils.createMesh(primitives.box()), material = new Material(), renderer = node.addComponent(MeshRenderer);
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    material.setProperty('mainTexture', shared); renderer.mesh = mesh; renderer.setSharedMaterial(material, 0);
    node.addComponent(Driver); app.run(scene); shared.addRef();
    const onBusiness = () => businessHits++, onDraw = () => {
        frames++; lastPixel = pixel();
        if (performance.now() - sampleAt >= 10000 && samples.length < 64) { sampleAt = performance.now(); samples.push(snapshot()); }
    };
    window.addEventListener('lifecycle-business', onBusiness); director.on(Director.EVENT_AFTER_DRAW, onDraw);
    app.session!.own(() => {
        window.removeEventListener('lifecycle-business', onBusiness); director.off(Director.EVENT_AFTER_DRAW, onDraw);
        mesh.destroy(); material.destroy(); shared.decRef();
    }, 'private-assets-and-listeners');
    current = { scene, node, mesh, material };
    return current;
}
function snapshot() {
    return { at: performance.now(), frames, updates, simulatedSeconds, draws: { ...draws }, pixel: [...lastPixel],
        businessHits, ownedCount: app.session!.ownedCount, sharedRefs: shared.refCount, sharedValid: shared.isValid,
        scene: app.getScene()?.name ?? null, health: app.contextHealth.snapshot(),
        jsHeap: (performance as any).memory ? { usedBytes: (performance as any).memory.usedJSHeapSize,
            totalBytes: (performance as any).memory.totalJSHeapSize } : 'unavailable', gpuMemory: 'unavailable' };
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function release() {
    const owned = current, token = app.session!.token(), before = snapshot(), start = performance.now();
    const first = app.releaseScene!(), samePromise = first === app.releaseScene!();
    let runCode: string | undefined; const rejected = new Scene('DuringRelease');
    try { app.run(rejected); } catch (e) { runCode = (e as any).code; } rejected.destroy();
    const receipt = await first; window.dispatchEvent(new Event('lifecycle-business'));
    const after = snapshot(); await delay(120); const settled = snapshot();
    return { elapsedMs: performance.now() - start, samePromise, runCode, tokenCurrent: token.isCurrent(), receipt,
        before, after, settled, assetsValid: owned ? [owned.scene, owned.node, owned.mesh, owned.material].map((a) => a.isValid) : [] };
}
async function contextCase(kind: string) {
    const beforeGate = app.contextHealth.requestReload();
    if (kind !== 'never-run') { setup(kind); await delay(160); }
    if (kind === 'timeout') app.session!.own(() => new Promise<void>(() => {}), 'intentional-unresolved');
    if (kind === 'paused') game.pause();
    let lostBefore, lostAfter;
    if (kind === 'lost' || kind === 'restored') {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (!ext) return { kind, notRun: 'WEBGL_lose_context unavailable' };
        ext.loseContext();
        const deadline = performance.now() + 5000;
        while (app.contextHealth.snapshot().state !== 'lost' && performance.now() < deadline) await delay(10);
        lostBefore = snapshot(); await delay(150); lostAfter = snapshot();
        if (kind === 'restored') {
            ext.restoreContext(); const until = performance.now() + 5000;
            while (app.contextHealth.snapshot().state !== 'failed' && performance.now() < until) await delay(10);
        }
    }
    const result = await release();
    let failedRunCode: string | undefined;
    if (kind === 'timeout') { const rejected = new Scene('AfterFailedRelease');
        try { app.run(rejected); } catch (e) { failedRunCode = (e as any).code; } rejected.destroy(); }
    const health = app.contextHealth.snapshot(), reloadGate = app.contextHealth.requestReload();
    const firstClose = app.close!(), sameClose = firstClose === app.close!(), close = await firstClose;
    shared.decRef();
    return { kind, beforeGate, lostBefore, lostAfter, result, health, reloadGate, reloads, failedRunCode,
        sameClose, close, sharedRefs: shared.refCount, diagnostics: app.diagnostics!.snapshot() };
}
async function stability(durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 600000) throw new Error('durationMs must be in [1000,600000]');
    const started = performance.now(); setup('TenMinute');
    const start = snapshot(), cycles: any[] = [];
    while (performance.now() - started < durationMs) {
        await delay(Math.min(30000, Math.max(1, durationMs - (performance.now() - started))));
        window.dispatchEvent(new Event('lifecycle-business')); const active = snapshot(), result = await release();
        cycles.push({ active, result });
        if (performance.now() - started < durationMs) setup('TenMinute' + cycles.length);
    }
    const elapsedMs = performance.now() - started, final = snapshot(), close = await app.close!(); shared.decRef();
    return { requestedMs: durationMs, elapsedMs, start, final, samples, cycles, close, sharedRefs: shared.refCount,
        diagnostics: app.diagnostics!.snapshot(), limitations: ['JS heap only where exposed; no complete GPU allocation measurement',
            'Three concurrent browser processes; frame counts are observations, not isolated performance benchmarks'] };
}
(window as any).__lifecycle = { ready: true, contextCase, stability, snapshot };
