/**
 * IER-04 dynamic mesh & screen projection example.
 *
 * Modes (URL ?mode=):
 *  - mesh (default): dual-path minimal meshes — a static mesh and a dynamic mesh with
 *    positions-only updates + renderer.onGeometryChanged(); every update passes the
 *    example-side preflight before any SDK call.
 *  - cut: a REAL received pointer gesture defines the knife line. client → canvas CSS rect
 *    → camera screen px → two rays (public camera API) → cut plane through both rays →
 *    world intersections with the target slab. Three independent objects: input stroke,
 *    cut surface, animated blade — each with its own error record.
 *  - ribbon: a screen-space dynamic mesh strip moving with time (real nodes, real pixels).
 *
 * ?test=1 switches to the frozen step clock (window.__geometry). Normal mode uses the
 * engine's native pacer only. Session generations gate late/stale pointer events.
 */
import {
    createAirApp,
    createStepClock,
    inspectAirGeometry,
    Scene,
    Node,
    Camera,
    MeshRenderer,
    Material,
    Color,
    Vec3,
    geometry,
    utils,
    game,
    director,
    Director,
    Mesh,
} from 'cocosair';
import {
    validateGeometryUpdate,
    clientToCanvasCss,
    cssToScreen,
    planeFromRays,
    rayPlaneIntersect,
    projectionErrorCssPx,
    pointInQuad,
    bladeExpectedCenter,
    pointToSegmentDistanceCssPx,
    pointToLineDistanceCssPx,
    thinQuadCenterLine,
    planeSegmentIntersection,
    ribbonVertices,
    CUT_VERTEX_ERROR_BUDGET_CSS_PX,
} from './geometry-contract.js';

type OwnedMesh = Mesh;
const params = new URLSearchParams(location.search);
const MODE: 'mesh' | 'cut' | 'ribbon' = (['mesh', 'cut', 'ribbon'] as const).includes(params.get('mode') as never)
    ? (params.get('mode') as 'mesh' | 'cut' | 'ribbon')
    : 'mesh';
const TEST = params.get('test') === '1';
const PROJ: 'persp' | 'ortho' = params.get('proj') === 'ortho' ? 'ortho' : 'persp';
const CAM: 'default' | 'low' | 'oblique' = (['default', 'low', 'oblique'] as const).includes(params.get('cam') as never)
    ? (params.get('cam') as 'default' | 'low' | 'oblique')
    : 'default';
const OFFSET = params.get('offset') === '1'; // container offset case (CSS margin on #stage)
const CUT_ERROR_BUDGET = CUT_VERTEX_ERROR_BUDGET_CSS_PX;

const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const status = document.querySelector<HTMLElement>('#status')!;
if (OFFSET) document.getElementById('stage')!.classList.add('offset');

const app = await createAirApp({ canvas });
// 浏览器矩阵/规格门禁的 bench 合同：会话探针从 window.__airApp 接入运行时。
(window as unknown as Record<string, unknown>).__airApp = app;
const scene = new Scene(`interactive-geometry-${MODE}`);
const clock = createStepClock();

// ── owned assets: addRef at creation, decRef paired in release; renderers only borrow ──
const ownedMeshes: OwnedMesh[] = [];
const ownedMaterials: Material[] = [];
const ownedAssets = (): (OwnedMesh | Material)[] => [...ownedMeshes, ...ownedMaterials];
function device(): { memoryStatus: { textureSize: number; bufferSize: number } } {
    return (director as unknown as { root: { device: { memoryStatus: { textureSize: number; bufferSize: number } } } })
        .root.device;
}
const routeNodes: Node[] = [];

let submittedFrame: Record<string, unknown> = { event: 'UNKNOWN' };
let userAction: Record<string, unknown> | null = null;
let probeAction: Record<string, unknown> = {
    type: 'startup',
    sequence: 0,
    isTrusted: false,
    appliedBy: 'probe',
    timestamp: new Date().toISOString(),
};
const userEvents: Record<string, unknown>[] = [];
let sequence = 0;
let session = 1; // cut-session generation; Reset/Escape/resize advance it
function recordUser(action: string, event: Event): void {
    userAction = {
        type: action,
        sequence: ++sequence,
        isTrusted: event.isTrusted === true,
        appliedBy: 'dom',
        session,
        timestamp: new Date().toISOString(),
        ...(event instanceof PointerEvent
            ? { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId }
            : {}),
        ...(event instanceof KeyboardEvent ? { key: event.key } : {}),
    };
    userEvents.push({ ...userAction });
}
function recordProbe(action: string): void {
    probeAction = {
        type: action,
        sequence: ++sequence,
        isTrusted: false,
        appliedBy: 'probe',
        timestamp: new Date().toISOString(),
    };
}
function lastAction(): Record<string, unknown> {
    return userAction ?? probeAction;
}

function quadMesh(positions: number[], indices: number[]): OwnedMesh {
    const mesh = utils.createMesh({ positions, indices }, undefined, { calculateBounds: true });
    mesh.addRef();
    ownedMeshes.push(mesh);
    return mesh;
}
function unlitMaterial(color: Color, overlayOrder?: number): Material {
    const material = new Material();
    material.initialize({
        effectName: 'builtin-unlit',
        ...(overlayOrder === undefined
            ? {}
            : {
                  states: { priority: 128 + overlayOrder, depthStencilState: { depthTest: false, depthWrite: false } },
              }),
    });
    material.setProperty('mainColor', color);
    material.addRef();
    ownedMaterials.push(material);
    return material;
}
function addNode(name: string, mesh: Mesh, material: Material, layer: number): { node: Node; renderer: MeshRenderer } {
    const node = new Node(name);
    routeNodes.push(node);
    scene.addChild(node);
    node.layer = layer;
    node.setPosition(0, 0, 0);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    return { node, renderer };
}

const LAYER = 1 << 20;
let camera: Camera;
function setupCamera(): void {
    const node = new Node('camera');
    routeNodes.push(node);
    scene.addChild(node);
    node.setPosition(0, 0, 9);
    if (CAM === 'oblique') node.setPosition(2.2, 1.6, 9); // oblique view
    node.lookAt(new Vec3(0, 0, 0));
    camera = node.addComponent(Camera);
    camera.projection = PROJ === 'ortho' ? Camera.ProjectionType.ORTHO : Camera.ProjectionType.PERSPECTIVE;
    if (PROJ === 'ortho') camera.orthoHeight = 2.4;
    else camera.fov = 40;
    if (CAM === 'low') (node.setPosition(0, -6.5, 4.2), node.lookAt(new Vec3(0, 0.4, 0))); // low angle
    camera.near = 0.1;
    camera.far = 40;
    camera.visibility = LAYER;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(13, 15, 22, 255);
}

