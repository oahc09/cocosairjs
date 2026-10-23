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

import { isOriginalComponentActivityScheduler } from './component-scheduler';
import { isOriginalComponentActivityTimerScheduler } from '../core/scheduler';

/** Internal, opt-in, backend-neutral Component.enabled transaction seam.
 * No native object, public lifecycle event, or caller-supplied state is authority.
 * The Component constructor captures its own cache/source fields. These fields
 * are not ECMAScript-private; observed mismatches fail closed, not a tamperproof claim.
 * Owners retain their own mutation admission and native resource policy.
 */
export interface ActivityState {
    readonly enabled: boolean;
    readonly active: boolean;
    readonly scheduled: boolean;
}

export type ActivityPhase =
    | 'registration'
    | 'admit'
    | 'assert-entry'
    | 'open'
    | 'capture'
    | 'before'
    | 'prepare'
    | 'apply'
    | 'precommit'
    | 'perform'
    | 'callback'
    | 'delegate'
    | 'scheduler'
    | 'actual'
    | 'validate'
    | 'complete'
    | 'fail'
    | 'dispose';

export interface ActivityFailureReport {
    /** First thrown value, including undefined, null, false, zero, or empty string. */
    readonly error: unknown;
    readonly actual: ActivityState | null;
    readonly actualReadStatus: 'not-read' | 'read' | 'threw' | 'invalid';
    readonly schedulerUnchanged: boolean | null;
    /** Original setter closure entered. This does NOT prove that its cache changed. */
    readonly cacheWriteEntered: boolean;
    readonly callbackEntered: boolean;
    readonly callbackReturned: boolean;
    readonly schedulerEntered: boolean;
    readonly schedulerReturned: boolean;
    /** Plans whose apply method returned normally, not native-effect evidence. */
    readonly appliedCount: number;
    /** Includes an apply method that threw after possibly performing effects. */
    readonly applyEnteredCount: number;
    readonly phase: ActivityPhase;
}

export interface ActivityPlan {
    prepare(before: ActivityState, next: boolean): void;
    /** Always called after every prepare. Owners make ineffective changes a no-op. */
    apply(): void;
    /** Required exactly when the observer supplies delegateIdentity. */
    delegate?(): void;
    complete(actual: ActivityState): void;
    fail(report: ActivityFailureReport): void;
    dispose(): void;
}

export interface ComponentActivityObserver {
    readonly delegateIdentity?: object;
    /** Queue/owner admission only: do not publish state or install mutation fences. */
    admit(): void;
    /** Admission runs before any component source read. Context is an opaque identity. */
    open(context: object): ActivityPlan;
}

export interface ComponentActivityLease {
    dispose(): void;
}

type Method = (...args: any[]) => unknown;
type PlanMethod = 'prepare' | 'apply' | 'delegate' | 'complete' | 'fail' | 'dispose';
interface Registration {
    readonly component: object;
    readonly owner: object;
    readonly observer: ComponentActivityObserver;
    readonly admit: ComponentActivityObserver['admit'];
    readonly open: ComponentActivityObserver['open'];
    readonly delegateIdentity: object | undefined;
    readonly scheduler: object;
    readonly timerScheduler: object;
    disposed: boolean;
}
interface Participant {
    readonly registration: Registration;
    readonly receiver: object;
    readonly methods: Partial<Record<PlanMethod, Method>>;
    delegateEntered: boolean;
    delegateReturned: boolean;
}
interface Gate {
    phase: ActivityPhase;
    failed: boolean;
    error: unknown;
    failurePhase: ActivityPhase;
    failureRead: boolean;
    failures: number;
    readingComponentSource?: boolean;
    readingNodeSource?: boolean;
    ticket?: Ticket;
}
interface Ticket {
    readonly component: object;
    readonly next: boolean;
    readonly source: () => ActivityState;
    scheduler?: object;
    schedulerState?: unknown;
    schedulerSource?: SchedulerSource;
    readonly participants: Participant[];
    before: ActivityState | null;
    actual: ActivityState | null;
    actualReadStatus: ActivityFailureReport['actualReadStatus'];
    schedulerUnchanged: boolean | null;
    expectedCallback: boolean;
    cacheWriteEntered: boolean;
    callbackEntered: boolean;
    callbackReturned: boolean;
    schedulerEntered: boolean;
    schedulerReturned: boolean;
    appliedCount: number;
    applyEnteredCount: number;
}

