/*
 * Read-only M0 specification checks. No browser, world, business reducer or physics is executed.
 * Passing these checks does not establish T34, BIZ, gameplay or candidate-geometry viability.
 */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../../..');
const dir = path.join(root, 'docs/physics/box3d/contracts/gift-workshop');
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const protocol = read('input-protocol.json');
const fixtures = read('abnormal-fixtures.json');
const config = read('config.json');
const layouts = read('layouts.json').layouts;
const scenarios = read('scenarios.json');
const epsilon = 1e-9;
const byId = (id) => fixtures.fixtures.find((row) => row.id === id);
const command = (id) => protocol.commands.find((row) => row.id === id);
const close = (a, b) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const exactSet = (actual, expected) => assert.deepEqual([...actual].sort(), [...expected].sort());

// Validates the explicitly used schema subset for specification examples only.
// This is deliberately not a production input reducer, state machine or business test.
function validate(value, schema) {
    if ('const' in schema) assert.deepEqual(value, schema.const);
    if (schema.enum) assert.ok(schema.enum.includes(value), `not in enum: ${value}`);
    if (!schema.type) return;
    if (schema.type === 'object') {
        assert.ok(value && typeof value === 'object' && !Array.isArray(value));
        for (const key of schema.required || []) assert.ok(Object.hasOwn(value, key), `missing ${key}`);
        for (const [key, field] of Object.entries(value)) {
            if (schema.additionalProperties === false) assert.ok(Object.hasOwn(schema.properties, key), `extra ${key}`);
            if (schema.properties?.[key]) validate(field, schema.properties[key]);
        }
    } else if (schema.type === 'number' || schema.type === 'integer') {
        assert.equal(typeof value, 'number');
        assert.ok(Number.isFinite(value));
        if (schema.type === 'integer') assert.ok(Number.isSafeInteger(value));
        if ('minimum' in schema) assert.ok(value >= schema.minimum);
        if ('maximum' in schema) assert.ok(value <= schema.maximum);
    } else {
        assert.equal(typeof value, schema.type);
        if ('minLength' in schema) assert.ok(value.length >= schema.minLength);
    }
}
function validateExample(packet) {
    validate(packet, protocol.envelopeSchema);
    validate(packet.payload, command(packet.command).payloadSchema);
}
function bounds(item) {
    const sku = config.skus[item.skuId || item.itemId[0]];
    const angle = (item.yawDegrees * Math.PI) / 180;
    const center = item.position || item.bodyOrigin;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const x of [sku.localBounds.min[0], sku.localBounds.max[0]]) {
        for (const y of [sku.localBounds.min[1], sku.localBounds.max[1]]) {
            for (const z of [sku.localBounds.min[2], sku.localBounds.max[2]]) {
                const p = [x * Math.cos(angle) + z * Math.sin(angle), y, -x * Math.sin(angle) + z * Math.cos(angle)];
                for (let i = 0; i < 3; i++) {
                    min[i] = Math.min(min[i], p[i] + center[i]);
                    max[i] = Math.max(max[i], p[i] + center[i]);
                }
            }
        }
    }
    return { min, max };
}
function overlaps(a, b) {
    return a.min.every((v, i) => Math.min(a.max[i], b.max[i]) - Math.max(v, b.min[i]) > epsilon);
}
function verifySetup(setup) {
    assert.equal(setup.phase, 'BEFORE_SCENE_CREATION_ONLY');
    assert.equal(setup.runtimeMutationAllowed, false);
    assert.equal(typeof setup.effectiveConfigVersion, 'string');
    if (setup.itemPlacementOverrides.length || setup.staticBoxes.length || setup.parameterOverrides.length) {
        assert.notEqual(setup.effectiveConfigVersion, config.configVersion);
    }
    const layout = layouts.find((entry) => entry.id === setup.baseLayoutId);
    assert.ok(layout);
    const overrides = new Map(setup.itemPlacementOverrides.map((item) => [item.itemId, item]));
    assert.equal(overrides.size, setup.itemPlacementOverrides.length);
    for (const id of overrides.keys()) assert.ok(layout.items.some((item) => item.itemId === id));
    const items = layout.items.map((item) => ({ ...item, ...overrides.get(item.itemId) }));
    assert.equal(items.length, config.machine.limits.initialInventory);
    const itemBounds = items.map(bounds);
    for (const [index, item] of items.entries()) {
        assert.ok(item.position.every(Number.isFinite));
        assert.ok([0, 90, 180, 270].includes(item.yawDegrees));
        for (let j = index + 1; j < items.length; j++) {
            assert.equal(overlaps(itemBounds[index], itemBounds[j]), false, `${item.itemId}/${items[j].itemId}`);
        }
    }
    for (const box of setup.staticBoxes) {
        assert.equal(box.visible, true);
        assert.equal(box.bodyType, 'static');
        assert.equal(box.shape, 'box');
        assert.equal(box.center.length, 3);
        assert.equal(box.size.length, 3);
        assert.ok(box.center.every(Number.isFinite));
        assert.ok(box.size.every((n) => Number.isFinite(n) && n > 0));
        const boxBounds = {
            min: box.center.map((v, i) => v - box.size[i] / 2),
            max: box.center.map((v, i) => v + box.size[i] / 2),
        };
        for (let i = 0; i < items.length; i++) {
            assert.equal(overlaps(itemBounds[i], boxBounds), false, `${box.id}/${items[i].itemId}`);
        }
    }
    return items;
}

