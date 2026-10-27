/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU ONLY. Actual TS dispatcher/contact equations and actual world emitEvents body;
// roster/dispatch authority below are explicit CPU doubles, never native/SDK evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import {
    copyContact,
    validateCapturedContact,
    validateEntryOracle,
    validateCase,
    PUBLIC_CASES,
    LIMITS,
    runPublicSphereCapsule,
} from './public-contract.mjs';
const root =
    process.env.BOX3D_SPHERE_CAPSULE_SOURCE_ROOT ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const reference = process.env.BOX3D_SPHERE_CAPSULE_REFERENCE_ROOT ?? root;
const file = (relative) =>
    fs.readFileSync(
        fs.existsSync(path.join(root, relative)) ? path.join(root, relative) : path.join(reference, relative),
        'utf8',
    );
const transform = (s) =>
    stripTypeScriptTypes(s, { mode: 'transform' })
        .replace(/^import[\s\S]*?;\s*$/gm, '')
        .replace(/^export /gm, '');
const load = (relative, names, globals = {}, edit = (s) => s) =>
    vm.runInNewContext(transform(edit(file(relative))) + `\n;({${names.join(',')}})`, globals, { filename: relative });
const { worldError } = load('src/air/physics/box3d/world-binding.ts', ['worldError']);
const { createContactEquations } = load('src/air/physics/box3d/contact-equation.ts', ['createContactEquations'], {
    worldError,
});
const eventFile = 'src/air/physics/box3d/collision-events.ts';
const current =
    "(a.kind === 'sphere' && (b.kind === 'sphere' || b.kind === 'box' || b.kind === 'capsule')) ||\n                (b.kind === 'sphere' && (a.kind === 'box' || a.kind === 'capsule'))";
const original =
    "(a.kind === 'sphere' && (b.kind === 'sphere' || b.kind === 'box')) ||\n                (b.kind === 'sphere' && a.kind === 'box')";
