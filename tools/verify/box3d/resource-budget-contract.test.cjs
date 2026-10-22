const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'docs/physics/box3d/contracts', name)));
const resources = read('acceptance-resources.json');
const budget = read('performance-budget-initial.json');
const profile = (id) => budget.profiles.find((row) => row.id === id);
test('resource plan retains actual browser/device and first-time-user blockers', () => {
    assert.equal(resources.status, 'RESOURCE_PLAN_NOT_ACCEPTANCE');
    assert.equal(resources.fullInventoryStillUnfrozen, true);
    assert.equal(new Set(resources.resources.map((row) => row.id)).size, 7);
    assert.equal(resources.requiredEnvironmentIds.length, 6);
    for (const row of resources.resources) {
        assert.equal(row.required, true);
        assert(row.recoveryCondition.length > 20);
        if (row.id !== 'HOST-NODE') {
            assert.equal(row.status, 'BLOCKED');
            assert.equal(row.assignment, 'UNASSIGNED');
            assert.equal(row.availability, 'NOT_SCHEDULED');
            assert(row.reason.length > 30);
        }
    }
    assert.equal(resources.requiredParticipantResource, 'BIZ07-FIRST-TIME-USERS');
});
test('every initial budget resolves resources, remains unmeasured and has no fabricated baseline', () => {
    const ids = new Set(resources.resources.map((row) => row.id));
    assert.equal(budget.profiles.length, 9);
    assert.equal(new Set(budget.profiles.map((row) => row.id)).size, 9);
    for (const row of budget.profiles) {
        assert.equal(row.status, 'NOT_RUN');
        assert.equal(row.baselineArtifactStatus, 'NOT_ESTABLISHED');
        assert.equal(row.deviceFingerprintStatus, 'REQUIRED_BEFORE_FINAL_PERFORMANCE_FREEZE');
        for (const id of row.resources) assert(ids.has(id), `${row.id}: ${id}`);
    }
    assert.equal(profile('COLD-MT').capabilityMatrixStatus, 'NOT_FROZEN');
    assert(profile('COLD-MT').measurementApplicability.includes('unsupported targets still require'));
});
test('v1.2 absolute, regression, lifecycle and cold-start budgets are retained', () => {
    assert.deepEqual(budget.network, { downlinkMegabitsPerSecond: 20, roundTripMilliseconds: 100 });
    assert.equal(budget.statistics.regressionMaximumRatio, 1.1);
    assert.equal(budget.statistics.absoluteBudgetsAlsoRequired, true);
    assert.equal(budget.statistics.failedStartupAttemptsCountAsFailures, true);
    assert.equal(budget.statistics.physicsStallsOrCrashesCannotBeExcludedAsNoise, true);
    assert.equal(budget.statistics.nodeTightLoopIsNotBrowserPerformance, true);
    for (const [id, bodies, ms] of [
        ['DESKTOP-60', 1000, 6],
        ['MOBILE-60', 200, 5],
    ]) {
        assert.equal(profile(id).activeBodies, bodies);
        assert.equal(profile(id).physicsFrameP95Ms, ms);
        assert.equal(profile(id).frameWorkP95Ms, 14);
        assert.equal(profile(id).minimumVisibleFps, 55);
    }
    for (const [id, bytes, ms] of [
        ['COLD-ST', 2 * 1024 ** 2, 2000],
        ['COLD-MT', 3 * 1024 ** 2, 3000],
    ]) {
        assert.equal(profile(id).maxIncrementalTransferBytes, bytes);
        assert.equal(profile(id).independentEmptyCacheStarts, 30);
        assert.equal(profile(id).readyP95Ms ?? profile(id).readyIncludingPoolP95Ms, ms);
    }
    assert.deepEqual(profile('COLD-ST').postFetchInitP95Ms, { desktop: 250, mobile: 800 });
    assert.equal(profile('COLD-MT').unusedVariantRequests, 0);
    assert.equal(profile('MEMORY').lifecycleRounds, 100);
    assert.deepEqual(profile('MEMORY').maxWasmPeakBytes, { desktop: 128 * 1024 ** 2, mobile: 96 * 1024 ** 2 });
    assert.equal(profile('MEMORY').doesNotEquateCoreCountersToTotalHeap, true);
});
test('EX09 has separate complete-page and physics budgets and actual active-run windows', () => {
    for (const [id, ms] of [
        ['EX09-BIZ-DESKTOP', 3],
        ['EX09-BIZ-MOBILE', 4],
    ]) {
        assert.equal(profile(id).independentRounds, 5);
        assert.equal(profile(id).activeTicksPerRoundMinimum, 1800);
        assert.equal(profile(id).physicsFrameP95Ms, ms);
        assert.equal(profile(id).allOrdersCorrect, true);
    }
    assert.equal(profile('EX09-BIZ-MOBILE').continuousMinutes, 30);
    assert.equal(profile('EX09-BIZ-MOBILE').lastHotWindowMinutes, 10);
    assert.deepEqual(profile('EX09-BIZ-MOBILE').resources, ['ANDROID-WEBVIEW', 'IOS-SAFARI']);
    assert.equal(profile('EX09-WHOLE-PAGE-COLD').maxNecessaryPageTransferBytes, 5 * 1024 ** 2);
    assert.equal(profile('EX09-WHOLE-PAGE-COLD').playableP95Ms, 4000);
    assert.equal(profile('EX09-WHOLE-PAGE-COLD').alsoMustPass, 'COLD-ST');
    assert.equal(budget.noSilentAdjustmentAfterFailure, true);
});
