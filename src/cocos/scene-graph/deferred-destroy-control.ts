/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/** Internal, opt-in destruction request deferral. With no temporary scope, the
 * Node/Component entry point follows its original path without any state change.
 * This module never executes destruction, bypasses a mutation guard, or exposes
 * native ownership. The integrating owner drains requests AFTER leaving dispatch.
 */
export type DeferredDestroyOperation = 'Node.destroy' | 'Component.destroy';
export interface DeferredDestroyTarget {
    readonly target: object;
    readonly operation: DeferredDestroyOperation;
}
export interface DeferredDestroyScope {
    /** A repeated request is false, mirroring already-scheduled destroy. */
    pending(target: object): boolean;
    /** Copy the queue without consuming it. No user method is invoked. */
    requests(): readonly DeferredDestroyTarget[];
    /** Release admission only. Previously copied requests remain usable. */
    dispose(): void;
}
interface Owner {
    readonly targets: readonly DeferredDestroyTarget[];
    readonly pending: Set<object>;
    readonly requests: DeferredDestroyTarget[];
    active: boolean;
}
const owners = new WeakMap<object, { owner: Owner; row: DeferredDestroyTarget }>();
let copying = false;
const conflict = () => Object.assign(new Error('Overlapping or reentrant deferred destruction scope.'), {
    code: 'AIR_E_BOX3D_REENTRANT',
});

export function registerDeferredDestroyScope(input: readonly DeferredDestroyTarget[]): DeferredDestroyScope {
    if (copying) throw conflict();
    copying = true;
    let targets: readonly DeferredDestroyTarget[];
    try {
        if (!Array.isArray(input)) throw new TypeError('Expected a copied destruction target array.');
        const copied = new Map<object, DeferredDestroyTarget>();
        for (let i = 0; i < input.length; ++i) {
            const value = input[i];
            if (!value || typeof value !== 'object') throw new TypeError('Expected a destruction target record.');
            const target = value.target;
            const operation = value.operation;
            if (!target || typeof target !== 'object' ||
                (operation !== 'Node.destroy' && operation !== 'Component.destroy'))
                throw new TypeError('Invalid destruction target or operation.');
            if (owners.has(target)) throw conflict();
            const previous = copied.get(target);
            if (previous && previous.operation !== operation) throw conflict();
            if (!previous) copied.set(target, Object.freeze({ target, operation }));
        }
        targets = Object.freeze(Array.from(copied.values()));
    } finally {
        copying = false;
    }
    const owner: Owner = { targets, pending: new Set(), requests: [], active: true };
    const lease = Object.freeze({
        pending(target: object): boolean { return owner.pending.has(target); },
        requests(): readonly DeferredDestroyTarget[] { return Object.freeze(owner.requests.slice()); },
        dispose(): void {
            if (!owner.active) return;
            owner.active = false;
            for (const row of owner.targets) {
                const current = owners.get(row.target);
                if (current?.owner === owner) owners.delete(row.target);
            }
        },
    });
    try {
        for (const row of targets) owners.set(row.target, { owner, row });
    } catch (error) {
        lease.dispose();
        throw error;
    }
    return lease;
}

/** Undefined means no deferral: caller MUST perform its original guard and
 * destruction path. A boolean means only that this exact request was queued;
 * the integrating owner must not call into native code during this function.
 */
export function requestDeferredDestroy(target: object, operation: DeferredDestroyOperation, alreadyScheduled = false): boolean | undefined {
    if (copying) throw conflict();
    const entry = owners.get(target);
    if (!entry || !entry.owner.active || entry.row.operation !== operation) return undefined;
    if (alreadyScheduled) return false;
    if (entry.owner.pending.has(target)) return false;
    entry.owner.pending.add(target);
    entry.owner.requests.push(entry.row);
    return true;
}
