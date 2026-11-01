/**
 * Provisional pure policy, NOT runtime-qualified. Consumes only copied committed
 * F32 support geometry returned by the public query snapshot. Never changes raw
 * overlaps/hits, substitutes pending Node geometry, or computes an invented MTD.
 */
import { rotate } from './ex09-stations.mjs';
export const BOX_SUPPORT_POLICY = 'BOX_SUPPORT_PLANE_TRANSLATION_V1';
const vector = (v) => v && [v.x, v.y, v.z].every(Number.isFinite);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
function validGeometry(g) {
    const q = g?.rotation,
        s = g?.support;
    const count = { box: 8, sphere: 1, capsule: 2 }[g?.kind];
    return (
        count &&
        q &&
        [q.x, q.y, q.z, q.w].every(Number.isFinite) &&
        Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) <= 1e-5 &&
        vector(s?.origin) &&
        Array.isArray(s?.points) &&
        s.points.length === count &&
        s.points.every(vector) &&
        Number.isFinite(s.radius) &&
        s.radius >= 0
    );
}
function projection(g, n, minimum) {
    const points = g.support.points.map((p) => dot(p, n));
    return (
        dot(g.support.origin, n) +
        (minimum ? Math.min(...points) - g.support.radius : Math.max(...points) + g.support.radius)
    );
}
export function proveBoxSupportPair(snapshot, pair) {
    const deny = (reason) => ({ proven: false, reason, queryCollider: pair?.queryCollider, collider: pair?.collider });
    if (
        !snapshot ||
        snapshot.complete !== true ||
        !Array.isArray(snapshot.overlaps) ||
        !(
            snapshot.overlaps.includes(pair) ||
            (Array.isArray(snapshot.hits) && snapshot.hits.includes(pair) && pair.fraction === 0 && pair.distance === 0)
        ) ||
        !vector(snapshot.translation) ||
        !['worldGeneration', 'tickIndex', 'attemptId', 'nativeStepIndex', 'nativeMutationRevision'].every(
            (k) => Number.isSafeInteger(snapshot[k]) && snapshot[k] >= 0,
        )
    )
        return deny('missing-same-epoch-raw-pair');
    const matches = snapshot.children?.filter((c) => c.collider === pair.queryCollider),
        blocker = pair.blockingGeometry;
    if (
        matches?.length !== 1 ||
        !blocker ||
        blocker.collider !== pair.collider ||
        blocker.kind !== 'box' ||
        !validGeometry(blocker) ||
        !validGeometry(matches[0])
    )
        return deny('unsupported-or-incomplete-support-geometry');
    const query = matches[0],
        candidates = [];
    for (const axis of [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ])
        for (const sign of [-1, 1]) {
            const r = rotate(
                axis.map((x) => x * sign),
                blocker.rotation,
            );
            const norm = Math.hypot(...r);
            if (!Number.isFinite(norm) || norm === 0) continue;
            const normal = { x: r[0] / norm, y: r[1] / norm, z: r[2] / norm };
            const planeOffset = projection(blocker, normal, false);
            const startGap = projection(query, normal, true) - planeOffset;
            const departure = dot(snapshot.translation, normal);
            const endGap = startGap + departure;
            // No epsilon widening: equality is allowed, every deeper start or worsening departure is denied.
            if (startGap >= -0.0005 && departure >= 0 && endGap >= startGap)
                candidates.push({ planeNormal: normal, planeOffset, startGap, endGap });
        }
    if (!candidates.length) return deny('no-shallow-nondeepening-box-plane');
    candidates.sort((a, b) => b.startGap - a.startGap);
    return {
        proven: true,
        queryCollider: pair.queryCollider,
        collider: pair.collider,
        worldGeneration: snapshot.worldGeneration,
        tickIndex: snapshot.tickIndex,
        attemptId: snapshot.attemptId,
        nativeStepIndex: snapshot.nativeStepIndex,
        nativeMutationRevision: snapshot.nativeMutationRevision,
        ...candidates[0],
        maxInitialPenetration: 0.0005,
        policy: BOX_SUPPORT_POLICY,
    };
}
export function evaluateBoxSupportPairs(snapshot, { qualified = false } = {}) {
    if (!qualified)
        return {
            qualified: false,
            allProven: false,
            proofs: [],
            denied: [],
            reason: 'box-support-policy-not-qualified',
        };
    if (!Array.isArray(snapshot?.overlaps))
        return { qualified: true, allProven: false, proofs: [], denied: [], reason: 'missing-raw-overlaps' };
    const initialHits = Array.isArray(snapshot.hits)
        ? snapshot.hits.filter((hit) => hit.fraction === 0 && hit.distance === 0)
        : [];
    const results = [...snapshot.overlaps, ...initialHits].map((pair) => proveBoxSupportPair(snapshot, pair));
    return {
        qualified: true,
        allProven: results.every((r) => r.proven),
        proofs: results.filter((r) => r.proven),
        denied: results.filter((r) => !r.proven),
    };
}