test('source hashes bind unchanged plan/config/layout/inventory/README, not historical gameplay claims', () => {
    const sources = [
        'ai/plans/box3d-v1.2-reference.md',
        ...['config.json', 'layouts.json', 'scenarios.json', 'README.md'].map(
            (name) => `docs/physics/box3d/contracts/gift-workshop/${name}`,
        ),
    ];
    exactSet(Object.keys(protocol.sourceHashes), sources);
    assert.deepEqual(fixtures.sourceHashes, protocol.sourceHashes);
    for (const [file, hash] of Object.entries(protocol.sourceHashes)) {
        assert.match(hash, /^[a-f0-9]{64}$/);
        assert.equal(
            createHash('sha256')
                .update(fs.readFileSync(path.join(root, file)))
                .digest('hex'),
            hash,
            file,
        );
    }
    const spec = fs.readFileSync(path.join(dir, 'FIXTURE-SPEC.md'), 'utf8');
    assert.ok(spec.includes(protocol.protocolVersion));
    assert.ok(spec.includes(fixtures.fixtureVersion));
    assert.ok(spec.includes('NOT_RUN'));
    for (const hash of Object.values(protocol.sourceHashes)) assert.ok(spec.includes(hash));
    assert.equal(protocol.schemaVersion, 1);
    assert.equal(fixtures.schemaVersion, 1);
    assert.equal(protocol.configVersion, config.configVersion);
    assert.equal(fixtures.configVersion, config.configVersion);
    assert.equal(fixtures.inputProtocolVersion, protocol.protocolVersion);
    assert.equal(protocol.status, 'SPECIFIED_NOT_RUN');
    assert.equal(fixtures.status, 'SPECIFIED_NOT_RUN');
});