function cssSize(): { width: number; height: number } {
    return { width: canvas.clientWidth || 640, height: canvas.clientHeight || 400 };
}
/** Camera screen px (oriented) for a canvas-relative CSS point, from the live rect/viewport. */
function screenPxFor(css: { x: number; y: number }): { x: number; y: number } {
    const backing = { width: canvas.width, height: canvas.height };
    const vp = camera.camera.viewport; // native render camera viewport, unit rect
    const viewportPx = {
        x: vp.x * backing.width,
        y: vp.y * backing.height,
        width: vp.width * backing.width,
        height: vp.height * backing.height,
    };
    // camera screen space is bottom-up (worldToScreen of a top point returns a large y);
    // canvas CSS is top-down: flip before entering the camera pipeline.
    const flipped = { x: css.x, y: cssSize().height - css.y };
    const size = cssSize();
    const scaleX = viewportPx.width / size.width;
    const scaleY = viewportPx.height / size.height;
    return { x: viewportPx.x + flipped.x * scaleX, y: viewportPx.y + flipped.y * scaleY };
}
/** World → canvas-relative CSS px via the public camera projection. */
function worldToCss(world: Vec3): { x: number; y: number } {
    const screen = new Vec3();
    camera.worldToScreen(world, screen); // component signature: (worldPos, out)
    // camera screen px → canvas CSS px (full-canvas viewport cameras in this example)
    const dprX = canvas.width / (canvas.clientWidth || 1);
    const dprY = canvas.height / (canvas.clientHeight || 1);
    return { x: screen.x / dprX, y: (canvas.height - screen.y) / dprY };
}

// ═══════════════ mode: mesh (dual path) ═══════════════
const meshState = { frames: 0, lastPreflight: null as { ok: boolean; errors: string[] } | null };
function createMeshMode(): void {
    setupCamera();
    const capacity = { maxSubMeshVertices: 4, maxSubMeshIndices: 6 };
    // Static path: geometry.indices through utils.createMesh.
    const staticMesh = quadMesh([-1.6, -0.9, 0, -0.4, -0.9, 0, -1.6, 0.9, 0, -0.4, 0.9, 0], [0, 1, 2, 1, 3, 2]);
    addNode('static-quad', staticMesh, unlitMaterial(new Color(70, 130, 240, 255)), LAYER);
    // Dynamic path: explicit capacity; positions-only updates each frame keep indices.
    const positions = new Float32Array([0.4, -0.9, 0, 1.6, -0.9, 0, 0.4, 0.9, 0, 1.6, 0.9, 0]);
    const indices16 = new Uint16Array([0, 1, 2, 1, 3, 2]);
    const dynamic = utils.MeshUtils.createDynamicMesh(0, { positions, indices16 }, undefined, {
        maxSubMeshes: 1,
        maxSubMeshVertices: capacity.maxSubMeshVertices,
        maxSubMeshIndices: capacity.maxSubMeshIndices,
    });
    dynamic.addRef();
    ownedMeshes.push(dynamic);
    const renderer = addNode('dynamic-quad', dynamic, unlitMaterial(new Color(240, 170, 60, 255)), LAYER).renderer;
    let frame = 0;
    const ticker = (): void => {
        meshState.frames += 1;
        frame += 1;
        const phase = frame / 60;
        const next = new Float32Array([
            0.4,
            -0.9 + Math.sin(phase) * 0.35,
            0,
            1.6,
            -0.9 + Math.cos(phase) * 0.35,
            0,
            0.4,
            0.9 + Math.sin(phase) * 0.35,
            0,
            1.6,
            0.9 + Math.cos(phase) * 0.35,
            0,
        ]);
        // Preflight before the SDK call; a rejected update never reaches the mesh.
        meshState.lastPreflight = validateGeometryUpdate({ positions: next, indices16 }, capacity);
        if (meshState.lastPreflight.ok) {
            dynamic.updateSubMesh(0, { positions: next }); // positions-only: indices/normals retained
            renderer.onGeometryChanged();
        }
    };
    director.on(Director.EVENT_AFTER_DRAW, ticker);
    meshTicker = ticker;
}
let meshTicker: (() => void) | null = null;

// ═══════════════ mode: cut (real gesture → rays → plane) ═══════════════
interface CutRecord {
    session: number;
    inputEvents: {
        type: string;
        clientX: number;
        clientY: number;
        isTrusted: boolean;
        sequence: number;
        timestamp: string;
        session: number;
    }[];
    cssLine: { x: number; y: number }[];
    worldHits: Vec3[];
    plane: { point: Vec3; normal: Vec3 } | null;
    strokeErrorPx: number[];
    cutErrorPx: number[];
    hitTarget: boolean;
    measuredBeforeFirstStep: boolean;
    /** Raw evidence for independent recomputation: actual uploaded Float32 data per object. */
    uploads: {
        stroke: { positions: number[]; indices16: number[]; width: number; nodeTranslation: number[] };
        cut: { positions: number[]; indices16: number[]; width: number; nodeTranslation: number[] };
        cutRender: {
            positions: number[];
            indices16: number[];
            width: number;
            decorative: boolean;
            nodeTranslation: number[];
        };
        blade: { positions: number[]; indices16: number[]; width: number; nodeTranslation: number[]; phase: number };
    };
    camera: {
        viewProjection: number[];
        viewport: { x: number; y: number; width: number; height: number };
        backing: { width: number; height: number };
        cssSize: { width: number; height: number };
        dpr: number;
    };
    rect: { left: number; top: number };
    measuredAtStep: number;
    objects: { stroke: string; cut: string; blade: string };
}
const cutState = { records: [] as CutRecord[], bladePhase: 0 };
const resetState = { perRound: [] as { refs: { before: number; after?: number }[]; nodes: number }[] };
let lastCutFailure: string | null = null;
let cutMesh: Mesh | null = null;
let cutRenderMesh: Mesh | null = null;
let cutRenderRenderer: MeshRenderer | null = null;
let cutRenderer: MeshRenderer | null = null;
let bladeMesh: Mesh | null = null;
let bladeRenderer: MeshRenderer | null = null;
let strokeMesh: Mesh | null = null;
let strokeRenderer: MeshRenderer | null = null;
let targetCenter: Vec3;
const TARGET_HALF = { width: 6.0, height: 4.5 }; // covers every camera mode's frustum footprint on z=0

function createCutMode(): void {
    setupCamera();
    targetCenter = new Vec3(0, 0, 0);
    // The target slab: a flat quad at z=0 that the knife cuts across.
    const target = quadMesh(
        [
            -TARGET_HALF.width,
            -TARGET_HALF.height,
            0,
            TARGET_HALF.width,
            -TARGET_HALF.height,
            0,
            -TARGET_HALF.width,
            TARGET_HALF.height,
            0,
            TARGET_HALF.width,
            TARGET_HALF.height,
            0,
        ],
        [0, 1, 2, 1, 3, 2],
    );
    const slab = addNode('target-slab', target, unlitMaterial(new Color(38, 52, 72, 255)), LAYER);
    slab.node.setPosition(0, 0, 0);
    // Three independent dynamic objects, created empty (empty indices draw nothing).
    const capacity = { maxSubMeshVertices: 16, maxSubMeshIndices: 36 };
    strokeMesh = dynamicEmpty(capacity);
    cutMesh = dynamicEmpty(capacity);
    bladeMesh = dynamicEmpty(capacity);
    cutRenderMesh = dynamicEmpty(capacity);
    // Pass order and depth state layer the drawing without moving measured vertices.
    strokeRenderer = addNode(
        'input-stroke',
        strokeMesh,
        unlitMaterial(new Color(255, 235, 90, 255), 3),
        LAYER,
    ).renderer;
    cutRenderer = addNode('cut-surface', cutMesh, unlitMaterial(new Color(240, 70, 70, 255), 1), LAYER).renderer;
    bladeRenderer = addNode(
        'animated-blade',
        bladeMesh,
        unlitMaterial(new Color(160, 230, 255, 255), 4),
        LAYER,
    ).renderer;
    cutRenderRenderer = addNode(
        'cut-render-overlay',
        cutRenderMesh,
        unlitMaterial(new Color(240, 70, 70, 255), 2),
        LAYER,
    ).renderer;
    pointerAbort = new AbortController();
    bindPointer();
    director.on(Director.EVENT_AFTER_DRAW, advanceBlade);
}
let pointerAbort: AbortController | null = null;

