/** EX09 incremental implementation. No runtime body transform writes or alternate physics loop. */
import {
    createAirApp,
    AIR_VERSION,
    AIR_REVISION,
    AIR_BUILD_NUMBER,
    AIR_BUILD_DATE,
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
    CapsuleCollider,
    EAxisDirection,
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
} from 'cocosair';
import * as publicAPI from 'cocosair';
import { HingeDoor } from './hinge-door.mjs';
import { SceneTransport } from './scene-transport.mjs';
import { chooseAttachment } from './attachment-plan.mjs';
import { compoundBounds, intersects, ScaleStation } from './stations.mjs';
import { WorkshopInput, transportBlockers } from './input.mjs';
import { validateWorkshopConfig } from './config.mjs';
import { ObservationTrace } from './observation-trace.mjs';

const el = (id: string) => document.getElementById(id)!;
const say = (id: string, value: string) => {
    el(id).textContent = value;
};
const query = new URLSearchParams(location.search);
const profile = query.get('profile') || 'inventory';
// Explicit opt-in reproduces the retained runtime215 contact-family failure; it is not a passing profile.
const probeUnsupportedContacts = query.get('probe') === 'unsupported-contacts';
const primitiveContactCandidate = query.get('contacts') === 'primitive-candidate';
const transportCandidate = query.get('transport') === 'committed-candidate';
const doorCandidate = transportCandidate && query.get('door') === 'hinge-candidate';
const doorEffectiveConfig = Object.freeze({
    version: 'ex09-door-development-2', massKg: 1, motorForceLimitNm: 20,
    originalContractPivot: [1.65, 1.5, -.425], effectivePivot: [1.65, 1.46, -.425],
    status: 'DIFFERENT_FROM_ORIGINAL_CONTRACT_PENDING_DESIGN_CONFIRMATION',
    leafSize: [1, .04, .848], closedOrigin: [1.65, 1.48, -.001],
    rationale: 'Lower rear axis plus 2 mm front leaf clearance; closed top/chamber/table/SKUs unchanged. Analytic 0–75 degree sweep front clearance 1.057 mm. Finite 20 Nm development torque; actual load motion remains to be verified.',
});
let doorEffectiveHash = '';
let door: any = null;
let doorEntity: any = null;
let doorTrace: any[] = [];
let doorCaptureUntil = -1;
let doorRequestedMode = 'close';
let transportQualification: any = null;
let transport: any = null;
let headEntity: any = null;
const contactObservationEnabled = transportCandidate || probeUnsupportedContacts || primitiveContactCandidate;
const allowedProfiles = ['inventory', 'scale-A', 'scale-B', 'scale-C', 'scale-two', 'scale-edge', 'door-load'];
const capabilities = {
    kinematicTarget: true,
    allShapeSweeps: false,
    initialOverlap: false,
    fixedAttach: true,
    rayVisibility: false,
};
let app: any, scene: any, system: any, cameraNode: any, hook: any;
let config: any, layouts: any, protocol: any, scenarios: any, identity: any, input: any, station: any;
let assets: any[] = [],
    items: any[] = [];
let generation = 0,
    tick = 0,
    attemptedTick = 0,
    tickBase = 0,
    lastNativeObserved = 0;
let viewTop = false;
let paused = false,
    resetting = false,
    closed = false;
