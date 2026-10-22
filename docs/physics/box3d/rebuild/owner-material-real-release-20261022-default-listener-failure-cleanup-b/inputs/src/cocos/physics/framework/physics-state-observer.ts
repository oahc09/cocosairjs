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
/** Internal, opt-in JS state observation only. No engine wiring, native outcome
 * inference, global world lookup or public barrel. Trusted owners supply actual
 * barriers and validate physics support; this primitive cannot sandbox callbacks.
 */
export type PhysicsStateOperation =
    | 'collider-material-set'
    | 'collider-material-clone'
    | 'collider-material-initialize'
    | 'system-default-material-set'
    | 'material-values'
    | 'material-destroy'
    | 'system-enable'
    | 'system-auto-simulation';
export type PhysicsStateSnapshot =
    | Readonly<{ kind: 'collider-material'; material: object | null; shared: boolean }>
    | Readonly<{ kind: 'system-default-material'; material: object | null }>
    | Readonly<{ kind: 'material-values'; coefficients: readonly [number, number, number, number] }>
    | Readonly<{ kind: 'system-control'; enabled: boolean; autoSimulation: boolean }>;
export type PhysicsStateEffect =
    | 'clone-allocation-entered'
    | 'clone-returned'
    | 'delegate-entered'
    | 'delegate-returned'
    | 'listener-edit-entered'
    | 'listeners-complete'
    | 'cache-written'
    | 'event-emit-entered'
    | 'event-emit-returned';
export interface PhysicsStateChangeContext {
    readonly target: object;
    readonly operation: PhysicsStateOperation;
    readonly sequence: number;
}
export interface PhysicsStateFailure {
    readonly error: unknown;
    readonly secondaryErrors: readonly unknown[];
    readonly before: PhysicsStateSnapshot | null;
    readonly candidate: PhysicsStateSnapshot | null;
    readonly actual: PhysicsStateSnapshot | null;
    readonly effects: readonly PhysicsStateEffect[];
    readonly committedOwners: number;
    readonly commitCompleted: boolean;
    readonly actualRead: 'not-requested' | 'copied' | 'failed';
    readonly cleanupCompletedOwners: number;
    readonly cleanupUnresolvedOwners: number;
}
/** Registration copies all five methods before any open can occur. Each entered
 * open receives dispose even when open throws, so dispose must tolerate partial
 * acquisition. It releases temporary barriers, NOT this observer registration.
 * preflight must not perform native/configuration writes. Callback purity and
 * truthful effect/actual snapshots require a separately reviewed engine owner.
 */
