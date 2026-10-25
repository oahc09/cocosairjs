/** Public committed reads only. This is NOT a native idle/empty-queue certificate. */
export const COMMITTED_MOTION_OBSERVATION = Object.freeze({
    version: 'ex09-committed-motion-observation-1',
    pendingSdkWrites: 'unknown',
    guaranteedNoPendingWrites: false,
    tickAuthority: 'app-last-observed-native-tick-not-fresh-sdk-stamp',
});
const fields = [
    'scene',
    'flow',
    'system',
    'world',
    'headBody',
    'roundGeneration',
    'appObservedNativeTick',
    'activeTick',
    'inputGeneration',
    'heldEpoch',
    'state',
    'configVersion',
];
const sameItem = (a, b) =>
    a?.body === b?.body && a?.itemId === b?.itemId && a?.itemGeneration === b?.itemGeneration && a?.skuId === b?.skuId;
const sameScope = (a, b) =>
    fields.every((k) => a[k] === b[k]) &&
    a.items.length === b.items.length &&
    a.items.every((v, i) => sameItem(v, b.items[i])) &&
    ((!a.held && !b.held) || (!!a.held && !!b.held && sameItem(a.held, b.held)));
function guard(c) {
    if (!c || c.closed) return 'closed';
    if (!c.paused || c.systemEnabled !== false) return 'running';
    if (c.resetting || c.pending || c.fault) return 'app-boundary-unavailable';
    if (!c.scene || !c.flow || !c.system || !c.world || !c.headBody || !Array.isArray(c.items)) return 'uninitialized';
    if (
        !['roundGeneration', 'appObservedNativeTick', 'activeTick', 'inputGeneration', 'heldEpoch'].every(
            (k) => Number.isSafeInteger(c[k]) && c[k] >= 0,
        )
    )
        return 'invalid-app-stamp';
    if (typeof c.state !== 'string' || typeof c.configVersion !== 'string') return 'invalid-app-stamp';
    const keys = new Set();
    for (const i of c.items) {
        if (
            !i.body ||
            typeof i.itemId !== 'string' ||
            typeof i.skuId !== 'string' ||
            !Number.isSafeInteger(i.itemGeneration) ||
            i.itemGeneration < 1
        )
            return 'invalid-item-scope';
        const key = `${i.itemId}:${i.itemGeneration}`;
        if (keys.has(key)) return 'invalid-item-scope';
        keys.add(key);
    }
    if (c.held && !c.items.some((i) => sameItem(i, c.held))) return 'invalid-held-scope';
    return null;
}
function copyMotion(m) {
    if (!m || m.massPending !== false) throw new Error('mass-pending-or-unavailable');
    const v = (value, rotation = false) => {
        const keys = rotation ? ['x', 'y', 'z', 'w'] : ['x', 'y', 'z'];
        if (!value || !keys.every((k) => Number.isFinite(value[k]))) throw new Error('invalid-motion');
        return Object.fromEntries(keys.map((k) => [k, value[k]]));
    };
    if (!Number.isFinite(m.mass) || m.mass < 0 || typeof m.enabled !== 'boolean' || ![0, 1, 2].includes(m.type))
        throw new Error('invalid-motion');
    return {
        position: v(m.position),
        rotation: v(m.rotation, true),
        worldCOM: v(m.worldCOM),
        localCenter: v(m.localCenter),
        linearVelocity: v(m.linearVelocity),
        angularVelocity: v(m.angularVelocity),
        mass: m.mass,
        enabled: m.enabled,
        type: m.type,
        massPending: false,
    };
}
/** Injects only context reads and the existing public body reader. Never flushes or steps. */
export function createCommittedMotionObserver({ context, readMotion }) {
    return () => {
        const reject = (reason) => structuredClone({ ...COMMITTED_MOTION_OBSERVATION, ok: false, reason });
        try {
            const before = context();
            const reason = guard(before);
            if (reason) return reject(reason);
            const head = copyMotion(readMotion(before.headBody));
            const items = before.items.map((i) => ({
                itemId: i.itemId,
                itemGeneration: i.itemGeneration,
                skuId: i.skuId,
                motion: copyMotion(readMotion(i.body)),
            }));
            const after = context();
            const afterReason = guard(after);
            if (afterReason) return reject(afterReason);
            if (!sameScope(before, after)) return reject('stale-app-scope');
            return structuredClone({
                ...COMMITTED_MOTION_OBSERVATION,
                ok: true,
                committed: true,
                observationPhase: 'synchronous-public-committed-body-read',
                scope: Object.fromEntries(
                    fields
                        .filter((k) => !['scene', 'flow', 'system', 'world', 'headBody'].includes(k))
                        .map((k) => [k, before[k]]),
                ),
                worldScope: 'same-public-system-world-reference-before-and-after-not-native-generation',
                held: before.held ? { itemId: before.held.itemId, itemGeneration: before.held.itemGeneration } : null,
                head,
                items,
            });
        } catch (error) {
            return reject(error?.message === 'mass-pending-or-unavailable' ? error.message : 'public-read-unavailable');
        }
    };
}