function dispatcher(legacy = false) {
    const { Box3DCollisionEvents } = load(
        eventFile,
        ['Box3DCollisionEvents'],
        { worldError, createContactEquations },
        (source) => {
            if (legacy) {
                assert(
                    source.includes(current),
                    'Original rejection replay must modify the exact new qualification clause',
                );
                return source.replace(current, original);
            }
            return source;
        },
    );
    return new Box3DCollisionEvents();
}
const id = (low, high = 0x10002) => ({ low, high });
const pose = (x = 0) => [x, 0, 0, 0, 0, 0, 1, 0, 0, 0];
function contact() {
    const row = { contactId: [9, 65536, 123], shapeA: id(1), shapeB: id(2), bodyA: id(3), bodyB: id(4) };
    return {
        ...row,
        geometry: {
            status: 'AVAILABLE',
            source: 'CACHED_MANIFOLD_GENERATION',
            ...structuredClone(row),
            geometryRevision: id(4, 7),
            generatedAfterStep: id(0, 0),
            generationPoseA: pose(0.8),
            generationPoseB: pose(),
            readStepIndex: 1,
            readMutationRevision: 12,
            manifolds: [
                {
                    normalAtoB: [-1, 0, 0],
                    normalBtoA: [1, 0, 0],
                    localNormalAtoB_A: [-1, 0, 0],
                    localNormalAtoB_B: [-1, 0, 0],
                    points: [
                        {
                            worldPointA: [0.4, 0, 0],
                            worldPointB: [0.4, 0, 0],
                            localPointA: [-0.4, 0, 0],
                            localPointB: [0.4, 0, 0],
                        },
                    ],
                },
            ],
        },
    };
}
function fixture(kinds = ['sphere', 'capsule']) {
    const c = contact(),
        a = {},
        b = {};
    const roster = [a, b].map((collider, i) => ({
        collider,
        kind: kinds[i],
        ...[c.shapeA, c.shapeB][i],
        trigger: false,
        collisionListener: true,
    }));
    return { c, a, b, roster, snapshot: { worldId: 65536, stepIndex: 1, contactsOfOwnedBodies: [c] } };
}
const code = (value) => (error) => error.code === value;
for (const kinds of [
    ['sphere', 'capsule'],
    ['capsule', 'sphere'],
]) {
    test('actual old predicate rejects ' + kinds.join('/'), () => {
        const f = fixture(kinds);
        assert.throws(() => dispatcher(true).prepare(f.snapshot, f.roster), code('AIR_E_BOX3D_UNSUPPORTED_GEOMETRY'));
    });
    test('both receivers enter/stay/natural exit with exact captured identity ' + kinds.join('/'), () => {
        const f = fixture(kinds),
            d = dispatcher();
        const enter = d.prepare(f.snapshot, f.roster);
        assert.equal(enter.length, 2);
        assert(Object.isFrozen(enter));
        enter.forEach(({ event }, index) => {
            assert.equal(event.type, 'onCollisionEnter');
            assert.equal(event.selfCollider, [f.a, f.b][index]);
            assert.equal(event.contacts[0].isBodyA, index === 0);
            assert(Object.isFrozen(event) && Object.isFrozen(event.contacts));
            validateCapturedContact(copyContact(event.contacts[0]), f.snapshot);
        });
        const before = JSON.stringify(enter.map(({ event }) => event.contacts.map(copyContact)));
        assert.equal(d.prepare(f.snapshot, f.roster).length, 0, 'No native-step replay');
        const next = structuredClone(f.snapshot);
        next.stepIndex = next.contactsOfOwnedBodies[0].geometry.readStepIndex = 2;
        assert.equal(d.prepare(next, f.roster).filter(({ event }) => event.type === 'onCollisionStay').length, 2);
        const exit = d.prepare({ ...next, stepIndex: 3, contactsOfOwnedBodies: [] }, f.roster);
        assert.equal(exit.length, 2);
        assert(exit.every(({ event }) => event.type === 'onCollisionExit' && event.contacts.length === 0));
        f.c.geometry.manifolds[0].points[0].worldPointA[0] = 999;
        assert.equal(JSON.stringify(enter.map(({ event }) => event.contacts.map(copyContact))), before);
        assert.throws(() => (enter[0].event.contacts[0].impl.geometry.shapeA.high = 0), TypeError);
    });
}
test('zero-segment public Capsule descriptor + positive Capsule accepts native AVAILABLE sphere/capsule basis', () => {
    const f = fixture(['capsule', 'capsule']);
    assert.equal(dispatcher().prepare(f.snapshot, f.roster).length, 2);
    assert(PUBLIC_CASES.some((row) => row.zeroCapsule));
});
for (const family of ['hull', 'mesh'])
    for (const order of [0, 1])
        test(family + ' remains rejected in either order ' + order, () => {
            const f = fixture(order ? [family, 'sphere'] : ['sphere', family]);
            assert.throws(() => dispatcher().prepare(f.snapshot, f.roster), code('AIR_E_BOX3D_UNSUPPORTED_GEOMETRY'));
        });
for (const name of ['shapeA', 'shapeB', 'bodyA', 'bodyB'])
    for (const word of ['low', 'high'])
        test('full generation identity mismatch ' + name + '.' + word, () => {
            const f = fixture();
            f.c.geometry[name][word]++;
            assert.throws(() => dispatcher().prepare(f.snapshot, f.roster), code('AIR_E_BOX3D_ABI'));
        });
for (const [name, mutate, errorCode] of [
    ['contact generation', (c) => c.geometry.contactId[2]++, 'AIR_E_BOX3D_ABI'],
    ['read step', (c) => (c.geometry.readStepIndex = 0), 'AIR_E_BOX3D_ABI'],
    ['negative read revision', (c) => (c.geometry.readMutationRevision = -1), 'AIR_E_BOX3D_ABI'],
    ['missing basis', (c) => delete c.geometry, 'AIR_E_BOX3D_ABI'],
    [
        'unavailable basis',
        (c) => (c.geometry.status = 'GEOMETRY_UNAVAILABLE'),
        'AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH',
    ],
    [
        'unsupported family basis',
        (c) => (c.geometry.status = 'UNSUPPORTED_GEOMETRY_FAMILY'),
        'AIR_E_BOX3D_UNSUPPORTED_GEOMETRY',
    ],
    ['wrong source', (c) => (c.geometry.source = 'LIVE_NODE_POSE'), 'AIR_E_BOX3D_ABI'],
    ['empty manifolds', (c) => (c.geometry.manifolds = []), 'AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH'],
    ['NaN point', (c) => (c.geometry.manifolds[0].points[0].worldPointA[0] = NaN), 'AIR_E_BOX3D_ABI'],
])
    test('fail closed: ' + name, () => {
        const f = fixture();
        mutate(f.c);
        assert.throws(() => dispatcher().prepare(f.snapshot, f.roster), code(errorCode));
    });