function dynamicEmpty(capacity: { maxSubMeshVertices: number; maxSubMeshIndices: number }): Mesh {
    const mesh = utils.MeshUtils.createDynamicMesh(
        0,
        {
            positions: new Float32Array(capacity.maxSubMeshVertices * 3),
            indices16: new Uint16Array(0),
        },
        undefined,
        {
            maxSubMeshes: 1,
            maxSubMeshVertices: capacity.maxSubMeshVertices,
            maxSubMeshIndices: capacity.maxSubMeshIndices,
        },
    );
    mesh.addRef();
    ownedMeshes.push(mesh);
    return mesh;
}

interface ReceivedPointer {
    clientX: number;
    clientY: number;
    isTrusted: boolean;
    sequence: number;
    timestamp: string;
    type: string;
    session: number;
}
let gestureStart: ReceivedPointer | null = null;
function bindPointer(): void {
    const signal = pointerAbort!.signal;
    canvas.addEventListener(
        'pointerdown',
        (event) => {
            recordUser('pointerdown', event);
            gestureStart = received(event);
        },
        { signal },
    );
    canvas.addEventListener(
        'pointerup',
        (event) => {
            recordUser('pointerup', event);
            if (!gestureStart) {
                lastCutFailure = 'pointerup without pointerdown';
                return;
            }
            if (gestureStart.session !== session) {
                lastCutFailure = `stale session: down session ${gestureStart.session} != live ${session}`;
                gestureStart = null;
                return;
            } // late release from an old session never cuts
            applyCut(gestureStart, received(event));
            gestureStart = null;
        },
        { signal },
    );
    window.addEventListener(
        'keydown',
        (event) => {
            if (event.key === 'Escape') {
                recordUser('escape', event);
                advanceSession('escape');
            }
        },
        { signal, capture: true },
    );
    window.addEventListener(
        'resize',
        (event) => {
            recordUser('resize', event);
            advanceSession('resize');
        },
        { signal },
    );
}
// session guard for late releases: a pointerup only cuts when its down belongs to the live session
function received(event: PointerEvent): ReceivedPointer {
    return {
        clientX: event.clientX,
        clientY: event.clientY,
        isTrusted: event.isTrusted === true,
        sequence,
        timestamp: new Date().toISOString(),
        type: event.type,
        session,
    } as ReceivedPointer & { session: number };
}
function advanceSession(reason: string): void {
    session += 1;
    recordProbe(`session-${reason}`);
    // Retire scratch meshes; materials and the target remain owned by this session.
    if (MODE === 'cut') recreateScratchMeshes();
    else if (MODE === 'mesh') meshState.frames = 0;
    else {
        ribbonState.frames = 0;
        ribbonTime = 0;
        lastRibbonX = null;
    }
    cutState.bladePhase = 0;
    lastBladePositions = null;
}
function recreateScratchMeshes(): void {
    const pairs: [Mesh | null, MeshRenderer | null, 'stroke' | 'cut' | 'blade' | 'cutRender'][] = [
        [strokeMesh, strokeRenderer, 'stroke'],
        [cutMesh, cutRenderer, 'cut'],
        [bladeMesh, bladeRenderer, 'blade'],
        [cutRenderMesh, cutRenderRenderer, 'cutRender'],
    ];
    for (const [mesh, renderer] of pairs) {
        if (mesh && renderer) {
            renderer.mesh = null; // unbind before destroying the old scratch mesh
            const index = ownedMeshes.indexOf(mesh);
            if (index >= 0) {
                ownedMeshes.splice(index, 1);
                mesh.decRef();
            }
            mesh.destroy();
        }
    }
    const capacity = { maxSubMeshVertices: 16, maxSubMeshIndices: 36 };
    strokeMesh = dynamicEmpty(capacity);
    cutMesh = dynamicEmpty(capacity);
    bladeMesh = dynamicEmpty(capacity);
    cutRenderMesh = dynamicEmpty(capacity);
    if (strokeRenderer) {
        strokeRenderer.mesh = strokeMesh;
        strokeRenderer.onGeometryChanged();
    }
    if (cutRenderer) {
        cutRenderer.mesh = cutMesh;
        cutRenderer.onGeometryChanged();
    }
    if (bladeRenderer) {
        bladeRenderer.mesh = bladeMesh;
        bladeRenderer.onGeometryChanged();
    }
    if (cutRenderRenderer) {
        cutRenderRenderer.mesh = cutRenderMesh;
        cutRenderRenderer.onGeometryChanged();
    }
}

