/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual Cocos components, Vec3/geometry, material Eventify and diagnostics.
 * Adapter/native counters are explicit mocks, not real World or WASM evidence.
 */
declare const require: { (name: string): unknown; cache: Record<string, unknown> };
declare const process: { cwd(): string; env: Record<string, string | undefined> };
const { readFileSync, writeFileSync } = require('node:fs') as {
    readFileSync(path: string): Uint8Array;
    writeFileSync(path: string, value: string | Uint8Array): void;
};
const { createHash } = require('node:crypto') as {
    createHash(algorithm: string): { update(value: Uint8Array): { digest(encoding: 'hex'): string } };
};
const { gzipSync } = require('node:zlib') as { gzipSync(value: string): Uint8Array };
const { relative } = require('node:path') as { relative(from: string, to: string): string };
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { Collider } from '../../../src/cocos/physics/framework/components/colliders/collider';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { SphereCollider } from '../../../src/cocos/physics/framework/components/colliders/sphere-collider';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { EColliderType, ERigidBodyType } from '../../../src/cocos/physics/framework/physics-enum';
import { Vec3, geometry } from '../../../src/cocos/core';
import { CCObject } from '../../../src/cocos/core/data/object';
import { _subscribeDiagnosticLogs } from '../../../src/cocos/core/platform/debug';
import {
    assertMutationAllowed,
    registerMutationGuard,
    MutationGuardLease,
} from '../../../src/cocos/core/data/mutation-guard';

type Kind = 'RigidBody' | 'Collider' | 'BoxCollider' | 'SphereCollider';
type Spec = {
    kind: Kind;
    name: string;
    type: 'set' | 'get' | 'method';
    value?: any;
    cache?: string;
    expected?: any;
    delegate?: string;
    same?: any;
    vector?: boolean;
};
const code = 'AIR_E_TEST_COMPONENT_ENTRY';
const rows: any[] = [];
let current: any;
let leases: MutationGuardLease[] = [];
let cleanups: Array<() => void> = [];
const originalId = selector.id;
const selection = selector as any;
const copy = (v: any) => JSON.parse(JSON.stringify(v));
const record = (name: string, actual: unknown, expected: unknown) => {
    const observed = JSON.stringify(actual),
        wanted = JSON.stringify(expected);
    const snapshot = (s: string | undefined) => (s === undefined ? { type: 'undefined' } : JSON.parse(s));
    current.checks.push({ name, actual: snapshot(observed), expected: snapshot(wanted), passed: observed === wanted });
};
const attempt = (fn: () => unknown) => {
    let threw = false,
        error: any;
    try {
        fn();
    } catch (e) {
        threw = true;
        error = e;
    }
    const result = {
        threw,
        error: threw ? String(error) : null,
        code: error?.code ?? null,
        operation: error?.operation ?? null,
    };
    current.attempts.push(copy(result));
    return result;
};
const guard = (targets: object[], rejectionCode = code) => {
    const lease = registerMutationGuard(targets, { code: rejectionCode, message: 'Explicit component entry lease' });
    leases.push(lease);
    return lease;
};
const control = (name: string, run: () => void) =>
    test(name, () => {
        current = { name, checks: [], attempts: [] };
        rows.push(current);
        try {
            run();
        } catch (error) {
            current.fixtureFailure = String(error);
            throw error;
        }
        current.status = current.checks.every((check: any) => check.passed)
            ? 'PASS_ACTUAL_ENGINE_SOURCE'
            : 'RED_ACTUAL_ENGINE_SOURCE';
        expect(current.checks.filter((check: any) => !check.passed).map((check: any) => check.name)).toEqual([]);
    });
