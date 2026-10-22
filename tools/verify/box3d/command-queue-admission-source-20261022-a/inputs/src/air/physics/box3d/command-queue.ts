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
/** Internal queue only: no native calls, world lookup, clock, public handles or package exports.
 * The integrating owner MUST validate actual body/world/full-generation ownership, type,
 * enable/mass state, transaction fences and whole-world readiness before apply. This
 * module's logical body registration and teardown notifications prove none of those.
 */
export type CommandVector = Readonly<{ x: number; y: number; z: number }>;
export type CommandRotation = Readonly<{ x: number; y: number; z: number; w: number }>;
export type CommandPose = Readonly<{ position: CommandVector; rotation: CommandRotation }>;
export type CommandInput =
    | { readonly kind: 'target'; readonly pose: CommandPose }
    | {
          readonly kind: 'teleport';
          readonly pose: CommandPose;
          readonly preserveVelocity?: boolean;
          readonly wake?: boolean;
      }
    | {
          readonly kind: 'force' | 'impulse';
          readonly vector: CommandVector;
          readonly relativePoint?: CommandVector;
          readonly space?: 'world' | 'local';
      }
    | {
          readonly kind: 'torque' | 'angular-impulse';
          readonly vector: CommandVector;
          readonly space?: 'world' | 'local';
      }
    | { readonly kind: 'target-clear' | 'clear-forces' | 'clear-velocity' | 'clear-state' };
export type CopiedCommand = Readonly<CommandInput>;
export interface CommandRecord {
    readonly generation: number;
    readonly tickIndex: number;
    readonly sequence: number | null;
    /** Opaque logical JS identity, never a native body capability. */
    readonly body: object;
    readonly source: 'user' | 'producer' | 'idle' | 'protected';
    readonly command: CopiedCommand;
}
export interface CommandContext {
    readonly tickIndex: number;
    readonly attemptId: number;
    readonly fixedDt: number;
    readonly solverSubSteps: 1 | 2 | 4 | 8;
}
export interface CommandCandidate {
    readonly generation: number;
    readonly context: Readonly<CommandContext>;
    readonly original: readonly CommandRecord[];
    readonly operations: readonly CommandRecord[];
}
export type CommandProducer = (context: Readonly<CommandContext>) => void;
type Phase = 'ready' | 'collecting' | 'validating' | 'committing' | 'awaiting-step' | 'paused' | 'faulted' | 'closed';
type Body = { target: 'none' | 'active' | 'protected' };

