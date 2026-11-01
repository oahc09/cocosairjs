/** Live public-API orchestration. Not installed until the exact runtime is qualified.
 * This owns no simulation loop and never writes a body/Node pose.
 */
import { CommittedTransportAdapter } from './committed-transport-adapter.mjs';
import { FixedAttachmentBoundary } from './fixed-attachment-boundary.mjs';
import { TransportIntent } from './transport-intent.mjs';
import { planTransport } from './transport-planner.mjs';
import { planReleaseContinuation } from './release-continuation.mjs';
import { planAttachment } from './attachment-plan.mjs';
const xyz = (v) => [v.x, v.y, v.z];
export class SceneTransport {
    constructor({ api, config, qualification, head, getItems, getState, createDisabledFixed, freshIdleAttachment }) {
        this.api = api;
        this.config = config;
        this.head = head;
        this.getItems = getItems;
        this.getState = getState;
        this.freshIdleAttachment = freshIdleAttachment;
        this.intent = new TransportIntent(getState().inputGeneration);
        this.fixed = new FixedAttachmentBoundary({ createDisabledFixed, qualification });
        this.adapter = new CommittedTransportAdapter({
            api,
            body: head.body,
            qualification,
            options: { group: 1, mask: 0xffffffff, queryTrigger: false },
        });
        this.pendingObservation = null;
        this.releaseWindows = [];
        this.releaseWindowsDropped = 0;
        this.releaseTrack = null;
        this.closed = false;
        this.fault = null;
        this.trace = [];
        this.traceDropped = 0;
        this.traceSequence = 0;
        this.actionWindows = [];
        this.openActions = new Map();
        this.labels = new Map();
        this.labelSequence = 0;
        this.lastCompletedTick = -1;
        this.synchronize();
    }
    synchronize() {
        const s = this.getState();
        this.intent.synchronize({
            state: s.state,
            paused: s.paused,
            roundGeneration: s.roundGeneration,
            heldEpoch: this.fixed.heldEpoch,
        });
    }
    context(callbackContext) {
        const s = this.getState();
        return {
            tick: callbackContext.tickIndex,
            roundGeneration: s.roundGeneration,
            inputGeneration: this.intent.inputGeneration,
            heldEpoch: this.fixed.heldEpoch,
            snapshotToken: callbackContext,
            state: s.state,
            paused: s.paused,
        };
    }
    consumeAdmitted(packet) {
        if (this.closed || this.fault || !this.adapter.lease)
            return { accepted: false, reason: this.fault || 'transport-not-ready' };
        this.synchronize();
        const result = this.intent.consume(packet);
        this.record({ kind: 'input-intent', packet, result });
        if (result.accepted && packet.command === 'key-edge') {
            const key = `${packet.source}:${packet.payload.code}`;
            if (packet.payload.down && !this.openActions.has(key)) {
                const window = {
                    id: packet.seq,
                    source: packet.source,
                    code: packet.payload.code,
                    startTick: packet.tick,
                    endTick: null,
                    startRecord: this.traceSequence,
                    endRecord: null,
                    endedBy: null,
                };
                this.actionWindows.push(window);
                if (this.actionWindows.length > 120) this.actionWindows.shift();
                this.openActions.set(key, window);
            } else if (!packet.payload.down && this.openActions.has(key)) {
                Object.assign(this.openActions.get(key), {
                    endTick: packet.tick,
                    endRecord: this.traceSequence,
                    endedBy: 'key-up',
                });
                this.openActions.delete(key);
            }
        }
        return result;
    }
    snapshot(entity) {
        const motion = this.api.readBox3DBodyMotion(entity.body);
        if (!motion.enabled || motion.massPending) throw new Error('Body is disabled or mass-pending');
        if (!Array.isArray(entity.colliders) || entity.colliders.length !== entity.shapes.length)
            throw new Error('Incomplete scene collider inventory');
        return {
            ...entity,
            motion,
            complete: true,
            childCount: entity.colliders.length,
            children: entity.colliders.map((collider, i) => ({ collider, geometry: entity.shapes[i] })),
        };
    }
    attachmentPlan(callbackContext, headMotion) {
        const point = xyz(headMotion.position);
        // The live head is explicitly identity-oriented, with the lug-facing point on its bottom face.
        point[1] -= this.head.shapes[0].size[1] / 2;
        return planAttachment({
            config: this.config,
            context: this.context(callbackContext),
            headPoint: point,
            headColliders: this.head.colliders,
            candidates: this.getItems().map((item) => ({
                ...item,
                motion: this.api.readBox3DBodyMotion(item.body),
                attachmentCollider: item.colliders.at(-1),
            })),
        });
    }
    beforeStep(callbackContext) {
        if (this.closed || this.fault || !this.adapter.lease) return;
        try {
            this.synchronize();
            const state = this.getState();
            if (state.paused || !['TUTORIAL', 'PACKING'].includes(state.state)) {
                this.adapter.clear();
                return;
            }
            const head = this.snapshot(this.head);
            if (head.motion.type !== 1) throw new Error('Head is not native KINEMATIC');
            const actions = this.intent.takeActions();
            let release = null;
            for (const action of actions) {
                if (action.kind !== 'attach-release') continue;
                if (this.fixed.held || this.fixed.pending) {
                    const held = this.fixed.held,
                        eligible = !!held && !this.fixed.pending && actions.length === 1;
                    const requested = this.fixed.requestRelease();
                    if (eligible && requested.accepted && this.fixed.pending?.kind === 'release')
                        release = {
                            used: false,
                            pending: this.fixed.pending,
                            held,
                            body: held.body,
                            constraint: held.constraint,
                            heldEpoch: this.fixed.heldEpoch,
                            requestedHeldEpoch: this.fixed.heldEpoch,
                            callbackContext,
                            requestedCallbackContext: callbackContext,
                        };
                } else {
                    const proposal = this.adapter.queryAttachment({
                        callbackContext,
                        plan: this.attachmentPlan(callbackContext, head.motion),
                        getCurrentContext: () => this.context(callbackContext),
                    });
                    this.record({ kind: 'attachment-query', tick: callbackContext.tickIndex, proposal });
                    if (proposal.ready) this.fixed.requestAttach(proposal);
                }
                this.intent.clear('attachment-boundary');
            }
            // Only this callback's newly requested release can propose one fully queried
            // continuation while the same real weld remains connected. Attach/delayed
            // pending operations never inherit this local one-use permission.
            if ((this.fixed.pending && !release) || this.fixed.failedConstraint) {
                this.adapter.clear();
                return;
            }
            const heldItem =
                this.fixed.held &&
                this.getItems().find(
                    (item) =>
                        item.body === this.fixed.held.body &&
                        item.itemId === this.fixed.held.itemId &&
                        item.itemGeneration === this.fixed.held.itemGeneration,
                );
            if (this.fixed.held && !heldItem) throw new Error('Held instance no longer exists');
            if (this.fixed.held) {
                const constraint = this.api.readBox3DConstraintState(this.fixed.held.constraint);
                const stateKey = `${constraint.state}:${constraint.pending}:${this.fixed.heldEpoch}`;
                if (stateKey !== this.lastConstraintState) {
                    this.record({
                        kind: 'fixed-readback',
                        tick: callbackContext.tickIndex,
                        constraintState: constraint,
                    });
                    this.lastConstraintState = stateKey;
                }
                if (constraint.state === 'pending' || constraint.pending) {
                    this.adapter.clear();
                    return;
                }
                if (constraint.state !== 'connected' || !constraint.native)
                    throw new Error('Fixed is not actually connected');
                heldItem.held = true;
            }
            const motion = release
                ? planReleaseContinuation({
                      motion: head.motion,
                      config: this.config,
                      dt: 1 / this.config.judgement.fixedHz,
                      release: {
                          ...release,
                          pending: this.fixed.pending,
                          held: this.fixed.held,
                          heldEpoch: this.fixed.heldEpoch,
                      },
                  })
                : this.intent.nextMotion(this.config);
            if (release) {
                release.used = true;
                this.record({
                    kind: 'release-continuation-proposal',
                    tick: callbackContext.tickIndex,
                    context: this.context(callbackContext),
                    itemId: heldItem?.itemId,
                    itemGeneration: heldItem?.itemGeneration,
                    actualHeadMotion: head.motion,
                    proposal: motion,
                });
            }
            if (!motion.ready) {
                this.adapter.clear();
                if (release) this.record({ kind: 'transport-query', tick: callbackContext.tickIndex, result: motion });
                return;
            }
            const held = heldItem ? this.snapshot(heldItem) : null;
            const plan = planTransport({
                config: this.config,
                context: this.context(callbackContext),
                head,
                held,
                delta: motion.delta,
            });
            const result = this.adapter.queryAndSubmit({
                callbackContext,
                plan,
                getCurrentContext: () => this.context(callbackContext),
                headRotation: head.motion.rotation,
                headLocalCenter: head.motion.localCenter,
                fixedHz: this.config.judgement.fixedHz,
            });
            if (result.snapshot)
                this.lastQueryStamp = Object.freeze(
                    Object.fromEntries(
                        ['worldGeneration', 'tickIndex', 'attemptId', 'nativeStepIndex', 'nativeMutationRevision'].map(
                            (k) => [k, result.snapshot[k]],
                        ),
                    ),
                );
            this.lastMovement = {
                ready: result.ready,
                reason: result.reason,
                blocked: result.blocked,
                target: result.target,
            };
            const moving = motion.delta.some((v) => v !== 0);
            if (moving || !result.ready)
                this.record({ kind: 'transport-query', tick: callbackContext.tickIndex, before: head.motion, result });
            if (result.targetAdmitted) {
                this.intent.targetAdmitted(result);
                this.pendingObservation = moving
                    ? {
                          tick: callbackContext.tickIndex,
                          target: result.target,
                          before: head.motion,
                          heldBefore: held?.motion ?? null,
                          releaseContinuation: !!release,
                      }
                    : null;
            } else this.intent.clear('movement-rejected');
        } catch (error) {
            this.stop(error);
        }
    }
    afterCompletedStep(nativeTick) {
        if (this.closed || nativeTick <= this.lastCompletedTick) return;
        this.lastCompletedTick = nativeTick;
        const track = this.releaseTrack;
        if (track) {
            const item = this.getItems().find(
                (i) =>
                    i.body === track.body &&
                    i.itemId === track.window.itemId &&
                    i.itemGeneration === track.window.itemGeneration,
            );
            if (!item || this.fixed.held?.body === track.body) {
                track.window.endedBy = !item ? 'public-item-identity-retired' : 'item-reattached';
                this.releaseTrack = null;
            } else {
                try {
                    track.window.samples.push({
                        tick: nativeTick,
                        item: this.api.readBox3DBodyMotion(item.body),
                        head: this.api.readBox3DBodyMotion(this.head.body),
                    });
                    if (track.window.samples.length >= 90) {
                        track.window.endedBy = 'bounded-90-completed-steps';
                        this.releaseTrack = null;
                    }
                } catch (error) {
                    track.window.error = String(error);
                    this.releaseTrack = null;
                }
            }
        }
        const pending = this.pendingObservation;
        if (!pending || pending.tick !== nativeTick) return;
        try {
            const actual = this.api.readBox3DBodyMotion(this.head.body);
            const heldActual = this.fixed.held ? this.api.readBox3DBodyMotion(this.fixed.held.body) : null;
            const error = Math.hypot(...xyz(actual.position).map((v, i) => v - pending.target[i]));
            // Diagnostic comparison, never turn an admitted target into an exact-arrival claim.
            this.record({
                kind: 'transport-completed-step',
                tick: nativeTick,
                ...pending,
                actual,
                heldActual,
                targetErrorM: error,
                physicsCompleted: true,
            });
            this.pendingObservation = null;
            if (!Number.isFinite(error) || error > 0.002)
                this.stop('Head trajectory exceeds 2 mm diagnostic tolerance');
        } catch (error) {
            this.stop(error);
        }
    }
    flushAtIdle() {
        if (this.closed || this.fault) return;
        const s = this.getState();
        const releasing = this.fixed.pending?.kind === 'release' ? this.fixed.pending.held : null;
        const releaseBefore = releasing ? this.api.readBox3DBodyMotion(releasing.body) : null;
        const result = this.fixed.flushAtIdle({
            roundGeneration: s.roundGeneration,
            paused: s.paused,
            freshAttachment: () => this.freshIdleAttachment(this.fixed.pending?.proposal),
        });
        if (result.applied && releasing) {
            // Clear only the head target after the actual public Fixed disable/destroy request.
            // The dynamic item's solved velocity is never assigned or reconstructed.
            this.adapter.clear();
            this.intent.clear('release-idle-head-stop');
            if (this.releaseTrack) this.releaseTrack.window.endedBy = 'next-release-window';
            const window = {
                itemId: releasing.itemId,
                itemGeneration: releasing.itemGeneration,
                idleAfterCompletedTick: this.lastCompletedTick,
                releaseBefore,
                requestedDisableAtIdle: true,
                samples: [],
                endedBy: null,
                evidenceBoundary:
                    'Copied public actual motion after public Fixed disable; not a private native handle census.',
            };
            this.releaseWindows.push(window);
            if (this.releaseWindows.length > 32) {
                this.releaseWindows.shift();
                this.releaseWindowsDropped = (this.releaseWindowsDropped ?? 0) + 1;
            }
            this.releaseTrack = { body: releasing.body, window };
        }
        // New held status is published only after next-producer native connected readback.
        for (const item of this.getItems()) if (this.fixed.held?.body !== item.body) item.held = false;
        if (result.applied || result.error) this.record({ kind: 'fixed-idle', result });
        if (result.error) this.stop(result.error);
    }
    clear(reason = 'clear-input') {
        this.intent.clear(reason);
        this.adapter.clear();
    }
    pause() {
        this.clear('pause');
        this.fixed.pause();
    }
    stop(error) {
        this.fault = String(error);
        try {
            this.clear('transport-fault');
        } catch (clearError) {
            this.fault += `; clear: ${clearError}`;
        }
        this.record({ kind: 'transport-fault', error: this.fault });
    }
    record(value) {
        // Raw copied geometry and stamps remain intact; only cyclic public object identities get stable labels.
        const identityKeys = new Set([
            'collider',
            'queryCollider',
            'attachmentCollider',
            'body',
            'constraint',
            'obstacle',
        ]);
        const copy = JSON.parse(
            JSON.stringify(value, (key, v) => {
                if (!identityKeys.has(key) || v === null || typeof v !== 'object') return v;
                if (!this.labels.has(v)) this.labels.set(v, `public-object-${++this.labelSequence}`);
                return { identity: this.labels.get(v) };
            }),
        );
        copy.recordSequence = ++this.traceSequence;
        this.trace.push(copy);
        if (this.trace.length > 1200) {
            this.trace.shift();
            this.traceDropped++;
        }
    }
    traceMetadata() {
        const first = this.trace[0]?.recordSequence ?? null;
        return {
            version: 1,
            releaseWindows: structuredClone(this.releaseWindows ?? []),
            releaseWindowCapacity: 32,
            releaseWindowsDropped: this.releaseWindowsDropped ?? 0,
            capacity: 1200,
            totalRecords: this.traceSequence,
            droppedRecords: this.traceDropped,
            truncated: this.traceDropped > 0,
            actionWindows: this.actionWindows.map((w) => ({
                ...w,
                truncated: first !== null && w.startRecord < first,
                inputEnded: w.endRecord !== null,
                // Key-up ends intent, not braking or solver settling. Raw subsequent steps are retained separately.
                meaning: 'input-edge-interval-not-settling-certificate',
            })),
        };
    }
    disposeAtIdle() {
        if (this.closed) return;
        this.clear('dispose');
        this.fixed.requestRelease('scene-dispose');
        const result = this.fixed.flushAtIdle({ roundGeneration: this.getState().roundGeneration, paused: true });
        if (this.fixed.held || this.fixed.failedConstraint)
            throw new Error(result.error || 'Constraint release incomplete');
        this.adapter.dispose();
        this.closed = true;
    }
}
