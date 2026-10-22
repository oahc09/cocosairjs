/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual PhysicsSystem, RecyclePool, results, math and director EventTarget source.
 * The World delegate counts boundary calls only. This is NOT native/WASM evidence.
 */
declare const require: { (name: string): unknown; cache: Record<string, unknown> };
declare const process: { cwd(): string; env: Record<string, string | undefined> };
const { readFileSync, writeFileSync } = require('node:fs') as {
    readFileSync(path: string): Uint8Array;
    writeFileSync(path: string, value: string): void;
};
const { createHash } = require('node:crypto') as {
    createHash(algorithm: string): { update(value: Uint8Array): { digest(encoding: 'hex'): string } };
};
const { relative } = require('node:path') as { relative(from: string, to: string): string };
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsRayResult, PhysicsLineStripCastResult } from '../../../src/cocos/physics/framework/physics-ray-result';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { director, DirectorEvent } from '../../../src/cocos/game';
import { Vec3, geometry } from '../../../src/cocos/core';
import {
    assertMutationAllowed,
    registerMutationGuard,
    MutationGuardLease,
} from '../../../src/cocos/core/data/mutation-guard';

const code = 'AIR_E_TEST_SYSTEM_ENTRY';
const rows: any[] = [];
let current: any;
let leases: MutationGuardLease[] = [];
let systems: any[] = [];
const originalWorld = Object.getOwnPropertyDescriptor(selector, 'physicsWorld')!;
const originalId = selector.id;
const selection = selector as any;
const eventOwner = {};
const guard = (targets: object[], rejectionCode = code) => {
    const lease = registerMutationGuard(targets, {
        code: rejectionCode,
        message: 'Explicit system entry fixture lease',
    });
    leases.push(lease);
    return lease;
};
const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
const record = (name: string, actual: unknown, expected: unknown) => {
    const observed = JSON.stringify(actual),
        wanted = JSON.stringify(expected);
    const snapshot = (value: string | undefined) => (value === undefined ? { type: 'undefined' } : JSON.parse(value));
    current.checks.push({ name, passed: observed === wanted, actual: snapshot(observed), expected: snapshot(wanted) });
};
const attempt = (fn: () => unknown) => {
    let threw = false,
        error: any,
        value: unknown;
    try {
        value = fn();
    } catch (e) {
        threw = true;
        error = e;
    }
    const result = {
        threw,
        error: threw ? String(error) : null,
        code: error?.code ?? null,
        operation: error?.operation ?? null,
        value: value === undefined ? { type: 'undefined' } : value,
    };
    current.attempts.push(copy(result));
    return result;
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
    director.targetOff(eventOwner);
    Object.defineProperty(selector, 'physicsWorld', originalWorld);
    selection.id = originalId;
    for (const system of systems) {
        system.raycastResultPool.destroy();
        system.sweepResultPool.destroy();
    }
    systems = [];
});
afterAll(() => {
    const output = process.env.BOX3D_SYSTEM_ENTRY_RAW;
    if (output)
        writeFileSync(
            output,
            JSON.stringify(
                {
                    scope: 'Actual PhysicsSystem source with explicit leases, real pools/results and director EventTarget. Counted mock World delegates; no actual World leases, WASM, native physics or feature activation.',
                    rows,
                    loadedEngineSources: Object.keys(require.cache)
                        .map((path) => ({ path, relative: relative(process.cwd(), path) }))
                        .filter(({ relative: p }) => p.startsWith('src/') || p.startsWith('test/'))
                        .sort((a, b) => a.relative.localeCompare(b.relative))
                        .map(({ path, relative: p }) => ({
                            path: p,
                            sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
                        })),
                },
                null,
                0,
            ) + '\n',
        );
});