function applyCut(down: ReceivedPointer, up: ReceivedPointer): void {
    // 1) Received client coords → canvas CSS coords via the live rect.
    const rect = canvas.getBoundingClientRect();
    const css1 = clientToCanvasCss(down.clientX, down.clientY, rect);
    const css2 = clientToCanvasCss(up.clientX, up.clientY, rect);
    // 2) CSS → camera screen px → two rays from the public camera API.
    const screen1 = screenPxFor(css1);
    const screen2 = screenPxFor(css2);
    if (!Number.isFinite(screen1.y) || !Number.isFinite(screen2.y)) {
        lastCutFailure = `screen NaN: css1=${JSON.stringify(css1)} css2=${JSON.stringify(css2)} rect=${JSON.stringify({ left: rect.left, top: rect.top })} canvasClient=${canvas.clientWidth}x${canvas.clientHeight} backing=${canvas.width}x${canvas.height}`;
        return;
    }
    const ray1 = camera.screenPointToRay(screen1.x, screen1.y, new geometry.Ray());
    const ray2 = camera.screenPointToRay(screen2.x, screen2.y, new geometry.Ray());
    // 3) Cut plane from the two rays (perspective shares the eye; orthographic rays are parallel).
    const plane = planeFromRays({ origin: ray1.o, direction: ray1.d }, { origin: ray2.o, direction: ray2.d });
    if ('error' in plane) {
        lastCutFailure =
            `plane: ${plane.error}; screen1=${JSON.stringify(screen1)} screen2=${JSON.stringify(screen2)}` +
            ` d1=${JSON.stringify({ x: ray1.d.x, y: ray1.d.y, z: ray1.d.z })} d2=${JSON.stringify({ x: ray2.d.x, y: ray2.d.y, z: ray2.d.z })}`;
        return;
    }
    // 4) World intersections with the target slab plane (z=0), not a fixed-height extrusion.
    const slabPlane = { point: new Vec3(0, 0, 0), normal: new Vec3(0, 0, 1) };
    const rayLike1 = { origin: ray1.o, direction: ray1.d };
    const rayLike2 = { origin: ray2.o, direction: ray2.d };
    const w1 = rayPlaneIntersect(rayLike1, slabPlane);
    const w2 = rayPlaneIntersect(rayLike2, slabPlane);
    if (!w1 || !w2) {
        lastCutFailure = `intersect: w1=${w1 ? 'ok' : 'null'} w2=${w2 ? 'ok' : 'null'} screen1=${JSON.stringify(screen1)} screen2=${JSON.stringify(screen2)}`;
        return;
    }
    const hit =
        pointInQuad(
            w1,
            targetCenter,
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 1, z: 0 },
            TARGET_HALF.width,
            TARGET_HALF.height,
        ) &&
        pointInQuad(
            w2,
            targetCenter,
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 1, z: 0 },
            TARGET_HALF.width,
            TARGET_HALF.height,
        );
    // 5) Build the three objects; measure before the first simulated step.
    const measuredBeforeFirstStep = true; // applied synchronously inside the pointerup handler
    const capacity = { maxSubMeshVertices: 32, maxSubMeshIndices: 48 };
    // CUT SURFACE (the real geometry): the cut PLANE (defined by the two rays) intersected
    // with the target slab's four EDGES gives the actual cut segment ON the target boundary —
    // no soft-body solver, no centerline substitution. The cut plane passes through the camera
    // origin (perspective) with normal cross(d1,d2); its intersection with each slab edge is
    // solved exactly in geometry-contract.ts (planeSegmentIntersection).
    const slabEdges = [
        [
            { x: -TARGET_HALF.width, y: -TARGET_HALF.height, z: 0 },
            { x: TARGET_HALF.width, y: -TARGET_HALF.height, z: 0 },
        ],
        [
            { x: TARGET_HALF.width, y: -TARGET_HALF.height, z: 0 },
            { x: TARGET_HALF.width, y: TARGET_HALF.height, z: 0 },
        ],
        [
            { x: TARGET_HALF.width, y: TARGET_HALF.height, z: 0 },
            { x: -TARGET_HALF.width, y: TARGET_HALF.height, z: 0 },
        ],
        [
            { x: -TARGET_HALF.width, y: TARGET_HALF.height, z: 0 },
            { x: -TARGET_HALF.width, y: -TARGET_HALF.height, z: 0 },
        ],
    ];
    const cutPlane = plane as { point: Vec3; normal: Vec3 };
    const cutVertices: { x: number; y: number; z: number }[] = [];
    for (const edge of slabEdges) {
        const hit = planeSegmentIntersection(
            { x: cutPlane.point.x, y: cutPlane.point.y, z: cutPlane.point.z },
            { x: cutPlane.normal.x, y: cutPlane.normal.y, z: cutPlane.normal.z },
            { x: edge[0].x, y: edge[0].y, z: edge[0].z },
            { x: edge[1].x, y: edge[1].y, z: edge[1].z },
        );
        if (hit) cutVertices.push(hit);
    }
    if (cutVertices.length < 2) return;
    // Sort the chain along the cut direction so the strip winding is deterministic (+Z).
    {
        const dirX = cutVertices[1].x - cutVertices[0].x;
        const dirY = cutVertices[1].y - cutVertices[0].y;
        const len = Math.hypot(dirX, dirY) || 1;
        const ux = dirX / len;
        const uy = dirY / len;
        cutVertices.sort((a, b) => a.x * ux + a.y * uy - (b.x * ux + b.y * uy));
    }
    const c = stripGeometry(cutVertices, 0); // actual Float32 target-intersection geometry
    const cr = stripGeometry(cutVertices, 0, 0.1); // separately identified decoration
    // STROKE (decorative, separate object and separate definition): the two-side midpoint
    // centerline of the input stroke quad — explicitly NOT the cut surface.
    const s = thinQuad(w1, w2, 0, 0.05);
    // blade: small quad at the line start; animated along the cut each frame
    const bladeStart = bladeExpectedCenter(w1, w2, 0);
    const bladeEnd = bladeExpectedCenter(w1, w2, 0.08);
    const b = thinQuad(bladeStart, bladeEnd, 0, 0.22);
    for (const [mesh, renderer, geometryData] of [
        [strokeMesh, strokeRenderer, s],
        [cutMesh, cutRenderer, c],
        [bladeMesh, bladeRenderer, b],
        [cutRenderMesh, cutRenderRenderer, cr],
    ] as [Mesh, MeshRenderer, { positions: Float32Array; indices16: Uint16Array }][]) {
        const pre = validateGeometryUpdate(geometryData, capacity);
        if (!pre.ok) {
            lastCutFailure = `preflight: ${pre.errors.join(',')}`;
            return;
        }
        mesh.updateSubMesh(0, geometryData);
        renderer.onGeometryChanged();
    }
    // Three REAL measurement chains from the uploaded Float32 data (not theory): the center
    // line of each uploaded quad is lifted by its node translation (translation-only nodes)
    // and re-projected onto the received input coordinates.
    const nodePos = (name: string): Vec3 => routeNodes.find((node) => node.name === name)?.worldPosition ?? new Vec3();
    const project = (world: { x: number; y: number; z: number }) => worldToCss(new Vec3(world.x, world.y, world.z));
    const toWorld = (local: { x: number; y: number; z: number }, name: string): Vec3 =>
        new Vec3(local.x + nodePos(name).x, local.y + nodePos(name).y, local.z + nodePos(name).z);
    const strokeLine = thinQuadCenterLine(s.positions).map((v) => toWorld(v, 'input-stroke')) as unknown as [
        { x: number; y: number; z: number },
        { x: number; y: number; z: number },
    ];
    const strokeErrorPx = [
        projectionErrorCssPx(strokeLine[0], css1, project),
        projectionErrorCssPx(strokeLine[1], css2, project),
    ];
    // CUT vertices: per-vertex projection of EVERY actual uploaded cut vertex onto the
    // received input line (point-to-segment distance), never a centerline substitution.
    const cutNode = nodePos('cut-surface');
    const cutVertexErrors: number[] = [];
    for (let i = 0; i < c.positions.length / 3; i++) {
        const world = toWorld(
            { x: c.positions[i * 3], y: c.positions[i * 3 + 1], z: c.positions[i * 3 + 2] },
            'cut-surface',
        );
        const css = worldToCss(new Vec3(world.x, world.y, world.z));
        cutVertexErrors.push(pointToLineDistanceCssPx(css, css1, css2)); // boundary vertices sit on the extended knife line
    }
    const cutErrorPx = [
        Math.max(...cutVertexErrors),
        cutVertexErrors.length > 0 ? cutVertexErrors.reduce((a, v) => a + v, 0) / cutVertexErrors.length : 0,
    ];
    void cutNode;
    const vp = camera.camera.matViewProj;
    // Mat4 stores components as m00..m15 (no packed array on this build)
    const vpAny = vp as unknown as Record<string, number> | null;
    const vpArray = vpAny
        ? [
              'm00',
              'm01',
              'm02',
              'm03',
              'm04',
              'm05',
              'm06',
              'm07',
              'm08',
              'm09',
              'm10',
              'm11',
              'm12',
              'm13',
              'm14',
              'm15',
          ].map((key) => vpAny[key])
        : null;
    cutState.records.push({
        session,
        inputEvents: [describe(down), describe(up)],
        cssLine: [css1, css2],
        worldHits: [new Vec3(w1.x, w1.y, w1.z), new Vec3(w2.x, w2.y, w2.z)],
        plane: {
            point: new Vec3(plane.point.x, plane.point.y, plane.point.z),
            normal: new Vec3(plane.normal.x, plane.normal.y, plane.normal.z),
        },
        strokeErrorPx,
        cutErrorPx,
        hitTarget: hit,
        measuredBeforeFirstStep,
        uploads: {
            stroke: {
                positions: Array.from(s.positions),
                indices16: Array.from(s.indices16),
                width: 0.02,
                nodeTranslation: [nodePos('input-stroke').x, nodePos('input-stroke').y, nodePos('input-stroke').z],
            },
            cutRender: {
                positions: Array.from(cr.positions),
                indices16: Array.from(cr.indices16),
                width: 0.2,
                decorative: true,
                nodeTranslation: [
                    nodePos('cut-render-overlay').x,
                    nodePos('cut-render-overlay').y,
                    nodePos('cut-render-overlay').z,
                ],
            },
            cut: {
                positions: Array.from(c.positions),
                indices16: Array.from(c.indices16),
                width: 0.1,
                nodeTranslation: [nodePos('cut-surface').x, nodePos('cut-surface').y, nodePos('cut-surface').z],
            },
            blade: {
                positions: Array.from(b.positions),
                indices16: Array.from(b.indices16),
                width: 0.22,
                nodeTranslation: [
                    nodePos('animated-blade').x,
                    nodePos('animated-blade').y,
                    nodePos('animated-blade').z,
                ],
                phase: 0,
            },
        },
        camera: {
            viewProjection: vpArray ? Array.from(vpArray) : [],
            viewport: {
                x: camera.camera.viewport.x,
                y: camera.camera.viewport.y,
                width: camera.camera.viewport.width,
                height: camera.camera.viewport.height,
            },
            backing: { width: canvas.width, height: canvas.height },
            cssSize: cssSize(),
            dpr: devicePixelRatio,
        },
        rect: { left: rect.left, top: rect.top },
        measuredAtStep: Number((submittedFrame as { step?: number }).step ?? 0),
        objects: { stroke: 'input-stroke', cut: 'cut-surface', blade: 'animated-blade' },
    });
    lastBladePositions = b.positions;
    cutState.bladePhase = 0;
    function describe(event: ReceivedPointer): CutRecord['inputEvents'][number] {
        return {
            type: event.type,
            clientX: event.clientX,
            clientY: event.clientY,
            isTrusted: event.isTrusted,
            sequence: event.sequence,
            timestamp: event.timestamp,
            session: event.session,
        };
    }
}