afterEach(() => {
    for (const lease of leases) lease.dispose();
    leases = [];
    for (const cleanup of cleanups.reverse()) cleanup();
    cleanups = [];
    CCObject._deferredDestroy();
    selection.id = originalId;
});
afterAll(() => {
    const output = process.env.BOX3D_COMPONENT_ENTRY_RAW;
    if (output)
        writeFileSync(
            output,
            gzipSync(
                JSON.stringify({
                    scope: 'Actual RigidBody, Collider, BoxCollider, SphereCollider, Vec3/geometry, material Eventify and diagnostic source. Explicit opt-in leases with counted mock adapters only. No World transaction or native/WASM qualification.',
                    rows,
                    loadedEngineSources: Object.keys(require.cache)
                        .map((path) => ({ path, relative: relative(process.cwd(), path) }))
                        .filter(({ relative: p }) => p.startsWith('src/') || p.startsWith('test/'))
                        .sort((a, b) => a.relative.localeCompare(b.relative))
                        .map(({ path, relative: p }) => ({
                            path: p,
                            sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
                        })),
                }) + '\n',
            ),
        );
});
const vector = (v: any) => (v == null ? null : [v.x, v.y, v.z]);
const scalarFields = [
    '_objFlags',
    '_enabled',
    '_group',
    '_type',
    '_mass',
    '_allowSleep',
    '_linearDamping',
    '_angularDamping',
    '_useGravity',
    '_isTrigger',
    '_isSharedMaterial',
    '_needTriggerEvent',
    '_needCollisionEvent',
    '_radius',
];
const vectorFields = ['_linearFactor', '_angularFactor', '_center', '_size'];
function fixture(kind: Kind, initialized: boolean, backend = 'box3d') {
    const c: any =
        kind === 'RigidBody'
            ? new RigidBody()
            : kind === 'Collider'
              ? new Collider(EColliderType.BOX)
              : kind === 'BoxCollider'
                ? new BoxCollider()
                : new SphereCollider();
    selection.id = backend;
    const identities = new Map<any, number>();
    const id = (v: any): number | null => {
        if (v == null) return null;
        if (!identities.has(v)) identities.set(v, identities.size + 1);
        return identities.get(v)!;
    };
    const effects: any = { delegates: [], reads: [], nativeMockCalls: 0, diagnostics: [], eventCalls: 0 };
    const unsubscribe = _subscribeDiagnosticLogs((entry) =>
        effects.diagnostics.push({ severity: entry.severity, message: entry.message }),
    );
    cleanups.push(unsubscribe);
    const old = kind === 'RigidBody' ? null : new PhysicsMaterial(),
        next = kind === 'RigidBody' ? null : new PhysicsMaterial();
    const table = (owner: any) =>
        Object.keys(owner?._callbackTable ?? {})
            .sort()
            .map((key) => {
                const list = owner._callbackTable[key];
                return {
                    key,
                    identity: id(list),
                    isInvoking: list.isInvoking,
                    containCanceled: list.containCanceled,
                    entries: list.callbackInfos.map((info: any) =>
                        info == null ? null : { callback: id(info.callback), target: id(info.target), once: info.once },
                    ),
                };
            });
    const cache = () => ({
        scalars: scalarFields.map((key) => [key, c[key] === undefined ? null : c[key]]),
        vectors: vectorFields.map((key) => [key, vector(c[key])]),
        material: id(c._material),
    });
    // Never inspect caller-owned arguments just to record a mock boundary.
    const normalize = (v: any): any =>
        v === undefined
            ? { type: 'undefined' }
            : v !== null && (typeof v === 'object' || typeof v === 'function')
              ? { identity: id(v) }
              : v;
    const adapter: any = { isAwake: true, isSleepy: false, isSleeping: false };
    const values: any = { group: 1, mask: 15, sleepThreshold: 0.1, useCCD: false };
    const calls = [
        'setGroup',
        'addGroup',
        'removeGroup',
        'setMask',
        'addMask',
        'removeMask',
        'setType',
        'setMass',
        'setAllowSleep',
        'setLinearDamping',
        'setAngularDamping',
        'useGravity',
        'setLinearFactor',
        'setAngularFactor',
        'setSleepThreshold',
        'useCCD',
        'wakeUp',
        'sleep',
        'setLinearVelocity',
        'setAngularVelocity',
        'setMaterial',
        'setAsTrigger',
        'setCenter',
        'updateSize',
        'updateRadius',
        'updateEventListener',
        'applyForce',
        'applyLocalForce',
        'applyImpulse',
        'applyLocalImpulse',
        'applyTorque',
        'applyLocalTorque',
        'clearState',
        'clearForces',
        'clearVelocity',
    ];
    for (const name of calls)
        adapter[name] = (...args: any[]) => {
            effects.delegates.push({ name, arguments: args.map(normalize), cacheAtCall: cache() });
            assertMutationAllowed(adapter, `FixtureAdapter.${name}`);
            effects.nativeMockCalls++;
            if (name === 'setGroup') values.group = args[0];
            if (name === 'setMask') values.mask = args[0];
            if (name === 'setSleepThreshold') values.sleepThreshold = args[0];
            if (name === 'useCCD') values.useCCD = args[0];
        };
    for (const [name, key] of [
        ['getGroup', 'group'],
        ['getMask', 'mask'],
        ['getSleepThreshold', 'sleepThreshold'],
        ['isUsingCCD', 'useCCD'],
    ])
        adapter[name] = () => {
            effects.reads.push(name);
            return values[key];
        };
    adapter.getLinearVelocity = (out: any) => {
        effects.reads.push('getLinearVelocity');
        out.x = 3;
        out.y = 4;
        out.z = 5;
    };
    adapter.getAngularVelocity = (out: any) => {
        effects.reads.push('getAngularVelocity');
        out.x = 6;
        out.y = 7;
        out.z = 8;
    };
    adapter.getAABB = (out: any) => {
        effects.delegates.push({ name: 'getAABB', cacheAtCall: cache() });
        assertMutationAllowed(adapter, 'FixtureAdapter.getAABB');
        effects.nativeMockCalls++;
        out.center.set(2, 3, 4);
        out.halfExtents.set(5, 6, 7);
    };
    adapter.getBoundingSphere = (out: any) => {
        effects.delegates.push({ name: 'getBoundingSphere', cacheAtCall: cache() });
        assertMutationAllowed(adapter, 'FixtureAdapter.getBoundingSphere');
        effects.nativeMockCalls++;
        out.center.set(2, 3, 4);
        out.radius = 5;
    };
    if (kind === 'RigidBody') {
        c._body = initialized ? adapter : null;
    } else {
        c._material = old;
        old!.on(PhysicsMaterial.EVENT_UPDATE, c._updateMaterial, c);
        const listener = () => effects.eventCalls++;
        c.on('onTriggerEnter', listener, c);
        c._shape = initialized ? adapter : null;
        cleanups.push(() => {
            old!.targetOff(c);
            next!.targetOff(c);
            old!.destroy();
            next!.destroy();
        });
    }
    const snapshot = () => ({
        cache: cache(),
        callbackTable: table(c),
        materialTables: [table(old), table(next)],
        bounds:
            c._aabb == null
                ? null
                : { id: id(c._aabb), center: vector(c._aabb.center), halfExtents: vector(c._aabb.halfExtents) },
        sphere:
            c._boundingSphere == null
                ? null
                : {
                      id: id(c._boundingSphere),
                      center: vector(c._boundingSphere.center),
                      radius: c._boundingSphere.radius,
                  },
        effects: copy(effects),
        adapterState: { ...values },
    });
    const refs = () => [
        c._body,
        c._shape,
        c._material,
        c._center,
        c._size,
        c._linearFactor,
        c._angularFactor,
        c._aabb,
        c._boundingSphere,
        c._callbackTable,
        (old as any)?._callbackTable,
        (next as any)?._callbackTable,
    ];
    const reset = () => {
        effects.delegates.length = effects.reads.length = effects.diagnostics.length = 0;
        effects.nativeMockCalls = effects.eventCalls = 0;
    };
    reset();
    return { c, adapter, old, next, effects, snapshot, refs, cache, reset, id, table, initialized, kind };
}
type Fixture = ReturnType<typeof fixture>;
const specs: Spec[] = [
    {
        kind: 'RigidBody',
        name: 'group',
        type: 'set',
        value: 2,
        cache: '_group',
        expected: 2,
        delegate: 'setGroup',
        same: 1,
    },
    {
        kind: 'RigidBody',
        name: 'type',
        type: 'set',
        value: ERigidBodyType.KINEMATIC,
        cache: '_type',
        expected: ERigidBodyType.KINEMATIC,
        delegate: 'setType',
        same: ERigidBodyType.DYNAMIC,
    },
    {
        kind: 'RigidBody',
        name: 'mass',
        type: 'set',
        value: 0,
        cache: '_mass',
        expected: 0.0001,
        delegate: 'setMass',
        same: 1,
    },
    {
        kind: 'RigidBody',
        name: 'allowSleep',
        type: 'set',
        value: false,
        cache: '_allowSleep',
        expected: false,
        delegate: 'setAllowSleep',
        same: true,
    },
    {
        kind: 'RigidBody',
        name: 'linearDamping',
        type: 'set',
        value: 0.4,
        cache: '_linearDamping',
        expected: 0.4,
        delegate: 'setLinearDamping',
        same: 0.1,
    },
    {
        kind: 'RigidBody',
        name: 'angularDamping',
        type: 'set',
        value: 0.6,
        cache: '_angularDamping',
        expected: 0.6,
        delegate: 'setAngularDamping',
        same: 0.1,
    },
    {
        kind: 'RigidBody',
        name: 'useGravity',
        type: 'set',
        value: false,
        cache: '_useGravity',
        expected: false,
        delegate: 'useGravity',
        same: true,
    },
    {
        kind: 'RigidBody',
        name: 'linearFactor',
        type: 'set',
        value: [0.2, 0.3, 0.4],
        cache: '_linearFactor',
        expected: [0.2, 0.3, 0.4],
        delegate: 'setLinearFactor',
        same: [1, 1, 1],
        vector: true,
    },
    {
        kind: 'RigidBody',
        name: 'angularFactor',
        type: 'set',
        value: [0.4, 0.3, 0.2],
        cache: '_angularFactor',
        expected: [0.4, 0.3, 0.2],
        delegate: 'setAngularFactor',
        same: [1, 1, 1],
        vector: true,
    },
    { kind: 'RigidBody', name: 'sleepThreshold', type: 'set', value: 0.25, delegate: 'setSleepThreshold', same: 0.1 },
    { kind: 'RigidBody', name: 'useCCD', type: 'set', value: true, delegate: 'useCCD', same: false },
    {
        kind: 'RigidBody',
        name: 'isStatic',
        type: 'set',
        value: true,
        cache: '_type',
        expected: ERigidBodyType.STATIC,
        delegate: 'setType',
        same: false,
    },
    {
        kind: 'RigidBody',
        name: 'isDynamic',
        type: 'set',
        value: false,
        cache: '_type',
        expected: ERigidBodyType.KINEMATIC,
        delegate: 'setType',
        same: true,
    },
    {
        kind: 'RigidBody',
        name: 'isKinematic',
        type: 'set',
        value: true,
        cache: '_type',
        expected: ERigidBodyType.KINEMATIC,
        delegate: 'setType',
        same: false,
    },
    ...[
        'wakeUp',
        'sleep',
        'setLinearVelocity',
        'setAngularVelocity',
        'setGroup',
        'addGroup',
        'removeGroup',
        'setMask',
        'addMask',
        'removeMask',
    ].map((name): Spec => ({
        kind: 'RigidBody',
        name,
        type: 'method',
        value: name.endsWith('Velocity') ? [1, 2, 3] : name === 'wakeUp' || name === 'sleep' ? undefined : 2,
        vector: name.endsWith('Velocity'),
        delegate: name,
    })),
    {
        kind: 'Collider',
        name: 'sharedMaterial',
        type: 'set',
        value: 'next-material',
        cache: '_material',
        delegate: 'setMaterial',
        same: 'old-material',
    },
    {
        kind: 'Collider',
        name: 'isTrigger',
        type: 'set',
        value: true,
        cache: '_isTrigger',
        expected: true,
        delegate: 'setAsTrigger',
        same: false,
    },
    {
        kind: 'Collider',
        name: 'center',
        type: 'set',
        value: [2, 3, 4],
        cache: '_center',
        expected: [2, 3, 4],
        delegate: 'setCenter',
        same: [0, 0, 0],
        vector: true,
    },
    { kind: 'Collider', name: 'worldBounds', type: 'get', delegate: 'getAABB' },
    { kind: 'Collider', name: 'boundingSphere', type: 'get', delegate: 'getBoundingSphere' },
    ...['setGroup', 'addGroup', 'removeGroup', 'setMask', 'addMask', 'removeMask'].map((name): Spec => ({
        kind: 'Collider',
        name,
        type: 'method',
        value: 2,
        delegate: name,
    })),
    {
        kind: 'BoxCollider',
        name: 'size',
        type: 'set',
        value: [-2, -3, -4],
        cache: '_size',
        expected: [2, 3, 4],
        delegate: 'updateSize',
        same: [1, 1, 1],
        vector: true,
    },
    {
        kind: 'SphereCollider',
        name: 'radius',
        type: 'set',
        value: -2,
        cache: '_radius',
        expected: 2,
        delegate: 'updateRadius',
        same: 0.5,
    },
];
const input = (s: Spec, f: Fixture, same = false) => {
    const value = same ? s.same : s.value;
    if (value === 'next-material') return f.next;
    if (value === 'old-material') return f.old;
    return s.vector ? new Vec3(value[0], value[1], value[2]) : value;
};
const invoke = (s: Spec, f: Fixture, v = input(s, f)): any =>
    s.type === 'set'
        ? (f.c[s.name] = v)
        : s.type === 'get'
          ? f.c[s.name]
          : v === undefined
            ? f.c[s.name]()
            : f.c[s.name](v);
