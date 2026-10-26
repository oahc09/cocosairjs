/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Explicit fresh production execution only. Use run.mjs for a bounded child process.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadLock, verifyInputs, verifyReady, terrain, sha, PASS, validateResult } from './inputs.mjs';
import { installHost, BASE } from './host.mjs';
import { runPublicTerrainQueries } from '../public-terrain.mjs';
import { DROP } from '../drop-oracle.mjs';
const [authorization, sourceArg, sdkArg, stArg, lockArg, outputArg] = process.argv.slice(2);
assert.equal(authorization, '--authorized-fresh-st', 'Explicit fresh ST execution flag required');
assert(
    sourceArg && sdkArg && stArg && lockArg && outputArg,
    'Pass source-root sdk-dir ready-st-dir frozen-lock fresh-output',
);
const sourceRoot = resolve(sourceArg),
    sdkDir = resolve(sdkArg),
    stDir = resolve(stArg),
    lockPath = resolve(lockArg),
    out = resolve(outputArg);
assert(!existsSync(out), 'Preserve every prior attempt');
mkdirSync(out, { recursive: true });
const journal = openSync(join(out, 'observations.raw.jsonl'), 'wx');
const report = {
    schema: 'box3d-public-terrain-production-esm-v1',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    fullGates: 'NOT_RUN',
    C17: 'NOT_RUN',
    C19: 'NOT_QUALIFIED_BY_PUBLIC_BEHAVIOR',
    hostBoundary:
        'Node HEADLESS/JSDOM, not browser/GPU/CSP/presentation acceptance. Only frozen asset transport and DOM are adapted; engine, WASM and fixed-step clock are unchanged.',
    lifetimeBoundary:
        'Public shared-user visibility/lifetime behavior only. Exact native cook/destruction counters and cache-lease proofs require the separate real native fixture.',
    clocks: {
        api: 'createStepClock',
        frameRate: 60,
        dt: DROP.dt,
        stepTimeoutMs: 2000,
        maxFrames: 110,
        nativePacer:
            'Exclusive project clock lease from begin() until normal app.close(); no direct physics.step or director.tick calls.',
    },
    transport: [],
    moduleResolution: [],
    hostErrors: [],
    frames: [],
};
let sequence = 0;
const record = (kind, value) => appendFileSync(journal, JSON.stringify({ sequence: ++sequence, kind, value }) + '\n');
let host, app, clock, failure, lock, lockSha256;
try {
    ({ lock, lockSha256 } = loadLock(lockPath));
    report.lockSha256 = lockSha256;
    report.runtimeBuildNumber = lock.runtimeBuildNumber;
    report.declaredRuntimeProducerCommit = lock.declaredRuntimeProducerCommit;
    report.sourceSnapshotRole = lock.sourceSnapshotRole;
    report.runtimeIdentity = { sdk: lock.sdk, st: lock.st };
    writeFileSync(join(out, 'input-lock.json'), readFileSync(lockPath), { flag: 'wx' });
    for (const item of lock.fixture) {
        const destination = join(out, 'frozen-fixture', item.path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, readFileSync(join(terrain, item.path)), { flag: 'wx' });
    }
    verifyInputs(sourceRoot, sdkDir, stDir, lock);
    report.readiness = await verifyReady(sourceRoot, stDir);
    assert.deepEqual(report.readiness, lock.readiness);
    record('inputs-verified', { lockSha256, readiness: report.readiness });
    host = installHost(sourceRoot, sdkDir, stDir, lock, report, () =>
        record('asset-transport', {
            transport: report.transport,
            moduleResolution: report.moduleResolution,
        }),
    );
    const sdk = await import(host.bundle);
    assert.equal(report.transport.length, 0, 'ESM import must not acquire native assets');
    assert.equal(report.moduleResolution.length, 0);
    assert.equal(sdk.AIR_BUILD_NUMBER, lock.runtimeBuildNumber, 'Exact caller-frozen fresh SDK build');
    const required = [
        'createAirApp',
        'createStepClock',
        'Node',
        'Scene',
        'RigidBody',
        'TerrainCollider',
        'SphereCollider',
        'PhysicsMaterial',
        'PhysicsSystem',
        'Vec3',
        'registerBox3DBeforeStep',
        'queryBox3DCommittedRay',
    ];
    assert(
        required.every((name) => typeof sdk[name] === 'function'),
        'Required APIs must be real public exports',
    );
    assert.equal(typeof sdk.geometry?.Ray, 'function');
    assert(!Object.keys(sdk).some((name) => name.startsWith('__testOnly')));
    app = await sdk.createAirApp({
        canvas: '#GameCanvas',
        renderMode: 3,
        physics: 'box3d',
        physicsOptions: { box3d: { assetBaseUrl: BASE, threading: 'single', workerCount: 1, solverSubSteps: 4 } },
    });
    assert.deepEqual(
        report.transport.map((e) => e.path),
        ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'],
    );
    assert.equal(report.moduleResolution.length, 1, 'Only real product loader resolves the ST module');
    const system = sdk.PhysicsSystem.instance;
    system.enable = true;
    system.autoSimulation = false;
    system.gravity = new sdk.Vec3();
    system.fixedTimeStep = DROP.dt;
    system.maxSubSteps = 1;
    const scene = new sdk.Scene('public-terrain-production-esm');
    app.run(scene);
    clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
    clock.begin();
    assert.equal(clock.stepping, true);
    const step = async () => {
        assert(report.frames.length < 110, 'Finite fixed-clock budget exhausted');
        assert.equal(system.fixedTimeStep, DROP.dt);
        assert.equal(system.maxSubSteps, 1);
        const frame = await clock.step(DROP.dt);
        assert.deepEqual(frame, { step: report.frames.length + 1, dt: DROP.dt, afterDraw: true });
        report.frames.push(frame);
        record('fixed-frame', frame);
    };
    // The public fixture keeps its original physical assertions; copied observations survive failed assertions.
    report.terrain = await runPublicTerrainQueries(sdk, scene, step, record);
    record('terrain-result', report.terrain);
    assert.equal(report.terrain.status, 'PASS');
    report.C17 = 'PUBLIC_TERRAIN_SUBSET_PASS; NOT_FULL_GATES';
} catch (error) {
    failure = error;
    report.error = String(error.stack ?? error);
    report.errorCode = error.code ?? null;
    record('failure', { error: report.error, code: report.errorCode });
} finally {
    if (app) {
        try {
            const first = app.close(),
                duplicate = app.close();
            report.closeIdempotent = first === duplicate;
            assert(report.closeIdempotent, 'app.close must be idempotent');
            report.close = await first;
            record('normal-app-close', report.close);
        } catch (error) {
            failure ??= error;
            report.closeError = String(error.stack ?? error);
        }
    }
    try {
        if (lock) {
            verifyInputs(sourceRoot, sdkDir, stDir, lock);
            assert.equal(sha(readFileSync(lockPath)), lockSha256);
            report.inputsUnchanged = true;
        }
    } catch (error) {
        failure ??= error;
        report.inputError = String(error.stack ?? error);
    }
    try {
        if (host) {
            host.close();
            report.hostClosed = true;
        }
        assert.deepEqual(report.hostErrors, [], 'No unaccounted host errors');
    } catch (error) {
        failure ??= error;
        report.hostCloseError = String(error.stack ?? error);
    }
    report.completedAt = new Date().toISOString();
    report.totalSteps = report.frames.length;
    report.status = failure ? 'FAIL' : PASS;
    if (!failure) {
        try {
            validateResult(report);
        } catch (error) {
            failure = error;
            report.validationError = String(error.stack ?? error);
            report.status = 'FAIL';
        }
    }
    record('terminal', { status: report.status, completedAt: report.completedAt });
    closeSync(journal);
    report.journal = { path: 'observations.raw.jsonl', sha256: sha(readFileSync(join(out, 'observations.raw.jsonl'))) };
    writeFileSync(join(out, 'consumer.raw.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    if (failure) process.exitCode = 1;
}
console.log(
    JSON.stringify({
        status: report.status,
        output: out,
        totalSteps: report.totalSteps,
        error: report.error ?? report.closeError ?? report.inputError ?? report.validationError ?? null,
    }),
);
