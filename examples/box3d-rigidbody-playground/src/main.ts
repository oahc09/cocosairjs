/**
 * Original EX01, IN_PROGRESS. Real Cocos Node/MeshRenderer/RigidBody scene.
 * No alternative solver, private native step, second clock, or pose animation.
 * Original acceptance scope is retained in original-requirements.json and README.md.
 */
import {
    createAirApp,
    AIR_VERSION,
    AIR_REVISION,
    AIR_BUILD_DATE,
    AIR_BUILD_NUMBER,
    Scene,
    Node,
    Component,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    PhysicsMaterial,
    RigidBody,
    ERigidBodyType,
    BoxCollider,
    SphereCollider,
    CapsuleCollider,
    MeshCollider,
    EAxisDirection,
    Color,
    Vec3,
    Layers,
    primitives,
    utils,
    physics,
    isValid,
} from 'cocosair';
import { CAPSULE_DIMENSIONS, capsuleVerticalExtent } from './capsule-geometry.js';
import { hullMeshGeometry, hullMinimumOffsetY } from './hull-geometry.js';
import { createSpringDrag } from './spring-drag.js';
import { readBackendObservation } from './backend-observation.js';
import type { BackendObservation } from './backend-observation.js';

const CONFIG = Object.freeze({
    example: 'EX01',
    seed: 20261022,
    backend: 'box3d',
    threading: 'single',
    workerCount: 1,
    fixedTimeStep: 1 / 60,
    solverSubSteps: 4,
    maxSubSteps: 4,
    gravity: [0, -10, 0],
    wall: { rows: 10, columns: 10, width: 0.9, height: 0.45, depth: 0.48, gap: 0.025, mass: 1.2 },
    ball: { radius: 0.62, mass: 12, impulse: [0, 14, -168], spawn: [0, 2.6, 6.5], maximum: 12 },
    capsule: CAPSULE_DIMENSIONS,
    material: { friction: 0.45, restitution: 0.1 },
    floor: { width: 36, height: 1, depth: 36 },
    drag: { stiffness: 180, dampingRatio: 0.85, maxForce: 600, maxStretch: 3 },
    demo: {
        firstShotAfterSeconds: 1.8,
        secondShotAfterSeconds: 4.2,
        stopAfterSeconds: 8,
        projectileOrder: ['sphere', 'capsule'] as const,
    },
});

type ProjectileKind = 'sphere' | 'capsule' | 'hull' | 'compound';
type BodyEntry = { node: Node; body: RigidBody; kind: 'brick' | ProjectileKind; index: number };
type Intent = 'toggle' | 'reset' | 'launch' | 'demo' | 'parameters';
type Phase = 'boot' | 'ready' | 'running' | 'paused' | 'resetting' | 'closing' | 'closed' | 'error';
const byId = <T extends HTMLElement>(id: string): T => {
    const value = document.getElementById(id);
    if (!value) throw new Error(`Missing EX01 interface element: ${id}`);
    return value as T;
};
const buttons = ['toggle', 'reset', 'launch', 'demo', 'export', 'close'].map((id) => byId<HTMLButtonElement>(id));
const params = {
    mass: byId<HTMLInputElement>('mass'),
    friction: byId<HTMLInputElement>('friction'),
    restitution: byId<HTMLInputElement>('restitution'),
};
const value = (id: string, text: string): void => {
    byId(id).textContent = text;
};
const round = (n: number): number => Math.round(n * 10000) / 10000;
const intentQueue: Intent[] = [];
const observations: Record<string, unknown>[] = [];
const errors: string[] = [];
const eventLog: { frame: number; action: string; detail: unknown }[] = [];
const selectedProjectile = (): ProjectileKind => {
    const kind = byId<HTMLSelectElement>('projectile-shape').value;
    if (kind !== 'sphere' && kind !== 'capsule' && kind !== 'hull' && kind !== 'compound')
        throw new Error(`Unsupported EX01 projectile: ${kind}`);
    return kind;
};
const readParameters = () => ({
    projectileShape: selectedProjectile(),
    mass: Number(params.mass.value),
    friction: Number(params.friction.value),
    restitution: Number(params.restitution.value),
});
let phase: Phase = 'boot';
let frame = 0;
let simulationDisplaySeconds = 0;
let generation = 0;
let shotCount = 0;
let totalShots = 0;
let resetCount = 0;
let scene: Scene;
let app: Awaited<ReturnType<typeof createAirApp>> | null = null;
let springDrag: ReturnType<typeof createSpringDrag> | null = null;
let closeReceipt: unknown = null;
let system: typeof physics.PhysicsSystem.instance;
let bricks: BodyEntry[] = [];
let projectiles: BodyEntry[] = [];
let retired: Node[] = [];
let resetFrame = 0;
let restartAfterReset = false;
let demoAfterReset = false;
let demoActive = false;
let demoElapsed = 0;
let demoShotIndex = 0;
let bootDemoElapsed = 0;
let bootDemoPending = new URLSearchParams(location.search).get('demo') !== '0';
let lastObservation: Record<string, unknown> | null = null;
let sourceIdentity: unknown = null;
let identityError: string | null = null;
let nativeIdentity: unknown = null;
let diagnosticWorld: unknown = null;
let backendObservation: BackendObservation | null = null;
let capsuleMesh: ReturnType<typeof utils.createMesh>;
let hullMesh: ReturnType<typeof utils.createMesh>;
let compoundBoxMesh: ReturnType<typeof utils.createMesh>;
let ballMesh: ReturnType<typeof utils.createMesh>;
let brickMesh: ReturnType<typeof utils.createMesh>;
let ballMaterial: Material;
let surface: PhysicsMaterial;
const brickMaterials: Material[] = [];
const assets: (Material | PhysicsMaterial | ReturnType<typeof utils.createMesh>)[] = [];
const pendingImpulses: { entry: BodyEntry; frame: number }[] = [];
const inputLifetime = new AbortController();
const pageLifetime = new AbortController();

