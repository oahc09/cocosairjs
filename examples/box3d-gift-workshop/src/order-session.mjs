/**
 * Engine-independent formal session reducer, NOT wired to the diagnostic page.
 * Future integration must feed each real completed fixed-tick observation exactly once.
 * No completion/set-time/set-score public input exists. Unit observations are not physics evidence.
 */
import { containsXZ, intersects, packingReason } from './stations.mjs';
import { submissionChuteReason } from './submission-chute-preflight.mjs';
const keyOf = (item) => `${item.itemId}:${item.itemGeneration}`;
const immutable = (value) => {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) immutable(child);
        Object.freeze(value);
    }
    return value;
};
export class OrderSession {
    #repackGrant = null;
    #repackSequence = 0;
    constructor(config, generation, inventory) {
        this.config = config;
        this.generation = generation;
        this.state = 'READY';
        this.paused = false;
        this.tick = 0;
        this.remainingTicks = config.judgement.roundTicks;
        this.stableTicks = 0;
        this.orderIndex = 0;
        this.attemptId = 0;
        this.invalidSubmits = 0;
        this.recoveries = 0;
        this.ledger = [];
        this.consumed = new Set();
        this.pending = new Set();
        this.previous = new Map();
        this.inventory = new Map(inventory.map((i) => [i.itemId, { ...i }]));
        this.snapshot = null;
        this.reason = null;
        this.won = false;
        this.openSeen = false;
        this.recoveryPlan = null;
    }
    start(readiness) {
        if (this.state !== 'READY') throw new Error('start requires READY');
        const required = ['transport', 'scaleContacts', 'packingSupport', 'hingeDoor', 'shippingGeometry', 'recovery'];
        if (required.some((k) => readiness[k] !== true))
            return { accepted: false, reason: 'formal-physics-integration-unavailable' };
        this.state = 'PACKING';
        return { accepted: true };
    }
    setPaused(value) {
        this.paused = !!value;
    }
    observe(observation) {
        if (this.paused || this.recoveryPlan || this.state === 'READY' || this.state === 'RESULT') return;
        if (observation.tick !== this.tick + 1) throw new Error('Expected next completed formal fixed tick');
        this.tick = observation.tick;
        if (
            this.#repackGrant &&
            (observation.held || observation.items.some((i) => i.held) || !this.matchesRepackGrant(observation))
        )
            this.#repackGrant = null;
        this.remainingTicks--;
        if (this.state === 'PACKING') {
            this.reason = packingReason({
                ...observation,
                order: this.config.orders[this.orderIndex],
                config: this.config,
                roundGeneration: this.generation,
            });
            this.stableTicks = this.reason ? 0 : this.stableTicks + 1;
        } else if (this.state === 'SHIPPING') {
            this.openSeen ||= Math.abs(observation.doorAngle) >= this.config.machine.packing.qualifiedOpenDegrees;
            const seen = new Set();
            for (const item of observation.items) {
                const key = keyOf(item),
                    reference = this.snapshot.itemRefs.find((ref) => keyOf(ref) === key);
                if (!reference || item.held || this.consumed.has(key)) continue;
                seen.add(key);
                const previous = this.previous.get(key);
                // Only a continuous full-shape transition through the declared chute can become pending.
                // Missing observation or lateral departure destroys continuity; it cannot be re-created below plane.
                const inside = containsXZ(item.bounds, observation.chute, 0);
                if (
                    previous?.inside &&
                    inside &&
                    previous.maxY > this.config.machine.receiver.planeY &&
                    item.bounds.max[1] <= this.config.machine.receiver.planeY &&
                    item.motion.linearVelocity.y < 0
                )
                    this.pending.add(key);
                this.previous.set(key, { inside: inside && !!previous?.inside, maxY: item.bounds.max[1] });
            }
            for (const key of this.previous.keys())
                if (!seen.has(key)) this.previous.set(key, { inside: false, maxY: NaN });
            if (this.openSeen && this.pending.size === this.snapshot.itemRefs.length) {
                const committed = immutable({ ...this.snapshot, commitTick: this.tick });
                for (const ref of committed.itemRefs) this.consumed.add(keyOf(ref));
                this.ledger.push(committed);
                this.orderIndex++;
                // Final commit wins BEFORE the same tick's global/shipping deadline checks.
                if (this.orderIndex === this.config.orders.length) {
                    this.won = true;
                    this.state = 'RESULT';
                } else this.state = 'CLOSING';
            } else if (this.tick - this.snapshot.submitTick + 1 >= this.config.judgement.shippingTimeoutTicks)
                this.state = 'BLOCKED';
        } else if (
            this.state === 'CLOSING' &&
            observation.channelClear &&
            Math.abs(observation.doorAngle) <= this.config.machine.packing.closedToleranceDegrees
        ) {
            this.state = 'PACKING';
            this.stableTicks = 0;
            this.snapshot = null;
            this.pending.clear();
        }
        if (this.remainingTicks <= 0 && !this.won) {
            this.state = 'RESULT';
            this.reason = 'timeout';
        }
    }
    submit(observation) {
        if (this.state !== 'PACKING' || this.paused || this.recoveryPlan)
            return { accepted: false, reason: 'invalid-state' };
        const reason = packingReason({
            ...observation,
            order: this.config.orders[this.orderIndex],
            config: this.config,
            roundGeneration: this.generation,
        });
        if (reason || this.stableTicks < this.config.judgement.packingStableTicks) {
            this.invalidSubmits++;
            return { accepted: false, reason: reason || 'whole-order-not-stable' };
        }
        if (
            new Set(observation.items.map(keyOf)).size !== 2 ||
            observation.items.some(
                (i) => this.consumed.has(keyOf(i)) || this.inventory.get(i.itemId)?.itemGeneration !== i.itemGeneration,
            )
        ) {
            this.invalidSubmits++;
            return { accepted: false, reason: 'invalid-inventory-identity' };
        }
        // Reject a transaction whose strict shipping continuity would already be invalid.
        // This is an explicit-command rejection, before snapshot/attempt/door side effects.
        const chuteReason = submissionChuteReason(observation);
        if (chuteReason) {
            this.invalidSubmits++;
            if (chuteReason === 'shipping-preflight-outside-chute')
                this.#repackGrant = immutable({
                    rejectionSequence: ++this.#repackSequence,
                    roundGeneration: this.generation,
                    orderId: this.config.orders[this.orderIndex].id,
                    orderIndex: this.orderIndex,
                    configVersion: this.config.configVersion,
                    rejectedActiveTick: this.tick,
                    itemRefs: observation.items.map((i) => ({ itemId: i.itemId, itemGeneration: i.itemGeneration })),
                });
            return { accepted: false, reason: chuteReason };
        }
        this.#repackGrant = null;
        this.snapshot = immutable({
            roundGeneration: this.generation,
            orderId: this.config.orders[this.orderIndex].id,
            attemptId: ++this.attemptId,
            itemRefs: observation.items.map((i) => ({ itemId: i.itemId, itemGeneration: i.itemGeneration })),
            masses: observation.items.map((i) => i.motion.mass),
            configVersion: this.config.configVersion,
            submitTick: this.tick + 1,
        });
        this.previous = new Map(
            observation.items.map((i) => [
                keyOf(i),
                { inside: containsXZ(i.bounds, observation.chute, 0), maxY: i.bounds.max[1] },
            ]),
        );
        this.pending.clear();
        this.openSeen = false;
        this.state = 'SHIPPING';
        return { accepted: true, snapshot: this.snapshot };
    }
    matchesRepackGrant(observation) {
        const grant = this.#repackGrant;
        return (
            !!grant &&
            grant.roundGeneration === this.generation &&
            grant.orderIndex === this.orderIndex &&
            grant.orderId === this.config.orders[this.orderIndex]?.id &&
            grant.configVersion === this.config.configVersion &&
            Array.isArray(observation?.items) &&
            observation.items.length === 2 &&
            new Set(observation.items.map(keyOf)).size === 2 &&
            grant.itemRefs.every((ref) => observation.items.some((i) => keyOf(i) === keyOf(ref))) &&
            grant.itemRefs.every(
                (ref) =>
                    this.inventory.get(ref.itemId)?.itemGeneration === ref.itemGeneration &&
                    !this.consumed.has(keyOf(ref)),
            )
        );
    }
    repackStatus(observation) {
        const eligible =
            this.state === 'PACKING' &&
            !this.paused &&
            !this.recoveryPlan &&
            !this.snapshot &&
            this.pending.size === 0 &&
            this.matchesRepackGrant(observation) &&
            !observation.held &&
            !observation.items.some((i) => i.held) &&
            this.stableTicks >= this.config.judgement.packingStableTicks &&
            !packingReason({
                ...observation,
                order: this.config.orders[this.orderIndex],
                config: this.config,
                roundGeneration: this.generation,
            }) &&
            submissionChuteReason(observation) === 'shipping-preflight-outside-chute';
        return { eligible: !!eligible, grant: this.#repackGrant ? structuredClone(this.#repackGrant) : null };
    }
    /** Internal complete public-body readback, never a player-supplied list of IDs or poses. */
    recoveryItems(observation, restored = []) {
        const evidence = observation?.recoveryObservation;
        if (
            evidence?.roundGeneration !== this.generation ||
            evidence.complete !== true ||
            !Array.isArray(evidence.items)
        )
            return null;
        const expected = new Map(
            [...this.inventory.values()]
                .filter((item) => !this.consumed.has(keyOf(item)))
                .map((item) => [item.itemId, item]),
        );
        for (const item of restored) expected.set(item.itemId, item);
        if (evidence.items.length !== expected.size) return null;
        const seen = new Set();
        for (const item of evidence.items) {
            const current = expected.get(item?.itemId);
            if (
                !current ||
                seen.has(item.itemId) ||
                item.itemGeneration !== current.itemGeneration ||
                item.skuId !== current.skuId ||
                typeof item.held !== 'boolean' ||
                item.motion?.enabled !== true ||
                item.motion.type !== 2 ||
                item.motion.massPending !== false ||
                !Array.isArray(item.bounds?.min) ||
                !Array.isArray(item.bounds?.max) ||
                item.bounds.min.length !== 3 ||
                item.bounds.max.length !== 3 ||
                ![...item.bounds.min, ...item.bounds.max].every(Number.isFinite) ||
                !item.bounds.min.every((v, i) => v <= item.bounds.max[i])
            )
                return null;
            seen.add(item.itemId);
        }
        return evidence.items;
    }
    recoveryChannel() {
        const { packing, receiver } = this.config.machine;
        return {
            min: [
                packing.centerXZ[0] - packing.innerSize[0] / 2,
                receiver.planeY,
                packing.centerXZ[1] - packing.innerSize[2] / 2,
            ],
            max: [
                packing.centerXZ[0] + packing.innerSize[0] / 2,
                packing.bottomY,
                packing.centerXZ[1] + packing.innerSize[2] / 2,
            ],
        };
    }
    /** Charge once at acceptance, before any asynchronous mutation or subsequent active tick. */
    acceptRecovery(command, observation) {
        const states = {
            'recover-dropped': 'PACKING',
            'retry-order': 'BLOCKED',
            'clear-channel': 'CLOSING',
            'repack-order': 'PACKING',
        };
        if (!Object.hasOwn(states, command) || states[command] !== this.state || this.paused || this.recoveryPlan)
            return { accepted: false, reason: 'recovery-unavailable' };
        const items = this.recoveryItems(observation);
        if (!items) return { accepted: false, reason: 'incomplete-recovery-observation' };
        const resetMechanism = command !== 'recover-dropped';
        let selected;
        if (command === 'recover-dropped') {
            if (
                !Number.isFinite(observation.doorAngle) ||
                Math.abs(observation.doorAngle) > this.config.machine.packing.closedToleranceDegrees
            )
                return { accepted: false, reason: 'unverified-preserved-door-state' };
            const [minX, maxX, minZ, maxZ] = this.config.machine.tableBoundsXZ;
            // Conservative recovery-zone admission, not a claim to classify every possible fall.
            // The entire body must actually be below the tabletop AND outside its XZ footprint.
            selected = items.filter(
                ({ held, bounds }) =>
                    !held &&
                    bounds.max[1] < this.config.machine.tableTopY &&
                    (bounds.max[0] < minX || bounds.min[0] > maxX || bounds.max[2] < minZ || bounds.min[2] > maxZ),
            );
        } else if (command === 'repack-order') {
            if (!this.repackStatus(observation).eligible || items.some((item) => item.held))
                return { accepted: false, reason: 'repack-not-authorized' };
            selected = items;
        } else if (command === 'retry-order') {
            if (
                !this.snapshot ||
                this.snapshot.itemRefs.some((ref) => !items.some((item) => keyOf(item) === keyOf(ref)))
            )
                return { accepted: false, reason: 'missing-original-attempt-items' };
            selected = items; // Both original pending/blocked items AND the current unshipped layout.
        } else selected = items.filter((item) => intersects(item.bounds, this.recoveryChannel()));
        if (selected.length === 0) return { accepted: false, reason: 'no-recoverable-items' };
        const plan = immutable({
            recoveryId: this.recoveries + 1,
            command,
            roundGeneration: this.generation,
            resetMechanism,
            ...(command === 'repack-order' ? { repackGrant: structuredClone(this.#repackGrant) } : {}),
            refs: selected.map(({ itemId, itemGeneration, skuId }) => ({ itemId, itemGeneration, skuId })),
        });
        this.#repackGrant = null;
        this.recoveryPlan = plan;
        this.recoveries++;
        this.remainingTicks = Math.max(0, this.remainingTicks - this.config.judgement.recoveryPenaltyTicks);
        this.attemptId++;
        this.pending.clear();
        this.previous.clear();
        this.snapshot = null;
        this.stableTicks = 0;
        this.openSeen = false;
        if (this.remainingTicks === 0) {
            this.state = 'RESULT';
            this.reason = 'recovery-timeout';
            this.recoveryPlan = null; // Terminal acceptance must not start a new physical reset.
        }
        return { accepted: true, physicsCompleted: false, terminal: this.state === 'RESULT', plan };
    }
    /** A mutation receipt is insufficient: require a matching post-fence public physical readback. */
    acknowledgeRecovery({
        recoveryId,
        roundGeneration,
        restored,
        resourcesCleared,
        mechanismResetCompleted,
        observation,
    }) {
        const plan = this.recoveryPlan;
        if (!plan || recoveryId !== plan.recoveryId || roundGeneration !== this.generation)
            return { accepted: false, reason: 'stale-recovery' };
        if (
            resourcesCleared !== true ||
            (plan.resetMechanism && mechanismResetCompleted !== true) ||
            observation?.recoveryObservation?.settledRecoveryId !== plan.recoveryId ||
            !Number.isFinite(observation?.doorAngle) ||
            Math.abs(observation.doorAngle) > this.config.machine.packing.closedToleranceDegrees
        )
            return { accepted: false, reason: 'physical-recovery-incomplete' };
        if (!Array.isArray(restored) || restored.length !== plan.refs.length)
            return { accepted: false, reason: 'invalid-restored-generation' };
        const ids = new Set();
        for (const item of restored) {
            const old = plan.refs.find((ref) => ref.itemId === item?.itemId);
            if (
                !old ||
                ids.has(item.itemId) ||
                item.itemGeneration !== old.itemGeneration + 1 ||
                item.skuId !== old.skuId ||
                this.consumed.has(keyOf(old))
            )
                return { accepted: false, reason: 'invalid-restored-generation' };
            ids.add(item.itemId);
        }
        const items = this.recoveryItems(observation, restored);
        if (
            !items ||
            items.some((item) => ids.has(item.itemId) && item.held) ||
            (plan.resetMechanism &&
                (observation.channelClear !== true ||
                    items.some((item) => intersects(item.bounds, this.recoveryChannel()))))
        )
            return { accepted: false, reason: 'physical-recovery-incomplete' };
        for (const item of restored)
            this.inventory.set(item.itemId, {
                ...this.inventory.get(item.itemId),
                itemGeneration: item.itemGeneration,
            });
        this.recoveryPlan = null;
        // A terminal state must never be resumed by a late lifecycle acknowledgment.
        if (this.state !== 'RESULT') {
            this.state = 'PACKING';
            this.reason = null;
        }
        return { accepted: true, physicsCompleted: true };
    }
    get score() {
        return Math.max(
            0,
            100 * this.ledger.length +
                (this.won ? Math.floor(this.remainingTicks / 60) : 0) -
                20 * this.recoveries -
                5 * this.invalidSubmits,
        );
    }
}