const operation = (s: Spec) => `${s.kind}.${s.name}${s.type === 'get' ? '.get' : ''}`;
function refused(s: Spec, f: Fixture, v = input(s, f), rejectionCode = code, label = '') {
    const before = f.snapshot(),
        refs = f.refs();
    const result = attempt(() => invoke(s, f, v));
    record(
        `${label}exact early operation`,
        [result.threw, result.code, result.operation],
        [true, rejectionCode, operation(s)],
    );
    record(`${label}cache flags bounds listener tables and adapter state unchanged`, f.snapshot(), before);
    record(
        `${label}all cache/component/adapter/material/table identities unchanged`,
        f.refs().map((v, i) => v === refs[i]),
        refs.map(() => true),
    );
}
for (const s of specs)
    control(`${operation(s)}: leased initialized and uninitialized refusal`, () => {
        for (const initialized of [false, true]) {
            const f = fixture(s.kind, initialized);
            guard([f.c, f.adapter]);
            refused(s, f, input(s, f), code, `${initialized}: `);
        }
    });
function ordinary(s: Spec, f: Fixture, backend: string) {
    const before = f.snapshot(),
        v = input(s, f),
        refs = f.refs();
    const result = attempt(() => invoke(s, f, v));
    record('ordinary call does not throw', result.threw, false);
    record(
        'expected adapter and mock-native call count',
        [f.effects.delegates.map((d: any) => d.name), f.effects.nativeMockCalls],
        [f.initialized ? [s.delegate] : [], f.initialized ? 1 : 0],
    );
    record(
        'component object/enabled flags unchanged',
        [f.c._objFlags, f.c._enabled],
        [before.cache.scalars[0][1], before.cache.scalars[1][1]],
    );
    if (s.cache && s.name !== 'sharedMaterial') {
        record('normal committed cache', s.vector ? vector(f.c[s.cache]) : f.c[s.cache], s.expected);
        if (s.vector)
            record(
                'normal vector identity retained',
                f.refs().map((x, i) => x === refs[i]),
                refs.map(() => true),
            );
    }
    if (s.name === 'sharedMaterial') {
        record('ordinary material identity', f.c._material === f.next, true);
        record('ordinary material shared flag', f.c._isSharedMaterial, !f.initialized);
        record(
            'old listener membership',
            f.old!.hasEventListener(PhysicsMaterial.EVENT_UPDATE, f.c._updateMaterial, f.c),
            !f.initialized,
        );
        record(
            'new listener membership',
            f.next!.hasEventListener(PhysicsMaterial.EVENT_UPDATE, f.c._updateMaterial, f.c),
            f.initialized,
        );
    } else
        record(
            'collider callback and material tables unchanged',
            [f.table(f.c), f.table(f.old), f.table(f.next)],
            [before.callbackTable, ...before.materialTables],
        );
    if (s.type === 'get') {
        const key = s.name === 'worldBounds' ? '_aabb' : '_boundingSphere',
            value = f.c[key];
        record('bounds lazily allocated', value != null, true);
        if (f.initialized)
            record(
                'bounds refreshed',
                s.name === 'worldBounds'
                    ? [vector(value.center), vector(value.halfExtents)]
                    : [vector(value.center), value.radius],
                s.name === 'worldBounds'
                    ? [
                          [2, 3, 4],
                          [5, 6, 7],
                      ]
                    : [[2, 3, 4], 5],
            );
        invoke(s, f);
        record('second bounds read retains identity', f.c[key] === value, true);
    }
    const checksInitialization = s.type === 'method' || s.name === 'sleepThreshold' || s.name === 'useCCD';
    record(
        'uninitialized diagnostics preserved',
        f.effects.diagnostics.filter((d: any) => d.severity === 'error').length,
        !f.initialized && checksInitialization ? 1 : 0,
    );
    record(
        'mass normalization warning preserved',
        f.effects.diagnostics.filter((d: any) => d.severity === 'warning').length,
        s.name === 'mass' ? 1 : 0,
    );
    if (f.initialized && s.cache && s.name !== 'sharedMaterial') {
        const observed = f.effects.delegates[0].cacheAtCall;
        const oldValue = s.vector
            ? before.cache.vectors.find((r: any) => r[0] === s.cache)![1]
            : before.cache.scalars.find((r: any) => r[0] === s.cache)![1];
        const atCall = s.vector
            ? observed.vectors.find((r: any) => r[0] === s.cache)[1]
            : observed.scalars.find((r: any) => r[0] === s.cache)[1];
        record(
            'backend-specific cache/delegate ordering unchanged',
            atCall,
            backend === 'box3d' ? oldValue : s.expected,
        );
    }
}
for (const s of specs)
    control(`${operation(s)}: no-lease initialized and uninitialized compatibility`, () => {
        for (const initialized of [false, true]) ordinary(s, fixture(s.kind, initialized), 'box3d');
    });
