/** Read-only, opt-in backend diagnostics. Not a qualified public Cocos API or an idle certificate. */
export const WALL_CONTACT_DIAGNOSTICS = Object.freeze({
    version: 'ex09-wall-contact-diagnostics-1',
    qualification: 'DIAGNOSTIC_ONLY_BACKEND_SNAPSHOT',
    pendingSdkWrites: 'unknown',
    guaranteedNoPendingWrites: false,
    capturePhase: 'completed-step-observe-before-business-postprocessing',
    geometryPhase: 'cached-manifold-generation-may-be-stale',
    impulsePhase: 'mixed-phase-native-cache-not-substep-trace',
    separationVelocityPhase: 'pre-solve-generation-cache-not-current-pose-separation',
    normalImpulsePhase: 'post-solve-cache-not-per-substep-impulse',
    freshness: 'last-step-cache-step-match-does-not-prove-no-later-mutation',
    coverage: 'event-bridged-positive-pairs-only-no-absence-proof',
    identitySemantics: 'copied-observational-numeric-IDs-not-ownership-or-callable-handles',
});
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const idKey = (v) => {
    if (!v || !['low', 'high'].every((k) => Number.isInteger(v[k]) && v[k] >= 0 && v[k] <= 0xffffffff))
        throw new Error('invalid-copied-shape-id');
    return `${v.high}:${v.low}`;
};
const contactKey = (c) => {
    if (
        !Array.isArray(c?.contactId) ||
        c.contactId.length !== 3 ||
        !c.contactId.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)
    )
        throw new Error('invalid-contact-identity');
    return `${c.contactId.join(':')}/${idKey(c.shapeA)}/${idKey(c.shapeB)}`;
};
const identity = (e) => `${e.semanticId}:${e.itemGeneration}:${e.shapeIndex}`;
const sameScope = (a, b) =>
    a.world === b.world &&
    a.roundGeneration === b.roundGeneration &&
    a.appObservedNativeTick === b.appObservedNativeTick &&
    a.capturedAtNativeTick === b.capturedAtNativeTick &&
    a.entries.length === b.entries.length &&
    a.entries.every((e, i) => e.collider === b.entries[i].collider && identity(e) === identity(b.entries[i]));