test('public commands have closed envelopes/payloads and no pose, clock, receipt or completion backdoor', () => {
    const required = [
        'set-axes',
        'key-edge',
        'attach-release',
        'submit-order',
        'pause',
        'resume',
        'clear-input',
        'recover-dropped',
        'retry-order',
        'clear-channel',
        'start-round',
        'enter-tutorial',
        'replay-round',
        'reset-round',
        'exit-scene',
        'set-view',
        'set-muted',
    ];
    exactSet(
        protocol.commands.map((entry) => entry.id),
        required,
    );
    assert.equal(new Set(protocol.commands.map((entry) => entry.id)).size, required.length);
    assert.equal(protocol.envelopeSchema.additionalProperties, false);
    exactSet(protocol.envelopeSchema.required, Object.keys(protocol.envelopeSchema.properties));
    exactSet(protocol.envelopeSchema.properties.command.enum, required);
    for (const entry of protocol.commands) {
        assert.ok(['boundary', 'simulation'].includes(entry.lane));
        assert.ok(entry.allowedStates.length > 0);
        assert.ok(entry.allowedStates.every((state) => Object.hasOwn(scenarios.states, state)));
        assert.equal(entry.payloadSchema.additionalProperties, false);
        exactSet(entry.payloadSchema.required, Object.keys(entry.payloadSchema.properties));
        assert.ok(entry.effect.length > 40);
        for (const field of protocol.forbiddenInputFields) {
            assert.ok(!Object.hasOwn(entry.payloadSchema.properties, field));
        }
    }
    assert.ok(protocol.forbiddenCommands.every((id) => !required.includes(id)));
    assert.equal(protocol.admission.rejectUnknownFields, true);
    assert.equal(protocol.admission.sameQueueForHumanAndRunner, config.input.sharedCommandQueue);
    assert.equal(protocol.admission.noTargetItemArgument, true);
    assert.equal(protocol.recoveryOnlyPhysicsWrites.ordinaryInputMayTeleport, false);
});

test('example packets are syntax-only; malformed and dangerous packet designs are rejected by this static validator', () => {
    assert.equal(protocol.designExamples.status, 'NOT_RUN');
    assert.equal(protocol.designExamples.notExecutedTrace, true);
    for (const packet of protocol.designExamples.packets) validateExample(packet);
    const base = protocol.designExamples.packets[0];
    for (const value of [NaN, Infinity, -Infinity, -1.01, 1.01]) {
        assert.throws(() => validateExample({ ...base, payload: { ...base.payload, x: value } }));
    }
    for (const seq of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => validateExample({ ...base, seq }));
    }
    assert.throws(() => validateExample({ ...base, protocolVersion: 'wrong' }));
    assert.throws(() => validateExample({ ...base, command: 'complete-order' }));
    assert.throws(() => validateExample({ ...base, position: [0, 0, 0] }));
    assert.throws(() => validateExample({ ...base, payload: { ...base.payload, position: [0, 0, 0] } }));
    assert.throws(() => validateExample({ ...base, command: 'submit-order', payload: { delivered: true } }));
    assert.throws(() => validateExample({ ...base, command: 'key-edge', payload: { code: 'ArrowUp', down: true } }));
});

test('clock, axis limits and stability references preserve existing numeric design', () => {
    const judge = config.judgement;
    assert.equal(protocol.clock.fixedHz, judge.fixedHz);
    assert.equal(protocol.clock.solverSubSteps, judge.solverSubSteps);
    assert.equal(protocol.clock.roundTicks, judge.roundTicks);
    assert.equal(protocol.clock.firstTick, 1);
    assert.equal(protocol.clock.consumeAt, config.input.consumeAt);
    assert.equal(protocol.axes.maxHorizontalMps, config.machine.magnet.horizontalSpeedMax);
    assert.equal(protocol.axes.maxVerticalMps, config.machine.magnet.verticalSpeedMax);
    assert.equal(protocol.axes.maxAccelerationMps2, config.machine.magnet.accelerationMax);
    assert.equal(protocol.axes.rotationInput, false);
    assert.deepEqual(protocol.axes.range, [-1, 1]);
    assert.deepEqual(protocol.axes.keyboard, {
        x: { negative: 'KeyA', positive: 'KeyD' },
        y: { negative: 'KeyQ', positive: 'KeyE' },
        z: { negative: 'KeyW', positive: 'KeyS' },
    });
    for (const axis of ['x', 'y', 'z']) {
        const field = command('set-axes').payloadSchema.properties[axis];
        assert.equal(field.minimum, -1);
        assert.equal(field.maximum, 1);
    }
    assert.equal(fixtures.commonBudgets.shippingTimeoutTicks, judge.shippingTimeoutTicks);
    assert.equal(fixtures.commonBudgets.recoveryPenaltyTicks, judge.recoveryPenaltyTicks);
    assert.equal(fixtures.commonBudgets.normalRoundTicks, judge.roundTicks);
});