const allQueries = [
    'raycast',
    'raycastClosest',
    'lineStripCast',
    'lineStripCastClosest',
    'sweepBox',
    'sweepBoxClosest',
    'sweepSphere',
    'sweepSphereClosest',
    'sweepCapsule',
    'sweepCapsuleClosest',
];
const directQueries = allQueries.filter((method) => !method.startsWith('lineStrip'));
const methods = ['postUpdate', 'step', 'syncSceneToPhysics', 'emitEvents', ...allQueries];
const resultData = (result: any) => ({
    point: [result.hitPoint.x, result.hitPoint.y, result.hitPoint.z],
    normal: [result.hitNormal.x, result.hitNormal.y, result.hitNormal.z],
    distance: result.distance,
    collider: result.collider?.tag ?? null,
    fraction: result.closestHitFraction,
    id: result.id ?? null,
});
function fixture() {
    const system = new (PhysicsSystem as unknown as { new (): PhysicsSystem })() as any;
    systems.push(system);
    const effects = { delegateCalls: 0, nativeCallCount: 0, before: 0, after: 0, calls: [] as string[] };
    const collider = { tag: 'fixture-collider' };
    const fill = (result: any, distance = 9) =>
        result._assign(new Vec3(1, 2, 3), distance, collider, new Vec3(0, 1, 0), 0.25);
    const world: any = { debugDrawFlags: 17, debugDrawConstraintSize: 0.8 };
    for (const method of ['step', 'syncSceneToPhysics', 'emitEvents', 'syncAfterEvents', ...directQueries]) {
        world[method] = (...args: any[]) => {
            effects.delegateCalls++;
            assertMutationAllowed(world, `FixtureWorld.${method}`);
            effects.nativeCallCount++;
            effects.calls.push(method);
            if (directQueries.includes(method)) {
                if (method.endsWith('Closest')) fill(args[args.length - 1], 2);
                else {
                    const pool = args[args.length - 2],
                        results = args[args.length - 1];
                    const result = pool.add();
                    fill(result, 2);
                    results.push(result);
                }
                return true;
            }
        };
    }
    selection.physicsWorld = world;
    selection.id = 'box3d';
    system._accumulator = 0.25;
    system._subStepCount = 7;
    system._fixedTimeStep = 1;
    system._maxSubSteps = 2;
    Object.assign(system.raycastOptions, { group: 53, mask: 73, queryTrigger: false, maxDistance: 101 });
    for (const name of ['raycastResultPool', 'sweepResultPool']) {
        fill(system[name].add(), 9);
        fill(system[name].add(), 10);
    }
    for (const name of ['raycastResults', 'sweepCastResults']) {
        const result = new PhysicsRayResult();
        fill(result);
        system[name].push(result);
    }
    fill(system.raycastClosestResult);
    fill(system.sweepCastClosestResult);
    const line = new PhysicsLineStripCastResult();
    fill(line);
    system.lineStripCastResults.push(line);
    fill(system.lineStripCastClosestResult);
    director.on(
        DirectorEvent.BEFORE_PHYSICS,
        () => {
            effects.before++;
            effects.calls.push('BEFORE_PHYSICS');
        },
        eventOwner,
    );
    director.on(
        DirectorEvent.AFTER_PHYSICS,
        () => {
            effects.after++;
            effects.calls.push('AFTER_PHYSICS');
        },
        eventOwner,
    );
    const snapshot = () => ({
        flags: [system._enable, system._allowSleep, system._autoSimulation, system._executeInEditMode],
        accumulator: system._accumulator,
        subStepCount: system._subStepCount,
        config: [system._maxSubSteps, system._fixedTimeStep, system._sleepThreshold],
        gravity: [system._gravity.x, system._gravity.y, system._gravity.z],
        options: { ...system.raycastOptions },
        pools: ['raycastResultPool', 'sweepResultPool'].map((name) => ({
            length: system[name].length,
            data: system[name].data.map(resultData),
        })),
        results: ['raycastResults', 'sweepCastResults', 'lineStripCastResults'].map((name) =>
            system[name].map(resultData),
        ),
        closest: ['raycastClosestResult', 'sweepCastClosestResult', 'lineStripCastClosestResult'].map((name) =>
            resultData(system[name]),
        ),
        effects: copy(effects),
    });
    const references = () => [
        system.raycastOptions,
        system.raycastResults,
        system.sweepCastResults,
        system.lineStripCastResults,
        system.raycastClosestResult,
        system.sweepCastClosestResult,
        system.lineStripCastClosestResult,
        system.raycastResultPool.data,
        system.sweepResultPool.data,
    ];
    return { system, world, effects, snapshot, references };
}
function args(method: string, mask: any = -2): any[] {
    const ray = new geometry.Ray(0, 0, 0, 0, 0, 1),
        orientation = { x: 0, y: 0, z: 0, w: 1 };
    if (method === 'postUpdate') return [1];
    if (method === 'step') return [1, 2, 3];
    if (method === 'syncSceneToPhysics' || method === 'emitEvents') return [];
    if (method.startsWith('lineStrip')) return [[new Vec3(0, 0, 0), new Vec3(0, 0, 4)], mask, 7, true];
    if (method.startsWith('sweepBox')) return [ray, new Vec3(1, 2, 3), orientation, mask, 7, true];
    if (method.startsWith('sweepSphere')) return [ray, 2, mask, 7, true];
    if (method.startsWith('sweepCapsule')) return [ray, 2, 3, orientation, mask, 7, true];
    return [ray, mask, 7, true];
}
function refusal(method: string, f: ReturnType<typeof fixture>, supplied = args(method), rejectionCode = code) {
    const before = f.snapshot(),
        references = f.references();
    const result = attempt(() => f.system[method](...supplied));
    record(
        'explicit identity lease rejects with exact System operation',
        [result.threw, result.code, result.operation],
        [true, rejectionCode, `PhysicsSystem.${method}`],
    );
    record(
        'flags, accumulator, options, result values, pools, events and delegate/native counters unchanged',
        f.snapshot(),
        before,
    );
    record(
        'cache and result identities unchanged',
        f.references().map((value, index) => value === references[index]),
        references.map(() => true),
    );
}
for (const method of methods)
    control(`${method}: explicit lease rejects before any mutable effect`, () => {
        const f = fixture();
        guard([f.system, f.world]);
        refusal(method, f);
    });
