/** EX02 candidate: public SDK223 only; CPU checks are not physics acceptance. */
import {
    createAirApp,
    AIR_BUILD_NUMBER,
    AIR_REVISION,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    PhysicsMaterial,
    RigidBody,
    ERigidBodyType,
    BoxCollider,
    SphereCollider,
    Color,
    Vec3,
    Layers,
    primitives,
    utils,
    physics,
    director,
    Director,
    registerBox3DBeforeStep,
    readBox3DBodyMotion,
    createBox3DKinematicTarget,
    queryBox3DCommittedColliders,
} from 'cocosair';
import type { AirApp, Box3DBodyMotion, Box3DKinematicTargetHandle } from 'cocosair';
import {
    FIXED_DT,
    SUBSTEPS,
    WINDOW_TICKS,
    clock,
    assertClock,
    pinPositions,
    down,
    assertLive,
    massChoice,
    targetPose,
    IdleQueue,
} from './protocol.mjs';
import { Lifecycle } from './lifecycle.mjs';
import { releaseOwned, attemptStops } from './cleanup.mjs';
const lifecycle = new Lifecycle();
type Row = Record<string, unknown>;
type Actor = {
    id: string;
    generation: number;
    alive: boolean;
    node: Node;
    body: RigidBody;
    colliders: Array<BoxCollider | SphereCollider>;
    marker?: Node;
};
type Run = {
    generation: number;
    status: string;
    acceptance: 'NOT_RUN';
    frames: Row[];
    clocks: Row[];
    requests: Row[];
    geometry: Row[];
    score: string[];
};
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => el<HTMLButtonElement>(id);
const history: Run[] = [],
    log: Row[] = [],
    operations = new IdleQueue();
let app: AirApp | undefined, system: physics.PhysicsSystem, scene: Scene;
let hook: ReturnType<typeof registerBox3DBeforeStep> | undefined, target: Box3DKinematicTargetHandle | undefined;
let unsubscribe: (() => void) | undefined, identity: unknown;
let assets: Array<Material | PhysicsMaterial | ReturnType<typeof utils.createMesh>> = [];
let actors: Actor[] = [],
    pins: Actor[] = [],
    ball: Actor,
    platform: Actor,
    run: Run | undefined;
let generation = 0,
    tick = -1,
    attempt = -1,
    observed = -1,
    steps = 0;
let running = false,
    fired = false,
    impulsePending = false,
    geometryPending = true;