export interface PhysicsStateObserver {
    open(context: Readonly<PhysicsStateChangeContext>): void;
    preflight(
        context: Readonly<PhysicsStateChangeContext>,
        before: PhysicsStateSnapshot,
        candidate: PhysicsStateSnapshot,
    ): void;
    commit(context: Readonly<PhysicsStateChangeContext>, actual: PhysicsStateSnapshot): void;
    fail(context: Readonly<PhysicsStateChangeContext>, failure: Readonly<PhysicsStateFailure>): void;
    dispose(context: Readonly<PhysicsStateChangeContext>): void;
}
export interface PhysicsStateObserverLease {
    dispose(): void;
}
export interface PhysicsStateDiagnostics extends PhysicsStateFailure {
    readonly phase: 'created' | 'prepared' | 'committed' | 'cancelled' | 'failed';
    /** Ticket is terminal; cleanupUnresolvedOwners separately reports failed cleanup. */
    readonly disposed: boolean;
    readonly sequence: number;
    readonly enteredOwners: number;
    readonly hasFailure: boolean;
}
export interface PhysicsStateChangeTicket {
    /** First opens every owner barrier, then reads/copies inputs once. begin itself opens nothing. */
    prepare(reader: () => Readonly<{ before: PhysicsStateSnapshot; candidate: PhysicsStateSnapshot }>): void;
    /** Only a caller-observed JS callsite fact. Never proof of native mutation. */
    effect(fact: PhysicsStateEffect): void;
    /** Read actual private cache independently, not the submitted candidate. */
    commit(actualReader: () => PhysicsStateSnapshot): void;
    /** Always throws the original/first failure, including undefined/null/0. */
    fail(error: unknown, actualReader?: () => PhysicsStateSnapshot): never;
    /** Repeated terminal disposal is safe. Abandoned effects are a failure. */
    dispose(): void;
    diagnostics(): Readonly<PhysicsStateDiagnostics>;
}
interface Errors {
    failed: boolean;
    primary: unknown;
    secondary: unknown[];
}
interface Owner {
    readonly receiver: PhysicsStateObserver;
    readonly callbacks: PhysicsStateObserver;
    readonly target: object;
    readonly identity: number;
    released: boolean;
}
interface Membership {
    readonly owners: Set<Owner>;
    ticket?: Change;
}
interface Change extends Errors {
    readonly context: Readonly<PhysicsStateChangeContext>;
    readonly membership: Membership;
    readonly roster: readonly Owner[];
    phase: PhysicsStateDiagnostics['phase'];
    terminal: boolean;
    entered: number;
    readonly released: Set<Owner>;
    notified: boolean;
    before: PhysicsStateSnapshot | null;
    candidate: PhysicsStateSnapshot | null;
    actual: PhysicsStateSnapshot | null;
    readonly effects: PhysicsStateEffect[];
    committedOwners: number;
    commitCompleted: boolean;
    actualRead: PhysicsStateFailure['actualRead'];
    cleanupCompletedOwners: number;
}
const operations = new Set<PhysicsStateOperation>([
    'collider-material-set',
    'collider-material-clone',
    'collider-material-initialize',
    'system-default-material-set',
    'material-values',
    'material-destroy',
    'system-enable',
    'system-auto-simulation',
]);
const effects = new Set<PhysicsStateEffect>([
    'clone-allocation-entered',
    'clone-returned',
    'delegate-entered',
    'delegate-returned',
    'listener-edit-entered',
    'listeners-complete',
    'cache-written',
    'event-emit-entered',
    'event-emit-returned',
]);
function record(errors: Errors, error: unknown): void {
    if (!errors.failed) {
        errors.failed = true;
        errors.primary = error;
    } else if (!Object.is(errors.primary, error)) errors.secondary.push(error);
}
function object(value: unknown): value is object {
    return value !== null && typeof value === 'object';
}
function expectedKind(operation: PhysicsStateOperation): PhysicsStateSnapshot['kind'] {
    if (operation.startsWith('collider-')) return 'collider-material';
    if (operation === 'system-default-material-set') return 'system-default-material';
    if (operation === 'material-values' || operation === 'material-destroy') return 'material-values';
    return 'system-control';
}
function copySnapshot(input: PhysicsStateSnapshot, operation: PhysicsStateOperation): PhysicsStateSnapshot {
    if (!object(input)) throw new TypeError('Physics state snapshot must be an object.');
    const kind = input.kind;
    if (kind !== expectedKind(operation)) throw new TypeError('Physics state snapshot kind does not match operation.');
    if (kind === 'collider-material' || kind === 'system-default-material') {
        const material = input.material;
        if (material !== null && !object(material)) throw new TypeError('Material must be an object identity or null.');
        if (kind === 'system-default-material') return Object.freeze({ kind, material });
        const shared = input.shared;
        if (typeof shared !== 'boolean') throw new TypeError('Shared material flag must be boolean.');
        return Object.freeze({ kind, material, shared });
    }
    if (kind === 'system-control') {
        const enabled = input.enabled;
        const autoSimulation = input.autoSimulation;
        if (typeof enabled !== 'boolean' || typeof autoSimulation !== 'boolean')
            throw new TypeError('System flags must be boolean.');
        return Object.freeze({ kind, enabled, autoSimulation });
    }
    const values = input.coefficients;
    if (!Array.isArray(values) || values.length !== 4)
        throw new TypeError('Material coefficients require four numbers.');
    const copied: [number, number, number, number] = [values[0], values[1], values[2], values[3]];
    if (copied.some((value) => typeof value !== 'number' || !Number.isFinite(value)))
        throw new TypeError('Material coefficients must be finite numbers.');
    return Object.freeze({ kind, coefficients: Object.freeze(copied) });
}
function failure(change: Change): Readonly<PhysicsStateFailure> {
    return Object.freeze({
        error: change.primary,
        secondaryErrors: Object.freeze([...change.secondary]),
        before: change.before,
        candidate: change.candidate,
        actual: change.actual,
        effects: Object.freeze([...change.effects]),
        committedOwners: change.committedOwners,
        commitCompleted: change.commitCompleted,
        actualRead: change.actualRead,
        cleanupCompletedOwners: change.cleanupCompletedOwners,
        cleanupUnresolvedOwners: change.released.size - change.cleanupCompletedOwners,
    });
}

