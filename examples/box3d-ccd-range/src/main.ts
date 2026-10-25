/** EX05: real Box3D only. No manual physics step, teleport, or synthetic collision. */
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
    queryBox3DCommittedRay,
    queryBox3DCommittedColliders,
} from 'cocosair';
import { configuration, counts, assessTrial, FIXED_DT, RADIUS, TRIAL_TICKS } from './protocol.mjs';
import { assertStepClock, copyStepClock, SOLVER_SUB_STEPS } from './fixed-step-contract.mjs';
import { TrialLifecycle } from './lifecycle.mjs';
import { releaseOwned, attemptStops } from './cleanup.mjs';
import { mountAndConfigureBodies } from './mounted-body-configuration.mjs';
const lifecycle = new TrialLifecycle();
const el = (id: string): any => document.getElementById(id)!;
const report: any = {
    schema: 'ex05-ccd-range-v1',
    acceptance: 'NOT_RUN',
    build: AIR_BUILD_NUMBER,
    revision: AIR_REVISION,
    trials: [],
    lifecycle: [],
    gaps: ['PUBLIC_WORLD_CONTINUOUS_DIAGNOSTIC_UNAVAILABLE'],
};
let app: any, system: any, hook: any, scene: any, projectile: any, target: any;
let nodes: Node[] = [];
let assets: any[] = [],
    current: any = null;
let busy = false,
    generation = 0,
    attemptedTick = -1,
    lastObserved = -1;
