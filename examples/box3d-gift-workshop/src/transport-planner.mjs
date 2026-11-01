/**
 * Pure EX09 business transport planning, NOT an engine query API or live adapter.
 * Requests must eventually be filled by qualified public committed-query APIs.
 * No Node/body writes, fabricated contacts, private handles, or success fallback.
 */
import { rotate } from './stations.mjs';
const finite3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const xyz = (v) => [v?.x, v?.y, v?.z];
const blocked = (reason) => ({ ready: false, reason });
const length = (a) => Math.hypot(...a);
export function limitedMotion(axes, previousVelocity, dt, config) {
    if (
        !finite3(axes) ||
        axes.some((x) => Math.abs(x) > 1) ||
        !finite3(previousVelocity) ||
        dt !== 1 / config.judgement.fixedHz
    )
        return blocked('invalid-motion-input');
    const m = config.machine.magnet;
    const horizontal = Math.hypot(axes[0], axes[2]);
    const target = [
        (axes[0] / Math.max(1, horizontal)) * m.horizontalSpeedMax,
        axes[1] * m.verticalSpeedMax,
        (axes[2] / Math.max(1, horizontal)) * m.horizontalSpeedMax,
    ];
    const change = target.map((v, i) => v - previousVelocity[i]);
    const ratio = Math.min(1, (m.accelerationMax * dt) / Math.max(length(change), Number.EPSILON));
    const velocity = previousVelocity.map((v, i) => v + change[i] * ratio);
    // Invalid previous speed cannot be silently clamped into a valid acceleration history.
    if (
        Math.hypot(previousVelocity[0], previousVelocity[2]) > m.horizontalSpeedMax + 1e-10 ||
        Math.abs(previousVelocity[1]) > m.verticalSpeedMax + 1e-10
    )
        return blocked('invalid-previous-speed');
    return { ready: true, velocity, delta: velocity.map((v) => v * dt) };
}
/** Snapshot collider values are actual public Collider object identities, never IDs/native handles. */
export function planTransport({ config, context, head, held = null, delta, separationM = 0.001 }) {
    if (
        !context ||
        !Number.isSafeInteger(context.tick) ||
        context.tick < 1 ||
        !Number.isSafeInteger(context.roundGeneration) ||
        context.roundGeneration < 1 ||
        !Number.isSafeInteger(context.inputGeneration) ||
        context.inputGeneration < 0 ||
        !Number.isSafeInteger(context.heldEpoch) ||
        context.heldEpoch < 0 ||
        !context.snapshotToken ||
        typeof context.snapshotToken !== 'object'
    )
        return blocked('missing-committed-snapshot');
    if (context.paused || !['TUTORIAL', 'PACKING'].includes(context.state)) return blocked('transport-state-blocked');
    if (!finite3(delta) || !Number.isFinite(separationM) || separationM < 0) return blocked('invalid-displacement');
    const origin = xyz(head?.motion?.position);
    if (!finite3(origin)) return blocked('invalid-head-pose');
    const m = config.machine.magnet;
    if (origin.some((v, i) => v < m.positionMin[i] || v > m.positionMax[i])) return blocked('head-outside-workspace');
    const movement = delta.map(
        (v, i) => Math.max(m.positionMin[i], Math.min(m.positionMax[i], origin[i] + v)) - origin[i],
    );
    const self = new Set(),
        requests = [];
    for (const [owner, body] of [
        ['head', head],
        ['held', held],
    ]) {
        if (!body) continue;
        const q = body.motion?.rotation,
            p = xyz(body.motion?.position);
        if (
            !body.complete ||
            !Array.isArray(body.children) ||
            !body.children.length ||
            body.children.length !== body.childCount ||
            !finite3(p) ||
            !q ||
            ![q.x, q.y, q.z, q.w].every(Number.isFinite) ||
            Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) > 1e-5
        )
            return blocked('incomplete-body-snapshot');
        if (
            owner === 'held' &&
            (!body.itemId ||
                !Number.isSafeInteger(body.itemGeneration) ||
                body.itemGeneration < 1 ||
                body.motion.type !== 2)
        )
            return blocked('invalid-held-instance');
        for (const child of body.children) {
            const g = child.geometry,
                c = child.collider;
            if (!c || typeof c !== 'object' || self.has(c)) return blocked('invalid-public-collider-identity');
            if (
                !g ||
                !finite3(g.center) ||
                !(
                    (g.type === 'box' && finite3(g.size) && g.size.every((x) => x > 0)) ||
                    (g.type === 'capsule' &&
                        g.axis === 'Y' &&
                        Number.isFinite(g.radius) &&
                        g.radius > 0 &&
                        Number.isFinite(g.cylinderHeight) &&
                        g.cylinderHeight >= 0)
                )
            )
                return blocked('unsupported-child-geometry');
            self.add(c);
            const offset = rotate(g.center, q),
                center = p.map((v, i) => v + offset[i]);
            requests.push(
                Object.freeze({
                    requestId: requests.length,
                    owner,
                    collider: c,
                    // Query pose is already the world-space child center. Never apply its local offset twice.
                    sourceLocalCenter: [...g.center],
                    geometry: { ...structuredClone(g), center: [0, 0, 0] },
                    pose: { position: center, rotation: { ...q } },
                    delta: [...movement],
                }),
            );
        }
    }
    return {
        ready: true,
        context: { ...context },
        origin,
        movement,
        separationM,
        self,
        requests,
        held: held ? { itemId: held.itemId, itemGeneration: held.itemGeneration } : null,
    };
}
/** Domain receipts only: bridge must preserve complete all-hit lists and public collider identities. */
export function resolveTransport(plan, receipts, currentContext) {
    if (!plan?.ready) return blocked(plan?.reason ?? 'missing-plan');
    const c = plan.context;
    if (
        !currentContext ||
        ['tick', 'roundGeneration', 'inputGeneration', 'heldEpoch', 'snapshotToken', 'state', 'paused'].some(
            (k) => currentContext[k] !== c[k],
        )
    )
        return blocked('stale-query-context');
    if (!Array.isArray(receipts) || receipts.length !== plan.requests.length) return blocked('incomplete-query-batch');
    let fraction = 1,
        obstacle = null;
    const seen = new Set();
    for (const r of receipts) {
        if (
            !r ||
            !Number.isInteger(r.requestId) ||
            !plan.requests[r.requestId] ||
            seen.has(r.requestId) ||
            r.snapshotToken !== c.snapshotToken ||
            r.status !== 'supported' ||
            r.complete !== true ||
            !Array.isArray(r.overlaps) ||
            !Array.isArray(r.hits)
        )
            return blocked('unqualified-query-result');
        seen.add(r.requestId);
        for (const overlap of r.overlaps) {
            if (!overlap?.collider || typeof overlap.collider !== 'object') return blocked('missing-hit-collider');
            if (!plan.self.has(overlap.collider)) return blocked('initial-overlap-no-depenetration-data');
        }
        for (const hit of r.hits) {
            if (
                !hit?.collider ||
                typeof hit.collider !== 'object' ||
                !Number.isFinite(hit.fraction) ||
                hit.fraction < 0 ||
                hit.fraction > 1
            )
                return blocked('invalid-all-hit-result');
            if (plan.self.has(hit.collider)) continue;
            if (hit.fraction <= fraction) {
                fraction = hit.fraction;
                obstacle = hit.collider;
            }
        }
    }
    const distance = length(plan.movement);
    const safeFraction = obstacle && distance > 0 ? Math.max(0, fraction - plan.separationM / distance) : fraction;
    const delta = plan.movement.map((v) => v * safeFraction);
    return {
        ready: true,
        blocked: !!obstacle,
        reason: obstacle ? '前方受阻' : null,
        target: plan.origin.map((v, i) => v + delta[i]),
        delta,
        fraction: safeFraction,
        obstacle,
    };
}
