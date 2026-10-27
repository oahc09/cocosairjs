/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Only run.mjs may launch this fresh, identity-bound production consumer after authorization.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
    loadLock,
    verifyInputs,
    verifyReady,
    here,
    executionRoot,
    sha,
    entry,
    PROFILE,
    PASS,
    QUALIFICATION,
    HOST_SHA256,
    validateResult,
} from './inputs.mjs';
import { installHost, BASE } from '../../../terrain-contract/public-harness/host.mjs';
import { runPublicModuleRelease } from '../../public-contract.mjs';
const [authorization, sourceArg, sdkArg, stArg, evidenceArg, lockArg, outputArg] = process.argv.slice(2);
assert.equal(authorization, '--authorized-module-release-fresh-st', 'Flag is not user permission');
assert(sourceArg && sdkArg && stArg && evidenceArg && lockArg && outputArg);
const [sourceRoot, sdkDir, stDir, evidenceRoot, lockPath, out] = [
    sourceArg,
    sdkArg,
    stArg,
    evidenceArg,
    lockArg,
    outputArg,
].map((value) => resolve(value));
assert(!existsSync(out), 'Preserve every old attempt');
mkdirSync(out, { recursive: true });
const journalPath = join(out, 'observations.raw.jsonl'),
    journal = openSync(journalPath, 'wx');
const report = {
    schema: 'air-box3d-public-module-release-report-v1',
    profile: PROFILE,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    harnessQualification: QUALIFICATION,
    hostSha256: HOST_SHA256,
    moduleFactoryReplaced: false,
    appCreateCalls: 0,
    fallbackCloseCalls: 0,
    transport: [],
    moduleResolution: [],
    hostErrors: [],
    journalErrors: [],
};
let sequence = 0,
    host,
    app,
    lock,
    lockSha256,
    failure;
