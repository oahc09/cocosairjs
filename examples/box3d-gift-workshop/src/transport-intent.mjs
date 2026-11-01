/** Pure intent reducer after envelope admission. Never applies targets/constraints or awards business success. */
import { mapKeys } from './input.mjs';
import { limitedMotion } from './transport-planner.mjs';
export class TransportIntent {
    constructor(inputGeneration = 0) {
        this.inputGeneration = inputGeneration;
        this.keys = new Set();
        this.axes = [0, 0, 0];
        this.velocity = [0, 0, 0];
        this.actions = [];
        this.source = null;
        this.modality = null;
        this.context = null;
    }
    clear(reason) {
        this.keys.clear();
        this.axes = [0, 0, 0];
        this.velocity = [0, 0, 0];
        this.actions = [];
        this.source = null;
        this.modality = null;
        this.inputGeneration++;
        return { accepted: true, barrier: reason, inputGeneration: this.inputGeneration };
    }
    synchronize(context) {
        if (
            this.context &&
            ['state', 'paused', 'roundGeneration', 'heldEpoch'].some((k) => context[k] !== this.context[k])
        )
            this.clear('state-or-instance-barrier');
        this.context = { ...context };
    }
    consume(packet) {
        const c = this.context;
        if (!c || c.paused || !['TUTORIAL', 'PACKING'].includes(c.state))
            return { accepted: false, reason: 'transport-state-blocked' };
        if (packet.inputGeneration !== this.inputGeneration)
            return { accepted: false, reason: 'stale-input-generation' };
        const p = packet.payload,
            key = packet.command === 'key-edge',
            analog = packet.command === 'set-axes';
        if (!['keyboard', 'touch', 'ui', 'runner', 'system'].includes(packet.source))
            return { accepted: false, reason: 'invalid-source' };
        if (
            key &&
            (!p ||
                !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space'].includes(p.code) ||
                typeof p.down !== 'boolean')
        )
            return { accepted: false, reason: 'invalid-key' };
        if (analog && (!p || ![p.x, p.y, p.z].every((v) => Number.isFinite(v) && Math.abs(v) <= 1)))
            return { accepted: false, reason: 'invalid-axes' };
        if (!key && !analog && packet.command !== 'attach-release')
            return { accepted: false, reason: 'unsupported-intent-command' };
        const modality = key ? 'digital' : analog ? 'analog' : this.modality;
        // Switch packet creates a barrier, never adds two modalities. Caller must acknowledge new epoch and resend.
        if (this.source && (packet.source !== this.source || (modality && this.modality && modality !== this.modality)))
            return {
                ...this.clear('input-source-or-modality-switch'),
                accepted: false,
                reason: 'resubmit-after-clear-barrier',
            };
        this.source = packet.source;
        if (modality) this.modality = modality;
        if (analog) {
            this.axes = [p.x, p.y, p.z];
        }
        if (key) {
            const wasDown = this.keys.has(p.code);
            if (p.down) this.keys.add(p.code);
            else this.keys.delete(p.code);
            if (p.code === 'Space' && p.down && !wasDown)
                this.actions.push({ kind: 'attach-release', seq: packet.seq });
            const a = mapKeys(this.keys);
            this.axes = [a.x, a.y, a.z];
        }
        if (packet.command === 'attach-release') this.actions.push({ kind: 'attach-release', seq: packet.seq });
        return { accepted: true, inputGeneration: this.inputGeneration };
    }
    takeActions() {
        const actions = this.actions;
        this.actions = [];
        return actions;
    }
    nextMotion(config) {
        if (!this.context || this.context.paused || !['TUTORIAL', 'PACKING'].includes(this.context.state))
            return { ready: false, reason: 'transport-state-blocked' };
        return limitedMotion(this.axes, this.velocity, 1 / config.judgement.fixedHz, config);
    }
    // Commit only after actual public target admission; a query plan alone must never advance intent velocity.
    targetAdmitted(motion) {
        if (
            !motion?.ready ||
            !Array.isArray(motion.velocity) ||
            motion.velocity.length !== 3 ||
            !motion.velocity.every(Number.isFinite)
        )
            throw new Error('Invalid admitted target motion');
        this.velocity = [...motion.velocity];
    }
}
