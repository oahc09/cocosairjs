/**
 * Integration adapter for the agreed public API. NOT enabled/imported by main.ts
 * until the matching runtime is built and its public qualification passes.
 * API functions are explicit dependency injection, never a private world/handle.
 */
import { resolveTransport } from './transport-planner.mjs';
import { chooseAttachment } from './attachment-plan.mjs';
import { evaluateBoxSupportPairs } from './box-support-policy.mjs';
import { quantizeTranslationTarget } from './target-quantization.mjs';
const fail = (reason) => ({ ready: false, reason });
const validStamp = (snapshot, context) =>
    snapshot?.tickIndex === context.tickIndex &&
    snapshot.attemptId === context.attemptId &&
    ['worldGeneration', 'nativeStepIndex', 'nativeMutationRevision'].every(
        (k) => Number.isSafeInteger(snapshot[k]) && snapshot[k] >= 0,
    );
const vector = (v) => v && [v.x, v.y, v.z].every(Number.isFinite);
const validChild = (child) => {
    const q = child?.rotation,
        d = child?.dimensions;
    if (
        !vector(child?.origin) ||
        !q ||
        ![q.x, q.y, q.z, q.w].every(Number.isFinite) ||
        Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 1e-5 ||
        !Array.isArray(d) ||
        !d.every(Number.isFinite)
    )
        return false;
    return (
        (child.kind === 'box' && d.length === 3 && d.every((v) => v > 0)) ||
        (child.kind === 'sphere' && d.length === 1 && d[0] > 0) ||
        (child.kind === 'capsule' && d.length === 3 && d[0] > 0 && d[1] >= 0 && [0, 1, 2].includes(d[2]))
    );
};
export class CommittedTransportAdapter {
    constructor({ api, body, qualification, options }) {
        this.api = api;
        this.lease = null;
        this.closed = false;
        this.worldGeneration = null;
        this.options = options;
        this.rayQualified = qualification?.committedRay === true;
        this.supportPolicyQualified = qualification?.boxSupportDeparture === true;
        this.reason = 'public-committed-transport-not-qualified';
        if (qualification?.committedQueries !== true || qualification?.kinematicTarget !== true) return;
        if (
            typeof api?.createBox3DKinematicTarget !== 'function' ||
            typeof api?.queryBox3DCommittedColliders !== 'function'
        )
            return;
        if (
            !options ||
            !Number.isInteger(options.group) ||
            options.group < -2147483648 ||
            options.group > 4294967295 ||
            !Number.isInteger(options.mask) ||
            options.mask < -2147483648 ||
            options.mask > 4294967295 ||
            typeof options.queryTrigger !== 'boolean'
        )
            return;
        // Actual public API owns ready/phase/KINEMATIC/lease validation. Do not fall back after a throw.
        this.lease = api.createBox3DKinematicTarget(body);
        if (!this.lease || ['setTarget', 'clear', 'dispose'].some((k) => typeof this.lease[k] !== 'function'))
            throw new Error('Invalid public kinematic lease');
        this.reason = null;
    }
    clear() {
        this.lease?.clear();
    }
    dispose() {
        if (this.closed) return;
        this.closed = true;
        this.lease?.dispose();
        this.lease = null;
    }
    queryAttachment({ callbackContext, plan, getCurrentContext }) {
        if (this.closed || !this.lease || !this.rayQualified || typeof this.api.queryBox3DCommittedRay !== 'function')
            return fail('public-committed-visibility-not-qualified');
        if (!plan?.ready || plan.context.snapshotToken !== callbackContext || typeof getCurrentContext !== 'function')
            return fail('original-ray-context-required');
        try {
            const receipts = [];
            for (const r of plan.requests) {
                const origin = { x: Math.fround(r.from[0]), y: Math.fround(r.from[1]), z: Math.fround(r.from[2]) },
                    translation = {
                        x: Math.fround(r.translation[0]),
                        y: Math.fround(r.translation[1]),
                        z: Math.fround(r.translation[2]),
                    };
                const snapshot = this.api.queryBox3DCommittedRay(callbackContext, origin, translation, this.options);
                if (
                    !snapshot ||
                    snapshot.complete !== true ||
                    !validStamp(snapshot, callbackContext) ||
                    !Array.isArray(snapshot.hits) ||
                    ['x', 'y', 'z'].some(
                        (k) => snapshot.origin?.[k] !== origin[k] || snapshot.translation?.[k] !== translation[k],
                    )
                )
                    throw new Error('Invalid committed all-ray snapshot');
                receipts.push({
                    requestId: r.requestId,
                    snapshotToken: callbackContext,
                    complete: true,
                    status: 'supported',
                    hits: snapshot.hits,
                });
            }
            return chooseAttachment(plan, receipts, getCurrentContext());
        } catch (error) {
            return { ...fail('public-committed-visibility-rejected'), error: String(error) };
        }
    }
    queryAndSubmit(args) {
        if (this.closed || !this.lease) return fail(this.closed ? 'transport-adapter-disposed' : this.reason);
        const { plan, headRotation, headLocalCenter } = args;
        const stop = (reason, extra = {}) => {
            try {
                this.clear();
            } catch (error) {
                return { ...fail(reason), ...extra, clearError: String(error) };
            }
            return { ...fail(reason), ...extra };
        };
        // First qualified EX09 slice: no head rotation and no local COM offset.
        // Native velocity integration is still observed after-step; it is not an exact pose teleport.
        if (
            !plan?.ready ||
            !headLocalCenter ||
            [headLocalCenter.x, headLocalCenter.y, headLocalCenter.z].some((v) => v !== 0) ||
            !headRotation ||
            headRotation.x !== 0 ||
            headRotation.y !== 0 ||
            headRotation.z !== 0 ||
            headRotation.w !== 1
        )
            return stop('translation-only-zero-com-head-required');
        let candidate = quantizeTranslationTarget(
            plan.origin,
            plan.origin.map((v, i) => v + plan.movement[i]),
        );
        if (!candidate.ready) return stop(candidate.reason);
        const snapshots = [];
        const quantizations = [candidate.quantization];
        let blocked = false,
            obstacle = null;
        for (let pass = 0; pass < 3; pass++) {
            const queriedPlan = { ...plan, movement: candidate.translation };
            const result = this._queryOnly({ ...args, plan: queriedPlan });
            if (result.snapshot) snapshots.push(result.snapshot);
            if (!result.ready) return { ...result, querySnapshots: snapshots };
            blocked ||= result.blocked;
            obstacle ||= result.obstacle;
            // An unchanged queried displacement already has a proven F32 target pair.
            // Do not turn its double (origin + delta) reconstruction into a new endpoint request.
            const finalTarget = result.delta.every((v, i) => v === candidate.translation[i])
                ? candidate
                : quantizeTranslationTarget(plan.origin, result.target);
            if (!finalTarget.ready) return stop(finalTarget.reason, { querySnapshots: snapshots, quantizations });
            quantizations.push(finalTarget.quantization);
            if (finalTarget.translation.every((v, i) => v === candidate.translation[i])) {
                try {
                    this.lease.setTarget({
                        position: {
                            x: finalTarget.position[0],
                            y: finalTarget.position[1],
                            z: finalTarget.position[2],
                        },
                        rotation: { ...headRotation },
                    });
                } catch (error) {
                    return stop('public-target-rejected', { error: String(error), querySnapshots: snapshots });
                }
                return {
                    ...result,
                    blocked,
                    obstacle,
                    reason: blocked ? '前方受阻' : null,
                    target: finalTarget.position,
                    delta: finalTarget.translation,
                    targetAdmitted: true,
                    physicsCompleted: false,
                    velocity: finalTarget.translation.map((v) => v * args.fixedHz),
                    querySnapshots: snapshots,
                    quantizations,
                };
            }
            // Clipping or F32 quantization changed the requested path. Query that exact final path again.
            candidate = finalTarget;
        }
        return stop('quantized-target-query-did-not-converge', { querySnapshots: snapshots, quantizations });
    }
    _queryOnly({ callbackContext, plan, getCurrentContext, headRotation, fixedHz }) {
        if (this.closed || !this.lease) return fail(this.closed ? 'transport-adapter-disposed' : this.reason);
        try {
            if (
                !plan?.ready ||
                plan.context.snapshotToken !== callbackContext ||
                typeof getCurrentContext !== 'function'
            )
                throw new Error('Original before-step context required');
            if (
                !headRotation ||
                ![headRotation.x, headRotation.y, headRotation.z, headRotation.w].every(Number.isFinite) ||
                Math.abs(Math.hypot(headRotation.x, headRotation.y, headRotation.z, headRotation.w) - 1) > 1e-5 ||
                fixedHz !== 60
            )
                throw new Error('Invalid translation-only target pose/clock');
            // Whole group in one public call. Engine enumerates actual committed baked child geometry.
            const snapshot = this.api.queryBox3DCommittedColliders(
                callbackContext,
                [...plan.self],
                { x: plan.movement[0], y: plan.movement[1], z: plan.movement[2] },
                this.options,
            );
            if (
                !snapshot ||
                snapshot.complete !== true ||
                !validStamp(snapshot, callbackContext) ||
                !Array.isArray(snapshot.children) ||
                snapshot.children.length !== plan.requests.length ||
                !Array.isArray(snapshot.overlaps) ||
                !Array.isArray(snapshot.hits) ||
                typeof snapshot.initialOverlap !== 'boolean'
            )
                throw new Error('Incomplete committed query snapshot');
            if (!snapshot.translation || ['x', 'y', 'z'].some((k, i) => snapshot.translation[k] !== plan.movement[i]))
                throw new Error('Committed query translation mismatch');
            if (this.worldGeneration !== null && snapshot.worldGeneration !== this.worldGeneration)
                throw new Error('Committed world generation changed');
            this.worldGeneration = snapshot.worldGeneration;
            const supportPolicy = evaluateBoxSupportPairs(snapshot, { qualified: this.supportPolicyQualified });
            if (snapshot.initialOverlap && this.supportPolicyQualified && !supportPolicy.allProven) {
                this.clear();
                return { ...fail('initial-overlap-unproven'), snapshot, supportPolicy };
            }
            const provenPair = (queryCollider, collider) =>
                this.supportPolicyQualified &&
                supportPolicy.proofs.some((p) => p.queryCollider === queryCollider && p.collider === collider);
            const receipts = plan.requests.map((r) => ({
                requestId: r.requestId,
                snapshotToken: callbackContext,
                status: 'supported',
                complete: true,
                overlaps: [],
                hits: [],
            }));
            const indices = new Map(plan.requests.map((r) => [r.collider, r.requestId])),
                seen = new Set();
            for (const child of snapshot.children) {
                if (
                    !validChild(child) ||
                    !indices.has(child.collider) ||
                    seen.has(child.collider) ||
                    child.kind !== plan.requests[indices.get(child.collider)]?.geometry.type
                )
                    throw new Error('Committed child identity mismatch');
                seen.add(child.collider);
            }
            for (const overlap of snapshot.overlaps) {
                if (!indices.has(overlap.queryCollider)) throw new Error('Unrequested overlap query collider');
                // Filter derived admission records only; original snapshot stays untouched and exported.
                if (!provenPair(overlap.queryCollider, overlap.collider))
                    receipts[indices.get(overlap.queryCollider)].overlaps.push({ collider: overlap.collider });
            }
            for (const hit of snapshot.hits) {
                if (!indices.has(hit.queryCollider)) throw new Error('Unrequested sweep query collider');
                if (!(hit.fraction === 0 && hit.distance === 0 && provenPair(hit.queryCollider, hit.collider)))
                    receipts[indices.get(hit.queryCollider)].hits.push({
                        collider: hit.collider,
                        fraction: hit.fraction,
                    });
            }
            if (snapshot.initialOverlap !== snapshot.overlaps.some((x) => !plan.self.has(x.collider)))
                throw new Error('Inconsistent initial overlap evidence');
            const result = resolveTransport(plan, receipts, getCurrentContext());
            if (!result.ready) {
                this.clear();
                return result;
            }
            return { ...result, snapshot, supportPolicy };
        } catch (error) {
            // Do not leave any old movement intent scheduled when query validation fails.
            try {
                this.clear();
            } catch (clearError) {
                return {
                    ...fail('public-query-and-clear-failed'),
                    error: String(error),
                    clearError: String(clearError),
                };
            }
            return { ...fail('public-query-or-target-rejected'), error: String(error) };
        }
    }
}