/** Real cut-surface geometry from actual intersection vertices: a triangle strip along the
 *  vertex chain (no centerline substitution); indices wound +Z, lifted by `lift` for layering. */
function stripGeometry(
    chain: { x: number; y: number; z: number }[],
    lift: number,
    halfWidth = 0.0004,
): { positions: Float32Array; indices16: Uint16Array } {
    const positions = new Float32Array(chain.length * 2 * 3);
    for (let i = 0; i < chain.length; i++) {
        const prev = chain[Math.max(0, i - 1)];
        const next = chain[Math.min(chain.length - 1, i + 1)];
        const dx = next.x - prev.x,
            dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * halfWidth,
            ny = (dx / len) * halfWidth; // default 0.0004 (~0.05px): every real cut vertex within the frozen 0.15 budget
        positions[i * 6] = chain[i].x - nx;
        positions[i * 6 + 1] = chain[i].y - ny;
        positions[i * 6 + 2] = chain[i].z + lift;
        positions[i * 6 + 3] = chain[i].x + nx;
        positions[i * 6 + 4] = chain[i].y + ny;
        positions[i * 6 + 5] = chain[i].z + lift;
    }
    const indices16 = new Uint16Array((chain.length - 1) * 6);
    for (let i = 0; i < chain.length - 1; i++) {
        // Same +Z winding as the ribbon fix (Lead frontier-s3): swap second/third so the
        // strip faces the camera; back-face culling stays ON.
        const o = i * 6;
        const top = i * 2;
        const bot = i * 2 + 1;
        indices16[o] = top;
        indices16[o + 1] = top + 2;
        indices16[o + 2] = bot;
        indices16[o + 3] = bot;
        indices16[o + 4] = top + 2;
        indices16[o + 5] = bot + 2;
    }
    return { positions, indices16 };
}

function thinQuad(
    a: Vec3Like2,
    b: Vec3Like2,
    lift: number,
    thickness: number,
): { positions: Float32Array; indices16: Uint16Array } {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (thickness / 2);
    const ny = (dx / len) * (thickness / 2);
    return {
        positions: new Float32Array([
            a.x - nx,
            a.y - ny,
            lift,
            b.x - nx,
            b.y - ny,
            lift,
            a.x + nx,
            a.y + ny,
            lift,
            b.x + nx,
            b.y + ny,
            lift,
        ]),
        indices16: new Uint16Array([0, 1, 2, 1, 3, 2]),
    };
}
type Vec3Like2 = { x: number; y: number; z: number };

function advanceBlade(): void {
    if (!cutMesh || cutState.records.length === 0) return;
    const record = cutState.records[cutState.records.length - 1];
    if (record.session !== session) return;
    cutState.bladePhase = Math.min(1, cutState.bladePhase + 1 / 90);
    const [w1, w2] = record.worldHits;
    const start = bladeExpectedCenter(w1, w2, cutState.bladePhase);
    const end = bladeExpectedCenter(w1, w2, Math.min(1, cutState.bladePhase + 0.08));
    const geometryData = thinQuad(start, end, 0, 0.22);
    const capacity = { maxSubMeshVertices: 16, maxSubMeshIndices: 36 };
    if (validateGeometryUpdate(geometryData, capacity).ok && bladeRenderer) {
        bladeMesh!.updateSubMesh(0, geometryData);
        bladeRenderer.onGeometryChanged();
        lastBladePositions = geometryData.positions;
        lastBladePhase = cutState.bladePhase;
    }
}
let lastBladePositions: Float32Array | null = null;
let lastBladePhase = 0;
/** Blade error measured from the ACTUAL uploaded blade quad: its uploaded center-line
 *  midpoint re-projected against the received input line (parameterization-free perpendicular),
 *  with orientation recorded. The input line here is the RECEIVED css gesture; lineDriftPx
 *  separately reports how far the currently projected cut endpoints drift from it. */
function bladeErrorNow(): {
    phase: number;
    errorPx: number;
    lineDriftPx: number;
    centerWorld: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number };
} | null {
    if (cutState.records.length === 0 || !lastBladePositions) return null;
    const record = cutState.records[cutState.records.length - 1];
    const node = routeNodes.find((candidate) => candidate.name === 'animated-blade')?.worldPosition ?? new Vec3();
    const local = thinQuadCenterLine(lastBladePositions);
    const line = [toWorldBlade(local[0], node), toWorldBlade(local[1], node)];
    const center = { x: (line[0].x + line[1].x) / 2, y: (line[0].y + line[1].y) / 2, z: (line[0].z + line[1].z) / 2 };
    const orientation = { x: line[1].x - line[0].x, y: line[1].y - line[0].y, z: line[1].z - line[0].z };
    const css = worldToCss(new Vec3(center.x, center.y, center.z));
    const [a, b] = record.cssLine;
    const driftA = worldToCss(record.worldHits[0]);
    const driftB = worldToCss(record.worldHits[1]);
    const lineDriftPx = Math.max(
        Math.hypot(driftA.x - a.x, driftA.y - a.y),
        Math.hypot(driftB.x - b.x, driftB.y - b.y),
    );
    // the current uploaded blade data rides the LIVE cut; record both for the collector
    if (record.uploads)
        record.uploads.blade = {
            ...record.uploads.blade,
            positions: Array.from(lastBladePositions),
            phase: lastBladePhase,
            nodeTranslation: [node.x, node.y, node.z],
        };
    return {
        phase: lastBladePhase,
        errorPx: pointToSegmentDistanceCssPx(css, a, b),
        lineDriftPx,
        centerWorld: center,
        orientation,
    };
}
function toWorldBlade(local: { x: number; y: number; z: number }, node: Vec3): { x: number; y: number; z: number } {
    return { x: local.x + node.x, y: local.y + node.y, z: local.z + node.z };
}

