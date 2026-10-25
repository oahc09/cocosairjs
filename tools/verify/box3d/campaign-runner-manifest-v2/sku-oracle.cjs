/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const assert = require('node:assert/strict');
const { assertScenario } = require('./cases/cohort-v6/sku/assertions.mjs');
const config = require('./cases/cohort-v6/sku/frozen/config.json');
function classifySku(receipt, raw, mode, fixtureVersion = 6) {
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
        assert.equal(raw.status, 'PASS_LIMITED_EX09_SKU_TRIGGER');
        assert.equal(raw.inputsUnchanged, true);
        assert.equal(raw.scenarioAssertionsPassed, true);
        assert(raw.checks.length > 0 && raw.checks.every((row) => row.pass === true));
        assert(raw.totalSteps > 0 && raw.events.length > 0);
        assert.equal(raw.transport.length, 3);
        assert.equal(raw.moduleResolution.length, 1);
        assert.deepEqual(raw.configuration.sku, config.skus[mode]);
        assert.deepEqual(raw.configuration.sensorSize, [1, 0.04, 0.85]);
        assert.deepEqual(raw.configuration.gravity, [0, 0, 0]);
        assert.deepEqual(raw.configuration.initialLinearVelocity, [0, fixtureVersion >= 6 ? -0.3 : -0.12, 0]);
        assert.equal(raw.configuration.linearDamping, 0.03);
        assert.equal(raw.configuration.angularDamping, 0.05);
        if (fixtureVersion >= 6)
            assert(
                Number.isFinite(raw.observedSleepThreshold) &&
                    raw.observedSleepThreshold < 0.3 &&
                    0.3 <= config.machine.magnet.verticalSpeedMax,
            );
        assertScenario(raw);
        assert.equal(raw.close.status, 'released');
        assert.equal(raw.close.failures.length, 0);
        const p = raw.close.physicsPreparation;
        assert.equal(p.status, 'closed');
        assert.equal(p.cleanupErrors.length, 0);
        assert(
            p.acquired.length > 0 && p.acquired.every((row) => row.cleanup === 'released' && row.retained.length === 0),
        );
        assert(raw.lifetimeAfterClose.length > 0);
        for (const row of raw.lifetimeAfterClose) assert.equal(row.after, row.before);
    } catch {
        return 'INVALID_RESULT';
    }
    return 'PASS_LIMITED';
}
module.exports = { classifySku };
