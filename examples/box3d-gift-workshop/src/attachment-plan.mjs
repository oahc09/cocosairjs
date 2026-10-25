/** Pure pickup intent planning. No constraints are created, no bodies moved and no held flag is awarded here. */
import { rotate } from './stations.mjs';
const reject = (reason) => ({ ready: false, reason });
export function planAttachment({ config, context, headPoint, headColliders, candidates }) {
    if (
        !context ||
        context.paused ||
        !['TUTORIAL', 'PACKING'].includes(context.state) ||
        !context.snapshotToken ||
        !Array.isArray(headPoint) ||
        headPoint.length !== 3 ||
        !headPoint.every(Number.isFinite)
    )
        return reject('attachment-context-unavailable');
    if (
        !Array.isArray(headColliders) ||
        !headColliders.length ||
        headColliders.some((c) => !c || typeof c !== 'object')
    )
        return reject('missing-head-collider-identities');
    if (!Array.isArray(candidates)) return reject('candidate-observations-unavailable');
    const requests = [];
    for (const item of candidates) {
        const sku = config.skus[item.skuId],
            m = item.motion,
            q = m?.rotation,
            p = m?.position;
        if (
            !sku ||
            !item.itemId ||
            !Number.isSafeInteger(item.itemGeneration) ||
            !m?.enabled ||
            m.type !== 2 ||
            !q ||
            !p ||
            ![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite) ||
            Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 1e-5 ||
            !item.body ||
            !item.attachmentCollider ||
            item.held ||
            item.consumed
        )
            continue;
        const local = rotate(sku.attachmentPoint, q),
            point = local.map((v, i) => v + [p.x, p.y, p.z][i]);
        const distance = Math.hypot(...point.map((v, i) => v - headPoint[i]));
        if (distance > 1e-9 && distance <= config.machine.magnet.attachmentGapMax)
            requests.push({
                requestId: requests.length,
                itemId: item.itemId,
                itemGeneration: item.itemGeneration,
                skuId: item.skuId,
                body: item.body,
                attachmentCollider: item.attachmentCollider,
                from: [...headPoint],
                to: point,
                distance,
                // Public ray segment is half-open: extend 1 mm past the real attachment surface.
                translation: point.map((v, i) => ((v - headPoint[i]) * (distance + 0.001)) / distance),
            });
    }
    return { ready: true, context: { ...context }, headColliders: new Set(headColliders), requests };
}
/** A complete public all-ray result is required for each candidate; no Boolean visibility shortcut. */
export function chooseAttachment(plan, visibility, currentContext) {
    if (!plan?.ready) return reject(plan?.reason ?? 'missing-attachment-plan');
    if (
        !currentContext ||
        ['tick', 'roundGeneration', 'inputGeneration', 'heldEpoch', 'snapshotToken', 'state', 'paused'].some(
            (k) => currentContext[k] !== plan.context[k],
        )
    )
        return reject('stale-attachment-context');
    if (!Array.isArray(visibility) || visibility.length !== plan.requests.length)
        return reject('visibility-not-qualified');
    const visible = [],
        seen = new Set();
    for (const receipt of visibility) {
        const r = plan.requests[receipt?.requestId];
        if (
            !r ||
            seen.has(receipt.requestId) ||
            receipt.snapshotToken !== plan.context.snapshotToken ||
            receipt.complete !== true ||
            receipt.status !== 'supported' ||
            !Array.isArray(receipt.hits)
        )
            return reject('visibility-not-qualified');
        seen.add(receipt.requestId);
        let firstTarget = Infinity,
            firstOther = Infinity;
        for (const hit of receipt.hits) {
            if (
                !hit?.collider ||
                typeof hit.collider !== 'object' ||
                !Number.isFinite(hit.fraction) ||
                hit.fraction < 0 ||
                hit.fraction > 1
            )
                return reject('invalid-visibility-hit');
            if (plan.headColliders.has(hit.collider)) continue;
            if (hit.collider === r.attachmentCollider) firstTarget = Math.min(firstTarget, hit.fraction);
            else firstOther = Math.min(firstOther, hit.fraction);
        }
        // Empty rays do not prove the target was visible. A tied blocker is conservatively occluding.
        if (Number.isFinite(firstTarget) && firstTarget < firstOther) visible.push(r);
    }
    visible.sort((a, b) => a.distance - b.distance || a.itemId.localeCompare(b.itemId));
    return visible.length
        ? {
              ready: true,
              kind: 'proposed-safe-fixed-attachment-not-created',
              candidate: visible[0],
              context: plan.context,
          }
        : reject('no-visible-reachable-attachment');
}
