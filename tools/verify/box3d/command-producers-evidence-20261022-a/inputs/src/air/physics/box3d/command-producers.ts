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
import type { CommandContext, CommandInput, CommandProducer, CommandVector } from './command-queue';

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
export interface ProducerOwner {
    assertConfiguration(operation: string, allowPaused: boolean): void;
    validateContinuousBody(body: object): void;
    submit(body: object, command: CommandInput): number;
}
export interface ProducerRosterLease {
    readonly callbacks: readonly CommandProducer[];
    dispose(): void;
}
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
    return Object.assign(new Error(`Box3D producers: ${message}`), { code: 'AIR_E_BOX3D_CONFIG' });
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
    #activeLease: object | null = null;

    /** qualification.registrationLimit is an internal copied test seam, never a public API option. */
    constructor(owner: ProducerOwner, qualification?: { registrationLimit?: number }) {
        if (!owner || typeof owner !== 'object') throw error('expected an internal owner');
        const assertConfiguration = owner.assertConfiguration,
            validateContinuousBody = owner.validateContinuousBody,
            submit = owner.submit;
        if ([assertConfiguration, validateContinuousBody, submit].some((fn) => typeof fn !== 'function'))
            throw error('invalid internal owner functions');
        this.#owner = Object.freeze({
            assertConfiguration: (op, allowPaused) => assertConfiguration.call(owner, op, allowPaused),
            validateContinuousBody: (body) => validateContinuousBody.call(owner, body),
            submit: (body, command) => submit.call(owner, body, command),
        });
        if (qualification !== undefined && (qualification === null || typeof qualification !== 'object'))
            throw error('invalid qualification');
        const requestedLimit = qualification?.registrationLimit;
        this.#limit = requestedLimit === undefined ? Number.MAX_SAFE_INTEGER : requestedLimit;
        if (!Number.isSafeInteger(this.#limit) || this.#limit < 1) throw error('invalid registration limit');
    }
    #reject(message: string): never {
        if (this.#reading) this.#readFailed = true;
        throw error(message);
    }
    #localAdmission(): void {
        if (this.#reading) this.#reject('nested operation during input admission');
        if (this.#activeLease) this.#reject('configuration during producer collection');
    }
    #configuration(operation: string, allowPaused = false): void {
        this.#localAdmission();
        if (this.#closed) this.#reject('owner closed');
        if (this.#paused && !allowPaused) this.#reject('owner paused');
        this.#owner.assertConfiguration(operation, allowPaused);
    }
    #copy<T>(read: () => T): T {
        this.#reading = true;
        this.#readFailed = false;
        try {
            const value = read();
            if (this.#readFailed) this.#reject('caught nested admission invalidated the input');
            return value;
        } finally {
            this.#reading = false;
        }
    }
    #assertBody(body: object): void {
        if (body === null || typeof body !== 'object') throw error('expected logical body identity');
        this.#owner.validateContinuousBody(body);
    }
    #register(entry: Entry): ProducerHandle | ContinuousHandle {
        if (this.#lastRegistration >= this.#limit) this.#reject('registration counter exhausted');
        const id = this.#lastRegistration + 1;
        const change = (enable: boolean): void => {
            // A disposed disable is inert cleanup; enable can never resurrect it.
            if (entry.disposed && !enable) return;
            this.#configuration(enable ? 'producer.enable' : 'producer.disable', !enable);
            if (entry.disposed) this.#reject('producer disposed');
            if (enable && entry.kind === 'continuous') this.#copy(() => this.#assertBody(entry.body));
            entry.enabled = enable;
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
                if (entry.disposed) return;
                this.#configuration('producer.dispose', true);
                entry.enabled = false;
                entry.disposed = true;
                this.#entries.delete(id);
            },
            ...(entry.kind === 'continuous'
                ? {
                      update: (descriptor: ContinuousDescriptor) => {
                          this.#configuration('producer.update');
                          if (entry.disposed) this.#reject('producer disposed');
                          const replacement = this.#copy(() => {
                              const result = copyDescriptor(descriptor);
                              this.#assertBody(entry.body);
                              return result;
                          });
                          entry.descriptor = replacement;
                      },
                  }
                : {}),
        });
        this.#entries.set(id, entry);
        this.#lastRegistration = id;
        return handle;
    }
    registerBeforeStep(callback: CommandProducer, options?: { enabled?: boolean }): ProducerHandle {
        this.#configuration('producer.register');
        if (typeof callback !== 'function') this.#reject('callback must be a function');
        const enabled = this.#copy(() => copyEnabled(options));
        return this.#register({ kind: 'hook', callback, enabled, disposed: false });
    }
    registerContinuous(
        body: object,
        descriptor: ContinuousDescriptor,
        options?: { enabled?: boolean },
    ): ContinuousHandle {
        this.#configuration('continuous.register');
        const copied = this.#copy(() => {
            const value = copyDescriptor(descriptor),
                enabled = copyEnabled(options);
            this.#assertBody(body);
            return { value, enabled };
        });
        return this.#register({
            kind: 'continuous',
            body,
            descriptor: copied.value,
            enabled: copied.enabled,
            disposed: false,
        }) as ContinuousHandle;
    }
    snapshot(): ProducerRosterLease {
        this.#configuration('producer.snapshot');
        const selected = this.#copy(() => {
            const result = [] as Array<
                | { kind: 'hook'; callback: CommandProducer }
                | { kind: 'continuous'; body: object; descriptor: Descriptor }
            >;
            for (const entry of this.#entries.values())
                if (entry.enabled && !entry.disposed) {
                    if (entry.kind === 'hook') result.push({ kind: 'hook', callback: entry.callback });
                    else {
                        this.#assertBody(entry.body);
                        result.push({ kind: 'continuous', body: entry.body, descriptor: entry.descriptor });
                    }
                }
            return result;
        });
        const identity = {};
        const callbacks = selected.map((entry) => {
            let invoked = false;
            return (context: Readonly<CommandContext>): void => {
                if (this.#activeLease !== identity || invoked) this.#reject('expired or already invoked roster entry');
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
                if (this.#activeLease === identity) this.#activeLease = null;
            },
        });
        this.#activeLease = identity;
        return lease;
    }
    pause(): void {
        this.#configuration('producer.pause', true);
        for (const entry of this.#entries.values()) if (entry.kind === 'continuous') entry.enabled = false;
        this.#paused = true;
    }
    resume(): void {
        this.#configuration('producer.resume', true);
        this.#paused = false;
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
            collecting: this.#activeLease !== null,
            registrations: this.#lastRegistration,
            liveProducers: this.#entries.size,
            enabledProducers: [...this.#entries.values()].filter((entry) => entry.enabled).length,
        });
    }
}