let lifecycleBusy = false;
let faultScheduled = false;
let unsubscribeDiagnostics: (() => void) | undefined;
let activeRun: Promise<void> = Promise.resolve();
const say = (text: string) => {
    el('status').textContent = text;
};
function controls() {
    for (const id of ['fire', 'batch', 'speed', 'thickness', 'target', 'mode', 'bullet'])
        el(id).disabled = busy || lifecycleBusy || lifecycle.blocked;
    el('reset').disabled = lifecycle.blocked || lifecycleBusy;
    el('close').disabled = !app || !lifecycle.canClose || lifecycleBusy;
    el('counts').textContent = counts(report.trials)
        .map(
            (r: any) =>
                `${r.speed} m/s: ${r.completed}/${r.required} · OK观察 ${r.observedOK} · 失败 ${r.failed} · ${r.acceptance}`,
        )
        .join('\n');
}
function config() {
    return configuration({
        speed: el('speed').value,
        thickness: el('thickness').value,
        target: el('target').value,
        mode: el('mode').value,
        bullet: el('bullet').checked,
    });
}
function paint(color: number[]) {
    const m = new Material();
    assets.push(m);
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(color[0], color[1], color[2], color[3]));
    m.setProperty('roughness', 0.7);
    return m;
}
function node(name: string, x: number, y: number, z: number) {
    const n = new Node(name);
    nodes.push(n);
    n.active = false;
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(x, y, z);
    return n;
}
function visual(n: any, geometry: any, material: any) {
    const mesh = utils.createMesh(geometry);
    assets.push(mesh);
    const r = n.addComponent(MeshRenderer);
    r.mesh = mesh;
    r.setSharedMaterial(material, 0);
}
function activate(n: any) {
    scene.addChild(n);
    n.active = true;
}
function buildScene(c: any) {
    scene = new Scene('box3d-ccd-range');
    const surface = new PhysicsMaterial();
    assets.push(surface);
    surface.friction = 0;
    surface.restitution = 0;
    const cameraNode = node('Camera', -1, 2.5, 5);
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 42;
    camera.near = 0.01;
    camera.far = 100;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(12, 21, 29, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    cameraNode.lookAt(new Vec3(-0.8, 0, 0));
    activate(cameraNode);
    const lightNode = node('Light', 0, 4, 2);
    lightNode.addComponent(DirectionalLight);
    lightNode.setRotationFromEuler(-45, -25, 0);
    activate(lightNode);
    const floor = node('Visual ruler base — no collider', -1, -0.65, 0);
    visual(floor, primitives.box({ width: 5, height: 0.02, length: 1.2 }), paint([37, 58, 70, 255]));
    activate(floor);
    for (let x = -3; x <= 1; x++) {
        const marker = node(`metre ${x}`, x, -0.63, 0);
        visual(marker, primitives.box({ width: 0.015, height: 0.01, length: 1.1 }), paint([85, 130, 140, 255]));
        activate(marker);
    }
    const makeBody = (name: string, x: number, sphere: boolean, dynamic: boolean, color: number[]) => {
        const n = node(name, x, 0, 0);
        visual(
            n,
            sphere ? primitives.sphere(RADIUS) : primitives.box({ width: c.thickness, height: 1, length: 0.8 }),
            paint(color),
        );
        const b = n.addComponent(RigidBody);
        b.type = dynamic ? ERigidBodyType.DYNAMIC : ERigidBodyType.STATIC;
        b.mass = 1;
        b.useGravity = false;
        b.allowSleep = false;
        b.linearDamping = 0;
        b.angularDamping = 0;
        let collider: SphereCollider | BoxCollider;
        if (sphere) {
            const shape = n.addComponent(SphereCollider);
            shape.radius = RADIUS;
            collider = shape;
        } else {
            const shape = n.addComponent(BoxCollider);
            shape.size = new Vec3(c.thickness, 1, 0.8);
            collider = shape;
        }
        collider.sharedMaterial = surface;
        activate(n);
        return { node: n, body: b, collider };
    };
    target = makeBody(c.target, 0, false, c.target !== 'wall', [236, 174, 90, 255]);
    projectile = makeBody('Projectile r=.05m', -2, true, true, [85, 226, 201, 255]);
    projectile.collider.on('onCollisionEnter', (event: any) => {
        if (!current || event.selfCollider !== projectile.collider || event.otherCollider !== target.collider) return;
        const points = event.contacts.map((contact: any) => {
            const point = new Vec3(),
                normal = new Vec3();
            contact.getWorldPointOnA(point);
            contact.getWorldNormalOnA(normal);
            return { point: { x: point.x, y: point.y, z: point.z }, normal: { x: normal.x, y: normal.y, z: normal.z } };
        });
        current.contacts.push({
            trialId: c.trialId,
            projectileId: `${c.trialId}:projectile`,
            targetId: `${c.trialId}:target`,
            tick: attemptedTick,
            target: c.target,
            contactCount: event.contacts.length,
            points,
        });
    });
    return mountAndConfigureBodies({
        app,
        scene,
        system,
        projectile,
        target,
        config: c,
        vector: (x: number, y: number, z: number) => new Vec3(x, y, z),
    });
}
function copyHit(hit: any) {
    return {
        target: hit.collider === target.collider ? 'target' : hit.collider === projectile.collider ? 'self' : 'other',
        logicalId: hit.logicalId,
        distance: hit.distance,
        fraction: hit.fraction,
        point: hit.point,
        normal: hit.normal,
    };
}
function stamp(q: any) {
    return {
        worldGeneration: q.worldGeneration,
        tickIndex: q.tickIndex,
        attemptId: q.attemptId,
        nativeStepIndex: q.nativeStepIndex,
        nativeMutationRevision: q.nativeMutationRevision,
        complete: q.complete,
        hits: q.hits.map(copyHit),
        initialOverlap: q.initialOverlap,
    };
}
function observe() {
    if (!current || attemptedTick < 0 || attemptedTick === lastObserved) return;
    lastObserved = attemptedTick;
    const motion = readBox3DBodyMotion(projectile.body),
        p = projectile.node.worldPosition;
    const q = projectile.node.worldRotation,
        r = motion.rotation;
    const rotationError = Math.min(
        Math.hypot(q.x - r.x, q.y - r.y, q.z - r.z, q.w - r.w),
        Math.hypot(q.x + r.x, q.y + r.y, q.z + r.z, q.w + r.w),
    );
    const row = {
        step: current.trace.length + 1,
        tick: attemptedTick,
        position: motion.position,
        rotation: r,
        velocity: motion.linearVelocity,
        poseError: Math.max(
            Math.hypot(p.x - motion.position.x, p.y - motion.position.y, p.z - motion.position.z),
            rotationError,
        ),
        target: readBox3DBodyMotion(target.body).position,
    };
    current.trace.push(row);
    el('observation').textContent = JSON.stringify(
        { ...row, contacts: current.contacts.length, query: current.queries.at(-1) },
        null,
        2,
    );
    if (current.trace.length === TRIAL_TICKS) {
        const token = generation;
        queueMicrotask(() => {
            if (token === generation && current) finish(false);
        });
    }
}
function finish(aborted: boolean) {
    const errors: string[] = [];
    try {
        if (system) system.enable = false;
    } catch (error) {
        errors.push(String(error));
    }
    try {
        hook?.dispose();
        hook = null;
    } catch (error) {
        errors.push(String(error));
    }
    if (errors.length) {
        report.lifecycle.push({ kind: 'stop-failed', errors });
        aborted = true;
        lifecycle.fault();
    }
    if (current) {
        current.result = assessTrial(current.config, current.trace, current.contacts, aborted);
        report.trials.push(current);
        say(`${current.result.status} · 验收 NOT_RUN`);
        current = null;
    }
    lifecycle.settleTrial();
    controls();
    if (errors.length) say('BLOCKED: stop failed; evidence retained, explicit close required');
    return errors.length === 0;
}
async function release(forClose = false) {
    const errors = attemptStops([
        () => {
            if (system) system.enable = false;
        },
        () => {
            hook?.dispose();
            hook = null;
        },
    ]);
    if (errors.length) report.lifecycle.push({ kind: 'release-stop-failed', errors, forClose });
    await releaseOwned({ app, scene, nodes, assets, record: (row: unknown) => report.lifecycle.push(row) });
    scene = null;
    projectile = target = null;
    if (errors.length && !forClose) throw new Error('Stop failed; cleanup attempted, reset blocked');
}
async function trial(c: any, token: number) {
    await release();
    if (lifecycle.blocked || token !== generation) return;
    const trialConfig = { ...c, trialId: `${token}:${report.trials.length + 1}` };
    const ccdReadback = buildScene(trialConfig);
    attemptedTick = lastObserved = -1;
    current = {
        ccdReadback,
        config: trialConfig,
        generation: token,
        seed: 0,
        stepClocks: [],
        trace: [],
        queries: [],
        contacts: [],
    };
    hook = registerBox3DBeforeStep((context) => {
        try {
            if (!current) throw new Error('Stale EX05 hook');
            current.stepClocks.push(copyStepClock(context));
            assertStepClock(context);
            attemptedTick = context.tickIndex;
            const m = readBox3DBodyMotion(projectile.body);
            const translation = {
                x: m.linearVelocity.x * context.fixedDt,
                y: m.linearVelocity.y * context.fixedDt,
                z: m.linearVelocity.z * context.fixedDt,
            };
            const options = { group: 1, mask: 0xffffffff, queryTrigger: false };
            const ray = queryBox3DCommittedRay(context, m.position, translation, options);
            const sweep =
                c.mode === 'sweep'
                    ? queryBox3DCommittedColliders(context, [projectile.collider], translation, options)
                    : null;
            current.queries.push({ tick: context.tickIndex, ray: stamp(ray), sweep: sweep ? stamp(sweep) : null });
        } catch (error) {
            scheduleFault(error, 'before-step');
            // Preserve engine fail-closed semantics: this attempted tick must not commit.
            throw error;
        }
    });
    await lifecycle.waitForTrial();
}
async function run(amount: number) {
    if (busy || lifecycleBusy || lifecycle.blocked) return;
    const c = config();
    busy = true;
    const token = ++generation;
    controls();
    try {
        for (let i = 0; i < amount && token === generation && !lifecycle.blocked; i++) {
            say(`原生固定步 · ${i + 1}/${amount}`);
            await trial(c, token);
        }
    } catch (error) {
        fail(error);
    } finally {
        busy = false;
        controls();
    }
}
function scheduleFault(error: unknown, source: string) {
    report.lifecycle.push({ kind: 'async-error', source, error: String(error) });
    if (faultScheduled || lifecycle.blocked) return;
    faultScheduled = true;
    queueMicrotask(() => fail(error));
}
const onWindowError = (event: ErrorEvent) => scheduleFault(event.error ?? event.message, 'window-error');
const onUnhandledRejection = (event: PromiseRejectionEvent) => scheduleFault(event.reason, 'unhandled-rejection');
// Do not preventDefault: collector and browser still receive the original error.
window.addEventListener('error', onWindowError);
window.addEventListener('unhandledrejection', onUnhandledRejection);
function fail(error: unknown) {
    report.lifecycle.push({ kind: 'fault', error: String(error) });
    ++generation;
    try {
        finish(true);
    } catch {
        /* Retain original fault, never switch backend. */
    }
    lifecycle.fault();
    controls();
    say(`BLOCKED: ${String(error)} · 不回退物理后端`);
}
async function reset() {
    if (lifecycle.blocked || lifecycleBusy) return;
    lifecycleBusy = true;
    ++generation;
    if (!finish(true)) {
        lifecycleBusy = false;
        controls();
        return;
    }
    busy = true;
    controls();
    try {
        await activeRun;
        busy = true;
        controls();
        await release();
        buildScene(config());
        system.enable = false;
        say('已重置；历史证据保留 · NOT_RUN');
    } catch (error) {
        fail(error);
    } finally {
        lifecycleBusy = false;
        busy = false;
        controls();
    }
}
async function close() {
    if (lifecycleBusy || !app || !lifecycle.beginClose()) return;
    lifecycleBusy = true;
    ++generation;
    finish(true);
    controls();
    director.off(Director.EVENT_AFTER_PHYSICS, afterPhysics);
    try {
        await activeRun;
        await release(true);
        lifecycle.startSdkClose(); // SDK223 caches close forever, including a failed receipt.
        const receipt = await app.close();
        report.lifecycle.push({ kind: 'close', receipt });
        if (receipt.status !== 'released') throw new Error('App close receipt is not released');
        unsubscribeDiagnostics?.();
        window.removeEventListener('error', onWindowError);
        window.removeEventListener('unhandledrejection', onUnhandledRejection);
        lifecycle.completeClose();
        say('已关闭并释放；验收 NOT_RUN');
    } catch (error) {
        report.lifecycle.push({
            kind: 'close-failed',
            sdkCloseStarted: lifecycle.sdkCloseStarted,
            error: String(error),
        });
        say(
            lifecycle.sdkCloseStarted
                ? `SDK Close 失败：${String(error)}；结果已缓存，导出证据后重载，不能重试清理`
                : `关闭准备失败：${String(error)}；尚未调用 SDK Close，可重试准备`,
        );
        lifecycle.failClose();
    } finally {
        lifecycleBusy = false;
        controls();
    }
}
function afterPhysics() {
    try {
        observe();
    } catch (error) {
        scheduleFault(error, 'after-physics');
    }
}
el('diagnostic').onchange = () => {
    el('world-note').hidden = !el('diagnostic').checked;
};
el('fire').onclick = () => {
    activeRun = run(1).catch(fail);
};
el('batch').onclick = () => {
    activeRun = run(30).catch(fail);
};
el('reset').onclick = () => void reset();
el('close').onclick = () => void close();
el('export').onclick = () => {
    const blob = new Blob(
        [JSON.stringify({ ...report, activeTrial: current, counters: counts(report.trials) }, null, 2)],
        { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob),
        a = document.createElement('a');
    a.href = url;
    a.download = 'ex05-ccd-range.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function boot() {
    const response = await fetch('/identity.json');
    if (!response.ok) throw new Error('Missing served identity');
    report.identity = await response.json();
    app = await createAirApp({
        canvas: '#GameCanvas',
        screenMode: 'container',
        container: '#scene-host',
        physics: 'box3d',
        physicsOptions: {
            box3d: {
                assetBaseUrl: '/runtime/physics/box3d/st/',
                threading: 'single',
                workerCount: 1,
                solverSubSteps: SOLVER_SUB_STEPS,
            },
        },
    });
    unsubscribeDiagnostics = app.diagnostics?.onMessage((message: any) => {
        if (message.severity === 'error') scheduleFault(message.message, 'engine-diagnostic');
    });
    system = physics.PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = FIXED_DT;
    system.maxSubSteps = 1;
    system.gravity = new Vec3(0, 0, 0);
    director.on(Director.EVENT_AFTER_PHYSICS, afterPhysics);
    buildScene(config());
    system.enable = false;
    controls();
    say('就绪 · 固定 1/60s · 0/30 · 验收 NOT_RUN');
}
void boot().catch(fail);