function scope(context) {
    const c = context();
    if (
        !c ||
        c.closed ||
        c.resetting ||
        !c.world ||
        !integer(c.roundGeneration) ||
        !integer(c.appObservedNativeTick) ||
        !integer(c.capturedAtNativeTick) ||
        !Array.isArray(c.entries)
    )
        throw new Error('scope-unavailable');
    const entries = c.entries.map((e) => {
        if (
            !e.collider ||
            !['C4', 'lower-positive-Z-wall', 'door'].includes(e.semanticId) ||
            !integer(e.itemGeneration) ||
            !integer(e.shapeIndex)
        )
            throw new Error('invalid-semantic-registration');
        return { ...e };
    });
    if (
        new Set(entries.map(identity)).size !== entries.length ||
        new Set(entries.map((e) => e.collider)).size !== entries.length
    )
        throw new Error('ambiguous-semantic-registration');
    return { ...c, entries };
}
function copyContact(c) {
    const missingFields = [];
    const scalar = (o, k, path, type = 'number') => {
        const v = o?.[k];
        if (typeof v !== type || (type === 'number' && !Number.isFinite(v))) {
            missingFields.push(path);
            return null;
        }
        return v;
    };
    const vector = (o, k, path, length = 3) => {
        const v = o?.[k];
        if (!Array.isArray(v) || v.length !== length || !v.every(Number.isFinite)) {
            missingFields.push(path);
            return null;
        }
        return [...v];
    };
    const counter = (o, k) => {
        try {
            idKey(o?.[k]);
            return { low: o[k].low, high: o[k].high };
        } catch {
            missingFields.push(`geometry.${k}`);
            return null;
        }
    };
    const g = c.geometry;
    const geometry = {
        status: ['AVAILABLE', 'GEOMETRY_UNAVAILABLE', 'UNSUPPORTED_GEOMETRY_FAMILY'].includes(g?.status)
            ? g.status
            : null,
        source: g?.source === 'CACHED_MANIFOLD_GENERATION' ? g.source : null,
        geometryRevision: counter(g, 'geometryRevision'),
        generatedAfterStep: counter(g, 'generatedAfterStep'),
        readStepIndex: scalar(g, 'readStepIndex', 'geometry.readStepIndex'),
        readMutationRevision: scalar(g, 'readMutationRevision', 'geometry.readMutationRevision'),
        generationPoseA: vector(g, 'generationPoseA', 'geometry.generationPoseA', 10),
        generationPoseB: vector(g, 'generationPoseB', 'geometry.generationPoseB', 10),
        manifolds: [],
    };
    if (!geometry.status) missingFields.push('geometry.status');
    if (!geometry.source) missingFields.push('geometry.source');
    const list = (v, path) => {
        if (!Array.isArray(v)) {
            missingFields.push(path);
            return [];
        }
        if (v.length > 32) throw new Error('contact-capacity-exceeded');
        return v;
    };
    geometry.manifolds = list(g?.manifolds, 'geometry.manifolds').map((m, mi) => ({
        normalAtoB: vector(m, 'normalAtoB', `geometry.manifolds.${mi}.normalAtoB`),
        points: list(m.points, `geometry.manifolds.${mi}.points`).map((p, pi) =>
            Object.fromEntries(
                ['worldPointA', 'worldPointB', 'localPointA', 'localPointB'].map((k) => [
                    k,
                    vector(p, k, `geometry.manifolds.${mi}.points.${pi}.${k}`),
                ]),
            ),
        ),
    }));
    const manifolds = list(c.manifolds, 'manifolds').map((m, mi) => ({
        normalAtoB: vector(m, 'normalAtoB', `manifolds.${mi}.normalAtoB`),
        twistImpulse: scalar(m, 'twistImpulse', `manifolds.${mi}.twistImpulse`),
        frictionImpulse: vector(m, 'frictionImpulse', `manifolds.${mi}.frictionImpulse`),
        rollingImpulse: vector(m, 'rollingImpulse', `manifolds.${mi}.rollingImpulse`),
        points: list(m.points, `manifolds.${mi}.points`).map((p, pi) => ({
            anchorA: vector(p, 'anchorA', `manifolds.${mi}.points.${pi}.anchorA`),
            anchorB: vector(p, 'anchorB', `manifolds.${mi}.points.${pi}.anchorB`),
            ...Object.fromEntries(
                [
                    'separation',
                    'normalImpulse',
                    'totalNormalImpulse',
                    'normalVelocity',
                    'baseSeparation',
                    'featureId',
                    'triangleIndex',
                    'persisted',
                ].map((k) => [
                    k,
                    scalar(p, k, `manifolds.${mi}.points.${pi}.${k}`, k === 'persisted' ? 'boolean' : 'number'),
                ]),
            ),
        })),
    }));
    const poses = Object.fromEntries(
        ['prePoseA', 'prePoseB', 'postPoseA', 'postPoseB'].map((k) => [k, vector(c, k, k, 10)]),
    );
    const awake = Object.fromEntries(['awakeA', 'awakeB'].map((k) => [k, scalar(c, k, k, 'boolean')]));
    const anchorEpoch = c.anchorEpoch === 'UNRESOLVED_CACHED_NATIVE' ? c.anchorEpoch : null;
    const worldPointStatus = c.worldPointStatus === 'UNSUPPORTED_SNAPSHOT_EPOCH' ? c.worldPointStatus : null;
    if (!anchorEpoch) missingFields.push('anchorEpoch');
    if (!worldPointStatus) missingFields.push('worldPointStatus');
    const copiedBodyIdentity = {};
    for (const name of ['bodyA', 'bodyB']) {
        try {
            idKey(c[name]);
            copiedBodyIdentity[name] = { low: c[name].low, high: c[name].high };
        } catch {
            copiedBodyIdentity[name] = null;
            missingFields.push(name);
        }
    }
    return {
        geometry,
        manifolds,
        ...poses,
        ...awake,
        copiedBodyIdentity,
        anchorEpoch,
        worldPointStatus,
        missingFields,
    };
}
/** The caller supplies semantic Collider references; no names, private tokens, or native calls are used. */
export function createWallContactDiagnostics({
    enabled = false,
    startTick = 7092,
    endTick = 7108,
    capacity = 17,
    context,
}) {
    if (
        ![startTick, endTick, capacity].every(integer) ||
        startTick > endTick ||
        endTick - startTick > 4095 ||
        capacity < 1 ||
        capacity > 256
    )
        throw new Error('invalid-diagnostic-window');
    const config = Object.freeze({ enabled: enabled === true, startTick, endTick, capacity });
    const records = [];
    let bridge = null,
        dropped = 0;
    const inWindow = (tick) => config.enabled && integer(tick) && tick >= startTick && tick <= endTick;
    const push = (r) => {
        if (records.length === capacity) {
            records.shift();
            dropped++;
        }
        records.push(r);
    };
    const read = () => structuredClone({ ...WALL_CONTACT_DIAGNOSTICS, config, dropped, records });
    return Object.freeze({
        /** Consume synchronously before the callback returns. Exit and future callbacks cannot backfill a record. */
        onCollision(tick, self, event) {
            if (!inWindow(tick)) return;
            try {
                if (event?.type === 'onCollisionExit') return;
                const s = scope(context);
                if (event?.impl?.stepIndex !== tick || event.selfCollider !== self)
                    throw new Error('event-epoch-unavailable');
                const a = s.entries.find((e) => e.collider === self);
                const b = s.entries.find((e) => e.collider === event.otherCollider);
                if (!a || !b || ![a.semanticId, b.semanticId].includes('C4') || a.semanticId === b.semanticId) return;
                if (!bridge || bridge.tick !== tick || !sameScope(bridge.scope, s))
                    bridge = { tick, scope: s, pairs: new Map(), error: null };
                for (const contact of event.contacts) {
                    const g = contact.impl?.geometry;
                    if (typeof contact.isBodyA !== 'boolean' || g?.readStepIndex !== tick)
                        throw new Error('identity-epoch-unavailable');
                    const first = contact.isBodyA ? a : b,
                        second = contact.isBodyA ? b : a;
                    const key = contactKey(g);
                    const pair = [first, second].map((e) => ({
                        semanticId: e.semanticId,
                        itemGeneration: e.itemGeneration,
                        shapeIndex: e.shapeIndex,
                    }));
                    const old = bridge.pairs.get(key);
                    if (old && JSON.stringify(old) !== JSON.stringify(pair)) throw new Error('ambiguous-pair-identity');
                    if (bridge.pairs.size >= 128 && !old) throw new Error('pair-capacity-exceeded');
                    bridge.pairs.set(key, pair);
                }
            } catch {
                bridge = { tick, error: 'identity-bridge-unavailable' };
            }
        },
        capture(nativeTick) {
            if (!inWindow(nativeTick)) return;
            const base = {
                appObservedNativeTick: null,
                capturedAtNativeTick: null,
                requestedNativeTick: nativeTick,
                snapshotStepIndex: null,
            };
            try {
                const before = scope(context);
                base.appObservedNativeTick = before.appObservedNativeTick;
                base.capturedAtNativeTick = before.capturedAtNativeTick;
                if (before.capturedAtNativeTick !== nativeTick) throw new Error('capture-tick-mismatch');
                if (typeof before.world.getStepSnapshot !== 'function') throw new Error('unsupported-backend-snapshot');
                const snapshot = before.world.getStepSnapshot();
                if (!snapshot) throw new Error('snapshot-unavailable');
                base.snapshotStepIndex = integer(snapshot.stepIndex) ? snapshot.stepIndex : null;
                if (snapshot.stepIndex !== nativeTick) throw new Error('snapshot-tick-mismatch');
                if (!Object.isFrozen(snapshot)) throw new Error('snapshot-not-frozen');
                if (!Array.isArray(snapshot.contactsOfOwnedBodies)) throw new Error('contacts-unavailable');
                if (!bridge || bridge.tick !== nativeTick || bridge.error || !sameScope(bridge.scope, before))
                    throw new Error('identity-unavailable');
                const pairs = [];
                const seen = new Set();
                for (const c of snapshot.contactsOfOwnedBodies) {
                    const key = contactKey(c);
                    const pair = bridge.pairs.get(key);
                    if (!pair || seen.has(key)) continue;
                    seen.add(key);
                    if (c.geometry?.status === 'AVAILABLE' && contactKey(c.geometry) !== key)
                        throw new Error('contact-identity-mismatch');
                    if (pairs.length >= 128) throw new Error('pair-capacity-exceeded');
                    if (c.geometry?.status === 'AVAILABLE' && c.geometry.readStepIndex !== nativeTick)
                        throw new Error('geometry-tick-mismatch');
                    pairs.push({
                        pair,
                        copiedContactIdentity: [...c.contactId],
                        copiedShapeIdentityA: { low: c.shapeA.low, high: c.shapeA.high },
                        copiedShapeIdentityB: { low: c.shapeB.low, high: c.shapeB.high },
                        ...copyContact(c),
                    });
                }
                if (!sameScope(before, scope(context))) throw new Error('stale-app-scope');
                if (!pairs.length) throw new Error('no-bridged-contact-not-absence-proof');
                push({ ...base, roundGeneration: before.roundGeneration, ok: true, pairs });
            } catch (error) {
                const allowed = [
                    'scope-unavailable',
                    'snapshot-not-frozen',
                    'geometry-tick-mismatch',
                    'capture-tick-mismatch',
                    'unsupported-backend-snapshot',
                    'snapshot-unavailable',
                    'snapshot-tick-mismatch',
                    'contacts-unavailable',
                    'identity-unavailable',
                    'pair-capacity-exceeded',
                    'contact-capacity-exceeded',
                    'stale-app-scope',
                    'no-bridged-contact-not-absence-proof',
                ];
                push({
                    ...base,
                    ok: false,
                    reason: allowed.includes(error?.message) ? error.message : 'diagnostic-read-unavailable',
                    pairs: null,
                });
            }
            bridge = null;
        },
        read,
        reportFields: () =>
            config.enabled
                ? {
                      wallContactDiagnostics: {
                          reportExtensionSchema: 'ex09-diagnostic-report-extension-1',
                          provenance: 'opt-in-wall-contact-backend-cache-candidate-not-original-evidence',
                          ...read(),
                      },
                  }
                : {},
    });
}
