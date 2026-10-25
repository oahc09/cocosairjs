/**
 * Bounded observation-only audit data. Never supplies inputs or decisions to OrderSession.
 * Checks restate existing business prerequisites and observed support booleans; they are not an
 * independent contact oracle, proof of physical authenticity, or a physics/BIZ PASS decision.
 */
import { containsXZ, receiptMatches, speed } from './stations.mjs';
const WINDOW_LIMIT = 45;
const REJECTION_LIMIT = 8;
const copy = (value) => structuredClone(value);
const freeze = (value) => {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
};
const finiteBounds = (bounds) =>
    Array.isArray(bounds?.min) &&
    Array.isArray(bounds?.max) &&
    bounds.min.length === 3 &&
    bounds.max.length === 3 &&
    [...bounds.min, ...bounds.max].every(Number.isFinite) &&
    bounds.min.every((value, axis) => value <= bounds.max[axis]);
const finiteSpeed = (vector) => vector && [vector.x, vector.y, vector.z].every(Number.isFinite);
const itemKey = (item) => `${item.itemId}:${item.itemGeneration}`;
export class RawPackingEvidence {
    constructor() {
        this.window = [];
        this.rejectedSubmissions = [];
        this.totalObserved = 0;
        this.rejectedSubmissionTotal = 0;
        this.segment = 0;
        this.lastResetReason = 'initial';
        this.identity = null;
    }
    reset(reason) {
        if (this.window.length) this.segment++;
        this.window = [];
        this.identity = null;
        this.lastResetReason = reason;
    }
    observe(nativeTick, sample, session) {
        const { config, generation, orderIndex, inventory, consumed } = session;
        const order = config.orders[orderIndex],
            j = config.judgement;
        const identity = JSON.stringify({
            roundGeneration: generation,
            configVersion: config.configVersion,
            orderIndex,
            order,
            items: sample.items
                .map(({ itemId, itemGeneration, skuId }) => [itemId, itemGeneration, skuId])
                .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        });
        const previous = this.window.at(-1);
        if (!Number.isSafeInteger(nativeTick) || !Number.isSafeInteger(session.tick))
            this.reset('invalid-tick-identity');
        else if (previous && (nativeTick !== previous.nativeTick + 1 || session.tick !== previous.activeTick + 1))
            this.reset('nonconsecutive-tick');
        else if (this.identity !== null && this.identity !== identity) this.reset('identity-change');
        this.identity = identity;
        const checks = {
            distinctCurrentInstances:
                sample.items.length === 2 &&
                new Set(sample.items.map((item) => item.itemId)).size === 2 &&
                sample.items.every(
                    (item) =>
                        inventory.has(item.itemId) &&
                        inventory.get(item.itemId).itemGeneration === item.itemGeneration &&
                        inventory.get(item.itemId)?.skuId === item.skuId &&
                        !consumed.has(itemKey(item)),
                ),
            formalReceipts:
                sample.items.length === 2 &&
                sample.items.every((item) => {
                    const receipt = sample.receipts instanceof Map ? sample.receipts.get(itemKey(item)) : null;
                    return (
                        receipt?.scope === 'formal' &&
                        Number.isFinite(item.motion?.mass) &&
                        Number.isFinite(receipt.measuredMass) &&
                        receiptMatches(receipt, item, config.configVersion, generation)
                    );
                }),
            fullShapeInside:
                sample.items.length === 2 &&
                finiteBounds(sample.zone) &&
                sample.items.every(
                    (item) =>
                        finiteBounds(item.bounds) &&
                        containsXZ(item.bounds, sample.zone, j.fullGeometryContainmentToleranceM) &&
                        item.bounds.min[1] >= sample.zone.min[1] - 0.005 &&
                        item.bounds.max[1] <= sample.zone.max[1] + 0.005,
                ),
            supportedDynamic:
                sample.items.length === 2 &&
                sample.items.every(
                    (item) =>
                        item.supportedByDoorChain === true &&
                        item.motion?.enabled === true &&
                        item.motion.type === 2 &&
                        item.motion.massPending === false,
                ),
            belowSpeedLimits:
                sample.items.length === 2 &&
                sample.items.every(
                    (item) =>
                        finiteSpeed(item.motion?.linearVelocity) &&
                        finiteSpeed(item.motion?.angularVelocity) &&
                        speed(item.motion.linearVelocity) <= j.linearSpeedMax &&
                        speed(item.motion.angularVelocity) <= j.angularSpeedMax,
                ),
            doorClosed:
                Number.isFinite(sample.doorAngle) &&
                Math.abs(sample.doorAngle) <= config.machine.packing.closedToleranceDegrees,
            nonHeld: sample.held === false && sample.items.every((item) => item.held === false),
        };
        const observedSkus = sample.items.map((item) => item.skuId).sort();
        const totalMass = sample.items.reduce((sum, item) => sum + (item.motion?.mass ?? NaN), 0);
        this.window.push(
            freeze(
                copy({
                    nativeTick,
                    activeTick: session.tick,
                    state: session.state,
                    stableTicks: session.stableTicks,
                    segment: this.segment,
                    context: {
                        roundGeneration: generation,
                        configVersion: config.configVersion,
                        orderIndex,
                        order,
                        thresholds: {
                            packingStableTicks: j.packingStableTicks,
                            linearSpeedMax: j.linearSpeedMax,
                            angularSpeedMax: j.angularSpeedMax,
                            fullGeometryContainmentToleranceM: j.fullGeometryContainmentToleranceM,
                            verticalContainmentToleranceM: 0.005,
                            closedToleranceDegrees: config.machine.packing.closedToleranceDegrees,
                            orderMassToleranceKg: j.orderMassToleranceKg,
                        },
                    },
                    observation: {
                        ...sample,
                        receipts: sample.receipts instanceof Map ? [...sample.receipts.entries()] : sample.receipts,
                    },
                    checks,
                    recipeMismatch: JSON.stringify(observedSkus) !== JSON.stringify([...order.skus].sort()),
                    orderMassMismatch:
                        !Number.isFinite(totalMass) || Math.abs(totalMass - order.massKg) > j.orderMassToleranceKg,
                }),
            ),
        );
        this.totalObserved++;
        if (this.window.length > WINDOW_LIMIT) this.window.shift();
    }
    reject(result, nativeTick, session) {
        this.rejectedSubmissionTotal++;
        this.rejectedSubmissions.push(
            freeze(
                copy({
                    sequence: this.rejectedSubmissionTotal,
                    nativeTick,
                    activeTick: session.tick,
                    result,
                    state: session.state,
                    paused: session.paused,
                    stableTicks: session.stableTicks,
                    invalidSubmits: session.invalidSubmits,
                    segment: this.segment,
                    lastResetReason: this.lastResetReason,
                    window: this.window,
                }),
            ),
        );
        if (this.rejectedSubmissions.length > REJECTION_LIMIT) this.rejectedSubmissions.shift();
    }
    report() {
        return freeze(
            copy({
                schemaVersion: 1,
                observationalOnly: true,
                receiptEncoding: 'map-entries',
                rejectionSource: 'OrderSession.submit',
                windowLimit: WINDOW_LIMIT,
                rejectionLimit: REJECTION_LIMIT,
                totalObserved: this.totalObserved,
                segment: this.segment,
                lastResetReason: this.lastResetReason,
                window: this.window,
                rejectedSubmissions: this.rejectedSubmissions,
                rejectedSubmissionTotal: this.rejectedSubmissionTotal,
                droppedRejectedSubmissions: this.rejectedSubmissionTotal - this.rejectedSubmissions.length,
            }),
        );
    }
}
