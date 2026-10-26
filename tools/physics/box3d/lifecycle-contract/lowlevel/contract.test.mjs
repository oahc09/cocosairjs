// All reports in this file are SYNTHETIC CPU fixtures. They establish no native physics behavior.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
    VERSION,
    CYCLES,
    BODIES,
    ORDERS,
    BUDGET,
    LIMITS,
    stages,
    copy,
    validateObservedSubset,
    validatePhysicalClosure,
    validateInputs,
} from './contract.mjs';
import { createNativeProbe, runNativeCycles } from './native-cycles.mjs';
import { cpuFake } from './cpu-fake.mjs';
const expected = { syntheticCPUOnly: true, fixture: 'not-a-native-report' };
function synthetic() {
    const { api, module } = cpuFake(),
        probe = createNativeProbe(module),
        events = [],
        emit = (event) => events.push(copy({ sequence: events.length, ...event })),
        state = { knownWorlds: [], completedCycles: 0, createdBodies: 0, createdWorlds: 0 },
        baseline = probe.global();
    emit({
        kind: 'declaration',
        version: VERSION,
        cycles: CYCLES,
        bodiesPerCycle: BODIES,
        releaseOrders: Array.from({ length: CYCLES }, (_, i) => ORDERS[i % 3]),
        stageContracts: Object.fromEntries(ORDERS.map((order) => [order, stages(order)])),
        limits: LIMITS,
    });
    emit({ kind: 'input-identity', inputs: expected, inputLockSha256: 'synthetic-cpu-only' });
    emit({ kind: 'initial-baseline', observation: baseline });
    runNativeCycles({ api, module, probe, baseline, emit, state });
    api.dispose();
    const observation = probe.global();
    probe.free();
    const closure = { status: 'CLOSED', apiDisposeCompleted: true, diagnosticScratch: probe.ownership };
    emit({ kind: 'post-dispose-observation', observation, apiDisposeCompleted: true });
    emit({ kind: 'lifecycle-closed', observation, closure });
    return {
        events,
        report: {
            version: VERSION,
            status: 'OBSERVED_NATIVE_SUBSET_PASS',
            limits: LIMITS,
            inputs: expected,
            inputLockSha256: 'synthetic-cpu-only',
            executionKind: 'ACTUAL_ST_WASM_SINGLE_MODULE',
            moduleInstances: 1,
            factoryCalls: 1,
            completedCycles: state.completedCycles,
            createdBodies: state.createdBodies,
            createdWorlds: state.createdWorlds,
            lifecycleClosure: { status: 'CLOSED', apiDisposeCompleted: true, diagnosticScratch: probe.ownership },
        },
    };
}
const base = synthetic();
function check(data) {
    return validateObservedSubset(data.events, data.report, expected);
}
const populated = (d) => d.events.find((e) => e.kind === 'stage' && e.stage === 'joint-created');
const finished = (d) => d.events.find((e) => e.kind === 'stage' && e.stage === 'world-destroyed');
function negative(name, mutate) {
    test(`CPU negative: ${name}`, () => {
        const d = copy(base);
        mutate(d);
        assert.throws(() => check(d));
    });
}
test('CPU scheduling only: exact 100 x 50, actual fixture body, all 3 orders and strict consumer', () => {
    assert.equal(check(base).status, 'OBSERVED_NATIVE_SUBSET_PASS');
    assert.equal(base.report.completedCycles, 100);
    assert.equal(base.report.createdBodies, 5000);
    const begins = base.events.filter((e) => e.kind === 'cycle-begin');
    assert.deepEqual(
        ORDERS.map((o) => begins.filter((r) => r.order === o).length),
        [34, 33, 33],
    );
});
negative('missing round', (d) => {
    d.events = d.events.filter((e) => e.cycle !== 50);
});
negative('missing round even if row indices renumbered', (d) => {
    d.events = d.events.filter((e) => e.cycle !== 50);
    d.events.forEach((e, i) => (e.sequence = i));
});
negative('49 bodies cannot qualify', (d) => {
    populated(d).observation.nativeWorld.counts[0] = 49;
});
negative('zero actual native joint cannot qualify', (d) => {
    populated(d).observation.nativeWorld.counts[3] = 0;
});
negative('fake joint token with no native state cannot qualify', (d) => {
    populated(d).observation.fixedJointStatus = 1;
});
negative('core-byte growth', (d) => {
    finished(d).observation.coreBytes = '1';
});
negative('global bridge allocation growth', (d) => {
    finished(d).observation.bridge.liveAllocations = 1;
});
negative('fake empty JS-world-map global bridge zero', (d) => {
    finished(d).observation.bridge.origin = 'api.bridgeMemory()';
});
negative('scoped bridge result mislabeled global', (d) => {
    finished(d).observation.bridge.worldArgument = 1;
});
negative('fixture identity mutation', (d) => {
    d.report.inputs.fixture = 'changed';
});
negative('no api closure', (d) => {
    d.report.lifecycleClosure.apiDisposeCompleted = false;
});
negative('scratch leaked', (d) => {
    d.report.lifecycleClosure.diagnosticScratch.frees = 0;
});
negative('scratch double free', (d) => {
    d.report.lifecycleClosure.diagnosticScratch.frees = 2;
});
negative('second module hides accumulation', (d) => {
    d.report.moduleInstances = 100;
});
negative('baseline rebased after growth', (d) => {
    d.events.splice(5, 0, copy(d.events.find((e) => e.kind === 'initial-baseline')));
    d.events.forEach((e, i) => (e.sequence = i));
});
negative('mesh not cooked', (d) => {
    populated(d).observation.meshCounters.cooks = '0';
});
negative('mesh double destruction', (d) => {
    finished(d).observation.meshCounters.destroys = '2';
});
negative('mesh not borrowed', (d) => {
    populated(d).observation.mesh.shapeBorrows = 0;
});
negative('old world remains native-valid', (d) => {
    finished(d).observation.knownWorldValidity[0] = 1;
});
negative('old body remains native-valid', (d) => {
    finished(d).observation.bodyValidity[0] = 1;
});
negative('old shape remains native-valid', (d) => {
    finished(d).observation.shapeValidity[0] = 1;
});
negative('fewer scoped token rejections', (d) => {
    finished(d).disposedTokenRejections = 103;
});
negative('invented native post-destroy counts', (d) => {
    finished(d).observation.nativeWorld = { counts: [0, 0, 0, 0] };
});
negative('upgrade full C20 claim', (d) => {
    d.report.limits.C20_LOWLEVEL = 'PASS';
});
test('CPU physical-closure consumer rejects missing ECHILD, failed exit, signal, live group or limit breach', () => {
    const good = {
        status: 'PHYSICALLY_CLOSED',
        exitCode: 0,
        signal: null,
        waitpidECHILD: true,
        remainingProcessGroup: [],
        subreaper: true,
        waitpidScope: 'ALL_CHILDREN_-1',
        remainingDescendants: [],
        errors: [],
        rawWaitRows: [{ pid: 1, rawWaitStatus: 0, exitCode: 0 }],
        elapsedSeconds: 1,
        peakSampledDescendantRSSBytes: 100,
        retainedOutputBytes: 1000,
        closeBudgetSeconds: 4,
        closeSeconds: 0.01,
        budgetViolation: null,
        budget: BUDGET,
    };
    validatePhysicalClosure(good);
    for (const [key, value] of Object.entries({
        status: 'FAIL',
        exitCode: 1,
        signal: 15,
        waitpidECHILD: false,
        remainingProcessGroup: [{ pid: 42 }],
        budgetViolation: 'WALL_BUDGET',
    })) {
        const bad = copy(good);
        bad[key] = value;
        assert.throws(() => validatePhysicalClosure(bad));
    }
});
test('CPU input identities reject changed hashes and absent fixture hash', () => {
    assert.throws(() => validateInputs({ fixtures: { run: { sha256: 'a' } } }, { fixtures: { run: { sha256: 'b' } } }));
    assert.throws(() => validateInputs({ fixtures: { run: { sha256: 'a' } } }, { fixtures: {} }));
});
test('CPU source guards: no zero-argument facade bridge query and single actual factory call', () => {
    const native = readFileSync(new URL('native-cycles.mjs', import.meta.url), 'utf8');
    assert.match(native, /call\('_air_b3_bridge_memory', 0\)/);
    assert.doesNotMatch(native.replace(/\/\/[^\n]*/g, ''), /api\.bridgeMemory\(\s*\)/);
    const runner = readFileSync(new URL('run-native.mjs', import.meta.url), 'utf8');
    assert.equal((runner.match(/await factory\(/g) || []).length, 1);
    assert.match(runner, /flag: 'wx'/);
    assert.match(runner, /--authorized-fresh-native-c20/);
});

negative('omitted cross-world stale-token evidence', (d) => {
    d.events = d.events.filter((e) => e.kind !== 'stale-token-populated-world' || e.cycle !== 20);
    d.events.forEach((e, i) => (e.sequence = i));
});
negative('cross-world facade token unexpectedly accepted', (d) => {
    d.events.find((e) => e.kind === 'stale-token-populated-world').rejected = 103;
});
negative('initial baseline moved after creation', (d) => {
    const moved = d.events.splice(2, 1)[0];
    d.events.splice(5, 0, moved);
    d.events.forEach((e, i) => (e.sequence = i));
});
test('CPU failure injection: 49 actual fake bodies retains failing native-count row and partial probe', () => {
    const f = cpuFake(),
        original = f.api.createBody,
        tokens = [],
        events = [],
        probe = createNativeProbe(f.module),
        baseline = probe.global(),
        state = { knownWorlds: [], completedCycles: 0, createdBodies: 0, createdWorlds: 0 };
    f.api.createBody = (...args) => {
        if (tokens.length === 49) return tokens[0];
        const token = original(...args);
        tokens.push(token);
        return token;
    };
    assert.throws(() => runNativeCycles({ ...f, probe, baseline, emit: (e) => events.push(copy(e)), state }));
    assert.equal(events.find((e) => e.stage === 'bodies-created').observation.nativeWorld.counts[0], 49);
    assert.equal(events.at(-1).kind, 'partial-failure-probe');
    assert.equal(state.completedCycles, 0);
    f.api.dispose();
    probe.free();
});
test('CPU synthetic journal fits declared output budget without dropping per-round raw observations', () => {
    const bytes = Buffer.byteLength(base.events.map((event) => JSON.stringify(event) + '\n').join(''));
    assert.ok(bytes < BUDGET.outputBytes / 2, `synthetic journal ${bytes} bytes; reserve headroom for native values`);
    console.log(`CPU_ONLY_SYNTHETIC_JOURNAL_BYTES=${bytes}; no native execution`);
});

negative('post-dispose mesh double-destroy hidden after cycles', (d) => {
    d.events.at(-2).observation.meshCounters.destroys = '101';
    d.events.at(-1).observation.meshCounters.destroys = '101';
});
negative('post-dispose unexpected extra mesh cook', (d) => {
    d.events.at(-2).observation.meshCounters.cooks = '101';
    d.events.at(-1).observation.meshCounters.cooks = '101';
});
negative('summary created worlds differs from 100', (d) => {
    d.report.createdWorlds = 99;
});
test('CPU closure numeric limits and complete descendant proof are mandatory', () => {
    const good = {
        status: 'PHYSICALLY_CLOSED',
        exitCode: 0,
        signal: null,
        waitpidECHILD: true,
        remainingProcessGroup: [],
        subreaper: true,
        waitpidScope: 'ALL_CHILDREN_-1',
        remainingDescendants: [],
        errors: [],
        rawWaitRows: [{ pid: 1, rawWaitStatus: 0, exitCode: 0 }],
        elapsedSeconds: 1,
        peakSampledDescendantRSSBytes: 100,
        retainedOutputBytes: 1000,
        closeBudgetSeconds: 4,
        closeSeconds: 0.01,
        budgetViolation: null,
        budget: BUDGET,
    };
    validatePhysicalClosure(good);
    for (const [key, value] of Object.entries({
        elapsedSeconds: 121,
        peakSampledDescendantRSSBytes: 1073741825,
        retainedOutputBytes: 16777217,
        subreaper: false,
        waitpidScope: 'DIRECT_CHILD_ONLY',
        remainingDescendants: [{ pid: 42, pgid: 99 }],
        closeSeconds: 4.1,
        rawWaitRows: [],
    })) {
        const bad = copy(good);
        bad[key] = value;
        assert.throws(() => validatePhysicalClosure(bad));
    }
});