for (const kind of ['RigidBody', 'Collider', 'BoxCollider', 'SphereCollider'] as Kind[])
    control(`${kind}: non-Box3D initialized and uninitialized compatibility`, () => {
        const s = specs.find(
            (s) =>
                s.kind === kind &&
                s.name ===
                    (kind === 'RigidBody'
                        ? 'mass'
                        : kind === 'Collider'
                          ? 'center'
                          : kind === 'BoxCollider'
                            ? 'size'
                            : 'radius'),
        )!;
        for (const initialized of [false, true]) ordinary(s, fixture(kind, initialized, 'builtin'), 'builtin');
    });
for (const s of specs.filter((s) => s.type === 'set'))
    control(`${operation(s)}: same-value leased refusal and ordinary behavior`, () => {
        for (const initialized of [false, true]) {
            const f = fixture(s.kind, initialized),
                value = input(s, f, true),
                before = f.snapshot();
            const shouldReturn = ['type', 'mass', 'isStatic', 'isDynamic', 'isKinematic', 'size', 'radius'].includes(
                s.name,
            );
            const original = attempt(() => invoke(s, f, value));
            record('ordinary same-value does not throw', original.threw, false);
            const shouldDelegate = initialized && !shouldReturn && s.name !== 'group';
            record('same-value original adapter count', f.effects.delegates.length, shouldDelegate ? 1 : 0);
            record('same-value cache preserved', f.cache(), before.cache);
            record(
                'same-value listener tables preserved',
                [f.table(f.c), f.table(f.old), f.table(f.next)],
                [before.callbackTable, ...before.materialTables],
            );
            f.reset();
            guard([f.c, f.adapter]);
            refused(s, f, value);
        }
    });
