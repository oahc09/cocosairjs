/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
// Public initialization sequence only. No adapter registration, native handles or injected internals.
// Configure and attach the scene/clock first. This helper does not step physics or take over pacing.
export function createPublicBeforeStepRegistrar(sdk, system) {
    assert.equal(typeof sdk.registerBox3DBeforeStep, 'function');
    assert.equal(typeof system.syncSceneToPhysics, 'function');
    assert.equal(system.autoSimulation, true, 'Configure automatic public fixed ticks before producer setup');
    system.syncSceneToPhysics();
    system.enable = true;
    assert.equal(system.enable, true, 'Public producer owner must be enabled before registration');
    return function registerBeforeStep(callback) {
        assert.equal(system.enable, true, 'Cannot register a producer while the public system is paused');
        assert.equal(typeof callback, 'function');
        return sdk.registerBox3DBeforeStep(callback);
    };
}