function fail(message: string): never {
    throw new Error(`Box3D command queue: ${message}`);
}
function counter(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive safe integer`);
    return value;
}
function finite(value: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('command coordinates must be finite numbers');
    return value;
}
function object(value: unknown): asserts value is object {
    if (value === null || typeof value !== 'object') fail('expected an object');
}
function vector(value: CommandVector): CommandVector {
    object(value);
    return Object.freeze({ x: finite(value.x), y: finite(value.y), z: finite(value.z) });
}
function pose(value: CommandPose): CommandPose {
    object(value);
    const position = vector(value.position);
    const r = value.rotation;
    object(r);
    const rotation = Object.freeze({ x: finite(r.x), y: finite(r.y), z: finite(r.z), w: finite(r.w) });
    if (rotation.x === 0 && rotation.y === 0 && rotation.z === 0 && rotation.w === 0) fail('zero quaternion');
    return Object.freeze({ position, rotation });
}
function boolean(value: boolean | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') fail('expected a boolean');
    return value;
}
function copyCommand(input: CommandInput): CopiedCommand {
    object(input);
    const kind = input.kind;
    switch (kind) {
        case 'target':
            return Object.freeze({ kind, pose: pose(input.pose) });
        case 'teleport':
            return Object.freeze({
                kind,
                pose: pose(input.pose),
                preserveVelocity: boolean(input.preserveVelocity, false),
                wake: boolean(input.wake, true),
            });
        case 'force':
        case 'impulse':
        case 'torque':
        case 'angular-impulse': {
            const v = vector(input.vector);
            const inputSpace = input.space;
            const space = inputSpace === undefined ? 'world' : inputSpace;
            if (space !== 'world' && space !== 'local') fail('invalid command space');
            if (kind === 'force' || kind === 'impulse') {
                const point = input.relativePoint;
                return Object.freeze({
                    kind,
                    vector: v,
                    space,
                    relativePoint: vector(point === undefined ? { x: 0, y: 0, z: 0 } : point),
                });
            }
            return Object.freeze({ kind, vector: v, space });
        }
        case 'target-clear':
        case 'clear-forces':
        case 'clear-velocity':
        case 'clear-state':
            return Object.freeze({ kind });
        default:
            return fail('unknown command kind');
    }
}

/** A single generation is terminal: close/fault never permits identity or sequence reuse.
 * counterLimit is a copied internal qualification seam, not a public app option.
 */
export class Box3DCommandQueue {
    readonly #generation: number;
    readonly #limit: number;
    readonly #bodies = new Map<object, Body>();
    readonly #knownBodies = new WeakSet<object>();
    #phase: Phase = 'ready';
    #sequence = 0;
    #completedTicks = 0;
    #attempt = 0;
    #pending: readonly CommandRecord[] = Object.freeze([]);
    #provisional: readonly CommandRecord[] = Object.freeze([]);
    #candidate: CommandCandidate | null = null;
    #quarantine: CommandCandidate | null = null;
    #failure: unknown = undefined;
    #candidateFailed = false;
    #reading = false;
    #readFailure = false;
    #readError: unknown = undefined;

    constructor(options: { readonly generation: number; readonly counterLimit?: number }) {
        this.#generation = counter(options.generation, 'generation');
        const limit = options.counterLimit;
        this.#limit = counter(limit === undefined ? Number.MAX_SAFE_INTEGER : limit, 'counterLimit');
    }

    #latch(error: unknown): void {
        if (this.#reading && !this.#readFailure) {
            this.#readFailure = true;
            this.#readError = error;
        }
        if (this.#phase === 'collecting') {
            if (!this.#candidateFailed) this.#failure = error;
            this.#candidateFailed = true;
        }
    }
    #reject(message: string): never {
        const error = new Error(`Box3D command queue: ${message}`);
        this.#latch(error);
        throw error;
    }
    #admit(...phases: Phase[]): void {
        if (this.#reading) this.#reject('nested admission during input copy');
        if (!phases.includes(this.#phase)) this.#reject(`operation forbidden during ${this.#phase}`);
    }
    #body(identity: object): Body {
        const body = this.#bodies.get(identity);
        if (!body) this.#reject('foreign or released logical body identity');
        return body;
    }
    #copy<T>(read: () => T): T {
        this.#reading = true;
        this.#readFailure = false;
        this.#readError = undefined;
        try {
            const value = read();
            if (this.#readFailure) throw this.#readError;
            return value;
        } catch (error) {
            this.#latch(error);
            throw this.#readError;
        } finally {
            this.#reading = false;
            this.#readError = undefined;
        }
    }
    #ticket(candidate: CommandCandidate, phase: Phase): void {
        this.#admit(phase);
        if (candidate !== this.#candidate) this.#reject('foreign, stale or consumed candidate');
    }

    registerBody(identity: object): void {
        this.#admit('ready');
        object(identity);
        if (this.#knownBodies.has(identity)) this.#reject('body identity already registered or retired');
        this.#knownBodies.add(identity);
        this.#bodies.set(identity, { target: 'none' });
    }
    /** Owner-only notification AFTER actual disable/destroy has safely settled native
     * ownership. Never call this merely to make a protected zero disappear.
     */
    releaseBodyAfterTeardown(identity: object): void {
        this.#admit('ready', 'paused', 'faulted');
        this.#body(identity);
        const replacement = Object.freeze(this.#pending.filter((record) => record.body !== identity));
        this.#pending = replacement;
        this.#bodies.delete(identity);
    }
    acquireTarget(identity: object): void {
        this.#admit('ready');
        const body = this.#body(identity);
        if (body.target !== 'none') this.#reject('target ownership already held or protected');
        body.target = 'active';
    }
    revokeTarget(identity: object): void {
        this.#admit('ready', 'paused');
        const body = this.#body(identity);
        if (body.target === 'none') this.#reject('no target ownership');
        // No user sequence allocation: exhaustion must not block a cleanup obligation.
        body.target = 'protected';
    }
    submit(identity: object, input: CommandInput): number {
        return this.withSubmissionAdmission(() => ({ body: identity, command: input }));
    }
    /** Owner resolution, validation and original argument reads MUST occur inside read.
     * It returns one candidate only; calling submit from it is forbidden reentry.
     * The owner must independently fence native/config/Node mutation BEFORE calling
     * this method, even in ready phase. Queue admission guards only this queue's APIs;
     * it neither proves body state nor rolls back arbitrary callback side effects.
     */
    withSubmissionAdmission(read: () => { readonly body: object; readonly command: CommandInput }): number {
        this.#admit('ready', 'collecting');
        if (this.#completedTicks >= this.#limit) this.#reject('tick counter exhausted');
        const record = this.#copy(() => {
            if (typeof read !== 'function') this.#reject('submission reader must be a function');
            const candidate = read();
            object(candidate);
            const identity = candidate.body;
            const body = this.#body(identity);
            const command = copyCommand(candidate.command);
            const kind = command.kind;
            if ((kind === 'target' || kind === 'target-clear') && body.target !== 'active')
                this.#reject('target is not active');
            if (kind === 'teleport' && body.target === 'protected')
                this.#reject('protected zero must settle before teleport');
            if (['force', 'torque', 'impulse', 'angular-impulse'].includes(kind) && body.target !== 'none')
                this.#reject('effects cannot target an owned kinematic body');
            if (this.#sequence >= this.#limit) this.#reject('sequence exhausted');
            return Object.freeze({
                generation: this.#generation,
                tickIndex: this.#completedTicks + 1,
                sequence: this.#sequence + 1,
                body: identity,
                source: this.#phase === 'collecting' ? ('producer' as const) : ('user' as const),
                command,
            });
        });
        const replacement = Object.freeze([
            ...(this.#phase === 'collecting' ? this.#provisional : this.#pending),
            record,
        ]);
        this.#sequence = record.sequence;
        if (this.#phase === 'collecting') this.#provisional = replacement;
        else this.#pending = replacement;
        return record.sequence;
    }
    cancelPending(identity: object): number {
        this.#admit('ready');
        this.#body(identity);
        const replacement = Object.freeze(this.#pending.filter((record) => record.body !== identity));
        const count = this.#pending.length - replacement.length;
        this.#pending = replacement;
        return count;
    }

    #reduce(records: readonly CommandRecord[]): readonly CommandRecord[] {
        const effective = new Map<object, CommandRecord>();
        for (const record of records) {
            const body = this.#body(record.body);
            const kind = record.command.kind;
            if (['force', 'torque', 'impulse', 'angular-impulse'].includes(kind) && body.target !== 'none')
                this.#reject('queued effect conflicts with target ownership');
            if (kind === 'target' || kind === 'target-clear') effective.set(record.body, record);
            if (
                kind === 'teleport' ||
                (body.target !== 'none' && (kind === 'clear-velocity' || kind === 'clear-state'))
            )
                effective.delete(record.body);
        }
        const operations = records.filter((record) => {
            const kind = record.command.kind;
            return (
                (kind !== 'target' && kind !== 'target-clear') ||
                (this.#body(record.body).target === 'active' && effective.get(record.body) === record)
            );
        });
        for (const [identity, body] of this.#bodies) {
            if (body.target === 'none') continue;
            const explicit = operations.some(
                (record) =>
                    record.body === identity &&
                    ['target', 'target-clear', 'teleport', 'clear-velocity', 'clear-state'].includes(
                        record.command.kind,
                    ),
            );
            if (body.target === 'protected' || !explicit)
                operations.push(
                    Object.freeze({
                        generation: this.#generation,
                        tickIndex: this.#completedTicks + 1,
                        sequence: null,
                        body: identity,
                        source: body.target === 'protected' ? 'protected' : 'idle',
                        command: Object.freeze({ kind: 'target-clear' }),
                    }),
                );
        }
        return Object.freeze(operations);
    }

    /** Producers are already-snapshotted owner contributions in one stable order.
     * Continuous descriptor expansion and registration lifecycle are not implemented here.
     * Pure native validation belongs AFTER collect and BEFORE beginCommit.
     */
    collect(
        fixedDt: number,
        solverSubSteps: 1 | 2 | 4 | 8,
        producers: readonly CommandProducer[] = [],
    ): CommandCandidate {
        this.#admit('ready');
        if (!Number.isFinite(fixedDt) || fixedDt <= 0 || ![1, 2, 4, 8].includes(solverSubSteps))
            this.#reject('invalid fixed tick parameters');
        if (this.#completedTicks >= this.#limit || this.#attempt >= this.#limit)
            this.#reject('tick or attempt counter exhausted');
        const roster = this.#copy(() => {
            if (!Array.isArray(producers)) fail('producer roster must be an array');
            const count = producers.length;
            const copy: CommandProducer[] = [];
            for (let i = 0; i < count; i++) {
                const callback = producers[i];
                if (typeof callback !== 'function') fail('producer must be a function');
                copy.push(callback);
            }
            return Object.freeze(copy);
        });
        this.#attempt += 1;
        const context = Object.freeze({
            tickIndex: this.#completedTicks + 1,
            attemptId: this.#attempt,
            fixedDt,
            solverSubSteps,
        });
        this.#failure = undefined;
        this.#candidateFailed = false;
        this.#provisional = Object.freeze([]);
        this.#phase = 'collecting';
        try {
            for (const callback of roster) {
                if (callback(context) !== undefined) this.#reject('callback must synchronously return undefined');
                if (this.#candidateFailed) throw this.#failure;
            }
            const original = Object.freeze([...this.#pending, ...this.#provisional]);
            const operations = this.#reduce(original);
            const candidate = Object.freeze({ generation: this.#generation, context, original, operations });
            this.#candidate = candidate;
            this.#phase = 'validating';
            return candidate;
        } catch (error) {
            this.#provisional = Object.freeze([]);
            this.#phase = 'ready';
            throw this.#candidateFailed ? this.#failure : error;
        }
    }
    /** A read-only planner throw/refusal also takes this path; it is not mutation. */
    rejectCandidate(candidate: CommandCandidate): void {
        this.#ticket(candidate, 'validating');
        this.#candidate = null;
        this.#provisional = Object.freeze([]);
        this.#phase = 'ready';
    }
    beginCommit(candidate: CommandCandidate): void {
        this.#ticket(candidate, 'validating');
        this.#phase = 'committing';
    }
    finishCommit(candidate: CommandCandidate, outcome: 'not-mutated' | 'committed' | 'unknown'): void {
        this.#ticket(candidate, 'committing');
        if (!['not-mutated', 'committed', 'unknown'].includes(outcome)) this.#reject('invalid commit outcome');
        this.#provisional = Object.freeze([]);
        if (outcome === 'not-mutated') {
            this.#candidate = null;
            this.#phase = 'ready';
        } else if (outcome === 'unknown') {
            this.#quarantine = candidate;
            this.#pending = Object.freeze([]);
            this.#candidate = null;
            this.#phase = 'faulted';
        } else {
            this.#pending = Object.freeze([]);
            for (const record of candidate.operations)
                if (record.source === 'protected') this.#body(record.body).target = 'none';
            this.#phase = 'awaiting-step';
        }
    }
    completeTick(candidate: CommandCandidate): void {
        this.#ticket(candidate, 'awaiting-step');
        this.#completedTicks += 1;
        this.#candidate = null;
        this.#phase = 'ready';
    }
    /** Includes known command commit followed by readback, solver or Node failure.
     * nativeCompleted must be supplied from actual completion diagnostics, never a mock
     * success inference. Command retirement and native tick completion are independent.
     */
    faultAfterCommit(candidate: CommandCandidate, nativeCompleted: boolean): void {
        this.#ticket(candidate, 'awaiting-step');
        if (typeof nativeCompleted !== 'boolean') this.#reject('nativeCompleted must be boolean');
        if (nativeCompleted) this.#completedTicks += 1;
        this.#candidate = null;
        this.#phase = 'faulted';
    }
    pause(): void {
        this.#admit('ready', 'paused');
        this.#pending = Object.freeze([]);
        this.#phase = 'paused';
    }
    resume(): void {
        this.#admit('paused', 'ready');
        this.#phase = 'ready';
    }
    close(): void {
        this.#admit('ready', 'paused', 'faulted', 'closed');
        this.#pending = Object.freeze([]);
        this.#provisional = Object.freeze([]);
        this.#candidate = null;
        this.#quarantine = null;
        this.#bodies.clear();
        this.#phase = 'closed';
    }
    diagnostics() {
        return Object.freeze({
            generation: this.#generation,
            phase: this.#phase,
            sequence: this.#sequence,
            tickIndex: this.#completedTicks >= this.#limit ? null : this.#completedTicks + 1,
            completedTicks: this.#completedTicks,
            attemptId: this.#attempt,
            pending: this.#pending,
            provisionalCount: this.#provisional.length,
            quarantined: this.#quarantine,
            bodies: this.#bodies.size,
            protectedZeros: [...this.#bodies.values()].filter((body) => body.target === 'protected').length,
        });
    }
}
