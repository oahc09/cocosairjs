/**
 * Example-only Box3D diagnostic consumer, not a stable/general IPhysicsWorld API.
 * Calls only the existing copied diagnostics() and guarded getNativeCounts().
 * No native handles, private fields, mutations, simulation steps or API additions.
 */
type RecordValue = Record<string, unknown>;
export interface BackendObservation {
    readonly scope: 'backend-specific copied snapshot; not a stable IPhysicsWorld API';
    readonly availability: 'available' | 'partial' | 'unavailable';
    readonly reason: string | null;
    readonly worldState: string | null;
    readonly ownerPhase: string | null;
    readonly commandPhase: string | null;
    readonly generation: number | null;
    readonly nativeObservationCurrent: boolean | null;
    readonly nativeStep: number | null;
    readonly cachedNativeStep: number | null;
    readonly nativeCompleted: boolean | null;
    readonly snapshotAvailable: boolean | null;
    readonly contacts: number | null;
    readonly counts: Readonly<{
        bodies: number;
        shapes: number;
        contacts: number;
        joints: number;
        liveBytes: string;
    }> | null;
    readonly componentEventsSupported: false | null;
    readonly debugPresented: false | null;
}
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object';
const counter = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const states = new Set(['ready', 'stepping', 'faulted', 'destroying', 'destroyed', 'destroy-failed']);
const phases = new Set([
    'idle',
    'admission',
    'producer',
    'preflight',
    'solving',
    'writeback',
    'dispatch',
    'material',
    'control',
    'faulted',
    'closed',
]);
const commands = new Set(['idle', 'collecting', 'validating', 'committing', 'awaiting-step']);

export function readBackendObservation(world: unknown): BackendObservation {
    const result: {
        -readonly [Key in keyof BackendObservation]: BackendObservation[Key];
    } = {
        scope: 'backend-specific copied snapshot; not a stable IPhysicsWorld API',
        availability: 'unavailable',
        reason: null,
        worldState: null,
        ownerPhase: null,
        commandPhase: null,
        generation: null,
        nativeObservationCurrent: null,
        nativeStep: null,
        cachedNativeStep: null,
        nativeCompleted: null,
        snapshotAvailable: null,
        contacts: null,
        counts: null,
        componentEventsSupported: null,
        debugPresented: null,
    };
    const unavailable = (reason: string): BackendObservation => Object.freeze({ ...result, reason });
    try {
        if (!record(world) || !record(world.impl) || world.impl.backend !== 'box3d') {
            return unavailable('Box3D backend identity is unavailable.');
        }
        if (typeof world.diagnostics !== 'function') return unavailable('Copied diagnostics() is unavailable.');
        const copied: unknown = world.diagnostics();
        if (!record(copied) || typeof copied.state !== 'string' || !states.has(copied.state)) {
            return unavailable('Copied world-state diagnostics do not match the expected shape.');
        }
        result.worldState = copied.state;
        result.generation = counter(copied.generation) ? copied.generation : null;
        result.nativeObservationCurrent =
            typeof copied.nativeObservationCurrent === 'boolean' ? copied.nativeObservationCurrent : null;
        result.componentEventsSupported = copied.componentEventsSupported === false ? false : null;
        result.debugPresented = copied.debugPresented === false ? false : null;
        if (result.componentEventsSupported !== false || result.debugPresented !== false) {
            return unavailable('Unexpected capability flags; EX01 does not promote events or native debug rendering.');
        }
        const owner = copied.commandOwner;
        if (
            !record(owner) ||
            typeof owner.phase !== 'string' ||
            !phases.has(owner.phase) ||
            typeof owner.commandPhase !== 'string' ||
            !commands.has(owner.commandPhase)
        ) {
            return unavailable('Copied owner state is unavailable; no native count read was attempted.');
        }
        result.ownerPhase = owner.phase;
        result.commandPhase = owner.commandPhase;
        const native = copied.native;
        if (
            record(native) &&
            counter(native.nativeStepIndex) &&
            typeof native.nativeCompleted === 'boolean' &&
            typeof native.snapshotAvailable === 'boolean'
        ) {
            result.cachedNativeStep = native.nativeStepIndex;
            result.nativeCompleted = native.nativeCompleted;
            result.snapshotAvailable = native.snapshotAvailable;
        }
        // diagnostics() is cached and readable after fault/close. The native count reader is not.
        // Be stricter than assertCommittedRead: this UI samples only idle, ready owner boundaries.
        if (copied.state !== 'ready' || owner.phase !== 'idle' || owner.commandPhase === 'committing') {
            return unavailable(
                `World ${copied.state}, owner ${owner.phase}/${owner.commandPhase}; cached data is not a current native read.`,
            );
        }
        if (result.nativeObservationCurrent === true && result.cachedNativeStep !== null) {
            result.nativeStep = result.cachedNativeStep;
            result.availability = 'partial';
        }
        if (typeof world.getNativeCounts !== 'function')
            return unavailable('Guarded getNativeCounts() is unavailable.');
        const counts: unknown = world.getNativeCounts();
        if (
            !record(counts) ||
            !counter(counts.bodies) ||
            !counter(counts.shapes) ||
            !counter(counts.contacts) ||
            !counter(counts.joints) ||
            typeof counts.liveBytes !== 'bigint' ||
            !/^(0|[1-9][0-9]*)$/.test(String(counts.liveBytes))
        ) {
            return unavailable('Copied native counts do not match the expected shape.');
        }
        result.counts = Object.freeze({
            bodies: counts.bodies,
            shapes: counts.shapes,
            contacts: counts.contacts,
            joints: counts.joints,
            liveBytes: String(counts.liveBytes),
        });
        result.contacts = counts.contacts;
        result.availability = result.nativeStep === null ? 'partial' : 'available';
        result.reason =
            result.nativeStep === null
                ? 'Native step snapshot is unavailable or stale; counts were read at an idle ready boundary.'
                : null;
        return Object.freeze(result);
    } catch (error) {
        // A failed read is not a zero, a simulation failure, permission to retry, or a reason to step.
        return unavailable(
            `Backend diagnostic read unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
