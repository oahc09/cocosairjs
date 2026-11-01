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
import { selectTransportCandidate, validateTransportCandidate } from './candidate-admission.mjs';
import { captureReportText, supportsGzip, gzipReportText, downloadReportBlob } from './report-export.mjs';
import { proveRecoveryPlacement } from './recovery-placement.mjs';
import { scaleDisplay } from './scale-display.mjs';
import { ActionReplay, validateReplayStart } from './action-replay.mjs';
import { createCommittedMotionObserver } from './committed-motion-observation.mjs';
import { createWallContactDiagnostics } from './wall-contact-diagnostics.mjs';
import { createOrderAnchoredWallContactDiagnostics } from './wall-contact-order-anchored.mjs';
import { createIdleBoundary } from './idle-boundary.mjs';
import { createRecoveryBoundary, consumeRecoveryBoundary } from './recovery-boundary.mjs';
import { selectRecoveryFixture } from './recovery-fixtures.mjs';
import { resolveSkuCase } from './sku-case.mjs';
import { SUBMISSION_ADMISSION } from './submission-chute-preflight.mjs';
import { REPACK_ADMISSION, deriveRepackProtocol } from './repack-order.mjs';
import { LiveOrderFlow } from './live-order-flow.mjs';
import { doorSupportedItems } from './packing-support.mjs';
import { TriggerZone } from './trigger-zone.mjs';
import { HingeDoor } from './hinge-door.mjs';
import { SceneTransport } from './scene-transport.mjs';
import { chooseAttachment } from './attachment-plan.mjs';
import { compoundBounds, intersects, ScaleStation, rotate } from './stations.mjs';
import { WorkshopInput, transportBlockers } from './input.mjs';
import { validateWorkshopConfig } from './config.mjs';
import { ObservationTrace } from './observation-trace.mjs';