const poisonNames = [
    'group',
    'mass',
    'linearDamping',
    'angularDamping',
    'linearFactor',
    'angularFactor',
    'center',
    'size',
    'radius',
];
for (const s of specs.filter((s) => poisonNames.includes(s.name) && s.type === 'set'))
    for (const mode of ['poison', 'caught'])
        control(`${operation(s)}: ${mode} input never read before refusal`, () => {
            for (const initialized of [false, true]) {
                const f = fixture(s.kind, initialized);
                guard([f.c, f.adapter]);
                let reads = 0,
                    caught = 0;
                const read = () => {
                    reads++;
                    if (mode === 'poison') throw new Error('POISON_COMPONENT_INPUT');
                    try {
                        f.c.enabled = false;
                    } catch {
                        caught++;
                    }
                    return 2;
                };
                const value = s.vector
                    ? {
                          get x() {
                              return read();
                          },
                          get y() {
                              return read();
                          },
                          get z() {
                              return read();
                          },
                      }
                    : { [Symbol.toPrimitive]: read };
                refused(s, f, value);
                record('caller reads/caught nested assignments never execute', [reads, caught], [0, 0]);
            }
        });
for (const name of ['worldBounds', 'boundingSphere'])
    control(`Collider.${name}: populated cache never refreshed under lease`, () => {
        for (const initialized of [false, true]) {
            const f = fixture('Collider', initialized);
            f.c._aabb = new geometry.AABB(8, 9, 10, 11, 12, 13);
            f.c._boundingSphere = new geometry.Sphere(8, 9, 10, 11);
            guard([f.c, f.adapter]);
            refused(
                specs.find((s) => s.kind === 'Collider' && s.name === name)!,
                f,
            );
        }
    });