function tell(message: string, error = false): void {
    value('message', message);
    byId('message').classList.toggle('error', error);
}
function log(action: string, detail: unknown): void {
    eventLog.push({ frame, action, detail });
    if (eventLog.length > 500) eventLog.shift();
}
function fail(error: unknown): void {
    // Preserve the original browser stack before any cleanup can obscure the failure.
    console.error('[Box3D EX01] Original failure', error);
    log('failure', { message: String(error), stack: error instanceof Error ? error.stack : undefined });
    try {
        springDrag?.cancel();
    } catch {
        /* Keep the original failure. */
    }
    const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    errors.push(text);
    updateBackendReadouts();
    phase = 'error';
    demoActive = false;
    bootDemoPending = false;
    intentQueue.length = 0;
    pendingImpulses.length = 0;
    // Stop through the public system control. Never advance or repair a faulted world privately.
    try {
        if (system) system.enable = false;
    } catch {
        /* Preserve the originating failure. */
    }
    tell(text, true);
    value('scene-status', '运行中断 · 未通过验证');
    buttons.forEach((button) => {
        button.disabled = button.id !== 'export';
    });
    byId<HTMLFieldSetElement>('parameters').disabled = true;
    byId<HTMLFieldSetElement>('drag-controls').disabled = true;
    const boot = byId('boot');
    boot.hidden = false;
    boot.querySelector('.loader')?.remove();
    const paragraph = boot.querySelector('p');
    if (paragraph) paragraph.textContent = `Box3D 未能继续运行。\n${text}\n不会切换其他物理后端或播放替代动画。`;
}
function material(color: Color): Material {
    const result = new Material();
    result.initialize({ effectName: 'builtin-standard' });
    result.setProperty('mainColor', color);
    result.setProperty('roughness', 0.75);
    result.setProperty('metallic', 0.05);
    assets.push(result);
    return result;
}
function visual(node: Node, mesh: ReturnType<typeof utils.createMesh>, paint: Material): void {
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(paint, 0);
}
function nodeAt(name: string, x: number, y: number, z: number): Node {
    const node = new Node(name);
    node.active = false;
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(x, y, z);
    return node;
}
function activate(node: Node): void {
    // All transform, geometry, type and material configuration precedes native ownership.
    scene.addChild(node);
    node.active = true;
}
function boxBody(
    name: string,
    position: number[],
    size: number[],
    dynamic: boolean,
    mesh: ReturnType<typeof utils.createMesh>,
    paint: Material,
): BodyEntry {
    const node = nodeAt(name, position[0], position[1], position[2]);
    visual(node, mesh, paint);
    const body = node.addComponent(RigidBody);
    body.type = dynamic ? ERigidBodyType.DYNAMIC : ERigidBodyType.STATIC;
    body.mass = CONFIG.wall.mass;
    body.allowSleep = true;
    body.linearDamping = 0.03;
    body.angularDamping = 0.05;
    const collider = node.addComponent(BoxCollider);
    collider.size = new Vec3(size[0], size[1], size[2]);
    collider.sharedMaterial = surface;
    activate(node);
    return { node, body, kind: 'brick', index: -1 };
}
function buildWall(): void {
    const wall = CONFIG.wall;
    for (let row = 0; row < wall.rows; row++) {
        for (let column = 0; column < wall.columns; column++) {
            const index = row * wall.columns + column;
            const x = (column - (wall.columns - 1) / 2) * (wall.width + wall.gap) + (row % 2 ? 0.13 : -0.13);
            const y = wall.height / 2 + 0.015 + row * (wall.height + wall.gap);
            const entry = boxBody(
                `Brick-${generation}-${String(index).padStart(3, '0')}`,
                [x, y, 0],
                [wall.width, wall.height, wall.depth],
                true,
                brickMesh,
                brickMaterials[(index * 17 + CONFIG.seed) % brickMaterials.length],
            );
            entry.index = index;
            bricks.push(entry);
        }
    }
    if (bricks.length !== 100) throw new Error('EX01 requires exactly 100 wall bricks.');
}
function buildEnvironment(): void {
    const floor = utils.createMesh(
        primitives.box({ width: CONFIG.floor.width, height: CONFIG.floor.height, length: CONFIG.floor.depth }),
    );
    assets.push(floor);
    boxBody(
        'Ground',
        [0, -CONFIG.floor.height / 2, 0],
        [CONFIG.floor.width, CONFIG.floor.height, CONFIG.floor.depth],
        false,
        floor,
        material(new Color(43, 59, 70, 255)),
    );
    // Thin inlaid lines are static visual guides, not collider debug or collision substitutes.
    const gridMesh = utils.createMesh(primitives.box({ width: 0.014, height: 0.003, length: 26 }));
    assets.push(gridMesh);
    const gridMaterial = material(new Color(69, 88, 101, 255));
    for (let offset = -12; offset <= 12; offset += 2) {
        const alongZ = nodeAt(`Grid-Z-${offset}`, offset, 0.003, 0);
        visual(alongZ, gridMesh, gridMaterial);
        activate(alongZ);
        const alongX = nodeAt(`Grid-X-${offset}`, 0, 0.003, offset);
        alongX.setRotationFromEuler(0, 90, 0);
        visual(alongX, gridMesh, gridMaterial);
        activate(alongX);
    }
}
function startSimulation(): void {
    system.enable = true;
    phase = 'running';
    value('toggle', '暂停模拟');
    byId<HTMLButtonElement>('launch').disabled = projectiles.length >= CONFIG.ball.maximum;
    value('scene-status', '真实刚体模拟中 · 投射物与砖均由 Box3D 驱动');
}
function pauseSimulation(): void {
    springDrag?.cancel();
    updateDragReadout();
    system.enable = false;
    // System control owns cancellation of queued commands; do not replay pending UI launches.
    pendingImpulses.length = 0;
    phase = 'paused';
    value('toggle', '继续模拟');
    byId<HTMLButtonElement>('launch').disabled = true;
    value('scene-status', '模拟已暂停 · 渲染仍在运行');
}
function launchProjectile(kind: ProjectileKind = selectedProjectile()): void {
    if (phase !== 'running') {
        tell('请先开始模拟，再发射投射物。');
        return;
    }
    if (projectiles.length >= CONFIG.ball.maximum) {
        tell('已保留 12 个投射物。请重置后继续，避免无界增加资源。');
        return;
    }
    springDrag?.cancel();
    const spawn = CONFIG.ball.spawn;
    const offsets = [0, -1.7, 1.7];
    const node = nodeAt(
        `${kind === 'compound' ? 'Compound' : kind === 'hull' ? 'Hull' : kind === 'capsule' ? 'Capsule' : 'Sphere'}-${generation}-${shotCount}`,
        spawn[0] + offsets[shotCount % offsets.length],
        spawn[1],
        spawn[2],
    );
    if (kind !== 'compound')
        visual(node, kind === 'hull' ? hullMesh : kind === 'capsule' ? capsuleMesh : ballMesh, ballMaterial);
    else {
        const boxVisual = nodeAt('Compound box visual', -0.7, 0, 0);
        visual(boxVisual, compoundBoxMesh, ballMaterial);
        node.addChild(boxVisual);
        boxVisual.active = true;
        const sphereVisual = nodeAt('Compound sphere visual', 0.5, 0, 0);
        visual(sphereVisual, ballMesh, ballMaterial);
        node.addChild(sphereVisual);
        sphereVisual.active = true;
    }
    const body = node.addComponent(RigidBody);
    body.type = ERigidBodyType.DYNAMIC;
    body.mass = readParameters().mass;
    body.allowSleep = true;
    body.linearDamping = 0.01;
    body.angularDamping = 0.03;
    if (kind === 'compound') {
        // One real body with two offset colliders. Children are visuals only.
        const box = node.addComponent(BoxCollider);
        box.size = new Vec3(0.6, 0.8, 0.6);
        box.center = new Vec3(-0.7, 0, 0);
        box.sharedMaterial = surface;
        const sphere = node.addComponent(SphereCollider);
        sphere.radius = CONFIG.ball.radius;
        sphere.center = new Vec3(0.5, 0, 0);
        sphere.sharedMaterial = surface;
    } else if (kind === 'hull') {
        const collider = node.addComponent(MeshCollider);
        collider.convex = true;
        collider.mesh = hullMesh;
        collider.sharedMaterial = surface;
    } else if (kind === 'capsule') {
        const collider = node.addComponent(CapsuleCollider);
        collider.radius = CONFIG.capsule.radius;
        collider.cylinderHeight = CONFIG.capsule.cylinderHeight;
        collider.direction = EAxisDirection.Y_AXIS;
        collider.sharedMaterial = surface;
    } else {
        const collider = node.addComponent(SphereCollider);
        collider.radius = CONFIG.ball.radius;
        collider.sharedMaterial = surface;
    }
    activate(node);
    const entry: BodyEntry = { node, body, kind, index: shotCount++ };
    projectiles.push(entry);
    pendingImpulses.push({ entry, frame });
    totalShots++;
    byId<HTMLButtonElement>('launch').disabled = projectiles.length >= CONFIG.ball.maximum;
    log(`spawn-${kind}`, {
        kind,
        name: node.name,
        mass: body.mass,
        position: [node.position.x, node.position.y, node.position.z],
    });
    tell(
        `${kind === 'compound' ? '复合刚体' : kind === 'hull' ? '凸包' : kind === 'capsule' ? '胶囊' : '球体'} ${shotCount} 已创建。下一引擎更新提交一次冲量，固定步消费。`,
    );
}
function updateParameters(): void {
    springDrag?.cancel();
    updateDragReadout();
    const requested = readParameters();
    // These setters target the real native ownership path. No transform changes are used.
    for (const entry of projectiles) if (isValid(entry.node)) entry.body.mass = requested.mass;
    surface.friction = requested.friction;
    surface.restitution = requested.restitution;
    log('parameters', requested);
    tell('质量与共享物理材质已通过组件设置；实际效果仍需当前构建验证。');
}
function requestReset(runAfter: boolean, demoAfter: boolean): void {
    springDrag?.cancel();
    updateDragReadout();
    bootDemoPending = false;
    demoActive = false;
    restartAfterReset = runAfter;
    demoAfterReset = demoAfter;
    system.enable = false;
    phase = 'resetting';
    pendingImpulses.length = 0;
    intentQueue.length = 0;
    retired = [...bricks, ...projectiles].map((entry) => entry.node);
    // Leave parentage and poses intact. Deferred Cocos destruction releases native ownership.
    for (const node of retired) node.destroy();
    bricks = [];
    projectiles = [];
    resetFrame = frame;
    buttons.forEach((button) => {
        button.disabled = button.id !== 'export';
    });
    byId<HTMLFieldSetElement>('parameters').disabled = true;
    byId<HTMLFieldSetElement>('drag-controls').disabled = true;
    value('scene-status', '重置中 · 等待旧节点完成生命周期释放');
    tell('旧刚体释放完成后重建砖墙；不重建 app，也不直接移动已有刚体。');
}
function finishResetIfReady(): void {
    if (frame <= resetFrame + 1 || retired.some((node) => isValid(node))) return;
    retired = [];
    generation++;
    resetCount++;
    shotCount = 0;
    simulationDisplaySeconds = 0;
    demoElapsed = 0;
    demoShotIndex = 0;
    buildWall();
    phase = 'ready';
    enableControls();
    if (restartAfterReset) startSimulation();
    demoActive = demoAfterReset;
    log('reset-completed', { generation, resetCount, oldNodesDestroyed: true, newBricks: bricks.length });
    tell(demoActive ? '自动演示：砖墙沉降后依次发射球体和胶囊。' : '砖墙已重建。点击开始模拟。');
}
function enableControls(): void {
    buttons.forEach((button) => {
        button.disabled = false;
    });
    byId<HTMLButtonElement>('launch').disabled = phase !== 'running';
    byId<HTMLFieldSetElement>('parameters').disabled = false;
    byId<HTMLFieldSetElement>('drag-controls').disabled = false;
    byId<HTMLButtonElement>('close').disabled = !app?.close;
    updateDragReadout();
    value('toggle', phase === 'running' ? '暂停模拟' : '开始模拟');
    if (phase !== 'running') value('scene-status', '100 块砖已就绪 · 等待开始');
}
function processIntent(intent: Intent): void {
    if (phase === 'resetting' || phase === 'closing' || phase === 'closed' || phase === 'error') return;
    bootDemoPending = false;
    if (intent === 'toggle') {
        demoActive = false;
        if (phase === 'running') pauseSimulation();
        else startSimulation();
    } else if (intent === 'reset') requestReset(false, false);
    else if (intent === 'demo') requestReset(true, true);
    else if (intent === 'launch') {
        demoActive = false;
        launchProjectile();
    } else if (intent === 'parameters') updateParameters();
}
function minimumY(entry: BodyEntry): number {
    const position = entry.node.worldPosition;
    if (entry.kind === 'sphere') return position.y - CONFIG.ball.radius;
    const q = entry.node.worldRotation;
    if (entry.kind === 'capsule') return position.y - capsuleVerticalExtent(q);
    if (entry.kind === 'hull') return position.y + hullMinimumOffsetY(q);
    if (entry.kind === 'compound') {
        const yx = 2 * (q.x * q.y + q.z * q.w);
        const yy = 1 - 2 * (q.x * q.x + q.z * q.z);
        const yz = 2 * (q.y * q.z - q.x * q.w);
        const boxY = -0.7 * yx - (Math.abs(yx) * 0.6 + Math.abs(yy) * 0.8 + Math.abs(yz) * 0.6) / 2;
        const sphereY = 0.5 * yx - CONFIG.ball.radius;
        return position.y + Math.min(boxY, sphereY);
    }
    const wall = CONFIG.wall;
    // Vertical extent of the actual rotated box, not a center-only ground check.
    const extent =
        (Math.abs(2 * (q.x * q.y + q.z * q.w)) * wall.width) / 2 +
        (Math.abs(1 - 2 * (q.x * q.x + q.z * q.z)) * wall.height) / 2 +
        (Math.abs(2 * (q.y * q.z - q.x * q.w)) * wall.depth) / 2;
    return position.y - extent;
}
function updateBackendReadouts(): BackendObservation {
    const observation = readBackendObservation(diagnosticWorld);
    backendObservation = observation;
    value('step', observation.nativeStep === null ? '—' : String(observation.nativeStep));
    value('contacts', observation.contacts === null ? '—' : String(observation.contacts));
    value('contacts-note', observation.contacts === null ? 'unavailable · 不以 0 代替' : '原生接触计数 · 非公共事件');
    value('native-status', observation.reason || '已读取 ready / idle 边界的复制快照');
    value('native-state', `${observation.worldState ?? 'unavailable'} / ${observation.ownerPhase ?? 'unavailable'}`);
    value(
        'native-counts',
        observation.counts ? `${observation.counts.bodies} / ${observation.counts.shapes}` : 'unavailable',
    );
    value('native-bytes', observation.counts ? `${observation.counts.liveBytes} B` : 'unavailable');
    value(
        'native-capabilities',
        `events: ${String(observation.componentEventsSupported)} · debug: ${String(observation.debugPresented)}`,
    );
    return observation;
}
function updateDragReadout(): void {
    const drag = springDrag?.snapshot();
    value(
        'drag-status',
        drag?.lastInputError
            ? `拖拽已停止：${drag.lastInputError}`
            : drag?.active
              ? `正在拖拽 ${drag.selected}`
              : drag?.disposed
                ? '拖拽输入已释放'
                : !drag?.enabled
                  ? '拖拽已关闭'
                  : phase === 'running'
                    ? '按住砖块、球体、胶囊、凸包或复合体拖动；松手保留真实动量'
                    : '开始模拟后可拾取动态刚体',
    );
    value(
        'drag-tick',
        drag?.lastSubmission
            ? `${drag.lastSubmission.tickIndex} / ${drag.lastSubmission.attemptId}（提交，非完成证明）`
            : '尚无力提交',
    );
    const motion = drag?.nativeMotion;
    value(
        'drag-com',
        motion ? [motion.worldCOM.x, motion.worldCOM.y, motion.worldCOM.z].map(round).join(' / ') : '尚未拾取',
    );
    byId<HTMLButtonElement>('release-drag').disabled = !drag?.active;
}
async function closePlayground(): Promise<void> {
    if (phase === 'closing' || phase === 'closed') return;
    if (!app?.close) {
        tell('当前 runtime 没有公开 close；不伪造释放结果。', true);
        return;
    }
    // Explicit close cancels input BEFORE the app terminates pacing or starts native teardown.
    springDrag?.dispose();
    bootDemoPending = false;
    demoActive = false;
    pendingImpulses.length = 0;
    intentQueue.length = 0;
    phase = 'closing';
    buttons.forEach((button) => {
        button.disabled = true;
    });
    byId<HTMLFieldSetElement>('parameters').disabled = true;
    byId<HTMLFieldSetElement>('drag-controls').disabled = true;
    updateDragReadout();
    try {
        closeReceipt = await app.close();
        phase = 'closed';
        value('scene-status', '试验已结束 · 查看导出的实际释放回执');
        tell('已停止拖拽并收到 app.close 回执；重开需重新载入。回执不是100次资源恢复证明。');
        log('close-receipt', closeReceipt);
    } catch (error) {
        closeReceipt = { rejected: String(error) };
        phase = 'error';
        errors.push(String(error));
        tell(`关闭失败：${String(error)}。导出保留原始失败。`, true);
    }
    updateBackendReadouts();
    byId<HTMLButtonElement>('export').disabled = false;
}
function sample(): void {
    updateDragReadout();
    const entries = [...bricks, ...projectiles].filter((entry) => isValid(entry.node));
    const awake = entries.filter((entry) => entry.body.isAwake).length;
    const displaced = bricks.filter((entry) => {
        const q = entry.node.worldRotation;
        return Math.abs(entry.node.worldPosition.z) > 0.6 || Math.abs(1 - 2 * (q.x * q.x + q.z * q.z)) < 0.65;
    }).length;
    const minimum = entries.length ? Math.min(...entries.map(minimumY)) : null;
    const finite = entries.every((entry) => {
        const p = entry.node.worldPosition;
        const q = entry.node.worldRotation;
        return [p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite);
    });
    const native = updateBackendReadouts();
    lastObservation = {
        frame,
        generation,
        phase,
        dynamicBodies: entries.length,
        bricks: bricks.length,
        spheres: projectiles.filter((entry) => entry.kind === 'sphere').length,
        capsules: projectiles.filter((entry) => entry.kind === 'capsule').length,
        hulls: projectiles.filter((entry) => entry.kind === 'hull').length,
        compounds: projectiles.filter((entry) => entry.kind === 'compound').length,
        awake,
        displaced,
        finiteTransforms: finite,
        minimumGeometryY: minimum === null ? null : round(minimum),
        sampledBelowFloorTolerance: minimum !== null && minimum < -0.15,
        displayElapsedSeconds: round(simulationDisplaySeconds),
        displayElapsedIsNativeTime: false,
        nativeStep: native.nativeStep,
        contacts: native.contacts,
        nativeDiagnostics: native,
        drag: springDrag?.snapshot() ?? null,
    };
    observations.push(lastObservation);
    if (observations.length > 1200) observations.shift();
    value('displaced', String(displaced));
    value('awake', String(awake));
    value('awake-total', `/ ${entries.length} 个动态刚体`);
    value('frames', String(frame));
    value('min-y', minimum === null ? '—' : `${minimum.toFixed(3)} m`);
    value('shots', `${shotCount} / ${CONFIG.ball.maximum}`);
    value('resets', String(resetCount));
    if (!finite) throw new Error('Non-finite transform observed; EX01 cannot continue.');
}
class PlaygroundController extends Component {
    private sampleElapsed = 0;
    update(dt: number): void {
        if (phase === 'error' || phase === 'closing' || phase === 'closed') return;
        try {
            frame++;
            if (phase === 'resetting') finishResetIfReady();
            else {
                const intents = intentQueue.splice(0);
                for (const intent of intents) processIntent(intent);
            }
            if (bootDemoPending && phase === 'ready') {
                bootDemoElapsed += dt;
                if (bootDemoElapsed >= 1.1) {
                    bootDemoPending = false;
                    demoActive = true;
                    demoElapsed = 0;
                    demoShotIndex = 0;
                    startSimulation();
                }
            }
            if (phase === 'running') {
                simulationDisplaySeconds += dt;
                for (let i = pendingImpulses.length - 1; i >= 0; i--) {
                    const pending = pendingImpulses[i];
                    if (pending.frame >= frame) continue;
                    if (!isValid(pending.entry.node)) throw new Error('Pending impulse lost its live body.');
                    const impulse = CONFIG.ball.impulse;
                    pending.entry.body.applyImpulse(new Vec3(impulse[0], impulse[1], impulse[2]));
                    log('impulse-submitted', { name: pending.entry.node.name, impulse: [...impulse] });
                    pendingImpulses.splice(i, 1);
                }
                if (demoActive) {
                    // Presentation scheduling only. PhysicsSystem owns all fixed simulation ticks.
                    demoElapsed += dt;
                    const time =
                        demoShotIndex === 0 ? CONFIG.demo.firstShotAfterSeconds : CONFIG.demo.secondShotAfterSeconds;
                    if (demoShotIndex < 2 && demoElapsed >= time) {
                        launchProjectile(CONFIG.demo.projectileOrder[demoShotIndex]);
                        demoShotIndex++;
                    }
                    if (demoElapsed >= CONFIG.demo.stopAfterSeconds) {
                        demoActive = false;
                        tell('自动操作已结束，真实模拟继续运行。可继续发射、调参或重置。');
                    }
                }
            }
            this.sampleElapsed += dt;
            if (this.sampleElapsed >= 0.25) {
                this.sampleElapsed = 0;
                sample();
            }
        } catch (error) {
            fail(error);
        }
    }
    onDestroy(): void {
        springDrag?.dispose();
        inputLifetime.abort();
    }
}
function snapshot(): Record<string, unknown> {
    updateBackendReadouts();
    return {
        schema: 'cocosair.box3d.ex01.observation.v1',
        example: 'EX01',
        status: 'IN_PROGRESS',
        acceptancePassed: false,
        generatedAt: new Date().toISOString(),
        config: CONFIG,
        currentParameters: readParameters(),
        sourceIdentity,
        sourceIdentityError: identityError,
        backendObservation,
        drag: springDrag?.snapshot() ?? null,
        closeReceipt,
        runtime: {
            airVersion: AIR_VERSION,
            airRevision: AIR_REVISION,
            buildDate: AIR_BUILD_DATE,
            buildNumber: AIR_BUILD_NUMBER,
            backend: nativeIdentity,
        },
        phase,
        frame,
        generation,
        resetCount,
        totalShots,
        latest: lastObservation,
        observations: observations.slice(),
        events: eventLog.slice(),
        errors: errors.slice(),
        bodyPoses: [...bricks, ...projectiles]
            .filter((entry) => isValid(entry.node))
            .map((entry) => {
                const p = entry.node.worldPosition;
                const q = entry.node.worldRotation;
                return {
                    name: entry.node.name,
                    kind: entry.kind,
                    mass: entry.body.mass,
                    position: [p.x, p.y, p.z],
                    rotation: [q.x, q.y, q.z, q.w],
                };
            }),
        unverified: [
            '15-second real recording',
            'screenshots',
            'formal C05-C15/C20/C26/C32-C34 assertions',
            '100-cycle resource recovery',
            'same-build replay',
        ],
        unfinishedOriginalRequirements: [
            'capsule: source integrated; current-build native/browser verification pending',
            'hull: actual MeshCollider source integrated; current candidate runtime/browser verification pending',
            'Hull/compound dragging: native-COM source candidate; current-build browser verification pending',
            'raycast pick/visible alignment: source integrated, native/browser verification pending',
            'fixed-tick spring/release: actual native origin and COM candidate, unverified',
            'all associated formal dragging/throwing acceptance cells',
            'component contact events',
            'multi/auto thread modes',
        ],
        observationLimitations: [
            'Demo/impulse scheduling uses component dt; spring force submits only in the public fixed-tick hook',
            'Drag lastSubmission is an attempted hook submission, not proof of completed native step',
            'Position samples are not collision event proof',
            'No full acceptance is inferred from this export',
        ],
    };
}
async function exportResult(): Promise<void> {
    try {
        const report = snapshot();
        // Hash the actual served main runtime on demand; the AIR version integer is not a Git SHA.
        try {
            const response = await fetch('/build/cocosair.module.js', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bytes = await response.arrayBuffer();
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            report.servedRuntimeIdentity = {
                url: response.url,
                bytes: bytes.byteLength,
                sha256: Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join(''),
                scope: 'fetched main bundle only; not proof of cached execution or Box3D wasm identity',
            };
        } catch (error) {
            report.servedRuntimeIdentity = { unavailable: String(error) };
        }
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `box3d-ex01-g${generation}-${Date.now()}.json`;
        link.click();
        // Download cleanup only, never a simulation clock.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        tell('已导出配置、源码身份和本次观测。状态保留 IN_PROGRESS，不把观测当作完整验收。');
    } catch (error) {
        tell(`导出失败：${String(error)}`, true);
    }
}
async function main(): Promise<void> {
    const requestedThreading = new URLSearchParams(location.search).get('threading') || 'single';
    if (requestedThreading !== 'single')
        throw new Error(`Threading '${requestedThreading}' is unfinished in EX01. No silent ST fallback.`);
    app = await createAirApp({
        canvas: '#GameCanvas',
        physics: 'box3d',
        physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } },
    });
    system = physics.PhysicsSystem.instance;
    const world = system.physicsWorld;
    diagnosticWorld = world;
    const implementation = world.impl as { backend?: string; generation?: number; worldId?: unknown };
    if (!implementation || implementation.backend !== 'box3d')
        throw new Error('Selected runtime is not the required Box3D backend.');
    nativeIdentity = {
        backend: implementation.backend,
        generation: implementation.generation,
        worldId: implementation.worldId,
    };
    value('backend', 'box3d · single');
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = CONFIG.fixedTimeStep;
    system.maxSubSteps = CONFIG.maxSubSteps;
    system.allowSleep = true;
    system.gravity = new Vec3(0, -10, 0);
    scene = new Scene('box3d-rigidbody-playground');
    const cameraNode = nodeAt('Main Camera', 10.4, 7.6, 15.5);
    cameraNode.lookAt(new Vec3(0, 1.7, 0.1));
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.fov = 44;
    camera.near = 0.1;
    camera.far = 100;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(17, 26, 36, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    activate(cameraNode);
    const lightNode = nodeAt('Key Light', 0, 12, 4);
    lightNode.setRotationFromEuler(-48, -35, 0);
    const light = lightNode.addComponent(DirectionalLight);
    light.illuminance = 42000;
    activate(lightNode);
    surface = new PhysicsMaterial();
    surface.name = 'EX01 shared surface';
    surface.friction = CONFIG.material.friction;
    surface.restitution = CONFIG.material.restitution;
    assets.push(surface);
    brickMesh = utils.createMesh(
        primitives.box({ width: CONFIG.wall.width, height: CONFIG.wall.height, length: CONFIG.wall.depth }),
    );
    compoundBoxMesh = utils.createMesh(primitives.box({ width: 0.6, height: 0.8, length: 0.6 }));
    assets.push(compoundBoxMesh);
    ballMesh = utils.createMesh(primitives.sphere(CONFIG.ball.radius));
    // primitive.capsule takes total height; CapsuleCollider takes cylinderHeight separately.
    // Both are centered along Y at unit scale. No post-activation pose/scale repair is used.
    capsuleMesh = utils.createMesh(
        primitives.capsule(CONFIG.capsule.radius, CONFIG.capsule.radius, CONFIG.capsule.totalHeight),
    );
    hullMesh = utils.createMesh(hullMeshGeometry());
    assets.push(brickMesh, ballMesh, capsuleMesh, hullMesh);
    for (const color of [
        [204, 122, 85],
        [223, 147, 100],
        [188, 106, 76],
        [231, 164, 114],
        [205, 135, 102],
    ])
        brickMaterials.push(material(new Color(color[0], color[1], color[2], 255)));
    ballMaterial = material(new Color(131, 223, 209, 255));
    buildEnvironment();
    buildWall();
    const control = nodeAt('Playground Controller', 0, 0, 0);
    control.addComponent(PlaygroundController);
    activate(control);
    for (const id of ['toggle', 'reset', 'launch', 'demo'] as const)
        byId(id).addEventListener('click', () => intentQueue.push(id), { signal: inputLifetime.signal });
    for (const [key, input] of Object.entries(params)) {
        input.addEventListener(
            'input',
            () => value(`${key}-value`, key === 'mass' ? `${input.value} kg` : Number(input.value).toFixed(2)),
            { signal: inputLifetime.signal },
        );
        input.addEventListener('change', () => intentQueue.push('parameters'), { signal: inputLifetime.signal });
    }
    byId('close').addEventListener('click', () => void closePlayground(), { signal: inputLifetime.signal });
    byId('drag-enabled').addEventListener(
        'change',
        () => {
            springDrag?.setEnabled(byId<HTMLInputElement>('drag-enabled').checked);
            updateDragReadout();
        },
        { signal: inputLifetime.signal },
    );
    byId('release-drag').addEventListener(
        'click',
        () => {
            springDrag?.cancel();
            updateDragReadout();
        },
        { signal: inputLifetime.signal },
    );
    byId('export').addEventListener('click', () => void exportResult(), { signal: pageLifetime.signal });
    byId('reload').addEventListener(
        'click',
        () => {
            springDrag?.dispose();
            const url = new URL(location.href);
            url.searchParams.set('threading', 'single');
            location.assign(url.href);
        },
        { signal: pageLifetime.signal },
    );
    window.addEventListener(
        'keydown',
        (event) => {
            if (event.code !== 'Space' || event.repeat || !(event.target instanceof HTMLElement)) return;
            if (
                ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(event.target.tagName) ||
                event.target.isContentEditable
            )
                return;
            event.preventDefault();
            intentQueue.push('launch');
        },
        { signal: inputLifetime.signal },
    );
    window.addEventListener('error', (event) => fail(event.error || event.message), { signal: inputLifetime.signal });
    window.addEventListener('unhandledrejection', (event) => fail(event.reason), { signal: inputLifetime.signal });
    Object.assign(window, {
        __airApp: app,
        __box3dPlayground: Object.freeze({
            snapshot,
            close: closePlayground,
            command: (intent: Intent) => {
                if (!['toggle', 'reset', 'launch', 'demo', 'parameters'].includes(intent))
                    throw new Error('Unknown EX01 command.');
                intentQueue.push(intent);
            },
        }),
    });
    phase = 'ready';
    app.run(scene);
    springDrag = createSpringDrag(app.canvas, camera, CONFIG.drag, {
        onSelect(name) {
            demoActive = false;
            bootDemoPending = false;
            log('drag-selected', { name, scope: 'native-COM Box/Sphere/Capsule/Hull and same-body compound' });
        },
        onError(error) {
            errors.push(String(error));
            log('drag-error', String(error));
            tell(`真实拾取/拖拽未能继续：${String(error)}。不使用替代射线或姿态动画。`, true);
            updateDragReadout();
        },
    });
    window.addEventListener(
        'pagehide',
        () => {
            springDrag?.dispose();
            pageLifetime.abort();
            inputLifetime.abort();
            // Page exit does not await teardown. This is input cancellation, not a close receipt.
        },
        { signal: inputLifetime.signal },
    );
    byId('boot').hidden = true;
    enableControls();
    log('ready', { config: CONFIG, assetCount: assets.length, backend: nativeIdentity });
    try {
        const response = await fetch(new URL('../source-identity.json', import.meta.url));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        sourceIdentity = await response.json();
        value(
            'identity-status',
            `源码身份已载入 · AIR ${AIR_BUILD_DATE} #${AIR_BUILD_NUMBER}。导出时另取主包 SHA-256。`,
        );
    } catch (error) {
        identityError = String(error);
        value('identity-status', `源码身份不可用：${identityError}。导出将保留缺失状态。`);
    }
}
void main().catch(fail);
