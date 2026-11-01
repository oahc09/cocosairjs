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
/** Private actual-identity ledger. Never infer participation from listeners or backend names.
 * Owner capabilities are held by reviewed actual adapters, not re-exported by public barrels.
 * Metadata cannot prove native cleanup: a release receipt must originate at the exact reviewed
 * owner cleanup success point. Foreign cleanup stays unknown unless such a capability exists.
 */
export type MaterialSourceRole = 'explicit' | 'default' | 'raw-opaque';
export type MaterialSourceLifecycle = 'provisional' | 'live' | 'pending' | 'unknown' | 'released';
declare const sourceBrand: unique symbol;
declare const worldBrand: unique symbol;
declare const proofBrand: unique symbol;
export interface MaterialSourceLease {
    readonly [sourceBrand]: true;
}
export interface MaterialWorldLease {
    readonly [worldBrand]: true;
}
export interface MaterialReleaseProof {
    readonly [proofBrand]: true;
}
export interface MaterialSourceInput {
    readonly source: object;
    readonly adapter: object;
    readonly world: MaterialWorldLease;
    readonly role: MaterialSourceRole;
    readonly current: object | null;
    /** Fixed private identity field only. Must not read coefficients, getters or listeners. */
    readonly readActualCache: () => object | null;
    readonly initialized?: boolean;
}
export interface MaterialIdentityTransition {
    recordEntered(kind?: string): void;
    /** Clone result: reserve immediately on return, before any coefficient or listener work. */
    reserveCandidate(candidate: object | null): void;
    /** Call immediately after the original private identity assignment. No callbacks are called. */
    publishActual(actualIdentity: object | null): void;
    /** Unknown actual identity may be omitted. Never infers no native effect from unchanged cache. */
    fail(actualIdentity?: object | null): void;
}
/** Held only by actual participating initialization, never inferred from public component getters. */
export interface MaterialSourceInitialization {
    readActualIdentity(): object | null;
    /** Invoke independently immediately before and after actual native acquisition. */
    assertValid(): void;
    /** Revalidate and publish the reserved identity. It remains uninitialized/provisional until onLoad. */
    complete(): void;
    /** Retain hazards, safely end the scope, and return the earliest failure, including falsy values. */
    fail(error: unknown): unknown;
    /** Idempotent. Incomplete scopes become unknown; completed scopes stay provisional. */
    close(): void;
}
export interface MaterialExpectedBinding {
    readonly owner: object;
    readonly generation: number;
    readonly binding: object;
    readonly role: 'explicit' | 'default';
    readonly initialized: boolean;
}
export interface MaterialValuesCoverage {
    readonly disposition: 'legacy' | 'covered';
    readonly expectedBindings: readonly MaterialExpectedBinding[];
    /** Reconciles fixed private identity fields under lock, then checks any latched failure. */
    assertValid(): void;
    /** Bidirectional, identity-exact check, before S1 opens owners or reads coefficients. */
    compare(actual: readonly MaterialExpectedBinding[]): void;
    /** Preserve even falsy first failures. */
    fail(error: unknown): void;
    /** Callback-free and idempotent. */
    close(): void;
}
export interface MaterialBindingOwnerLease {
    declareBinding(source: object, actualAdapter: object, binding: object, role: 'explicit' | 'default'): void;
    claim(source: MaterialSourceLease, actualAdapter: object, binding: object, role: 'explicit' | 'default'): void;
    /** Call only after independently confirmed actual adapter native release. */
    confirmBindingReleased(source: MaterialSourceLease): MaterialReleaseProof;
    /** Call only after independently confirmed native world release, not ordinary destroy return. */
    confirmWorldReleased(): MaterialReleaseProof;
    close(proof?: MaterialReleaseProof): void;
}
interface WorldRecord {
    readonly identity: object;
    readonly generation: number;
    readonly lease: MaterialWorldLease;
    readonly sources: Set<SourceRecord>;
    state: 'live' | 'unknown' | 'released';
    owner?: OwnerRecord;
}
interface OwnerRecord {
    readonly identity: object;
    readonly generation: number;
    readonly world: WorldRecord;
    readonly declarations: Set<Declaration>;
    state: 'live' | 'unknown' | 'released';
}
interface Declaration {
    readonly source: object;
    readonly adapter: object;
    readonly binding: object;
    readonly role: 'explicit' | 'default';
    readonly owner: OwnerRecord;
}
interface SourceRecord {
    readonly identity: object;
    readonly adapter: object;
    readonly world: WorldRecord;
    readonly generation: number;
    readonly role: MaterialSourceRole;
    readonly lease: MaterialSourceLease;
    readonly readActualCache: () => object | null;
    hazards: Set<object>;
    current: object | null;
    before: object | null;
    candidate: object | null;
    initialized: boolean;
    lifecycle: MaterialSourceLifecycle;
    claim?: Declaration;
    transition?: TransitionRecord;
    lastTransition?: TransitionRecord;
}
interface TransitionRecord {
    readonly source: SourceRecord;
    readonly before: object | null;
    candidate: object | null;
    readonly retainedHazards: Set<object>;
    readonly initialHazards: Set<object>;
    readonly initialBefore: object | null;
    readonly initialCandidate: object | null;
    candidateReserved: boolean;
    readonly oldLifecycle: MaterialSourceLifecycle;
    readonly publishedHazards: Map<object | null, Set<object>>;
    entered: boolean;
    consumed: boolean;
}
interface Roster {
    readonly sources: Set<SourceRecord>;
    lock?: CoverageRecord;
}
interface CoverageRecord {
    readonly asset: object;
    readonly roster: Roster;
    readonly sources: readonly SourceRecord[];
    readonly expected: readonly MaterialExpectedBinding[];
    failed: boolean;
    error: unknown;
    closed: boolean;
}
interface InitializationRecord {
    readonly source: SourceRecord;
    readonly sourceGeneration: number;
    readonly worldGeneration: number;
    readonly before: object | null;
    readonly transition: MaterialIdentityTransition;
    readonly transitionRecord: TransitionRecord;
    actual: object | null;
    reading: boolean;
    completed: boolean;
    failed: boolean;
    error: unknown;
    closed: boolean;
}
interface ProofRecord {
    readonly owner: OwnerRecord;
    readonly source?: SourceRecord;
    used: boolean;
}
function isObject(value: unknown): value is object {
    return value !== null && typeof value === 'object';
}
function isIdentity(value: unknown): value is object | null {
    return value === null || isObject(value);
}
function latch(lock: { failed: boolean; error: unknown }, error: unknown): void {
    if (!lock.failed) {
        lock.failed = true;
        lock.error = error;
    }
}
/** Isolated protocol instance for narrow qualification; production uses only the private instance below. */
export class PhysicsMaterialBindingsRegistry {
    readonly #worlds = new WeakMap<object, WorldRecord>();
    readonly #worldLeases = new WeakMap<MaterialWorldLease, WorldRecord>();
    readonly #sources = new WeakMap<object, SourceRecord>();
    readonly #sourceLeases = new WeakMap<MaterialSourceLease, SourceRecord>();
    readonly #assets = new WeakMap<object, Roster>();
    readonly #declarations = new WeakMap<object, Set<Declaration>>();
    readonly #opaqueAssets = new WeakSet<object>();
    readonly #ownerGenerations = new WeakMap<object, number>();
    readonly #proofs = new WeakMap<MaterialReleaseProof, ProofRecord>();
    readonly #active = new Set<CoverageRecord>();
    readonly #limit: number;
    #count = 0;
    #poisoned = false;
    #reading?: CoverageRecord;
    #initializing?: InitializationRecord;
    #initializationAccess = false;
    constructor(qualification: Readonly<{ counterLimit?: number }> = {}) {
        this.#limit = qualification.counterLimit ?? Number.MAX_SAFE_INTEGER;
        if (!Number.isSafeInteger(this.#limit) || this.#limit < 1) throw new TypeError('Invalid binding ledger limit.');
    }
    #reject(message: string, source?: SourceRecord): never {
        const error = new Error(message);
        if (this.#reading) latch(this.#reading, error);
        if (this.#initializing) latch(this.#initializing, error);
        if (!source) for (const lock of this.#active) latch(lock, error);
        if (source)
            for (const asset of source.hazards) {
                const lock = this.#assets.get(asset)?.lock;
                if (lock) latch(lock, error);
            }
        throw error;
    }
    #entry(): void {
        if (this.#reading) this.#reject('Material identity reader cannot re-enter binding admission.');
        if (this.#initializing && !this.#initializationAccess)
            this.#reject('Material initialization cannot re-enter identity, source, release or values admission.');
    }
    #initializationMetadata<T>(record: InitializationRecord | undefined, action: () => T): T {
        if (record && (this.#initializing !== record || record.reading))
            this.#reject('Initialization metadata authority is stale or reentrant.', record.source);
        const previous = this.#initializationAccess;
        this.#initializationAccess = true;
        try {
            return action();
        } finally {
            this.#initializationAccess = previous;
        }
    }
    #initializationOwnerAccess(
        owner: OwnerRecord,
        source: object,
        adapter: object,
        role: 'explicit' | 'default',
        action: () => void,
    ): void {
        const record = this.#initializing;
        if (record) {
            if (record.failed) throw record.error;
            if (
                record.source.identity !== source ||
                record.source.adapter !== adapter ||
                record.source.world !== owner.world ||
                record.source.role !== role ||
                record.source.world.owner !== owner ||
                record.source.generation !== record.sourceGeneration ||
                record.source.world.generation !== record.worldGeneration ||
                this.#sources.get(source) !== record.source
            )
                this.#reject('Initialization permits only its exact actual-owner declaration or claim.', record.source);
        }
        this.#initializationMetadata(record, action);
    }
    #capacity(): number {
        if (this.#count >= this.#limit) {
            this.#poisoned = true;
            this.#reject('Material binding ledger capacity exhausted; coverage remains opaque.');
        }
        return ++this.#count;
    }
    #roster(asset: object): Roster {
        let roster = this.#assets.get(asset);
        if (!roster) {
            roster = { sources: new Set() };
            this.#assets.set(asset, roster);
        }
        return roster;
    }
    #unlocked(assets: Iterable<object>): void {
        this.#entry();
        for (const asset of assets) {
            const lock = this.#assets.get(asset)?.lock;
            if (lock) {
                const error = new Error('Material identity is locked by an active values transaction.');
                latch(lock, error);
                throw error;
            }
        }
    }
    #source(lease: MaterialSourceLease): SourceRecord {
        const source = isObject(lease) ? this.#sourceLeases.get(lease) : undefined;
        if (!source) this.#reject('Expected authentic material source generation lease.');
        return source;
    }
    #world(lease: MaterialWorldLease): WorldRecord {
        const world = isObject(lease) ? this.#worldLeases.get(lease) : undefined;
        if (!world) this.#reject('Expected authentic material world generation lease.');
        return world;
    }
    #hazard(source: SourceRecord, identity: object | null): void {
        if (identity === null || source.hazards.has(identity)) return;
        this.#roster(identity).sources.add(source);
        source.hazards.add(identity);
    }
    #replaceHazards(source: SourceRecord, next: Set<object>): void {
        for (const asset of source.hazards) if (!next.has(asset)) this.#assets.get(asset)!.sources.delete(source);
        source.hazards = next;
    }
    #mutable(source: SourceRecord, more: readonly (object | null)[] = []): void {
        // Null explicit bindings depend on the actual world's default and are absent from asset rows.
        // Freeze that world's membership too, so they cannot appear/disappear during a default write.
        for (const sibling of source.world.sources) this.#unlocked(sibling.hazards);
        this.#unlocked(source.hazards);
        this.#unlocked(more.filter((asset): asset is object => asset !== null));
        if (source.lifecycle === 'released') this.#reject('Material source generation is released.', source);
    }
    registerMaterialWorld(actualWorld: object): MaterialWorldLease {
        this.#entry();
        if (!isObject(actualWorld)) throw new TypeError('Expected actual world identity.');
        if (this.#worlds.has(actualWorld)) this.#reject('Actual world identity already has a generation.');
        const generation = this.#capacity();
        const lease = Object.freeze({}) as MaterialWorldLease;
        const world: WorldRecord = { identity: actualWorld, generation, lease, sources: new Set(), state: 'live' };
        this.#worlds.set(actualWorld, world);
        this.#worldLeases.set(lease, world);
        return lease;
    }
    getOrRegisterMaterialWorld(actualWorld: object): MaterialWorldLease {
        this.#entry();
        if (!isObject(actualWorld)) throw new TypeError('Expected actual world identity.');
        const world = this.#worlds.get(actualWorld);
        if (!world) return this.registerMaterialWorld(actualWorld);
        if (world.state !== 'live') this.#reject('Actual world generation is unknown or released.');
        return world.lease;
    }
    getMaterialSource(source: object): MaterialSourceLease | undefined {
        const record = this.#sources.get(source);
        return record?.lifecycle === 'released' ? undefined : record?.lease;
    }
    registerMaterialSource(input: MaterialSourceInput): MaterialSourceLease {
        this.#entry();
        const { source, adapter, world: lease, role, current, readActualCache } = input;
        const initialized = input.initialized ?? false;
        if (
            !isObject(source) ||
            !isObject(adapter) ||
            !isIdentity(current) ||
            typeof readActualCache !== 'function' ||
            !['explicit', 'default', 'raw-opaque'].includes(role) ||
            typeof initialized !== 'boolean'
        )
            throw new TypeError('Invalid actual material source.');
        const world = this.#world(lease);
        if (world.state !== 'live') this.#reject('Cannot acquire a source in an unknown or released world.');
        for (const sibling of world.sources) this.#unlocked(sibling.hazards);
        this.#unlocked(current === null ? [] : [current]);
        const previous = this.#sources.get(source);
        if (
            previous &&
            previous.world === world &&
            previous.adapter === adapter &&
            previous.role === role &&
            previous.lifecycle !== 'released'
        ) {
            this.#mutable(previous, [current]);
            if (previous.current !== current) {
                this.#hazard(previous, current);
                previous.lifecycle = 'unknown';
                this.#reject('Existing source private identity disagrees with registration.', previous);
            }
            return previous.lease;
        }
        const generation = this.#capacity();
        const sourceLease = Object.freeze({}) as MaterialSourceLease;
        const record: SourceRecord = {
            identity: source,
            adapter,
            world,
            generation,
            role,
            lease: sourceLease,
            readActualCache,
            hazards: new Set(),
            current,
            before: current,
            candidate: current,
            initialized,
            lifecycle: initialized ? 'live' : 'provisional',
        };
        for (const declaration of this.#declarations.get(source) ?? []) {
            if (
                declaration.adapter === adapter &&
                declaration.role === role &&
                declaration.owner.world === world &&
                declaration.owner.state === 'live'
            )
                record.claim = declaration;
        }
        this.#sourceLeases.set(sourceLease, record);
        this.#sources.set(source, record);
        world.sources.add(record);
        this.#hazard(record, current);
        return sourceLease;
    }
    prepareBindingIdentity(
        lease: MaterialSourceLease,
        before: object | null,
        candidate: object | null,
        operation: string,
    ): MaterialIdentityTransition {
        this.#entry();
        const source = this.#source(lease);
        if (!isIdentity(before) || !isIdentity(candidate) || typeof operation !== 'string')
            this.#reject('Invalid identity transition.', source);
        this.#mutable(source, [before, candidate]);
        if (source.transition) this.#reject('A material identity transition is already pending.', source);
        if (source.current !== before) {
            this.#hazard(source, before);
            this.#hazard(source, candidate);
            source.lifecycle = 'unknown';
            this.#reject('Actual before identity differs from accepted material source.', source);
        }
        this.#capacity();
        // Every success publication alternative is allocated before caller effects or clone reads.
        const publishedHazards = new Map<object | null, Set<object>>();
        for (const actual of [before, candidate])
            publishedHazards.set(actual, new Set(actual === null ? [] : [actual]));
        const transition: TransitionRecord = {
            source,
            before,
            candidate,
            retainedHazards: new Set(source.hazards),
            initialHazards: new Set(source.hazards),
            initialBefore: source.before,
            initialCandidate: source.candidate,
            candidateReserved: false,
            oldLifecycle: source.lifecycle,
            publishedHazards,
            entered: false,
            consumed: false,
        };
        this.#hazard(source, before);
        this.#hazard(source, candidate);
        for (const identity of source.hazards) transition.retainedHazards.add(identity);
        source.before = before;
        source.candidate = candidate;
        source.transition = transition;
        source.lastTransition = transition;
        source.lifecycle = 'pending';
        const registry = this;
        const check = (): void => {
            registry.#mutable(source);
            if (transition.consumed || source.transition !== transition)
                registry.#reject('Material identity transition is stale or consumed.', source);
        };
        const token: MaterialIdentityTransition = Object.freeze({
            recordEntered(kind?: string): void {
                if (this !== token) registry.#reject('Invalid material transition receiver.', source);
                check();
                if (kind !== undefined && typeof kind !== 'string') registry.#reject('Invalid effect kind.', source);
                transition.entered = true;
            },
            reserveCandidate(actual: object | null): void {
                if (this !== token) registry.#reject('Invalid material transition receiver.', source);
                check();
                if (!isIdentity(actual) || !transition.entered || transition.candidateReserved)
                    registry.#reject('Clone candidate reservation is invalid or already consumed.', source);
                registry.#unlocked(actual === null ? [] : [actual]);
                const next = new Set(actual === null ? [] : [actual]);
                registry.#hazard(source, actual);
                if (actual !== null) transition.retainedHazards.add(actual);
                transition.publishedHazards.set(actual, next);
                transition.candidate = actual;
                transition.candidateReserved = true;
                source.candidate = actual;
            },
            publishActual(actual: object | null): void {
                if (this !== token) registry.#reject('Invalid material transition receiver.', source);
                check();
                // No callbacks, property reads, allocation or native work after this point.
                const next = transition.publishedHazards.get(actual);
                if (!next) {
                    source.lifecycle = 'unknown';
                    registry.#poisoned = true;
                    registry.#reject('Unreserved actual identity cannot be published.', source);
                }
                transition.consumed = true;
                source.transition = undefined;
                source.current = actual;
                if (transition.oldLifecycle === 'unknown' || source.world.state !== 'live')
                    source.lifecycle = 'unknown';
                else {
                    registry.#replaceHazards(source, next!);
                    source.before = actual;
                    source.candidate = actual;
                    source.lifecycle = source.initialized ? 'live' : 'provisional';
                }
            },
            fail(actual?: object | null): void {
                if (this !== token) registry.#reject('Invalid material transition receiver.', source);
                if (source.lastTransition !== transition)
                    registry.#reject('Cannot fail an older identity transition.', source);
                if (!transition.consumed && !transition.entered && (actual === undefined || actual === before)) {
                    check();
                    registry.#replaceHazards(source, transition.initialHazards);
                    source.current = before;
                    source.before = transition.initialBefore;
                    source.candidate = transition.initialCandidate;
                    source.lifecycle = transition.oldLifecycle;
                    transition.consumed = true;
                    source.transition = undefined;
                    return;
                }
                if (transition.consumed) {
                    // A later S1 publication/owner failure still makes both preallocated identities hazardous.
                    registry.#mutable(source);
                    if (source.transition)
                        registry.#reject('Cannot fail an older transition over a newer transition.', source);
                    for (const identity of transition.retainedHazards) registry.#hazard(source, identity);
                } else check();
                if (actual !== undefined) {
                    if (!isIdentity(actual)) registry.#reject('Invalid failed actual identity.', source);
                    registry.#hazard(source, actual);
                    source.current = actual;
                }
                transition.consumed = true;
                source.transition = undefined;
                source.before = before;
                source.candidate = transition.candidate;
                source.lifecycle = 'unknown';
            },
        });
        return token;
    }
    beginMaterialSourceInitialization(
        lease: MaterialSourceLease,
        actualSource: object,
        actualAdapter: object,
        actualWorld: object,
    ): MaterialSourceInitialization {
        this.#entry();
        const source = this.#source(lease);
        if (
            source.identity !== actualSource ||
            source.adapter !== actualAdapter ||
            source.world.identity !== actualWorld ||
            this.#sources.get(actualSource) !== source ||
            this.#worlds.get(actualWorld) !== source.world ||
            !source.world.sources.has(source) ||
            source.lifecycle !== 'provisional' ||
            source.initialized ||
            source.role !== 'explicit' ||
            source.transition ||
            source.world.state !== 'live' ||
            !source.world.owner ||
            source.world.owner.state !== 'live' ||
            this.#ownerGenerations.get(source.world.owner.identity) !== source.world.owner.generation ||
            (source.claim && source.claim.owner !== source.world.owner)
        )
            this.#reject(
                'Expected exact current uninitialized participating source, adapter and world generation.',
                source,
            );
        const before = source.current;
        const transition = this.prepareBindingIdentity(lease, before, before, 'actual-material-initialize');
        transition.recordEntered('private-identity-and-coefficient-read');
        const record: InitializationRecord = {
            source,
            sourceGeneration: source.generation,
            worldGeneration: source.world.generation,
            before,
            transition,
            transitionRecord: source.transition!,
            actual: before,
            reading: false,
            completed: false,
            failed: false,
            error: undefined,
            closed: false,
        };
        this.#initializing = record;
        const registry = this;
        const validate = (): void => {
            if (record.failed) throw record.error;
            if (record.closed || registry.#initializing !== record || record.reading)
                registry.#reject('Material initialization lease is closed, stale or reentrant.', source);
            if (
                registry.#sources.get(actualSource) !== source ||
                registry.#sourceLeases.get(lease) !== source ||
                registry.#worlds.get(actualWorld) !== source.world ||
                source.identity !== actualSource ||
                source.adapter !== actualAdapter ||
                source.world.identity !== actualWorld ||
                source.generation !== record.sourceGeneration ||
                source.world.generation !== record.worldGeneration ||
                !source.world.sources.has(source) ||
                source.initialized ||
                source.world.state !== 'live' ||
                source.world.owner?.state !== 'live' ||
                registry.#ownerGenerations.get(source.world.owner.identity) !== source.world.owner.generation ||
                source.current !== before ||
                source.lifecycle !== (record.completed ? 'provisional' : 'pending') ||
                source.transition !== (record.completed ? undefined : record.transitionRecord)
            )
                registry.#reject('Actual initialization source or world generation changed.', source);
            record.reading = true;
            try {
                const actual = source.readActualCache();
                if (isIdentity(actual)) record.actual = actual;
                if (record.failed) throw record.error;
                if (!isIdentity(actual) || actual !== before) {
                    if (isIdentity(actual)) registry.#hazard(source, actual);
                    else registry.#poisoned = true;
                    registry.#reject('Actual private material identity changed during initialization.', source);
                }
            } catch (error) {
                latch(record, error);
                throw record.error;
            } finally {
                record.reading = false;
            }
        };
        const finishUnknown = (): void => {
            if (record.closed) return;
            // Cleanup uses its exact internal transition despite the latched error. No user callback runs.
            try {
                registry.#initializationMetadata(record, () => transition.fail(record.actual));
            } finally {
                record.closed = true;
                if (registry.#initializing === record) registry.#initializing = undefined;
            }
        };
        const initialization: MaterialSourceInitialization = Object.freeze({
            readActualIdentity(): object | null {
                if (this !== initialization) registry.#reject('Invalid material initialization receiver.', source);
                validate();
                return before;
            },
            assertValid(): void {
                if (this !== initialization) registry.#reject('Invalid material initialization receiver.', source);
                validate();
            },
            complete(): void {
                if (this !== initialization) registry.#reject('Invalid material initialization receiver.', source);
                validate();
                if (record.completed) registry.#reject('Material initialization completion is single-use.', source);
                registry.#initializationMetadata(record, () => transition.publishActual(before));
                record.completed = true;
            },
            fail(error: unknown): unknown {
                if (this !== initialization) registry.#reject('Invalid material initialization receiver.', source);
                if (record.reading) registry.#reject('Cannot clean up from inside a private identity reader.', source);
                latch(record, error);
                try {
                    finishUnknown();
                } catch (cleanupError) {
                    latch(record, cleanupError);
                }
                return record.error;
            },
            close(): void {
                if (this !== initialization) registry.#reject('Invalid material initialization receiver.', source);
                if (record.closed) return;
                if (record.reading) registry.#reject('Cannot close from inside a private identity reader.', source);
                if (!record.completed || record.failed) {
                    try {
                        finishUnknown();
                    } catch (cleanupError) {
                        latch(record, cleanupError);
                    }
                } else {
                    record.closed = true;
                    if (registry.#initializing === record) registry.#initializing = undefined;
                }
            },
        });
        try {
            initialization.assertValid();
        } catch (error) {
            throw initialization.fail(error);
        }
        return initialization;
    }
    markMaterialSourceInitialized(lease: MaterialSourceLease): void {
        this.#entry();
        const source = this.#source(lease);
        this.#mutable(source);
        if (source.transition) this.#reject('Cannot initialize a pending material source.', source);
        source.initialized = true;
        if (source.lifecycle === 'provisional') source.lifecycle = 'live';
    }
    markMaterialSourceUnknown(lease: MaterialSourceLease, actual?: object | null): void {
        this.#entry();
        const source = this.#source(lease);
        if (actual !== undefined && !isIdentity(actual)) this.#reject('Invalid failed actual identity.', source);
        this.#mutable(source, actual === undefined ? [] : [actual]);
        if (actual !== undefined) {
            this.#hazard(source, actual);
            source.current = actual;
        }
        if (source.transition) {
            source.transition.consumed = true;
            source.transition = undefined;
        }
        source.lifecycle = 'unknown';
    }
    registerMaterialBindingOwner(identity: object, generation: number, actualWorld: object): MaterialBindingOwnerLease {
        this.#entry();
        if (
            !isObject(identity) ||
            !Number.isSafeInteger(generation) ||
            generation < 1 ||
            generation <= (this.#ownerGenerations.get(identity) ?? 0)
        )
            throw new TypeError('Expected fresh owner generation.');
        const world = this.#world(this.getOrRegisterMaterialWorld(actualWorld));
        for (const source of world.sources) this.#unlocked(source.hazards);
        if (world.owner) this.#reject('Actual world already has a material owner generation.');
        this.#capacity();
        const owner: OwnerRecord = { identity, generation, world, declarations: new Set(), state: 'live' };
        world.owner = owner;
        this.#ownerGenerations.set(identity, generation);
        const registry = this;
        const live = (): void => {
            registry.#entry();
            if (owner.state !== 'live' || world.state !== 'live')
                registry.#reject('Material owner generation is not live.');
        };
        const matches = (source: SourceRecord, declaration: Declaration): boolean =>
            source.identity === declaration.source &&
            source.adapter === declaration.adapter &&
            source.world === world &&
            source.role === declaration.role;
        const ownerLease: MaterialBindingOwnerLease = Object.freeze({
            declareBinding(source: object, adapter: object, binding: object, role: 'explicit' | 'default'): void {
                if (this !== ownerLease) registry.#reject('Invalid material owner receiver.');
                registry.#initializationOwnerAccess(owner, source, adapter, role, () => {
                    live();
                    if (
                        !isObject(source) ||
                        !isObject(adapter) ||
                        !isObject(binding) ||
                        !['explicit', 'default'].includes(role)
                    )
                        registry.#reject('Invalid exact owner binding declaration.');
                    for (const item of owner.declarations)
                        if (item.source === source && item.adapter === adapter && item.role === role) {
                            if (item.binding !== binding) registry.#reject('Owner binding identity changed.');
                            return;
                        }
                    const affected = [...world.sources].filter(
                        (item) => item.identity === source && item.adapter === adapter && item.role === role,
                    );
                    for (const item of affected) {
                        registry.#mutable(item);
                        if (item.claim && item.claim.owner !== owner)
                            registry.#reject('Source is claimed by another owner generation.', item);
                    }
                    registry.#capacity();
                    const declaration: Declaration = { source, adapter, binding, role, owner };
                    let declarations = registry.#declarations.get(source);
                    if (!declarations) {
                        declarations = new Set();
                        registry.#declarations.set(source, declarations);
                    }
                    declarations.add(declaration);
                    owner.declarations.add(declaration);
                    for (const item of affected) item.claim = declaration;
                });
            },
            claim(lease: MaterialSourceLease, adapter: object, binding: object, role: 'explicit' | 'default'): void {
                if (this !== ownerLease) registry.#reject('Invalid material owner receiver.');
                const source = registry.#source(lease);
                registry.#initializationOwnerAccess(owner, source.identity, adapter, role, () => {
                    live();
                    registry.#mutable(source);
                    const declaration = [...owner.declarations].find(
                        (item) =>
                            matches(source, item) &&
                            item.adapter === adapter &&
                            item.binding === binding &&
                            item.role === role,
                    );
                    if (!declaration || (source.claim && source.claim !== declaration))
                        registry.#reject('No exact source, adapter, world and owner declaration.', source);
                    source.claim = declaration;
                });
            },
            confirmBindingReleased(lease: MaterialSourceLease): MaterialReleaseProof {
                if (this !== ownerLease) registry.#reject('Invalid material owner receiver.');
                registry.#entry();
                const source = registry.#source(lease);
                registry.#mutable(source);
                if (source.claim?.owner !== owner)
                    registry.#reject('Release proof owner does not own this source generation.', source);
                const proof = Object.freeze({}) as MaterialReleaseProof;
                registry.#proofs.set(proof, { owner, source, used: false });
                return proof;
            },
            confirmWorldReleased(): MaterialReleaseProof {
                if (this !== ownerLease) registry.#reject('Invalid material owner receiver.');
                registry.#entry();
                for (const source of world.sources) registry.#unlocked(source.hazards);
                if (owner.state === 'released') registry.#reject('Material owner already released.');
                const proof = Object.freeze({}) as MaterialReleaseProof;
                registry.#proofs.set(proof, { owner, used: false });
                return proof;
            },
            close(proof?: MaterialReleaseProof): void {
                if (this !== ownerLease) registry.#reject('Invalid material owner receiver.');
                registry.#entry();
                for (const source of world.sources) registry.#unlocked(source.hazards);
                if (owner.state === 'released') return;
                const receipt = proof === undefined ? undefined : registry.#proofs.get(proof);
                if (proof !== undefined && (!receipt || receipt.used || receipt.owner !== owner || receipt.source))
                    registry.#reject('Expected authentic unused exact-world release proof.');
                if (receipt) {
                    receipt.used = true;
                    for (const source of world.sources) registry.#release(source);
                    world.sources.clear();
                    owner.state = 'released';
                    world.state = 'released';
                } else {
                    for (const source of world.sources) {
                        if (source.transition) {
                            source.transition.consumed = true;
                            source.transition = undefined;
                        }
                        source.lifecycle = 'unknown';
                    }
                    owner.state = 'unknown';
                    world.state = 'unknown';
                }
            },
        });
        return ownerLease;
    }
    #release(source: SourceRecord): void {
        for (const asset of source.hazards) this.#assets.get(asset)!.sources.delete(source);
        source.hazards.clear();
        if (source.transition) source.transition.consumed = true;
        source.transition = undefined;
        source.lastTransition = undefined;
        if (source.claim) {
            source.claim.owner.declarations.delete(source.claim);
            this.#declarations.get(source.identity)?.delete(source.claim);
        }
        source.current = source.before = source.candidate = null;
        source.lifecycle = 'released';
    }
    closeMaterialSource(lease: MaterialSourceLease, proof?: MaterialReleaseProof): void {
        this.#entry();
        const source = this.#source(lease);
        this.#unlocked(source.hazards);
        if (source.lifecycle === 'released') return;
        const receipt = proof === undefined ? undefined : this.#proofs.get(proof);
        if (
            proof !== undefined &&
            (!receipt || receipt.used || receipt.source !== source || source.claim?.owner !== receipt.owner)
        )
            this.#reject('Expected authentic unused exact-source release proof.', source);
        if (receipt) {
            receipt.used = true;
            this.#release(source);
            source.world.sources.delete(source);
        } else this.markMaterialSourceUnknown(lease);
    }
    /** Acquisition failure has no no-effect inference. Later covered writes reject until independently qualified. */
    recordMaterialAcquisitionUnknown(asset?: object | null): void {
        this.#entry();
        if (asset !== undefined && !isIdentity(asset)) throw new TypeError('Invalid acquisition hazard identity.');
        if (asset) {
            this.#unlocked([asset]);
            this.#opaqueAssets.add(asset);
        } else {
            if (this.#active.size) this.#reject('Opaque acquisition cannot enter during a values transaction.');
            this.#poisoned = true;
        }
    }
    #hasClaim(roster: Roster | undefined): boolean {
        if (!roster) return false;
        for (const source of roster.sources)
            if ((source.claim || source.world.owner) && source.lifecycle !== 'released') return true;
        return false;
    }
    #check(lock: CoverageRecord, read: boolean): void {
        if (lock.closed) this.#reject('Material coverage lock is closed.');
        if (lock.failed) throw lock.error;
        if (
            this.#poisoned ||
            this.#opaqueAssets.has(lock.asset) ||
            lock.roster.lock !== lock ||
            lock.roster.sources.size !== lock.sources.length
        )
            this.#reject('Material actual-binding coverage is opaque or changed.');
        for (const source of lock.sources) {
            if (
                !lock.roster.sources.has(source) ||
                source.lifecycle !== 'live' ||
                !source.initialized ||
                !source.claim ||
                source.role === 'raw-opaque' ||
                source.world.state !== 'live' ||
                source.claim.owner.state !== 'live' ||
                source.transition ||
                source.current !== lock.asset
            )
                this.#reject('Material has foreign, provisional, pending, unknown or stale actual binding.', source);
            if (read) {
                let actual: unknown;
                try {
                    actual = source.readActualCache();
                } catch (error) {
                    source.lifecycle = 'unknown';
                    latch(lock, error);
                    throw error;
                }
                if (lock.failed) throw lock.error;
                if (!isIdentity(actual) || actual !== source.current) {
                    source.lifecycle = 'unknown';
                    if (isIdentity(actual)) this.#hazard(source, actual);
                    else this.#poisoned = true;
                    this.#reject('Fixed private material identity differs from accepted actual binding.', source);
                }
            }
        }
        if (lock.failed) throw lock.error;
    }
    lockMaterialValuesCoverage(asset: object): MaterialValuesCoverage {
        this.#entry();
        if (!isObject(asset)) throw new TypeError('Expected material asset identity.');
        const roster = this.#assets.get(asset);
        this.#unlocked([asset]);
        const covered = this.#hasClaim(roster);
        const sources = covered ? Object.freeze([...roster!.sources]) : Object.freeze([] as SourceRecord[]);
        const expected = Object.freeze(
            sources
                .filter((source) => !!source.claim)
                .map((source) =>
                    Object.freeze({
                        owner: source.claim!.owner.identity,
                        generation: source.claim!.owner.generation,
                        binding: source.claim!.binding,
                        role: source.claim!.role,
                        initialized: source.initialized,
                    }),
                ),
        );
        const lock: CoverageRecord = {
            asset,
            roster: roster ?? { sources: new Set() },
            sources,
            expected,
            failed: false,
            error: undefined,
            closed: false,
        };
        if (covered) {
            lock.roster.lock = lock;
            this.#active.add(lock);
        }
        const registry = this;
        const run = (action: () => void): void => {
            if (lock.closed) registry.#reject('Material coverage lock is closed.');
            if (lock.failed) throw lock.error;
            if (registry.#reading) registry.#reject('Material coverage cannot re-enter.');
            registry.#reading = lock;
            try {
                action();
                if (lock.failed) throw lock.error;
            } catch (error) {
                latch(lock, error);
                throw lock.error;
            } finally {
                registry.#reading = undefined;
            }
        };
        const coverage: MaterialValuesCoverage = Object.freeze({
            disposition: covered ? 'covered' : 'legacy',
            expectedBindings: expected,
            assertValid(): void {
                if (this !== coverage) registry.#reject('Invalid material coverage receiver.');
                run(() => {
                    if (covered) registry.#check(lock, true);
                });
            },
            compare(actual: readonly MaterialExpectedBinding[]): void {
                if (this !== coverage) registry.#reject('Invalid material coverage receiver.');
                run(() => {
                    if (covered) registry.#check(lock, false);
                    if (!Array.isArray(actual) || actual.length !== expected.length)
                        registry.#reject('Neutral and executable material rosters differ.');
                    const seen = new Set<MaterialExpectedBinding>();
                    for (const item of actual) {
                        if (!isObject(item)) registry.#reject('Invalid executable material binding snapshot.');
                        const { owner, generation, binding, role, initialized } = item;
                        const match = expected.find(
                            (value) =>
                                value.owner === owner &&
                                value.generation === generation &&
                                value.binding === binding &&
                                value.role === role &&
                                value.initialized === initialized,
                        );
                        if (!match || seen.has(match))
                            registry.#reject(
                                'Neutral and executable binding identity, generation, role or initialization differs.',
                            );
                        seen.add(match!);
                    }
                });
            },
            fail(error: unknown): void {
                if (this !== coverage) registry.#reject('Invalid material coverage receiver.');
                if (!lock.closed) latch(lock, error);
            },
            close(): void {
                if (this !== coverage) registry.#reject('Invalid material coverage receiver.');
                registry.#entry();
                if (lock.closed) return;
                lock.closed = true;
                registry.#active.delete(lock);
                if (lock.roster.lock === lock) lock.roster.lock = undefined;
            },
        });
        try {
            coverage.assertValid();
        } catch (error) {
            coverage.close();
            throw error;
        }
        return coverage;
    }
    assertMaterialBindingDestroyable(asset: object): void {
        this.#entry();
        const roster = this.#assets.get(asset);
        if (!this.#hasClaim(roster)) return;
        this.#unlocked([asset]);
        this.#reject('Material retains a participating actual-binding hazard.');
    }
    /** No object identities or callbacks are exposed. Qualification and conservative state inspection only. */
    diagnostics(lease: MaterialSourceLease): Readonly<{
        generation: number;
        worldGeneration: number;
        lifecycle: MaterialSourceLifecycle;
        initialized: boolean;
        hazards: number;
        participating: boolean;
        coveragePoisoned: boolean;
    }> {
        const source = this.#source(lease);
        return Object.freeze({
            generation: source.generation,
            worldGeneration: source.world.generation,
            lifecycle: source.lifecycle,
            initialized: source.initialized,
            hazards: source.hazards.size,
            participating: !!source.claim,
            coveragePoisoned: this.#poisoned,
        });
    }
}

