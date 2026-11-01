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
/** Internal producer lifecycle only. It neither resolves public RigidBody components nor
 * proves native ownership/readiness. The integrating world supplies those admissions,
 * runs one returned roster through its queue, and releases the lease in finally.
 */
import type {
    CommandContext,
    CommandInput,
    CommandProducer,
    CommandVector,
    PreparedCommandPause,
} from './command-queue';

export interface ProducerHandle {
    readonly enabled: boolean;
    readonly disposed: boolean;
    enable(): void;
    disable(): void;
    dispose(): void;
}
export interface ContinuousDescriptor {
    readonly force?: CommandVector;
    readonly torque?: CommandVector;
    readonly relativePoint?: CommandVector;
    readonly space?: 'world' | 'local';
}
export interface ContinuousHandle extends ProducerHandle {
    update(descriptor: ContinuousDescriptor): void;
}
/** The owner must establish its whole-world fence before returning and retain it until dispose.
 * A throwing begin owns cleanup of its partial acquisition. Borrowed internal leases never
 * dispose the enclosing step/control fence. Disposal failures fault the owner, not roll back
 * registry changes that were already published while the lease was current.
 */
export interface ProducerOperationLease {
    assertCurrent(): void;
    dispose(): void;
}
export interface ProducerOwner {
    beginProducerOperation(operation: string, allowPaused: boolean): ProducerOperationLease;
    beginProducerSnapshot(): ProducerOperationLease;
    beginProducerControl(): ProducerOperationLease;
    validateContinuousBody(body: object): void;
    submit(body: object, command: CommandInput): number;
}
export interface ProducerRosterLease {
    readonly callbacks: readonly CommandProducer[];
    dispose(): void;
}
type Admission = 'configuration' | 'snapshot' | 'control';
type RetainedAdmission = { lease: ProducerOperationLease | null };
type Descriptor = Readonly<{
    force: CommandVector;
    torque: CommandVector;
    relativePoint: CommandVector;
    space: 'world' | 'local';
}>;
type Entry = {
    enabled: boolean;
    disposed: boolean;
} & ({ kind: 'hook'; callback: CommandProducer } | { kind: 'continuous'; body: object; descriptor: Descriptor });
const zero = Object.freeze({ x: 0, y: 0, z: 0 });
function error(message: string): Error {
    return Object.assign(new Error(`Box3D producers: ${message}`), {
        code: 'AIR_E_BOX3D_CONFIG',
    });
}
function copyVector(input: CommandVector | undefined): CommandVector {
    if (input === undefined) return zero;
    if (input === null || typeof input !== 'object') throw error('expected a vector');
    const x = input.x,
        y = input.y,
        z = input.z;
    if ([x, y, z].some((v) => typeof v !== 'number' || !Number.isFinite(v)))
        throw error('coordinates must be finite numbers');
    return Object.freeze({ x, y, z });
}
function copyDescriptor(input: ContinuousDescriptor): Descriptor {
    if (input === null || typeof input !== 'object') throw error('expected a descriptor');
    // Read each field exactly once. Never retain caller-owned vector/descriptor aliases.
    const force = copyVector(input.force),
        torque = copyVector(input.torque),
        relativePoint = copyVector(input.relativePoint);
    const requestedSpace = input.space,
        space = requestedSpace === undefined ? 'world' : requestedSpace;
    if (space !== 'world' && space !== 'local') throw error('invalid vector space');
    return Object.freeze({ force, torque, relativePoint, space });
}
function copyEnabled(options: { enabled?: boolean } | undefined): boolean {
    if (options === undefined) return true;
    if (options === null || typeof options !== 'object') throw error('expected options');
    const value = options.enabled;
    if (value === undefined) return true;
    if (typeof value !== 'boolean') throw error('enabled must be boolean');
    return value;
}
function isZero(vector: CommandVector): boolean {
    return vector.x === 0 && vector.y === 0 && vector.z === 0;
}

