import type {
    AirApp,
    Mesh,
    Material,
    MeshRenderer,
    Node,
    Camera,
    AirActionInput,
    AirActionState,
    AirActionSessionGate,
} from 'cocosair';
const host = document.querySelector<HTMLElement>('#host')!,
    parent = document.querySelector<HTMLElement>('#parent')!,
    canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const dom = new AbortController(),
    events: Record<string, unknown>[] = [],
    receipts: Record<string, unknown>[] = [];
let app: AirApp | null = null,
    cc: typeof import('cocosair') | null = null,
    mesh: Mesh | null = null,
    material: Material | null = null,
    renderer: MeshRenderer | null = null,
    actor: Node | null = null,
    camera: Camera | null = null;
let state: AirActionState | null = null,
    input: AirActionInput | null = null,
    gate: AirActionSessionGate | null = null;
let navigationGeneration = 0,
    appliedNavigationGeneration = 0;
let generation = 0,
    selected = 'Report',
    sequence = 0,
    submitted = 0,
    frames = 0,
    hits = 0,
    disposed = false,
    lastLayout = '',
    layoutEpoch = 0,
    appliedGeneration = 0;
let loading: Promise<void> | null = null,
    releasePromise: Promise<unknown> | null = null;
const record = (type: string, e?: Event, detail: Record<string, unknown> = {}) =>
    events.push({
        type,
        sequence: ++sequence,
        generation,
        isTrusted: e?.isTrusted ?? false,
        timestamp: new Date().toISOString(),
        ...detail,
    });
function retire(reason: string, e?: Event): void {
    generation++;
    gate?.deactivate(reason);
    gate?.activate();
    record(reason, e);
}
const observer = new ResizeObserver(() => {
    const r = host.getBoundingClientRect(),
        key = `${r.width}/${r.height}`;
    if (key !== lastLayout) {
        lastLayout = key;
        layoutEpoch++;
        retire('layout-observed');
        receipts.push({
            epoch: layoutEpoch,
            generation,
            css: [r.width, r.height],
            buffer: [canvas.width, canvas.height],
            timestamp: new Date().toISOString(),
        });
    }
});
observer.observe(host);
function update(): void {
    frames++;
    if (state) for (const edge of state.consumeTick().transitions) if (edge.kind === 'press') hits++;
    actor?.setPosition(hits % 2 ? 0.35 : 0, 0, 0);
}
function afterDraw(): void {
    submitted = sequence;
}
async function boot(): Promise<void> {
    const r = host.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) throw Error('STARTUP_CONTAINER_NOT_READY');
    // Safe bootstrap binds native wrappers and density before the deferred runtime import.
    // 说明符保持运行期解析（index.html importmap）：规格门禁的 bundle 阶段不静态解析边车包。
    const bootstrapSpecifier = 'cocosair';
    const safe = (await import(bootstrapSpecifier)) as typeof import('cocosair');
    app = await safe.createAirApp({ canvas, screenMode: 'container', container: host });
    (window as unknown as Record<string, unknown>).__airApp = app;
    if (disposed) throw Error('CONTAINER_DISPOSED');
    cc = await import('cocosair');
    if (disposed) throw Error('CONTAINER_DISPOSED');
    const scene = new cc.Scene('container-ready'),
        cameraNode = new cc.Node('camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 5);
    cameraNode.lookAt(new cc.Vec3());
    camera = cameraNode.addComponent(cc.Camera);
    camera.projection = cc.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 2;
    camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new cc.Color(15, 25, 40, 255);
    actor = new cc.Node('container-marker');
    scene.addChild(actor);
    mesh = cc.utils.createMesh({
        positions: [-0.3, -0.3, 0, 0.3, -0.3, 0, -0.3, 0.3, 0, 0.3, 0.3, 0],
        indices: [0, 1, 2, 1, 3, 2],
    });
    mesh.addRef();
    material = new cc.Material();
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new cc.Color(240, 65, 65, 255));
    material.addRef();
    renderer = actor.addComponent(cc.MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    gate = cc.createSessionGate();
    gate.activate();
    state = cc.createActionState({ actions: { hit: { sources: [{ backend: 'dom', pointerId: '*' }] } } });
    input = cc.createActionInput({ state, backend: 'dom', canvas, session: gate });
    input.attach();
    cc.director.on(cc.Director.EVENT_BEFORE_UPDATE, update);
    cc.director.on(cc.Director.EVENT_AFTER_DRAW, afterDraw);
    await app.run(scene);
    // §25 Lifecycle Contract（资源粒度、惰性）：仅 __lifecycle() 调用时才执行一轮
    // container marker mesh/material 的 真实释放 → 泄漏核对 → 重建并重新绑定。
    // 终态 release()（CONTAINER_DISPOSED/app.close 语义）与会话 gate 生命周期不受影响。
    {
        const { installAssetLifecycle } = await import('../../shared/asset-lifecycle.js');
        const ccNS = cc!;
        const holdList = () =>
            disposed || !mesh || !material
                ? []
                : [
                      { name: 'container-mesh', ref: mesh },
                      { name: 'container-material', ref: material },
                  ];
        installAssetLifecycle({
            label: 'interactive-container',
            hold: holdList,
            release: () => {
                const ownedMesh = mesh,
                    ownedMaterial = material,
                    bound = renderer;
                if (!ownedMesh || !ownedMaterial || !bound) return;
                mesh = null;
                material = null;
                bound.mesh = null;
                bound.setSharedMaterial(null, 0);
                ownedMesh.decRef();
                ownedMaterial.decRef();
                ownedMesh.destroy();
                ownedMaterial.destroy();
            },
            reacquire: async () => {
                const nextMesh = ccNS.utils.createMesh({
                    positions: [-0.3, -0.3, 0, 0.3, -0.3, 0, -0.3, 0.3, 0, 0.3, 0.3, 0],
                    indices: [0, 1, 2, 1, 3, 2],
                });
                nextMesh.addRef();
                const nextMaterial = new ccNS.Material();
                nextMaterial.initialize({ effectName: 'builtin-unlit' });
                nextMaterial.setProperty('mainColor', new ccNS.Color(240, 65, 65, 255));
                nextMaterial.addRef();
                mesh = nextMesh;
                material = nextMaterial;
                if (renderer) {
                    renderer.mesh = nextMesh;
                    renderer.setSharedMaterial(nextMaterial, 0);
                }
                return [
                    { name: 'container-mesh', ref: nextMesh },
                    { name: 'container-material', ref: nextMaterial },
                ];
            },
        });
    }
}
async function select(tab: string, e?: Event): Promise<void> {
    if (disposed) throw Error('CONTAINER_DISPOSED');
    retire('tab', e);
    const token = ++navigationGeneration;
    selected = tab;
    host.classList.toggle('hidden', tab !== 'Run' && (!loading || !!app));
    host.classList.toggle('loading-hidden', tab !== 'Run' && !!loading && !app);
    document.querySelector<HTMLElement>('#report')!.style.display = tab === 'Report' ? 'block' : 'none';
    document.querySelector<HTMLElement>('#compare')!.style.display = tab === 'Compare' ? 'block' : 'none';
    if (tab === 'Run') {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (token !== navigationGeneration || selected !== 'Run') {
            record('late-tab-ignored', undefined, { token });
            return;
        }
        // Layout observations may retire pointer sessions; they do not change the selected tab token.
        if (!loading)
            loading = boot().finally(() => {
                host.classList.remove('loading-hidden');
                host.classList.toggle('hidden', selected !== 'Run');
            });
        await loading;
        if (disposed || selected !== 'Run' || token !== navigationGeneration) {
            record('late-load-ignored', undefined, { token });
            return;
        }
        appliedGeneration = generation;
        appliedNavigationGeneration = token;
    }
    document.querySelector('#state')!.textContent =
        `${selected} · generation ${generation} · applied ${appliedGeneration}`;
}
for (const [id, tab] of [
    ['run', 'Run'],
    ['report-tab', 'Report'],
    ['compare-tab', 'Compare'],
] as const)
    document
        .querySelector('#' + id)!
        .addEventListener(
            'click',
            (e) => void select(tab, e).catch((error) => record('error', undefined, { message: String(error) })),
            { signal: dom.signal },
        );
