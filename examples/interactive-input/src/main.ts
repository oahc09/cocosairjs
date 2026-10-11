import type {
    AirApp,
    AirActionInput,
    AirActionState,
    AirActionSessionGate,
    Node,
    MeshRenderer,
    Mesh,
    Material,
    Camera,
} from 'cocosair';

const control = new URLSearchParams(location.search).get('control') === 'html';
const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const host = document.querySelector<HTMLElement>('#host')!;
const button = document.querySelector<HTMLButtonElement>('#activate')!;
const range = document.querySelector<HTMLInputElement>('#range')!;
const rail = document.querySelector<HTMLElement>('#rail')!;
const rewrite = document.querySelector<HTMLInputElement>('#rewrite')!;
const dom = new AbortController();
const events: Record<string, unknown>[] = [];
const pointers = new Map<number, { generation: number; owner: string; x: number; y: number }>();
let sequence = 0,
    fallbackGeneration = 1,
    disposed = false,
    activations = 0,
    visibleUpdates = 0,
    dragCommits = 0,
    hoverMoves = 0;
let rangeCommits = 0,
    railUnits = 0,
    textReplacements = 0,
    frame = 0,
    receivedSequence = 0,
    submittedSequence = 0;
let submittedTimestamp = 'UNKNOWN';
let retiredRangeContact = false,
    validRangeValue = 50;
let labelNode = document.querySelector('#button-label')!.firstChild!;
let lastLabel = '激活 0',
    latest: Record<string, unknown> = { sequence: 0 };
let app: AirApp | null = null,
    input: AirActionInput | null = null,
    state: AirActionState | null = null,
    gate: AirActionSessionGate | null = null;
let actor: Node | null = null,
    renderer: MeshRenderer | null = null,
    mesh: Mesh | null = null,
    material: Material | null = null,
    camera: Camera | null = null;
let sdk: typeof import('cocosair') | null = null,
    raf: number | null = null,
    releasePromise: Promise<unknown> | null = null;
const generation = (): number => gate?.generation ?? fallbackGeneration;
const record = (type: string, event?: Event, detail: Record<string, unknown> = {}): void => {
    const row = {
        type,
        sequence: ++sequence,
        generation: generation(),
        isTrusted: event?.isTrusted ?? false,
        timestamp: new Date().toISOString(),
        ...detail,
    };
    events.push(row);
    latest = row;
    receivedSequence = sequence;
};
function retire(reason: string, event?: Event): void {
    if (disposed) return;
    record(reason, event, { retiredPointers: [...pointers.keys()] });
    if ([...pointers.values()].some((p) => p.owner === 'range')) retiredRangeContact = true;
    pointers.clear();
    if (gate) {
        gate.deactivate(reason);
        gate.activate();
    } else fallbackGeneration++;
}
function setValue(value: number): void {
    const next = String(Math.max(0, Math.min(100, Math.round(value))));
    if (range.value !== next) range.value = next;
    const out = document.querySelector('#value')!;
    if (out.textContent !== next) out.textContent = next;
}
function activate(event: Event): void {
    if (disposed) return;
    record('activate', event, {
        detail: event instanceof MouseEvent ? event.detail : null,
        pointerType: event instanceof PointerEvent ? event.pointerType : 'click-without-pointer-type',
    });
    if (state) {
        const source = { backend: 'manual' as const, physicalCode: 'html-button' };
        state.press('activate', source);
        state.release('activate', source);
    } else {
        activations++;
        visibleUpdates++;
    }
}
function update(): void {
    if (disposed) return;
    frame++;
    if (state)
        for (const edge of state.consumeTick().transitions) {
            if (edge.action === 'activate' && edge.kind === 'press') {
                activations++;
                visibleUpdates++;
            }
        }
    const text = `激活 ${activations}`;
    if (rewrite.checked) {
        const span = document.createElement('span');
        span.id = 'button-label';
        span.textContent = text;
        button.replaceChildren(span);
        textReplacements++;
    } else if (text !== lastLabel) {
        document.querySelector('#button-label')!.firstChild!.textContent = text;
    }
    lastLabel = text;
    const x = (((activations + dragCommits) % 5) - 2) * 0.25;
    actor?.setPosition(x, (validRangeValue - 50) / 100, 0);
    if (control) document.querySelector<HTMLElement>('#html-marker')!.style.left = `${45 + x * 15}%`;
    document.querySelector('#status')!.textContent =
        `${control ? '普通 HTML 对照' : 'SDK DOM 后端'} · ${activations} 次激活 · 代次 ${generation()} · 拖动 ${dragCommits}`;
    if (frame % 10 === 0)
        document.querySelector('#trace')!.textContent = events
            .slice(-8)
            .map((e) => JSON.stringify(e))
            .join('\n');
}
function afterDraw(): void {
    submittedSequence = receivedSequence;
    submittedTimestamp = new Date().toISOString();
}
function htmlFrame(): void {
    update();
    afterDraw();
    if (!disposed) raf = requestAnimationFrame(htmlFrame);
}

