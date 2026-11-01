/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Production execution is NOT part of source preparation. Use the bounded runner after authorization.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadLock, verifyInputs, verifyReady, fixtureRoot, sha } from './inputs.mjs';
import { PROFILE, CONFIG, QUALIFICATION, HOST_SHA256, PASS, validateResult } from './contract.mjs';
import { installHost, BASE } from './host.mjs';
import { runSceneCycles } from './fixture.mjs';
const [authorization, sourceArg, sdkArg, stArg, lockArg, outputArg] = process.argv.slice(2);
assert.equal(authorization, '--authorized-c20app-fresh-st', 'Explicit C20APP execution flag; not user permission');
assert(
    sourceArg && sdkArg && stArg && lockArg && outputArg,
    'Pass source-root sdk-dir ready-st-dir frozen-lock fresh-output',
);
const sourceRoot = resolve(sourceArg),
    sdkDir = resolve(sdkArg),
    stDir = resolve(stArg),
    lockPath = resolve(lockArg),
    out = resolve(outputArg);
assert(!existsSync(out), 'Every attempt must have a fresh immutable destination');
mkdirSync(out, { recursive: true });
const journal = openSync(join(out, 'observations.raw.jsonl'), 'wx');
const report = {
    schema: 'box3d-c20app-production-esm-v1',
    profile: PROFILE,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    configuration: CONFIG,
    qualification: QUALIFICATION,
    hostSha256: HOST_SHA256,
    moduleFactoryReplaced: false,
    appCreateCalls: 0,
    appCloseCalls: 0,
    clockCreateCalls: 0,
    clockBeginCalls: 0,
    clockEndCalls: 0,
    completedCycles: 0,
    totalSteps: 0,
    cycles: [],
    frames: [],
    transport: [],
    moduleResolution: [],
    hostErrors: [],
    baselinePolicy: 'Exact pre-first-scene native counts/liveBytes; fail first drift; no warmup, averaging or reset',
    baselineFailureMeaning:
        'Baseline assertion not satisfied; NOT a standalone engine-leak diagnosis. Legal empty-world capacity retention requires separate source analysis, never a rebased PASS.',
    hostBoundary:
        'Original public-terrain host bytes; JSDOM HEADLESS, normal production loader and module factory; no browser/GPU/CSP acceptance',
    resourceBoundary:
        'Present rows carry actual native cacheLeases/shapeBorrows; empty list proves only no tracked leases. JS users and material/session flags are auxiliary, not global native handle counters.',
};
let sequence = 0;
const record = (kind, value) => appendFileSync(journal, JSON.stringify({ sequence: ++sequence, kind, value }) + '\n');
let host, app, failure, lock, lockSha256, verifyAfterClose;
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
        writeFileSync(destination, readFileSync(join(fixtureRoot, item.path)), { flag: 'wx' });
    }
    verifyInputs(sourceRoot, sdkDir, stDir, lock);
    report.readiness = await verifyReady(sourceRoot, stDir);
    assert.deepEqual(report.readiness, lock.readiness);
    record('inputs-before', { lockSha256, source: lock.source, fixture: lock.fixture, sdk: lock.sdk, st: lock.st });
    host = installHost(sourceRoot, sdkDir, stDir, lock, report, () =>
        record('asset-transport', {
            transport: report.transport,
            moduleResolution: report.moduleResolution,
        }),
    );
    const sdk = await import(host.bundle);
    assert.equal(report.transport.length, 0);
    assert.equal(report.moduleResolution.length, 0);
    assert.equal(sdk.AIR_BUILD_NUMBER, lock.runtimeBuildNumber);
    for (const name of [
        'createAirApp',
        'createStepClock',
        'Node',
        'Scene',
        'RigidBody',
        'BoxCollider',
        'SphereCollider',
        'TerrainCollider',
        'FixedConstraint',
        'PhysicsMaterial',
        'PhysicsSystem',
        'Vec3',
        'readBox3DConstraintState',
    ])
        assert.equal(typeof sdk[name], 'function', 'Required real production main-entry export: ' + name);
    assert(!Object.keys(sdk).some((name) => name.startsWith('__testOnly')));
    report.appCreateCalls++;
    app = await sdk.createAirApp({
        canvas: '#GameCanvas',
        renderMode: 3,
        physics: 'box3d',
        physicsOptions: { box3d: { assetBaseUrl: BASE, threading: 'single', workerCount: 1, solverSubSteps: 4 } },
    });
    assert.deepEqual(
        report.transport.map((row) => row.path),
        ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'],
    );
    assert.equal(report.moduleResolution.length, 1);
    const system = sdk.PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.gravity = new sdk.Vec3(0, 0, 0);
    system.fixedTimeStep = CONFIG.dt;
    system.maxSubSteps = 1;
    verifyAfterClose = await runSceneCycles({ sdk, app, report, record });
} catch (error) {
    failure = error;
    report.error = String(error.stack ?? error);
    report.errorCode = error.code ?? null;
    const partial = report.cycles.at(-1);
    if (partial && partial.phase !== 'complete') partial.status = 'FAIL';
    record('failure', {
        error: report.error,
        code: report.errorCode,
        completedCycles: report.completedCycles,
        partial,
    });
} finally {
    if (app) {
        try {
            report.appCloseCalls++;
            report.close = await app.close();
            record('one-normal-app-close', report.close);
            verifyAfterClose?.();
        } catch (error) {
            failure ??= error;
            report.closeError = String(error.stack ?? error);
            record('close-failure', { error: report.closeError });
        }
    }
    try {
        if (lock) {
            verifyInputs(sourceRoot, sdkDir, stDir, lock);
            assert.equal(sha(readFileSync(lockPath)), lockSha256);
            report.inputsUnchanged = true;
            record('inputs-after', {
                lockSha256,
                unchanged: true,
                source: lock.source,
                fixture: lock.fixture,
                sdk: lock.sdk,
                st: lock.st,
            });
        }
    } catch (error) {
        failure ??= error;
        report.inputError = String(error.stack ?? error);
        record('input-drift', { error: report.inputError });
    }
    try {
        host?.close();
        report.hostClosed = !!host;
        assert.deepEqual(report.hostErrors, []);
    } catch (error) {
        failure ??= error;
        report.hostCloseError = String(error.stack ?? error);
        record('host-close-failure', { error: report.hostCloseError });
    }
    report.completedAt = new Date().toISOString();
    report.totalSteps = report.frames.length;
    report.status = failure ? 'FAIL' : PASS;
    if (!failure)
        try {
            validateResult(report);
        } catch (error) {
            failure = error;
            report.validationError = String(error.stack ?? error);
            report.status = 'FAIL';
            record('validation-failure', { error: report.validationError });
        }
    record('terminal', {
        status: report.status,
        completedAt: report.completedAt,
        completedCycles: report.completedCycles,
    });
    closeSync(journal);
    report.journal = { path: 'observations.raw.jsonl', sha256: sha(readFileSync(join(out, 'observations.raw.jsonl'))) };
    writeFileSync(join(out, 'consumer.raw.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    if (failure) process.exitCode = 1;
}
console.log(
    JSON.stringify({
        status: report.status,
        output: out,
        completedCycles: report.completedCycles,
        totalSteps: report.totalSteps,
        error: report.error ?? report.closeError ?? report.inputError ?? report.validationError ?? null,
    }),
);
