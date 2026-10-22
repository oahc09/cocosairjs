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
/** Private typed adapter over B0. No World/component wiring or native execution.
 * Registered trusted owners provide fencing, physics validation and the sole
 * copied-value delegate. These exports are intentionally absent from barrels.
 */
import { PhysicsStateObserverRegistry } from './physics-state-observer';
import type {
    PhysicsStateChangeContext,
    PhysicsStateChangeTicket,
    PhysicsStateEffect,
    PhysicsStateFailure,
    PhysicsStateSnapshot,
} from './physics-state-observer';

export type PhysicsMaterialOperation =
    | 'collider-material-set'
    | 'collider-material-clone'
    | 'collider-material-initialize'
    | 'system-default-material-set';
export type PhysicsMaterialIdentity = Extract<
    PhysicsStateSnapshot,
    { kind: 'collider-material' | 'system-default-material' }
>;
export interface PhysicsMaterialCandidate {
    readonly asset: object | null;
    /** friction, restitution, rollingFriction, spinningFriction; copied once. */
    readonly coefficients: readonly [number, number, number, number] | null;
}
export interface PhysicsMaterialDelegate {
    open(context: Readonly<PhysicsStateChangeContext>): void;
    /** Retain/guard a newly known identity before reading ANY of its coefficients. */
    protectCandidate(context: Readonly<PhysicsStateChangeContext>, asset: object): void;
    preflightCopied(context: Readonly<PhysicsStateChangeContext>, candidate: Readonly<PhysicsMaterialCandidate>): void;
    applyCopied(context: Readonly<PhysicsStateChangeContext>, candidate: Readonly<PhysicsMaterialCandidate>): void;
    commitActual(context: Readonly<PhysicsStateChangeContext>, actual: PhysicsMaterialIdentity): void;
    fail(context: Readonly<PhysicsStateChangeContext>, failure: Readonly<PhysicsStateFailure>): void;
    dispose(context: Readonly<PhysicsStateChangeContext>): void;
}
export interface PhysicsMaterialDelegateLease {
    dispose(): void;
}
export interface PhysicsMaterialChange {
    prepare(reader: () => Readonly<{ before: PhysicsMaterialIdentity; candidate: PhysicsMaterialIdentity }>): void;
    /** No execution callback or new candidate is accepted here. Exactly one delegate. */
    apply(): void;
    /** Clone allocation itself occurs at the original Cocos callsite under owner barriers. */
    acceptClone(asset: object): void;
    effect(fact: PhysicsStateEffect): void;
    commit(reader: () => PhysicsMaterialIdentity): void;
    fail(error: unknown, reader?: () => PhysicsMaterialIdentity): never;
    dispose(): void;
    diagnostics(): Readonly<{
        observer: ReturnType<PhysicsStateChangeTicket['diagnostics']>;
        delegateEntered: boolean;
        delegateReturned: boolean;
        cloneAccepted: boolean;
    }>;
}
interface Entry {
    readonly original: PhysicsMaterialDelegate;
    readonly copied: PhysicsMaterialDelegate;
    active?: Active;
}
interface Active {
    readonly operation: PhysicsMaterialOperation;
    readonly ticket: PhysicsStateChangeTicket;
    context?: Readonly<PhysicsStateChangeContext>;
    candidate?: Readonly<PhysicsMaterialCandidate>;
    clone: object | null;
    cloneAttempted: boolean;
    delegateEntered: boolean;
    delegateReturned: boolean;
    invoking: boolean;
    rejected: boolean;
    rejection: unknown;
}
const operations = new Set<PhysicsMaterialOperation>([
    'collider-material-set',
    'collider-material-clone',
    'collider-material-initialize',
    'system-default-material-set',
]);
function object(value: unknown): value is object {
    return value !== null && typeof value === 'object';
}
function copyFunctions(value: PhysicsMaterialDelegate): PhysicsMaterialDelegate {
    if (!object(value)) throw new TypeError('Material delegate must be an object.');
    const open = value.open;
    const protectCandidate = value.protectCandidate;
    const preflightCopied = value.preflightCopied;
    const applyCopied = value.applyCopied;
    const commitActual = value.commitActual;
    const fail = value.fail;
    const dispose = value.dispose;
    if (
        [open, protectCandidate, preflightCopied, applyCopied, commitActual, fail, dispose].some(
            (fn) => typeof fn !== 'function',
        )
    ) {
        throw new TypeError('Material delegate requires seven trusted functions.');
    }
    return Object.freeze({ open, protectCandidate, preflightCopied, applyCopied, commitActual, fail, dispose });
}
function copyIdentity(
    input: PhysicsMaterialIdentity,
    operation: PhysicsMaterialOperation,
    protect?: (asset: object) => void,
): PhysicsMaterialIdentity {
    if (!object(input)) throw new TypeError('Expected material cache identity.');
    const kind = input.kind;
    const expected = operation === 'system-default-material-set' ? 'system-default-material' : 'collider-material';
    if (kind !== expected) throw new TypeError('Material identity kind does not match operation.');
    const material = input.material;
    if (material !== null && !object(material)) throw new TypeError('Material must be object identity or null.');
    if (material) protect?.(material);
    if (kind === 'system-default-material') return Object.freeze({ kind, material });
    const shared = input.shared;
    if (typeof shared !== 'boolean') throw new TypeError('Material shared flag must be boolean.');
    return Object.freeze({ kind, material, shared });
}
function copyCandidate(asset: object | null): Readonly<PhysicsMaterialCandidate> {
    if (asset === null) return Object.freeze({ asset, coefficients: null });
    const values = asset as {
        friction: number;
        restitution: number;
        rollingFriction: number;
        spinningFriction: number;
    };
    const copied: [number, number, number, number] = [
        values.friction,
        values.restitution,
        values.rollingFriction,
        values.spinningFriction,
    ];
    if (copied.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
        throw new TypeError('Material coefficients must be finite numbers.');
    return Object.freeze({ asset, coefficients: Object.freeze(copied) });
}
function active(entry: Entry, context: Readonly<PhysicsStateChangeContext>): Active {
    const value = entry.active;
    if (!value || value.context !== context) throw new Error('Material transaction context is not current.');
    return value;
}
/** Isolated registry for pure controls. Production uses the single private instance below. */
export class PhysicsMaterialTransactionRegistry {
    readonly #observer = new PhysicsStateObserverRegistry();
    readonly #entries = new WeakMap<object, Entry>();
    register(target: object, delegate: PhysicsMaterialDelegate): PhysicsMaterialDelegateLease {
        const registry = this;
        let copied!: PhysicsMaterialDelegate;
        let entry!: Entry;
        // Function copying occurs INSIDE B0 registration admission, not before it.
        const observer = this.#observer.register(target, {
            get open() {
                if (registry.#entries.has(target)) throw new Error('Material target already has a physical delegate.');
                copied = copyFunctions(delegate);
                return (context: Readonly<PhysicsStateChangeContext>): void => {
                    const value = entry.active;
                    if (!value) throw new Error('No created material transaction.');
                    value.context = context;
                    copied.open.call(delegate, context);
                };
            },
            preflight(context): void {
                const value = active(entry, context);
                if (!value.candidate) throw new Error('Copied material candidate is missing.');
                copied.preflightCopied.call(delegate, context, value.candidate);
            },
            commit(context, actual): void {
                const value = active(entry, context);
                const expected = value.operation === 'collider-material-clone' ? value.clone : value.candidate?.asset;
                if (
                    (actual.kind !== 'collider-material' && actual.kind !== 'system-default-material') ||
                    actual.material !== expected
                ) {
                    throw new Error('Actual material cache differs from the completed candidate.');
                }
                copied.commitActual.call(delegate, context, actual);
            },
            fail(context, failure): void {
                copied.fail.call(delegate, context, failure);
            },
            dispose(context): void {
                try {
                    copied.dispose.call(delegate, context);
                } finally {
                    entry.active = undefined;
                }
            },
        });
        entry = { original: delegate, copied };
        this.#entries.set(target, entry);
        const lease: PhysicsMaterialDelegateLease = Object.freeze({
            dispose(): void {
                if (this !== lease) throw new Error('Invalid material delegate lease receiver.');
                observer.dispose();
                if (registry.#entries.get(target) === entry) registry.#entries.delete(target);
            },
        });
        return lease;
    }
    begin(target: object, operation: PhysicsMaterialOperation): PhysicsMaterialChange | undefined {
        // B0 admission is always first, including its no-observer fast path and reentry latch.
        const ticket = this.#observer.begin(target, operation);
        if (!ticket) return undefined;
        if (!operations.has(operation)) {
            ticket.dispose();
            throw new TypeError('Unknown material transaction operation.');
        }
        const entry = this.#entries.get(target)!;
        const state: Active = {
            operation,
            ticket,
            clone: null,
            cloneAttempted: false,
            delegateEntered: false,
            delegateReturned: false,
            invoking: false,
            rejected: false,
            rejection: undefined,
        };
        entry.active = state;
        const checkReceiver = (self: unknown): void => {
            if (self !== result) throw new Error('Invalid material transaction receiver.');
        };
        const rejectInvocation = (): void => {
            if (!state.invoking) return;
            const error = new Error('Material delegate cannot re-enter this change.');
            if (!state.rejected) {
                state.rejected = true;
                state.rejection = error;
            }
            throw error;
        };
        const unlink = (): void => {
            if (ticket.diagnostics().disposed && entry.active === state) entry.active = undefined;
        };
        const fail = (error: unknown, reader?: () => PhysicsMaterialIdentity): never => {
            const status = ticket.diagnostics();
            if (status.disposed) throw status.hasFailure ? status.error : error;
            try {
                return ticket.fail(error, reader);
            } finally {
                unlink();
            }
        };
        const context = (): Readonly<PhysicsStateChangeContext> => {
            if (!state.context || ticket.diagnostics().phase !== 'prepared')
                throw new Error('Material change is not prepared.');
            return state.context;
        };
        const result: PhysicsMaterialChange = Object.freeze({
            prepare(
                reader: () => Readonly<{ before: PhysicsMaterialIdentity; candidate: PhysicsMaterialIdentity }>,
            ): void {
                checkReceiver(this);
                rejectInvocation();
                try {
                    ticket.prepare(() => {
                        if (typeof reader !== 'function')
                            throw new TypeError('Material prepare reader must be a function.');
                        const input = reader();
                        if (!object(input)) throw new TypeError('Material prepare reader must return identities.');
                        const before = copyIdentity(input.before, operation);
                        const candidate = copyIdentity(input.candidate, operation, (asset) => {
                            entry.copied.protectCandidate.call(entry.original, state.context!, asset);
                        });
                        state.candidate = copyCandidate(candidate.material);
                        return { before, candidate };
                    });
                } finally {
                    unlink();
                }
            },
            apply(): void {
                checkReceiver(this);
                rejectInvocation();
                try {
                    const c = context();
                    if (
                        operation === 'collider-material-clone' ||
                        operation === 'collider-material-initialize' ||
                        state.delegateEntered
                    ) {
                        throw new Error('This material change cannot invoke another native delegate.');
                    }
                    ticket.effect('delegate-entered');
                    state.delegateEntered = true; // Consumed BEFORE invoking any owner callback.
                    state.invoking = true;
                    let failed = false,
                        error: unknown;
                    try {
                        entry.copied.applyCopied.call(entry.original, c, state.candidate!);
                        state.delegateReturned = true;
                    } catch (caught) {
                        failed = true;
                        error = caught;
                    } finally {
                        state.invoking = false;
                    }
                    if (state.delegateReturned) ticket.effect('delegate-returned');
                    if (state.rejected) return fail(state.rejection);
                    if (failed) return fail(error);
                } catch (error) {
                    return fail(error);
                }
            },
            acceptClone(asset: object): void {
                checkReceiver(this);
                rejectInvocation();
                try {
                    const c = context();
                    if (
                        operation !== 'collider-material-clone' ||
                        state.cloneAttempted ||
                        !ticket.diagnostics().effects.includes('clone-allocation-entered')
                    )
                        throw new Error('Clone acceptance is not admitted.');
                    state.cloneAttempted = true;
                    if (!object(asset) || asset === state.candidate!.asset)
                        throw new TypeError('Expected a distinct actual cloned asset.');
                    entry.copied.protectCandidate.call(entry.original, c, asset);
                    const clone = copyCandidate(asset);
                    const expected = state.candidate!.coefficients;
                    if (
                        !expected ||
                        !clone.coefficients ||
                        clone.coefficients.some((v, i) => !Object.is(v, expected[i]))
                    ) {
                        throw new Error('Actual clone coefficients differ from the prepared source.');
                    }
                    state.clone = asset;
                    ticket.effect('clone-returned');
                } catch (error) {
                    return fail(error);
                }
            },
            effect(fact: PhysicsStateEffect): void {
                checkReceiver(this);
                rejectInvocation();
                try {
                    ticket.effect(fact);
                } finally {
                    unlink();
                }
            },
            commit(reader: () => PhysicsMaterialIdentity): void {
                checkReceiver(this);
                rejectInvocation();
                try {
                    if (
                        (operation === 'collider-material-clone' && state.clone === null) ||
                        ((operation === 'collider-material-set' || operation === 'system-default-material-set') &&
                            !state.delegateReturned)
                    ) {
                        throw new Error('Required material application has not completed.');
                    }
                    ticket.commit(reader);
                } catch (error) {
                    return fail(error);
                } finally {
                    unlink();
                }
            },
            fail(error: unknown, reader?: () => PhysicsMaterialIdentity): never {
                checkReceiver(this);
                rejectInvocation();
                return fail(error, reader);
            },
            dispose(): void {
                checkReceiver(this);
                rejectInvocation();
                try {
                    ticket.dispose();
                } finally {
                    unlink();
                }
            },
            diagnostics() {
                checkReceiver(this);
                return Object.freeze({
                    observer: ticket.diagnostics(),
                    delegateEntered: state.delegateEntered,
                    delegateReturned: state.delegateReturned,
                    cloneAccepted: state.clone !== null,
                });
            },
        });
        return result;
    }
}
const registry = new PhysicsMaterialTransactionRegistry();
export function registerPhysicsMaterialDelegate(
    target: object,
    delegate: PhysicsMaterialDelegate,
): PhysicsMaterialDelegateLease {
    return registry.register(target, delegate);
}
export function beginPhysicsMaterialChange(
    target: object,
    operation: PhysicsMaterialOperation,
): PhysicsMaterialChange | undefined {
    return registry.begin(target, operation);
}