test('older generation basis remains legal at a later exact read step', () => {
    const f = fixture();
    f.snapshot.stepIndex = f.c.geometry.readStepIndex = 12;
    const result = dispatcher().prepare(f.snapshot, f.roster);
    assert.equal(result[0].event.contacts[0].impl.geometry.generatedAfterStep.low, 0);
    assert.equal(result[0].event.contacts[0].impl.geometry.readMutationRevision, 12);
});
test('roster full high-word lookup rejects stale shape, not low-word alias', () => {
    const f = fixture();
    f.roster[1].high++;
    assert.throws(() => dispatcher().prepare(f.snapshot, f.roster), code('AIR_E_BOX3D_ABI'));
});
test('same shape duplicate roster rejected before delivery', () => {
    const f = fixture();
    f.roster.push({ ...f.roster[0] });
    assert.throws(() => dispatcher().prepare(f.snapshot, f.roster), code('AIR_E_BOX3D_ABI'));
});
test('removed peer retires silently, not manufactured Exit', () => {
    const f = fixture(),
        d = dispatcher();
    d.prepare(f.snapshot, f.roster);
    assert.equal(d.prepare({ ...f.snapshot, stepIndex: 2, contactsOfOwnedBodies: [] }, f.roster.slice(0, 1)).length, 0);
});
function deliveryHarness(f) {
    const world = file('src/air/physics/box3d/world.ts');
    const begin = world.indexOf('    emitEvents(): void {'),
        end = world.indexOf('    step(dt:', begin);
    assert(begin > 0 && end > begin);
    const body = world.slice(begin, end);
    const source = `class ActualDelivery {
      #collisionEvents = dispatcher(); #triggerEvents = { prepare: () => [] }; #sharedBodies = new Map(); #commandOwner;
      pendingSnapshot; emittedStep; faults = []; cleanupErrors = []; disposed = 0; drained = 0;
      constructor(snapshot, owner) { this.pendingSnapshot = snapshot; this.#commandOwner = owner; }
      assertReady() {} fault(error) { this.faults.push(error); } recordOwnerCleanup(error) { this.cleanupErrors.push(error); }
      ${body}
    }; ActualDelivery`;
    const pending = new Set(),
        calls = [],
        operations = [];
    const owner = {
        beginDispatch() {
            operations.push('begin');
            return {
                pendingDestruction: (collider) => pending.has(collider),
                dispose: () => operations.push('dispose'),
                drainDestruction: () => operations.push('drain'),
            };
        },
    };
    // Fixed/hinge/point fields are needed by this exact real method, although this fixture creates no joints.
    const klass = vm.runInNewContext(
        transform(
            source.replace(
                '#commandOwner;',
                '#commandOwner; #fixedConstraints = new Set(); #hingeConstraints = new Set(); #pointToPointConstraints = new Set();',
            ),
        ),
        { dispatcher, Box3DSharedBody: { collisionColliderRecords: () => f.roster }, Object, Array },
    );
    return { world: new klass(f.snapshot, owner), pending, calls, operations };
}
test('actual world delivery preflights ENTIRE batch: late missing basis delivers nothing', () => {
    const f = fixture(),
        extra = fixture();
    extra.c.shapeA.low += 20;
    extra.c.shapeB.low += 20;
    extra.roster[0].low += 20;
    extra.roster[1].low += 20;
    extra.c.geometry.status = 'GEOMETRY_UNAVAILABLE';
    f.snapshot.contactsOfOwnedBodies.push(extra.c);
    f.roster.push(...extra.roster);
    const h = deliveryHarness(f);
    for (const row of f.roster) row.collider.emit = (...args) => h.calls.push(args);
    assert.throws(() => h.world.emitEvents(), code('AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH'));
    assert.equal(h.calls.length, 0);
    assert.equal(h.operations.length, 0);
    assert.equal(h.world.faults.length, 1);
});
test('actual world loop skips pending peer after callback, drains deferred destruction without Exit', () => {
    const f = fixture(),
        h = deliveryHarness(f);
    f.a.emit = (type, event) => {
        h.calls.push({ type, event });
        h.pending.add(f.b);
    };
    f.b.emit = (type, event) => h.calls.push({ type, event });
    h.world.emitEvents();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].type, 'onCollisionEnter');
    assert.deepEqual(h.operations, ['begin', 'dispose', 'drain']);
    assert.equal(h.world.pendingSnapshot, null);
    assert.equal(h.world.emittedStep, 1);
    assert.equal(h.world.faults.length, 0);
});
test('actual world loop preserves callback primary while draining cleanup', () => {
    const f = fixture(),
        h = deliveryHarness(f),
        primary = new Error('callback-primary');
    f.a.emit = () => {
        throw primary;
    };
    f.b.emit = () => {
        throw Error('must not continue');
    };
    assert.throws(
        () => h.world.emitEvents(),
        (error) => error === primary,
    );
    assert.deepEqual(h.operations, ['begin', 'dispose', 'drain']);
    assert.equal(h.world.faults[0], primary);
});
test('public first Enter is independently checked, not only geometry self-comparison', () => {
    const f = fixture(),
        events = dispatcher().prepare(f.snapshot, f.roster);
    for (let i = 0; i < 2; i++)
        validateEntryOracle(copyContact(events[i].event.contacts[0]), i === 0 ? 'round' : 'capsule', {
            round: pose(0.8),
            capsule: pose(),
        });
    const copy = copyContact(events[0].event.contacts[0]);
    copy.impl.geometry.manifolds[0].points[0].worldPointA[0] += 0.1;
    assert.throws(() => validateEntryOracle(copy, 'round', { round: pose(0.8), capsule: pose() }));
});
function validCase(destroyPeer = false) {
    return {
        destroyPeer,
        release: { status: 'released', pending: [], failures: [], physicsSceneRelease: { status: 'RESTORED' } },
        stepsDuringRelease: 0,
        sceneInvalid: true,
        tokenCurrent: false,
        currentSceneNull: true,
        retainedCopiesUnchanged: true,
        afterRelease: { bodies: 0, shapes: 0, contacts: 0, joints: 0 },
        resources: [],
        events: destroyPeer
            ? [{ type: 'onCollisionEnter' }]
            : ['round', 'capsule'].flatMap((self) =>
                  ['onCollisionEnter', 'onCollisionStay', 'onCollisionExit'].map((type) => ({ self, type })),
              ),
        destroyRequested: true,
        destroyedPeerInvalid: true,
        afterCallback: { bodies: 1, shapes: 1 },
    };
}
test('synthetic public result validators accept only declared nonempty cases', () => {
    assert(validateCase(validCase()));
    assert(validateCase(validCase(true)));
});
for (const [name, change] of [
    ['one-sided events', (r) => (r.events = r.events.filter((e) => e.self === 'round'))],
    ['no stay', (r) => (r.events = r.events.filter((e) => e.type !== 'onCollisionStay'))],
    ['failed release', (r) => (r.release.status = 'failed')],
    ['pending release', (r) => r.release.pending.push('pending')],
    ['nonzero native object', (r) => (r.afterRelease.shapes = 1)],
    ['resource retention', (r) => r.resources.push({ users: 0 })],
    ['stale copy changed', (r) => (r.retainedCopiesUnchanged = false)],
    ['scene step during release', (r) => (r.stepsDuringRelease = 1)],
])
    test('synthetic result negative: ' + name, () => {
        const row = validCase();
        change(row);
        assert.throws(() => validateCase(row));
    });