/** Internal isolated registry for qualification. Production wrappers below share
 * one registry across owners of an actual object. Reduced counterLimit is an
 * internal test policy, copied once; never an app option or writable counter.
 */
export class PhysicsStateObserverRegistry {
    readonly #memberships = new WeakMap<object, Membership>();
    readonly #limit: number;
    #registrationSequence = 0;
    #changeSequence = 0;
    #active: Errors | undefined;
    constructor(qualification: Readonly<{ counterLimit?: number }> = {}) {
        const limit = qualification.counterLimit;
        this.#limit = limit === undefined ? Number.MAX_SAFE_INTEGER : limit;
        if (!Number.isSafeInteger(this.#limit) || this.#limit < 1)
            throw new TypeError('Observer counter limit must be a positive safe integer.');
    }
    #reject(message: string, target?: Change): never {
        const error = new Error(message);
        if (this.#active) record(this.#active, error);
        else if (target && !target.terminal) record(target, error);
        throw error;
    }
    #notActive(): void {
        if (this.#active) this.#reject('Physics state observer admission cannot re-enter.');
    }
    #check(change: Change): void {
        if (change.failed) throw change.primary;
        const current = this.#memberships.get(change.context.target);
        if (
            current !== change.membership ||
            current.ticket !== change ||
            current.owners.size !== change.roster.length ||
            change.roster.some((owner) => owner.released || !current.owners.has(owner))
        ) {
            throw new Error('Physics state observer roster changed.');
        }
    }
    register(target: object, observer: PhysicsStateObserver): PhysicsStateObserverLease {
        this.#notActive();
        if (!object(target)) throw new TypeError('Observer target must be an object identity.');
        const existing = this.#memberships.get(target);
        if (existing?.ticket) this.#reject('Cannot register while target change is open.', existing.ticket);
        if (this.#registrationSequence >= this.#limit) throw new RangeError('Observer registration counter exhausted.');
        const admission: Errors = { failed: false, primary: undefined, secondary: [] };
        this.#active = admission;
        let callbacks: PhysicsStateObserver;
        try {
            if (!object(observer)) throw new TypeError('Observer must contain five trusted callbacks.');
            const open = observer.open;
            const preflight = observer.preflight;
            const commit = observer.commit;
            const fail = observer.fail;
            const dispose = observer.dispose;
            if ([open, preflight, commit, fail, dispose].some((fn) => typeof fn !== 'function'))
                throw new TypeError('Observer requires five functions.');
            if (admission.failed) throw admission.primary;
            callbacks = Object.freeze({ open, preflight, commit, fail, dispose });
        } catch (error) {
            record(admission, error);
            throw admission.primary;
        } finally {
            this.#active = undefined;
        }
        const owner: Owner = {
            receiver: observer,
            callbacks,
            target,
            identity: ++this.#registrationSequence,
            released: false,
        };
        const membership = existing ?? { owners: new Set<Owner>() };
        const registry = this;
        const lease: PhysicsStateObserverLease = Object.freeze({
            dispose(): void {
                if (this !== lease) registry.#reject('Invalid observer lease receiver.');
                registry.#notActive();
                if (owner.released) return;
                if (membership.ticket)
                    registry.#reject('Cannot release observer while target change is open.', membership.ticket);
                membership.owners.delete(owner);
                owner.released = true;
                if (!membership.owners.size) registry.#memberships.delete(target);
            },
        });
        membership.owners.add(owner);
        this.#memberships.set(target, membership);
        return lease;
    }
    begin(target: object, operation: PhysicsStateOperation): PhysicsStateChangeTicket | undefined {
        this.#notActive();
        const membership = this.#memberships.get(target);
        if (!membership?.owners.size) return undefined; // No operation/snapshot inspection.
        if (membership.ticket) this.#reject('Target already has an open change.', membership.ticket);
        if (!operations.has(operation)) throw new TypeError('Unknown physics state operation.');
        if (this.#changeSequence >= this.#limit) throw new RangeError('Observer change counter exhausted.');
        const change: Change = {
            context: Object.freeze({ target, operation, sequence: ++this.#changeSequence }),
            membership,
            roster: Object.freeze([...membership.owners]),
            phase: 'created',
            terminal: false,
            entered: 0,
            released: new Set(),
            notified: false,
            before: null,
            candidate: null,
            actual: null,
            effects: [],
            committedOwners: 0,
            commitCompleted: false,
            actualRead: 'not-requested',
            cleanupCompletedOwners: 0,
            failed: false,
            primary: undefined,
            secondary: [],
        };
        membership.ticket = change;
        const registry = this;
        const receiver = (value: unknown): void => {
            if (value !== ticket) registry.#reject('Invalid physics state ticket receiver.');
        };
        const ticket: PhysicsStateChangeTicket = Object.freeze({
            prepare(reader: () => Readonly<{ before: PhysicsStateSnapshot; candidate: PhysicsStateSnapshot }>): void {
                receiver(this);
                registry.#run(change, 'created', () => {
                    for (const owner of change.roster) {
                        ++change.entered; // Cleanup also covers an open that throws.
                        owner.callbacks.open.call(owner.receiver, change.context);
                        registry.#check(change);
                    }
                    if (typeof reader !== 'function') throw new TypeError('Snapshot reader must be a function.');
                    const pair = reader();
                    registry.#check(change);
                    if (!object(pair)) throw new TypeError('Snapshot reader must return before/candidate.');
                    const before = copySnapshot(pair.before, operation);
                    registry.#check(change);
                    const candidate = copySnapshot(pair.candidate, operation);
                    registry.#check(change);
                    change.before = before;
                    change.candidate = candidate;
                    for (const owner of change.roster) {
                        owner.callbacks.preflight.call(owner.receiver, change.context, before, candidate);
                        registry.#check(change);
                    }
                    change.phase = 'prepared';
                });
            },
            effect(fact: PhysicsStateEffect): void {
                receiver(this);
                registry.#run(change, 'prepared', () => {
                    if (!effects.has(fact)) throw new TypeError('Unknown JS callsite effect.');
                    if (change.effects.length >= registry.#limit)
                        throw new RangeError('Observer effect counter exhausted.');
                    change.effects.push(fact);
                });
            },
            commit(actualReader: () => PhysicsStateSnapshot): void {
                receiver(this);
                registry.#run(change, 'prepared', () => {
                    if (typeof actualReader !== 'function')
                        throw new TypeError('Actual-cache reader must be a function.');
                    change.actualRead = 'failed';
                    const actual = copySnapshot(actualReader(), operation);
                    registry.#check(change);
                    change.actual = actual;
                    change.actualRead = 'copied';
                    registry.#check(change);
                    for (const owner of change.roster) {
                        owner.callbacks.commit.call(owner.receiver, change.context, change.actual);
                        ++change.committedOwners;
                        registry.#check(change);
                    }
                    change.commitCompleted = true;
                    registry.#finish(change, 'committed');
                });
            },
            fail(error: unknown, actualReader?: () => PhysicsStateSnapshot): never {
                receiver(this);
                registry.#run(change, undefined, () => {
                    record(change, error);
                    if (actualReader !== undefined) {
                        try {
                            if (typeof actualReader !== 'function')
                                throw new TypeError('Actual-cache reader must be a function.');
                            change.actualRead = 'failed';
                            change.actual = copySnapshot(actualReader(), operation);
                            change.actualRead = 'copied';
                        } catch (observationError) {
                            record(change, observationError);
                        }
                    }
                    throw change.primary;
                });
                throw new Error('Unreachable observer failure.');
            },
            dispose(): void {
                receiver(this);
                registry.#notActive();
                if (change.terminal) return;
                registry.#run(change, undefined, () => {
                    if (change.effects.length) throw new Error('Physics state change abandoned after JS effects.');
                    registry.#finish(change, 'cancelled');
                });
            },
            diagnostics(): Readonly<PhysicsStateDiagnostics> {
                receiver(this);
                return Object.freeze({
                    ...failure(change),
                    phase: change.phase,
                    disposed: change.terminal,
                    sequence: change.context.sequence,
                    enteredOwners: change.entered,
                    hasFailure: change.failed,
                });
            },
        });
        return ticket;
    }
    #run(change: Change, phase: Change['phase'] | undefined, action: () => void): void {
        this.#notActive();
        if (change.terminal) throw new Error('Physics state ticket is terminal.');
        this.#active = change;
        try {
            this.#check(change);
            if (phase && change.phase !== phase) throw new Error('Physics state ticket phase mismatch.');
            action();
            if (!change.terminal) this.#check(change);
        } catch (error) {
            record(change, error);
            this.#failAndRelease(change);
            throw change.primary;
        } finally {
            this.#active = undefined;
        }
    }
    #notify(change: Change): void {
        if (change.notified) return;
        change.notified = true;
        for (let i = 0; i < change.entered; ++i) {
            const owner = change.roster[i];
            try {
                owner.callbacks.fail.call(owner.receiver, change.context, failure(change));
            } catch (error) {
                record(change, error);
            }
        }
    }
    #release(change: Change): void {
        for (let i = 0; i < change.entered; ++i) {
            const owner = change.roster[i];
            if (change.released.has(owner)) continue;
            change.released.add(owner); // Never replay cleanup after an unknown callback outcome.
            try {
                owner.callbacks.dispose.call(owner.receiver, change.context);
                ++change.cleanupCompletedOwners;
            } catch (error) {
                record(change, error);
            }
        }
    }
    #close(change: Change): void {
        change.terminal = true;
        if (change.membership.ticket === change) change.membership.ticket = undefined;
    }
    #failAndRelease(change: Change): void {
        this.#notify(change);
        this.#release(change);
        change.phase = 'failed';
        this.#close(change);
    }
    #finish(change: Change, phase: 'committed' | 'cancelled'): void {
        this.#release(change);
        if (change.failed) {
            this.#failAndRelease(change);
            throw change.primary;
        }
        change.phase = phase;
        this.#close(change);
    }
}
const registry = new PhysicsStateObserverRegistry();
export function registerPhysicsStateObserver(
    target: object,
    observer: PhysicsStateObserver,
): PhysicsStateObserverLease {
    return registry.register(target, observer);
}
export function beginPhysicsStateChange(
    target: object,
    operation: PhysicsStateOperation,
): PhysicsStateChangeTicket | undefined {
    return registry.begin(target, operation);
}