interface ComponentSource {
    readonly read: () => ActivityState;
    readonly assertEntry: () => void;
    readonly perform: (next: boolean) => void;
    readonly readScheduler: () => object;
}
const sources = new WeakMap<object, ComponentSource>();
const nodeSources = new WeakMap<object, () => boolean>();
interface SchedulerSource {
    readTimerScheduler(): object;
    capture(component: object): unknown;
    run(component: object, enabled: boolean, before: unknown, invoke: (callback: () => void, complete: () => void) => void): void;
    verify(component: object, enabled: boolean | null, before: unknown): void;
}
export interface ActivityTimerState {
    readonly containerIdentities: readonly object[];
    readonly timerIdentity: object | null;
    readonly timerPaused: boolean | null;
    readonly updateIdentity: object | null;
    readonly updateEntryIdentity: object | null;
    readonly updatePaused: boolean | null;
}
const schedulerSources = new WeakMap<object, SchedulerSource>();
const timerSources = new WeakMap<object, (component: object) => ActivityTimerState>();

/** Core Scheduler installs only a copied target-state reader, never an entry or function getter. */
export function installComponentActivityTimerSource(scheduler: object, read: (component: object) => ActivityTimerState): void {
    rejectReentry();
    if (!isIdentity(scheduler) || !isOriginalComponentActivityTimerScheduler(scheduler) ||
        typeof read !== 'function' || timerSources.has(scheduler))
        throw new Error('Component activity timer source is invalid or already installed.');
    timerSources.set(scheduler, read);
}

export function readComponentActivityTimerState(scheduler: object, component: object): ActivityTimerState {
    const gate = active;
    if (!gate || gate.ticket?.component !== component)
        throw new Error('Component activity timer read requires its exact active component ticket.');
    checkpoint(gate);
    if (!['before', 'precommit', 'perform', 'scheduler', 'actual'].includes(gate.phase))
        reject(gate, 'Component activity timer read has the wrong phase.');
    const source = timerSources.get(scheduler);
    if (!source) reject(gate, 'Component activity timer Scheduler is not registered.');
    const raw = invoke(source, undefined, [component]) as ActivityTimerState;
    const containers = raw.containerIdentities;
    if (!Array.isArray(containers) || containers.length !== 6 || containers.some((entry) => !isIdentity(entry)))
        reject(gate, 'Component activity timer containers are invalid.');
    const state = Object.freeze({ containerIdentities: Object.freeze(Array.from(containers)), timerIdentity: raw.timerIdentity, timerPaused: raw.timerPaused,
        updateIdentity: raw.updateIdentity, updateEntryIdentity: raw.updateEntryIdentity, updatePaused: raw.updatePaused });
    checkpoint(gate);
    if ((state.timerIdentity === null ? state.timerPaused !== null : !isIdentity(state.timerIdentity) || typeof state.timerPaused !== 'boolean') ||
        (state.updateIdentity === null ? state.updateEntryIdentity !== null || state.updatePaused !== null :
            !isIdentity(state.updateIdentity) || !isIdentity(state.updateEntryIdentity) || typeof state.updatePaused !== 'boolean'))
        reject(gate, 'Component activity timer state is invalid.');
    return state;
}
const delegateSources = new WeakMap<object, object>();

/** Installed only by the original adapter constructor; never returns its secret. */
export function installComponentActivityDelegateSource(adapter: object, secret: object): void {
    rejectReentry();
    if (!isIdentity(adapter) || !isIdentity(secret) || delegateSources.has(adapter))
        throw new Error('Component activity delegate source is invalid or already installed.');
    delegateSources.set(adapter, secret);
}

/** Original scheduler captures run/completion once; neither capability is returned. */
export function installComponentActivitySchedulerSource(scheduler: object, source: SchedulerSource): void {
    enter('registration', (gate) => {
        if (!isIdentity(scheduler) || !isOriginalComponentActivityScheduler(scheduler) ||
            !isIdentity(source) || schedulerSources.has(scheduler))
            throw new Error('Component activity scheduler source is invalid or already installed.');
        const capture = source.capture, run = source.run, verify = source.verify, readTimerScheduler = source.readTimerScheduler;
        checkpoint(gate);
        if ([capture, run, verify, readTimerScheduler].some((fn) => typeof fn !== 'function'))
            throw new Error('Component activity scheduler source requires original controls.');
        schedulerSources.set(scheduler, Object.freeze({ capture, run, verify, readTimerScheduler }));
    });
}