const record = (kind, value) => appendFileSync(journal, JSON.stringify({ sequence: ++sequence, kind, value }) + '\n');
const errorText = (error) => String(error?.stack ?? error);
const safeRecord = (kind, value) => {
    try {
        record(kind, value);
    } catch (error) {
        report.journalErrors.push(errorText(error));
        failure ??= error;
    }
};
try {
    ({ lock, lockSha256 } = loadLock(lockPath));
    report.lockSha256 = lockSha256;
    report.fixtureCommit = lock.provenance.fixtureCommit;
    report.runtimeBuildNumber = lock.provenance.runtimeBuildNumber;
    report.runtimeProducerCommit = lock.provenance.runtimeProducerCommit;
    report.nativeProducerCommit = lock.provenance.nativeProducerCommit;
    report.producerReceipts = lock.provenance.receipts;
    writeFileSync(join(out, 'input-lock.json'), readFileSync(lockPath), { flag: 'wx' });
    for (const [base, records, prefix] of [
        [here, lock.runner, 'frozen-harness'],
        [sourceRoot, lock.imported, 'frozen-imports'],
        [evidenceRoot, Object.values(lock.provenance.receipts), 'producer-evidence'],
    ]) {
        for (const item of records) {
            const dest = join(out, prefix, item.path);
            mkdirSync(dirname(dest), { recursive: true });
            writeFileSync(dest, readFileSync(join(base, item.path)), { flag: 'wx' });
        }
    }
    verifyInputs(sourceRoot, sdkDir, stDir, evidenceRoot, lock);
    report.readiness = await verifyReady(sourceRoot, stDir, evidenceRoot, lock.provenance);
    assert.deepEqual(report.readiness, lock.readiness);
    record('inputs-before', {
        lockSha256,
        dependenciesSha256: lock.dependencies.sha256,
        sourceCount: lock.source.length,
        sdkCount: lock.sdk.length,
        stCount: lock.stTree.length,
        producerReceipts: lock.provenance.receipts,
    });
    host = installHost(sourceRoot, sdkDir, stDir, lock, report, () =>
        record('asset-transport', { transport: report.transport, moduleResolution: report.moduleResolution }),
    );
    const sdk = await import(host.bundle);
    assert.equal(report.transport.length, 0);
    assert.equal(report.moduleResolution.length, 0);
    assert.equal(sdk.AIR_BUILD_NUMBER, lock.provenance.runtimeBuildNumber);
    for (const name of [
        'createAirApp',
        'createStepClock',
        'Node',
        'Scene',
        'RigidBody',
        'BoxCollider',
        'TerrainCollider',
        'FixedConstraint',
        'PhysicsMaterial',
        'readBox3DConstraintState',
        'PhysicsSystem',
        'Vec3',
    ])
        assert.equal(typeof sdk[name], 'function', 'Real public export ' + name);
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
    await runPublicModuleRelease({ sdk, app, report, record });
    report.fixtureStatus = report.status;
} catch (error) {
    failure = error;
    report.error ??= errorText(error);
    report.errorCode = error.code ?? null;
    report.fixtureStatus = report.status === PASS ? PASS : 'FAIL_OR_NOT_REACHED';
    safeRecord('failure', {
        error: report.error,
        code: report.errorCode,
        partial: {
            nonempty: report.nonempty,
            activeResources: report.activeResources,
            moduleRelease: report.moduleRelease,
        },
    });
} finally {
    // The committed fixture owns its one normal close. Never call it a second time after failure.
    report.fixtureOwnCloseObserved = Object.hasOwn(report, 'close') || Object.hasOwn(report, 'closeError');
    if (app && !report.fixtureOwnCloseObserved) {
        try {
            report.fallbackCloseCalls++;
            report.close = await app.close();
            safeRecord('pre-fixture-fallback-close', report.close);
        } catch (error) {
            report.closeError ??= errorText(error);
            failure ??= error;
        }
    }
    try {
        if (lock) {
            verifyInputs(sourceRoot, sdkDir, stDir, evidenceRoot, lock);
            assert.equal(sha(readFileSync(lockPath)), lockSha256);
            report.inputsUnchanged = true;
            safeRecord('inputs-after', { lockSha256, dependenciesSha256: lock.dependencies.sha256, unchanged: true });
        }
    } catch (error) {
        report.inputError = errorText(error);
        failure ??= error;
        safeRecord('input-drift', { error: report.inputError });
    }
    try {
        host?.close();
        report.hostClosed = !!host;
        assert.deepEqual(report.hostErrors, []);
    } catch (error) {
        report.hostCloseError = errorText(error);
        failure ??= error;
    }
    report.completedFrames = report.frames?.length ?? 0;
    report.completedAt = new Date().toISOString();
    report.status = failure ? 'FAIL' : PASS;
    if (!failure)
        try {
            validateResult(report);
        } catch (error) {
            report.validationError = errorText(error);
            failure = error;
            report.status = 'FAIL';
        }
    safeRecord('terminal-before-journal-finalization', {
        status: report.status,
        fixtureStatus: report.fixtureStatus,
        completedFrames: report.frames?.length ?? 0,
        completedAt: report.completedAt,
    });
    try {
        closeSync(journal);
    } catch (error) {
        report.journalErrors.push(errorText(error));
        failure ??= error;
    }
    try {
        report.journal = entry(out, 'observations.raw.jsonl');
    } catch (error) {
        report.journal = { path: 'observations.raw.jsonl', sha256: null };
        report.journalErrors.push(errorText(error));
        failure ??= error;
    }
    if (failure || report.journalErrors.length) report.status = 'FAIL';
    writeFileSync(join(out, 'consumer.raw.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
console.log(
    JSON.stringify({
        status: report.status,
        fixtureStatus: report.fixtureStatus,
        completedFrames: report.frames?.length ?? 0,
        error: report.error ?? report.closeError ?? report.inputError ?? report.validationError ?? null,
        output: out,
    }),
);
if (report.status !== PASS) process.exitCode = 1;