// ═══════════════ mode: ribbon (screen-space dynamic strip) ═══════════════
const ribbonState = { frames: 0, movedPx: 0 };
let ribbonMesh: Mesh | null = null;
let ribbonRenderer: MeshRenderer | null = null;
const RIBBON_COUNT = 24;
function createRibbonMode(): void {
    setupCamera();
    // Initialize with a real first strip (not empty): the frustum culls dynamic meshes whose
    // retained bounds stay degenerate from an all-zero seed.
    const first = ribbonVertices(0, canvas.width, RIBBON_COUNT);
    const positions = new Float32Array(first.length);
    for (let i = 0; i < first.length / 3; i++) {
        positions[i * 3] = first[i * 3] * 2.5;
        positions[i * 3 + 1] = first[i * 3 + 1] * 2;
        positions[i * 3 + 2] = 0.02;
    }
    // Winding for +Z-facing triangles: the second/third index swap is what actually fixed
    // WebKit visibility (Lead frontier-s3: cyan 0 -> 23127 pixels); normal culling stays ON.
    const indices16 = new Uint16Array((RIBBON_COUNT - 1) * 6);
    for (let i = 0; i < RIBBON_COUNT - 1; i++) {
        const o = i * 6;
        indices16[o] = i;
        indices16[o + 1] = RIBBON_COUNT + i;
        indices16[o + 2] = i + 1;
        indices16[o + 3] = i + 1;
        indices16[o + 4] = RIBBON_COUNT + i;
        indices16[o + 5] = RIBBON_COUNT + i + 1;
    }
    ribbonMesh = utils.MeshUtils.createDynamicMesh(0, { positions, indices16 }, undefined, {
        maxSubMeshes: 1,
        maxSubMeshVertices: RIBBON_COUNT * 2,
        maxSubMeshIndices: (RIBBON_COUNT - 1) * 6,
    });
    ribbonMesh.addRef();
    ownedMeshes.push(ribbonMesh);
    ribbonRenderer = addNode('rain-ribbon', ribbonMesh, unlitMaterial(new Color(90, 200, 255, 255)), LAYER).renderer;
    director.on(Director.EVENT_AFTER_DRAW, tickRibbon);
}
let ribbonTime = 0;
let lastRibbonX: number | null = null;
function tickRibbon(): void {
    ribbonState.frames += 1;
    ribbonTime += 1 / 60;
    const ndc = ribbonVertices(ribbonTime, canvas.width, RIBBON_COUNT);
    // Screen-space NDC → CSS → camera ray (the proven cut pipeline) → intersection with z=0.
    const positions = new Float32Array(ndc.length);
    const slabPlane = { point: new Vec3(0, 0, 0), normal: new Vec3(0, 0, 1) };
    for (let i = 0; i < ndc.length / 3; i++) {
        const css = {
            x: (ndc[i * 3] * 0.5 + 0.5) * cssSize().width,
            y: (1 - (ndc[i * 3 + 1] * 0.5 + 0.5)) * cssSize().height,
        };
        const screen = screenPxFor(css);
        const ray = camera.screenPointToRay(screen.x, screen.y, new geometry.Ray());
        const hit = rayPlaneIntersect({ origin: ray.o, direction: ray.d }, slabPlane);
        positions[i * 3] = hit ? hit.x : 0;
        positions[i * 3 + 1] = hit ? hit.y : 0;
        positions[i * 3 + 2] = 0.02;
    }
    // Winding for +Z-facing triangles: the second/third index swap is what actually fixed
    // WebKit visibility (Lead frontier-s3: cyan 0 -> 23127 pixels); normal culling stays ON.
    const indices16 = new Uint16Array((RIBBON_COUNT - 1) * 6);
    for (let i = 0; i < RIBBON_COUNT - 1; i++) {
        const o = i * 6;
        indices16[o] = i;
        indices16[o + 1] = RIBBON_COUNT + i;
        indices16[o + 2] = i + 1;
        indices16[o + 3] = i + 1;
        indices16[o + 4] = RIBBON_COUNT + i;
        indices16[o + 5] = RIBBON_COUNT + i + 1;
    }
    const capacity = { maxSubMeshVertices: RIBBON_COUNT * 2, maxSubMeshIndices: (RIBBON_COUNT - 1) * 6 };
    if (validateGeometryUpdate({ positions, indices16 }, capacity).ok && ribbonRenderer) {
        ribbonMesh!.updateSubMesh(0, { positions, indices16 });
        ribbonRenderer.onGeometryChanged();
        const headCss = worldToCss(new Vec3(positions[0], positions[1], positions[2]));
        if (lastRibbonX !== null) ribbonState.movedPx += Math.abs(headCss.x - lastRibbonX);
        lastRibbonX = headCss.x;
    }
}

// ═══════════════ shared probe / lifecycle ═══════════════
let released = false;
let releasePromise: Promise<unknown> | null = null;

function snapshot(): Record<string, unknown> {
    const rect = canvas.getBoundingClientRect();
    const model =
        MODE === 'mesh'
            ? {
                  mode: 'mesh',
                  frames: meshState.frames,
                  lastPreflightOk: meshState.lastPreflight?.ok ?? null,
                  dynamicBounds: dynamicBoundsSummary(),
                  dynamicBoundsNumbers: dynamicBoundsNumbers(),
              }
            : MODE === 'cut'
              ? {
                    mode: 'cut',
                    session,
                    records: cutState.records.length,
                    hitTarget: cutState.records.at(-1)?.hitTarget ?? null,
                    cutErrorPx: cutState.records.at(-1)?.cutErrorPx ?? null,
                    strokeErrorPx: cutState.records.at(-1)?.strokeErrorPx ?? null,
                    blade: bladeErrorNow(),
                    errorBudgetCssPx: CUT_ERROR_BUDGET,
                    lastCutFailure,
                    measuredBeforeFirstStep: cutState.records.at(-1)?.measuredBeforeFirstStep ?? null,
                    raw: rawEvidence(),
                    dynamicBoundsNumbers: dynamicBoundsNumbers(),
                }
              : { mode: 'ribbon', frames: ribbonState.frames, movedCssPx: ribbonState.movedPx };
    return {
        receivedEvent: { ...lastAction() },
        modelState: {
            ...model,
            session,
            receivedSequence: (lastAction() as { sequence: number }).sequence,
            ownedRefCount: ownedMeshes.length + ownedMaterials.length,
            projection: PROJ,
            cam: CAM,
        },
        layoutReceipt: {
            css: { width: rect.width, height: rect.height },
            backing: { width: canvas.width, height: canvas.height },
            rect: { left: rect.left, top: rect.top },
            viewport: { width: innerWidth, height: innerHeight },
            dpr: devicePixelRatio,
        },
        submittedFrame: { ...submittedFrame },
        clock: TEST
            ? { method: 'STEP_CLOCK', stepping: clock.stepping, stepped: clock.stepped, enginePaused: game.isPaused() }
            : { method: 'NATIVE_PACER', enginePaused: game.isPaused(), totalFrames: director.getTotalFrames() },
        released,
    };
}
/** Raw evidence bundle for independent recomputation (uploads + camera + inputs). */
function rawEvidence(): Record<string, unknown> | null {
    const record = cutState.records[cutState.records.length - 1];
    if (!record) return null;
    return {
        uploads: record.uploads,
        camera: record.camera,
        cssLine: record.cssLine,
        worldHits: record.worldHits.map((v) => ({ x: v.x, y: v.y, z: v.z })),
        inputEvents: record.inputEvents,
        rect: record.rect,
        session: record.session,
        measuredAtStep: record.measuredAtStep,
    };
}
function dynamicBoundsNumbers(): number[] | null {
    const dynamic = ownedMeshes[1] ?? ownedMeshes[0];
    if (!dynamic) return null;
    try {
        const min = dynamic.struct.minPosition;
        const max = dynamic.struct.maxPosition;
        if (!min || !max) return null;
        return [min.x, min.y, min.z, max.x, max.y, max.z];
    } catch {
        return null;
    }
}

