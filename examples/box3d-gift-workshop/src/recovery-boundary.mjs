/** Internal recovery input barrier. This neither advances physics nor authorizes a physical reset. */
const states = Object.freeze({
    'recover-dropped': 'PACKING',
    'retry-order': 'BLOCKED',
    'clear-channel': 'CLOSING',
    'repack-order': 'PACKING',
});
const ownerKeys = ['scene', 'flow', 'input', 'transport'];
const packetKeys = [
    'protocolVersion',
    'configVersion',
    'layoutId',
    'roundGeneration',
    'inputGeneration',
    'tick',
    'seq',
    'source',
    'command',
    'payload',
];
const records = new WeakMap();
const issuedByInput = new WeakMap();
const reference = (value) => value !== null && (typeof value === 'object' || typeof value === 'function');
const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum;
const denied = (reason) => ({ accepted: false, reason, inputCompleted: false, physicsCompleted: false });
const freeze = (value) => {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
};
function fingerprint(packet) {
    if (
        !packet ||
        Array.isArray(packet) ||
        Object.keys(packet).length !== packetKeys.length ||
        packetKeys.some((key) => !Object.hasOwn(packet, key)) ||
        !Object.hasOwn(states, packet.command) ||
        !['protocolVersion', 'configVersion', 'layoutId'].every(
            (key) => typeof packet[key] === 'string' && packet[key],
        ) ||
        !integer(packet.roundGeneration, 1) ||
        !integer(packet.inputGeneration, 0) ||
        !integer(packet.tick, 1) ||
        !integer(packet.seq, 1) ||
        !['keyboard', 'touch', 'ui', 'runner', 'system'].includes(packet.source) ||
        !packet.payload ||
        typeof packet.payload !== 'object' ||
        Array.isArray(packet.payload) ||
        Object.keys(packet.payload).length !== 0
    )
        return null;
    return JSON.stringify(Object.fromEntries([...packetKeys].sort().map((key) => [key, packet[key]])));
}
function validContext(value) {
    if (
        !value ||
        ownerKeys.some((key) => !reference(value[key])) ||
        !integer(value.roundGeneration, 1) ||
        !integer(value.inputGeneration, 0) ||
        !integer(value.heldEpoch, 0) ||
        value.paused !== false ||
        typeof value.state !== 'string' ||
        typeof value.businessState !== 'string'
    )
        return false;
    const held = value.held;
    return (
        held === null ||
        (!!held &&
            typeof held.itemId === 'string' &&
            held.itemId.length > 0 &&
            integer(held.itemGeneration, 1) &&
            reference(held.body) &&
            reference(held.constraint))
    );
}
function sameHeld(a, b) {
    if (a === null || b === null) return a === b;
    return (
        a.itemId === b.itemId &&
        a.itemGeneration === b.itemGeneration &&
        a.body === b.body &&
        a.constraint === b.constraint
    );
}
function sameOwnership(a, b) {
    return (
        ownerKeys.every((key) => a[key] === b[key]) &&
        a.roundGeneration === b.roundGeneration &&
        a.heldEpoch === b.heldEpoch &&
        sameHeld(a.held, b.held)
    );
}
function retainedContext(value) {
    return Object.freeze({
        ...Object.fromEntries(ownerKeys.map((key) => [key, value[key]])),
        roundGeneration: value.roundGeneration,
        inputGeneration: value.inputGeneration,
        state: value.state,
        businessState: value.businessState,
        paused: value.paused,
        heldEpoch: value.heldEpoch,
        held:
            value.held === null
                ? null
                : Object.freeze({
                      itemId: value.held.itemId,
                      itemGeneration: value.held.itemGeneration,
                      body: value.held.body,
                      constraint: value.held.constraint,
                  }),
    });
}
/**
 * Call only after the original packet has passed input.admit/take. Capture before,
 * set recoveryQueued, synchronize intent once, then capture after in the same call.
 * Both snapshots must copy primitive fields and held identities, not retain a mutable context wrapper.
 * No unrelated clear/pause/held/owner change is permitted in this transition.
 */
export function createRecoveryBoundary({ packet, before, after, pendingToken = null } = {}) {
    try {
        const originalFingerprint = fingerprint(packet);
        if (!originalFingerprint) return denied('invalid-recovery-packet');
        if (pendingToken !== null) return denied('recovery-boundary-already-pending');
        if (packet.command === 'repack-order' && before?.held !== null) return denied('repack-held-unavailable');
        if (
            !validContext(before) ||
            !validContext(after) ||
            !sameOwnership(before, after) ||
            before.roundGeneration !== packet.roundGeneration ||
            before.inputGeneration !== packet.inputGeneration ||
            before.state !== states[packet.command] ||
            before.businessState !== states[packet.command] ||
            after.state !== 'RECOVERY' ||
            after.businessState !== before.businessState ||
            after.inputGeneration !== before.inputGeneration + 1
        )
            return denied('invalid-recovery-boundary-transition');
        let issued = issuedByInput.get(before.input);
        if (issued?.has(packet.seq)) return denied('recovery-boundary-already-issued');
        const originalPacket = freeze(structuredClone(packet));
        const token = Object.freeze({
            packet: originalPacket,
            fingerprint: originalFingerprint,
            originalInputGeneration: packet.inputGeneration,
            boundaryInputGeneration: after.inputGeneration,
            roundGeneration: packet.roundGeneration,
            seq: packet.seq,
        });
        records.set(token, { after: retainedContext(after), consumed: false });
        if (!issued) {
            issued = new Set();
            issuedByInput.set(before.input, issued);
        }
        issued.add(packet.seq);
        return {
            accepted: true,
            token,
            ack: Object.freeze({
                seq: packet.seq,
                accepted: true,
                reason: null,
                status: 'queued',
                roundGeneration: packet.roundGeneration,
                inputGeneration: after.inputGeneration,
                state: after.businessState,
                inputCompleted: true,
                physicsCompleted: false,
            }),
        };
    } catch {
        return denied('invalid-recovery-boundary-transition');
    }
}
/**
 * Consume once at idle, before any recovery side effect. Even a rejected validation
 * retires this token; a later state restoration must not revive it. A successful
 * result authenticates this input boundary only, not scope, placement or physics.
 */
export function consumeRecoveryBoundary(token, { packet, current, pendingToken } = {}) {
    const record = reference(token) ? records.get(token) : null;
    if (!record) return denied('unknown-recovery-boundary');
    if (record.consumed) return denied('recovery-boundary-already-consumed');
    record.consumed = true;
    try {
        if (pendingToken !== token) return denied('recovery-boundary-not-current');
        if (fingerprint(packet) !== token.fingerprint) return denied('recovery-packet-changed');
        if (
            !validContext(current) ||
            !sameOwnership(record.after, current) ||
            current.state !== 'RECOVERY' ||
            current.businessState !== record.after.businessState ||
            current.inputGeneration !== token.boundaryInputGeneration
        )
            return denied('stale-recovery-boundary');
        return {
            accepted: true,
            packet: token.packet,
            inputGeneration: token.boundaryInputGeneration,
            inputCompleted: true,
            physicsCompleted: false,
        };
    } catch {
        return denied('stale-recovery-boundary');
    }
}
