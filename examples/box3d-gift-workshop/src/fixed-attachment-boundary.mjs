/**
 * Safe-boundary queue, not active in the scene. Public Fixed component factory is
 * injected only after runtime qualification. Producers enqueue intent only;
 * flushAtIdle must be called after frame completion, never inside a producer.
 * The actual engine guard still decides whether a component mutation is legal.
 */
export class FixedAttachmentBoundary {
    constructor({ createDisabledFixed, qualification }) {
        this.factory = createDisabledFixed;
        this.qualified = qualification?.fixedAtIdle === true;
        this.pending = null;
        this.held = null;
        this.heldEpoch = 0;
        this.blocked = null;
        this.failedConstraint = null;
    }
    requestAttach(proposal) {
        if (!this.qualified || typeof this.factory !== 'function')
            return { accepted: false, reason: 'fixed-boundary-unqualified' };
        if (this.failedConstraint) return { accepted: false, reason: 'unreleased-failed-constraint' };
        if (this.held || this.pending) return { accepted: false, reason: 'already-held-or-pending' };
        if (!proposal?.ready || proposal.kind !== 'proposed-safe-fixed-attachment-not-created')
            return { accepted: false, reason: 'visible-attachment-proposal-required' };
        this.pending = { kind: 'attach', proposal };
        this.heldEpoch++;
        return { accepted: true, pending: true, heldEpoch: this.heldEpoch };
    }
    requestRelease(reason = 'user') {
        if (this.pending?.kind === 'attach') {
            this.pending = null;
            this.heldEpoch++;
        }
        if (this.failedConstraint) return { accepted: false, reason: 'unreleased-failed-constraint' };
        if (!this.held) return { accepted: true, pending: false };
        this.pending = { kind: 'release', held: this.held, reason };
        this.heldEpoch++;
        return { accepted: true, pending: true, heldEpoch: this.heldEpoch };
    }
    pause() {
        // Ordinary pause preserves real constraint; only uncommitted attach intent is discarded.
        if (this.pending?.kind === 'attach') {
            this.pending = null;
            this.heldEpoch++;
        }
    }
    flushAtIdle({ freshAttachment, roundGeneration, paused }) {
        const op = this.pending;
        if (!op) return { applied: false, reason: 'no-pending-fixed-operation' };
        if (op.kind === 'attach') {
            if (paused) {
                this.pause();
                return { applied: false, reason: 'paused' };
            }
            const before = op.proposal;
            let after;
            try {
                after = freshAttachment?.();
            } catch (error) {
                this.pending = null;
                this.heldEpoch++;
                return { applied: false, reason: 'idle-attachment-observation-rejected', error: String(error) };
            }
            if (
                !after?.ready ||
                after.kind !== 'proposed-safe-fixed-attachment-not-created' ||
                roundGeneration !== before.context.roundGeneration ||
                after.context.roundGeneration !== roundGeneration ||
                ['itemId', 'itemGeneration', 'skuId', 'body', 'attachmentCollider'].some(
                    (k) => after.candidate[k] !== before.candidate[k],
                )
            ) {
                this.pending = null;
                this.heldEpoch++;
                return { applied: false, reason: 'attachment-changed-at-idle' };
            }
            let constraint = null;
            try {
                constraint = this.factory();
                if (!constraint || constraint.enabled !== false || typeof constraint.destroy !== 'function')
                    throw new Error('Factory must return actual disabled public FixedConstraint');
                constraint.connectedBody = after.candidate.body;
                constraint.enableCollision = false;
                constraint.enabled = true;
                if (
                    constraint.connectedBody !== after.candidate.body ||
                    constraint.enableCollision !== false ||
                    constraint.enabled !== true
                )
                    throw new Error('Public Fixed configuration was not admitted');
                this.held = { ...after.candidate, constraint };
                this.pending = null;
                this.heldEpoch++;
                this.blocked = null;
                return {
                    applied: true,
                    kind: 'fixed-attachment-admitted',
                    physicsCompleted: false,
                    heldEpoch: this.heldEpoch,
                };
            } catch (error) {
                const cleanupErrors = [];
                if (constraint) {
                    try {
                        constraint.enabled = false;
                    } catch (e) {
                        cleanupErrors.push(String(e));
                    }
                    try {
                        constraint.destroy();
                    } catch (e) {
                        cleanupErrors.push(String(e));
                    }
                }
                if (cleanupErrors.length) this.failedConstraint = constraint;
                this.pending = null;
                this.blocked = 'fixed-attachment-rejected';
                this.heldEpoch++;
                return { applied: false, reason: this.blocked, error: String(error), cleanupErrors };
            }
        }
        try {
            op.held.constraint.enabled = false;
            if (op.held.constraint.enabled !== false) throw new Error('Fixed disable not admitted');
            op.held.constraint.destroy();
            this.held = null;
            this.pending = null;
            this.heldEpoch++;
            this.blocked = null;
            return {
                applied: true,
                kind: 'fixed-release-admitted',
                physicsCompleted: false,
                heldEpoch: this.heldEpoch,
            };
        } catch (error) {
            // Keep the instance and pending operation so no one can mistake failure for release.
            this.blocked = 'fixed-release-rejected';
            return { applied: false, reason: this.blocked, error: String(error) };
        }
    }
}