test('pause/resume and clearing use a non-stepping boundary with fresh input epochs', () => {
    for (const id of [
        'pause',
        'resume',
        'clear-input',
        'recover-dropped',
        'retry-order',
        'replay-round',
        'exit-scene',
    ]) {
        assert.equal(command(id).lane, 'boundary');
    }
    for (const key of [
        'clearKeys',
        'clearAxes',
        'clearPendingTargets',
        'discardQueuedSimulationCommands',
        'advanceInputGeneration',
        'preserveHeldJointOnOrdinaryPause',
        'resumeRequiresFreshInput',
    ])
        assert.equal(protocol.inputClear[key], true);
    for (const trigger of config.input.clearIntentOn) assert.ok(protocol.inputClear.triggers.includes(trigger));
    assert.match(protocol.clock.pauseBoundary, /does not step physics/);
    assert.match(protocol.clock.pauseBoundary, /Simulation lane is rejected while paused/);
    assert.match(protocol.identity.seqScope, /Strictly increasing/);
    assert.match(protocol.identity.seqScope, /without side effects/);
    assert.match(protocol.identity.inputGeneration, /Buffered packets from earlier epochs are rejected/);
    assert.match(protocol.identity.itemGeneration, /native body is reused/);
});

test('five normal recipes bind exactly to the five layouts without requiring successful traces for M0', () => {
    assert.equal(protocol.normalRecipes.length, 5);
    for (const layout of layouts) {
        const recipe = protocol.normalRecipes.find((row) => row.layoutId === layout.id);
        assert.ok(recipe);
        assert.equal(recipe.recipeId, layout.inputRecipeId);
        assert.equal(recipe.kind, 'OBSERVATION_DRIVEN_DESIGN');
        assert.equal(recipe.status, 'NOT_RUN');
        assert.match(recipe.exactTrace, /absence does not block freezing/);
        assert.match(recipe.steps.join(' '), /9600/);
    }
    assert.equal(config.judgement.roundTicks - config.judgement.normalPathReserveTicks, 9600);
});

test('all fifteen LIFE-A rows are one-to-one, bounded, traceable and genuinely unexecuted', () => {
    const source = scenarios.lifecyclePlan.abnormalRounds;
    assert.equal(fixtures.fixtures.length, 15);
    exactSet(
        fixtures.fixtures.map((row) => row.id),
        source.map((row) => row.id),
    );
    for (const row of fixtures.fixtures) {
        assert.equal(row.fixture, source.find((entry) => entry.id === row.id).fixture);
        assert.equal(row.status, 'NOT_RUN');
        assert.equal(row.profileId, `${fixtures.fixtureVersion}/${row.id}`);
        assert.equal(row.designStatus, 'STATIC_CANDIDATE_REQUIRES_T34');
        assert.equal(row.inputProtocolVersion, protocol.protocolVersion);
        assert.ok(row.sourceSections.includes('12.8'));
        assert.ok(row.publicTrigger.preconditions.length > 0);
        assert.ok(row.publicTrigger.commands.every((id) => command(id)));
        assert.ok(row.waits.length > 0);
        for (const wait of row.waits) {
            assert.ok(Number.isSafeInteger(wait.maxActiveTicks) && wait.maxActiveTicks > 0);
            assert.ok(wait.maxActiveTicks <= row.budgets.maxActiveTicks);
            assert.equal(wait.onExpiry, 'FAIL_OR_NOT_REPRODUCED_AND_PRESERVE_RAW');
        }
        assert.ok(row.assertions.length >= 3);
        assert.equal(row.terminal.setupTicksCountAsRound, false);
        assert.ok(row.budgets.maxWallMs > 0);
        assert.equal(row.budgets.recoveryMaxWallMs, fixtures.commonBudgets.recoveryMaxWallMs);
        assert.equal(row.budgets.teardownMaxWallMs, fixtures.commonBudgets.teardownMaxWallMs);
    }
});