let lastObservation: any = null;
let observationTrace = new ObservationTrace();
const events: any[] = [];
const lifecycle: any[] = [];
const limits = { maxEvents: 1000 };
const log = (kind: string, data: any) => {
    events.push({ kind, tick, generation, data });
    if (events.length > limits.maxEvents) events.shift();
};
let firstFailure: unknown = null;
const fail = (error: unknown) => {
    if (firstFailure) return;
    firstFailure = error;
    console.error('[EX09]', error);
    try {
        if (system) system.enable = false;
    } catch {
        /* A faulted owner rejects clock changes; retain original error. */
    }
    say('status', `运行中断：${String(error)}。不切换物理后端。`);
    log('error', String(error));
};
function node(name: string, position: number[]) {
    const n = new Node(name);
    n.active = false;
    n.layer = Layers.Enum.DEFAULT;
    n.setPosition(...(position as [number, number, number]));
    return n;
}
function paint(hex: string) {
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty(
        'mainColor',
        new Color(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255),
    );
    m.setProperty('roughness', 0.65);
    assets.push(m);
    return m;
}
function render(n: any, geometry: any, material: any) {
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
function box(name: string, position: number[], size: number[], material: any, surface: any, solid = true) {
    const n = node(name, position);
    render(n, primitives.box({ width: size[0], height: size[1], length: size[2] }), material);
    let collider: any = null;
    if (solid) {
        const body = n.addComponent(RigidBody);
        body.type = ERigidBodyType.STATIC;
        collider = n.addComponent(BoxCollider);
        collider.size = new Vec3(...(size as [number, number, number]));
        collider.sharedMaterial = surface;
    }
    activate(n);
    return { n, collider };
}
function createItem(entry: any, surface: any, materials: any, scaleCollider: any) {
    const sku = config.skus[entry.skuId],
        n = node(entry.itemId, entry.position);
    n.setRotationFromEuler(0, entry.yawDegrees || 0, 0);
    const body = n.addComponent(RigidBody);
    body.type = ERigidBodyType.DYNAMIC;
    body.mass = sku.massKg;
    body.allowSleep = true;
    body.linearDamping = 0.03;
    body.angularDamping = 0.05;
    const item = {
        ...entry,
        node: n,
        body,
        shapes: sku.shapes,
        contacts: new Map(),
        doorContacts: new Map(),
        held: false,
        colliders: [] as any[],
    };
    for (const [index, shape] of sku.shapes.entries()) {
        const visual = node(`${entry.itemId}-part-${index}`, shape.center);
        const geometry =
            shape.type === 'box'
                ? primitives.box({ width: shape.size[0], height: shape.size[1], length: shape.size[2] })
                : primitives.capsule(shape.radius, shape.radius, shape.cylinderHeight + 2 * shape.radius);
        render(visual, geometry, index === sku.shapes.length - 1 ? materials.metal : materials[entry.skuId]);
        n.addChild(visual);
        visual.active = true;
        const collider: any = shape.type === 'box' ? n.addComponent(BoxCollider) : n.addComponent(CapsuleCollider);
        if (shape.type === 'box') collider.size = new Vec3(...(shape.size as [number, number, number]));
        else {
            collider.radius = shape.radius;
            collider.cylinderHeight = shape.cylinderHeight;
            collider.direction = EAxisDirection.Y_AXIS;
        }
        collider.center = new Vec3(...(shape.center as [number, number, number]));
        collider.sharedMaterial = surface;
        item.colliders.push(collider);
        const contact = (event: any) => {
            if (doorEntity && event.otherCollider === doorEntity.collider) {
                if (event.type === 'onCollisionExit') item.doorContacts.delete(collider);
                else item.doorContacts.set(collider, { tick: attemptedTick, count: event.contacts.length });
            }
            if (event.otherCollider !== scaleCollider) return;
            if (event.type === 'onCollisionExit') {
                item.contacts.delete(collider);
                return;
            }
            const points = event.contacts.map((c: any) => {
                const normal = new Vec3(),
                    point = new Vec3();
                c.getWorldNormalOnA(normal);
                if (c.isBodyA) c.getWorldPointOnB(point);
                else c.getWorldPointOnA(point);
                return {
                    normal: { x: normal.x, y: normal.y, z: normal.z },
                    point: { x: point.x, y: point.y, z: point.z },
                };
            });
            item.contacts.set(collider, { tick: attemptedTick, points });
        };
        if (contactObservationEnabled) {
            collider.on('onCollisionEnter', contact);
            collider.on('onCollisionStay', contact);
            collider.on('onCollisionExit', contact);
        }
    }
    activate(n);
    items.push(item);
}
function setView(top: boolean) {
    viewTop = top;
    say('view', top ? '斜俯视' : '俯视');
    cameraNode.setPosition(top ? 0 : 6.3, top ? 9.5 : 7.8, top ? 0.01 : 9.2);
    cameraNode.lookAt(new Vec3(0, 1, 0));
}
function createScene() {
    generation++;
    observationTrace = new ObservationTrace();
    tick = 0;
    tickBase = lastNativeObserved;
    attemptedTick = lastNativeObserved;
    station = new ScaleStation(config, generation, 'diagnostic-only');
    items = [];
    input = new WorkshopInput(
        protocol,
        {
            configVersion: config.configVersion,
            layoutId: selectedLayout().id,
            roundGeneration: generation,
            inputGeneration: 0,
            state: 'READY',
            tick: 0,
            paused: false,
        },
        capabilities,
    );
    scene = new Scene('box3d-gift-workshop');
    const materials = {
        A: paint('e8aa55'),
        B: paint('72bfb5'),
        C: paint('af92c7'),
        metal: paint('e3e8e2'),
        table: paint('45605a'),
        wall: paint('bcc7b8'),
        scale: paint('79b9ab'),
        floor: paint('253c36'),
        frame: paint('718778'),
    };
    const surface = new PhysicsMaterial();
    surface.friction = 0.55;
    surface.restitution = 0.05;
    assets.push(surface);
    cameraNode = node('Workshop camera', [6.3, 7.8, 9.2]);
    const camera = cameraNode.addComponent(Camera);
    camera.fov = 43;
    camera.near = 0.1;
    camera.far = 60;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(24, 44, 39, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    setView(false);
    activate(cameraNode);
    const ln = node('Soft key light', [0, 9, 3]);
    ln.setRotationFromEuler(-55, -25, 0);
    ln.addComponent(DirectionalLight).illuminance = 45000;
    activate(ln);
    box('Recovery floor', [0, -0.45, 0], [8, 0.2, 6], materials.floor, surface);
    // Four actual table segments leave the exact chamber opening [1.15,2.15] x [-.425,.425].
    box('Stock and scale tabletop', [-0.925, 1.4, 0], [4.15, 0.2, 4], materials.table, surface);
    box('Right tabletop', [2.575, 1.4, 0], [0.85, 0.2, 4], materials.table, surface);
    box('Back tabletop', [1.65, 1.4, -1.2125], [1, 0.2, 1.575], materials.table, surface);
    box('Front tabletop', [1.65, 1.4, 1.2125], [1, 0.2, 1.575], materials.table, surface);
    for (const x of [-2.6, 2.6])
        for (const z of [-1.6, 1.6]) box('Table leg', [x, 0.5, z], [0.15, 1.6, 0.15], materials.frame, surface);
    const scale = box('Scale support', [0, 1.51, -0.75], [0.65, 0.02, 0.65], materials.scale, surface);
    doorTrace = [];
    doorEntity = null;
    if (doorCandidate) {
        const n = node('Real Hinge door — development qualification', doorEffectiveConfig.closedOrigin);
        render(n, primitives.box({ width: 1, height: .04, length: .848 }), materials.metal);
        const body = n.addComponent(RigidBody);
        body.type = ERigidBodyType.DYNAMIC;
        body.mass = doorEffectiveConfig.massKg;
        body.linearDamping = 0;
        body.angularDamping = 0;
        const collider = n.addComponent(BoxCollider);
        collider.size = new Vec3(1, .04, .848);
        collider.sharedMaterial = surface;
        activate(n);
        doorEntity = { node: n, body, collider };
    } else {
        box('Door placeholder — shipping disabled', [1.65, 1.48, 0], [1, 0.04, 0.85], materials.metal, surface);
    }
    for (const x of [1.13, 2.17]) {
        box('Packing wall', [x, 1.8, 0], [0.04, 0.6, 0.93], materials.wall, surface);
        box('Chute side', [x, 0.56, 0], [0.04, 1.84, 0.93], materials.frame, surface);
    }
    for (const z of [-0.445, 0.445]) {
        box('Packing wall', [1.65, 1.8, z], [1, 0.6, 0.04], materials.wall, surface);
        box('Chute wall', [1.65, 0.56, z], [1, 1.84, 0.04], materials.frame, surface);
    }
    box('Receiver floor', [1.65, -0.4, 0], [1, 0.1, 0.85], materials.scale, surface);
    // Gantry/head are presentation only, never a substitute kinematic controller.
    for (const x of [-2.9, 2.6])
        box('Gantry post', [x, 2.2, -1.85], [0.08, 1.4, 0.08], materials.frame, surface, false);
    box('Gantry rail', [-0.15, 2.9, -1.85], [5.6, 0.08, 0.08], materials.frame, surface, false);
    const head = box('Magnetic head', [0, 2.6, -0.75], [0.18, 0.12, 0.18], materials.metal, surface, false);
    headEntity = null;
    if (transportCandidate) {
        // Configure before activation; thereafter only the protected public target lease may move it.
        head.n.active = false;
        const body = head.n.addComponent(RigidBody);
        body.type = ERigidBodyType.KINEMATIC;
        body.linearDamping = 0;
        body.angularDamping = 0;
        const collider = head.n.addComponent(BoxCollider);
        collider.size = new Vec3(0.18, 0.12, 0.18);
        collider.sharedMaterial = surface;
        headEntity = {
            node: head.n,
            body,
            colliders: [collider],
            shapes: [{ type: 'box', center: [0, 0, 0], size: [0.18, 0.12, 0.18] }],
        };
        head.n.active = true;
    }
    if (profile === 'door-load') {
        if (!doorCandidate) throw new Error('door-load requires explicit real Hinge candidate');
        for (const [i, skuId] of ['A', 'C'].entries()) createItem({ itemId: `DOOR-${skuId}-1`, itemGeneration: 1, skuId, position: [1.4 + i * .5, 1.5 - config.skus[skuId].localBounds.min[1] + .12, 0], yawDegrees: 0 }, surface, materials, scale.collider);
    } else if (profile === 'inventory')
        for (const entry of selectedLayout().items) createItem(entry, surface, materials, scale.collider);
    else {
        const skuId = profile === 'scale-two' || profile === 'scale-edge' ? 'A' : profile.slice(-1);
        const y = 1.52 - config.skus[skuId].localBounds.min[1] + 0.24;
        createItem(
            {
                itemId: `DIAG-${skuId}-1`,
                itemGeneration: 1,
                skuId,
                position: [profile === 'scale-edge' ? 0.26 : profile === 'scale-two' ? -0.17 : 0, y, -0.75],
                yawDegrees: 0,
            },
            surface,
            materials,
            scale.collider,
        );
        if (profile === 'scale-two')
            createItem(
                { itemId: 'DIAG-B-2', itemGeneration: 1, skuId: 'B', position: [0.17, 1.94, -0.75], yawDegrees: 0 },
                surface,
                materials,
                scale.collider,
            );
    }
    app.run(scene);
    // The public hook is admitted only while the owner is ready; no step occurs synchronously here.
    system.enable = true;
    if (doorEntity) door = new HingeDoor({ api: publicAPI, ...doorEntity, pivotA: [0, -.02, -.424], pivotB: doorEffectiveConfig.effectivePivot, axis: config.machine.packing.hingeAxis, config: config.machine.packing, motorForceLimit: doorEffectiveConfig.motorForceLimitNm });
    if (transportCandidate) {
        input.context.state = 'TUTORIAL'; // Isolated, unscored transport rehearsal. No order session completion.
        transport = new SceneTransport({
            api: publicAPI,
            config,
            qualification: transportQualification,
            head: headEntity,
            getItems: () => items,
            getState: () => ({
                state: input.context.state,
                paused,
                roundGeneration: generation,
                inputGeneration: input.context.inputGeneration,
            }),
            createDisabledFixed: () => {
                const constraint = headEntity.node.addComponent((publicAPI as any).FixedConstraint);
                constraint.enabled = false;
                return constraint;
            },
            freshIdleAttachment: () => {
                // A fresh idle all-ray is an additional check, never a replacement for the committed producer ray.
                const token = { tickIndex: attemptedTick, attemptId: 0 };
                const plan = transport.attachmentPlan(token, readBox3DBodyMotion(headEntity.body));
                const visibility = plan.requests.map((r: any) => {
                    const length = Math.hypot(...r.translation);
                    const ray = new (publicAPI as any).geometry.Ray(
                        ...r.from,
                        ...r.translation.map((v: number) => v / length),
                    );
                    system.raycast(ray, 0xffffffff, length, false);
                    return {
                        requestId: r.requestId,
                        snapshotToken: token,
                        complete: true,
                        status: 'supported',
                        hits: system.raycastResults.map((hit: any) => ({
                            collider: hit.collider,
                            fraction: hit.distance / length,
                        })),
                    };
                });
                return chooseAttachment(plan, visibility, transport.context(token));
            },
        });
    }
    hook = registerBox3DBeforeStep((context: any) => {
        // Capture each previous completed tick before another substep; NEVER count render frames as ticks.
        if (context.tickIndex > attemptedTick && attemptedTick > lastNativeObserved) observe(attemptedTick);
        attemptedTick = context.tickIndex;
        if (door) {
            const observation = door.observe(context.tickIndex - 1, generation);
            if ((context.tickIndex <= 5 || context.tickIndex <= doorCaptureUntil) && doorTrace.length < 1800) doorTrace.push({ ...observation, motion: readBox3DBodyMotion(doorEntity.body), items: items.map(item => ({ itemId: item.itemId, itemGeneration: item.itemGeneration, skuId: item.skuId, motion: readBox3DBodyMotion(item.body), directDoorContactCount: [...item.doorContacts.values()].filter((c: any) => c.tick === context.tickIndex - 1).reduce((n: number, c: any) => n + c.count, 0) })) });
        }
        transport?.beforeStep(context);
        if (transport) input.context.inputGeneration = transport.intent.inputGeneration;
    });
    paused = false;
    say('pause', '暂停模拟');
    system.enable = true;
    say(
        'status',
        profile === 'inventory'
            ? '库存与工位真实物理预览。正式搬运 / 三单履约尚未开放。'
            : contactObservationEnabled
              ? '真实称重候选：自然下落、公共接触、全外形和速度连续30个固定tick核验。非正式教程或订单。'
              : `真实下落诊断已运行；本场景未启用已验证的Box/Capsule公开接触，称重明确阻塞。当前build ${AIR_BUILD_NUMBER}。`,
    );
    say('profile-name', profile === 'inventory' ? selectedLayout().id : `诊断 · ${profile}`);
}
function selectedLayout() {
    return layouts.layouts.find((l: any) => l.id === query.get('layout')) || layouts.layouts[0];
}
function observe(nativeTick: number) {
    if (nativeTick <= lastNativeObserved || closed || resetting) return;
    transport?.afterCompletedStep(nativeTick);
    lastNativeObserved = nativeTick;
    tick = nativeTick - tickBase;
    input.context.tick = tick;
    const scale = config.machine.scale;
    const zone = {
        min: [-scale.supportSizeXZ[0] / 2, scale.center[1], scale.center[2] - scale.supportSizeXZ[1] / 2],
        max: [scale.supportSizeXZ[0] / 2, 2.75, scale.center[2] + scale.supportSizeXZ[1] / 2],
    };
    const observed = items.map((item) => {
        const motion = readBox3DBodyMotion(item.body),
            bounds = compoundBounds(item.shapes, motion);
        const contacts = [...item.contacts.values()].filter((c: any) => c.tick === nativeTick) as any[];
        const directSupport = contacts.some((c) =>
            c.points.some((p: any) => p.normal.y > 0.5 && Math.abs(p.point.y - scale.center[1]) < 0.015),
        );
        return {
            itemId: item.itemId,
            itemGeneration: item.itemGeneration,
            skuId: item.skuId,
            motion,
            bounds,
            held: item.held,
            directSupport,
            contacts,
        };
    });
    const candidates = observed.filter((item) =>
        intersects(item.bounds, { min: [zone.min[0], zone.min[1] - 0.005, zone.min[2]], max: zone.max }),
    );
    const receipt = station.observe(tick, candidates, zone);
    if (receipt) log('diagnostic_weigh_pass', receipt);
    lastObservation = {
        tick,
        nativeTick,
        generation,
        profile,
        observed,
        candidateCount: candidates.length,
        stableTicks: station.stableTicks,
        reason: station.reason,
        receipts: [...station.receipts.values()],
    };
    observationTrace.record(lastObservation, receipt);
    say(
        'scale-value',
        station.receipts.size ? `${[...station.receipts.values()][0].measuredMass.toFixed(3)} kg` : '— kg',
    );
    say(
        'scale-status',
        station.receipts.size
            ? '✓ 独立实例称重凭证已生成'
            : !contactObservationEnabled
              ? '称重暂不可用：Box / Capsule 接触未获支持'
              : station.reason,
    );
    if (transport)
        say(
            'status',
            transport.fault
                ? `搬运诊断阻塞：${transport.fault}`
                : transport.lastMovement?.blocked || transport.lastMovement?.ready === false
                  ? transport.lastMovement.reason === 'unrepresentable-translation-target' ? '本步因浮点安全复核停止。请松开方向键后重新输入；未移动目标，不自动脱困。' : `搬运受阻：${transport.lastMovement.reason}。保留查询原流，不自动脱困。`
                  : `真实搬运候选 · ${items.some((item) => item.held) ? '已连接真实 Fixed' : '未持物'}。WASD 平移，Q/E 降升，空格吸附/释放。非正式订单。`,
        );
    say('tick', `${tick} · 60 Hz`);
    say('stock', `${items.length} 件${profile === 'inventory' ? ' / 12' : '（诊断隔离）'}`);
    say(
        'debug',
        JSON.stringify(
            {
                runtime: AIR_BUILD_NUMBER,
                profile,
                tick,
                generation,
                candidates: candidates.length,
                stableTicks: station.stableTicks,
                contacts: observed.map((i) => [i.itemId, i.directSupport]),
                receipts: [...station.receipts.values()],
                blockers: transportBlockers(capabilities),
                transport: transport
                    ? {
                          fault: transport.fault,
                          inputGeneration: transport.intent.inputGeneration,
                          traceCount: transport.trace.length,
                      }
                    : null,
            },
            null,
            2,
        ),
    );
}
function afterPhysics() {
    try {
        if (attemptedTick > lastNativeObserved) observe(attemptedTick);
        if (transport)
            queueMicrotask(() => {
                try {
                    transport?.flushAtIdle();
                    door?.flushAtIdle();
                } catch (error) {
                    fail(error);
                }
            });
    } catch (error) {
        fail(error);
    }
}
async function reset() {
    if (resetting || closed) return;
    if (transport && !system.enable) system.enable = true;
    transport?.disposeAtIdle();
    transport = null;
    door?.disposeAtIdle();
    door = null;
    resetting = true;
    system.enable = false;
    hook?.dispose();
    input.clear();
    say('status', '显式重置：释放本场景商品与诊断凭证，不移动旧刚体，不重启 app。');
    try {
        const release = await app.releaseScene();
        lifecycle.push({ kind: 'scene-release', generation, receipt: release });
        for (const asset of assets.reverse()) asset.destroy();
        assets = [];
        resetting = false;
        createScene();
    } catch (error) {
        resetting = false;
        fail(error);
    }
}
function pause(value: boolean) {
    if (resetting || closed || paused === value) return;
    // Resume the owner before public target operations; pause clears targets before stopping it.
    if (!value) system.enable = true;
    transport?.pause();
    input.clear();
    if (transport) input.context.inputGeneration = transport.intent.inputGeneration;
    paused = value;
    input.context.paused = value;
    system.enable = !value;
    say('pause', value ? '继续模拟' : '暂停模拟');
    if (value) say('status', '已暂停物理与诊断时钟。点击继续，不自动恢复旧输入。');
}
function report() {
    return {
        example: 'EX09',
        status: 'IN_PROGRESS',
        profile,
        notFullGame: true,
        identity,
        build: { version: AIR_VERSION, revision: AIR_REVISION, date: AIR_BUILD_DATE, number: AIR_BUILD_NUMBER },
        config,
        layout: selectedLayout(),
        requirements: scenarios.requiredBIZ,
        capabilities,
        contactQualification: {
            status: primitiveContactCandidate
                ? 'EXPERIMENTAL_CANDIDATE_NOT_BIZ_PASS'
                : 'UNSUPPORTED_IN_DEFAULT_PROFILE',
            primitiveContactCandidate,
            probeUnsupportedContacts,
        },
        transport: transport
            ? {
                  diagnosticOnly: true,
                  qualification: transportQualification,
                  fault: transport.fault,
                  trace: transport.trace,
                  traceMetadata: transport.traceMetadata(),
              }
            : null,
        door: doorCandidate ? { effectiveConfig: doorEffectiveConfig, effectiveConfigSha256: doorEffectiveHash, observation: door?.lastObservation, trace: doorTrace, truncated: doorTrace.length === 1800 } : null,
        observation: lastObservation,
        observationTrace: observationTrace.export(),
        events,
        lifecycle,
    };
}
async function main() {
    if (!allowedProfiles.includes(profile)) throw new Error(`Unknown diagnostic profile: ${profile}`);
    [config, layouts, protocol, scenarios, identity] = await Promise.all(
        [
            '/contracts/config.json',
            '/contracts/layouts.json',
            '/contracts/input-protocol.json',
            '/contracts/scenarios.json',
            '/identity.json',
        ].map(async (url) => {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`Required config unavailable: ${url}`);
            return r.json();
        }),
    );
    validateWorkshopConfig(config, layouts);
    if (doorCandidate) doorEffectiveHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ ...doorEffectiveConfig, packing: config.machine.packing }))))).map(b => b.toString(16).padStart(2, '0')).join('');
    if (transportCandidate) {
        const lock = await (await fetch('./transport-candidate-lock.json')).json();
        if (
            lock.status !== 'READY_FOR_VERIFICATION' ||
            lock.expectedBuild !== AIR_BUILD_NUMBER ||
            identity.runtimeSha256 !== lock.runtimeSha256 ||
            identity.runtimeAssets?.['manifest.json']?.sha256 !== lock.manifestSha256
        )
            throw new Error('Committed transport candidate is NOT_READY or does not match the frozen runtime.');
        transportQualification = lock.qualification;
        Object.assign(capabilities, { allShapeSweeps: true, initialOverlap: true, rayVisibility: true });
    }
    const candidateLockResponse = await fetch('./contact-candidate-lock.json');
    if (!candidateLockResponse.ok) throw new Error('Missing explicit contact-candidate lock');
    const candidateLock = await candidateLockResponse.json();
    if (
        primitiveContactCandidate &&
        (candidateLock.status !== 'READY_FOR_VERIFICATION' ||
            AIR_BUILD_NUMBER !== candidateLock.expectedBuild ||
            identity.runtimeSha256 !== candidateLock.runtimeSha256 ||
            identity.runtimeAssets?.['manifest.json']?.sha256 !== candidateLock.manifestSha256)
    )
        throw new Error(
            'Contact candidate is not bound to the frozen runtime/manifest. No version-range guess or fallback.',
        );
    if (primitiveContactCandidate)
        say(
            'contact-note',
            `runtime${AIR_BUILD_NUMBER}公共primitive接触候选：正在真实验证支承称重。不是完整玩法或BIZ通过。`,
        );
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
                solverSubSteps: 4,
            },
        },
    });
    system = physics.PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = 1 / 60;
    system.maxSubSteps = 4;
    system.gravity = new Vec3(0, -10, 0);
    system.allowSleep = true;
    director.on(Director.EVENT_AFTER_PHYSICS, afterPhysics);
    createScene();
    el('pause').onclick = () => pause(!paused);
    el('reset').onclick = () => void reset();
    el('view').onclick = () => setView(!viewTop);
    if (doorCandidate) {
        el('door-control').hidden = false;
        el('door-control').onclick = () => {
            if (closed || paused) return;
            doorRequestedMode = doorRequestedMode === 'open' ? 'close' : 'open';
            const result = door.request(doorRequestedMode);
            doorCaptureUntil = attemptedTick + 600;
            log('door-intent', { mode: doorRequestedMode, result });
            say('door-control', doorRequestedMode === 'open' ? '门验证：回关' : '门验证：开启');
        };
    }
    el('export').onclick = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `EX09-${profile}-g${generation}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    el('close').onclick = async () => {
        if (closed) return;
        if (transport && !system.enable) system.enable = true;
        transport?.disposeAtIdle();
        door?.disposeAtIdle();
        closed = true;
        hook?.dispose();
        input.clear();
        director.off(Director.EVENT_AFTER_PHYSICS, afterPhysics);
        try {
            const receipt = await app.close();
            lifecycle.push({ kind: 'app-close', receipt });
            for (const a of assets.reverse()) a.destroy();
            assets = [];
            say('status', '场景已关闭。重新载入页面才能再次启动。');
        } catch (error) {
            fail(error);
        }
    };
    if (transportCandidate) {
        const sendIntent = (command: string, payload: any, source = 'keyboard') => {
            if (closed || paused || transport.fault) return;
            transport.synchronize();
            if (transport.intent.source && transport.intent.source !== source) transport.clear('ui-source-switch');
            const packet = {
                protocolVersion: protocol.protocolVersion,
                configVersion: config.configVersion,
                layoutId: selectedLayout().id,
                roundGeneration: generation,
                inputGeneration: transport.intent.inputGeneration,
                seq: input.seq + 1,
                tick: tick + 1,
                source,
                command,
                payload,
            };
            input.context.inputGeneration = transport.intent.inputGeneration;
            const admitted = input.admit(packet);
            log('input-admission', { packet, admitted });
            if (admitted.accepted && input.take(packet.seq)) input.complete(packet.seq, transport.consumeAdmitted(packet));
            input.context.inputGeneration = transport.intent.inputGeneration;
        };
        (el('attach') as HTMLButtonElement).disabled = false;
        el('attach').onclick = () => sendIntent('attach-release', {}, 'ui');
        for (const type of ['keydown', 'keyup'])
            window.addEventListener(
                type,
                (event: any) => {
                    log('keyboard-event', { type, code: event.code, key: event.key, repeat: event.repeat });
                    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space'].includes(event.code) || event.repeat)
                        return;
                    event.preventDefault();
                    sendIntent('key-edge', { code: event.code, down: type === 'keydown' });
                },
                true,
            );
        say('status', '真实搬运候选：WASD 平移，Q/E 降升，空格吸附/释放。只做未计分实操验证，正式三单与出货仍未开放。');
    }
    window.addEventListener('blur', () => pause(true));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pause(true);
    });
    Object.defineProperty(window, '__BOX3D_GIFT_WORKSHOP__', {
        value: Object.freeze({
            observe: () => structuredClone(report()),
            reset,
            pause,
            command: (packet: any) => {
                if (!['pause', 'resume', 'clear-input', 'set-view'].includes(packet?.command)) {
                    const rejected = input.admit(packet);
                    if (!rejected.accepted) return rejected;
                    if (!input.take(packet.seq)) return rejected;
                    if (transport && ['key-edge', 'set-axes', 'attach-release'].includes(packet.command)) {
                        const result = transport.consumeAdmitted(packet);
                        input.context.inputGeneration = transport.intent.inputGeneration;
                        return input.complete(packet.seq, result);
                    }
                    return input.complete(packet.seq, { accepted: false, reason: 'boundary-operation-not-integrated' });
                }
                const acknowledgement = input.admit(packet);
                if (!acknowledgement.accepted) return acknowledgement;
                if (!input.take(packet.seq)) return acknowledgement;
                if (packet.command === 'pause') pause(true);
                if (packet.command === 'resume') pause(false);
                if (packet.command === 'clear-input') input.clear();
                if (packet.command === 'set-view') setView(packet.payload.view === 'top');
                return input.complete(packet.seq, { applied: true, inputGeneration: input.context.inputGeneration });
            },
        }),
    });
    say('build', `CocosAirJS ${AIR_VERSION} · build ${AIR_BUILD_NUMBER} · Box3D ST`);
}
window.addEventListener('error', (event) => fail(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => fail(event.reason));
main().catch(fail);