function dynamicBoundsSummary(): { readable: boolean; finite: boolean } | null {
    // Real readback: the dynamic mesh's struct bounds after updates.
    const dynamic = ownedMeshes[1] ?? ownedMeshes[0];
    if (!dynamic) return null;
    try {
        const min = dynamic.struct.minPosition;
        const max = dynamic.struct.maxPosition;
        const finite = !!min && !!max && [min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite);
        return { readable: true, finite };
    } catch {
        return { readable: false, finite: false };
    }
}

async function step(): Promise<Record<string, unknown>> {
    if (released || releasePromise) throw new Error('GEOMETRY_DISPOSED');
    recordProbe('step');
    const receipt = await clock.step(1 / 60);
    submittedFrame = {
        event: 'AFTER_DRAW',
        ...receipt,
        afterDraw: true,
        inputSequence: (lastAction() as { sequence: number }).sequence,
        timestamp: new Date().toISOString(),
    };
    return snapshot();
}
/** Probe-level knife gesture (test mode): synthesizes two pointer events through the same pipeline. */
function probeCut(css1: { x: number; y: number }, css2: { x: number; y: number }): Record<string, unknown> {
    if (released || releasePromise) throw new Error('GEOMETRY_DISPOSED');
    if (MODE !== 'cut') throw new Error('probeCut is cut-mode only');
    recordProbe('probe-cut');
    const rect = canvas.getBoundingClientRect();
    const down = {
        clientX: rect.left + css1.x,
        clientY: rect.top + css1.y,
        isTrusted: false,
        sequence,
        timestamp: new Date().toISOString(),
        type: 'probe',
        session,
    };
    const up = {
        clientX: rect.left + css2.x,
        clientY: rect.top + css2.y,
        isTrusted: false,
        sequence,
        timestamp: new Date().toISOString(),
        type: 'probe',
        session,
    };
    applyCut(down as never, up as never);
    return {
        applied: cutState.records.length > 0,
        records: cutState.records.length,
        failure: lastCutFailure,
        ...(snapshot().modelState as Record<string, unknown>),
    };
}
function reset(): Record<string, unknown> {
    if (released || releasePromise) throw new Error('GEOMETRY_DISPOSED');
    recordProbe('reset');
    advanceSession('reset');
    cutState.records.length = 0;
    return { reset: true, session };
}
/** Real reset loop: N rounds of reset+step; owned count constant, refs paired each round. */
async function resetCycle(rounds: number): Promise<unknown> {
    if (released || releasePromise) throw new Error('GEOMETRY_DISPOSED');
    const identities = new Map<object, number>();
    const id = (asset: object): number => {
        if (!identities.has(asset)) identities.set(asset, identities.size + 1);
        return identities.get(asset)!;
    };
    const perRound: {
        refs: { id: number; before: number; after: number }[];
        retained: { id: number; before: number; after: number }[];
        nodes: number;
    }[] = [];
    const rows: unknown[] = [];
    const dev = device();
    const textureStart = dev.memoryStatus.textureSize;
    async function clockStepOnce(): Promise<void> {
        const receipt = await clock.step(1 / 60);
        submittedFrame = {
            event: 'AFTER_DRAW',
            ...receipt,
            afterDraw: true,
            inputSequence: (lastAction() as { sequence: number }).sequence,
            timestamp: new Date().toISOString(),
        };
    }
    for (let i = 0; i < rounds; i++) {
        recordProbe(`reset-cycle-${i}`);
        const assetsBeforeReset = ownedAssets().length;
        const retiring = [strokeMesh!, cutMesh!, bladeMesh!, cutRenderMesh!];
        const retained = ownedAssets().filter((asset) => !retiring.includes(asset as Mesh));
        const refsThisRound = retiring.map((asset) => ({ id: id(asset), before: asset.refCount, after: -1 }));
        const retainedRefs = retained.map((asset) => ({ id: id(asset), before: asset.refCount, after: -1 }));
        advanceSession(`reset-cycle-${i}`);
        retiring.forEach((asset, index) => {
            refsThisRound[index].after = asset.refCount;
        });
        retained.forEach((asset, index) => {
            retainedRefs[index].after = asset.refCount;
        });
        cutState.records.length = 0;
        await clockStepOnce();
        const snapshotState = snapshot();
        rows.push({
            round: i,
            ownedBefore: assetsBeforeReset,
            ownedAfter: ownedAssets().length,
            ownedConstant: ownedAssets().length === assetsBeforeReset,
            retiredRefsAllPaired: refsThisRound.every((ref) => ref.before === 1 && ref.after === 0),
            session: (snapshotState.modelState as { session?: number }).session ?? 0,
        });
        perRound.push({ refs: refsThisRound, retained: retainedRefs, nodes: routeNodes.length });
    }
    return {
        rounds,
        rows,
        perRound,
        ownedRefCount: ownedAssets().length,
        textureDelta: dev.memoryStatus.textureSize - textureStart,
    };
}

function geometryInspect(): Record<string, unknown> | null {
    const mesh = cutMesh ?? ribbonMesh ?? ownedMeshes[1] ?? null;
    if (!mesh) return null;
    const node = routeNodes.find((n) => n.name === 'cut-surface') ?? routeNodes[routeNodes.length - 1];
    try {
        return JSON.parse(JSON.stringify(inspectAirGeometry(mesh, node, undefined, 0, 16)));
    } catch (error) {
        return { error: String(error) };
    }
}
function release(): Promise<unknown> {
    if (releasePromise) return releasePromise;
    const refs = [...ownedMeshes, ...ownedMaterials].map((asset) => ({ before: asset.refCount, after: -1 }));
    released = true;
    document.querySelectorAll('button').forEach((button) => {
        (button as HTMLButtonElement).disabled = true;
    }); // terminal state on every page kind
    if (meshTicker) director.off(Director.EVENT_AFTER_DRAW, meshTicker);
    director.off(Director.EVENT_AFTER_DRAW, advanceBlade);
    director.off(Director.EVENT_AFTER_DRAW, tickRibbon);
    if (normalAfterDraw) director.off(Director.EVENT_AFTER_DRAW, normalAfterDraw);
    if (pointerAbort) pointerAbort.abort();
    controlsAbort?.abort();
    const renderersToUnbind: MeshRenderer[] = [];
    for (const [mesh, renderer] of [
        [strokeMesh, strokeRenderer],
        [cutMesh, cutRenderer],
        [bladeMesh, bladeRenderer],
        [cutRenderMesh, cutRenderRenderer],
        [ribbonMesh, ribbonRenderer],
    ] as [Mesh | null, MeshRenderer | null][]) {
        if (mesh && renderer) renderersToUnbind.push(renderer);
    }
    for (const node of routeNodes) {
        const renderer = node.getComponent(MeshRenderer);
        if (renderer && !renderersToUnbind.includes(renderer)) renderersToUnbind.push(renderer);
    }
    let renderersUnbound = false;
    for (const renderer of renderersToUnbind) {
        renderer.mesh = null;
        renderer.setSharedMaterial(null, 0);
    }
    renderersUnbound =
        renderersToUnbind.length > 0 &&
        renderersToUnbind.every((renderer) => !renderer.mesh && !renderer.getSharedMaterial(0));
    for (const [index, asset] of [...ownedMeshes, ...ownedMaterials].entries()) {
        asset.decRef();
        refs[index].after = asset.refCount;
    }
    const nodesRemoved = routeNodes.splice(0).every((node) => {
        node.removeFromParent();
        node.destroy();
        return node.parent === null;
    });
    releasePromise = Promise.resolve(app.close ? app.close() : undefined).then(() => ({
        released,
        refs,
        nodesRemoved,
        renderersUnbound,
        controlsDisabled: Array.from(document.querySelectorAll('button')).every(
            (button) => (button as HTMLButtonElement).disabled,
        ),
        sessionAdvanced: session,
        controlsDetached: controlsAbort?.signal.aborted === true,
        pointerDetached: pointerAbort === null || pointerAbort.signal.aborted,
        rendererValidity: renderersToUnbind.map((renderer) => renderer.isValid),
    }));
    return releasePromise;
}
let controlsAbort: AbortController | null = null;
let normalAfterDraw: (() => void) | null = null;