test('candidate setup preserves twelve logical items, finite visible boxes and no initial AABB interpenetration', () => {
    for (const row of fixtures.fixtures) {
        verifySetup(row.setup);
        for (const variant of row.variants || []) {
            if (variant.setup) verifySetup(variant.setup);
        }
    }
    assert.equal(fixtures.setupPolicy.sceneSetupIsNotInputTrace, true);
    assert.equal(fixtures.setupPolicy.neverPreseedReceiptsOrLedger, true);
    assert.equal(fixtures.setupPolicy.noRuntimePoseOrClockWrites, true);
    assert.equal(fixtures.setupPolicy.allCandidateGeometryNeedsRealPhysicsValidation, true);
});

test('half-order candidate has a right shelf below the open door endpoint and a separate left retry lane', () => {
    const row = byId('LIFE-A02');
    const shelf = row.setup.staticBoxes[0];
    close(shelf.center[1] + shelf.size[1] / 2, row.criticalBoundary.blockerTopY);
    const packing = config.machine.packing;
    const doorBottom =
        packing.bottomY -
        packing.innerSize[2] * Math.sin((packing.openDegrees * Math.PI) / 180) -
        packing.doorThickness / 2;
    assert.ok(row.criticalBoundary.blockerTopY < doorBottom);
    assert.ok(row.criticalBoundary.blockerTopY > config.machine.receiver.planeY);
    assert.equal(row.criticalBoundary.firstFullyCrossedCount, 1);
    assert.equal(row.criticalBoundary.requiredCommitCount, config.judgement.atomicDeliveryCount);
    assert.equal(row.criticalBoundary.bothOriginalRefsRecovered, true);
    const shelfLeft = shelf.center[0] - shelf.size[0] / 2;
    for (const target of row.retryPlacementTargets) assert.ok(bounds(target).max[0] < shelfLeft);
    assert.match(row.assertions.join(' '), /zero inventory consumption/);
    assert.match(row.assertions.join(' '), /300 ticks once/);
});

test('wrong-SKU equal-mass variant is a separate pre-scene theme with consistently recomputed totals', () => {
    const variant = byId('LIFE-A05').variants.find((entry) => entry.id === 'equal-mass-derived-theme');
    assert.notEqual(variant.configVersion, config.configVersion);
    assert.equal(variant.phase, 'BEFORE_SCENE_CREATION_ONLY');
    assert.equal(variant.normalProfileEvidence, false);
    const mass = (id) => variant.skuMassOverrides[id] ?? config.skus[id].massKg;
    for (const id of Object.keys(config.skus)) {
        assert.ok(mass(id) >= config.machine.limits.itemMassRange[0]);
        assert.ok(mass(id) <= config.machine.limits.itemMassRange[1]);
    }
    for (const order of config.orders) {
        close(
            order.skus.reduce((total, id) => total + mass(id), 0),
            variant.derivedOrderMassKg[order.id],
        );
    }
    close(
        variant.pair.reduce((total, id) => total + mass(id[0]), 0),
        variant.derivedOrderMassKg.O1,
    );
    assert.notDeepEqual(variant.pair.map((id) => id[0]).sort(), [...config.orders[0].skus].sort());
});

