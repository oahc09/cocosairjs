/** Future formal input integration: fail closed until the complete transport dependency is qualified. */
export const REQUIRED_TRANSPORT = Object.freeze([
    'kinematicTarget',
    'allShapeSweeps',
    'initialOverlap',
    'fixedAttach',
    'rayVisibility',
]);
export function transportBlockers(capabilities) {
    return REQUIRED_TRANSPORT.filter((name) => capabilities[name] !== true);
}
export function mapKeys(keys) {
    let x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    let z = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
    const length = Math.hypot(x, z);
    if (length > 1) {
        x /= length;
        z /= length;
    }
    return { x, y: Number(keys.has('KeyE')) - Number(keys.has('KeyQ')), z };
}
export class WorkshopInput {
    constructor(protocol, context, capabilities) {
        this.protocol = protocol;
        this.context = context;
        this.capabilities = capabilities;
        this.seq = 0;
        this.acknowledgements = new Map();
        this.queue = [];
        this.keys = new Set();
        this.axes = { x: 0, y: 0, z: 0 };
    }
    clear() {
        this.queue.length = 0;
        this.keys.clear();
        this.axes = { x: 0, y: 0, z: 0 };
        this.context.inputGeneration++;
    }
    admit(packet) {
        const seq = packet?.seq;
        if (!Number.isSafeInteger(seq) || seq < 1) return { accepted: false, reason: 'invalid-sequence-or-tick' };
        const canonical = (v) =>
            Array.isArray(v)
                ? v.map(canonical)
                : v && typeof v === 'object'
                  ? Object.fromEntries(
                        Object.keys(v)
                            .sort()
                            .map((k) => [k, canonical(v[k])]),
                    )
                  : v;
        let fingerprint;
        try {
            fingerprint = JSON.stringify(canonical(packet));
        } catch {
            return { accepted: false, reason: 'invalid-envelope' };
        }
        const previous = this.acknowledgements.get(seq);
        if (previous)
            return structuredClone(
                previous.fingerprint === fingerprint
                    ? previous.result
                    : { accepted: false, reason: 'sequence-reused', seq },
            );
        if (seq <= this.seq) return { accepted: false, reason: 'out-of-order-sequence', seq };
        this.seq = seq; // Rejected packets consume their sequence too; clear/retry must not rewind it.
        const result = this.validate(packet);
        const acknowledgement = {
            seq,
            reason: null,
            roundGeneration: this.context.roundGeneration,
            inputGeneration: this.context.inputGeneration,
            lastCompletedTick: this.context.tick,
            state: this.context.state,
            ...result,
        };
        this.acknowledgements.set(seq, { fingerprint, result: structuredClone(acknowledgement) });
        return acknowledgement;
    }
    complete(seq, result) {
        const previous = this.acknowledgements.get(seq);
        if (!previous) throw new Error('Unknown admitted sequence');
        previous.result = { ...previous.result, ...structuredClone(result) };
        return structuredClone(previous.result);
    }
    take(seq) {
        const index = this.queue.findIndex((p) => p.seq === seq);
        return index < 0 ? null : this.queue.splice(index, 1)[0];
    }
    validate(packet) {
        if (!packet || typeof packet !== 'object' || Array.isArray(packet))
            return { accepted: false, reason: 'invalid-envelope' };
        const expected = this.protocol.envelopeSchema.required;
        if (Object.keys(packet).length !== expected.length || expected.some((k) => !(k in packet)))
            return { accepted: false, reason: 'invalid-envelope' };
        const c = this.context;
        if (c.recoveryPending && !['pause', 'resume', 'clear-input', 'set-view'].includes(packet.command))
            return { accepted: false, reason: 'recovery-in-progress' };
        if (
            packet.protocolVersion !== this.protocol.protocolVersion ||
            packet.configVersion !== c.configVersion ||
            packet.layoutId !== c.layoutId ||
            packet.roundGeneration !== c.roundGeneration ||
            packet.inputGeneration !== c.inputGeneration
        )
            return { accepted: false, reason: 'stale-identity' };
        if (
            !Number.isSafeInteger(packet.seq) ||
            packet.seq < 1 ||
            packet.tick !== c.tick + 1 ||
            !['keyboard', 'touch', 'ui', 'runner', 'system'].includes(packet.source)
        )
            return { accepted: false, reason: 'invalid-sequence-or-tick' };
        const spec = this.protocol.commands.find((row) => row.id === packet.command);
        if (!spec || !spec.allowedStates.includes(c.state))
            return { accepted: false, reason: 'invalid-state-or-command' };
        const schema = spec.payloadSchema,
            p = packet.payload;
        if (
            !p ||
            typeof p !== 'object' ||
            Array.isArray(p) ||
            Object.keys(p).some((k) => !(k in schema.properties)) ||
            schema.required.some((k) => !(k in p))
        )
            return { accepted: false, reason: 'invalid-payload' };
        for (const [key, value] of Object.entries(p)) {
            const field = schema.properties[key];
            if (
                typeof value !== field.type ||
                (field.enum && !field.enum.includes(value)) ||
                (field.type === 'number' && (!Number.isFinite(value) || value < field.minimum || value > field.maximum))
            )
                return { accepted: false, reason: 'invalid-payload' };
        }
        if (c.paused && !this.protocol.admission.pauseLayerAllowedBoundaryCommands.includes(packet.command))
            return { accepted: false, reason: 'paused' };
        if (
            ['set-axes', 'key-edge', 'attach-release', 'start-round', 'enter-tutorial'].includes(packet.command) &&
            transportBlockers(this.capabilities).length
        )
            return { accepted: false, reason: 'transport-unavailable', missing: transportBlockers(this.capabilities) };
        // No pretend shipping engine: formal order/recovery operations stay blocked until their real integration exists.
        if (
            !this.formalIntegrated &&
            [
                'submit-order',
                'recover-dropped',
                'retry-order',
                'clear-channel',
                'repack-order',
                'replay-round',
                'reset-round',
            ].includes(packet.command)
        )
            return { accepted: false, reason: 'formal-session-not-integrated' };
        this.seq = packet.seq;
        this.queue.push(structuredClone(packet));
        return { accepted: true, seq: packet.seq };
    }
}
/** A transport adapter must return ALL hits per child and overlap results; missing methods never default to clear. */
export function requireTransportAdapter(adapter) {
    for (const method of ['setTarget', 'sweepAll', 'overlapAll', 'visibleAttachment', 'attachFixed', 'releaseFixed'])
        if (typeof adapter?.[method] !== 'function')
            throw new Error(`EX09 transport dependency unavailable: ${method}`);
    return adapter;
}
