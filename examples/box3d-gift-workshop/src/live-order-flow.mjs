/** Formal reducer wiring. All physical observations and lifecycle mutations are supplied by public scene APIs. */
import { OrderSession } from './order-session.mjs';
import { RawPackingEvidence } from './raw-packing-evidence.mjs';
const copy = (v) => structuredClone(v);
const freeze = (v) => {
    if (v && typeof v === 'object') {
        for (const x of Object.values(v)) freeze(x);
        Object.freeze(v);
    }
    return v;
};
export class LiveOrderFlow {
    constructor({ config, generation, inventory, door, preflightRecoveryAtIdle, restoreAtIdle, consumeAtIdle }) {
        Object.assign(this, { config, generation, door, preflightRecoveryAtIdle, restoreAtIdle, consumeAtIdle });
        this.session = new OrderSession(config, generation, inventory);
        this.last = null;
        this.stabilityWindow = [];
        this.rawPackingEvidence = new RawPackingEvidence();
        this.attempts = [];
        this.currentEvidence = null;
        this.pendingConsume = [];
        this.pendingRecovery = null;
        this.events = [];
        this.lastNativeTick = -1;
        this.consumeInFlight = null;
        this.consumeError = null;
        this.disposed = false;
    }
    start(readiness) {
        if (this.disposed) return { accepted: false, reason: 'scene-disposed' };
        const result = this.session.start(readiness);
        if (result.accepted) this.door.request('close');
        return result;
    }
    setPaused(value) {
        if (this.session.paused !== !!value) this.rawPackingEvidence.reset(value ? 'pause' : 'resume');
        this.session.setPaused(value);
    }
    observe(nativeTick, sample) {
        if (nativeTick <= this.lastNativeTick) throw new Error('Non-monotone live order observation');
        this.lastNativeTick = nativeTick;
        this.last = copy(sample);
        if (this.disposed) return;
        if (this.pendingRecovery) {
            this.rawPackingEvidence.reset('recovery');
            this.observeRecoveryAtIdle(sample, nativeTick);
            return;
        }
        if (this.session.paused || ['READY', 'RESULT'].includes(this.session.state)) {
            this.rawPackingEvidence.reset(this.session.paused ? 'pause' : 'inactive-state');
            return;
        }
        const oldState = this.session.state,
            oldLedger = this.session.ledger.length;
        this.session.observe({ ...sample, tick: this.session.tick + 1 });
        const evidence = {
            nativeTick,
            activeTick: this.session.tick,
            state: this.session.state,
            stableTicks: this.session.stableTicks,
            doorAngle: sample.doorAngle,
            held: sample.held,
            items: copy(sample.items),
            channelClear: sample.channelClear,
            triggerEvidence: copy(sample.triggerEvidence ?? {}),
        };
        if (oldState === 'PACKING') {
            this.rawPackingEvidence.observe(nativeTick, sample, this.session);
            if (this.session.stableTicks === 0) this.stabilityWindow = [];
            else {
                this.stabilityWindow.push(evidence);
                if (this.stabilityWindow.length > 45) this.stabilityWindow.shift();
            }
        }
        if (oldState !== 'PACKING') this.rawPackingEvidence.reset('non-packing-state');
        if (oldState === 'SHIPPING' && this.currentEvidence) {
            // Shipping timeout is exactly 300 ticks; never silently roll a successful crossing away.
            if (this.currentEvidence.shipping.length < 300) this.currentEvidence.shipping.push(evidence);
            else this.currentEvidence.truncated = true;
        }
        if (this.session.ledger.length > oldLedger) {
            const receipt = this.session.ledger.at(-1);
            this.pendingConsume.push(...receipt.itemRefs);
            this.currentEvidence.commit = copy(receipt);
            this.currentEvidence.outcome = 'committed';
            this.attempts.push(freeze(this.currentEvidence));
            this.currentEvidence = null;
        } else if (this.session.state === 'BLOCKED' && this.currentEvidence) {
            this.currentEvidence.outcome = 'blocked';
            this.attempts.push(freeze(this.currentEvidence));
            this.currentEvidence = null;
        }
        if (this.session.state === 'CLOSING') this.door.request(sample.channelClear === true ? 'close' : 'hold');
    }
    submit() {
        if (this.disposed || !this.last || this.pendingRecovery)
            return { accepted: false, reason: 'no-current-physical-observation' };
        const result = this.session.submit(this.last);
        if (result.accepted) {
            if (this.stabilityWindow.length !== 45) throw new Error('Missing complete 45-tick stability evidence');
            this.currentEvidence = {
                submission: copy(result.snapshot),
                stable: copy(this.stabilityWindow),
                shipping: [],
                truncated: false,
                outcome: 'pending',
            };
            this.door.request('open');
            this.rawPackingEvidence.reset('accepted-submit');
        } else this.rawPackingEvidence.reject(result, this.lastNativeTick, this.session);
        return result;
    }
    recover(command, ownerReadback = null) {
        if (
            this.disposed ||
            this.pendingRecovery ||
            this.pendingConsume.length ||
            this.consumeInFlight ||
            this.consumeError ||
            typeof this.restoreAtIdle !== 'function' ||
            typeof this.preflightRecoveryAtIdle !== 'function'
        )
            return { accepted: false, reason: 'recovery-unavailable' };
        if (
            command === 'repack-order' &&
            (!ownerReadback ||
                ownerReadback.nativeTick !== this.lastNativeTick ||
                ownerReadback.phase !== 'idle-public-body-readback' ||
                !Number.isSafeInteger(ownerReadback.nativeTick) ||
                ownerReadback.nativeTick < 0 ||
                !ownerReadback.sample ||
                this.currentEvidence)
        )
            return { accepted: false, reason: 'repack-fresh-owner-readback-required' };
        const observation = command === 'repack-order' ? ownerReadback.sample : this.last;
        const result = this.session.acceptRecovery(command, observation);
        if (!result.accepted) return result;
        if (command === 'repack-order')
            this.events.push({
                kind: 'repack-owner-preflight',
                nativeTick: ownerReadback.nativeTick,
                grant: copy(result.plan.repackGrant),
                sample: copy(ownerReadback.sample),
            });
        this.pendingRecovery = result.terminal ? null : { ...result.plan, phase: 'queued', receipt: null, error: null };
        this.stabilityWindow = [];
        this.rawPackingEvidence.reset('recovery-accepted');
        this.events.push({
            kind: 'recovery-accepted',
            nativeTick: this.lastNativeTick,
            plan: copy(result.plan),
            remainingTicks: this.session.remainingTicks,
        });
        // Never close into an obstruction. retry/clear reset the mechanism only in the idle lifecycle callback.
        return result;
    }
    observeRecoveryAtIdle(sample, nativeTick = this.lastNativeTick) {
        const pending = this.pendingRecovery;
        if (this.disposed || !pending || pending.phase !== 'awaiting-readback')
            return { accepted: false, reason: 'recovery-mutation-incomplete' };
        const result = this.session.acknowledgeRecovery({ ...pending.receipt, observation: sample });
        if (result.accepted) {
            this.events.push({ kind: 'recovery-readback', nativeTick, recoveryId: pending.recoveryId, result });
            this.pendingRecovery = null;
            this.last = null; // A fresh completed observation must precede a later submit/recovery.
            this.stabilityWindow = [];
            this.rawPackingEvidence.reset('recovery-readback');
        }
        return result;
    }
    flushAtIdle() {
        if (this.disposed) return;
        if (this.pendingConsume.length && !this.consumeInFlight && !this.consumeError) {
            const refs = this.pendingConsume.splice(0);
            const fail = (error) => {
                this.consumeError = String(error?.message ?? error);
                this.events.push({ kind: 'consume-failed', refs: copy(refs), error: this.consumeError });
            };
            try {
                const result = this.consumeAtIdle(refs);
                if (result && typeof result.then === 'function') {
                    this.consumeInFlight = Promise.resolve(result).then(
                        () => {
                            this.consumeInFlight = null;
                        },
                        (error) => {
                            this.consumeInFlight = null;
                            fail(error);
                        },
                    );
                }
            } catch (error) {
                fail(error);
            }
        }
        if (this.consumeInFlight || this.consumeError) return this.consumeInFlight;
        const pending = this.pendingRecovery;
        if (!pending || pending.phase !== 'queued') return pending?.work;
        pending.phase = 'checking-placement'; // Latch before calling; reentrant/async flush must never run it twice.
        const fail = (error) => {
            if (this.disposed || this.pendingRecovery !== pending) return;
            pending.phase = 'failed';
            pending.error = String(error?.message ?? error);
            this.events.push({ kind: 'recovery-failed', recoveryId: pending.recoveryId, error: pending.error });
        };
        const complete = (receipt) => {
            if (this.disposed || this.pendingRecovery !== pending) return;
            if (
                !receipt ||
                receipt.recoveryId !== pending.recoveryId ||
                receipt.roundGeneration !== this.generation ||
                !Array.isArray(receipt.restored) ||
                receipt.resourcesCleared !== true ||
                (pending.resetMechanism && receipt.mechanismResetCompleted !== true)
            ) {
                fail(new Error('Incomplete recovery lifecycle receipt'));
                return;
            }
            pending.receipt = freeze(copy(receipt));
            pending.phase = 'awaiting-readback';
        };
        const restore = (proof) => {
            if (this.disposed || this.pendingRecovery !== pending) return;
            const checks = proof?.placementChecks;
            if (
                proof?.recoveryId !== pending.recoveryId ||
                proof.roundGeneration !== this.generation ||
                !Array.isArray(checks) ||
                checks.length !== pending.refs.length ||
                new Set(checks.map((item) => item.itemId)).size !== pending.refs.length ||
                checks.some(
                    (item) =>
                        item.complete !== true ||
                        item.clear !== true ||
                        item.target !== 'original-layout' ||
                        !pending.refs.some(
                            (ref) => ref.itemId === item.itemId && ref.itemGeneration === item.itemGeneration,
                        ),
                )
            ) {
                fail(new Error('Missing complete non-overlap proof for original-layout recovery placements'));
                return;
            }
            pending.placementProof = freeze(copy(proof));
            pending.phase = 'restoring';
            const result = this.restoreAtIdle(copy(pending.refs), copy(this.session.recoveryPlan), copy(proof));
            if (result && typeof result.then === 'function') return Promise.resolve(result).then(complete);
            complete(result);
        };
        try {
            const proof = this.preflightRecoveryAtIdle(copy(pending.refs), copy(this.session.recoveryPlan));
            if (proof && typeof proof.then === 'function')
                pending.work = Promise.resolve(proof).then(restore).catch(fail);
            else {
                const result = restore(proof);
                if (result && typeof result.then === 'function') pending.work = result.catch(fail);
            }
        } catch (error) {
            fail(error);
        }
        return pending.work;
    }
    dispose() {
        this.disposed = true;
        this.rawPackingEvidence.reset('disposed');
    }
    report() {
        const s = this.session;
        return {
            state: s.state,
            logicalSnapshot: copy({
                observationPhase: 'report-time-business-state',
                activeTick: s.tick,
                lastCompletedNativeTick: this.lastNativeTick,
                recoveries: s.recoveries,
                invalidSubmits: s.invalidSubmits,
                attemptId: s.attemptId,
                roundGeneration: s.generation,
                deliveredPending: [...s.pending],
                consumed: [...s.consumed],
                inventory: [...s.inventory.values()],
                recoveryPlan: s.recoveryPlan,
            }),
            paused: s.paused,
            orderIndex: s.orderIndex,
            remainingTicks: s.remainingTicks,
            stableTicks: s.stableTicks,
            reason: s.reason,
            score: s.score,
            repack: s.repackStatus(this.last),
            ledger: s.ledger,
            attempts: this.attempts,
            rawPackingEvidence: this.rawPackingEvidence.report(),
            currentAttempt: this.currentEvidence,
            events: this.events,
            recovery: this.pendingRecovery
                ? {
                      recoveryId: this.pendingRecovery.recoveryId,
                      command: this.pendingRecovery.command,
                      phase: this.pendingRecovery.phase,
                      error: this.pendingRecovery.error,
                  }
                : null,
            consumeError: this.consumeError,
            developmentGeometry: true,
            originalContractBIZPassed: false,
        };
    }
}