test('partial-outside and stacked/hanging scale designs test full geometry and support, not centers alone', () => {
    const outside = byId('LIFE-A08');
    const target = outside.publicPlacementTargets.find((item) => item.itemId === 'A1');
    const b = bounds(target);
    const edge = config.machine.packing.centerXZ[0] + config.machine.packing.innerSize[0] / 2;
    close(edge, outside.criticalBoundary.insideMax);
    close(b.max[0], outside.criticalBoundary.targetFullMax);
    assert.ok(target.bodyOrigin[0] < edge);
    assert.ok(b.max[0] - edge > config.judgement.fullGeometryContainmentToleranceM);
    const hanging = byId('LIFE-A09');
    close(bounds(hanging.publicPlacementTargets[0]).min[1] - config.machine.scale.center[1], 0.02);
    assert.ok(hanging.criticalBoundary.minimumNegativeWindowTicks >= config.judgement.scaleStableTicks);
    const stack = byId('LIFE-A10').setup.itemPlacementOverrides;
    close(bounds(stack[0]).max[1], bounds(stack[1]).min[1]);
    close(bounds(stack[0]).min[1], config.machine.scale.center[1]);
    assert.match(byId('LIFE-A10').assertions.join(' '), /actual contact graph/);
});

test('early-plane and duplicate-generation designs cannot use test probes to award success', () => {
    const early = byId('LIFE-A11');
    assert.equal(
        early.criticalBoundary.measuredAngleUpperExclusiveDegrees,
        config.machine.packing.qualifiedOpenDegrees,
    );
    assert.equal(early.criticalBoundary.retainFirstCrossing, true);
    assert.equal(early.criticalBoundary.timeoutTicksUnchanged, config.judgement.shippingTimeoutTicks);
    const motor = early.setup.parameterOverrides[0];
    assert.equal(motor.baseValue, config.machine.packing.motorDegreesPerSecond);
    assert.ok(motor.value > 0 && motor.value < motor.baseValue);
    assert.notEqual(motor.configVersion, config.configVersion);
    assert.ok((65 / motor.value) * config.judgement.fixedHz < config.judgement.shippingTimeoutTicks);
    for (const id of ['LIFE-A03', 'LIFE-A12']) {
        const probe = byId(id).observationProbe;
        assert.equal(probe.kind, 'REDELIVER_CAPTURED_REAL_OBSERVATION');
        assert.equal(probe.businessSuccessEvidence, false);
        assert.match(probe.capture, /real/i);
    }
    const duplicate = byId('LIFE-A12');
    assert.deepEqual(duplicate.criticalBoundary.dedupeKey, config.judgement.deliveryDedupeKey);
    assert.equal(duplicate.criticalBoundary.alsoRequireRoundGeneration, true);
    assert.equal(duplicate.observationProbe.mutationAllowed, false);
    assert.equal(duplicate.observationProbe.fabricatedEventsAllowed, false);
    assert.equal(duplicate.variants[0].normalProfileEvidence, false);
    assert.match(duplicate.variants[0].requiredObservation, /during this SHIPPING attempt/);
});

test('cutoff cases freeze delivery-before-timeout, inclusive shipping budget and insufficient recovery time', () => {
    const deadline = byId('LIFE-A13');
    assert.equal(deadline.criticalBoundary.roundTicks, config.judgement.roundTicks);
    assert.equal(deadline.criticalBoundary.shippingTimeoutTicks, config.judgement.shippingTimeoutTicks);
    assert.equal(deadline.criticalBoundary.shippingSubmitStepCountsAsOne, true);
    assert.equal(deadline.criticalBoundary.finalOrderPriority, 'DELIVERY_THEN_GLOBAL_TIMEOUT');
    assert.equal(deadline.boundaryVariants.length, 4);
    assert.equal(deadline.calibration.freezeDependsOnSuccessfulTrace, false);
    assert.equal(deadline.calibration.clockInjectionAllowed, false);
    assert.equal(deadline.calibration.eachTrialMustReachOwnTerminal, true);
    assert.match(protocol.clock.shippingElapsedRule, /submitTick \+ 299/);
    const phases = protocol.clock.phaseOrder;
    assert.ok(
        phases.findIndex((p) => p.includes('atomically commit')) < phases.findIndex((p) => p.includes('mark BLOCKED')),
    );
    assert.ok(
        phases.findIndex((p) => p.includes('atomically commit')) <
            phases.findIndex((p) => p.includes('lock RESULT timeout')),
    );
    const recovery = byId('LIFE-A14').criticalBoundary;
    assert.ok(recovery.remainingBeforeRecoveryTicks < config.judgement.recoveryPenaltyTicks);
    assert.equal(recovery.recoveryPenaltyTicks, config.judgement.recoveryPenaltyTicks);
    assert.equal(recovery.testSetupMaySetClock, false);
    assert.equal(recovery.requiredOutcome, 'RESULT_TIMEOUT');
});