export class Box3DCommandProducers {
    readonly #owner: ProducerOwner;
    readonly #entries = new Map<number, Entry>();
    readonly #limit: number;
    #lastRegistration = 0;
    #closed = false;
    #paused = false;
    #reading = false;
    #readFailed = false;
    #readFailure: unknown;
    #activeLease: object | null = null;
    #pauseReservation: object | null = null;

    /** qualification.registrationLimit is an internal copied test seam, never a public API option. */
    constructor(owner: ProducerOwner, qualification?: { registrationLimit?: number }) {
        if (!owner || typeof owner !== 'object') throw error('expected an internal owner');
        const beginProducerOperation = owner.beginProducerOperation,
            beginProducerSnapshot = owner.beginProducerSnapshot,
            beginProducerControl = owner.beginProducerControl,
            validateContinuousBody = owner.validateContinuousBody,
            submit = owner.submit;
        if (
            [beginProducerOperation, beginProducerSnapshot, beginProducerControl, validateContinuousBody, submit].some(
                (fn) => typeof fn !== 'function',
            )
        )
            throw error('invalid internal owner functions');
        this.#owner = Object.freeze({
            beginProducerOperation: (op: string, allowPaused: boolean) =>
                beginProducerOperation.call(owner, op, allowPaused),
            beginProducerSnapshot: () => beginProducerSnapshot.call(owner),
            beginProducerControl: () => beginProducerControl.call(owner),
            validateContinuousBody: (body: object) => validateContinuousBody.call(owner, body),
            submit: (body: object, command: CommandInput) => submit.call(owner, body, command),
        });
        if (qualification !== undefined && (qualification === null || typeof qualification !== 'object'))
            throw error('invalid qualification');
        const requestedLimit = qualification?.registrationLimit;
        this.#limit = requestedLimit === undefined ? Number.MAX_SAFE_INTEGER : requestedLimit;
        if (!Number.isSafeInteger(this.#limit) || this.#limit < 1) throw error('invalid registration limit');
    }
    #recordFailure(failure: unknown): void {
        if (!this.#readFailed) {
            this.#readFailed = true;
            this.#readFailure = failure;
        }
    }
    #reject(message: string): never {
        const failure = error(message);
        if (this.#reading) {
            this.#recordFailure(failure);
            throw this.#readFailure;
        }
        throw failure;
    }
    #localAdmission(reservation: object | null = null): void {
        if (this.#reading) this.#reject('nested operation during input admission');
        if (this.#pauseReservation && this.#pauseReservation !== reservation)
            this.#reject('prepared control transition is reserved');
        if (this.#activeLease) this.#reject('configuration during producer collection');
    }
    #assertInput(): void {
        if (this.#readFailed) throw this.#readFailure;
    }
    /** prepare reads/validates under the owner fence; its returned publication contains only
     * private copied state. No public/caller input is touched after the final currentness check.
     * Local admission remains latched during owner acquisition, checking and disposal as well.
     */
    #operation<T>(
        operation: string,
        allowPaused: boolean,
        prepare: () => () => T,
        admission: Admission = 'configuration',
        reservation: object | null = null,
        abandon?: () => void,
        retained?: RetainedAdmission,
    ): T {
        this.#localAdmission(reservation);
        if (this.#closed) this.#reject('owner closed');
        if (this.#paused && !allowPaused) this.#reject('owner paused');
        this.#reading = true;
        this.#readFailed = false;
        this.#readFailure = undefined;
        let result: T | undefined, release: (() => void) | undefined;
        try {
            const previous = retained?.lease;
            const lease =
                previous ??
                (admission === 'snapshot'
                    ? this.#owner.beginProducerSnapshot()
                    : admission === 'control'
                      ? this.#owner.beginProducerControl()
                      : this.#owner.beginProducerOperation(operation, allowPaused));
            if (lease === null || typeof lease !== 'object') this.#reject('expected owner operation lease');
            // Capture disposal first: even a failing assertCurrent getter must release this lease.
            const dispose = lease.dispose;
            if (typeof dispose !== 'function') this.#reject('invalid owner operation disposal');
            if (!previous) release = () => dispose.call(lease);
            const assertCurrent = lease.assertCurrent;
            if (typeof assertCurrent !== 'function') this.#reject('invalid owner operation assertion');
            this.#assertInput();
            assertCurrent.call(lease);
            this.#assertInput();
            const publish = prepare();
            this.#assertInput();
            assertCurrent.call(lease);
            this.#assertInput();
            result = publish();
            if (retained && !previous) {
                // A prepared control retains this exact admission until its own dispose.
                // Commit must check the SAME parent context, not reacquire a later control scope.
                retained.lease = Object.freeze({
                    assertCurrent: () => assertCurrent.call(lease),
                    dispose: () => dispose.call(lease),
                });
                release = undefined;
            }
        } catch (failure) {
            this.#recordFailure(failure);
        }
        try {
            release?.();
        } catch (failure) {
            this.#recordFailure(failure);
        }
        // Release an otherwise unreachable newly prepared roster/control reservation, even if
        // owner cleanup failed. This is lease cleanup, never rollback of published configuration.
        if (this.#readFailed && abandon)
            try {
                abandon();
            } catch (failure) {
                this.#recordFailure(failure);
            }
        return this.#finishOperation(result as T);
    }
    #finishOperation<T>(result: T): T {
        const failed = this.#readFailed,
            failure = this.#readFailure;
        this.#reading = false;
        this.#readFailed = false;
        this.#readFailure = undefined;
        if (failed) throw failure;
        return result;
    }
    /** Cleanup remains usable after owner fault, but reentry cannot mutate the registry or
     * replace an earlier cleanup failure. Each lease is attempted independently.
     */
    #releasePrepared(ownerLease: ProducerOperationLease | null, release: () => void): void {
        this.#reading = true;
        this.#readFailed = false;
        this.#readFailure = undefined;
        try {
            ownerLease?.dispose();
        } catch (failure) {
            this.#recordFailure(failure);
        }
        try {
            release();
        } catch (failure) {
            this.#recordFailure(failure);
        }
        this.#finishOperation(undefined);
    }
    #assertBody(body: object): void {
        if (body === null || typeof body !== 'object') throw error('expected logical body identity');
        this.#owner.validateContinuousBody(body);
    }
    #prepareRegistration(entry: Entry): () => ProducerHandle | ContinuousHandle {
        if (this.#lastRegistration >= this.#limit) this.#reject('registration counter exhausted');
        const id = this.#lastRegistration + 1;
        const change = (enable: boolean): void => {
            // Historical inert cleanup exemption: an already disposed disable changes nothing,
            // even after owner fault/close. Enable can never resurrect it.
            if (entry.disposed && !enable) return;
            this.#operation(enable ? 'producer.enable' : 'producer.disable', !enable, () => {
                if (entry.disposed) this.#reject('producer disposed');
                if (enable && entry.kind === 'continuous') this.#assertBody(entry.body);
                return () => {
                    entry.enabled = enable;
                };
            });
        };
        const handle: ProducerHandle | ContinuousHandle = Object.freeze({
            get enabled() {
                return entry.enabled;
            },
            get disposed() {
                return entry.disposed;
            },
            enable: () => change(true),
            disable: () => change(false),
            dispose: () => {
                // Likewise preserve idempotent disposed-handle cleanup without owner admission.
                if (entry.disposed) return;
                this.#operation('producer.dispose', true, () => () => {
                    entry.enabled = false;
                    entry.disposed = true;
                    this.#entries.delete(id);
                });
            },
            ...(entry.kind === 'continuous'
                ? {
                      update: (descriptor: ContinuousDescriptor) => {
                          this.#operation('producer.update', false, () => {
                              if (entry.disposed) this.#reject('producer disposed');
                              const replacement = copyDescriptor(descriptor);
                              this.#assertBody(entry.body);
                              return () => {
                                  entry.descriptor = replacement;
                              };
                          });
                      },
                  }
                : {}),
        });
        return () => {
            this.#entries.set(id, entry);
            this.#lastRegistration = id;
            return handle;
        };
    }
    registerBeforeStep(callback: CommandProducer, options?: { enabled?: boolean }): ProducerHandle {
        return this.#operation('producer.register', false, () => {
            if (typeof callback !== 'function') this.#reject('callback must be a function');
            const enabled = copyEnabled(options);
            return this.#prepareRegistration({ kind: 'hook', callback, enabled, disposed: false });
        });
    }
    registerContinuous(
        body: object,
        descriptor: ContinuousDescriptor,
        options?: { enabled?: boolean },
    ): ContinuousHandle {
        return this.#operation('continuous.register', false, () => {
            const copied = copyDescriptor(descriptor),
                enabled = copyEnabled(options);
            this.#assertBody(body);
            return this.#prepareRegistration({
                kind: 'continuous',
                body,
                descriptor: copied,
                enabled,
                disposed: false,
            }) as () => ContinuousHandle;
        });
    }
    #snapshot(admission: 'configuration' | 'snapshot'): ProducerRosterLease {
        const identity = {};
        const release = (): void => {
            if (this.#activeLease === identity) this.#activeLease = null;
        };
        return this.#operation(
            'producer.snapshot',
            false,
            () => {
                const selected = [] as Array<
                    | { kind: 'hook'; callback: CommandProducer }
                    | { kind: 'continuous'; body: object; descriptor: Descriptor }
                >;
                for (const entry of this.#entries.values())
                    if (entry.enabled && !entry.disposed) {
                        if (entry.kind === 'hook') selected.push({ kind: 'hook', callback: entry.callback });
                        else {
                            this.#assertBody(entry.body);
                            selected.push({
                                kind: 'continuous',
                                body: entry.body,
                                descriptor: entry.descriptor,
                            });
                        }
                    }
                const callbacks = selected.map((entry) => {
                    let invoked = false;
                    return (context: Readonly<CommandContext>): void => {
                        if (this.#reading) this.#reject('roster invocation during input admission');
                        if (this.#activeLease !== identity || invoked)
                            this.#reject('expired or already invoked roster entry');
                        invoked = true;
                        if (entry.kind === 'hook') return entry.callback(context);
                        const descriptor = entry.descriptor;
                        if (!isZero(descriptor.force))
                            this.#owner.submit(entry.body, {
                                kind: 'force',
                                vector: descriptor.force,
                                relativePoint: descriptor.relativePoint,
                                space: descriptor.space,
                            });
                        if (!isZero(descriptor.torque))
                            this.#owner.submit(entry.body, {
                                kind: 'torque',
                                vector: descriptor.torque,
                                space: descriptor.space,
                            });
                    };
                });
                const lease = Object.freeze({
                    callbacks: Object.freeze(callbacks),
                    dispose: () => {
                        if (this.#reading) this.#reject('roster disposal during input admission');
                        release();
                    },
                });
                return () => {
                    this.#activeLease = identity;
                    return lease;
                };
            },
            admission,
            null,
            release,
        );
    }
    snapshot(): ProducerRosterLease {
        return this.#snapshot('configuration');
    }
    /** Private owner lane: the owner authenticates its already active preflight scope.
     * This does not admit public producer configuration during preflight.
     */
    snapshotWithinStep(): ProducerRosterLease {
        return this.#snapshot('snapshot');
    }
    #preparePause(paused: boolean, admission: 'configuration' | 'control'): PreparedCommandPause {
        const identity = {},
            producers = this;
        const retained: RetainedAdmission = { lease: null };
        let committed = false,
            disposed = false;
        const release = (): void => {
            disposed = true;
            if (this.#pauseReservation === identity) this.#pauseReservation = null;
        };
        return this.#operation(
            'producer.preparePauseTransition',
            true,
            () => {
                if (typeof paused !== 'boolean') this.#reject('pause state must be boolean');
                const continuous = [...this.#entries.values()].filter((entry) => entry.kind === 'continuous');
                const lease: PreparedCommandPause = Object.freeze({
                    commit(): void {
                        if (this !== lease || disposed || committed || producers.#pauseReservation !== identity)
                            producers.#reject('foreign, disposed or consumed pause transition');
                        producers.#operation(
                            'producer.commitPauseTransition',
                            true,
                            () => () => {
                                if (paused) for (const entry of continuous) entry.enabled = false;
                                producers.#paused = paused;
                                committed = true;
                            },
                            admission,
                            identity,
                            undefined,
                            retained,
                        );
                    },
                    dispose(): void {
                        if (this !== lease) producers.#reject('invalid pause transition receiver');
                        if (disposed) return;
                        if (producers.#reading) producers.#reject('pause disposal during input admission');
                        const ownerLease = retained.lease;
                        retained.lease = null;
                        // Reserve against configuration until owner cleanup has been attempted,
                        // but always release the local reservation even if that cleanup throws.
                        disposed = true;
                        producers.#releasePrepared(ownerLease, release);
                    },
                    diagnostics: () => Object.freeze({ paused, committed, disposed }),
                });
                return () => {
                    this.#pauseReservation = identity;
                    return lease;
                };
            },
            admission,
            null,
            release,
            retained,
        );
    }
    /** Reserve both participants before publishing the original System cache. The returned
     * transition holds its owner fence until dispose, including when commit is rejected.
     */
    preparePauseTransition(paused: boolean): PreparedCommandPause {
        return this.#preparePause(paused, 'configuration');
    }
    /** Private owner lane: retain the exact control-scope admission through commit/dispose;
     * neither borrows this permission for public handle/registration changes. The integrating
     * owner must dispose this transition independently of its enclosing control scope.
     */
    preparePauseTransitionWithinControl(paused: boolean): PreparedCommandPause {
        return this.#preparePause(paused, 'control');
    }
    #setPaused(paused: boolean): void {
        const transition = this.preparePauseTransition(paused);
        let failed = false,
            failure: unknown;
        try {
            transition.commit();
        } catch (error) {
            failed = true;
            failure = error;
        }
        try {
            transition.dispose();
        } catch (error) {
            if (!failed) failure = error;
            failed = true;
        }
        if (failed) throw failure;
    }
    pause(): void {
        this.#setPaused(true);
    }
    resume(): void {
        this.#setPaused(false);
    }
    /** Internal owner notification only AFTER actual disable/type-change/teardown proof. */
    retireBody(body: object): void {
        this.#localAdmission();
        for (const [id, entry] of this.#entries)
            if (entry.kind === 'continuous' && entry.body === body) {
                entry.enabled = false;
                entry.disposed = true;
                this.#entries.delete(id);
            }
    }
    /** Internal teardown: unlike public configuration this remains usable after owner fault. */
    close(): void {
        this.#localAdmission();
        for (const entry of this.#entries.values()) {
            entry.enabled = false;
            entry.disposed = true;
        }
        this.#entries.clear();
        this.#closed = true;
    }
    diagnostics() {
        return Object.freeze({
            closed: this.#closed,
            paused: this.#paused,
            preparedControl: this.#pauseReservation !== null,
            collecting: this.#activeLease !== null,
            registrations: this.#lastRegistration,
            liveProducers: this.#entries.size,
            enabledProducers: [...this.#entries.values()].filter((entry) => entry.enabled).length,
        });
    }
}