for (const kind of ['RigidBody', 'Collider', 'BoxCollider', 'SphereCollider'] as Kind[])
    control(`${kind}: shared leases are independent and unrelated identity stays usable`, () => {
        const s = specs.find(
            (s) =>
                s.kind === kind &&
                s.name ===
                    (kind === 'RigidBody'
                        ? 'mass'
                        : kind === 'Collider'
                          ? 'center'
                          : kind === 'BoxCollider'
                            ? 'size'
                            : 'radius'),
        )!;
        const f = fixture(kind, true),
            a = guard([f.c], 'OWNER_A'),
            b = guard([f.c], 'OWNER_B');
        a.dispose();
        a.dispose();
        refused(s, f, input(s, f), 'OWNER_B');
        const other = fixture(kind, true);
        record('unrelated identity allowed', attempt(() => invoke(s, other)).threw, false);
        b.dispose();
        b.dispose();
        record('last owner release permits entry', attempt(() => invoke(s, f)).threw, false);
        record('original component delegates after release', f.effects.nativeMockCalls, 1);
    });
control('all four supported components retain committed reads under lease', () => {
    for (const kind of ['RigidBody', 'Collider', 'BoxCollider', 'SphereCollider'] as Kind[]) {
        const f = fixture(kind, true);
        guard([f.c]);
        const before = f.cache();
        if (kind === 'RigidBody') {
            const a = new Vec3(),
                b = new Vec3();
            f.c.getLinearVelocity(a);
            f.c.getAngularVelocity(b);
            record(
                'committed velocity outputs available',
                [vector(a), vector(b)],
                [
                    [3, 4, 5],
                    [6, 7, 8],
                ],
            );
            record(
                'committed scalar reads',
                [
                    f.c.group,
                    f.c.mass,
                    f.c.allowSleep,
                    f.c.sleepThreshold,
                    f.c.useCCD,
                    f.c.getGroup(),
                    f.c.getMask(),
                    f.c.isAwake,
                    f.c.isSleeping,
                ],
                [1, 1, true, 0.1, false, 1, 15, true, false],
            );
        } else {
            record(
                'committed collider reads',
                [
                    f.c.sharedMaterial === f.old,
                    f.c.isTrigger,
                    vector(f.c.center),
                    f.c.shape === f.adapter,
                    f.c.needTriggerEvent,
                    f.c.getGroup(),
                    f.c.getMask(),
                ],
                [true, false, [0, 0, 0], true, true, 1, 15],
            );
            if (kind === 'BoxCollider') record('size read available', vector(f.c.size), [1, 1, 1]);
            if (kind === 'SphereCollider') record('radius read available', f.c.radius, 0.5);
        }
        record('committed reads leave component cache unchanged', f.cache(), before);
        record('committed reads call no mutating adapter', f.effects.nativeMockCalls, 0);
    }
});
control('nine hook command wrappers remain delegable under component lease without input inspection', () => {
    const f = fixture('RigidBody', true);
    guard([f.c]);
    let reads = 0;
    const v = {
        get x() {
            reads++;
            throw new Error('COMMAND_WRAPPER_MUST_NOT_READ');
        },
        get y() {
            reads++;
            return 0;
        },
        get z() {
            reads++;
            return 0;
        },
    };
    // Opaque argument normalization is disabled only on this explicit mock boundary;
    // all actual component method bodies stay untouched.
    const names = [
        'applyForce',
        'applyLocalForce',
        'applyImpulse',
        'applyLocalImpulse',
        'applyTorque',
        'applyLocalTorque',
        'clearState',
        'clearForces',
        'clearVelocity',
    ];
    const calls: string[] = [];
    for (const name of names)
        f.adapter[name] = (...supplied: any[]) => {
            calls.push(name);
            record(
                'command argument identity forwarded unchanged',
                name.startsWith('clear') ? supplied.length === 0 : supplied[0] === v,
                true,
            );
        };
    for (const name of names)
        record(
            `${name} remains a staged-command wrapper`,
            attempt(() => (name.startsWith('clear') ? f.c[name]() : f.c[name](v, v))).threw,
            false,
        );
    record('all allowed wrapper delegations', calls, names);
    record('no caller argument reads at wrapper', reads, 0);
});