test('callback destroy is not allowed to manufacture Exit or deliver invalid peer', () => {
    const r = validCase(true);
    r.events.push({ type: 'onCollisionExit' });
    assert.throws(() => validateCase(r));
});
test('source lifecycle and world qualification remain narrow', () => {
    const source = file('tools/physics/box3d/sphere-capsule/public-contract.mjs'),
        world = file('src/air/physics/box3d/world.ts');
    assert.equal((source.match(/createStepClock\(\{/g) ?? []).length, 1);
    assert.equal((source.match(/clock\.begin\(\)/g) ?? []).length, 1);
    assert.equal((source.match(/await app\.close\(\)/g) ?? []).length, 1);
    assert(!/director\s*\.\s*tick|physicsWorld\s*\.\s*step|world\s*\.\s*step\(/.test(source));
    assert(world.includes("'sphere-capsule'"));
    assert(world.includes('componentEventsSupported: false'));
    assert(world.includes('snapshot.worldId !== this.#token.id'));
    assert(world.includes('snapshot.stepIndex !== this.nativeStep.nativeStepIndex'));
    assert.equal(PUBLIC_CASES.length, 4);
    assert.equal(LIMITS.stepsPerCase, 8);
});

for (const closeFails of [false, true])
    test('actual fixture failure path closes once, preserving primary; closeFails=' + closeFails, async () => {
        const primary = new Error('fixture-primary'),
            secondary = new Error('close-secondary'),
            report = {};
        let closes = 0,
            clocks = 0;
        const sdk = {
            PhysicsSystem: { instance: { physicsWorld: {} } },
            createStepClock() {
                clocks++;
                throw Error('not reached');
            },
        };
        const app = {
            getScene() {
                throw primary;
            },
            async close() {
                closes++;
                if (closeFails) throw secondary;
                return {
                    status: 'released',
                    failures: [],
                    pending: [],
                    physicsPreparation: {
                        status: 'closed',
                        cleanupErrors: [],
                        acquired: [{ backend: 'box3d', cleanup: 'released', retained: [] }],
                    },
                };
            },
        };
        await assert.rejects(runPublicSphereCapsule({ sdk, app, report, record() {} }), (error) => error === primary);
        assert.equal(closes, 1);
        assert.equal(clocks, 0);
        assert.equal(report.status, 'FAIL');
        assert(report.error.includes('fixture-primary'));
        if (closeFails) assert(report.closeError.includes('close-secondary'));
    });
test('terminal journal error cannot overwrite the actual fixture primary', async () => {
    const primary = new Error('first'),
        report = {};
    const sdk = { PhysicsSystem: { instance: { physicsWorld: {} } } };
    const app = {
        getScene() {
            throw primary;
        },
        async close() {
            throw new Error('close');
        },
    };
    await assert.rejects(
        runPublicSphereCapsule({
            sdk,
            app,
            report,
            record() {
                throw new Error('journal');
            },
        }),
        (error) => error === primary,
    );
    assert(report.journalError.includes('journal'));
    assert.equal(report.status, 'FAIL');
});

// Minimal CPU scheduling doubles only drive the real exported fixture to its first Enter.
// They neither simulate collision detection nor claim that a native/SDK run occurred.
function failingEnterHarness(kind) {
    const state = { nodes: [], closes: 0, records: [], callbackFailure: null };
    class Vec3 {
        constructor(x = 0, y = 0, z = 0) {
            Object.assign(this, { x, y, z });
        }
    }
    class RigidBody {
        static Type = { STATIC: 0, DYNAMIC: 1 };
        setLinearVelocity() {}
    }
    class SphereCollider {
        handlers = new Map();
        on(type, handler) {
            this.handlers.set(type, handler);
        }
    }
    class CapsuleCollider extends SphereCollider {}
    class Node {
        constructor(name) {
            this.name = name;
            this.isValid = true;
            this.worldPosition = new Vec3();
            this.worldRotation = { x: 0, y: 0, z: 0, w: 1 };
            state.nodes.push(this);
        }
        setPosition(x, y, z) {
            this.worldPosition = new Vec3(x, y, z);
        }
        addComponent(Kind) {
            const component = new Kind();
            if (component instanceof SphereCollider) this.shape = component;
            return component;
        }
        addChild() {}
    }
    class Scene extends Node {}
    const c = contact();
    c.geometry.readStepIndex = 2;
    if (kind === 'oracle') {
        c.geometry.manifolds[0].points[0].worldPointA[0] += 0.1;
        c.geometry.manifolds[0].points[0].worldPointB[0] += 0.1;
    }
    const actualEquation = createContactEquations(c, true)[0];
    const badImpl = structuredClone(actualEquation.impl);
    if (kind === 'geometry-status') badImpl.geometry.status = 'GEOMETRY_UNAVAILABLE';
    if (kind === 'identity') badImpl.geometry.shapeA.high++;
    const getterPrimary = new Error('injected-public-getter-primary');
    const equation = Object.freeze({
        isBodyA: true,
        impl: Object.freeze(badImpl),
        ...Object.fromEntries(
            [
                'LocalPointOnA',
                'LocalPointOnB',
                'WorldPointOnA',
                'WorldPointOnB',
                'LocalNormalOnA',
                'LocalNormalOnB',
                'WorldNormalOnA',
                'WorldNormalOnB',
            ].map((suffix) => [
                'get' + suffix,
                kind === 'getter' && suffix === 'WorldPointOnA'
                    ? () => {
                          throw getterPrimary;
                      }
                    : actualEquation['get' + suffix].bind(actualEquation),
            ]),
        ),
    });
    const snapshot = { worldId: 65536, stepIndex: 2, contactsOfOwnedBodies: [c] };
    const world = {
        impl: { worldId: 65536 },
        diagnostics: () => ({ native: { nativeStepIndex: 0 } }),
        getStepSnapshot: () => snapshot,
        getNativeCounts: () => ({ bodies: 2, shapes: 2, contacts: 0, joints: 0, liveBytes: 1000n }),
    };
    const clock = {
        stepping: false,
        count: 0,
        begin() {
            this.stepping = true;
        },
        async step(dt) {
            this.count++;
            if (this.count === 2) {
                const self = state.nodes.find((node) => node.name === 'round').shape;
                const other = state.nodes.find((node) => node.name === 'capsule').shape;
                const event = Object.freeze({
                    type: 'onCollisionEnter',
                    selfCollider: self,
                    otherCollider: other,
                    contacts: Object.freeze([equation]),
                    impl: Object.freeze({ backend: 'box3d', stepIndex: 2 }),
                });
                try {
                    self.handlers.get('onCollisionEnter')(event);
                } catch (error) {
                    state.callbackFailure = error;
                    throw error;
                }
            }
            return { step: this.count, dt, afterDraw: true };
        },
    };
    let currentScene = null;
    const app = {
        getScene: () => currentScene,
        session: { token: () => ({ isCurrent: () => true }) },
        run(scene) {
            currentScene = scene;
        },
        async close() {
            state.closes++;
            throw new Error('secondary-close-failure');
        },
    };
    return {
        state,
        app,
        sdk: {
            Node,
            Scene,
            RigidBody,
            SphereCollider,
            CapsuleCollider,
            Vec3,
            PhysicsSystem: { instance: { physicsWorld: world } },
            createStepClock: () => clock,
        },
        getterPrimary,
    };
}
for (const kind of ['geometry-status', 'getter', 'identity', 'oracle'])
    test('actual fixture preserves first bad Enter evidence before ' + kind + ' assertion', async () => {
        const h = failingEnterHarness(kind),
            report = {};
        await assert.rejects(
            runPublicSphereCapsule({
                sdk: h.sdk,
                app: h.app,
                report,
                record(name, value) {
                    h.state.records.push({ name, value: structuredClone(value) });
                },
            }),
            (error) => error === h.state.callbackFailure && (kind !== 'getter' || error === h.getterPrimary),
        );
        assert(
            h.state.callbackFailure,
            'Injected callback reached; an earlier setup error is not the expected failure',
        );
        assert.equal(h.state.closes, 1);
        assert.equal(report.status, 'FAIL');
        assert(report.closeError.includes('secondary-close-failure'));
        const row = report.cases[0];
        assert.equal(row.rawEvents.length, 1);
        const raw = row.rawEvents[0];
        assert.equal(raw.type, 'onCollisionEnter');
        assert.equal(raw.contacts.length, 1);
        assert.equal(raw.contacts[0].isBodyA, true);
        assert.equal(raw.impl.stepIndex, 2);
        assert.equal(raw.independentPreStepPoses.round[0], Math.fround(0.8));
        assert.equal(raw.independentPreStepPoses.capsule[0], 0);
        assert.doesNotThrow(() => JSON.stringify(raw), 'Detached evidence has no Collider/Node cycles');
        const rawRecord = h.state.records.findIndex((record) => record.name === 'public-sphere-capsule-raw-event');
        assert(rawRecord >= 0);
        assert.deepEqual(h.state.records[rawRecord].value, raw);
        const copiedRecord = h.state.records.findIndex((record) => record.name === 'public-sphere-capsule-event');
        if (kind === 'geometry-status' || kind === 'getter') {
            assert.equal(row.events.length, 0);
            assert.equal(copiedRecord, -1);
        } else {
            assert.equal(row.events.length, 1);
            assert(copiedRecord > rawRecord, 'Successful getter copy is persisted before identity/oracle validation');
            assert.deepEqual(h.state.records[copiedRecord].value, row.events[0]);
        }
    });