for (const method of methods)
    control(`${method}: no lease retains ordinary actual-engine path`, () => {
        const f = fixture(),
            result = attempt(() => f.system[method](...args(method)));
        record('no refusal', result.threw, false);
        const expectedCalls =
            method === 'postUpdate'
                ? [
                      'BEFORE_PHYSICS',
                      'syncSceneToPhysics',
                      'step',
                      'emitEvents',
                      'syncAfterEvents',
                      'syncSceneToPhysics',
                      'AFTER_PHYSICS',
                  ]
                : [
                      method === 'lineStripCast'
                          ? 'raycast'
                          : method === 'lineStripCastClosest'
                            ? 'raycastClosest'
                            : method,
                  ];
        record('normal event and delegate order', f.effects.calls, expectedCalls);
        record(
            'every allowed World boundary reaches mock native counter',
            [f.effects.delegateCalls, f.effects.nativeCallCount],
            [method === 'postUpdate' ? 5 : 1, method === 'postUpdate' ? 5 : 1],
        );
        if (method === 'postUpdate')
            record(
                'normal accumulator/substeps/events',
                [f.system._accumulator, f.system._subStepCount, f.effects.before, f.effects.after],
                [0.25, 1, 1, 1],
            );
        if (allQueries.includes(method)) {
            record('query succeeds', result.value, true);
            record('normal option normalization', f.system.raycastOptions, {
                group: 53,
                mask: 4294967294,
                queryTrigger: true,
                maxDistance: method.startsWith('lineStrip') ? 4 : 7,
            });
            const name = method.startsWith('lineStrip')
                ? method.endsWith('Closest')
                    ? 'lineStripCastClosestResult'
                    : 'lineStripCastResults'
                : method.startsWith('sweep')
                  ? method.endsWith('Closest')
                      ? 'sweepCastClosestResult'
                      : 'sweepCastResults'
                  : method.endsWith('Closest')
                    ? 'raycastClosestResult'
                    : 'raycastResults';
            record(
                'fresh closest/all result recorded',
                method.endsWith('Closest') ? f.system[name].distance : f.system[name].map((r: any) => r.distance),
                method.endsWith('Closest') ? 2 : [2],
            );
            if (!method.endsWith('Closest'))
                record(
                    'normal pool reset and refill',
                    f.system[method.startsWith('sweep') ? 'sweepResultPool' : 'raycastResultPool'].length,
                    1,
                );
        }
    });
for (const method of [...directQueries, 'postUpdate', 'lineStripCast', 'lineStripCastClosest']) {
    for (const mode of ['poison', 'caught-nested'])
        control(`${method}: ${mode} caller accessor is not read under lease`, () => {
            const f = fixture();
            guard([f.system, f.world]);
            let reads = 0,
                caught = 0;
            const read = () => {
                reads++;
                if (mode === 'poison') throw new Error('POISON_CALLER_ACCESS');
                try {
                    f.system.resetAccumulator(99);
                } catch {
                    caught++;
                }
                return 2;
            };
            const supplied = args(method, { [Symbol.toPrimitive]: read });
            if (method === 'postUpdate') supplied[0] = { [Symbol.toPrimitive]: read };
            if (method.startsWith('lineStrip'))
                supplied[0] = {
                    get length() {
                        return read();
                    },
                    0: new Vec3(),
                    1: new Vec3(0, 0, 4),
                };
            refusal(method, f, supplied);
            record('caller accessor and caught nested mutation never run', [reads, caught], [0, 0]);
        });
}
for (const method of methods)
    control(`${method}: admission precedes poisoned World lookup`, () => {
        const f = fixture();
        guard([f.system]);
        let reads = 0;
        Object.defineProperty(selector, 'physicsWorld', {
            configurable: true,
            get() {
                reads++;
                throw new Error('POISON_WORLD_LOOKUP');
            },
        });
        refusal(method, f);
        record('World lookup never executes', reads, 0);
    });