export function runComponentActivityScheduler(component: object, scheduler: object, enabled: boolean): void {
    const gate = active;
    if (!gate || !gate.ticket) throw new Error('Component activity has no current setter authority.');
    checkpoint(gate);
    if (gate.phase !== 'perform' || gate.ticket.component !== component || gate.ticket.next !== enabled)
        reject(gate, 'Component activity scheduler has a foreign component or phase.');
    const source = schedulerSources.get(scheduler);
    if (!source || gate.ticket.scheduler !== scheduler || gate.ticket.schedulerSource !== source)
        reject(gate, 'Component activity scheduler is not the exact admitted instance.');
    // The callback and completion originate inside the captured constructor closure.
    invoke(source.run, undefined, [component, enabled, gate.ticket.schedulerState, (callback: () => void, complete: () => void): void => {
        runSchedulerTicket(component, enabled, callback, complete);
    }]);
    checkpoint(gate);
}
const observers = new WeakMap<object, Set<Registration>>();
const invoke = Reflect.apply;
let active: Gate | undefined;

function isIdentity(value: unknown): value is object {
    return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function remember(gate: Gate, error: unknown): void {
    ++gate.failures;
    if (gate.failed) return;
    gate.failed = true;
    gate.error = error;
    gate.failurePhase = gate.phase;
}

function reject(gate: Gate, message: string): never {
    const error = new Error(message);
    remember(gate, error);
    throw error;
}

function checkpoint(gate: Gate): void {
    if (gate.failed && !gate.failureRead) throw gate.error;
}

function rejectReentry(): void {
    if (active) reject(active, 'Component activity control cannot re-enter an active operation.');
}

function enter<T>(phase: ActivityPhase, action: (gate: Gate) => T): T {
    rejectReentry();
    const gate: Gate = { phase, failed: false, error: undefined, failurePhase: phase, failureRead: false, failures: 0 };
    active = gate;
    try {
        const result = action(gate);
        checkpoint(gate);
        return result;
    } finally {
        active = undefined;
    }
}

/** Install once, using a closure created by Component's original constructor.
 * Registration cannot replace this source, and the source is never put on a plan.
 */
export function installComponentActivitySource(
    component: object,
    source: () => ActivityState,
    assertEntry: () => void,
    perform: (next: boolean) => void,
    readScheduler: () => object,
): void {
    rejectReentry();
    if (!isIdentity(component) || typeof source !== 'function' || typeof assertEntry !== 'function' || typeof perform !== 'function' || typeof readScheduler !== 'function') {
        throw new TypeError('Component activity source requires an identity, source, and entry assertion.');
    }
    if (sources.has(component)) throw new Error('Component activity source is already installed.');
    sources.set(component, Object.freeze({ read: source, assertEntry, perform, readScheduler }));
}

/** Original Node constructor captures its protected _activeInHierarchy field. */
export function installComponentActivityNodeSource(node: object, readActive: () => boolean): void {
    rejectReentry();
    if (!isIdentity(node) || typeof readActive !== 'function') {
        throw new TypeError('Component activity Node source requires an identity and a function.');
    }
    if (nodeSources.has(node)) throw new Error('Component activity Node source is already installed.');
    nodeSources.set(node, readActive);
}

/** No replaceable public Node getter is consulted. Component's source handles
 * its legitimate null-node state before invoking this non-null identity reader.
 */
export function readComponentActivityNodeActive(node: object): boolean {
    const read = (gate: Gate): boolean => {
        if (gate.readingNodeSource) reject(gate, 'Component activity Node source cannot recursively read.');
        const source = isIdentity(node) ? nodeSources.get(node) : undefined;
        if (!source) reject(gate, 'Component activity Node has no installed source.');
        gate.readingNodeSource = true;
        try {
            const result = invoke(source, undefined, []);
            // A failure snapshot may read the original cache after a latched error.
            if (!gate.failed) checkpoint(gate);
            if (typeof result !== 'boolean') throw new TypeError('Component activity Node source must be boolean.');
            return result;
        } catch (error) {
            remember(gate, error);
            throw gate.error;
        } finally {
            gate.readingNodeSource = false;
        }
    };
    if (!active) return enter('before', read);
    if (!active.readingComponentSource && active.phase !== 'perform' && active.phase !== 'callback')
        reject(active, 'Component activity Node source was read outside original source control.');
    return read(active);
}

export function registerComponentActivityObserver(
    component: object,
    ownerIdentity: object,
    observer: ComponentActivityObserver,
): ComponentActivityLease {
    return enter('registration', (gate) => {
        if (!isIdentity(component) || !isIdentity(ownerIdentity) || !isIdentity(observer)) {
            throw new TypeError('Component activity registration requires object identities.');
        }
        const componentSource = sources.get(component);
        if (!componentSource) throw new Error('Component activity source is not installed.');
        const scheduler = invoke(componentSource.readScheduler, undefined, []) as object;
        const schedulerSource = schedulerSources.get(scheduler);
        if (!schedulerSource) throw new Error('Component activity has no original scheduler at owner registration.');
        const timerScheduler = invoke(schedulerSource.readTimerScheduler, undefined, []) as object;
        if (!timerSources.has(timerScheduler)) throw new Error('Component activity has no original timer Scheduler at owner registration.');
        checkpoint(gate);
        // Read once under the global gate, before any registration is published.
        const admit = observer.admit;
        const open = observer.open;
        const delegateIdentity = observer.delegateIdentity;
        checkpoint(gate);
        if (
            typeof admit !== 'function' ||
            typeof open !== 'function' ||
            (delegateIdentity !== undefined && !isIdentity(delegateIdentity))
        ) {
            throw new TypeError('Component activity observer has invalid callbacks or delegate identity.');
        }
        if (invoke(componentSource.readScheduler, undefined, []) !== scheduler ||
            invoke(schedulerSource.readTimerScheduler, undefined, []) !== timerScheduler)
            reject(gate, 'Component scheduler pair changed during owner registration.');
        const existing = observers.get(component);
        for (const other of existing || []) {
            if (other.scheduler !== scheduler || other.timerScheduler !== timerScheduler)
                reject(gate, 'Component activity owners disagree on their scheduler generation.');
            if (other.owner === ownerIdentity) throw new Error('Component activity owner is already registered.');
            if (delegateIdentity !== undefined && other.delegateIdentity === delegateIdentity) {
                throw new Error('Component activity delegate is already registered.');
            }
        }
        const registration: Registration = {
            component,
            owner: ownerIdentity,
            observer,
            admit,
            open,
            delegateIdentity,
            scheduler,
            timerScheduler,
            disposed: false,
        };
        const lease = Object.freeze({
            dispose(): void {
                rejectReentry();
                if (registration.disposed) return;
                registration.disposed = true;
                const current = observers.get(component);
                current?.delete(registration);
                if (current?.size === 0) observers.delete(component);
            },
        });
        if (existing) existing.add(registration);
        else observers.set(component, new Set([registration]));
        return lease;
    });
}

function assertSchedulerPair(source: ComponentSource, registration: Registration, gate: Gate): void {
    const scheduler = invoke(source.readScheduler, undefined, []) as object;
    const schedulerSource = schedulerSources.get(scheduler);
    if (scheduler !== registration.scheduler || !schedulerSource ||
        invoke(schedulerSource.readTimerScheduler, undefined, []) !== registration.timerScheduler)
        reject(gate, 'Live component scheduler rebinding requires an ownership transaction.');
    checkpoint(gate);
}

function readState(ticket: Ticket, gate: Gate, actual: boolean): ActivityState {
    let raw: ActivityState;
    try {
        gate.readingComponentSource = true;
        raw = invoke(ticket.source, undefined, []);
    } catch (error) {
        if (actual) ticket.actualReadStatus = 'threw';
        throw error;
    } finally {
        gate.readingComponentSource = false;
    }
    let enabled: boolean;
    let nodeActive: boolean;
    let scheduled: boolean;
    try {
        if (!isIdentity(raw)) throw new TypeError('Component activity source must return an object.');
        enabled = raw.enabled;
        nodeActive = raw.active;
        scheduled = raw.scheduled;
    } catch (error) {
        if (actual) ticket.actualReadStatus = 'threw';
        throw error;
    }
    if (typeof enabled !== 'boolean' || typeof nodeActive !== 'boolean' || typeof scheduled !== 'boolean') {
        if (actual) ticket.actualReadStatus = 'invalid';
        throw new TypeError('Component activity source fields must be booleans.');
    }
    const state = Object.freeze({ enabled, active: nodeActive, scheduled });
    if (actual) {
        ticket.actual = state;
        ticket.actualReadStatus = 'read';
    }
    checkpoint(gate);
    return state;
}

function capturePlan(ticket: Ticket, registration: Registration, value: unknown, gate: Gate): void {
    if (!isIdentity(value)) throw new TypeError('Component activity open must return a plan object.');
    const participant: Participant = {
        registration,
        receiver: value,
        methods: {},
        delegateEntered: false,
        delegateReturned: false,
    };
    ticket.participants.push(participant);
    // Capture cleanup independently even if another getter throws. Partial plans
    // can only be cleaned through the valid cleanup methods they actually supply.
    const names: PlanMethod[] = ['fail', 'dispose', 'prepare', 'apply', 'delegate', 'complete'];
    for (const name of names) {
        try {
            const method = (value as unknown as ActivityPlan)[name];
            if (name === 'delegate' && method === undefined && registration.delegateIdentity === undefined) continue;
            if (typeof method !== 'function') throw new TypeError(`Component activity plan requires ${name}().`);
            participant.methods[name] = method;
        } catch (error) {
            remember(gate, error);
        }
    }
    checkpoint(gate);
}

function callPlan(participant: Participant, name: PlanMethod, args: unknown[], gate: Gate): void {
    invoke(participant.methods[name]!, participant.receiver, args);
    checkpoint(gate);
}

function sameState(left: ActivityState, right: ActivityState): boolean {
    return left.enabled === right.enabled && left.active === right.active && left.scheduled === right.scheduled;
}

function validateActual(ticket: Ticket, gate: Gate): void {
    const before = ticket.before!;
    const actual = ticket.actual!;
    const changed = before.enabled !== ticket.next;
    const expectedScheduled = before.active && changed ? ticket.next : before.scheduled;
    if (actual.enabled !== ticket.next || actual.active !== before.active || actual.scheduled !== expectedScheduled) {
        reject(gate, 'Component activity actual state does not agree with the admitted setter.');
    }
    if (
        ticket.callbackEntered !== ticket.expectedCallback ||
        ticket.callbackReturned !== ticket.expectedCallback ||
        ticket.schedulerEntered !== ticket.expectedCallback ||
        ticket.schedulerReturned !== ticket.expectedCallback
    ) {
        reject(gate, 'Component activity callback or scheduler did not complete exactly once.');
    }
    for (const participant of ticket.participants) {
        const expected = ticket.expectedCallback && participant.registration.delegateIdentity !== undefined;
        if (participant.delegateEntered !== expected || participant.delegateReturned !== expected) {
            reject(gate, 'Component activity delegate did not complete exactly once.');
        }
    }
}

function reportFailure(ticket: Ticket, gate: Gate): void {
    const report: ActivityFailureReport = Object.freeze({
        error: gate.error,
        actual: ticket.actual,
        actualReadStatus: ticket.actualReadStatus,
        schedulerUnchanged: ticket.schedulerUnchanged,
        cacheWriteEntered: ticket.cacheWriteEntered,
        callbackEntered: ticket.callbackEntered,
        callbackReturned: ticket.callbackReturned,
        schedulerEntered: ticket.schedulerEntered,
        schedulerReturned: ticket.schedulerReturned,
        appliedCount: ticket.appliedCount,
        applyEnteredCount: ticket.applyEnteredCount,
        phase: gate.failurePhase,
    });
    gate.phase = 'fail';
    for (const participant of ticket.participants) {
        if (!participant.methods.fail) continue;
        try {
            invoke(participant.methods.fail, participant.receiver, [report]);
        } catch (error) {
            remember(gate, error);
        }
    }
}

/** False is the untouched legacy fast path: no input coercion, source read, or
 * perform invocation. A nested call during an observed operation always rejects,
 * even for another unobserved component, so a swallowed rejection cannot commit.
 */
export function trySetComponentEnabled(
    component: object,
    next: unknown,
): boolean {
    rejectReentry();
    const registrations = observers.get(component);
    if (!registrations?.size) return false;
    return enter('admit', (gate) => {
        const source = sources.get(component)!;
        for (const registration of registrations) {
            invoke(registration.admit, registration.observer, []);
            checkpoint(gate);
        }
        for (const registration of registrations) assertSchedulerPair(source, registration, gate);
        gate.phase = 'assert-entry';
        invoke(source.assertEntry, undefined, []);
        checkpoint(gate);
        if (typeof next !== 'boolean') {
            throw new TypeError('Observed Component.enabled requires a boolean and its original setter closure.');
        }
        const ticket: Ticket = {
            component,
            next,
            source: source.read,
            participants: [],
            before: null,
            actual: null,
            actualReadStatus: 'not-read',
            schedulerUnchanged: null,
            expectedCallback: false,
            cacheWriteEntered: false,
            callbackEntered: false,
            callbackReturned: false,
            schedulerEntered: false,
            schedulerReturned: false,
            appliedCount: 0,
            applyEnteredCount: 0,
        };
        gate.ticket = ticket;
        const context = Object.freeze({});
        try {
            // Open every owner before taking any source snapshot. No state or
            // delegate capability is exposed on the shared opaque context.
            for (const registration of registrations) {
                gate.phase = 'open';
                const plan = invoke(registration.open, registration.observer, [context]);
                gate.phase = 'capture';
                capturePlan(ticket, registration, plan, gate);
            }
            gate.phase = 'before';
            const before = readState(ticket, gate, false);
            ticket.before = before;
            const scheduler = invoke(source.readScheduler, undefined, []) as object;
            checkpoint(gate);
            const schedulerSource = schedulerSources.get(scheduler);
            if (!schedulerSource) reject(gate, 'Component source has no original scheduler identity.');
            ticket.scheduler = scheduler;
            ticket.schedulerSource = schedulerSource;
            ticket.schedulerState = invoke(schedulerSource.capture, undefined, [component]);
            checkpoint(gate);
            ticket.expectedCallback = before.active && before.enabled !== next && before.scheduled !== next;
            gate.phase = 'prepare';
            for (const participant of ticket.participants) callPlan(participant, 'prepare', [before, next], gate);
            gate.phase = 'apply';
            for (const participant of ticket.participants) {
                ++ticket.applyEnteredCount;
                invoke(participant.methods.apply!, participant.receiver, []);
                ++ticket.appliedCount;
                checkpoint(gate);
            }
            gate.phase = 'precommit';
            for (const registration of registrations) assertSchedulerPair(source, registration, gate);
            if (invoke(source.readScheduler, undefined, []) !== ticket.scheduler)
                reject(gate, 'Component scheduler changed after admission.');
            invoke(ticket.schedulerSource!.verify, undefined, [component, null, ticket.schedulerState]);
            checkpoint(gate);
            if (!sameState(before, readState(ticket, gate, false))) {
                reject(gate, 'Component activity source changed during admission or preparation.');
            }
            gate.phase = 'perform';
            ticket.cacheWriteEntered = true;
            invoke(source.perform, undefined, [next]);
            checkpoint(gate);
            gate.phase = 'actual';
            for (const registration of registrations) assertSchedulerPair(source, registration, gate);
            if (invoke(source.readScheduler, undefined, []) !== ticket.scheduler)
                reject(gate, 'Component scheduler changed during publication.');
            invoke(ticket.schedulerSource!.verify, undefined, [component, ticket.expectedCallback ? next : null, ticket.schedulerState]);
            checkpoint(gate);
            readState(ticket, gate, true);
            gate.phase = 'validate';
            validateActual(ticket, gate);
            gate.phase = 'complete';
            for (const participant of ticket.participants) callPlan(participant, 'complete', [ticket.actual!], gate);
        } catch (error) {
            remember(gate, error);
        }
        if (gate.failed) {
            gate.phase = 'actual';
            const failures = gate.failures;
            gate.failureRead = true;
            try {
                // Preserve the first error while independently copying actual source facts.
                readState(ticket, gate, true);
                if (ticket.schedulerSource) {
                    for (const registration of registrations) assertSchedulerPair(source, registration, gate);
                    if (invoke(source.readScheduler, undefined, []) !== ticket.scheduler)
                        throw new Error('Component scheduler changed on a failed operation.');
                    invoke(ticket.schedulerSource.verify, undefined, [component, null, ticket.schedulerState]);
                    ticket.schedulerUnchanged = gate.failures === failures;
                }
            } catch (error) {
                if (ticket.schedulerSource) ticket.schedulerUnchanged = false;
                remember(gate, error);
            } finally {
                gate.failureRead = false;
            }
            if (gate.failures !== failures && ticket.schedulerSource) ticket.schedulerUnchanged = false;
        }
        const alreadyReported = gate.failed;
        if (alreadyReported) reportFailure(ticket, gate);
        gate.phase = 'dispose';
        for (const participant of ticket.participants) {
            if (!participant.methods.dispose) continue;
            try {
                invoke(participant.methods.dispose, participant.receiver, []);
            } catch (error) {
                remember(gate, error);
            }
        }
        // Even a cleanup failure reaches every valid fail callback, without
        // retrying dispose or pretending that earlier native effects rolled back.
        if (!alreadyReported && gate.failed) reportFailure(ticket, gate);
        checkpoint(gate);
        return true;
    });
}

/** Called by the original scheduler before its legacy callback path. Observed
 * callbacks run directly, not through NODEJS/EDITOR exception-swallowing functors.
 * complete is the original _onEnabled/_onDisabled closure, not an emitted event.
 */
function runSchedulerTicket(
    component: object,
    enabled: boolean,
    callback: () => void,
    complete: () => void,
): boolean {
    const gate = active;
    if (!gate) return false;
    const ticket = gate.ticket;
    if (!ticket) reject(gate, 'Component activity scheduler cannot enter during registration.');
    checkpoint(gate);
    if (
        gate.phase !== 'perform' ||
        ticket.component !== component ||
        ticket.next !== enabled ||
        !ticket.expectedCallback ||
        ticket.callbackEntered ||
        typeof callback !== 'function' ||
        typeof complete !== 'function'
    ) {
        reject(gate, 'Component activity scheduler has the wrong receiver, kind, phase, or generation.');
    }
    try {
        gate.phase = 'callback';
        ticket.callbackEntered = true;
        invoke(callback, undefined, []);
        ticket.callbackReturned = true;
        checkpoint(gate);
        for (const participant of ticket.participants) {
            if (participant.registration.delegateIdentity !== undefined && !participant.delegateReturned) {
                reject(gate, 'Component activity callback omitted its registered delegate.');
            }
        }
        gate.phase = 'scheduler';
        ticket.schedulerEntered = true;
        invoke(complete, undefined, []);
        ticket.schedulerReturned = true;
        checkpoint(gate);
    } catch (error) {
        remember(gate, error);
        throw gate.error;
    } finally {
        gate.phase = 'perform';
    }
    return true;
}

/** The adapter remains runtime-reachable; only its constructor-installed secret proves
 * original adapter invocation. The adapter identity alone grants no
 * ambient permission: the exact component, current callback, and kind must agree.
 * The plan's captured delegate is single-use and is never returned to callers.
 */
export function tryDelegateComponentActivity(component: object, adapterIdentity: object, secret: object, enabled: boolean): boolean {
    const gate = active;
    if (!gate) return false;
    const ticket = gate.ticket;
    if (!ticket) reject(gate, 'Component activity delegate cannot enter during registration.');
    checkpoint(gate);
    if (gate.phase !== 'callback' || ticket.component !== component || ticket.next !== enabled ||
        delegateSources.get(adapterIdentity) !== secret) {
        reject(gate, 'Component activity delegate has the wrong receiver, kind, or callback context.');
    }
    const participant = ticket.participants.find((entry) => entry.registration.delegateIdentity === adapterIdentity);
    if (
        !participant ||
        participant.registration.delegateIdentity === undefined ||
        participant.registration.disposed ||
        !observers.get(component)?.has(participant.registration) ||
        participant.delegateEntered
    ) {
        reject(gate, 'Component activity delegate is missing, duplicated, borrowed, or stale.');
    }
    try {
        gate.phase = 'delegate';
        participant.delegateEntered = true;
        invoke(participant.methods.delegate!, participant.receiver, []);
        participant.delegateReturned = true;
        checkpoint(gate);
    } catch (error) {
        remember(gate, error);
        throw gate.error;
    } finally {
        gate.phase = 'callback';
    }
    return true;
}
