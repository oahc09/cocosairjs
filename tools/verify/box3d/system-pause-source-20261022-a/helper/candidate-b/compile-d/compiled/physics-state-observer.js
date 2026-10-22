"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.beginPhysicsStateChange = exports.registerPhysicsStateObserver = exports.PhysicsStateObserverRegistry = void 0;
const operations = new Set([
    'collider-material-set',
    'collider-material-clone',
    'collider-material-initialize',
    'system-default-material-set',
    'material-values',
    'material-destroy',
    'system-enable',
    'system-auto-simulation',
]);
const effects = new Set([
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
function record(errors, error) {
    if (!errors.failed) {
        errors.failed = true;
        errors.primary = error;
    }
    else if (!Object.is(errors.primary, error))
        errors.secondary.push(error);
}
function object(value) {
    return value !== null && typeof value === 'object';
}
function expectedKind(operation) {
    if (operation.startsWith('collider-'))
        return 'collider-material';
    if (operation === 'system-default-material-set')
        return 'system-default-material';
    if (operation === 'material-values' || operation === 'material-destroy')
        return 'material-values';
    return 'system-control';
}
function copySnapshot(input, operation) {
    if (!object(input))
        throw new TypeError('Physics state snapshot must be an object.');
    const kind = input.kind;
    if (kind !== expectedKind(operation))
        throw new TypeError('Physics state snapshot kind does not match operation.');
    if (kind === 'collider-material' || kind === 'system-default-material') {
        const material = input.material;
        if (material !== null && !object(material))
            throw new TypeError('Material must be an object identity or null.');
        if (kind === 'system-default-material')
            return Object.freeze({ kind, material });
        const shared = input.shared;
        if (typeof shared !== 'boolean')
            throw new TypeError('Shared material flag must be boolean.');
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
    const copied = [values[0], values[1], values[2], values[3]];
    if (copied.some((value) => typeof value !== 'number' || !Number.isFinite(value)))
        throw new TypeError('Material coefficients must be finite numbers.');
    return Object.freeze({ kind, coefficients: Object.freeze(copied) });
}
function failure(change) {
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
class PhysicsStateObserverRegistry {
    #memberships = new WeakMap();
    #limit;
    #registrationSequence = 0;
    #changeSequence = 0;
    #active;
    constructor(qualification = {}) {
        const limit = qualification.counterLimit;
        this.#limit = limit === undefined ? Number.MAX_SAFE_INTEGER : limit;
        if (!Number.isSafeInteger(this.#limit) || this.#limit < 1)
            throw new TypeError('Observer counter limit must be a positive safe integer.');
    }
    #reject(message, target) {
        const error = new Error(message);
        if (this.#active)
            record(this.#active, error);
        else if (target && !target.terminal)
            record(target, error);
        throw error;
    }
    #notActive() {
        if (this.#active)
            this.#reject('Physics state observer admission cannot re-enter.');
    }
    #check(change) {
        if (change.failed)
            throw change.primary;
        const current = this.#memberships.get(change.context.target);
        if (current !== change.membership ||
            current.ticket !== change ||
            current.owners.size !== change.roster.length ||
            change.roster.some((owner) => owner.released || !current.owners.has(owner))) {
            throw new Error('Physics state observer roster changed.');
        }
    }
    register(target, observer) {
        this.#notActive();
        if (!object(target))
            throw new TypeError('Observer target must be an object identity.');
        const existing = this.#memberships.get(target);
        if (existing?.ticket)
            this.#reject('Cannot register while target change is open.', existing.ticket);
        if (this.#registrationSequence >= this.#limit)
            throw new RangeError('Observer registration counter exhausted.');
        const admission = { failed: false, primary: undefined, secondary: [] };
        this.#active = admission;
        let callbacks;
        try {
            if (!object(observer))
                throw new TypeError('Observer must contain five trusted callbacks.');
            const open = observer.open;
            const preflight = observer.preflight;
            const commit = observer.commit;
            const fail = observer.fail;
            const dispose = observer.dispose;
            if ([open, preflight, commit, fail, dispose].some((fn) => typeof fn !== 'function'))
                throw new TypeError('Observer requires five functions.');
            if (admission.failed)
                throw admission.primary;
            callbacks = Object.freeze({ open, preflight, commit, fail, dispose });
        }
        catch (error) {
            record(admission, error);
            throw admission.primary;
        }
        finally {
            this.#active = undefined;
        }
        const owner = {
            receiver: observer,
            callbacks,
            target,
            identity: ++this.#registrationSequence,
            released: false,
        };
        const membership = existing ?? { owners: new Set() };
        const registry = this;
        const lease = Object.freeze({
            dispose() {
                if (this !== lease)
                    registry.#reject('Invalid observer lease receiver.');
                registry.#notActive();
                if (owner.released)
                    return;
                if (membership.ticket)
                    registry.#reject('Cannot release observer while target change is open.', membership.ticket);
                membership.owners.delete(owner);
                owner.released = true;
                if (!membership.owners.size)
                    registry.#memberships.delete(target);
            },
        });
        membership.owners.add(owner);
        this.#memberships.set(target, membership);
        return lease;
    }
    begin(target, operation) {
        this.#notActive();
        const membership = this.#memberships.get(target);
        if (!membership?.owners.size)
            return undefined; // No operation/snapshot inspection.
        if (membership.ticket)
            this.#reject('Target already has an open change.', membership.ticket);
        if (!operations.has(operation))
            throw new TypeError('Unknown physics state operation.');
        if (this.#changeSequence >= this.#limit)
            throw new RangeError('Observer change counter exhausted.');
        const change = {
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
        const receiver = (value) => {
            if (value !== ticket)
                registry.#reject('Invalid physics state ticket receiver.');
        };
        const ticket = Object.freeze({
            prepare(reader) {
                receiver(this);
                registry.#run(change, 'created', () => {
                    for (const owner of change.roster) {
                        ++change.entered; // Cleanup also covers an open that throws.
                        owner.callbacks.open.call(owner.receiver, change.context);
                        registry.#check(change);
                    }
                    if (typeof reader !== 'function')
                        throw new TypeError('Snapshot reader must be a function.');
                    const pair = reader();
                    registry.#check(change);
                    if (!object(pair))
                        throw new TypeError('Snapshot reader must return before/candidate.');
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
            effect(fact) {
                receiver(this);
                registry.#run(change, 'prepared', () => {
                    if (!effects.has(fact))
                        throw new TypeError('Unknown JS callsite effect.');
                    if (change.effects.length >= registry.#limit)
                        throw new RangeError('Observer effect counter exhausted.');
                    change.effects.push(fact);
                });
            },
            commit(actualReader) {
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
            fail(error, actualReader) {
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
                        }
                        catch (observationError) {
                            record(change, observationError);
                        }
                    }
                    throw change.primary;
                });
                throw new Error('Unreachable observer failure.');
            },
            dispose() {
                receiver(this);
                registry.#notActive();
                if (change.terminal)
                    return;
                registry.#run(change, undefined, () => {
                    if (change.effects.length)
                        throw new Error('Physics state change abandoned after JS effects.');
                    registry.#finish(change, 'cancelled');
                });
            },
            diagnostics() {
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
    #run(change, phase, action) {
        this.#notActive();
        if (change.terminal)
            throw new Error('Physics state ticket is terminal.');
        this.#active = change;
        try {
            this.#check(change);
            if (phase && change.phase !== phase)
                throw new Error('Physics state ticket phase mismatch.');
            action();
            if (!change.terminal)
                this.#check(change);
        }
        catch (error) {
            record(change, error);
            this.#failAndRelease(change);
            throw change.primary;
        }
        finally {
            this.#active = undefined;
        }
    }
    #notify(change) {
        if (change.notified)
            return;
        change.notified = true;
        for (let i = 0; i < change.entered; ++i) {
            const owner = change.roster[i];
            try {
                owner.callbacks.fail.call(owner.receiver, change.context, failure(change));
            }
            catch (error) {
                record(change, error);
            }
        }
    }
    #release(change) {
        for (let i = 0; i < change.entered; ++i) {
            const owner = change.roster[i];
            if (change.released.has(owner))
                continue;
            change.released.add(owner); // Never replay cleanup after an unknown callback outcome.
            try {
                owner.callbacks.dispose.call(owner.receiver, change.context);
                ++change.cleanupCompletedOwners;
            }
            catch (error) {
                record(change, error);
            }
        }
    }
    #close(change) {
        change.terminal = true;
        if (change.membership.ticket === change)
            change.membership.ticket = undefined;
    }
    #failAndRelease(change) {
        this.#notify(change);
        this.#release(change);
        change.phase = 'failed';
        this.#close(change);
    }
    #finish(change, phase) {
        this.#release(change);
        if (change.failed) {
            this.#failAndRelease(change);
            throw change.primary;
        }
        change.phase = phase;
        this.#close(change);
    }
}
exports.PhysicsStateObserverRegistry = PhysicsStateObserverRegistry;
const registry = new PhysicsStateObserverRegistry();
function registerPhysicsStateObserver(target, observer) {
    return registry.register(target, observer);
}
exports.registerPhysicsStateObserver = registerPhysicsStateObserver;
function beginPhysicsStateChange(target, operation) {
    return registry.begin(target, operation);
}
exports.beginPhysicsStateChange = beginPhysicsStateChange;