if (!control) {
    sdk = await import('cocosair');
    app = await sdk.createAirApp({ canvas, screenMode: 'container', container: host });
    (window as unknown as Record<string, unknown>).__airApp = app;
    gate = sdk.createSessionGate();
    gate.activate();
    state = sdk.createActionState({
        actions: {
            activate: {
                sources: [
                    { backend: 'manual', physicalCode: 'html-button' },
                    { backend: 'dom', physicalCode: 'KeyD' },
                ],
            },
            drag: { sources: [{ backend: 'dom', pointerId: '*' }] },
        },
    });
    input = sdk.createActionInput({ state, backend: 'dom', canvas, session: gate, preventDefault: false });
    input.attach();
    const scene = new sdk.Scene('interactive-input');
    const cameraNode = new sdk.Node('camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 5);
    cameraNode.lookAt(new sdk.Vec3());
    camera = cameraNode.addComponent(sdk.Camera);
    camera.projection = sdk.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 2;
    camera.clearFlags = sdk.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new sdk.Color(16, 26, 40, 255);
    actor = new sdk.Node('activation-marker');
    scene.addChild(actor);
    mesh = sdk.utils.createMesh({
        positions: [-0.25, -0.25, 0, 0.25, -0.25, 0, -0.25, 0.25, 0, 0.25, 0.25, 0],
        indices: [0, 1, 2, 1, 3, 2],
    });
    mesh.addRef();
    material = new sdk.Material();
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new sdk.Color(242, 69, 69, 255));
    material.addRef();
    renderer = actor.addComponent(sdk.MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    sdk.director.on(sdk.Director.EVENT_BEFORE_UPDATE, update);
    sdk.director.on(sdk.Director.EVENT_AFTER_DRAW, afterDraw);
    await app.run(scene);
    // §25 Lifecycle Contract（资源粒度、惰性）：仅 __lifecycle() 调用时才执行一轮
    // activation marker mesh/material 的 真实释放 → 泄漏核对 → 重建并重新绑定。
    // 终态 release()（含 INPUT_DISPOSED/app.close 语义）与会话 gate 生命周期不受影响。
    {
        const { installAssetLifecycle } = await import('../../shared/asset-lifecycle.js');
        const cc = sdk!;
        const holdList = () =>
            disposed || !mesh || !material
                ? []
                : [
                      { name: 'activation-mesh', ref: mesh },
                      { name: 'activation-material', ref: material },
                  ];
        installAssetLifecycle({
            label: 'interactive-input',
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
                const nextMesh = cc.utils.createMesh({
                    positions: [-0.25, -0.25, 0, 0.25, -0.25, 0, -0.25, 0.25, 0, 0.25, 0.25, 0],
                    indices: [0, 1, 2, 1, 3, 2],
                });
                nextMesh.addRef();
                const nextMaterial = new cc.Material();
                nextMaterial.initialize({ effectName: 'builtin-unlit' });
                nextMaterial.setProperty('mainColor', new cc.Color(242, 69, 69, 255));
                nextMaterial.addRef();
                mesh = nextMesh;
                material = nextMaterial;
                if (renderer) {
                    renderer.mesh = nextMesh;
                    renderer.setSharedMaterial(nextMaterial, 0);
                }
                return [
                    { name: 'activation-mesh', ref: nextMesh },
                    { name: 'activation-material', ref: nextMaterial },
                ];
            },
        });
    }
} else {
    document.querySelector<HTMLElement>('#html-marker')!.style.display = 'block';
    raf = requestAnimationFrame(htmlFrame);
}

