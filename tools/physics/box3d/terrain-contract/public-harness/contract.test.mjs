/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU NEGATIVE CONTROLS ONLY. Synthetic metadata/WASM bytes are not engine or physics evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { reviewDropTrace } from '../drop-oracle.mjs';
import { runPublicTerrainQueries } from '../public-terrain.mjs';
import {
    SCHEMA,
    PASS,
    here,
    sha,
    safePath,
    validateRecords,
    validateIdentity,
    requireCounterExport,
    validateResult,
} from './inputs.mjs';
const schemaBytes = readFileSync(new URL('../../abi-schema.json', import.meta.url));
const versions = {
    apiSchemaSha256: SCHEMA,
    core: { commit: 'CPU_CORE' },
    bindingBase: { commit: 'CPU_BINDING' },
    patchLock: { patchChainSha256: 'CPU_PATCH' },
};
const identity = {
    schemaVersion: 1,
    schemaSha256: SCHEMA,
    coreSha: 'CPU_CORE',
    bindingBaseSha: 'CPU_BINDING',
    patchChainSha256: 'CPU_PATCH',
    abiVersion: 1,
    variant: 'st-simd',
};
test('CPU-only: reviewed schema admitted, old product/schema/threading rejected', () => {
    validateIdentity(identity, versions, schemaBytes);
    for (const patch of [
        { schemaSha256: 'd0a917e85e800605295296ca0820fbcb54847ea5d00f6bfc296a3ce527243551' },
        { variant: 'mt' },
        { coreSha: 'OTHER' },
        { abiVersion: 2 },
    ])
        assert.throws(() => validateIdentity({ ...identity, ...patch }, versions, schemaBytes));
    assert.throws(() => validateIdentity(identity, versions, Buffer.from('changed schema')));
});
function exportOnlyWasm(name) {
    // Tiny inert fixture module: one empty function, never instantiated or called.
    const text = [...Buffer.from(name)],
        exports = [1, text.length, ...text, 0, 0];
    return Uint8Array.from([
        0,
        97,
        115,
        109,
        1,
        0,
        0,
        0,
        1,
        4,
        1,
        96,
        0,
        0,
        3,
        2,
        1,
        0,
        7,
        exports.length,
        ...exports,
        10,
        4,
        1,
        2,
        0,
        11,
    ]);
}
test('CPU-only export inspection rejects missing counter; does not instantiate fake WASM', () => {
    assert.equal(
        requireCounterExport(exportOnlyWasm('air_b3_mesh_lifetime_counters')),
        'air_b3_mesh_lifetime_counters',
    );
    assert.throws(() => requireCounterExport(exportOnlyWasm('old_export')));
    assert.throws(() => requireCounterExport(Buffer.from('not WASM')));
});
test('CPU-only input lock paths/inventories reject escape, duplicates, omissions and bad fingerprints', () => {
    for (const path of ['/abs', '../escape', 'a/../b', 'a\\b', 'a//b', './a']) assert.throws(() => safePath(path));
    const record = { path: 'safe.mjs', bytes: 0, sha256: sha('') };
    validateRecords([record], ['safe.mjs']);
    assert.throws(() => validateRecords([record, record]));
    assert.throws(() => validateRecords([record], ['safe.mjs', 'missing.wasm']));
    assert.throws(() => validateRecords([{ ...record, sha256: 'old-pass-label' }]));
    assert.throws(() => validateRecords([{ ...record, bytes: -1 }]));
});
function cpuReport() {
    // Same constructed nonphysical trace as drop-oracle.test; never native evidence.
    const drops = Array.from({ length: 42 }, (_, i) => ({
        step: i + 1,
        position: [
            0.5,
            Math.max(0.75 + 0.1 * Math.sqrt(1 + 0.5 ** 2 + (2 / 3) ** 2), 2 - (5 * (i + 1) * (i + 2)) / 3600),
            0.75,
        ],
    }));
    const users = ['terrain-a', 'terrain-b', 'terrain-c', 'terrain-centered-rotated'];
    return {
        status: PASS,
        inputsUnchanged: true,
        fullGates: 'NOT_RUN',
        C19: 'NOT_QUALIFIED_BY_PUBLIC_BEHAVIOR',
        terrain: {
            status: 'PASS',
            C19: 'NOT_QUALIFIED_BY_PUBLIC_BEHAVIOR',
            cleanupErrors: [],
            committedQueries: [{}],
            drops,
            dropResponse: reviewDropTrace(drops),
            rays: Array.from({ length: 43 }, (_, i) => ({
                id: users[Math.floor(i / 6)] ?? 'terrain-a',
                hit: true,
                point: [0, 0, 0],
            })),
            sweeps: ['sphere', 'box', 'capsule'].map((kind) => ({ kind, distance: 1, collider: 'terrain-a' })),
        },
        close: {
            status: 'released',
            failures: [],
            physicsPreparation: {
                status: 'closed',
                cleanupErrors: [],
                acquired: [{ backend: 'box3d', cleanup: 'released', retained: [] }],
            },
        },
        closeIdempotent: true,
        hostClosed: true,
        completedAt: 'CPU_MOCK_NOT_PHYSICS',
        frames: Array.from({ length: drops.length + 4 }, (_, i) => ({ step: i + 1, dt: 1 / 60, afterDraw: true })),
    };
}
test('CPU-only result validator rejects dirty close, clock drift, missing sustained response and inflated C19', () => {
    validateResult(cpuReport());
    for (const mutate of [
        (r) => {
            r.close.failures.push('not released');
        },
        (r) => {
            r.close.physicsPreparation.acquired = [];
        },
        (r) => {
            r.close.physicsPreparation.acquired[0].retained = ['native lease'];
        },
        (r) => {
            r.frames[0].dt = 1 / 120;
        },
        (r) => {
            r.frames[0].step = 2;
        },
        (r) => {
            r.terrain.dropResponse.responseSteps = 0;
        },
        (r) => {
            r.inputsUnchanged = false;
        },
        (r) => {
            r.C19 = 'PASS';
        },
        (r) => {
            r.hostClosed = false;
        },
        (r) => {
            r.terrain.rays.pop();
        },
        (r) => {
            r.terrain.sweeps.pop();
        },
        (r) => {
            r.frames.pop();
        },
        (r) => {
            r.terrain.drops[20].position[1] = -100;
        },
    ]) {
        const report = cpuReport();
        mutate(report);
        assert.throws(() => validateResult(report));
    }
});
test('CPU source control: original physical fixture with observations, real app/clock, no fake backend', () => {
    const consumer = readFileSync(join(here, 'consumer.mjs'), 'utf8');
    assert(consumer.includes('await runPublicTerrainQueries(sdk, scene, step, record)'));
    assert(consumer.includes('await sdk.createAirApp('));
    assert(consumer.includes('sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 })'));
    assert(consumer.includes('await clock.step(DROP.dt)'));
    assert(consumer.includes("physics: 'box3d'"));
    assert(!/system\.step\(|director\.tick\(|WebAssembly\.instantiate|createBox3DBinding\(/.test(consumer));
    const host = readFileSync(join(here, 'host.mjs'), 'utf8');
    assert(!/createStepClock\s*=|PhysicsSystem\s*=|registerPhysics|WebAssembly\.instantiate/.test(host));
});
test('CPU-only CLI negative control: execution omitted or malformed exits before engine/physics', () => {
    for (const script of ['run.mjs', 'consumer.mjs']) {
        const result = spawnSync(process.execPath, [join(here, script)], { encoding: 'utf8', timeout: 3000 });
        assert.equal(result.signal, null);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Explicit.*flag required/);
    }
});

test('CPU-only failing fake ray retains pre-assert sample and primary failure despite cleanup rejection', async () => {
    // Deliberately incomplete CPU mock: rejects at the FIRST ray, before any simulated tick or native call.
    let materialDestroyed = false;
    class MockVec3 {
        clone() {
            return new MockVec3();
        }
    }
    class MockRigidBody {
        static Type = { STATIC: 0 };
    }
    class MockTerrainCollider {}
    class MockMaterial {
        destroy() {
            materialDestroyed = true;
        }
    }
    class MockNode {
        constructor(name) {
            this.name = name;
            this.isValid = true;
        }
        setPosition() {}
        setScale() {}
        setRotationFromEuler() {}
        addComponent(Type) {
            return new Type();
        }
        destroy() {
            this.isValid = false;
        }
    }
    const originalGravity = new MockVec3();
    const system = {
        gravity: originalGravity,
        autoSimulation: false,
        fixedTimeStep: 0.25,
        maxSubSteps: 9,
        syncSceneToPhysics() {},
        raycastClosest: () => false,
    };
    const sdk = {
        Node: MockNode,
        RigidBody: MockRigidBody,
        TerrainCollider: MockTerrainCollider,
        PhysicsMaterial: MockMaterial,
        PhysicsSystem: { instance: system },
        Vec3: MockVec3,
        geometry: { Ray: class {} },
    };
    const events = [];
    await assert.rejects(
        runPublicTerrainQueries(
            sdk,
            { addChild() {} },
            async () => {
                throw new Error('CPU cleanup tick rejection; no physics');
            },
            (kind, value) => {
                events.push({ kind, value: structuredClone(value) });
                if (kind === 'ray') value.hit = 'OBSERVER_MUTATION_MUST_NOT_CHANGE_FIXTURE';
            },
        ),
        (error) => error.code === 'ERR_ASSERTION' && error.actual === false && error.expected === true,
    );
    assert.equal(events[0].kind, 'ray');
    assert.equal(events[0].value.hit, false);
    const failed = events.find((e) => e.kind === 'fixture-failure');
    assert.equal(failed.value.rays.length, 1);
    assert.equal(failed.value.rays[0].hit, false, 'Observer receives an isolated copy');
    assert.equal(failed.value.status, 'FAIL');
    const cleanup = events.find((e) => e.kind === 'fixture-cleanup-failure');
    assert.equal(cleanup.value.stage, 'deferred-destroy-tick');
    assert.match(cleanup.value.error, /CPU cleanup tick rejection/);
    assert.equal(materialDestroyed, true);
    assert.equal(system.fixedTimeStep, 0.25);
    assert.equal(system.maxSubSteps, 9);
    assert.equal(system.autoSimulation, false);
});
