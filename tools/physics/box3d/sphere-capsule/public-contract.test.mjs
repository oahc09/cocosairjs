/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU ONLY. Actual TS dispatcher/contact equations and actual world emitEvents body;
// roster/dispatch authority below are explicit CPU doubles, never native/SDK evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

// Translation-only math and owner/native doubles, explicitly not a physics simulator.
// The real TS local-chain guard and writeback batch below remain unmodified.
function actualWritebackCPU() {
    class Vec3 {
        constructor(x = 0, y = 0, z = 0) {
            Object.assign(this, { x, y, z });
        }
        static transformMat4(out, p, m) {
            Object.assign(out, { x: p.x + m.m12, y: p.y + m.m13, z: p.z + m.m14 });
            return out;
        }
    }
    class Quat {
        constructor(x = 0, y = 0, z = 0, w = 1) {
            Object.assign(this, { x, y, z, w });
        }
        static clone(q) {
            return new Quat(q.x, q.y, q.z, q.w);
        }
        static conjugate(out, q) {
            Object.assign(out, { x: -q.x, y: -q.y, z: -q.z, w: q.w });
            return out;
        }
        static multiply(out, a, b) {
            assert.equal(a.w, 1);
            assert.equal(b.w, 1);
            Object.assign(out, { x: 0, y: 0, z: 0, w: 1 });
            return out;
        }
    }
    class Mat4 {
        constructor() {
            this.m12 = this.m13 = this.m14 = 0;
        }
        static fromSRT(out, q, p, scale) {
            assert.deepEqual([q.x, q.y, q.z, q.w], [0, 0, 0, 1]);
            assert.deepEqual([scale.x, scale.y, scale.z], [1, 1, 1]);
            Object.assign(out, { m12: p.x, m13: p.y, m14: p.z });
            return out;
        }
        static multiply(out, a, b) {
            const p = [a.m12 + b.m12, a.m13 + b.m13, a.m14 + b.m14];
            Object.assign(out, { m12: p[0], m13: p[1], m14: p[2] });
            return out;
        }
        static toArray(out, m) {
            out.push(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, m.m12, m.m13, m.m14, 1);
            return out;
        }
        static toSRT(m, q) {
            Object.assign(q, { x: 0, y: 0, z: 0, w: 1 });
        }
        static clone(m) {
            return Object.assign(new Mat4(), m);
        }
        static invert(out, m) {
            Object.assign(out, { m12: -m.m12, m13: -m.m13, m14: -m.m14 });
            return out;
        }
    }
    const actual = load('src/air/physics/box3d/world-writeback.ts', ['Box3DSceneTransform', 'writebackSceneBatch'], {
        Vec3,
        Quat,
        Mat4,
        worldError,
        isValid: (node) => node.isValid,
        registerNodeTransformGuard() {
            throw Error('CPU must pass its explicit owner authority');
        },
    });
    return { ...actual, Vec3, Quat, Mat4 };
}
// Execute the actual adapter setter -> actual shared-body control forwarding. The final
// binding implementation is a named CPU double, not a replacement claimed as native evidence.
function actualVelocityAdapter(component, onVelocity) {
    const sharedSource = file('src/air/physics/box3d/shared-body.ts');
    const control = sharedSource.slice(
        sharedSource.indexOf('    control<M extends Mutation>'),
        sharedSource.indexOf('    attachRigidBody(', sharedSource.indexOf('    control<M extends Mutation>')),
    );
    const vector = sharedSource.slice(
        sharedSource.indexOf('export function bodyVector'),
        sharedSource.indexOf('export function nativeBodyType'),
    );
    const rigidSource = file('src/air/physics/box3d/rigid-body.ts');
    const setter = rigidSource.slice(
        rigidSource.indexOf('    setLinearVelocity(value:'),
        rigidSource.indexOf('    getAngularVelocity(', rigidSource.indexOf('    setLinearVelocity(value:')),
    );
    assert(control && vector && setter);
    const binding = {
        setBodyLinearVelocity(world, body, velocity) {
            assert.equal(world, 'CPU_WORLD');
            assert.equal(body, component);
            onVelocity(Array.from(velocity));
            return Object.freeze({ linearVelocity: velocity });
        },
    };
    const source = `${vector}
class Shared { #binding; #world='CPU_WORLD'; #body; #owner={invalidate(){},fault(e){throw e;}}; constructor(binding,body){this.#binding=binding;this.#body=body;} assert(){} assertConfiguration(){} ${control} }
class Adapter {#body;#component;constructor(shared,component){this.#body=shared;this.#component=component;} ${setter} }
new Adapter(new Shared(binding,component),component)`;
    return vm.runInNewContext(transform(source), {
        binding,
        component,
        worldError,
        BODY_MUTATIONS: new Set(['setBodyLinearVelocity']),
        mutationNotApplied: () => false,
        finiteFloat32(value) {
            assert(Number.isFinite(value));
            return Math.fround(value);
        },
        assertPhysicsBodyVelocityConfiguration(operation, target) {
            assert.equal(operation, 'setLinearVelocity');
            assert.equal(target, component);
        },
    });
}
// Minimal CPU scheduling doubles only drive the real exported fixture to its first Enter.
// They neither simulate collision detection nor claim that a native/SDK run occurred.
function failingEnterHarness(kind) {
    const state = {
        nodes: [],
        closes: 0,
        records: [],
        callbackFailure: null,
        guardCalls: 0,
        completedFakeNativeSteps: 0,
        externalPositionWrites: [],
        velocityCalls: [],
    };
    const { Box3DSceneTransform, writebackSceneBatch, Vec3, Quat, Mat4 } = actualWritebackCPU();
    class RigidBody {
        static Type = { STATIC: 0, DYNAMIC: 1 };
        velocity = [0, 0, 0];
        setLinearVelocity(value) {
            assert(this.adapter, 'Fixture setter follows app.run and initial ready frame');
            this.adapter.setLinearVelocity(value);
        }
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
            this.parent = null;
            this.position = new Vec3();
            this.rotation = new Quat();
            this.scale = new Vec3(1, 1, 1);
            state.nodes.push(this);
        }
        get worldPosition() {
            const p = this.parent?.worldPosition ?? new Vec3();
            return new Vec3(this.position.x + p.x, this.position.y + p.y, this.position.z + p.z);
        }
        get worldRotation() {
            return this.rotation;
        }
        get worldMatrix() {
            return Mat4.fromSRT(new Mat4(), this.worldRotation, this.worldPosition, this.scale);
        }
        setPosition(x, y, z) {
            state.externalPositionWrites.push({
                name: this.name,
                mounted: !!this.sceneTransform,
                step: state.completedFakeNativeSteps,
            });
            this.position = new Vec3(x, y, z);
        }
        setWorldPosition(x, y, z) {
            const p = this.parent?.worldPosition ?? new Vec3();
            this.position = new Vec3(x - p.x, y - p.y, z - p.z);
        }
        setWorldRotation(x, y, z, w) {
            this.rotation = new Quat(x, y, z, w);
        }
        addComponent(Kind) {
            const component = new Kind();
            component.node = this;
            if (component instanceof SphereCollider) this.shape = component;
            else this.body = component;
            return component;
        }
        addChild(node) {
            node.parent = this;
        }
    }
    class Scene extends Node {}
    const c = contact();
    c.geometry.readStepIndex = 3;
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
    const snapshot = { worldId: 65536, stepIndex: 3, contactsOfOwnedBodies: [c] };
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
            const nodes = state.nodes.filter((node) => node.shape);
            for (const node of nodes) {
                state.guardCalls++;
                node.sceneTransform.preflight();
            }
            writebackSceneBatch(
                nodes.map((node) => {
                    const p = node.worldPosition,
                        v = node.body.velocity;
                    const origin = [p.x, p.y, p.z].map((value, i) =>
                        Math.fround(Math.fround(value) + Math.fround(v[i] * Math.fround(dt))),
                    );
                    return {
                        scene: node.sceneTransform,
                        origin: [...origin, 0, 0, 0, 1],
                        writable: node.body.type === RigidBody.Type.DYNAMIC,
                        assertOwner() {},
                    };
                }),
                () => {},
                {
                    write(node, operation, expected, perform) {
                        perform();
                    },
                },
            );
            state.completedFakeNativeSteps++;
            if (this.count === 3) {
                const self = state.nodes.find((node) => node.name === 'round').shape;
                const other = state.nodes.find((node) => node.name === 'capsule').shape;
                const event = Object.freeze({
                    type: 'onCollisionEnter',
                    selfCollider: self,
                    otherCollider: other,
                    contacts: Object.freeze([equation]),
                    impl: Object.freeze({ backend: 'box3d', stepIndex: 3 }),
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
            for (const node of state.nodes.filter((node) => node.shape)) {
                node.sceneTransform = new Box3DSceneTransform(node);
                node.body.adapter = actualVelocityAdapter(node.body, (velocity) => {
                    node.body.velocity = velocity;
                    state.velocityCalls.push({ step: state.completedFakeNativeSteps, value: velocity });
                });
            }
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
        assert.equal(raw.impl.stepIndex, 3);
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

test('old mounted Node-write operation succeeds locally then actual next-step preflight rejects it', async () => {
    // A source-derived regression, NOT replay of missing historical runtime. Only the
    // approach operation is reverted; the production guard and assertions are unchanged.
    const source = file('tools/physics/box3d/sphere-capsule/public-contract.mjs');
    const supported = 'round.body.setLinearVelocity(new Vec3(-24, 0, 0));';
    assert.equal(source.split(supported).length, 2);
    const oracle = pathToFileURL(path.join(root, 'tools/physics/box3d/sphere-capsule/oracle.mjs')).href;
    const reverted = source
        .replace(supported, 'round.node.setPosition(0.8, 0, 0);\nround.body.setLinearVelocity(new Vec3());')
        .replace("'./oracle.mjs'", JSON.stringify(oracle));
    const legacy = await import('data:text/javascript;base64,' + Buffer.from(reverted).toString('base64'));
    const h = failingEnterHarness('geometry-status'),
        report = {};
    let primary;
    await assert.rejects(legacy.runPublicSphereCapsule({ sdk: h.sdk, app: h.app, report, record() {} }), (error) => {
        primary = error;
        return (
            error.code === 'AIR_E_BOX3D_CONFIG' &&
            error.message.includes('External Node pose/parent/scale synchronization is not enabled.')
        );
    });
    assert(primary.stack.includes('Box3DSceneTransform.preflight'));
    assert.equal(h.state.closes, 1);
    assert.equal(h.state.callbackFailure, null);
    assert.equal(h.state.completedFakeNativeSteps, 1);
    assert.deepEqual(
        h.state.externalPositionWrites.filter((v) => v.mounted),
        [{ name: 'round', mounted: true, step: 1 }],
    );
    assert.deepEqual(
        h.state.velocityCalls,
        [{ step: 1, value: [0, 0, 0] }],
        'Node write returned before the following supported setter',
    );
    assert.equal(report.frames.length, 1);
    assert.equal(report.totalSteps, 2, 'Second attempt fails before a completed frame');
    assert.equal(report.cases[0].events.length, 0);
    assert.equal(report.cases[0].rawEvents.length, 0);
    assert.equal(report.status, 'FAIL');
    assert(report.error.includes(primary.message));
    assert(report.closeError.includes('secondary-close-failure'));
});

test('new approach uses actual supported velocity forwarding and actual owned writeback without external Node edits', async () => {
    const h = failingEnterHarness('geometry-status'),
        report = {};
    await assert.rejects(
        runPublicSphereCapsule({ sdk: h.sdk, app: h.app, report, record() {} }),
        (error) => error === h.state.callbackFailure,
    );
    assert(h.state.callbackFailure, 'Deliberately invalid synthetic geometry is reached, not an earlier guard error');
    assert(!report.error.includes('External Node pose/parent/scale synchronization is not enabled.'));
    assert.equal(h.state.completedFakeNativeSteps, 3);
    assert.equal(h.state.guardCalls, 6);
    assert.deepEqual(
        h.state.externalPositionWrites.filter((v) => v.mounted),
        [],
    );
    assert.deepEqual(h.state.velocityCalls, [
        { step: 1, value: [-24, 0, 0] },
        { step: 2, value: [0, 0, 0] },
    ]);
    assert.equal(report.cases[0].rawEvents[0].independentPreStepPoses.round[0], Math.fround(0.8));
    assert.equal(h.state.closes, 1);
});

test('actual public velocity adapter rejects nonfinite input before binding double', () => {
    const component = {},
        calls = [],
        adapter = actualVelocityAdapter(component, (value) => calls.push(value));
    assert.throws(() => adapter.setLinearVelocity({ x: NaN, y: 0, z: 0 }));
    assert.deepEqual(calls, []);
    adapter.setLinearVelocity({ x: 24, y: 0, z: 0 });
    assert.deepEqual(calls, [[24, 0, 0]]);
});