button.addEventListener('click', activate, { signal: dom.signal });
// Some WebKit versions deliver the compatibility click as MouseEvent. Preserve the actual
// preceding contact instead of guessing its source from click.pointerType.
button.addEventListener(
    'pointerdown',
    (e) => record('button-contact', e, { pointerType: e.pointerType, pointerId: e.pointerId }),
    { signal: dom.signal },
);
button.addEventListener(
    'pointercancel',
    (e) => record('button-cancel', e, { pointerType: e.pointerType, pointerId: e.pointerId }),
    { signal: dom.signal },
);
document.querySelector('#reset')!.addEventListener('click', (e) => retire('reset', e), { signal: dom.signal });
document.querySelector('#mode')!.addEventListener('click', (e) => retire('mode', e), { signal: dom.signal });
rewrite.addEventListener(
    'change',
    (e) => {
        record('rewrite-mode', e);
        labelNode = document.querySelector('#button-label')!.firstChild!;
    },
    { signal: dom.signal },
);
for (const [target, owner] of [
    [canvas, 'canvas'],
    [range, 'range'],
] as [HTMLElement, 'canvas' | 'range'][]) {
    target.addEventListener(
        'pointerdown',
        (e) => {
            if (disposed) return;
            record('pointerdown', e, {
                owner,
                pointerId: e.pointerId,
                pointerType: e.pointerType,
                clientX: e.clientX,
                clientY: e.clientY,
            });
            pointers.set(e.pointerId, { generation: generation(), owner, x: e.clientX, y: e.clientY });
            if (owner === 'canvas') target.setPointerCapture(e.pointerId);
            else retiredRangeContact = false;
        },
        { signal: dom.signal },
    );
    target.addEventListener(
        'pointermove',
        (e) => {
            if (disposed) return;
            const start = pointers.get(e.pointerId);
            if (!start && e.pointerType === 'mouse' && e.buttons === 0 && owner === 'canvas') {
                hoverMoves++;
                record('hover', e);
            }
            const rect = canvas.getBoundingClientRect();
            if (
                start &&
                owner === 'canvas' &&
                (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
            ) {
                retire('leave', e);
                return;
            }
            if (start)
                record('pointermove', e, { owner, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY });
        },
        { signal: dom.signal },
    );
    target.addEventListener(
        'pointerup',
        (e) => {
            if (disposed) return;
            const start = pointers.get(e.pointerId),
                accepted = !!start && start.generation === generation();
            record('pointerup', e, { owner, pointerId: e.pointerId, accepted });
            pointers.delete(e.pointerId);
            if (accepted && owner === 'canvas') {
                dragCommits++;
                visibleUpdates++;
            }
            if (owner === 'range' && accepted) retiredRangeContact = false;
            if (accepted && owner === 'range') rangeCommits++;
        },
        { signal: dom.signal },
    );
    target.addEventListener('pointercancel', (e) => retire('cancel', e), { signal: dom.signal });
}
range.addEventListener(
    'input',
    (e) => {
        if (disposed) return;
        const accepted = !retiredRangeContact;
        record('range-input', e, { value: range.value, accepted });
        if (accepted) validRangeValue = Number(range.value);
        setValue(validRangeValue);
    },
    { signal: dom.signal },
);
range.addEventListener(
    'keydown',
    (e) => {
        retiredRangeContact = false;
        record('range-key', e, { code: e.code });
    },
    { signal: dom.signal },
);
rail.addEventListener(
    'wheel',
    (e) => {
        if (disposed) return;
        const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        const units = -(horizontal ? e.deltaX : e.deltaY) * 5;
        if (horizontal) {
            e.preventDefault();
            railUnits += units;
            setValue(validRangeValue + units / 100);
            validRangeValue = Number(range.value);
        }
        record('wheel', e, {
            owner: horizontal ? 'rail' : 'document',
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaMode: e.deltaMode,
            units,
            consumed: horizontal,
        });
    },
    { signal: dom.signal, passive: false },
);
for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
    rail.addEventListener(
        type,
        (e) =>
            record('rail-touch', e, {
                phase: type,
                contacts: Array.from(e.changedTouches, (t) => ({ id: t.identifier, x: t.clientX, y: t.clientY })),
            }),
        { signal: dom.signal, passive: true },
    );
}
window.addEventListener('scroll', (e) => record('document-scroll', e, { scrollY }), {
    signal: dom.signal,
    passive: true,
});
window.addEventListener(
    'keydown',
    (e) => {
        if (disposed || e.code !== 'KeyD' || e.target instanceof HTMLInputElement) return;
        record('key-activate', e, { code: e.code, repeat: e.repeat });
        if (control && !e.repeat) {
            activations++;
            visibleUpdates++;
        }
    },
    { signal: dom.signal, capture: true },
);
window.addEventListener('blur', (e) => retire('blur', e), { signal: dom.signal });
window.addEventListener('resize', (e) => retire('resize', e), { signal: dom.signal });
document.addEventListener(
    'visibilitychange',
    (e) => {
        if (document.hidden) retire('hidden', e);
    },
    { signal: dom.signal },
);

