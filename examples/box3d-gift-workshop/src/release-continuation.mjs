/** Pure one-callback release proposal. No target, body/constraint write or physics success is produced. */
const vector = (value) => [value?.x, value?.y, value?.z];
const finite = (value) => vector(value).every(Number.isFinite);
const zero = (value) => finite(value) && vector(value).every((component) => component === 0);
const reference = (value) => value !== null && typeof value === 'object';
const denied = (reason) => ({ ready: false, reason, physicsCompleted: false });
/**
 * The caller may invoke this ONLY for a release newly requested in this callback,
 * with the current pending operation/held identity and the captured post-request
 * held epoch. The caller owns release.used and must set it before query/submission;
 * this pure function cannot consume mutable state or prevent a dishonest second call.
 * Never retain this proposal for a later callback, or apply it to pending attach.
 * Even a ready proposal MUST pass the ordinary complete head + held-child overlap,
 * sweep, workspace and target-quantization path before any public target admission.
 * If blocked, keep that path's stop; never compensate by writing either body's velocity.
 */
export function planReleaseContinuation({ motion, config, dt, release } = {}) {
    const fixedHz = config?.judgement?.fixedHz,
        magnet = config?.machine?.magnet;
    // This helper is for the unchanged original EX09 fixed-step/speed contract only.
    if (fixedHz !== 60 || dt !== 1 / fixedHz || magnet?.horizontalSpeedMax !== 1.2 || magnet.verticalSpeedMax !== 0.6)
        return denied('invalid-release-fixed-clock-or-limits');
    const held = release?.held,
        callback = release?.callbackContext;
    if (
        !release ||
        release.used !== false ||
        release.pending?.kind !== 'release' ||
        release.pending.held !== held ||
        !held ||
        typeof held.itemId !== 'string' ||
        !held.itemId ||
        !Number.isSafeInteger(held.itemGeneration) ||
        held.itemGeneration < 1 ||
        !reference(held.body) ||
        !reference(held.constraint) ||
        held.body !== release.body ||
        held.constraint !== release.constraint ||
        !Number.isSafeInteger(release.heldEpoch) ||
        release.heldEpoch < 1 ||
        release.heldEpoch !== release.requestedHeldEpoch ||
        !reference(callback) ||
        callback !== release.requestedCallbackContext ||
        !Number.isSafeInteger(callback.tickIndex) ||
        callback.tickIndex < 1
    )
        return denied('stale-or-unscoped-release');
    const q = motion?.rotation;
    if (
        motion?.enabled !== true ||
        motion.type !== 1 ||
        motion.massPending !== false ||
        !finite(motion.position) ||
        !zero(motion.localCenter) ||
        !zero(motion.angularVelocity) ||
        !q ||
        ![q.x, q.y, q.z, q.w].every(Number.isFinite) ||
        q.x !== 0 ||
        q.y !== 0 ||
        q.z !== 0 ||
        Math.abs(q.w) !== 1 ||
        !finite(motion.linearVelocity)
    )
        return denied('invalid-release-head-motion');
    const velocity = vector(motion.linearVelocity);
    // Strict actual native limits: no epsilon, normalization, acceleration or clamp.
    if (
        Math.hypot(velocity[0], velocity[2]) > magnet.horizontalSpeedMax ||
        Math.abs(velocity[1]) > magnet.verticalSpeedMax
    )
        return denied('release-native-speed-out-of-range');
    return Object.freeze({
        ready: true,
        kind: 'pending-release-continuation-proposal',
        velocity: Object.freeze(velocity),
        delta: Object.freeze(velocity.map((component) => component / fixedHz)),
        dt,
        requiresFullHeadAndHeldQuery: true,
        physicsCompleted: false,
    });
}