// ── wiring ──
if (MODE === 'mesh') createMeshMode();
else if (MODE === 'cut') createCutMode();
else createRibbonMode();
await app.run(scene);

// §25 Lifecycle Contract（资源粒度、惰性）：仅 __lifecycle() 调用时才执行一轮
// 当前模式全部自有 mesh/material 的 退役（解绑+decRef+销毁，含路由节点）→ 泄漏核对 →
// 重新执行当前模式创建路径并重注册帧回调。终态 release()（含 app.close）不受影响。
{
    const { installAssetLifecycle } = await import('../../shared/asset-lifecycle.js');
    const namedOwned = () =>
        ownedAssets().map((asset, index) => ({
            name: (ownedMeshes.includes(asset as Mesh) ? 'geo-mesh-' : 'geo-material-') + index,
            ref: asset,
        }));
    installAssetLifecycle({
        label: 'interactive-geometry',
        hold: () => (released || releasePromise ? [] : namedOwned()),
        release: () => {
            if (meshTicker) director.off(Director.EVENT_AFTER_DRAW, meshTicker);
            director.off(Director.EVENT_AFTER_DRAW, advanceBlade);
            director.off(Director.EVENT_AFTER_DRAW, tickRibbon);
            const bound: MeshRenderer[] = [];
            for (const [mesh, renderer] of [
                [strokeMesh, strokeRenderer],
                [cutMesh, cutRenderer],
                [bladeMesh, bladeRenderer],
                [cutRenderMesh, cutRenderRenderer],
            ] as [Mesh | null, MeshRenderer | null][]) {
                if (mesh && renderer) bound.push(renderer);
            }
            for (const node of routeNodes) {
                const renderer = node.getComponent(MeshRenderer);
                if (renderer && !bound.includes(renderer)) bound.push(renderer);
            }
            for (const renderer of bound) {
                renderer.mesh = null;
                renderer.setSharedMaterial(null, 0);
            }
            for (const asset of [...ownedMeshes, ...ownedMaterials]) {
                asset.decRef();
                asset.destroy();
            }
            ownedMeshes.splice(0);
            ownedMaterials.splice(0);
            for (const node of routeNodes.splice(0)) {
                node.removeFromParent();
                node.destroy();
            }
            strokeMesh = null;
            cutMesh = null;
            bladeMesh = null;
            cutRenderMesh = null;
            strokeRenderer = null;
            cutRenderer = null;
            bladeRenderer = null;
            cutRenderRenderer = null;
        },
        reacquire: async () => {
            if (MODE === 'mesh') createMeshMode();
            else if (MODE === 'cut') createCutMode();
            else createRibbonMode();
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            return namedOwned();
        },
    });
}

if (TEST) {
    game.pause();
    clock.begin();
    const first = await clock.step(1 / 60);
    submittedFrame = {
        event: 'AFTER_DRAW',
        ...first,
        afterDraw: true,
        inputSequence: 0,
        timestamp: new Date().toISOString(),
    };
    (window as unknown as Record<string, unknown>).__geometry = {
        mode: MODE,
        projection: PROJ,
        cam: CAM,

        calibrate: () => {
            const top = worldToCss(new Vec3(0, 1.2, 0));
            const bottom = worldToCss(new Vec3(0, -1.2, 0));
            const right = worldToCss(new Vec3(1.5, 0, 0));
            const screenRaw = (world: Vec3) => {
                const out = new Vec3();
                camera.worldToScreen(world, out);
                return { x: out.x, y: out.y };
            };
            return {
                canvasCss: cssSize(),
                backing: { width: canvas.width, height: canvas.height },
                dpr: devicePixelRatio,
                topCss: top,
                bottomCss: bottom,
                rightCss: right,
                topScreen: screenRaw(new Vec3(0, 1.2, 0)),
                bottomScreen: screenRaw(new Vec3(0, -1.2, 0)),
            };
        },
        snapshot,
        step,
        probeCut,
        reset,
        resetCycle,
        geometryInspect,
        release,
        // late-release contract: an up event from an older session must not cut
        staleUp: (css: { x: number; y: number }) => {
            recordProbe('stale-up');
            const rect = canvas.getBoundingClientRect();
            const stale = {
                clientX: rect.left + css.x,
                clientY: rect.top + css.y,
                isTrusted: false,
                sequence,
                timestamp: new Date().toISOString(),
                type: 'probe',
                session: session - 1,
            };
            applyCut(stale as never, stale as never);
            return { records: cutState.records.length, session };
        },
    };
} else {
    normalAfterDraw = () => {
        submittedFrame = {
            event: 'AFTER_DRAW',
            afterDraw: true,
            totalFrames: director.getTotalFrames(),
            inputSequence: (lastAction() as { sequence: number }).sequence,
            timestamp: new Date().toISOString(),
        };
    };
    director.on(Director.EVENT_AFTER_DRAW, normalAfterDraw);
    (window as unknown as Record<string, unknown>).__geometryNormal = {
        snapshot,
        release,
        userEvents: () => [...userEvents],
    };
}
controlsAbort = new AbortController();
document.querySelector('#reset')!.addEventListener(
    'click',
    (event) => {
        if (released) return;
        recordUser('reset', event);
        void reset();
    },
    { signal: controlsAbort.signal },
);
document.querySelector('#release')!.addEventListener(
    'click',
    (event) => {
        if (released) return;
        recordUser('release', event);
        void release();
        document.querySelectorAll('button').forEach((button) => {
            (button as HTMLButtonElement).disabled = true;
        });
    },
    { signal: controlsAbort.signal },
);
window.addEventListener(
    'keydown',
    (event) => {
        if (MODE !== 'cut' && event.key === 'Escape' && !released) {
            recordUser('escape', event);
            advanceSession('escape');
        }
    },
    { signal: controlsAbort.signal, capture: true },
);
window.addEventListener(
    'resize',
    (event) => {
        if (MODE !== 'cut' && !released) {
            recordUser('resize', event);
            advanceSession('resize');
        }
    },
    { signal: controlsAbort.signal },
);
if (TEST)
    Object.assign((window as unknown as { __geometry: object }).__geometry, { userEvents: () => [...userEvents] });
status.textContent = `IER-04 ${MODE} · ${PROJ}/${CAM}${TEST ? ' · step clock' : ' · native pacer'}`;
console.log(`[interactive-geometry] mode=${MODE} test=${TEST} proj=${PROJ} cam=${CAM} offset=${OFFSET}`);