for (const branch of ['disabled', 'manual', 'missing-world'])
    control(`postUpdate: ${branch} is still a mutable admission under lease`, () => {
        const f = fixture();
        if (branch === 'disabled') f.system.enable = false;
        if (branch === 'manual') f.system.autoSimulation = false;
        if (branch === 'missing-world') selection.physicsWorld = null;
        guard([f.system, f.world]);
        refusal('postUpdate', f);
    });
for (const branch of ['disabled', 'manual', 'missing-world'])
    control(`postUpdate: no lease preserves ${branch} behavior`, () => {
        const f = fixture();
        if (branch === 'disabled') f.system.enable = false;
        if (branch === 'manual') f.system.autoSimulation = false;
        if (branch === 'missing-world') selection.physicsWorld = null;
        f.system.postUpdate(1);
        record('branch-specific effects', f.effects, {
            delegateCalls: branch === 'disabled' ? 1 : 0,
            nativeCallCount: branch === 'disabled' ? 1 : 0,
            before: 0,
            after: 0,
            calls: branch === 'disabled' ? ['syncSceneToPhysics'] : [],
        });
        record('accumulator/substeps preserved', [f.system._accumulator, f.system._subStepCount], [0.25, 7]);
    });
for (const method of directQueries)
    control(`${method}: no-world no-lease branch does not touch inputs or caches`, () => {
        const f = fixture();
        selection.physicsWorld = null;
        let reads = 0;
        const before = f.snapshot();
        const result = f.system[method](
            ...args(method, {
                [Symbol.toPrimitive]() {
                    reads++;
                    throw new Error('UNEXPECTED_COERCION');
                },
            }),
        );
        record('original no-world return', result, false);
        record('inputs untouched', reads, 0);
        record('cache unchanged', f.snapshot(), before);
    });
control('committed getters remain readable while System and World are leased', () => {
    const f = fixture();
    guard([f.system, f.world]);
    const before = f.snapshot();
    record(
        'cached scalar getters',
        [
            f.system.enable,
            f.system.allowSleep,
            f.system.maxSubSteps,
            f.system.fixedTimeStep,
            f.system.sleepThreshold,
            f.system.autoSimulation,
            f.system.debugDrawFlags,
            f.system.debugDrawConstraintSize,
        ],
        [true, true, 2, 1, 0.1, true, 17, 0.8],
    );
    record(
        'world and gravity identities readable',
        [f.system.physicsWorld === f.world, f.system.gravity === f.system._gravity],
        [true, true],
    );
    record('committed query distance readable', f.system.raycastClosestResult.distance, 9);
    record('read-only getters do not mutate or call native', f.snapshot(), before);
});
control('shared independent System leases require both releases; unrelated System remains usable', () => {
    const f = fixture();
    const first = guard([f.system], 'FIRST_OWNER'),
        second = guard([f.system], 'SECOND_OWNER');
    first.dispose();
    first.dispose();
    refusal('postUpdate', f, args('postUpdate'), 'SECOND_OWNER');
    refusal('raycast', f, args('raycast'), 'SECOND_OWNER');
    const unrelated = new (PhysicsSystem as unknown as { new (): PhysicsSystem })() as any;
    systems.push(unrelated);
    record('other identity is not blocked', attempt(() => unrelated.step(1)).threw, false);
    second.dispose();
    second.dispose();
    record(
        'last release restores actual query entry',
        attempt(() => f.system.raycast(...args('raycast'))).threw,
        false,
    );
    record('successful unrelated step and restored query reach native delegate', f.effects.calls, ['step', 'raycast']);
});
control('caught registry-input reentry cannot mutate System query caches or install a new lease', () => {
    const f = fixture();
    const before = f.snapshot();
    let reads = 0,
        caught = 0;
    const targets = [] as object[];
    targets.length = 1;
    Object.defineProperty(targets, 0, {
        get() {
            reads++;
            try {
                f.system.raycast(...args('raycast'));
            } catch {
                caught++;
            }
            return f.system;
        },
    });
    const result = attempt(() => guard(targets));
    record('caught admission poisons registration', result.threw, true);
    record(
        'exact copy-reentry refusal',
        result.error,
        'Error: Mutation guard input caught a rejected nested admission.',
    );
    record('one input accessor catches one rejection', [reads, caught], [1, 1]);
    record('query caches and counters unchanged despite caught nested entry', f.snapshot(), before);
    record('failed registration leaves System unleased', attempt(() => f.system.step(1)).threw, false);
});