test('closing-obstruction candidate is an existing unshipped item, inside channel and beyond nominal door sweep radius', () => {
    const row = byId('LIFE-A15');
    assert.equal(row.criticalBoundary.spareItem, 'B4');
    assert.equal(row.criticalBoundary.preserveCommittedLedger, true);
    const b = bounds(row.setup.itemPlacementOverrides[0]);
    const channel = fixtures.supplementalGeometryDesign.channelClearanceBounds;
    for (let axis = 0; axis < 3; axis++) {
        assert.ok(b.min[axis] >= channel.min[axis] - epsilon);
        assert.ok(b.max[axis] <= channel.max[axis] + epsilon);
    }
    close(b.min[1], row.criticalBoundary.spareBottomY);
    close(b.max[1], row.criticalBoundary.spareTopY);
    const packing = config.machine.packing;
    const nearestRadius = Math.hypot(packing.bottomY - b.max[1], b.min[2] - packing.doorPivot[2]);
    const doorRadius = Math.hypot(packing.innerSize[2], packing.doorThickness / 2);
    assert.ok(nearestRadius > doorRadius);
    assert.equal(command('clear-channel').allowedStates[0], 'CLOSING');
    assert.match(row.assertions.join(' '), /cannot be regenerated/);
    // Static radial exclusion is not a real Hinge sweep/contact or channel-clearance proof.
});

test('new sensor/speed design is explicit, and no static success can change required BIZ/resource evidence', () => {
    const supplemental = fixtures.supplementalGeometryDesign;
    assert.equal(supplemental.status, 'STATIC_CANDIDATE_REQUIRES_T34');
    assert.equal(supplemental.receiverCandidateSlab.sensorOnly, true);
    assert.equal(supplemental.receiverCandidateSlab.center[1], config.machine.receiver.planeY);
    assert.equal(supplemental.receiverCandidateSlab.fullCrossingUsesPlaneY, config.machine.receiver.planeY);
    assert.ok(supplemental.receiverCandidateSlab.size.every((v) => Number.isFinite(v) && v > 0));
    assert.ok(supplemental.supportedObservedItemSpeedMaxMps > 0);
    assert.match(supplemental.speedBoundMeaning, /not a velocity clamp or measured guarantee/);
    assert.equal(fixtures.executionPolicy.allBehaviorStatus, 'NOT_RUN');
    assert.equal(fixtures.executionPolicy.terminalRequired, true);
    assert.deepEqual(fixtures.executionPolicy.resourceFields, scenarios.lifecyclePlan.mustRecordBeforeAfterResources);
    for (const field of scenarios.everyResultIdentity)
        assert.ok(fixtures.executionPolicy.identityFields.includes(field));
    assert.equal(scenarios.lifecyclePlan.requiredTotal, 20);
    assert.equal(scenarios.lifecyclePlan.notReplacementForI05HundredCycles, true);
    assert.ok(scenarios.requiredBIZ.every((row) => row.required && row.status !== 'PASS'));
});