const el = (id: string) => document.getElementById(id)!;
const say = (id: string, value: string) => {
    el(id).textContent = value;
};
const query = new URLSearchParams(location.search);
const transportSelection = selectTransportCandidate(query);
const profile = query.get('profile') || 'inventory';
// Explicit opt-in reproduces the retained runtime215 contact-family failure; it is not a passing profile.
const probeUnsupportedContacts = query.get('probe') === 'unsupported-contacts';
const primitiveContactCandidate = query.get('contacts') === 'primitive-candidate';
const transportCandidate = query.get('transport') === 'committed-candidate';
const triggerCandidate = transportCandidate && query.get('triggers') === 'primitive-candidate';
const wallContactDiagnosticsEnabled = transportCandidate && query.get('diagnostics') === 'wall-contact';
let lowerPositiveZWallCollider: any = null;
let zoneEntities: any = {};
let zones: any = {};
const doorCandidate = transportCandidate && query.get('door') === 'hinge-candidate';
const doorEffectiveConfig = Object.freeze({
    version: 'ex09-door-selected-2',
    previousGeometryVersion: 'ex09-door-development-2',
    massKg: 1,
    motorForceLimitNm: 20,
    originalContractPivot: [1.65, 1.5, -0.425],
    effectivePivot: [1.65, 1.46, -0.425],
    status: 'SELECTED_ENGINEERING_REVISION_ORIGINAL_CONTRACT_RETAINED',
    leafSize: [0.9999998807907104, 0.04, 0.8479998707771301],
    closedOrigin: [1.65, 1.48, -0.001],
    rationale:
        'Lower rear axis plus 2 mm front leaf clearance; closed top/chamber/table/SKUs unchanged. Analytic 0–75 degree sweep front clearance 1.057 mm. Finite 20 Nm torque. Selected-2 additionally shrinks each X/Z half extent by two F32 neighbors toward zero to remove exact core birth overlap with frame. Development-2 completed actual .95 kg O2 and three orders; selected-2 requires fresh native door/recovery validation.',
});
const formalCandidate = doorCandidate && triggerCandidate && query.get('session') === 'development-order';
let recoveryFixture: any = null;
let skuCase: any = null;
let skuCaseConfigSha256: string | null = null;
let flow: any = null;
let pendingBusinessCommands: any[] = [];
let replay: any = null;
let recoveryQueued = false;
let pendingRecoveryBoundary: any = null;
let recoveryIdleBusy = false;
let solidBodies: any[] = [];
let solidIdentityRegistry = new Set<string>();
let recoveryFault: string | null = null;
let stopEvidence: any[] = [];
let sceneIdle: ReturnType<typeof createIdleBoundary> | null = null;
let settledRecoveryId: string | null = null;
let epochForRecovery = -1;
let mutationFenceTick = -1;
let doorEffectiveHash = '';
let door: any = null;
let doorEntity: any = null;
let doorTrace: any[] = [];
let doorCaptureUntil = -1;
let doorRequestedMode = 'close';
let transportQualification: any = null;
let transport: any = null;
let headEntity: any = null;
const wallContactDiagnosticContext = () => ({
    world: system?.physicsWorld,
    roundGeneration: generation,
    appObservedNativeTick: lastNativeObserved,
    capturedAtNativeTick: attemptedTick,
    closed,
    resetting,
    entries: [
        ...items
            .filter((i: any) => i.itemId === 'C4')
            .flatMap((i: any) =>
                i.colliders.map((collider: any, shapeIndex: number) => ({
                    collider,
                    semanticId: 'C4',
                    itemGeneration: i.itemGeneration,
                    shapeIndex,
                })),
            ),
        ...(lowerPositiveZWallCollider
            ? [
                  {
                      collider: lowerPositiveZWallCollider,
                      semanticId: 'lower-positive-Z-wall',
                      itemGeneration: generation,
                      shapeIndex: 0,
                  },
              ]
            : []),
        ...(doorEntity
            ? [{ collider: doorEntity.collider, semanticId: 'door', itemGeneration: generation, shapeIndex: 0 }]
            : []),
    ],
});
// Frozen page-start window; no runtime reconfiguration or public capture command.
const wallContactDiagnostics = createWallContactDiagnostics({
    enabled: wallContactDiagnosticsEnabled,
    context: wallContactDiagnosticContext,
});
const orderAnchoredDiagnostics = createOrderAnchoredWallContactDiagnostics({
    enabled: formalCandidate && query.get('diagnostics') === 'wall-contact-order-anchored',
    context: wallContactDiagnosticContext,
    orderContext: () => ({
        session: flow?.session,
        roundGeneration: generation,
        items,
        closed,
        resetting,
        recovering: recoveryQueued || recoveryIdleBusy || !!flow?.pendingRecovery,
    }),
});
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
        const solidIdentity = `static:${solidBodies.length}:${name}`;
        solidIdentityRegistry.add(solidIdentity);
        solidBodies.push({
            identity: solidIdentity,
            role: 'static',
            body,
            shapes: [{ type: 'box', center: [0, 0, 0], size: [...size] }],
            supportSurface: name === 'Stock and scale tabletop' ? 'stock-table' : undefined,
        });
    }
    activate(n);
    return { n, collider };
}
function sensorBox(name: string, position: number[], size: number[]) {
    const n = node(name, position);
    const body = n.addComponent(RigidBody);
    body.type = ERigidBodyType.STATIC;
    const collider = n.addComponent(BoxCollider);
    collider.size = new Vec3(...(size as [number, number, number]));
    collider.isTrigger = true;
    activate(n);
    return collider;
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
        supportContacts: new Map(),
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
            wallContactDiagnostics.onCollision(attemptedTick, collider, event);
            orderAnchoredDiagnostics.onCollision(attemptedTick, collider, event);
            if (doorEntity && event.otherCollider === doorEntity.collider) {
                if (event.type === 'onCollisionExit') item.doorContacts.delete(collider);
                else item.doorContacts.set(collider, { tick: attemptedTick, count: event.contacts.length });
            }
            if (!item.supportContacts.has(collider)) item.supportContacts.set(collider, new Map());
            if (event.type === 'onCollisionExit') {
                item.supportContacts.get(collider).delete(event.otherCollider);
                if (event.otherCollider === scaleCollider) item.contacts.delete(collider);
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
            item.supportContacts.get(collider).set(event.otherCollider, { tick: attemptedTick, points });
            if (event.otherCollider === scaleCollider) item.contacts.set(collider, { tick: attemptedTick, points });
        };
        if (contactObservationEnabled) {
            collider.on('onCollisionEnter', contact);
            collider.on('onCollisionStay', contact);
            collider.on('onCollisionExit', contact);
        }
    }
    activate(n);
    items.push(item);
    solidIdentityRegistry.add(`item:${item.itemId}:${item.itemGeneration}`);
}
function setView(top: boolean) {
    viewTop = top;
    say('view', top ? '斜俯视' : '俯视');
    cameraNode.setPosition(top ? 0 : 6.3, top ? 9.5 : 7.8, top ? 0.01 : 9.2);
    cameraNode.lookAt(new Vec3(0, 1, 0));
}
function createScene() {
    orderAnchoredDiagnostics.invalidate('scene-reset');
    generation++;
    recoveryQueued = recoveryIdleBusy = false;
    pendingRecoveryBoundary = null;
    settledRecoveryId = null;
    lowerPositiveZWallCollider = null;
    solidBodies = [];
    solidIdentityRegistry = new Set();
    recoveryFault = null;
    stopEvidence = [];
    system.autoSimulation = true;
    pendingBusinessCommands = [];
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
    zoneEntities = {};
    zones = {};
    if (triggerCandidate) {
        zoneEntities.scale = sensorBox('Scale candidate sensor', [0, 1.94, -0.75], [0.65, 0.84, 0.65]);
        zoneEntities.packing = sensorBox('Packing candidate sensor', [1.65, 1.8, 0], [1, 0.6, 0.85]);
        zoneEntities.receiver = sensorBox('Receiver candidate sensor', [1.65, 0.075, 0], [1, 0.85, 0.85]);
    }
    doorTrace = [];
    doorEntity = null;
    const createDoorEntity = () => {
        const n = node('Real Hinge door — development qualification', doorEffectiveConfig.closedOrigin);
        render(
            n,
            primitives.box({
                width: doorEffectiveConfig.leafSize[0],
                height: doorEffectiveConfig.leafSize[1],
                length: doorEffectiveConfig.leafSize[2],
            }),
            materials.metal,
        );
        const body = n.addComponent(RigidBody);
        body.type = ERigidBodyType.DYNAMIC;
        body.mass = doorEffectiveConfig.massKg;
        body.linearDamping = 0;
        body.angularDamping = 0;
        const collider = n.addComponent(BoxCollider);
        collider.size = new Vec3(...(doorEffectiveConfig.leafSize as [number, number, number]));
        collider.sharedMaterial = surface;
        activate(n);
        doorEntity = { node: n, body, collider };
        solidIdentityRegistry.add('door');
    };
    if (doorCandidate) createDoorEntity();
    else {
        box('Door placeholder — shipping disabled', [1.65, 1.48, 0], [1, 0.04, 0.85], materials.metal, surface);
    }
    for (const x of [1.13, 2.17]) {
        box('Packing wall', [x, 1.8, 0], [0.04, 0.6, 0.93], materials.wall, surface);
        box('Chute side', [x, 0.56, 0], [0.04, 1.84, 0.93], materials.frame, surface);
    }
    for (const z of [-0.445, 0.445]) {
        box('Packing wall', [1.65, 1.8, z], [1, 0.6, 0.04], materials.wall, surface);
        const wall = box('Chute wall', [1.65, 0.56, z], [1, 1.84, 0.04], materials.frame, surface);
        // Explicit construction-site semantic registration, never inferred from node names.
        if (z === 0.445) lowerPositiveZWallCollider = wall.collider;
    }
    box('Receiver floor', [1.65, -0.4, 0], [1, 0.1, 0.85], materials.scale, surface);
    for (const solid of recoveryFixture?.staticBoxes ?? [])
        box(`Fixture ${solid.id}`, solid.center, solid.size, materials.wall, surface);
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
        solidIdentityRegistry.add('head');
    }
    if (profile === 'door-load') {
        if (!doorCandidate) throw new Error('door-load requires explicit real Hinge candidate');
        for (const [i, skuId] of ['A', 'C'].entries())
            createItem(
                {
                    itemId: `DOOR-${skuId}-1`,
                    itemGeneration: 1,
                    skuId,
                    position: [1.4 + i * 0.5, 1.5 - config.skus[skuId].localBounds.min[1] + 0.12, 0],
                    yawDegrees: 0,
                },
                surface,
                materials,
                scale.collider,
            );
    } else if (profile === 'inventory')
        for (const entry of (recoveryFixture?.initialLayout ?? selectedLayout()).items)
            createItem(entry, surface, materials, scale.collider);
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
    for (const [name, sensor] of Object.entries(zoneEntities))
        zones[name] = new TriggerZone({
            sensor,
            generation,
            getGeneration: () => generation,
            getItems: () => items,
            getTick: () => attemptedTick,
        });
    const createDoorController = () =>
        new HingeDoor({
            api: publicAPI,
            ...doorEntity,
            pivotA: [0, -0.02, -0.424],
            pivotB: doorEffectiveConfig.effectivePivot,
            axis: config.machine.packing.hingeAxis,
            config: config.machine.packing,
            motorForceLimit: doorEffectiveConfig.motorForceLimitNm,
        });
    if (doorEntity) door = createDoorController();
    if (transportCandidate) {
        input.context.state = formalCandidate ? 'READY' : 'TUTORIAL'; // Isolated, unscored transport rehearsal. No order session completion.
        transport = new SceneTransport({
            api: publicAPI,
            config,
            qualification: transportQualification,
            head: headEntity,
            getItems: () => items,
            getState: () => ({
                state: flow?.pendingRecovery || recoveryQueued ? 'RECOVERY' : input.context.state,
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
    if (formalCandidate) {
        if (profile !== 'inventory') throw new Error('Development order requires the full original inventory');
        const remove = async (refs: any[]) => {
            const ownRegistry = solidIdentityRegistry;
            mutationFenceTick = attemptedTick + 1;
            const keys = new Set(refs.map((r) => `${r.itemId}:${r.itemGeneration}`));
            const retired = items.filter((i) => keys.has(`${i.itemId}:${i.itemGeneration}`));
            for (const item of retired) item.node.destroy();
            items = items.filter((i) => !keys.has(`${i.itemId}:${i.itemGeneration}`));
            for (let n = 0; n < 8 && retired.some((i) => i.node.isValid); n++) await new Promise(requestAnimationFrame);
            if (retired.some((i) => i.node.isValid)) throw new Error('Consumed/retired node destruction incomplete');
            for (const item of retired) ownRegistry.delete(`item:${item.itemId}:${item.itemGeneration}`);
        };
        flow = new LiveOrderFlow({
            config,
            generation,
            inventory: items.map((i) => ({ itemId: i.itemId, itemGeneration: i.itemGeneration, skuId: i.skuId })),
            door,
            consumeAtIdle: remove,
            preflightRecoveryAtIdle: (_refs: any[], plan: any) => {
                if (system.autoSimulation || !recoveryIdleBusy)
                    throw new Error('Recovery requires stopped native simulation');
                const epoch = lastNativeObserved;
                const records = [
                    ...solidBodies,
                    ...items.map((i) => ({ identity: `item:${i.itemId}:${i.itemGeneration}`, role: 'item', ...i })),
                    { identity: 'head', role: 'head', ...headEntity },
                    {
                        identity: 'door',
                        role: 'door',
                        ...doorEntity,
                        shapes: [{ type: 'box', center: [0, 0, 0], size: doorEffectiveConfig.leafSize }],
                    },
                ];
                const bodies = records.map((r) => ({
                    identity: r.identity,
                    role: r.role,
                    itemId: r.itemId,
                    itemGeneration: r.itemGeneration,
                    skuId: r.skuId,
                    supportSurface: r.supportSurface,
                    roundGeneration: generation,
                    nativeTick: epoch,
                    motion: readBox3DBodyMotion(r.body),
                    shapes: bakedRecoveryShapes(r.shapes),
                }));
                const snapshot = structuredClone({
                    roundGeneration: generation,
                    nativeTick: epoch,
                    complete: true,
                    simulationStopped: true,
                    expectedIdentities: [...solidIdentityRegistry],
                    bodies,
                });
                const proof = proveRecoveryPlacement({
                    plan,
                    config,
                    layout: selectedLayout(),
                    snapshot,
                    qualified: true,
                    closedDoor: {
                        motion: {
                            enabled: true,
                            type: ERigidBodyType.DYNAMIC,
                            massPending: false,
                            position: {
                                x: doorEffectiveConfig.closedOrigin[0],
                                y: doorEffectiveConfig.closedOrigin[1],
                                z: doorEffectiveConfig.closedOrigin[2],
                            },
                            rotation: { x: 0, y: 0, z: 0, w: 1 },
                        },
                        shapes: [{ type: 'box', center: [0, 0, 0], size: doorEffectiveConfig.leafSize }],
                    },
                });
                log('recovery-placement', { snapshot, proof });
                return proof;
            },
            restoreAtIdle: async (refs: any[], plan: any, proof: any) => {
                const ownGeneration = generation,
                    ownFlow = flow;
                const keys = new Set(refs.map((r) => `${r.itemId}:${r.itemGeneration}`));
                const oldItems = items.filter((i) => keys.has(`${i.itemId}:${i.itemGeneration}`));
                const held = transport.fixed.held;
                if (held && keys.has(`${held.itemId}:${held.itemGeneration}`)) {
                    transport.fixed.requestRelease('scoped-recovery');
                    transport.flushAtIdle();
                }
                for (const key of keys) station.receipts.delete(key);
                station.stableTicks = 0;
                station.identity = null;
                for (const zone of Object.values(zones) as any[]) zone.invalidate(refs);
                const removeBarrier = remove(refs);
                const oldDoor = plan.resetMechanism ? doorEntity : null;
                if (oldDoor) {
                    door.disposeAtIdle();
                    oldDoor.node.destroy();
                }
                await removeBarrier;
                // Normal engine render frames perform deferred destruction. No private flush or physics step.
                for (let n = 0; n < 8 && [...oldItems, ...(oldDoor ? [oldDoor] : [])].some((i) => i.node.isValid); n++)
                    await new Promise(requestAnimationFrame);
                if (closed || generation !== ownGeneration || flow !== ownFlow)
                    throw new Error('Recovery invalidated by lifecycle boundary');
                if ([...oldItems, ...(oldDoor ? [oldDoor] : [])].some((i) => i.node.isValid))
                    throw new Error('Deferred destruction did not complete');
                const retired = oldItems.map((i) => {
                    let rejected = false;
                    try {
                        readBox3DBodyMotion(i.body);
                    } catch {
                        rejected = true;
                    }
                    return {
                        itemId: i.itemId,
                        itemGeneration: i.itemGeneration,
                        nodeValid: i.node.isValid,
                        oldBodyReadRejected: rejected,
                    };
                });
                if (retired.some((i) => !i.oldBodyReadRejected)) throw new Error('Retired body remained readable');
                const restored = refs.map((ref) => {
                    const original = selectedLayout().items.find(
                        (i: any) => i.itemId === ref.itemId && i.skuId === ref.skuId,
                    );
                    if (!original) throw new Error('Unknown original inventory instance');
                    const entry = { ...original, itemGeneration: ref.itemGeneration + 1 };
                    createItem(entry, surface, materials, scale.collider);
                    return { itemId: entry.itemId, itemGeneration: entry.itemGeneration, skuId: entry.skuId };
                });
                if (oldDoor) {
                    solidIdentityRegistry.delete('door');
                    createDoorEntity();
                    door = createDoorController();
                    flow.door = door;
                    // Retire callbacks bound to the destroyed mechanism; bind the new public controller.
                    installSceneIdleBoundary();
                    door.request('close');
                    door.flushAtIdle();
                }
                system.syncSceneToPhysics();
                const observed = items.map((i) => {
                    const motion = readBox3DBodyMotion(i.body);
                    return {
                        itemId: i.itemId,
                        itemGeneration: i.itemGeneration,
                        skuId: i.skuId,
                        held: i.held,
                        motion,
                        bounds: compoundBounds(i.shapes, motion),
                    };
                });
                const actualDoor = door.observe(lastNativeObserved, generation);
                if (observed.some((i) => !i.motion.enabled || i.motion.massPending) || !actualDoor?.ready)
                    throw new Error('Recovery native readback incomplete');
                settledRecoveryId = plan.recoveryId;
                log('recoveryReset', {
                    plan,
                    proof,
                    restored,
                    retired,
                    observed,
                    actualDoor,
                    nativeTickBefore: epochForRecovery,
                    nativeTickAfter: lastNativeObserved,
                    autoSimulation: system.autoSimulation,
                });
                return {
                    recoveryId: plan.recoveryId,
                    roundGeneration: generation,
                    restored,
                    resourcesCleared: true,
                    mechanismResetCompleted: !oldDoor || actualDoor.closed,
                };
            },
        });
        input.formalIntegrated = true;
    } else flow = null;
    installSceneIdleBoundary();
    hook = registerBox3DBeforeStep((context: any) => {
        // Capture each previous completed tick before another substep; NEVER count render frames as ticks.
        if (context.tickIndex > attemptedTick && attemptedTick > lastNativeObserved) observe(attemptedTick);
        attemptedTick = context.tickIndex;
        replay?.step(flow?.session.tick, generation, paused, flow?.session.state);
        const replayTraceStart = transport?.traceSequence ?? 0;
        for (const packet of pendingBusinessCommands.splice(0)) {
            let result: any = { accepted: false, reason: 'stale-business-boundary' };
            if (
                packet.roundGeneration === generation &&
                packet.inputGeneration === transport.intent.inputGeneration &&
                packet.tick === tick + 1 &&
                !paused
            ) {
                if (packet.command === 'start-round') {
                    result = flow.start({
                        transport: !!transport,
                        scaleContacts: contactObservationEnabled,
                        packingSupport: !!door && !!zones.packing,
                        hingeDoor: !!door,
                        shippingGeometry: !!zones.receiver,
                        recovery: typeof flow.restoreAtIdle === 'function',
                    });
                    if (result.accepted) {
                        station = new ScaleStation(config, generation, 'formal');
                        observationTrace = new ObservationTrace();
                    }
                } else if (packet.command === 'submit-order') {
                    result = flow.submit();
                    orderAnchoredDiagnostics.acceptedSubmit(result, context.tickIndex);
                }
                if (result.accepted) {
                    input.context.state = flow.session.state;
                    transport.clear('business-boundary');
                    input.context.inputGeneration = transport.intent.inputGeneration;
                }
            }
            input.complete(packet.seq, {
                ...result,
                inputGeneration: input.context.inputGeneration,
                state: flow.session.state,
            });
            log('business-command-result', { packet, result });
            if (packet.source === 'runner' && !result.accepted) replay?.stop('business-command-rejected');
        }
        orderAnchoredDiagnostics.prepare(context.tickIndex);
        if (door) {
            const observation = door.observe(context.tickIndex - 1, generation);
            if ((context.tickIndex <= 5 || context.tickIndex <= doorCaptureUntil) && doorTrace.length < 1800)
                doorTrace.push({
                    ...observation,
                    motion: readBox3DBodyMotion(doorEntity.body),
                    items: items.map((item) => ({
                        itemId: item.itemId,
                        itemGeneration: item.itemGeneration,
                        skuId: item.skuId,
                        motion: readBox3DBodyMotion(item.body),
                        directDoorContactCount: [...item.doorContacts.values()]
                            .filter((c: any) => c.tick === context.tickIndex - 1)
                            .reduce((n: number, c: any) => n + c.count, 0),
                    })),
                });
        }
        transport?.beforeStep(context);
        if (replay?.current?.status === 'RUNNING') {
            const rejected = transport.trace.find(
                (row: any) =>
                    row.recordSequence > replayTraceStart &&
                    ((row.kind === 'attachment-query' && !row.proposal?.ready) ||
                        (row.kind === 'transport-query' && row.result?.ready === false) ||
                        row.kind === 'transport-fault'),
            );
            if (rejected || transport.fixed.failedConstraint || transport.fault) replay.stop('physical-input-rejected');
            if (replay.current.status === 'RUNNING')
                say('replay-state', 'AGENT 回放中 · ' + replay.current.cursor + '/' + replay.current.script.length);
        }
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
    say(
        'profile-name',
        skuCase
            ? `${skuCase.caseId} / ${skuCase.variantId} · 出生配置 / 尚未验收`
            : recoveryFixture
              ? `${recoveryFixture.id} · 隔离异常布局 / 尚未验收`
              : profile === 'inventory'
                ? selectedLayout().id
                : `诊断 · ${profile}`,
    );
}
function selectedLayout() {
    return layouts.layouts.find((l: any) => l.id === query.get('layout')) || layouts.layouts[0];
}
function observe(nativeTick: number) {
    if (nativeTick <= lastNativeObserved || closed || resetting) return;
    orderAnchoredDiagnostics.capture(nativeTick);
    wallContactDiagnostics.capture(nativeTick);
    transport?.afterCompletedStep(nativeTick);
    door?.observe(nativeTick, generation);
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
            supportContacts: [...item.supportContacts.values()].flatMap((children: any) =>
                [...children.entries()].flatMap(([other, c]: any) => {
                    if (c.tick !== nativeTick) return [];
                    const peer =
                        other === doorEntity?.collider ? 'door' : items.find((i) => i.colliders.includes(other));
                    return peer
                        ? [{ ...c, peer: peer === 'door' ? peer : `${peer.itemId}:${peer.itemGeneration}` }]
                        : [];
                }),
            ),
        };
    });
    const triggerKeys = triggerCandidate
        ? new Set(zones.scale.candidates(nativeTick).map((i: any) => `${i.itemId}:${i.itemGeneration}`))
        : null;
    const candidates = observed.filter(
        (item) =>
            (!triggerKeys || triggerKeys.has(`${item.itemId}:${item.itemGeneration}`)) &&
            intersects(item.bounds, { min: [zone.min[0], zone.min[1] - 0.005, zone.min[2]], max: zone.max }),
    );
    const receipt =
        recoveryQueued || flow?.pendingRecovery || flow?.session.state === 'RESULT'
            ? null
            : station.observe(tick, candidates, zone);
    if (receipt) log(flow?.session.state !== 'READY' ? 'weigh-receipt' : 'diagnostic_weigh_pass', receipt);
    if (flow) {
        const packingIds = new Set(
            zones.packing.candidates(nativeTick).map((i: any) => `${i.itemId}:${i.itemGeneration}`),
        );
        const receivingIds = new Set(
            zones.receiver.candidates(nativeTick).map((i: any) => `${i.itemId}:${i.itemGeneration}`),
        );
        const packing = observed.filter((i) => packingIds.has(`${i.itemId}:${i.itemGeneration}`));
        const supported = doorSupportedItems(packing, nativeTick);
        for (const item of packing as any[])
            item.supportedByDoorChain = supported.has(`${item.itemId}:${item.itemGeneration}`);
        const chute = { min: [1.15, -0.35, -0.425], max: [2.15, 1.5, 0.425] };
        const shipping = observed.filter(
            (i) => i.bounds.max[1] > 0.5 || receivingIds.has(`${i.itemId}:${i.itemGeneration}`),
        );
        flow.observe(nativeTick, {
            items: flow.session.state === 'PACKING' ? packing : shipping,
            receipts: station.receipts,
            zone: { min: [1.15, 1.5, -0.425], max: [2.15, 2.1, 0.425] },
            chute,
            doorAngle: door.lastObservation?.ready ? door.lastObservation.angleDegrees : NaN,
            held: items.some((i) => i.held),
            channelClear: nativeTick >= mutationFenceTick && !observed.some((i) => intersects(i.bounds, chute)),
            recoveryObservation: { roundGeneration: generation, complete: true, items: observed },
            receiverCandidates: [...receivingIds],
            triggerEvidence: {
                packing: zones.packing.evidence(nativeTick),
                receiver: zones.receiver.evidence(nativeTick),
            },
        });
        input.context.state = flow.session.state;
        const repackEligible =
            flow.session.repackStatus(flow.last).eligible && !recoveryQueued && !flow.pendingRecovery && !recoveryFault;
        el('repack').hidden = !repackEligible;
        (el('repack') as HTMLButtonElement).disabled = !repackEligible;
        say(
            'recover',
            flow.session.state === 'BLOCKED' ? '重试本单' : flow.session.state === 'CLOSING' ? '清理通道' : '掉落回收',
        );
    }
    lastObservation = {
        tick,
        nativeTick,
        generation,
        profile,
        observed,
        triggerEvidence: triggerCandidate ? zones.scale.evidence(nativeTick) : null,
        candidateCount: candidates.length,
        stableTicks: station.stableTicks,
        reason: station.reason,
        receipts: [...station.receipts.values()],
    };
    observationTrace.record(lastObservation, receipt);
    if (headEntity && transport) {
        const head = readBox3DBodyMotion(headEntity.body).position;
        const nearest = observed
            .map((item: any) => {
                const offset = rotate(config.skus[item.skuId].attachmentPoint, item.motion.rotation);
                const lug = offset.map(
                    (v: number, i: number) =>
                        v + [item.motion.position.x, item.motion.position.y, item.motion.position.z][i],
                );
                const delta = [lug[0] - head.x, lug[1] - (head.y - 0.06), lug[2] - head.z];
                return { itemId: item.itemId, delta, distance: Math.hypot(...delta) };
            })
            .sort((a: any, b: any) => a.distance - b.distance)[0];
        say(
            'alignment',
            `磁头 ${head.x.toFixed(3)}, ${head.y.toFixed(3)}, ${head.z.toFixed(3)} m` +
                (nearest
                    ? ` · 最近吊点 ${nearest.itemId} 差值 X/Y/Z ${nearest.delta.map((v: number) => (v * 100).toFixed(1)).join('/')} cm`
                    : ''),
        );
    }

    const display = scaleDisplay(station, candidates, contactObservationEnabled);
    say('scale-value', display.value);
    say('scale-status', display.status);
    say('scale-history', display.history);
    if (transport)
        say(
            'status',
            transport.fault
                ? `搬运诊断阻塞：${transport.fault}`
                : transport.lastMovement?.blocked || transport.lastMovement?.ready === false
                  ? transport.lastMovement.reason === 'unrepresentable-translation-target'
                      ? '本步因浮点安全复核停止。请松开方向键后重新输入；未移动目标，不自动脱困。'
                      : `搬运受阻：${transport.lastMovement.reason}。保留查询原流，不自动脱困。`
                  : flow
                    ? `开发配置三单 · ${flow.session.state} · ${flow.session.reason ?? (items.some((item) => item.held) ? '已连接真实 Fixed' : '逐件称重后装箱')}。WASD 平移，Q/E 升降。尚未完成整体验收。`
                    : `真实搬运候选 · ${items.some((item) => item.held) ? '已连接真实 Fixed' : '未持物'}。WASD 平移，Q/E 降升，空格吸附/释放。非正式订单。`,
        );
    say(
        'dependency',
        doorCandidate
            ? `真实 Hinge 门 · 当前角度 ${door?.lastObservation?.angleDegrees?.toFixed(2) ?? '等待读回'}°。已选定机械方案：后下沿轴 y1.46，前门缝2mm，另有亚微米装配余量待本版实测；保留原设计差异记录。${flow ? '真实称重→提交→触发越面→双件事务已接入；当前候选的三单与恢复/移动端验收见本轮报告。' : '本页仅门机构诊断；三单结果来自独立 g 原流，不能替代本页测试。'}`
            : transportCandidate
              ? '真实逐子形状 sweep / overlap、吊点可见性、Fixed 与 target 已接入本页。拒绝不安全移动，不自动装箱。当前底门仍静态占位，正式订单未开放。'
              : '当前为库存/称重诊断，正式搬运、Hinge 出货与三单计分未开放。',
    );
    say(
        'tick',
        `${tick} · 60 Hz${formalCandidate && query.get('diagnostics') === 'wall-contact-order-anchored' ? ' · O2 提交对齐诊断（新运行，非旧失败复现）' : ''}`,
    );
    if (flow) {
        const s = flow.session,
            order = config.orders[Math.min(s.orderIndex, config.orders.length - 1)];
        say('order-label', order.label);
        say('order-state', `${s.state} · 已选机械方案`);
        say('order-items', order.skus.map((id: string) => config.skus[id].name).join(' ＋ '));
        say('order-mass', `目标 ${order.massKg.toFixed(2)} kg · 每件须有当前实例称重凭证`);
        say('orders-done', `${s.ledger.length} / 3`);
        say('score', `${s.score}`);
        say('round-time', s.state === 'READY' ? '未开始' : `${Math.ceil(s.remainingTicks / 60)}秒`);
    }
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
function bakedRecoveryShapes(shapes: any[]) {
    return shapes.map((s) =>
        s.type === 'box'
            ? { ...s, center: s.center.map(Math.fround), size: s.size.map((v: number) => 2 * Math.fround(v / 2)) }
            : {
                  ...s,
                  center: s.center.map(Math.fround),
                  radius: Math.fround(s.radius),
                  cylinderHeight: 2 * Math.fround(s.cylinderHeight / 2),
              },
    );
}
function recoveryBoundaryContext() {
    const held = transport?.fixed.held;
    return {
        scene,
        flow,
        input,
        transport,
        roundGeneration: generation,
        inputGeneration: transport.intent.inputGeneration,
        state: transport.getState().state,
        businessState: flow.session.state,
        paused,
        heldEpoch: transport.fixed.heldEpoch,
        held: held
            ? { itemId: held.itemId, itemGeneration: held.itemGeneration, body: held.body, constraint: held.constraint }
            : null,
    };
}
function readRepackAtIdle() {
    if (
        system.autoSimulation ||
        transport.fixed.held ||
        recoveryFault ||
        transport.fault ||
        flow.lastNativeTick !== lastNativeObserved ||
        !flow.last
    )
        throw new Error('Repack fresh owner unavailable');
    const sample = structuredClone(flow.last);
    const observed = items.map((item) => {
        const motion = readBox3DBodyMotion(item.body);
        return {
            itemId: item.itemId,
            itemGeneration: item.itemGeneration,
            skuId: item.skuId,
            held: item.held,
            motion,
            bounds: compoundBounds(item.shapes, motion),
        };
    });
    sample.items = sample.items.map((prior: any) => {
        const current = observed.find((i) => i.itemId === prior.itemId && i.itemGeneration === prior.itemGeneration);
        if (!current) throw new Error('Repack changed instance');
        // Contact/support evidence belongs to the last completed step. Do not reuse it
        // if an idle mutation changed a body without another completed observation.
        if (JSON.stringify(current.motion) !== JSON.stringify(prior.motion))
            throw new Error('Repack changed physical observation');
        return { ...prior, ...current };
    });
    sample.held = observed.some((i) => i.held);
    sample.receipts = structuredClone(station.receipts);
    sample.doorAngle = door.observe(lastNativeObserved, generation)?.angleDegrees;
    sample.recoveryObservation = { roundGeneration: generation, complete: true, items: observed };
    return { phase: 'idle-public-body-readback', nativeTick: lastNativeObserved, sample };
}
async function runRecoveryAtIdle(packet: any, boundary: any) {
    // Retire even a rejected token; never let an old microtask clear a newer request.
    const validation = consumeRecoveryBoundary(boundary, {
        packet,
        current: !closed && !resetting && transport && flow ? recoveryBoundaryContext() : null,
        pendingToken: pendingRecoveryBoundary,
    });
    if (pendingRecoveryBoundary !== boundary) return;
    pendingRecoveryBoundary = null;
    if (recoveryIdleBusy || closed || resetting || !validation.accepted) {
        recoveryQueued = false;
        input.context.recoveryPending = false;
        input.complete(packet.seq, {
            accepted: false,
            reason: validation.reason ?? 'stale-recovery-idle-boundary',
            inputGeneration: transport.intent.inputGeneration,
            state: flow.session.state,
        });
        replay?.stop('stale-recovery-idle-boundary');
        return;
    }
    const ownGeneration = generation,
        ownFlow = flow,
        ownInput = input;
    const live = () => !closed && generation === ownGeneration && flow === ownFlow && input === ownInput;
    recoveryIdleBusy = true;
    try {
        if (paused || !system.enable) throw new Error('Recovery acceptance requires an active idle owner');
        transport.clear('recovery-idle-boundary');
        input.context.inputGeneration = transport.intent.inputGeneration;
        system.autoSimulation = false;
        epochForRecovery = lastNativeObserved;
        const ownerReadback = packet.command === 'repack-order' ? readRepackAtIdle() : null;
        const result = flow.recover(packet.command, ownerReadback);
        if (result.accepted) orderAnchoredDiagnostics.invalidate('accepted-recovery');
        input.context.state = flow.session.state;
        input.complete(packet.seq, {
            ...result,
            inputGeneration: input.context.inputGeneration,
            state: flow.session.state,
        });
        log('business-command-result', {
            packet,
            result,
            acceptanceNativeTick: lastNativeObserved,
            simulationStopped: true,
        });
        recoveryQueued = false;
        if (flow.session.state === 'RESULT') {
            sceneIdle?.finishTerminal('RECOVERY_PENALTY_RESULT');
        }
        if (result.accepted && flow.pendingRecovery) {
            await ownFlow.flushAtIdle();
            if (!live()) return;
            if (ownFlow.pendingRecovery?.phase === 'queued') await ownFlow.flushAtIdle();
            if (!live()) return;
            if (flow.pendingRecovery?.phase === 'awaiting-readback') {
                const observed = items.map((i) => {
                    const motion = readBox3DBodyMotion(i.body);
                    return {
                        itemId: i.itemId,
                        itemGeneration: i.itemGeneration,
                        skuId: i.skuId,
                        held: i.held,
                        motion,
                        bounds: compoundBounds(i.shapes, motion),
                    };
                });
                const chute = { min: [1.15, -0.35, -0.425], max: [2.15, 1.5, 0.425] };
                const ack = flow.observeRecoveryAtIdle({
                    doorAngle: door.observe(lastNativeObserved, generation)?.angleDegrees,
                    channelClear: !observed.some((i) => intersects(i.bounds, chute)),
                    recoveryObservation: {
                        roundGeneration: generation,
                        complete: true,
                        settledRecoveryId,
                        items: observed,
                    },
                });
                input.complete(packet.seq, {
                    ...ack,
                    inputGeneration: input.context.inputGeneration,
                    state: flow.session.state,
                });
                log('recovery-native-barrier', {
                    ack,
                    nativeTickBefore: epochForRecovery,
                    nativeTickAfter: lastNativeObserved,
                    settledRecoveryId,
                });
            }
        }
        input.context.state = flow.session.state;
        input.context.recoveryPending = !!flow.pendingRecovery;
        if (!result.accepted && packet.source === 'runner') replay?.stop('business-command-rejected');
        if (flow.pendingRecovery) {
            input.complete(packet.seq, {
                accepted: true,
                physicsCompleted: false,
                status: 'blocked',
                reason: 'recovery-incomplete',
                inputGeneration: input.context.inputGeneration,
                state: flow.session.state,
            });
            replay?.stop('recovery-incomplete');
            say('status', '恢复安全停止：放置或生命周期读回未完成，物理保持停止。');
        }
    } catch (error) {
        if (!live()) return;
        recoveryFault = String(error);
        input.complete(packet.seq, {
            accepted: false,
            reason: String(error),
            inputGeneration: input.context.inputGeneration,
            state: flow?.session.state,
        });
        log('recovery-idle-failed', { error: String(error), packet });
        say('status', '恢复安全停止：' + String(error));
    } finally {
        if (generation === ownGeneration && flow === ownFlow && !closed) {
            recoveryIdleBusy = false;
            recoveryQueued = false;
            input.context.recoveryPending = !!flow?.pendingRecovery || !!recoveryFault;
            if (paused) system.enable = false;
            if (!recoveryFault && !flow?.pendingRecovery && flow?.session.state !== 'RESULT' && !paused)
                system.autoSimulation = true;
        }
    }
}
async function captureStoppedPhysics(reason: string) {
    const ownGeneration = generation,
        ownFlow = flow;
    const sample = () => ({
        observationPhase: 'idle-auto-simulation-stopped',
        autoSimulation: system.autoSimulation,
        attemptedTick,
        lastNativeObserved,
        lastObservedNativeStepIndex: transport?.lastQueryStamp?.nativeStepIndex ?? null,
        lastQueryStamp: transport?.lastQueryStamp ?? null,
        head: readBox3DBodyMotion(headEntity.body),
        door: readBox3DBodyMotion(doorEntity.body),
        items: items.map((i) => ({
            itemId: i.itemId,
            itemGeneration: i.itemGeneration,
            motion: readBox3DBodyMotion(i.body),
        })),
    });
    try {
        if (ownFlow?.consumeInFlight) await ownFlow.consumeInFlight;
        if (closed || generation !== ownGeneration || flow !== ownFlow) return;
        const first = sample();
        // Consumption completes without another physics tick at RESULT. Refresh only
        // the live registry count, never replay observe() or fabricate a new sample.
        say('stock', `${first.items.length} 件${profile === 'inventory' ? ' / 12' : '（诊断隔离）'}`);
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        if (closed || generation !== ownGeneration || flow !== ownFlow) return;
        stopEvidence.push({
            reason,
            first,
            second: sample(),
            evidenceBoundary:
                'public scheduling and copied body readbacks; not an independent idle native-counter getter',
        });
        if (ownFlow?.session.state === 'RESULT') replay?.stop('round-result');
    } catch (error) {
        stopEvidence.push({ reason, error: String(error) });
    }
}
function installSceneIdleBoundary() {
    const ownScene = scene,
        ownFlow = flow,
        ownTransport = transport,
        ownDoor = door,
        ownGeneration = generation;
    const boundary = createIdleBoundary({
        isCurrent: () =>
            sceneIdle === boundary &&
            !closed &&
            !resetting &&
            scene === ownScene &&
            flow === ownFlow &&
            transport === ownTransport &&
            door === ownDoor &&
            generation === ownGeneration,
        isPaused: () => paused || !system.enable,
        isRecoveryBusy: () => recoveryIdleBusy,
        isTerminal: () => ownFlow?.session.state === 'RESULT',
        clearPausedIntent: () => {
            ownTransport?.intent.clear('terminal-paused-boundary');
            ownTransport?.fixed.pause();
        },
        stopTerminal: () => {
            ownTransport?.pause();
            system.autoSimulation = false;
        },
        flushTransport: () => ownTransport?.flushAtIdle(),
        flushFlow: () => ownFlow?.flushAtIdle(),
        flushDoor: () => ownDoor?.flushAtIdle(),
        captureTerminal: (reason: string) => {
            void captureStoppedPhysics(reason);
        },
    });
    sceneIdle = boundary;
}
function afterPhysics() {
    try {
        if (attemptedTick > lastNativeObserved) observe(attemptedTick);
        const boundary = sceneIdle;
        if (boundary)
            queueMicrotask(() => {
                try {
                    boundary.afterPhysics();
                } catch (error) {
                    fail(error);
                }
            });
    } catch (error) {
        fail(error);
    }
}

async function reset() {
    flow?.dispose();
    replay?.stop('reset');
    if (resetting || closed) return;
    if (transport && !system.enable) system.enable = true;
    for (const zone of Object.values(zones) as any[]) zone.dispose();
    zones = {};
    transport?.disposeAtIdle();
    transport = null;
    door?.disposeAtIdle();
    door = null;
    flow = null;
    orderAnchoredDiagnostics.invalidate('scene-reset');
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
    if (value) replay?.stop('pause-cleared-replay');
    if (resetting || closed || paused === value) return;
    // Resume the owner before public target operations; pause clears targets before stopping it.
    if (!value) system.enable = true;
    transport?.pause();
    input.clear();
    if (transport) input.context.inputGeneration = transport.intent.inputGeneration;
    paused = value;
    input.context.paused = value;
    flow?.setPaused(value);
    for (const packet of pendingBusinessCommands.splice(0))
        input.complete(packet.seq, { accepted: false, reason: 'pause-cleared-pending-command' });
    // Recovery already stopped native stepping; keep the ready owner alive until public sync/readback finishes.
    if (!recoveryIdleBusy) system.enable = !value;
    if (!value && !recoveryIdleBusy && !flow?.pendingRecovery && !recoveryFault && flow?.session.state !== 'RESULT')
        system.autoSimulation = true;
    say('pause', value ? '继续模拟' : '暂停模拟');
    if (value) say('status', '已暂停物理与诊断时钟。点击继续，不自动恢复旧输入。');
}
function report() {
    return {
        example: 'EX09',
        ...wallContactDiagnostics.reportFields(),
        ...orderAnchoredDiagnostics.reportFields(),
        agentReplay: replay?.snapshot() ?? [],
        status: 'IN_PROGRESS',
        profile,
        notFullGame: true,
        physicsScheduling: {
            fixedTimeStep: system?.fixedTimeStep,
            maxSubSteps: system?.maxSubSteps,
            solverSubSteps: 4,
            reason: formalCandidate ? 'RESULT_AFTER_EACH_COMPLETED_STEP' : 'diagnostic-default',
        },
        stoppedPhysicsEvidence: stopEvidence,
        recoveryRuntime: {
            queued: recoveryQueued,
            busy: recoveryIdleBusy,
            fault: recoveryFault,
            settledRecoveryId,
            autoSimulation: system?.autoSimulation,
            epochForRecovery,
        },
        identity,
        build: { version: AIR_VERSION, revision: AIR_REVISION, date: AIR_BUILD_DATE, number: AIR_BUILD_NUMBER },
        config,
        layout: selectedLayout(),
        recoveryFixture,
        skuCase,
        skuCaseConfigSha256,
        submissionAdmission: SUBMISSION_ADMISSION,
        repackAdmission: formalCandidate ? REPACK_ADMISSION : null,
        inputProtocolVersion: protocol.protocolVersion,
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
        door: doorCandidate
            ? {
                  effectiveConfig: doorEffectiveConfig,
                  effectiveConfigSha256: doorEffectiveHash,
                  observation: door?.lastObservation,
                  trace: doorTrace,
                  truncated: doorTrace.length === 1800,
              }
            : null,
        orderFlow: flow?.report() ?? null,
        triggerZones: triggerCandidate
            ? Object.fromEntries(
                  Object.entries(zones).map(([name, zone]: any) => [
                      name,
                      {
                          candidates: zone
                              .candidates(attemptedTick)
                              .map((i: any) => ({ itemId: i.itemId, itemGeneration: i.itemGeneration })),
                          events: zone.events,
                          tailEvents: zone.tailEvents,
                          droppedEvents: zone.droppedEvents,
                          boundaryEvents: zone.boundaryEvents,
                          droppedBoundaryEvents: zone.droppedBoundaryEvents,
                      },
                  ]),
              )
            : null,
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
    if (formalCandidate) protocol = deriveRepackProtocol(protocol);
    if (query.has('case') || query.has('variant')) {
        if (
            !formalCandidate ||
            profile !== 'inventory' ||
            query.has('fixture') ||
            (query.has('layout') && query.get('layout') !== 'REBUILD-LAYOUT-01') ||
            query.getAll('case').length !== 1 ||
            query.getAll('variant').length !== 1
        )
            throw new Error('SKU case requires one explicit case/variant and isolated formal inventory profile');
        const response = await fetch('/contracts/abnormal-fixtures.json');
        if (!response.ok) throw new Error('Required original abnormal fixture document unavailable');
        const resolved = resolveSkuCase({
            config,
            layouts,
            document: await response.json(),
            layout: selectedLayout(),
            caseId: query.get('case'),
            variantId: query.get('variant'),
        });
        config = resolved.config;
        skuCase = resolved.selection;
    }
    if (doorCandidate)
        config = {
            ...config,
            baseConfigVersion: config.configVersion,
            configVersion: `${config.configVersion}+${doorEffectiveConfig.version}`,
            machine: {
                ...config.machine,
                packing: {
                    ...config.machine.packing,
                    doorPivot: [...doorEffectiveConfig.effectivePivot],
                    doorLeafSize: [...doorEffectiveConfig.leafSize],
                    doorMassKg: doorEffectiveConfig.massKg,
                    motorForceLimitNm: doorEffectiveConfig.motorForceLimitNm,
                },
            },
        };
    validateWorkshopConfig(config, layouts);
    if (query.has('fixture')) {
        if (!formalCandidate || profile !== 'inventory')
            throw new Error('Recovery fixture requires the isolated formal candidate');
        const response = await fetch('/contracts/abnormal-fixtures.json');
        if (!response.ok) throw new Error('Required original abnormal fixture document unavailable');
        recoveryFixture = selectRecoveryFixture(await response.json(), query.get('fixture'), selectedLayout());
        config = { ...config, configVersion: `${config.configVersion}+${recoveryFixture.effectiveConfigVersion}` };
    }
    if (skuCase)
        skuCaseConfigSha256 = Array.from(
            new Uint8Array(
                await crypto.subtle.digest(
                    'SHA-256',
                    new TextEncoder().encode(JSON.stringify({ config, layout: selectedLayout(), skuCase })),
                ),
            ),
        )
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    if (doorCandidate)
        doorEffectiveHash = Array.from(
            new Uint8Array(
                await crypto.subtle.digest(
                    'SHA-256',
                    new TextEncoder().encode(
                        JSON.stringify({ ...doorEffectiveConfig, packing: config.machine.packing }),
                    ),
                ),
            ),
        )
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    if (transportCandidate) {
        const response = await fetch(`./${transportSelection.lockFile}`);
        if (!response.ok) throw new Error('Missing explicit transport-candidate lock');
        const lock = await response.json();
        validateTransportCandidate(transportSelection, lock, AIR_BUILD_NUMBER, identity);
        if (
            lock.status !== 'READY_FOR_VERIFICATION' ||
            lock.expectedBuild !== AIR_BUILD_NUMBER ||
            identity.runtimeSha256 !== lock.runtimeSha256 ||
            identity.runtimeAssets?.['manifest.json']?.sha256 !== lock.manifestSha256
        )
            throw new Error('Committed transport candidate is NOT_READY or does not match the frozen runtime.');
        identity.selectedTransportCandidate = { ...transportSelection, expectedBuild: lock.expectedBuild };
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
    if (primitiveContactCandidate || transportCandidate)
        say(
            'contact-note',
            `当前 runtime${AIR_BUILD_NUMBER} 使用真实 Box/Capsule 公共接触。单件称重仍须真实支承、全外形及30步稳定。本页为隔离诊断，非完整玩法或BIZ通过。`,
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
    // Formal candidate observes RESULT after every actual fixed step, before another render-frame step.
    // Fixed 1/60 and active-tick time limit are unchanged; this is an explicit development scheduling limit.
    system.maxSubSteps = formalCandidate ? 1 : 4;
    system.gravity = new Vec3(0, -10, 0);
    system.allowSleep = true;
    director.on(Director.EVENT_AFTER_PHYSICS, afterPhysics);
    createScene();
    el('pause').onclick = () => pause(!paused);
    el('reset').onclick = () => void reset();
    el('view').onclick = () => setView(!viewTop);
    if (doorCandidate && !formalCandidate) {
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
    const gzipAvailable = supportsGzip();
    el('export-gzip').disabled = !gzipAvailable;
    say(
        'export-status',
        gzipAvailable ? '支持无损 gzip；完整快照先同步固定，再压缩。' : '此浏览器不支持 gzip，请使用原 JSON 导出。',
    );
    let exportBusy = false;
    const exportReport = async (compressed: boolean) => {
        if (exportBusy) return;
        exportBusy = true;
        el('export-gzip').disabled = true;
        try {
            // No await until both report text and filename identity have been captured.
            const text = captureReportText(report);
            const filename = `EX09-${profile}-g${generation}.json`;
            const blob = compressed ? await gzipReportText(text) : new Blob([text], { type: 'application/json' });
            downloadReportBlob(blob, filename + (compressed ? '.gz' : ''));
            say('export-status', `已请求下载完整${compressed ? ' JSON.gz' : ' JSON'}：${blob.size} 字节（未删字段）。`);
        } catch (error) {
            say('export-status', `导出失败：${String(error)}；原 JSON 导出仍可用。`);
        } finally {
            exportBusy = false;
            el('export-gzip').disabled = !gzipAvailable;
        }
    };
    el('export').onclick = () => {
        try {
            const text = captureReportText(report);
            const filename = `EX09-${profile}-g${generation}.json`;
            const blob = new Blob([text], { type: 'application/json' });
            downloadReportBlob(blob, filename);
            say('export-status', `已请求下载完整 JSON：${blob.size} 字节（未删字段）。`);
        } catch (error) {
            say('export-status', `原 JSON 导出失败：${String(error)}`);
        }
    };
    el('export-gzip').onclick = () => exportReport(true);
    el('close').onclick = async () => {
        flow?.dispose();
        replay?.stop('close');
        if (closed) return;
        if (transport && !system.enable) system.enable = true;
        for (const zone of Object.values(zones) as any[]) zone.dispose();
        zones = {};
        transport?.disposeAtIdle();
        door?.disposeAtIdle();
        orderAnchoredDiagnostics.invalidate('scene-close');
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
    if (formalCandidate) {
        for (const [id, command] of [
            ['start-round', 'start-round'],
            ['submit-order', 'submit-order'],
            ['recover', 'recover-dropped'],
            ['repack', 'repack-order'],
        ]) {
            (el(id) as HTMLButtonElement).disabled = false;
            el(id).onclick = () => {
                if (closed || paused) return;
                transport.synchronize();
                input.context.inputGeneration = transport.intent.inputGeneration;
                const packet = {
                    protocolVersion: protocol.protocolVersion,
                    configVersion: config.configVersion,
                    layoutId: selectedLayout().id,
                    roundGeneration: generation,
                    inputGeneration: input.context.inputGeneration,
                    seq: input.seq + 1,
                    tick: tick + 1,
                    source: 'ui',
                    command:
                        id === 'recover'
                            ? flow.session.state === 'BLOCKED'
                                ? 'retry-order'
                                : flow.session.state === 'CLOSING'
                                  ? 'clear-channel'
                                  : 'recover-dropped'
                            : command,
                    payload: {},
                };
                const ack = (window as any).__BOX3D_GIFT_WORKSHOP__.command(packet);
                log('business-input', { packet, ack });
            };
        }
        say('start-round', '开始开发配置三单');
    }
    if (transportCandidate) {
        const sendIntent = (command: string, payload: any, source = 'keyboard') => {
            if (closed || paused || transport.fault) return;
            replay?.stop('manual-input-interrupted-replay');
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
            if (admitted.accepted && input.take(packet.seq))
                input.complete(packet.seq, transport.consumeAdmitted(packet));
            input.context.inputGeneration = transport.intent.inputGeneration;
        };
        (el('attach') as HTMLButtonElement).disabled = false;
        el('attach').onclick = () => sendIntent('attach-release', {}, 'ui');
        el('fine-controls').hidden = false;
        for (const [id, axes] of Object.entries({
            'fine-left': [-0.25, 0, 0],
            'fine-right': [0.25, 0, 0],
            'fine-back': [0, 0, -0.25],
            'fine-front': [0, 0, 0.25],
            'fine-down': [0, -0.25, 0],
            'fine-up': [0, 0.25, 0],
        })) {
            const button = el(id);
            button.onpointerdown = (event: PointerEvent) => {
                event.preventDefault();
                button.setPointerCapture(event.pointerId);
                sendIntent('set-axes', { x: axes[0], y: axes[1], z: axes[2] }, 'touch');
            };
            const stop = () => sendIntent('set-axes', { x: 0, y: 0, z: 0 }, 'touch');
            button.onpointerup = stop;
            button.onpointercancel = stop;
            button.onlostpointercapture = stop;
        }

        for (const type of ['keydown', 'keyup'])
            window.addEventListener(
                type,
                (event: any) => {
                    if (['TEXTAREA', 'INPUT'].includes((event.target as HTMLElement)?.tagName)) return;
                    log('keyboard-event', { type, code: event.code, key: event.key, repeat: event.repeat });
                    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space'].includes(event.code) || event.repeat)
                        return;
                    event.preventDefault();
                    sendIntent('key-edge', { code: event.code, down: type === 'keydown' });
                },
                true,
            );
        say(
            'status',
            flow
                ? '开发配置三单候选已就绪。点击开始，逐件称重后装箱；仍待完整实屏验收。'
                : '真实搬运候选：WASD 平移，Q/E 降升，空格吸附/释放。非正式订单。',
        );
    }
    window.addEventListener('blur', () => pause(true));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pause(true);
    });
    if (formalCandidate) {
        const send = (command: string, payload: any) => {
            transport.synchronize();
            input.context.inputGeneration = transport.intent.inputGeneration;
            const packet = {
                protocolVersion: protocol.protocolVersion,
                configVersion: config.configVersion,
                layoutId: selectedLayout().id,
                roundGeneration: generation,
                inputGeneration: input.context.inputGeneration,
                seq: input.seq + 1,
                tick: tick + 1,
                source: 'runner',
                command,
                payload,
            };
            const ack = (window as any).__BOX3D_GIFT_WORKSHOP__.applyActions([packet])[0];
            log('agent-replay-input', { packet, ack });
            return { packet, ack };
        };
        replay = new ActionReplay({
            send,
            readAck: (seq: number) => input.acknowledgements.get(seq)?.result,
            onStop: (reason: string) => {
                say('replay-state', 'AGENT 已停止：' + reason + '。脚本结束不代表订单成功。');
                // Clear via the admitted public boundary immediately; pause in idle, not inside producer.
                if (!closed && transport) send('clear-input', { reason: 'source-change' });
                setTimeout(() => {
                    if (!closed) pause(true);
                }, 0);
            },
        });
        el('agent-replay').hidden = false;
        el('replay-run').onclick = () => {
            try {
                if (closed || !flow) throw new Error('先开始真实一局');
                validateReplayStart(
                    (el('replay-script') as HTMLTextAreaElement).value,
                    flow.session.state,
                    recoveryQueued || recoveryIdleBusy || !!flow.pendingRecovery || !!recoveryFault,
                );
                if (!paused) pause(true);
                replay.start((el('replay-script') as HTMLTextAreaElement).value, flow.session.tick, generation);
                // Resume the public world before any target clear; paused guard must remain intact.
                pause(false);
                transport.clear('agent-replay-start');
                input.context.inputGeneration = transport.intent.inputGeneration;
                say('replay-state', 'AGENT 回放已启动，结束或拒绝时自动暂停。');
            } catch (error) {
                replay.stop('start-error');
                say('replay-state', String(error));
            }
        };
        el('replay-cancel').onclick = () => {
            replay.stop('user-cancelled');
            pause(true);
        };
    }
    const observeCommittedMotionV1 = createCommittedMotionObserver({
        readMotion: readBox3DBodyMotion,
        context: () => {
            const held = transport?.fixed.held;
            const itemScope = (i: any) => ({
                itemId: i.itemId,
                itemGeneration: i.itemGeneration,
                skuId: i.skuId,
                body: i.body,
            });
            return {
                scene,
                flow,
                system,
                world: system?.physicsWorld,
                headBody: headEntity?.body,
                closed: closed || !!flow?.disposed || !!transport?.closed,
                resetting,
                paused,
                systemEnabled: system?.enable,
                pending: !!(
                    pendingBusinessCommands.length ||
                    pendingRecoveryBoundary ||
                    recoveryQueued ||
                    recoveryIdleBusy ||
                    flow?.pendingRecovery ||
                    flow?.pendingConsume.length ||
                    flow?.consumeInFlight ||
                    transport?.fixed.pending ||
                    transport?.pendingObservation ||
                    door?.pending ||
                    input?.queue.length ||
                    transport?.intent.actions.length
                ),
                fault: !!(recoveryFault || transport?.fault || transport?.fixed.failedConstraint || flow?.consumeError),
                roundGeneration: generation,
                appObservedNativeTick: lastNativeObserved,
                activeTick: flow?.session.tick,
                inputGeneration: input?.context.inputGeneration,
                heldEpoch: transport?.fixed.heldEpoch,
                state: flow?.session.state,
                configVersion: config.configVersion,
                items: items.map(itemScope),
                held: held ? itemScope(held) : null,
            };
        },
    });
    // Independent read-only export: never pauses, flushes, steps, or changes the report.
    let committedMotionExportBusy = false;
    el('export-committed-motion').disabled = false;
    el('export-committed-motion').onclick = () => {
        if (committedMotionExportBusy) return;
        committedMotionExportBusy = true;
        el('export-committed-motion').disabled = true;
        try {
            const snapshot = observeCommittedMotionV1();
            if (!snapshot.ok) {
                say(
                    'committed-motion-export-status',
                    `未下载：只读边界拒绝（${snapshot.reason}）。请手动暂停并等待应用边界可用；不会自动暂停或推进。`,
                );
                return;
            }
            const text = captureReportText(() => snapshot);
            const filename = `EX09-committed-motion-g${snapshot.scope.roundGeneration}-t${snapshot.scope.activeTick}.json`;
            const blob = new Blob([text], { type: 'application/json' });
            downloadReportBlob(blob, filename);
            say(
                'committed-motion-export-status',
                `已请求下载当前已提交状态：${blob.size} 字节。SDK 待写入仍为 unknown；不是原生 idle 证明。`,
            );
        } catch (error) {
            say('committed-motion-export-status', `只读状态导出失败：${String(error)}`);
        } finally {
            // Keep disabled briefly so a double click cannot request duplicate downloads.
            setTimeout(() => {
                committedMotionExportBusy = false;
                el('export-committed-motion').disabled = false;
            }, 500);
        }
    };
    Object.defineProperty(window, '__BOX3D_GIFT_WORKSHOP__', {
        value: Object.freeze({
            observe: () => structuredClone(report()),
            observeCommittedMotionV1,
            observeWallContactDiagnosticsV1: wallContactDiagnostics.read,
            observeOrderAnchoredWallContactDiagnosticsV1: orderAnchoredDiagnostics.read,
            reset,
            pause,
            applyActions: (packets: any) =>
                Array.isArray(packets)
                    ? packets.map((packet: any) => (window as any).__BOX3D_GIFT_WORKSHOP__.command(packet))
                    : [{ accepted: false, reason: 'actions-must-be-array' }],
            command: (packet: any) => {
                if (!['pause', 'resume', 'clear-input', 'set-view'].includes(packet?.command)) {
                    const rejected = input.admit(packet);
                    if (!rejected.accepted) return rejected;
                    if (!input.take(packet.seq)) return rejected;
                    if (
                        packet.command === 'repack-order' &&
                        (!flow ||
                            recoveryFault ||
                            transport.fault ||
                            transport.fixed.held ||
                            !flow.session.repackStatus(flow.last).eligible)
                    )
                        return input.complete(packet.seq, { accepted: false, reason: 'repack-not-authorized' });
                    if (
                        flow &&
                        ['recover-dropped', 'retry-order', 'clear-channel', 'repack-order'].includes(packet.command)
                    ) {
                        const before = recoveryBoundaryContext();
                        recoveryQueued = true;
                        input.context.recoveryPending = true;
                        // Pure intent synchronization accounts for this request's own barrier now.
                        // Preserve the original envelope; only the internal token carries the new epoch.
                        transport.synchronize();
                        input.context.inputGeneration = transport.intent.inputGeneration;
                        const created = createRecoveryBoundary({
                            packet,
                            before,
                            after: recoveryBoundaryContext(),
                            pendingToken: pendingRecoveryBoundary,
                        });
                        if (!created.accepted) {
                            recoveryQueued = false;
                            input.context.recoveryPending = false;
                            return input.complete(packet.seq, {
                                ...created,
                                inputGeneration: transport.intent.inputGeneration,
                            });
                        }
                        pendingRecoveryBoundary = created.token;
                        const acknowledgement = input.complete(packet.seq, created.ack);
                        log('recovery-boundary-queued', {
                            packet,
                            acknowledgement,
                            originalInputGeneration: created.token.originalInputGeneration,
                            boundaryInputGeneration: created.token.boundaryInputGeneration,
                        });
                        queueMicrotask(() => void runRecoveryAtIdle(packet, created.token));
                        return acknowledgement;
                    }
                    if (flow && ['start-round', 'submit-order'].includes(packet.command)) {
                        pendingBusinessCommands.push(packet);
                        return rejected;
                    }
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
                if (packet.command === 'clear-input') {
                    input.clear();
                    if (transport) {
                        if (paused) transport.intent.clear('public-clear');
                        else transport.clear('public-clear');
                        input.context.inputGeneration = transport.intent.inputGeneration;
                    }
                }
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