function snapshot(): Record<string, unknown> {
    const rect = canvas.getBoundingClientRect();
    const vp = camera && !disposed ? (camera.camera.matViewProj as unknown as Record<string, number>) : null;
    return {
        control,
        activations,
        visibleUpdates,
        dragCommits,
        rangeCommits,
        hoverMoves,
        rangeValue: Number(range.value),
        railUnits,
        generation: generation(),
        activePointers: [...pointers.keys()],
        disposed,
        frame,
        latest: { ...latest },
        textReplacements,
        labelIdentityStable: labelNode === document.querySelector('#button-label')?.firstChild,
        events: events.map((e) => ({ ...e })),
        heldSources: state?.heldSources('drag') ?? [],
        layout: {
            css: { width: rect.width, height: rect.height },
            rect: { left: rect.left, top: rect.top },
            backing: { width: canvas.width, height: canvas.height },
            viewport: { width: innerWidth, height: innerHeight },
            dpr: devicePixelRatio,
        },
        actor:
            actor && !disposed
                ? { x: actor.position.x, y: actor.position.y, z: actor.position.z, meshBound: !!renderer?.mesh }
                : null,
        camera: vp
            ? { viewProjection: Array.from({ length: 16 }, (_, i) => vp[`m${String(i).padStart(2, '0')}`]) }
            : null,
        submitted: {
            receivedSequence,
            submittedSequence,
            totalFrames: sdk?.director.getTotalFrames() ?? frame,
            timestamp: submittedTimestamp,
        },
        scrollY,
        ownedRefs: [mesh?.refCount, material?.refCount].filter((v) => v !== undefined),
    };
}
function release(): Promise<unknown> {
    if (releasePromise) return releasePromise;
    disposed = true;
    dom.abort();
    pointers.clear();
    gate?.deactivate('dispose');
    input?.dispose();
    if (raf !== null) cancelAnimationFrame(raf);
    if (sdk) {
        sdk.director.off(sdk.Director.EVENT_BEFORE_UPDATE, update);
        sdk.director.off(sdk.Director.EVENT_AFTER_DRAW, afterDraw);
    }
    document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.disabled = true;
    });
    range.disabled = true;
    rewrite.disabled = true;
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
    releasePromise = Promise.resolve(app?.close?.()).then(() => ({
        refs,
        listenersDetached: dom.signal.aborted,
        inputDetached: input?.attached === false || control,
        disposed,
    }));
    return releasePromise;
}
document.querySelector('#release')!.addEventListener(
    'click',
    (e) => {
        record('release', e);
        void release();
    },
    { signal: dom.signal },
);
window.addEventListener(
    'pagehide',
    () => {
        void release();
    },
    { signal: dom.signal },
);
(window as unknown as Record<string, unknown>).__mixedInput = { snapshot, release };