const status = (message: string) => {
    el('status').textContent = message;
};
function ui() {
    const blocked = !app || lifecycle.faulted || lifecycle.closed || lifecycle.closing || lifecycle.transitioning;
    button('start').disabled = blocked;
    button('reset').disabled = blocked;
    for (const id of ['center', 'offcenter']) button(id).disabled = blocked || !running || fired || impulsePending;
    button('mass-apply').disabled = blocked || !running;
    el<HTMLSelectElement>('mass').disabled = blocked;
    button('close').disabled = !app || lifecycle.closed || lifecycle.closing || lifecycle.sdkCloseStarted;
    el('counts').textContent =
        `Generation ${generation} · native observations ${steps}/${WINDOW_TICKS} · fallen ${run?.score.length ?? 0}/10\nAcceptance NOT_RUN · reset leak evidence NOT_RUN`;
}
function dispose() {
    hook?.dispose();
    hook = undefined;
    target?.dispose();
    target = undefined;
}
function fault(error: unknown, source: string) {
    log.push({ kind: 'fault', source, error: String(error), generation, tick });
    lifecycle.faulted = true;
    running = false;
    if (run && run.status === 'RUNNING') run.status = 'FAULTED';
    queueMicrotask(() => {
        try {
            if (system) system.enable = false;
            dispose();
        } catch (e) {
            log.push({ kind: 'cleanup-fault', error: String(e) });
        }
        status(
            `BLOCKED: ${error} · ${lifecycle.sdkCloseStarted ? 'terminal Close already invoked; export and reload' : 'Close preparation available'}; evidence retained`,
        );
        ui();
    });
}
function idle(label: string, work: () => void, token = generation, owner = run) {
    queueMicrotask(() => {
        if (
            token !== generation ||
            lifecycle.faulted ||
            lifecycle.closed ||
            lifecycle.closing ||
            lifecycle.transitioning ||
            !running
        ) {
            owner?.requests.push({ label, status: 'CANCELLED', generation: token });
            return;
        }
        try {
            work();
            owner?.requests.push({
                label,
                status: 'SUBMITTED_AT_IDLE_NOT_RESULT',
                generation: token,
                afterTick: tick,
            });
            ui();
        } catch (error) {
            fault(error, label);
        }
    });
}
function motion(actor: Actor) {
    assertLive(actor, generation);
    return readBox3DBodyMotion(actor.body);
}
function paint(rgb: number[]) {
    const m = new Material();
    assets.push(m);
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(rgb[0], rgb[1], rgb[2], 255));
    m.setProperty('roughness', 0.7);
    return m;
}
function visual(n: Node, geometry: Parameters<typeof utils.createMesh>[0], material: Material) {
    const mesh = utils.createMesh(geometry);
    assets.push(mesh);
    const r = n.addComponent(MeshRenderer);
    r.mesh = mesh;
    r.setSharedMaterial(material, 0);
}
function actor(name: string, position: Vec3, type: ERigidBodyType, mass: number) {
    const n = new Node(name);
    n.active = false;
    scene.addChild(n); // Retain even if construction fails before activation/app.run.
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(position);
    const body = n.addComponent(RigidBody);
    body.type = type;
    body.mass = mass;
    body.useGravity = type === ERigidBodyType.DYNAMIC;
    body.allowSleep = false;
    body.linearDamping = 0.02;
    body.angularDamping = 0.02;
    const a: Actor = {
        id: `g${generation}:${name}`,
        generation,
        alive: true,
        node: n,
        body,
        colliders: [],
    };
    actors.push(a);
    return a;
}
function box(a: Actor, size: Vec3, center: Vec3, material: Material, surface: PhysicsMaterial) {
    const c = a.node.addComponent(BoxCollider);
    c.size = size;
    c.center = center;
    c.sharedMaterial = surface;
    a.colliders.push(c);
    const child = new Node('box visual');
    child.layer = Layers.Enum.DEFAULT;
    child.setPosition(center);
    a.node.addChild(child);
    visual(child, primitives.box({ width: size.x, height: size.y, length: size.z }), material);
}
function sphere(a: Actor, radius: number, center: Vec3, material: Material, surface: PhysicsMaterial) {
    const c = a.node.addComponent(SphereCollider);
    c.radius = radius;
    c.center = center;
    c.sharedMaterial = surface;
    a.colliders.push(c);
    const child = new Node('sphere visual');
    child.layer = Layers.Enum.DEFAULT;
    child.setPosition(center);
    a.node.addChild(child);
    visual(child, primitives.sphere(radius), material);
}
function activate(a: Actor, markerMaterial?: Material) {
    scene.addChild(a.node);
    a.node.active = true;
    if (markerMaterial) {
        const n = new Node(`${a.id}:native-COM`);
        n.layer = Layers.Enum.DEFAULT;
        n.active = false;
        scene.addChild(n);
        visual(n, primitives.sphere(0.065), markerMaterial);
        // Axes extend outside the opaque body so the native COM marker remains legible.
        // These child meshes have no physics; all three are centered on the exact native COM.
        for (const size of [new Vec3(0.95, 0.015, 0.015), new Vec3(0.015, 0.95, 0.015), new Vec3(0.015, 0.015, 0.95)]) {
            const axis = new Node('native COM crosshair');
            axis.layer = Layers.Enum.DEFAULT;
            n.addChild(axis);
            visual(axis, primitives.box({ width: size.x, height: size.y, length: size.z }), markerMaterial);
        }
        a.marker = n;
    }
}
function geometry(a: Actor) {
    return a.colliders.map((c) => ({
        kind: c instanceof BoxCollider ? 'box' : 'sphere',
        center: { x: c.center.x, y: c.center.y, z: c.center.z },
        dimensions: c instanceof BoxCollider ? [c.size.x, c.size.y, c.size.z] : [c.radius],
    }));
}
function mount() {
    generation++;
    tick = attempt = observed = -1;
    steps = 0;
    fired = impulsePending = false;
    geometryPending = true;
    actors = [];
    pins = [];
    run = {
        generation,
        status: 'RUNNING',
        acceptance: 'NOT_RUN',
        frames: [],
        clocks: [],
        requests: [],
        geometry: [],
        score: [],
    };
    history.push(run);
    scene = new Scene('box3d-compound-bowling');
    const cameraNode = new Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(7, 7, 10);
    cameraNode.lookAt(new Vec3(0, 0, -1));
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 48;
    camera.near = 0.01;
    camera.far = 100;
    camera.visibility = Layers.Enum.DEFAULT;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(12, 22, 32, 255);
    const light = new Node('Light');
    scene.addChild(light);
    light.addComponent(DirectionalLight);
    light.setRotationFromEuler(-55, -20, 0);
    const surface = new PhysicsMaterial();
    assets.push(surface);
    surface.friction = 0.35;
    surface.restitution = 0.05;
    const ivory = paint([235, 222, 195]),
        green = paint([55, 225, 210]),
        orange = paint([230, 140, 65]),
        blue = paint([55, 85, 110]);
    const floor = actor('floor', new Vec3(0, -0.65, -1), ERigidBodyType.STATIC, 1);
    box(floor, new Vec3(10, 0.3, 15), new Vec3(), blue, surface);
    activate(floor);
    const lane = actor('approach lane', new Vec3(0, -0.15, 3.5), ERigidBodyType.STATIC, 1);
    box(lane, new Vec3(4.6, 0.3, 7.6), new Vec3(), blue, surface);
    activate(lane);
    platform = actor('kinematic platform', new Vec3(0, -0.15, -2.8), ERigidBodyType.KINEMATIC, 1);
    box(platform, new Vec3(4.6, 0.3, 5), new Vec3(), orange, surface);
    activate(platform);
    const mass = massChoice(el<HTMLSelectElement>('mass').value);
    pins = pinPositions().map((p: { x: number; y: number; z: number }, i: number) => {
        const a = actor(`pin-${i + 1}`, new Vec3(p.x, p.y, p.z), ERigidBodyType.DYNAMIC, mass);
        box(a, new Vec3(0.32, 0.7, 0.32), new Vec3(0, -0.25, 0), ivory, surface);
        sphere(a, 0.23, new Vec3(0, 0.32, 0), ivory, surface);
        activate(a, green);
        return a;
    });
    ball = actor('ball', new Vec3(0, 0.38, 3.5), ERigidBodyType.DYNAMIC, 4);
    sphere(ball, 0.36, new Vec3(), orange, surface);
    activate(ball, green);
    app!.run(scene); // synchronous onLoad; noncached body methods belong after this boundary.
    // Public velocity/target commands require the observed owner to be unpaused.
    // This synchronous stack installs the hook before the next native frame can run.
    system.enable = true;
    for (const a of [...pins, ball]) {
        a.body.useCCD = a === ball;
        if (a.body.useCCD !== (a === ball)) throw Error('Mounted useCCD readback mismatch');
        a.body.setLinearVelocity(new Vec3());
        a.body.setAngularVelocity(new Vec3());
        const velocity = new Vec3(),
            angular = new Vec3();
        a.body.getLinearVelocity(velocity);
        a.body.getAngularVelocity(angular);
        run.requests.push({
            kind: 'mounted-configuration',
            id: a.id,
            ccd: a.body.useCCD,
            velocity: { ...velocity },
            angularVelocity: { ...angular },
            requestedMass: a.body.mass,
        });
    }
    target = createBox3DKinematicTarget(platform.body); // mounted exclusive lease, idle only.
    target.setTarget(targetPose(1));
    run.requests.push({
        kind: 'platform-target',
        pose: targetPose(1),
        status: 'SUBMITTED_NOT_RESULT',
    });
    run.geometry.push({
        phase: 'mounted',
        kind: 'PUBLIC_COLLIDER_CONFIGURATION_NOT_NATIVE_GEOMETRY',
        pins: pins.map((a) => ({ id: a.id, geometry: geometry(a) })),
    });
    const token = generation,
        owner = run;
    hook = registerBox3DBeforeStep((context) => {
        try {
            if (token !== generation || !running || lifecycle.faulted) throw Error('Stale before-step');
            const c = clock(context);
            owner.clocks.push(c);
            assertClock(c);
            tick = context.tickIndex;
            attempt = context.attemptId;
            // Copied native geometry for all ten pins on mount and after each mass request.
            // Tiny public sweep only obtains committed proxies; hits are NOT collision evidence.
            if (geometryPending) {
                for (const pin of pins) {
                    const q = queryBox3DCommittedColliders(
                        context,
                        pin.colliders,
                        { x: 0, y: 0, z: 0.000001 },
                        { group: 1, mask: 0xffffffff, queryTrigger: false },
                    );
                    owner.geometry.push({
                        phase: 'before-step',
                        tick,
                        attempt,
                        worldGeneration: q.worldGeneration,
                        nativeStepIndex: q.nativeStepIndex,
                        nativeMutationRevision: q.nativeMutationRevision,
                        source: pin.id,
                        body: motion(pin),
                        children: q.children.map((c) => ({
                            kind: c.kind,
                            origin: c.origin,
                            rotation: c.rotation,
                            dimensions: c.dimensions,
                        })),
                    });
                }
                geometryPending = false;
            }
        } catch (error) {
            fault(error, 'before-step');
            throw error;
        }
    });
    running = true;
    system.enable = true;
    status('原生运行 · COM 标记等待公开读回 · NOT_RUN');
    ui();
}
function copyPoseCheck(a: Actor, m: Readonly<Box3DBodyMotion>) {
    const p = a.node.worldPosition,
        q = a.node.worldRotation,
        r = m.rotation;
    const poseError = Math.max(
        Math.hypot(p.x - m.position.x, p.y - m.position.y, p.z - m.position.z),
        Math.min(
            Math.hypot(q.x - r.x, q.y - r.y, q.z - r.z, q.w - r.w),
            Math.hypot(q.x + r.x, q.y + r.y, q.z + r.z, q.w + r.w),
        ),
    );
    // Native localCenter -> world COM consistency, never estimated from visible geometry.
    const v = m.localCenter,
        u = {
            x: r.y * v.z - r.z * v.y,
            y: r.z * v.x - r.x * v.z,
            z: r.x * v.y - r.y * v.x,
        };
    const expected = {
        x: m.position.x + v.x + 2 * (r.w * u.x + r.y * u.z - r.z * u.y),
        y: m.position.y + v.y + 2 * (r.w * u.y + r.z * u.x - r.x * u.z),
        z: m.position.z + v.z + 2 * (r.w * u.z + r.x * u.y - r.y * u.x),
    };
    return {
        poseError,
        comFrameConsistencyError: Math.hypot(
            expected.x - m.worldCOM.x,
            expected.y - m.worldCOM.y,
            expected.z - m.worldCOM.z,
        ),
    };
}
function afterPhysics() {
    if (!running || lifecycle.faulted || tick < 0 || observed === tick) return;
    try {
        observed = tick;
        steps++;
        const owner = run!;
        const rows = [...pins, ball, platform].map((a) => {
            const m = motion(a);
            if (!m.enabled || m.massPending) throw Error('Disabled or mass-pending native observation');
            if (pins.includes(a) && down(m.rotation) && !owner.score.includes(a.id)) owner.score.push(a.id);
            // Only nonphysics marker nodes are positioned here. Never move a live body's Node.
            if (a.marker) {
                a.marker.active = true;
                a.marker.setPosition(m.worldCOM.x, m.worldCOM.y, m.worldCOM.z);
            }
            return { id: a.id, motion: m, ...copyPoseCheck(a, m) };
        });
        const row = {
            generation,
            tick,
            attempt,
            step: steps,
            phase: 'after-physics',
            actors: rows,
            score: [...owner.score],
        };
        owner.frames.push(row);
        el('observation').textContent = JSON.stringify(
            {
                step: steps,
                ball: rows[pins.length],
                firstPin: rows[0],
                platform: rows.at(-1),
            },
            null,
            2,
        );
        if (steps >= WINDOW_TICKS)
            idle('end-observation-window', () => {
                running = false;
                system.enable = false;
                dispose();
                owner.status = 'OBSERVATION_WINDOW_ENDED_NOT_ACCEPTANCE';
                status('观察窗口结束 · 原生证据待审核 · NOT_RUN');
            });
        else
            idle('platform-target', () => {
                const pose = targetPose(steps + 1);
                target!.setTarget(pose);
                owner.requests.push({
                    kind: 'platform-target',
                    afterTick: tick,
                    pose,
                    status: 'SUBMITTED_NOT_RESULT',
                });
            });
        ui();
    } catch (error) {
        fault(error, 'after-physics');
    }
}
function impulse(offset: boolean) {
    if (!running || fired || impulsePending || lifecycle.faulted || lifecycle.closing || lifecycle.transitioning)
        return;
    impulsePending = true;
    ui();
    const owner = run!;
    idle('ball-impulse', () => {
        const before = motion(ball);
        if (before.massPending || !before.enabled) throw Error('Ball not ready');
        const relativePoint = new Vec3(offset ? 0.2 : 0, 0, 0),
            impulse = new Vec3(0, 0, -24);
        owner.requests.push({
            kind: 'impulse-request',
            id: ball.id,
            phase: 'idle',
            afterTick: tick,
            space: 'world',
            relativePoint: { ...relativePoint },
            impulse: { ...impulse },
            absolutePointForDisplay: {
                x: before.worldCOM.x + relativePoint.x,
                y: before.worldCOM.y,
                z: before.worldCOM.z,
            },
            before,
        });
        ball.body.applyImpulse(impulse, relativePoint);
        fired = true;
        impulsePending = false;
    });
}
function changeMass() {
    const requested = massChoice(el<HTMLSelectElement>('mass').value),
        owner = run!;
    idle('pin-mass-change', () => {
        const before = pins.map((a) => ({
            id: a.id,
            motion: motion(a),
            geometry: geometry(a),
        }));
        for (const a of pins) a.body.mass = requested;
        geometryPending = true;
        owner.requests.push({
            kind: 'mass-request',
            requested,
            afterTick: tick,
            before,
            afterConfiguration: pins.map((a) => ({
                id: a.id,
                publicMass: a.body.mass,
                geometry: geometry(a),
            })),
            result: 'PENDING_NATIVE_FRAME',
        });
    });
}
async function release(forClose = false) {
    running = false;
    const stopErrors = attemptStops([
        () => {
            if (system) system.enable = false;
        },
        () => {
            hook?.dispose();
            hook = undefined;
        },
        () => {
            target?.dispose();
            target = undefined;
        },
    ]);
    if (stopErrors.length)
        log.push({
            kind: 'release-stop-fault',
            generation,
            forClose,
            errors: stopErrors,
        });
    for (const a of actors) a.alive = false;
    if (run && run.status === 'RUNNING') run.status = 'INTERRUPTED';
    if (!app) throw Error('App unavailable');
    await releaseOwned({
        app,
        scene,
        assets,
        record: (row: Row) => log.push({ ...row, generation }),
    });
    if (stopErrors.length && !forClose) throw Error('Stop failed; scene flushed but reset is blocked');
}
function reset(start: boolean) {
    if (!app || !lifecycle.beginTransition()) return;
    running = false;
    ui();
    void operations
        .enqueue(async () => {
            await release();
            if (lifecycle.closing || lifecycle.closed || lifecycle.faulted) return;
            if (start) mount();
            else status('已释放；历史保留 · NOT_RUN');
        })
        .catch((error: unknown) => fault(error, 'reset'))
        .finally(() => {
            lifecycle.endTransition();
            ui();
        });
}
function close() {
    if (!app || !lifecycle.beginClose()) return;
    running = false;
    ui();
    void operations
        .enqueue(async () => {
            // Faulted owner handles may reject explicit disposal; public scene teardown still runs.
            // Retained stop failures remain in the log; terminal SDK close owns final owner teardown.
            await release(true);
            director.off(Director.EVENT_AFTER_PHYSICS, afterPhysics);
            if (!app?.close) throw Error('Public close unavailable');
            lifecycle.startSdkClose(); // SDK223 permanently caches this Promise, even on failure.
            const receipt = await app.close();
            log.push({ kind: 'close', generation, receipt });
            if (receipt.status !== 'released') throw Error('Terminal SDK Close failed');
            unsubscribe?.();
            window.removeEventListener('error', windowError);
            window.removeEventListener('unhandledrejection', rejection);
            lifecycle.closed = true;
            status('已关闭 · 验收 NOT_RUN');
        })
        .catch((error: unknown) => {
            log.push({ kind: 'close-failed', error: String(error) });
            lifecycle.faulted = true;
            status(
                lifecycle.sdkCloseStarted
                    ? `SDK Close failed: ${error}; terminal cached result, export evidence and reload (no cleanup retry)`
                    : `Close preparation failed: ${error}; SDK close not invoked, preparation may be attempted again`,
            );
        })
        .finally(() => {
            lifecycle.endClose(lifecycle.closed);
            ui();
        });
}
const windowError = (event: ErrorEvent) => fault(event.error ?? event.message, 'window-error');
const rejection = (event: PromiseRejectionEvent) => fault(event.reason, 'unhandled-rejection');
window.addEventListener('error', windowError);
window.addEventListener('unhandledrejection', rejection);
button('start').onclick = () => reset(true);
button('reset').onclick = () => reset(false);
button('close').onclick = close;
button('center').onclick = () => impulse(false);
button('offcenter').onclick = () => impulse(true);
button('mass-apply').onclick = changeMass;
button('export').onclick = () => {
    const blob = new Blob(
        [
            JSON.stringify(
                {
                    schema: 'ex02-compound-bowling-v1',
                    acceptance: 'NOT_RUN',
                    reset20: 'NOT_RUN',
                    build: AIR_BUILD_NUMBER,
                    revision: AIR_REVISION,
                    identity,
                    runs: history,
                    log,
                },
                null,
                2,
            ),
        ],
        { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob),
        a = document.createElement('a');
    a.href = url;
    a.download = 'ex02-compound-bowling.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function boot() {
    const response = await fetch(new URL('../identity.json', import.meta.url));
    if (!response.ok) throw Error('Missing identity');
    identity = await response.json();
    app = await createAirApp({
        canvas: '#GameCanvas',
        screenMode: 'container',
        container: '#scene-host',
        physics: 'box3d',
        physicsOptions: {
            box3d: {
                assetBaseUrl: new URL('../runtime/physics/box3d/st/', import.meta.url).href,
                threading: 'single',
                workerCount: 1,
                solverSubSteps: SUBSTEPS,
            },
        },
    });
    if (!app.diagnostics || !app.releaseScene || !app.close)
        throw Error('Required public diagnostics/release/close unavailable');
    unsubscribe = app.diagnostics.onMessage((message) => {
        log.push({ kind: 'diagnostic', message });
        if (message.severity === 'error') fault(message.message, 'engine-diagnostic');
    });
    system = physics.PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = FIXED_DT;
    system.maxSubSteps = 1;
    system.gravity = new Vec3(0, -9.81, 0);
    director.on(Director.EVENT_AFTER_PHYSICS, afterPhysics);
    status('Ready · 开始建立新场景 · NOT_RUN');
    ui();
}
ui();
void boot().catch((error) => fault(error, 'boot'));
