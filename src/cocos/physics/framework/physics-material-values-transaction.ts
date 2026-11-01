/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
/** S1 isolated candidate. No engine import, global instance, public barrel or native handle.
 * Trusted adapters supply barriers, actual-private-cache readers and read-only preparation.
 * This protocol cannot prove callback purity, singleton ownership or native release itself.
 */
import type { MaterialValuesCoverage, MaterialExpectedBinding } from './physics-material-bindings';

export type MaterialValues = readonly [number, number, number, number];
export type MaterialBindingRole = 'default' | 'explicit' | 'blocker';
export interface MaterialBindingSnapshot {
    readonly binding: object;
    readonly role: MaterialBindingRole;
    readonly initialized: boolean;
}
export interface MaterialValuesContext {
    readonly asset: object;
    readonly owner: object;
    readonly generation: number;
    readonly sequence: number;
    readonly bindings: readonly MaterialBindingSnapshot[];
}
export interface MaterialValuesCopied {
    readonly before: MaterialValues;
    readonly candidate: MaterialValues;
    readonly native: MaterialValues;
    readonly changed: boolean;
    readonly writeOnNoChange: boolean;
}
export interface PreparedNativeMaterialOperation {
    /** Exact private shape identity, used only for duplicate refusal, never diagnostics. */
    readonly target: object;
    /** Must be the exact setter, not a high-level delegate that might perform no native write. */
    invoke(): void;
    /** Throws on a mismatch. A setter return and verification are separate facts. */
    verify(): void;
}
export interface PreparedMaterialOwnerPlan {
    readonly native: readonly PreparedNativeMaterialOperation[];
    /** Only already prepared adapter/default/geometry replacements. No fresh candidate reads. */
    commitCaches(): void;
}
export interface MaterialValuesOwnerDelegate {
    /** Original asset liveness check: refuse Destroyed/ToDestroy, without coefficient reads. */
    admitAsset(asset: object): void;
    /** Validate current System/world binding and phase; acquire even when paused but ready. */
    open(context: MaterialValuesContext): void;
    /** Read/validate ALL targets, preallocate caches, and return no-mutation exact operations. */
    prepare(context: MaterialValuesContext, copied: MaterialValuesCopied): PreparedMaterialOwnerPlan;
    commit(context: MaterialValuesContext, actual: MaterialValues): void;
    fault(context: MaterialValuesContext, failure: MaterialValuesDiagnostics): void;
    /** Must tolerate partial open. Does NOT release persistent binding ownership. */
    dispose(context: MaterialValuesContext): void;
}
export interface MaterialCacheWriteRecorder {
    /** Call immediately after EACH actual private cache assignment. */
    written(): void;
}
export interface MaterialValuesSource {
    read(): Readonly<{
        before: MaterialValues;
        candidate: MaterialValues;
        /** Original scalar math.equals or setValues exact comparison, not a new policy. */
        changed: boolean;
        writeOnNoChange: boolean;
    }>;
    write(candidate: MaterialValues, recorder: MaterialCacheWriteRecorder): void;
    emit(): void;
    readActual(): MaterialValues;
}
export interface MaterialValuesDiagnostics {
    readonly phase: 'created' | 'prepared' | 'applying' | 'committed' | 'cancelled' | 'failed';
    readonly terminal: boolean;
    readonly sequence: number;
    readonly hasFailure: boolean;
    readonly error: unknown;
    readonly secondaryErrors: readonly unknown[];
    readonly ownerCount: number;
    readonly enteredOwners: number;
    readonly cleanupAttemptedOwners: number;
    readonly cleanupCompletedOwners: number;
    readonly cleanupUnresolvedOwners: number;
    readonly faultAttemptedOwners: number;
    readonly before: MaterialValues | null;
    readonly candidate: MaterialValues | null;
    readonly actual: MaterialValues | null;
    readonly actualRead: 'not-requested' | 'copied' | 'failed';
    readonly cacheWriteEntered: boolean;
    readonly cacheWrites: number;
    readonly publicEntered: boolean;
    readonly publicReturned: boolean;
    readonly committedOwners: number;
    readonly native: readonly Readonly<{
        ownerIndex: number;
        operationIndex: number;
        state: 'not-entered' | 'entered-unknown' | 'returned';
        readback: 'not-entered' | 'entered-unknown' | 'verified';
    }>[];
    readonly ownerCacheStates: readonly ('not-entered' | 'entered-unknown' | 'returned')[];
    readonly ownerCommitStates: readonly ('not-entered' | 'entered-unknown' | 'returned')[];
}
export interface MaterialValuesTicket {
    prepare(source: MaterialValuesSource): void;
    /** Exact copied plan, single use. Writes cache, then private physics, then public emit. */
    apply(): void;
    dispose(): void;
    diagnostics(): MaterialValuesDiagnostics;
}
export interface PreparedMaterialMembership {
    /** Called at the actual original private identity commit, not from a candidate getter. */
    publish(actualAsset: object | null): void;
    /** Valid only when candidate was NOT accepted; does not infer native release. */
    cancel(): void;
}
export interface MaterialValuesOwnerLease {
    prepareMembership(
        input: Readonly<{
            binding: object;
            before: object | null;
            after: object | null;
            role: MaterialBindingRole;
            initialized: boolean;
        }>,
    ): PreparedMaterialMembership;
    /** 'released' is an independently established teardown fact, not a request to destroy. */
    close(outcome: 'released' | 'unknown'): void;
    diagnostics(): Readonly<{ generation: number; state: string; bindings: number; pending: number }>;
}
interface Errors {
    failed: boolean;
    primary: unknown;
    secondary: unknown[];
}
interface Binding {
    readonly identity: object;
    readonly asset: object;
    readonly role: MaterialBindingRole;
    readonly initialized: boolean;
    tombstone: boolean;
}
interface Owner {
    readonly identity: object;
    readonly generation: number;
    readonly receiver: MaterialValuesOwnerDelegate;
    readonly callbacks: MaterialValuesOwnerDelegate;
    readonly bindings: Map<object, Binding>;
    readonly pending: Map<object, Transition>;
    state: 'live' | 'faulted' | 'closed-released' | 'closed-unknown';
}
interface AssetRoster {
    readonly bindings: Map<Owner, Set<Binding>>;
    readonly pending: Set<Transition>;
    readonly pendingOwners: Map<Owner, number>;
    ticket?: Change;
}
interface Transition {
    readonly owner: Owner;
    readonly binding: object;
    readonly before: Binding | undefined;
    readonly next: Binding | undefined;
    readonly affected: readonly AssetRoster[];
    consumed: boolean;
}
interface NativeOperation {
    readonly receiver: PreparedNativeMaterialOperation;
    readonly target: object;
    readonly invoke: () => void;
    readonly verify: () => void;
    consumed: boolean;
    state: 'not-entered' | 'entered-unknown' | 'returned';
    readback: 'not-entered' | 'entered-unknown' | 'verified';
}
interface Participant {
    readonly owner: Owner;
    readonly bindings: readonly Binding[];
    readonly context: MaterialValuesContext;
    operations: NativeOperation[];
    planReceiver?: PreparedMaterialOwnerPlan;
    commitCaches?: () => void;
    cacheState: 'not-entered' | 'entered-unknown' | 'returned';
    commitState: 'not-entered' | 'entered-unknown' | 'returned';
}
interface Change extends Errors {
    readonly coverage?: MaterialValuesCoverage;
    readonly asset: object;
    readonly roster: AssetRoster;
    readonly participants: readonly Participant[];
    readonly sequence: number;
    phase: MaterialValuesDiagnostics['phase'];
    terminal: boolean;
    entered: number;
    released: number;
    cleaned: number;
    faulted: number;
    source?: MaterialValuesSource;
    sourceReceiver?: MaterialValuesSource;
    copied?: MaterialValuesCopied;
    actual: MaterialValues | null;
    actualRead: MaterialValuesDiagnostics['actualRead'];
    cacheWriteEntered: boolean;
    cacheWrites: number;
    publicEntered: boolean;
    publicReturned: boolean;
    committedOwners: number;
    effectsEntered: boolean;
}
function object(value: unknown): value is object {
    return value !== null && typeof value === 'object';
}
function record(errors: Errors, error: unknown): void {
    if (!errors.failed) {
        errors.failed = true;
        errors.primary = error;
    } else if (!Object.is(errors.primary, error)) errors.secondary.push(error);
}
function tuple(input: MaterialValues, validate: boolean): MaterialValues {
    if (!Array.isArray(input) || input.length !== 4) throw new TypeError('Expected four material coefficients.');
    const result: [number, number, number, number] = [input[0], input[1], input[2], input[3]];
    if (result.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
        throw new TypeError('Material coefficients must be finite primitive numbers.');
    if (
        validate &&
        (result.some((v) => !Number.isFinite(Math.fround(v))) ||
            result[0] < 0 ||
            result[1] < 0 ||
            result[2] !== 0 ||
            result[3] !== 0)
    )
        throw new RangeError('Unsupported Box3D material coefficients.');
    return Object.freeze(result);
}
/** Private isolated instance only. Reduced limits are qualification controls, not application options. */
export class PhysicsMaterialValuesTransactionRegistry {
    readonly #assets = new WeakMap<object, AssetRoster>();
    readonly #current = new WeakMap<object, Owner>();
    readonly #generations = new WeakMap<object, number>();
    readonly #limit: number;
    #busy: Errors | undefined;
    #registrations = 0;
    #transitions = 0;
    #sequences = 0;
    constructor(qualification: Readonly<{ counterLimit?: number }> = {}) {
        const limit = qualification.counterLimit;
        this.#limit = limit === undefined ? Number.MAX_SAFE_INTEGER : limit;
        if (!Number.isSafeInteger(this.#limit) || this.#limit < 1) throw new TypeError('Invalid counter limit.');
    }
    #reject(message: string, change?: Change): never {
        const error = new Error(message);
        if (this.#busy) record(this.#busy, error);
        else if (change && !change.terminal) record(change, error);
        throw error;
    }
    #idle(): void {
        if (this.#busy) this.#reject('Material roster admission cannot re-enter.');
    }
    #capacity(value: number): void {
        if (value >= this.#limit) throw new RangeError('Material roster capacity exhausted.');
    }
    #admit<T>(callback: () => T): T {
        this.#idle();
        const errors: Errors = { failed: false, primary: undefined, secondary: [] };
        this.#busy = errors;
        try {
            const value = callback();
            if (errors.failed) throw errors.primary;
            return value;
        } catch (error) {
            record(errors, error);
            throw errors.primary;
        } finally {
            this.#busy = undefined;
        }
    }
    #live(owner: Owner): void {
        if (owner.state !== 'live' || this.#current.get(owner.identity) !== owner)
            throw new Error('Owner generation is stale or closed.');
    }
    #roster(asset: object): AssetRoster {
        let value = this.#assets.get(asset);
        if (!value) {
            value = { bindings: new Map(), pending: new Set(), pendingOwners: new Map() };
            this.#assets.set(asset, value);
        }
        return value;
    }
    #unlocked(roster: AssetRoster | undefined): void {
        if (roster?.ticket) this.#reject('Material asset has an open value transaction.', roster.ticket);
    }
    registerOwner(
        identity: object,
        generation: number,
        delegate: MaterialValuesOwnerDelegate,
    ): MaterialValuesOwnerLease {
        this.#idle();
        if (
            !object(identity) ||
            !Number.isSafeInteger(generation) ||
            generation < 1 ||
            generation <= (this.#generations.get(identity) ?? 0)
        )
            throw new TypeError('Expected fresh owner generation.');
        if (['live', 'faulted'].includes(this.#current.get(identity)?.state ?? ''))
            throw new Error('Owner identity is still live or faulted.');
        this.#capacity(this.#registrations);
        const callbacks = this.#admit(() => {
            if (!object(delegate)) throw new TypeError('Expected trusted owner delegate.');
            const admitAsset = delegate.admitAsset,
                open = delegate.open,
                prepare = delegate.prepare;
            const commit = delegate.commit,
                fault = delegate.fault,
                dispose = delegate.dispose;
            if ([admitAsset, open, prepare, commit, fault, dispose].some((fn) => typeof fn !== 'function'))
                throw new TypeError('Expected six owner functions.');
            return Object.freeze({ admitAsset, open, prepare, commit, fault, dispose });
        });
        const owner: Owner = {
            identity,
            generation,
            receiver: delegate,
            callbacks,
            bindings: new Map(),
            pending: new Map(),
            state: 'live',
        };
        const registry = this;
        const lease: MaterialValuesOwnerLease = Object.freeze({
            prepareMembership(
                input: Parameters<MaterialValuesOwnerLease['prepareMembership']>[0],
            ): PreparedMaterialMembership {
                if (this !== lease) registry.#reject('Invalid owner lease receiver.');
                return registry.#membership(owner, input);
            },
            close(outcome: 'released' | 'unknown'): void {
                if (this !== lease) registry.#reject('Invalid owner lease receiver.');
                registry.#close(owner, outcome);
            },
            diagnostics() {
                if (this !== lease) registry.#reject('Invalid owner lease receiver.');
                return Object.freeze({
                    generation,
                    state: owner.state,
                    bindings: owner.bindings.size,
                    pending: owner.pending.size,
                });
            },
        });
        ++this.#registrations;
        this.#generations.set(identity, generation);
        this.#current.set(identity, owner);
        return lease;
    }
    #membership(
        owner: Owner,
        input: Parameters<MaterialValuesOwnerLease['prepareMembership']>[0],
    ): PreparedMaterialMembership {
        this.#idle();
        this.#live(owner);
        this.#capacity(this.#transitions);
        const prepared = this.#admit(() => {
            if (!object(input)) throw new TypeError('Expected binding change.');
            const binding = input.binding,
                before = input.before,
                after = input.after;
            const role = input.role,
                initialized = input.initialized;
            if (
                !object(binding) ||
                (before !== null && !object(before)) ||
                (after !== null && !object(after)) ||
                !['default', 'explicit', 'blocker'].includes(role) ||
                typeof initialized !== 'boolean'
            )
                throw new TypeError('Invalid binding metadata.');
            if (owner.pending.has(binding)) throw new Error('Binding already has prepared membership.');
            const old = owner.bindings.get(binding);
            if ((old?.asset ?? null) !== before) throw new Error('Binding actual before identity mismatch.');
            if (
                role === 'default' &&
                after !== null &&
                ([...owner.bindings.values()].some((v) => v !== old && v.role === 'default') ||
                    [...owner.pending.values()].some((v) => v.next?.role === 'default'))
            )
                throw new Error('Owner already has a default binding.');
            if (!old && after !== null) this.#capacity(owner.bindings.size + owner.pending.size);
            if (before !== null) this.#unlocked(this.#assets.get(before));
            if (after !== null) {
                this.#unlocked(this.#assets.get(after));
                owner.callbacks.admitAsset.call(owner.receiver, after);
            }
            return { binding, old, after, role, initialized };
        });
        const affected = new Set<AssetRoster>();
        if (prepared.old) affected.add(this.#roster(prepared.old.asset));
        if (prepared.after !== null) {
            const nextRoster = this.#roster(prepared.after);
            affected.add(nextRoster);
            // Preallocate the candidate owner group. Pending metadata is a blocker, never executable.
            if (!nextRoster.bindings.has(owner)) nextRoster.bindings.set(owner, new Set());
        }
        const transition: Transition = {
            owner,
            binding: prepared.binding,
            before: prepared.old,
            next:
                prepared.after === null
                    ? undefined
                    : {
                          identity: prepared.binding,
                          asset: prepared.after,
                          role: prepared.role,
                          initialized: prepared.initialized,
                          tombstone: false,
                      },
            affected: Object.freeze([...affected]),
            consumed: false,
        };
        const registry = this;
        const token: PreparedMaterialMembership = Object.freeze({
            publish(actualAsset: object | null): void {
                if (this !== token) registry.#reject('Invalid membership capability receiver.');
                registry.#publish(transition, actualAsset);
            },
            cancel(): void {
                if (this !== token) registry.#reject('Invalid membership capability receiver.');
                registry.#idle();
                registry.#live(owner);
                if (transition.consumed) throw new Error('Membership capability is consumed.');
                for (const roster of transition.affected) registry.#unlocked(roster);
                registry.#retireTransition(transition);
            },
        });
        ++this.#transitions;
        owner.pending.set(transition.binding, transition);
        for (const roster of affected) {
            roster.pending.add(transition);
            roster.pendingOwners.set(owner, (roster.pendingOwners.get(owner) ?? 0) + 1);
        }
        return token;
    }
    #retireTransition(transition: Transition): void {
        transition.consumed = true;
        transition.owner.pending.delete(transition.binding);
        for (const roster of transition.affected) {
            roster.pending.delete(transition);
            const remaining = roster.pendingOwners.get(transition.owner)! - 1;
            if (remaining) roster.pendingOwners.set(transition.owner, remaining);
            else roster.pendingOwners.delete(transition.owner);
            if (roster.bindings.get(transition.owner)?.size === 0 && remaining === 0)
                roster.bindings.delete(transition.owner);
        }
    }
    #remove(owner: Owner, binding: Binding): void {
        const roster = this.#assets.get(binding.asset)!;
        const group = roster.bindings.get(owner)!;
        group.delete(binding);
        if (!group.size && ![...roster.pending].some((pending) => pending.owner === owner))
            roster.bindings.delete(owner);
        if (owner.bindings.get(binding.identity) === binding) owner.bindings.delete(binding.identity);
    }
    #add(owner: Owner, binding: Binding): void {
        const roster = this.#assets.get(binding.asset)!;
        const group = roster.bindings.get(owner);
        if (!group) throw new Error('Prepared owner membership group is missing.');
        group.add(binding);
        owner.bindings.set(binding.identity, binding);
    }
    #publish(transition: Transition, actualAsset: object | null): void {
        this.#idle();
        this.#live(transition.owner);
        if (transition.consumed || transition.owner.pending.get(transition.binding) !== transition)
            throw new Error('Membership capability is consumed or foreign.');
        if ((transition.next?.asset ?? null) !== actualAsset) throw new Error('Actual asset identity is not prepared.');
        if (transition.owner.bindings.get(transition.binding) !== transition.before)
            throw new Error('Prepared binding identity changed.');
        for (const roster of transition.affected) this.#unlocked(roster);
        // Trusted metadata publication only. No callback, getters, native effects or B0 register/dispose.
        if (transition.next) this.#add(transition.owner, transition.next);
        if (transition.before) this.#remove(transition.owner, transition.before);
        this.#retireTransition(transition);
    }
    #close(owner: Owner, outcome: 'released' | 'unknown'): void {
        this.#idle();
        if (this.#current.get(owner.identity) !== owner || !['live', 'faulted'].includes(owner.state))
            throw new Error('Owner teardown is already terminal.');
        if (outcome !== 'released' && outcome !== 'unknown') throw new TypeError('Unknown release fact.');
        const rosters = new Set<AssetRoster>();
        for (const binding of owner.bindings.values()) rosters.add(this.#assets.get(binding.asset)!);
        for (const pending of owner.pending.values()) for (const roster of pending.affected) rosters.add(roster);
        for (const roster of rosters) this.#unlocked(roster);
        if (outcome === 'released') {
            for (const binding of [...owner.bindings.values()]) this.#remove(owner, binding);
            for (const pending of [...owner.pending.values()]) this.#retireTransition(pending);
        } else {
            // Retain both old and candidate references. Pending records remain non-executable blockers.
            for (const binding of owner.bindings.values()) binding.tombstone = true;
            for (const pending of owner.pending.values()) pending.consumed = true;
        }
        owner.state = outcome === 'released' ? 'closed-released' : 'closed-unknown';
    }
    assertDestroyable(asset: object): void {
        const roster = this.#assets.get(asset);
        if (!roster || (!roster.bindings.size && !roster.pending.size)) return;
        this.#idle();
        this.#unlocked(roster);
        if (roster && (roster.bindings.size || roster.pending.size))
            throw new Error('Material retains physical ownership.');
    }
    begin(asset: object, coverage?: MaterialValuesCoverage): MaterialValuesTicket | undefined {
        const roster = this.#assets.get(asset);
        if (!roster || (!roster.bindings.size && !roster.pending.size)) {
            coverage?.compare([]);
            return undefined;
        }
        this.#idle();
        this.#unlocked(roster);
        if (roster.pending.size) throw new Error('Material membership is provisional or unresolved.');
        for (const [owner, bindings] of roster.bindings) {
            this.#live(owner);
            if ([...bindings].some((b) => b.tombstone || !b.initialized || b.role === 'blocker'))
                throw new Error('Material has provisional, unresolved or nonparticipating physical binding.');
        }
        if (coverage) {
            const actual: MaterialExpectedBinding[] = [];
            for (const [owner, bindings] of roster.bindings)
                for (const binding of bindings) {
                    if (binding.role === 'blocker') throw new Error('Nonparticipating material membership.');
                    actual.push(
                        Object.freeze({
                            owner: owner.identity,
                            generation: owner.generation,
                            binding: binding.identity,
                            role: binding.role,
                            initialized: binding.initialized,
                        }),
                    );
                }
            coverage.compare(Object.freeze(actual));
        }
        this.#capacity(this.#sequences);
        const sequence = ++this.#sequences;
        const participants = Object.freeze(
            [...roster.bindings].map(([owner, bindings]) => {
                const snapshot = Object.freeze([...bindings]);
                return {
                    owner,
                    bindings: snapshot,
                    context: Object.freeze({
                        asset,
                        owner: owner.identity,
                        generation: owner.generation,
                        sequence,
                        bindings: Object.freeze(
                            snapshot.map((b) =>
                                Object.freeze({
                                    binding: b.identity,
                                    role: b.role,
                                    initialized: b.initialized,
                                }),
                            ),
                        ),
                    }),
                    operations: [],
                    cacheState: 'not-entered' as const,
                    commitState: 'not-entered' as const,
                };
            }),
        );
        const change: Change = {
            coverage,
            asset,
            roster,
            participants,
            sequence,
            phase: 'created',
            terminal: false,
            entered: 0,
            released: 0,
            cleaned: 0,
            faulted: 0,
            actual: null,
            actualRead: 'not-requested',
            cacheWriteEntered: false,
            cacheWrites: 0,
            publicEntered: false,
            publicReturned: false,
            committedOwners: 0,
            effectsEntered: false,
            failed: false,
            primary: undefined,
            secondary: [],
        };
        roster.ticket = change;
        const registry = this;
        const ticket: MaterialValuesTicket = Object.freeze({
            prepare(source: MaterialValuesSource): void {
                if (this !== ticket) registry.#reject('Invalid value ticket receiver.', change);
                registry.#run(change, 'created', () => registry.#prepare(change, source));
            },
            apply(): void {
                if (this !== ticket) registry.#reject('Invalid value ticket receiver.', change);
                registry.#run(change, 'prepared', () => registry.#apply(change));
            },
            dispose(): void {
                if (this !== ticket) registry.#reject('Invalid value ticket receiver.', change);
                registry.#idle();
                if (change.terminal) return;
                registry.#run(change, undefined, () => {
                    registry.#release(change);
                    registry.#finish(change, 'cancelled');
                });
            },
            diagnostics(): MaterialValuesDiagnostics {
                if (this !== ticket) registry.#reject('Invalid value ticket receiver.', change);
                return registry.#diagnostics(change);
            },
        });
        return ticket;
    }
    #check(change: Change): void {
        if (change.failed) throw change.primary;
        change.coverage?.assertValid();
        if (
            this.#assets.get(change.asset) !== change.roster ||
            change.roster.ticket !== change ||
            change.roster.pending.size ||
            change.roster.bindings.size !== change.participants.length
        )
            throw new Error('Material roster changed.');
        for (const p of change.participants) {
            this.#live(p.owner);
            const group = change.roster.bindings.get(p.owner);
            if (!group || group.size !== p.bindings.length || p.bindings.some((b) => !group.has(b) || b.tombstone))
                throw new Error('Material binding generation changed.');
        }
    }
    #boundary<T>(change: Change, action: () => T): T {
        this.#check(change);
        const value = action();
        this.#check(change);
        return value;
    }
    #prepare(change: Change, source: MaterialValuesSource): void {
        for (const p of change.participants) {
            ++change.entered;
            this.#boundary(change, () => p.owner.callbacks.open.call(p.owner.receiver, p.context));
        }
        change.source = this.#boundary(change, () => {
            if (!object(source)) throw new TypeError('Expected actual cache source.');
            const read = source.read,
                write = source.write,
                emit = source.emit,
                readActual = source.readActual;
            if ([read, write, emit, readActual].some((fn) => typeof fn !== 'function'))
                throw new TypeError('Invalid source.');
            return Object.freeze({ read, write, emit, readActual });
        });
        change.sourceReceiver = source;
        const input = this.#boundary(change, () => change.source!.read.call(source));
        const copied = this.#boundary(change, () => {
            if (!object(input)) throw new TypeError('Expected private value snapshots.');
            const before = tuple(input.before, true),
                candidate = tuple(input.candidate, true);
            const changed = input.changed,
                writeOnNoChange = input.writeOnNoChange;
            if (typeof changed !== 'boolean' || typeof writeOnNoChange !== 'boolean')
                throw new TypeError('Invalid value flags.');
            return Object.freeze({
                before,
                candidate,
                changed,
                writeOnNoChange,
                native: Object.freeze(candidate.map((v) => Math.fround(v))) as MaterialValues,
            });
        });
        change.copied = copied;
        const allTargets = new Set<object>();
        let totalOperations = 0;
        for (const p of change.participants) {
            const plan = this.#boundary(change, () =>
                p.owner.callbacks.prepare.call(p.owner.receiver, p.context, copied),
            );
            this.#boundary(change, () => {
                if (!object(plan)) throw new TypeError('Expected immutable owner plan.');
                const native = plan.native,
                    commitCaches = plan.commitCaches;
                if (!Array.isArray(native) || typeof commitCaches !== 'function')
                    throw new TypeError('Invalid owner plan.');
                const count = native.length;
                if (
                    !Number.isSafeInteger(count) ||
                    count < 0 ||
                    count > this.#limit ||
                    (!copied.changed && count !== 0)
                )
                    throw new RangeError('Invalid prepared native operation count.');
                if (count > this.#limit - totalOperations) throw new RangeError('Material batch capacity exhausted.');
                totalOperations += count;
                for (let i = 0; i < count; ++i) {
                    const operation: PreparedNativeMaterialOperation = native[i];
                    if (!object(operation)) throw new TypeError('Expected exact native operation.');
                    const target = operation.target,
                        invoke = operation.invoke,
                        verify = operation.verify;
                    if (
                        !object(target) ||
                        typeof invoke !== 'function' ||
                        typeof verify !== 'function' ||
                        allTargets.has(target)
                    )
                        throw new TypeError('Invalid or duplicated native target.');
                    allTargets.add(target);
                    p.operations.push({
                        receiver: operation,
                        target,
                        invoke,
                        verify,
                        consumed: false,
                        state: 'not-entered',
                        readback: 'not-entered',
                    });
                }
                p.planReceiver = plan;
                p.commitCaches = commitCaches;
            });
        }
        change.phase = 'prepared';
    }
    #apply(change: Change): void {
        change.phase = 'applying';
        const copied = change.copied!,
            source = change.source!,
            receiver = change.sourceReceiver!;
        if (copied.changed || copied.writeOnNoChange) {
            let writing = true;
            const registry = this;
            const recorder: MaterialCacheWriteRecorder = Object.freeze({
                written(): void {
                    if (this !== recorder || !writing || registry.#busy !== change || change.phase !== 'applying')
                        registry.#reject('Invalid or expired cache write recorder.', change);
                    ++change.cacheWrites;
                },
            });
            change.cacheWriteEntered = true;
            change.effectsEntered = true;
            try {
                this.#boundary(change, () => source.write.call(receiver, copied.candidate, recorder));
            } finally {
                writing = false;
            }
        }
        if (copied.changed) {
            for (const p of change.participants) {
                for (const operation of p.operations) {
                    this.#check(change);
                    if (operation.consumed) throw new Error('Native operation authority already consumed.');
                    operation.consumed = true; // Revoke before the exact setter can mutate or throw.
                    change.effectsEntered = true;
                    operation.state = 'entered-unknown';
                    operation.invoke.call(operation.receiver);
                    operation.state = 'returned'; // Normal exact setter return is a committed native fact.
                    this.#check(change);
                    operation.readback = 'entered-unknown';
                    operation.verify.call(operation.receiver);
                    operation.readback = 'verified';
                    this.#check(change);
                }
                p.cacheState = 'entered-unknown';
                change.effectsEntered = true;
                p.commitCaches!.call(p.planReceiver);
                p.cacheState = 'returned';
                this.#check(change);
            }
            change.publicEntered = true;
            change.effectsEntered = true;
            source.emit.call(receiver);
            change.publicReturned = true;
            this.#check(change);
        }
        this.#readActual(change);
        this.#check(change);
        const expected = copied.changed || copied.writeOnNoChange ? copied.candidate : copied.before;
        if (!change.actual!.every((value, index) => Object.is(value, expected[index])))
            throw new Error('Actual private material coefficients differ from candidate.');
        for (const p of change.participants) {
            this.#check(change);
            // Even a scalar no-change call can mutate owner bookkeeping here.
            // Record entry before calling; normal return and a later reentry failure differ.
            change.effectsEntered = true;
            p.commitState = 'entered-unknown';
            p.owner.callbacks.commit.call(p.owner.receiver, p.context, change.actual!);
            p.commitState = 'returned';
            ++change.committedOwners;
            this.#check(change);
        }
        this.#release(change);
        this.#finish(change, 'committed');
    }
    #readActual(change: Change): void {
        if (!change.source) return;
        change.actualRead = 'failed';
        change.actual = tuple(change.source.readActual.call(change.sourceReceiver), false);
        change.actualRead = 'copied';
    }
    #diagnostics(change: Change): MaterialValuesDiagnostics {
        const native: Array<MaterialValuesDiagnostics['native'][number]> = [];
        change.participants.forEach((p, ownerIndex) =>
            p.operations.forEach((o, operationIndex) => {
                native.push(Object.freeze({ ownerIndex, operationIndex, state: o.state, readback: o.readback }));
            }),
        );
        return Object.freeze({
            phase: change.phase,
            terminal: change.terminal,
            sequence: change.sequence,
            hasFailure: change.failed,
            error: change.primary,
            secondaryErrors: Object.freeze([...change.secondary]),
            ownerCount: change.participants.length,
            enteredOwners: change.entered,
            cleanupAttemptedOwners: change.released,
            cleanupCompletedOwners: change.cleaned,
            cleanupUnresolvedOwners: change.released - change.cleaned,
            faultAttemptedOwners: change.faulted,
            before: change.copied?.before ?? null,
            candidate: change.copied?.candidate ?? null,
            actual: change.actual,
            actualRead: change.actualRead,
            cacheWriteEntered: change.cacheWriteEntered,
            cacheWrites: change.cacheWrites,
            publicEntered: change.publicEntered,
            publicReturned: change.publicReturned,
            committedOwners: change.committedOwners,
            native: Object.freeze(native),
            ownerCacheStates: Object.freeze(change.participants.map((p) => p.cacheState)),
            ownerCommitStates: Object.freeze(change.participants.map((p) => p.commitState)),
        });
    }
    #notifyFault(change: Change): void {
        if (change.faulted) return;
        for (const p of change.participants) {
            ++change.faulted;
            p.owner.state = 'faulted'; // Revoke even when the external fault reporter throws.
            try {
                p.owner.callbacks.fault.call(p.owner.receiver, p.context, this.#diagnostics(change));
            } catch (error) {
                record(change, error);
            }
        }
    }
    #release(change: Change): void {
        while (change.released < change.entered) {
            const p = change.participants[change.released++]; // Never retry an uncertain disposal.
            try {
                p.owner.callbacks.dispose.call(p.owner.receiver, p.context);
                ++change.cleaned;
            } catch (error) {
                record(change, error);
            }
            // Disposal can reject and swallow a neutral identity/raw reentry. Preserve that
            // failure while still independently attempting every remaining owner cleanup.
            try {
                change.coverage?.assertValid();
            } catch (error) {
                record(change, error);
            }
        }
    }
    #finish(change: Change, phase: 'committed' | 'cancelled'): void {
        if (change.failed) throw change.primary;
        change.coverage?.assertValid();
        change.phase = phase;
        change.terminal = true;
        change.roster.ticket = undefined;
    }
    #run(change: Change, phase: Change['phase'] | undefined, action: () => void): void {
        this.#idle();
        if (change.terminal) throw new Error('Material value ticket is terminal.');
        this.#busy = change;
        try {
            this.#check(change);
            if (phase && change.phase !== phase) throw new Error('Material ticket phase mismatch.');
            action();
            if (!change.terminal) this.#check(change);
        } catch (error) {
            record(change, error);
            if (change.effectsEntered) {
                try {
                    this.#readActual(change);
                } catch (actualError) {
                    record(change, actualError);
                }
                this.#notifyFault(change);
            }
            const failuresBeforeCleanup = change.secondary.length;
            this.#release(change);
            if (change.released !== change.cleaned || change.secondary.length !== failuresBeforeCleanup)
                this.#notifyFault(change);
            change.phase = 'failed';
            change.terminal = true;
            change.roster.ticket = undefined;
            throw change.primary;
        } finally {
            this.#busy = undefined;
        }
    }
}
