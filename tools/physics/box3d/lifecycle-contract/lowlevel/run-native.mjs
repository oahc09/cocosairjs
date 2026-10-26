// Future explicitly authorized invocation only. A separate supervisor must prove process closure.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    VERSION,
    CYCLES,
    BODIES,
    ORDERS,
    BUDGET,
    LIMITS,
    stages,
    inspectInputs,
    validateInputs,
    validateGlobal,
    validateObservedSubset,
    sha256,
    json,
    copy,
} from './contract.mjs';
import { DEBUG_SPEC, writeDebugSnapshot, readDebugSnapshot } from './debug-artifacts.mjs';
import { createNativeProbe, runNativeCycles } from './native-cycles.mjs';
assert.equal(
    process.argv[2],
    '--authorized-fresh-native-c20',
    'root review and explicit execution authorization required',
);
assert.equal(
    process.argv.length,
    7,
    'usage: run-native.mjs --authorized-fresh-native-c20 RUNTIME SOURCE LOCK FRESH_OUTPUT',
);
const [runtime, source, lockPath, out] = process.argv.slice(3).map((p) => resolve(p));
mkdirSync(out);
mkdirSync(join(out, 'debug')); // Exclusive creation; EEXIST is fatal, including an empty prior attempt.
const rawPath = join(out, 'events.jsonl'),
    fd = openSync(rawPath, 'wx'),
    events = [];
const emit = (value) => {
    const event = copy({ sequence: events.length, ...value });
    writeFileSync(fd, json(event) + '\n');
    fsyncSync(fd); // Retain every complete raw row, including failed stage/partial attempt.
    events.push(event);
};
const state = { knownWorlds: [], completedCycles: 0, createdWorlds: 0, createdBodies: 0, current: null };
const report = {
    version: VERSION,
    status: 'RUNNING',
    limits: LIMITS,
    inputs: null,
    executionKind: 'ACTUAL_ST_WASM_SINGLE_MODULE',
    node: { version: process.version, platform: process.platform, arch: process.arch },
    moduleInstances: 0,
    factoryCalls: 0,
    lifecycleClosure: { status: 'NOT_CLOSED' },
    physicalClosure: 'REQUIRES_SUPERVISOR_CLOSURE_AND_VERIFY_REPORT',
};
let api, probe, baseline, expectedInputs;
const fail = (error, phase) => {
    report.status = 'FAIL';
    report.errors ??= [];
    report.errors.push({ phase, error: error.stack || String(error) });
    emit({ kind: 'failure', phase, error: error.stack || String(error) });
    process.exitCode = 1;
};
emit({
    kind: 'declaration',
    version: VERSION,
    cycles: CYCLES,
    bodiesPerCycle: BODIES,
    releaseOrders: Array.from({ length: CYCLES }, (_, i) => ORDERS[i % 3]),
    stageContracts: Object.fromEntries(ORDERS.map((order) => [order, stages(order)])),
    budget: BUDGET,
    limits: LIMITS,
    debugSpec: DEBUG_SPEC,
    baselinePolicy: 'one original module baseline before facade construction; no warmup or per-cycle rebasing',
    scratchPolicy:
        'one 120-byte diagnostic malloc plus facade-owned scratch; not claimed as core/bridge allocation bytes',
});
try {
    const lockBytes = readFileSync(lockPath);
    expectedInputs = JSON.parse(lockBytes);
    report.inputLockSha256 = sha256(lockBytes);
    report.inputs = inspectInputs(runtime, source, dirname(fileURLToPath(import.meta.url)));
    validateInputs(expectedInputs, report.inputs);
    emit({ kind: 'input-identity', inputLockSha256: report.inputLockSha256, inputs: report.inputs });
    const manifest = JSON.parse(readFileSync(join(runtime, 'manifest.json')));
    const { default: factory } = await import(pathToFileURL(join(runtime, 'box3d-st.mjs')));
    const { createBox3DBinding } = await import(pathToFileURL(join(runtime, 'facade.mjs')));
    report.factoryCalls++;
    const module = await factory({ wasmBinary: readFileSync(join(runtime, 'box3d-st.wasm')) });
    report.moduleInstances++;
    probe = createNativeProbe(module);
    baseline = copy(probe.global());
    emit({ kind: 'initial-baseline', observation: baseline, diagnosticScratch: copy(probe.ownership) });
    assert.equal(baseline.bridge.liveBytes, '0');
    assert.equal(baseline.bridge.liveAllocations, 0);
    assert.equal(baseline.bridge.shapeHandles, 0);
    api = createBox3DBinding(module, manifest);
    report.identity = api.identity;
    assert.equal(report.identity.schemaSha256, expectedInputs.sources['tools/physics/box3d/abi-schema.json'].sha256);
    validateGlobal(copy(probe.global()), baseline, true);
    runNativeCycles({
        api,
        module,
        probe,
        baseline,
        emit,
        state,
        retainDebugSnapshot: (cycle, worldId, snapshot) => writeDebugSnapshot(out, cycle, worldId, snapshot),
    });
} catch (error) {
    fail(error, 'native-attempt');
} finally {
    let apiDisposeCompleted = false,
        observation;
    try {
        if (api) {
            api.dispose();
            apiDisposeCompleted = true;
        }
        if (probe) {
            observation = copy(probe.global());
            emit({ kind: 'post-dispose-observation', observation, apiDisposeCompleted });
            if (baseline) validateGlobal(observation, baseline, true);
        }
    } catch (error) {
        fail(error, 'api-disposal-or-baseline-closure');
    } finally {
        if (probe) {
            try {
                probe.free();
            } catch (error) {
                fail(error, 'diagnostic-scratch-free');
            }
        }
    }
    report.completedCycles = state.completedCycles;
    report.createdWorlds = state.createdWorlds;
    report.completedDebugSnapshots = state.completedDebugSnapshots ?? 0;
    report.createdBodies = state.createdBodies;
    report.lifecycleClosure = {
        status: apiDisposeCompleted && probe?.ownership.frees === 1 ? 'CLOSED' : 'NOT_CLOSED',
        apiDisposeCompleted,
        diagnosticScratch: probe ? copy(probe.ownership) : null,
    };
    emit({ kind: 'lifecycle-closed', observation: observation ?? null, closure: report.lifecycleClosure });
    if (report.status !== 'FAIL') {
        report.status = 'OBSERVED_NATIVE_SUBSET_PASS';
        try {
            report.observedSubset = validateObservedSubset(events, report, expectedInputs, (metadata) =>
                readDebugSnapshot(out, metadata),
            );
        } catch (error) {
            fail(error, 'strict-consumer');
        }
    }
    fsyncSync(fd);
    closeSync(fd);
    report.rawJournalSha256 = sha256(readFileSync(rawPath));
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(
        JSON.stringify({
            status: report.status,
            completedCycles: state.completedCycles,
            createdBodies: state.createdBodies,
            C20_LOWLEVEL: LIMITS.C20_LOWLEVEL,
            out,
        }),
    );
}
