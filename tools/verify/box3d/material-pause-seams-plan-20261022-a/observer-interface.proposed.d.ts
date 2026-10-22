/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * DESIGN ONLY. Not runtime implementation, package exports, facade ABI or capability qualification.
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
export interface PhysicsStateChangeHeader {
    readonly target: object;
    readonly operation: PhysicsStateOperation;
    readonly before: PhysicsStateSnapshot;
}
/** Only facts directly observable at an instrumented original engine call site.
 * Delegate entry/return is NOT an assertion that a native mutation occurred.
 */
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
export interface PhysicsStateFailure {
    readonly error: unknown; // Includes undefined/null/0; never test truthiness.
    readonly effects: readonly PhysicsStateEffect[];
    readonly observed: PhysicsStateSnapshot | null;
    readonly observationFailed: boolean;
}
/** Trusted engine-owner callbacks only, not user callbacks or a public event bus.
 * open must acquire its owner-local barrier before any candidate getter/clone/dispatch.
 */
export interface PhysicsStateObserver {
    open(header: Readonly<PhysicsStateChangeHeader>): PhysicsStateObserverAttempt;
}
export interface PhysicsStateObserverAttempt {
    preflight(candidate: PhysicsStateSnapshot): void; // Pure validation/reservation; no native/configuration write.
    commit(actual: PhysicsStateSnapshot): void; // Private identity/metadata commit, not arbitrary user code.
    fail(failure: Readonly<PhysicsStateFailure>): void; // Fault/quarantine affected owner when effects are uncertain.
    dispose(): void; // Independent finally, including after another observer fails.
}
export interface PhysicsStateObserverLease {
    dispose(): void; // Repeated release is safe and releases only this registration.
}
/** Module-private identity validation is required; readonly TS declarations alone are not authority. */
export interface PhysicsStateChangeTicket {
    preflight(candidate: PhysicsStateSnapshot): void;
    effect(effect: PhysicsStateEffect): void;
    commit(actual: PhysicsStateSnapshot): void;
    fail(error: unknown, observed: PhysicsStateSnapshot | null, observationFailed: boolean): void;
    dispose(): void;
}
export declare function registerPhysicsStateObserver(
    target: object,
    observer: PhysicsStateObserver,
): PhysicsStateObserverLease;
/** No observer: undefined immediately, without evaluating extra candidate data or changing the legacy branch. */
export declare function beginPhysicsStateChange(
    target: object,
    operation: PhysicsStateOperation,
    before: PhysicsStateSnapshot,
): PhysicsStateChangeTicket | undefined;

/** Required SEPARATE private AIR integration, not a public observer bypass:
 * an exact owner-held ticket binds generation, actual component/System, adapter,
 * one material candidate and one delegate invocation. It authorizes only the
 * matching internal configuration action; it does not make the owner idle.
 * Never expose this authority on Component, impl, event payloads or app options.
 */
export interface ProposedPrivateMaterialDelegateAuthority {
    runExactDelegate(operation: 'shape-material' | 'world-default-material', invoke: () => void): void;
}