for (const kind of ['narrow', 'wide'] as const)
    document.querySelector('#' + kind)!.addEventListener(
        'click',
        (e) => {
            parent.className = kind;
            record('parent-class', e, { kind });
        },
        { signal: dom.signal },
    );
document.querySelector('#hide')!.addEventListener(
    'click',
    (e) => {
        host.classList.add('hidden');
        retire('hide', e);
    },
    { signal: dom.signal },
);
document.querySelector('#show')!.addEventListener(
    'click',
    (e) => {
        host.classList.remove('hidden');
        retire('show', e);
    },
    { signal: dom.signal },
);
window.addEventListener('resize', (e) => retire('window-resize', e), { signal: dom.signal });
function snapshot(): Record<string, unknown> {
    const r = host.getBoundingClientRect(),
        cr = canvas.getBoundingClientRect();
    return {
        selected,
        generation,
        appliedGeneration,
        navigationGeneration,
        appliedNavigationGeneration,
        loading: !!loading,
        layoutEpoch,
        receipts: receipts.map((r) => ({ ...r })),
        events: events.map((e) => ({ ...e })),
        hits,
        held: state?.held('hit') ?? false,
        ready: !!app,
        disposed,
        frames,
        submitted,
        sequence,
        css: { width: r.width, height: r.height },
        canvasRect: { x: cr.x, y: cr.y, width: cr.width, height: cr.height },
        buffer: { width: canvas.width, height: canvas.height },
        dpr: devicePixelRatio,
        inlineStyle: parent.getAttribute('style'),
        parentClass: parent.className,
        camera: camera && !disposed ? { width: camera.camera.width, height: camera.camera.height } : null,
        ownedRefs: [mesh?.refCount, material?.refCount].filter((x) => x !== undefined),
        originalPuzzle50: 'NOT_RUN',
    };
}
function release(): Promise<unknown> {
    if (releasePromise) return releasePromise;
    disposed = true;
    dom.abort();
    observer.disconnect();
    gate?.deactivate('dispose');
    input?.dispose();
    document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));
    releasePromise = (async () => {
        if (loading) await Promise.allSettled([loading]);
        if (cc) {
            cc.director.off(cc.Director.EVENT_BEFORE_UPDATE, update);
            cc.director.off(cc.Director.EVENT_AFTER_DRAW, afterDraw);
        }
        renderer && (renderer.mesh = null);
        renderer?.setSharedMaterial(null, 0);
        const refs = [mesh, material]
            .filter((a): a is Mesh | Material => a !== null)
            .map((a) => {
                const before = a.refCount;
                a.decRef();
                return { before, after: a.refCount };
            });
        actor?.removeFromParent();
        actor?.destroy();
        await app?.close?.();
        return {
            refs,
            observerDisconnected: true,
            domAborted: dom.signal.aborted,
            inputDetached: !input?.attached,
            disposed,
        };
    })();
    return releasePromise;
}
document.querySelector('#release')!.addEventListener('click', () => void release(), { signal: dom.signal });
window.addEventListener('pagehide', () => void release(), { signal: dom.signal });
(window as unknown as Record<string, unknown>).__containerReady = { snapshot, release };