const bindings = new PhysicsMaterialBindingsRegistry();
export function registerMaterialWorld(world: object): MaterialWorldLease {
    return bindings.registerMaterialWorld(world);
}
export function getOrRegisterMaterialWorld(world: object): MaterialWorldLease {
    return bindings.getOrRegisterMaterialWorld(world);
}
export function getMaterialSource(source: object): MaterialSourceLease | undefined {
    return bindings.getMaterialSource(source);
}
export function registerMaterialSource(input: MaterialSourceInput): MaterialSourceLease {
    return bindings.registerMaterialSource(input);
}
export function prepareBindingIdentity(
    lease: MaterialSourceLease,
    before: object | null,
    candidate: object | null,
    operation: string,
): MaterialIdentityTransition {
    return bindings.prepareBindingIdentity(lease, before, candidate, operation);
}
export function beginMaterialSourceInitialization(
    lease: MaterialSourceLease,
    actualSource: object,
    actualAdapter: object,
    actualWorld: object,
): MaterialSourceInitialization {
    return bindings.beginMaterialSourceInitialization(lease, actualSource, actualAdapter, actualWorld);
}
export function markMaterialSourceInitialized(lease: MaterialSourceLease): void {
    bindings.markMaterialSourceInitialized(lease);
}
export function markMaterialSourceUnknown(lease: MaterialSourceLease, actual?: object | null): void {
    bindings.markMaterialSourceUnknown(lease, actual);
}
export function closeMaterialSource(lease: MaterialSourceLease, proof?: MaterialReleaseProof): void {
    bindings.closeMaterialSource(lease, proof);
}
export function registerMaterialBindingOwner(
    identity: object,
    generation: number,
    world: object,
): MaterialBindingOwnerLease {
    return bindings.registerMaterialBindingOwner(identity, generation, world);
}
export function lockMaterialValuesCoverage(asset: object): MaterialValuesCoverage {
    return bindings.lockMaterialValuesCoverage(asset);
}
export function assertMaterialBindingDestroyable(asset: object): void {
    bindings.assertMaterialBindingDestroyable(asset);
}
export function recordMaterialAcquisitionUnknown(asset?: object | null): void {
    bindings.recordMaterialAcquisitionUnknown(asset);
}
