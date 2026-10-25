/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const assert = require('node:assert/strict');
const { assertScenario } = require('./cases/cohort-v4/trigger/assertions.mjs');
// Import independently reevaluates copied event/phase observations, never only the child's PASS label.
function classifyTrigger(receipt, raw, mode) {
    if (
        !raw ||
        raw.schema !== 'box3d-production-esm-public-trigger-consumer-v1' ||
        !raw.completedAt ||
        raw.mode !== mode
    )
        return 'INVALID_RESULT';
    if (raw.hostErrors?.length) return 'FAIL_INFRA';
    if (receipt.exitCode !== 0)
        return raw.checks?.some((row) => row.pass === false) ? 'FAIL_PRODUCT' : 'FAIL_UNCLASSIFIED';
    try {
        assert.equal(raw.status, 'PASS_LIMITED_PRODUCTION_ESM_TRIGGER');
        assert.equal(raw.inputsUnchanged, true);
        assert.equal(raw.scenarioAssertionsPassed, true);
        assert(raw.checks.length > 0 && raw.checks.every((row) => row.pass === true));
        assert(raw.totalSteps > 0 && raw.events.length > 0);
        assert.equal(raw.transport.length, 3);
        assert.equal(raw.moduleResolution.length, 1);
        assertScenario(raw);
        if (mode === 'callback-fault') {
            assert.equal(raw.intentionalFaultObserved, true);
            assert.equal(raw.close.status, 'failed');
            assert.equal(raw.close.failures.length, 1);
            assert.equal(raw.close.failures[0].label, 'game-clock-terminal');
            assert(raw.close.failures[0].message.includes('AIR_E_BOX3D_WORLD_FAULTED'));
        } else {
            assert.notEqual(raw.intentionalFaultObserved, true);
            assert.equal(raw.close.status, 'released');
            assert.equal(raw.close.failures.length, 0);
        }
        const preparation = raw.close.physicsPreparation;
        assert.equal(preparation.status, 'closed');
        assert.equal(preparation.cleanupErrors.length, 0);
        assert(preparation.acquired.length > 0);
        assert(
            preparation.acquired.every(
                (row) => row.backend === 'box3d' && row.cleanup === 'released' && row.retained.length === 0,
            ),
        );
        assert(raw.lifetimeAfterClose.length > 0);
        for (const value of raw.lifetimeAfterClose) assert.equal(value.after, value.before);
    } catch {
        return 'INVALID_RESULT';
    }
    return mode === 'callback-fault' ? 'EXPECTED_FAULT_OBSERVED' : 'PASS_LIMITED';
}
module.exports = { classifyTrigger };
