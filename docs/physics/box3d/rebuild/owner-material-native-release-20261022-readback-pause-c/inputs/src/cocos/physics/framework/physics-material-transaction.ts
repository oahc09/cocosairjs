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
export type PhysicsMaterialCleanupStage =
    'event-listener-clear' | 'material-off' | 'adapter-destroy' | 'bounds-destroy';
export interface PhysicsMaterialCleanupError {
    readonly stage: PhysicsMaterialCleanupStage;
    readonly error: unknown;
}
export interface PhysicsMaterialCleanupReport {
    readonly generation: number;
    readonly hasFailure: boolean;
    readonly firstError: unknown;
    readonly errors: readonly PhysicsMaterialCleanupError[];
}
export interface PhysicsMaterialCleanupDiagnostics {
    readonly consumed: boolean;
    readonly report: Readonly<PhysicsMaterialCleanupReport> | null;
    readonly copyFailed: boolean;
    readonly copyError: unknown;
    readonly deliveryAttempted: boolean;
    readonly deliveryReturned: boolean;
    readonly deliveryFailed: boolean;
    readonly deliveryError: unknown;
}
export interface PhysicsMaterialCleanupObserver {
    readonly generation: number;
    report(report: Readonly<PhysicsMaterialCleanupReport>): void;
}
/** A single post-release diagnostic submission, never physics or phase authority. */
export interface PhysicsMaterialCleanupReporter {
    complete(errors: readonly PhysicsMaterialCleanupError[]): void;
    diagnostics(): Readonly<PhysicsMaterialCleanupDiagnostics>;
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
        invocationErrors: readonly unknown[];
    }>;
}
interface Entry {
    readonly original: PhysicsMaterialDelegate;
    readonly copied: PhysicsMaterialDelegate;
    active?: Active;
    cleanup?: Readonly<PhysicsMaterialCleanupObserver>;
    cleanupCaptured?: boolean;
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
    readonly invocationErrors: unknown[];
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
    readonly #cleanupGenerations = new WeakMap<object, number>();
    readonly #cleanupReports = new WeakMap<object, PhysicsMaterialCleanupReporter>();
    register(
        target: object,
        delegate: PhysicsMaterialDelegate,
        cleanup?: PhysicsMaterialCleanupObserver,
    ): PhysicsMaterialDelegateLease {
        const registry = this;
        let copied!: PhysicsMaterialDelegate;
        let entry!: Entry;
        let copiedCleanup: Readonly<PhysicsMaterialCleanupObserver> | undefined;
        // Function copying occurs INSIDE B0 registration admission, not before it.
        const observer = this.#observer.register(target, {
            get open() {
                if (registry.#entries.has(target)) throw new Error('Material target already has a physical delegate.');
                copied = copyFunctions(delegate);
                if (cleanup !== undefined) {
                    if (!object(cleanup)) throw new TypeError('Expected cleanup observer.');
                    const generation = cleanup.generation;
                    const report = cleanup.report;
                    if (!Number.isSafeInteger(generation) || generation < 1 || typeof report !== 'function')
                        throw new TypeError(
                            'Cleanup generation must be a positive safe integer with a report function.',
                        );
                    const previous = registry.#cleanupGenerations.get(target);
                    if (previous !== undefined && generation <= previous)
                        throw new Error('Cleanup registration requires a new target generation.');
                    copiedCleanup = Object.freeze({ generation, report });
                }
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
        entry = { original: delegate, copied, cleanup: copiedCleanup };
        if (copiedCleanup) this.#cleanupGenerations.set(target, copiedCleanup.generation);
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
    /** Pure internal admission hint; register revalidates it before publishing. */
    nextCleanupGeneration(target: object): number {
        const previous = this.#cleanupGenerations.get(target) ?? 0;
        if (previous >= Number.MAX_SAFE_INTEGER) throw new RangeError('Cleanup generation exhausted.');
        return previous + 1;
    }
    /** Pins this target/delegate/generation once. No new capture after unregister. */
    captureCleanup(target: object): PhysicsMaterialCleanupReporter | undefined {
        const entry = this.#entries.get(target);
        if (!entry?.cleanup) return undefined;
        if (entry.cleanupCaptured) throw new Error('Cleanup completion was already captured for this generation.');
        entry.cleanupCaptured = true;
        const generation = entry.cleanup.generation;
        let deliver: PhysicsMaterialCleanupObserver['report'] | undefined = entry.cleanup.report;
        let consumed = false,
            copying = false,
            rejected = false;
        let rejection: unknown;
        let report: Readonly<PhysicsMaterialCleanupReport> | null = null;
        let copyFailed = false,
            copyError: unknown;
        let deliveryAttempted = false,
            deliveryReturned = false,
            deliveryFailed = false,
            deliveryError: unknown;
        const stages = new Set<PhysicsMaterialCleanupStage>([
            'event-listener-clear',
            'material-off',
            'adapter-destroy',
            'bounds-destroy',
        ]);
        const reporter: PhysicsMaterialCleanupReporter = Object.freeze({
            complete(errors: readonly PhysicsMaterialCleanupError[]): void {
                if (this !== reporter) throw new Error('Invalid cleanup reporter receiver.');
                if (consumed) {
                    const error = new Error('Cleanup completion is single use.');
                    if (copying && !rejected) {
                        rejected = true;
                        rejection = error;
                    }
                    throw error;
                }
                consumed = true; // consume BEFORE any caller-controlled property read
                copying = true;
                try {
                    if (!Array.isArray(errors)) throw new TypeError('Expected cleanup error array.');
                    const length = errors.length;
                    if (!Number.isSafeInteger(length) || length < 0 || length > 4096)
                        throw new RangeError('Cleanup report length must be an integer in [0, 4096].');
                    const rows: PhysicsMaterialCleanupError[] = [];
                    for (let i = 0; i < length; i++) {
                        const input: PhysicsMaterialCleanupError = errors[i];
                        if (!object(input)) throw new TypeError('Expected cleanup error record.');
                        const stage = input.stage,
                            error = input.error;
                        if (!stages.has(stage)) throw new TypeError('Unknown cleanup stage.');
                        rows.push(Object.freeze({ stage, error }));
                    }
                    if (rejected) throw rejection;
                    report = Object.freeze({
                        generation,
                        hasFailure: rows.length !== 0,
                        firstError: rows[0]?.error,
                        errors: Object.freeze(rows),
                    });
                } catch (error) {
                    copyFailed = true;
                    copyError = rejected ? rejection : error;
                    deliver = undefined;
                    throw copyError;
                } finally {
                    copying = false;
                }
                deliveryAttempted = true;
                const callback = deliver!;
                deliver = undefined;
                try {
                    callback(report);
                    deliveryReturned = true;
                } catch (error) {
                    deliveryFailed = true;
                    deliveryError = error;
                    throw error;
                }
            },
            diagnostics() {
                if (this !== reporter) throw new Error('Invalid cleanup reporter receiver.');
                return Object.freeze({
                    consumed,
                    report,
                    copyFailed,
                    copyError,
                    deliveryAttempted,
                    deliveryReturned,
                    deliveryFailed,
                    deliveryError,
                });
            },
        });
        this.#cleanupReports.set(target, reporter); // bounded: one latest record per weak target
        return reporter;
    }
    inspectCleanup(target: object): Readonly<PhysicsMaterialCleanupDiagnostics> | undefined {
        return this.#cleanupReports.get(target)?.diagnostics();
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
            invocationErrors: [],
        };
        entry.active = state;
        const checkReceiver = (self: unknown): void => {
            if (self !== result) throw new Error('Invalid material transaction receiver.');
        };
        const rejectInvocation = (): void => {
            if (!state.invoking) return;
            const error = new Error('Material delegate cannot re-enter this change.');
            state.invocationErrors.push(error);
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
                        if (state.rejected && !Object.is(caught, state.rejection)) state.invocationErrors.push(caught);
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
                    let clone: Readonly<PhysicsMaterialCandidate> | undefined;
                    let failed = false,
                        failure: unknown;
                    state.invoking = true;
                    try {
                        entry.copied.protectCandidate.call(entry.original, c, asset);
                        clone = copyCandidate(asset);
                    } catch (error) {
                        failed = true;
                        failure = error;
                        if (state.rejected && !Object.is(error, state.rejection)) state.invocationErrors.push(error);
                    } finally {
                        state.invoking = false;
                    }
                    if (state.rejected) return fail(state.rejection);
                    if (failed) return fail(failure);
                    const expected = state.candidate!.coefficients;
                    if (
                        !expected ||
                        !clone?.coefficients ||
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
                    invocationErrors: Object.freeze([...state.invocationErrors]),
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
    cleanup?: PhysicsMaterialCleanupObserver,
): PhysicsMaterialDelegateLease {
    return registry.register(target, delegate, cleanup);
}
export function beginPhysicsMaterialChange(
    target: object,
    operation: PhysicsMaterialOperation,
): PhysicsMaterialChange | undefined {
    return registry.begin(target, operation);
}

/** Private cleanup diagnostics remain readable after unregister; no mutation authority. */
export function capturePhysicsMaterialCleanup(target: object): PhysicsMaterialCleanupReporter | undefined {
    return registry.captureCleanup(target);
}
export function inspectPhysicsMaterialCleanup(target: object): Readonly<PhysicsMaterialCleanupDiagnostics> | undefined {
    return registry.inspectCleanup(target);
}

export function nextPhysicsMaterialCleanupGeneration(target: object): number {
    return registry.nextCleanupGeneration(target);
}
