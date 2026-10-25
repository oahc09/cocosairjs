/** Application identity policy, NOT a physics/event producer. */
export const FIXED_DT = 1 / 60;
export const NATIVE_DT = Math.fround(FIXED_DT);
export const SUBSTEPS = 4;
export const MODES = Object.freeze({
    lifecycle: Object.freeze({ speed: 1, thickness: 1, ticks: 480, start: -4, mover: 'solid', diagnostic: false }),
    'fast-solid': Object.freeze({ speed: 30, thickness: 0.01, ticks: 24, start: -2, mover: 'solid', diagnostic: false }),
    'moving-sensor': Object.freeze({ speed: 30, thickness: 0.01, ticks: 24, start: -2, mover: 'sensor', diagnostic: false }),
    'fast-solid-transient120': Object.freeze({ speed: 120, thickness: 0.01, ticks: 24, start: -8.25, mover: 'solid', diagnostic: true }),
    'moving-sensor-transient120': Object.freeze({ speed: 120, thickness: 0.01, ticks: 24, start: -8.25, mover: 'sensor', diagnostic: true }),
});
export function clock(context) {
    return { tickIndex: context.tickIndex, attemptId: context.attemptId,
        actualFixedDt: context.fixedDt, expectedFixedDt: NATIVE_DT,
        actualSubsteps: context.solverSubSteps, expectedSubsteps: SUBSTEPS };
}
export function assertClock(row) {
    if (row.actualFixedDt !== NATIVE_DT || row.actualSubsteps !== SUBSTEPS ||
        !Number.isInteger(row.tickIndex) || !Number.isInteger(row.attemptId)) throw Error('Fixed-step contract mismatch');
}
export class PairLedger {
    constructor(generation) {
        this.generation = generation;
        this.channels = new Map(); this.registered = new Set(); this.lastTick = new Map(); this.live = new Set(); this.pairs = new Set(); this.seen = new Set();
        this.rows = []; this.counts = { enter: 0, stay: 0, exit: 0 };
    }
    register(id) {
        if (!id || id.includes('|') || this.registered.has(id)) throw Error('Reused application identity');
        this.registered.add(id); this.live.add(id); this.channels.set(id,{epoch:0,enabled:true});
    }
    channelEpoch(id) { return this.channels.get(id)?.epoch; }
    /** Application listener epoch only; NOT an exposed native channel token. */
    applyEnabled(id, value, read, write, context) {
        const channel = this.channels.get(id);
        if (!this.live.has(id) || !channel || typeof value !== 'boolean' ||
            context.generation !== this.generation || !Number.isInteger(context.hookTick) || context.hookTick < -1 ||
            !Number.isInteger(context.hookAttempt) || context.hookAttempt < -1 ||
            (context.hookTick === -1) !== (context.hookAttempt === -1))
            throw Error('Invalid enabled transition');
        const before = read();
        if (before !== channel.enabled) throw Error('Untracked enabled state');
        write(value); // A throwing setter must not retire application channels.
        const after = read();
        if (after !== value) throw Error('Enabled getter mismatch');
        if (before === after) return false;
        const previousEpoch = channel.epoch;
        const removed = before === true && after === false
            ? [...this.pairs].filter(pair => pair.split('|').includes(id)) : [];
        if (after === false) { removed.forEach(pair => this.pairs.delete(pair)); channel.epoch++; }
        channel.enabled = after;
        this.rows.push({kind:after ? 'application-channel-resumed' : 'application-channel-invalidated',
            id, generation:this.generation, hookTick:context.hookTick, hookAttempt:context.hookAttempt,
            source:'successful-public-collider-enabled-setter-and-getter',
            clockAssociation:context.hookTick === -1 ? 'PRE_FIRST_HOOK_NO_NATIVE_TICK' : 'LAST_OBSERVED_HOOK', before, after,
            previousEpoch, channelEpoch:channel.epoch, removed, nativeEvent:false});
        return after === false;
    }
    retire(id) {
        this.live.delete(id);
        const removed = [...this.pairs].filter(pair => pair.split('|').includes(id));
        removed.forEach(pair => this.pairs.delete(pair));
        // A retirement record is not a native exit.
        this.rows.push({ kind: 'retired', id, removed, generation: this.generation });
    }
    accept(event) {
        const row = { ...event, accepted: false, reason: '' };
        const reject = reason => { row.reason = reason; this.rows.push(row); return row; };
        if (event.generation !== this.generation) return reject('wrong-generation');
        if (!this.live.has(event.self) || !this.live.has(event.other)) return reject('retired-or-unknown-identity');
        const channel = this.channels.get(event.self);
        if (event.channelEpoch !== channel.epoch) return reject('stale-application-channel');
        if (!channel.enabled) return reject('disabled-application-channel');
        if (event.self === event.other || !['enter', 'stay', 'exit'].includes(event.kind) ||
            !Number.isInteger(event.hookTick) || event.hookTick < 0 || !Number.isInteger(event.hookAttempt)) return reject('invalid-event');
        const pair = [event.self, event.other].sort().join('|');
        // Only zone-side callbacks feed this ledger; opposite-side listeners are intentionally absent.
        if (event.hookTick < (this.lastTick.get(pair) ?? -1)) return reject('out-of-order');
        const key = `${pair}:${event.channelEpoch}:${event.kind}:${event.hookTick}:${event.hookAttempt}`;
        if (this.seen.has(key)) return reject('duplicate');
        if (event.kind === 'enter' && this.pairs.has(pair)) return reject('duplicate-enter');
        if (event.kind !== 'enter' && !this.pairs.has(pair)) return reject('orphan-' + event.kind);
        this.seen.add(key); this.lastTick.set(pair,event.hookTick);
        if (event.kind === 'enter') this.pairs.add(pair);
        if (event.kind === 'exit') this.pairs.delete(pair);
        this.counts[event.kind]++;
        row.accepted = true; row.pair = pair; this.rows.push(row); return row;
    }
}
/** Serialize idle scene work; failed operations do not strand a later Close. */
export class IdleQueue {
    tail = Promise.resolve();
    enqueue(work) {
        const result = this.tail.then(work);
        this.tail = result.catch(() => {}); // callers retain/report the original rejection
        return result;
    }
}
