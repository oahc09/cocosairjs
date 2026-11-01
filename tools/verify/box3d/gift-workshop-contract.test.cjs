/* Static contract geometry only. No simulated shipment, gameplay, device or human evidence. */
const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../../../docs/physics/box3d/contracts/gift-workshop/config.json');
const layoutFile = require('../../../docs/physics/box3d/contracts/gift-workshop/layouts.json');
const scenarios = require('../../../docs/physics/box3d/contracts/gift-workshop/scenarios.json');
const epsilon = 1e-10;
function rotate(point, degrees) {
    const a = (degrees * Math.PI) / 180;
    return [
        Math.cos(a) * point[0] + Math.sin(a) * point[2],
        point[1],
        -Math.sin(a) * point[0] + Math.cos(a) * point[2],
    ];
}
function worldBounds(item) {
    const { min, max } = config.skus[item.skuId].localBounds;
    const lower = [Infinity, Infinity, Infinity];
    const upper = [-Infinity, -Infinity, -Infinity];
    for (const x of [min[0], max[0]])
        for (const y of [min[1], max[1]])
            for (const z of [min[2], max[2]]) {
                const v = rotate([x, y, z], item.yawDegrees).map((c, i) => c + item.position[i]);
                for (let i = 0; i < 3; i++) {
                    lower[i] = Math.min(lower[i], v[i]);
                    upper[i] = Math.max(upper[i], v[i]);
                }
            }
    return { lower, upper };
}
test('new configuration preserves three orders, twelve unique stock items and physical mass limits', () => {
    assert.equal(config.notRecoveredProduction125, true);
    assert.equal(config.status, 'M0_DESIGN_NOT_PHYSICS_VALIDATED');
    assert.equal(config.orders.length, 3);
    assert.equal(
        Object.values(config.skus).reduce((n, s) => n + s.inventory, 0),
        12,
    );
    const requested = { A: 0, B: 0, C: 0 };
    for (const order of config.orders) {
        assert.equal(order.skus.length, 2);
        const mass = order.skus.reduce((n, id) => {
            requested[id]++;
            return n + config.skus[id].massKg;
        }, 0);
        assert.ok(Math.abs(mass - order.massKg) < epsilon);
    }
    for (const [id, sku] of Object.entries(config.skus)) {
        assert.ok(sku.inventory >= requested[id]);
        assert.ok(sku.massKg >= 0.2 && sku.massKg <= 0.8);
        assert.ok(sku.shapes.length <= 3);
        for (let axis = 0; axis < 3; axis++)
            assert.ok(sku.localBounds.max[axis] - sku.localBounds.min[axis] <= 0.45 + epsilon);
        for (const shape of sku.shapes) assert.ok(['box', 'capsule'].includes(shape.type));
    }
});
test('five distinct new initial layouts are non-overlapping on the declared table', () => {
    assert.equal(layoutFile.layouts.length, 5);
    assert.equal(new Set(layoutFile.layouts.map((l) => l.seed)).size, 5);
    const bounds = config.machine.tableBoundsXZ;
    for (const layout of layoutFile.layouts) {
        assert.equal(layout.items.length, 12);
        assert.equal(new Set(layout.items.map((i) => i.itemId)).size, 12);
        const boxes = layout.items.map(worldBounds);
        for (const b of boxes) {
            assert.ok(Math.abs(b.lower[1] - config.machine.tableTopY) < epsilon);
            assert.ok(b.lower[0] >= bounds[0] && b.upper[0] <= bounds[1]);
            assert.ok(b.lower[2] >= bounds[2] && b.upper[2] <= bounds[3]);
        }
        for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i],
                    b = boxes[j];
                assert.ok(
                    a.upper[0] + 0.02 <= b.lower[0] ||
                        b.upper[0] + 0.02 <= a.lower[0] ||
                        a.upper[2] + 0.02 <= b.lower[2] ||
                        b.upper[2] + 0.02 <= a.lower[2],
                    `${layout.id}: overlap ${i},${j}`,
                );
            }
    }
});
test('all initial attachment points and declared cruise waypoints are within magnet travel bounds', () => {
    const machine = config.machine;
    for (const layout of layoutFile.layouts)
        for (const item of layout.items) {
            const lug = rotate(config.skus[item.skuId].attachmentPoint, item.yawDegrees).map(
                (x, i) => x + item.position[i],
            );
            for (let i = 0; i < 3; i++)
                assert.ok(lug[i] >= machine.magnet.positionMin[i] && lug[i] <= machine.magnet.positionMax[i]);
            assert.ok(lug[1] < machine.magnet.safeCruiseY);
        }
    assert.ok(machine.magnet.safeCruiseY > machine.packing.bottomY + machine.packing.innerSize[1] + 0.45);
    assert.ok(machine.magnet.safeCruiseY <= machine.magnet.positionMax[1]);
});
test('receiver geometry leaves a conservative full-item clearance and declared door endpoint above plane', () => {
    const m = config.machine;
    const maximumAnyOrientationHeight = Math.max(
        ...Object.values(config.skus).map((s) =>
            Math.hypot(...s.localBounds.max.map((v, i) => v - s.localBounds.min[i])),
        ),
    );
    assert.ok(m.receiver.planeY - m.receiver.floorTopY >= maximumAnyOrientationHeight + 0.1);
    assert.ok(m.receiver.chuteInnerSizeXZ.every((v) => v > maximumAnyOrientationHeight + 0.02));
    const doorLowerEndpoint =
        m.packing.bottomY -
        m.packing.innerSize[2] * Math.sin((m.packing.openDegrees * Math.PI) / 180) -
        m.packing.doorThickness / 2;
    assert.ok(doorLowerEndpoint > m.receiver.planeY);
    assert.equal(m.packing.tableOpeningRequired, true);
    // This endpoint check is not a dynamic proof of door/wall swept clearance or item shipping.
});
test('transaction, recovery and terminal precedence cannot silently award a partial shipment', () => {
    assert.equal(config.judgement.atomicDeliveryCount, 2);
    assert.equal(config.judgement.shippingTimeoutTicks, 300);
    assert.equal(config.judgement.recoveryPenaltyTicks, 300);
    assert.equal(config.judgement.generationOnEveryRecovery, true);
    assert.equal(scenarios.shipping.pendingDeliveryDoesNotConsumeInventory, true);
    assert.equal(scenarios.shipping.keepEarlyFullCrossingEvidence, true);
    assert.equal(scenarios.shipping.recoverOriginalItemsNeverSpawnExtras, true);
    assert.match(config.judgement.deadlineOrder[0], /real shipment/);
    assert.match(config.judgement.deadlineOrder[2], /timeout/);
});
test('20 lifecycle rows remain five whole normal rounds and fifteen declared abnormal cases, all unrun', () => {
    assert.equal(scenarios.lifecyclePlan.normalRounds.length, 5);
    assert.equal(scenarios.lifecyclePlan.abnormalRounds.length, 15);
    assert.equal(scenarios.lifecyclePlan.requiredTotal, 20);
    assert.ok(scenarios.lifecyclePlan.abnormalRounds.every((r) => r.status === 'NOT_RUN'));
    assert.equal(scenarios.lifecyclePlan.notReplacementForI05HundredCycles, true);
    assert.equal(scenarios.requiredBIZ.length, 8);
    assert.ok(scenarios.requiredBIZ.every((r) => r.required && r.status !== 'PASS'));
    assert.equal(scenarios.external.BIZ07.agentSubstitution, false);
});
test('ordinary input and performance design cannot count teleport, menus or hidden bodies as proof', () => {
    assert.equal(config.input.normalRunSetTransforms, false);
    assert.equal(config.machine.magnet.commodityTransformWritesAllowed, false);
    assert.equal(config.input.sharedCommandQueue, true);
    assert.equal(config.performanceDraft.keepWholeRoundRaw, true);
    assert.equal(config.performanceDraft.doNotDropJamsOrRetries, true);
    assert.ok(layoutFile.layouts.every((l) => l.scriptStatus.includes('NOT_YET_RECORDED')));
});
