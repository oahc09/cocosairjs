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
/** Internal Game source and exact manual-frame ownership. No AIR/physics import or public export. */
export interface GameClockState {
    readonly applicationPaused: boolean;
    readonly backgroundPaused: boolean;
    readonly terminal: boolean;
    readonly manual: boolean;
}
export interface GameClockFailure {
    readonly error: unknown;
    readonly actual: GameClockState;
    readonly reasonCommitted: boolean;
    readonly effectEntered: boolean;
    readonly effectReturned: boolean;
    readonly sourcePaused: boolean | null;
}
export interface GameClockPlan {
    commit(): void;
    fail(failure: GameClockFailure): void;
    dispose(): void;
}
export interface GameClockObserver {
    /** Runs before private reason/token reads, including same-value and stale requests. */
    admit(initial: boolean): void;
    prepare(before: GameClockState, candidate: GameClockState, initial: boolean): GameClockPlan;
    assertLive(): void;
}
export interface GameClockDiagnostics extends GameClockState {
    readonly observed: boolean;
    readonly faulted: boolean;
    readonly frame: 'none' | 'armed' | 'entered' | 'returned';
}
export interface GameClockObservation {
    assertNativeAdvance(): void;
    diagnostics(): GameClockDiagnostics;
    dispose(): void;
}
interface GameClockSource {
    readPaused(): boolean;
    /** Captured in the original Game constructor; never call public pause/resume here. */
    applyPaused(paused: boolean, background: boolean): void;
    /** Captured optional cleanup for this Game's platform event subscriptions. */
    disposeEvents?(): void;
}
interface Frame {
    readonly owner: object;
    entered: boolean;
    returned: boolean;
}
interface Admission {
    failed: boolean;
    error: unknown;
}
interface Entry {
    readonly director: object;
    readonly source: GameClockSource;
    applicationPaused: boolean;
    backgroundPaused: boolean;
    terminal: boolean;
    manual: object | null;
    frame: Frame | null;
    observer: GameClockObserver | null;
    everObserved: boolean;
    faulted: boolean;
    admission: Admission | null;
    legacyEngine: number;
    readonly legacyClocks: Set<object>;
}
export interface GameClockClient {
    /** False selects only the unchanged, unobserved AIR legacy path. */
    begin(): boolean;
    owned(): boolean;
    frame(run: () => void): void;
    end(): boolean;
}
function snapshot(entry: Entry): GameClockState {
    return Object.freeze({
        applicationPaused: entry.applicationPaused,
        backgroundPaused: entry.backgroundPaused,
        terminal: entry.terminal,
        manual: entry.manual !== null,
    });
}
export function gameClockSemanticPause(state: GameClockState): boolean {
    return state.applicationPaused || state.backgroundPaused || state.terminal;
}
function pacerPause(state: GameClockState): boolean {
    return gameClockSemanticPause(state) || state.manual;
}
function closed(): Error {
    return Object.assign(new Error('[cocosair] AIR_E_APP_CLOSED: the Game clock is terminal.'), {
        code: 'AIR_E_APP_CLOSED',
    });
}
/** Isolated source controls for CPU tests. Production uses only the singleton below. */
export class GameClockControlRegistry {
    readonly #sources = new WeakMap<object, Entry>();

    install(target: object, director: object, source: GameClockSource, initiallyPaused: boolean): void {
        if (!target || !director || this.#sources.has(target) || typeof initiallyPaused !== 'boolean')
            throw new Error('Expected an unregistered original Game source.');
        const readPaused = source.readPaused,
            applyPaused = source.applyPaused,
            disposeEvents = source.disposeEvents;
        if (typeof readPaused !== 'function' || typeof applyPaused !== 'function')
            throw new TypeError('Expected captured Game source callbacks.');
        if (disposeEvents !== undefined && typeof disposeEvents !== 'function')
            throw new TypeError('Expected an optional captured Game event disposer.');
        this.#sources.set(target, {
            director,
            source: Object.freeze({
                readPaused: () => readPaused.call(source),
                applyPaused: (paused, background) => applyPaused.call(source, paused, background),
                disposeEvents: disposeEvents ? () => disposeEvents.call(source) : undefined,
            }),
            applicationPaused: initiallyPaused,
            backgroundPaused: false,
            terminal: false,
            manual: null,
            frame: null,
            observer: null,
            everObserved: false,
            faulted: false,
            admission: null,
            legacyEngine: 0,
            legacyClocks: new Set(),
        });
    }
    #entry(target: object): Entry {
        const entry = this.#sources.get(target);
        if (!entry) throw new Error('Original Game constructor source is not installed.');
        return entry;
    }
    #latch(entry: Entry, error: unknown): never {
        if (entry.admission && !entry.admission.failed) {
            entry.admission.failed = true;
            entry.admission.error = error;
        }
        throw error;
    }
    #admit(entry: Entry): void {
        // Owner admission must latch a collecting queue BEFORE rejecting its owner phase.
        try {
            entry.observer?.admit(false);
        } catch (error) {
            this.#latch(entry, error);
        }
        if (entry.admission) this.#latch(entry, new Error('Game clock control cannot re-enter.'));
        if (entry.terminal) throw closed();
        if (entry.faulted || (entry.everObserved && !entry.observer))
            throw new Error('Observed Game clock owner is faulted or detached.');
    }
    #checked(entry: Entry): void {
        if (entry.admission?.failed) throw entry.admission.error;
    }
    #diagnostics(entry: Entry): GameClockDiagnostics {
        return Object.freeze({
            ...snapshot(entry),
            observed: entry.observer !== null,
            faulted: entry.faulted,
            frame: !entry.frame
                ? 'none'
                : entry.frame.returned
                  ? 'returned'
                  : entry.frame.entered
                    ? 'entered'
                    : 'armed',
        });
    }
    register(target: object, observer: GameClockObserver): GameClockObservation {
        const entry = this.#entry(target);
        this.#admit(entry);
        if (entry.observer || entry.legacyClocks.size || entry.manual || entry.frame)
            throw new Error('Game owner registration cannot adopt an existing owner or legacy clock.');
        const admit = observer.admit,
            prepare = observer.prepare,
            assertLive = observer.assertLive;
        if ([admit, prepare, assertLive].some((method) => typeof method !== 'function'))
            throw new TypeError('Expected Game clock observer callbacks.');
        const copied: GameClockObserver = Object.freeze({
            admit: (initial) => admit.call(observer, initial),
            prepare: (before, next, initial) => prepare.call(observer, before, next, initial),
            assertLive: () => assertLive.call(observer),
        });
        let plan: GameClockPlan | undefined,
            failed = false,
            first: unknown,
            committed = false;
        entry.admission = { failed: false, error: undefined };
        try {
            copied.admit(true);
            const initial = snapshot(entry);
            if (entry.source.readPaused() !== pacerPause(initial))
                throw new Error('Pre-observation Game reasons disagree with the original source.');
            this.#checked(entry);
            plan = copied.prepare(initial, initial, true);
            this.#checked(entry);
            committed = true;
            plan.commit();
            this.#checked(entry);
        } catch (error) {
            failed = true;
            first = entry.admission.failed ? entry.admission.error : error;
            if (committed) entry.faulted = true;
            try {
                plan?.fail({
                    error: first,
                    actual: snapshot(entry),
                    reasonCommitted: false,
                    effectEntered: false,
                    effectReturned: false,
                    sourcePaused: null,
                });
            } catch {
                /* Keep first failure. */
            }
        }
        try {
            plan?.dispose();
        } catch (error) {
            if (!failed) first = error;
            failed = entry.faulted = true;
        }
        entry.admission = null;
        if (failed) throw first;
        entry.observer = copied;
        entry.everObserved = true;
        const registry = this;
        let disposed = false;
        const lease: GameClockObservation = Object.freeze({
            assertNativeAdvance(): void {
                if (this !== lease || disposed || entry.observer !== copied)
                    throw new Error('Inactive Game clock observation.');
                registry.#native(entry);
            },
            diagnostics(): GameClockDiagnostics {
                if (this !== lease) throw new Error('Invalid Game clock observation receiver.');
                return registry.#diagnostics(entry);
            },
            dispose(): void {
                if (this !== lease) throw new Error('Invalid Game clock observation receiver.');
                if (disposed) return;
                if (entry.admission) registry.#latch(entry, new Error('Game transition is still in progress.'));
                // Losing an observed owner never reopens legacy pacing or a retained clock.
                if (entry.observer === copied) entry.observer = null;
                disposed = true;
            },
        });
        return lease;
    }
    #transition(entry: Entry, next: GameClockState, manual: object | null): boolean {
        const before = snapshot(entry),
            observer = entry.observer!;
        const changed = pacerPause(before) !== pacerPause(next);
        let plan: GameClockPlan | undefined,
            reasonCommitted = false,
            effectEntered = false,
            effectReturned = false,
            failed = false,
            first: unknown;
        entry.admission = { failed: false, error: undefined };
        try {
            if (entry.source.readPaused() !== pacerPause(before))
                throw new Error('Original Game source no longer matches observed reasons.');
            this.#checked(entry);
            plan = observer.prepare(before, next, false);
            this.#checked(entry);
            // Everything fallible has prepared. No rollback or replay after this boundary.
            reasonCommitted = true;
            entry.applicationPaused = next.applicationPaused;
            entry.backgroundPaused = next.backgroundPaused;
            entry.manual = manual;
            plan.commit();
            this.#checked(entry);
            effectEntered = true;
            entry.source.applyPaused(pacerPause(next), next.backgroundPaused);
            effectReturned = true;
            this.#checked(entry);
        } catch (error) {
            failed = true;
            first = entry.admission.failed ? entry.admission.error : error;
            if (reasonCommitted || effectEntered) entry.faulted = true;
            let sourcePaused: boolean | null = null;
            try {
                sourcePaused = entry.source.readPaused();
            } catch {
                /* Unknown actual source, not a rollback. */
            }
            try {
                plan?.fail({
                    error: first,
                    actual: snapshot(entry),
                    reasonCommitted,
                    effectEntered,
                    effectReturned,
                    sourcePaused,
                });
            } catch {
                /* Preserve primary identity, even undefined. */
            }
        }
        try {
            plan?.dispose();
        } catch (error) {
            if (!failed) first = error;
            failed = entry.faulted = true;
        }
        entry.admission = null;
        if (failed) throw first;
        return changed;
    }
    reason(target: object, reason: 'application' | 'background', paused: boolean): { changed: boolean } | undefined {
        const entry = this.#entry(target);
        this.#admit(entry);
        if (!entry.observer) {
            if (reason === 'background') entry.backgroundPaused = paused;
            else if (!entry.legacyEngine) entry.applicationPaused = paused;
            return undefined; // Preserve original cache, callback and pacer ordering.
        }
        const next = {
            ...snapshot(entry),
            ...(reason === 'application' ? { applicationPaused: paused } : { backgroundPaused: paused }),
        };
        return { changed: this.#transition(entry, Object.freeze(next), entry.manual) };
    }
    legacyEngine(target: object, run: () => void): void {
        const entry = this.#entry(target);
        ++entry.legacyEngine;
        try {
            run();
        } finally {
            --entry.legacyEngine;
        }
    }
    #executable(entry: Entry): void {
        if (entry.terminal) throw closed();
        if (entry.faulted || (entry.everObserved && !entry.observer))
            throw new Error('Observed Game clock owner is faulted or detached.');
        if (entry.admission) this.#latch(entry, new Error('Frame entry during Game control.'));
        if (!entry.observer) return;
        entry.observer.assertLive();
        if (gameClockSemanticPause(snapshot(entry))) throw new Error('Observed Game is semantically paused.');
    }
    beforeStep(target: object, director: object): void {
        const entry = this.#sources.get(target);
        if (!entry) return; // Only original registered Game identities are observed.
        this.#executable(entry);
        if (!entry.observer) return;
        if (entry.director !== director) throw new Error('Foreign Director for observed Game.');
        if (entry.manual && (!entry.frame || entry.frame.owner !== entry.manual || entry.frame.entered))
            throw new Error('Manual Game step requires one unused exact frame permission.');
    }
    enterFrame(target: object, director: object): (() => void) | undefined {
        this.beforeStep(target, director);
        const entry = this.#sources.get(target);
        if (!entry?.observer || !entry.manual) return undefined;
        const frame = entry.frame!;
        frame.entered = true;
        let disposed = false;
        return () => {
            if (disposed) throw new Error('Director frame scope already returned.');
            disposed = true;
            frame.returned = true;
        };
    }
    #native(entry: Entry): void {
        this.#executable(entry);
        if (
            entry.manual &&
            (!entry.frame || entry.frame.owner !== entry.manual || !entry.frame.entered || entry.frame.returned)
        )
            throw new Error('Native advancement requires the exact active owned Director frame.');
    }
    client(target: object): GameClockClient {
        const entry = this.#entry(target),
            registry = this,
            token = Object.freeze({});
        let mode: 'new' | 'legacy' | 'observed' = 'new';
        let ended = false;
        const client: GameClockClient = Object.freeze({
            begin(): boolean {
                if (this !== client) throw new Error('Invalid Game clock client receiver.');
                registry.#admit(entry);
                if (mode === 'legacy' && entry.observer)
                    throw new Error('Legacy clock cannot adopt an observed owner.');
                if (!entry.observer) {
                    if (mode === 'observed') throw new Error('Observed clock lost its owner.');
                    mode = 'legacy';
                    entry.legacyClocks.add(token);
                    return false;
                }
                mode = 'observed';
                entry.observer.assertLive();
                if (entry.manual === token) return true;
                if (entry.manual || entry.frame) throw new Error('Another exact manual Game clock is active.');
                if (gameClockSemanticPause(snapshot(entry)))
                    throw new Error('Cannot begin a semantically paused Game.');
                registry.#transition(entry, Object.freeze({ ...snapshot(entry), manual: true }), token);
                ended = false;
                return true;
            },
            owned(): boolean {
                if (this !== client) throw new Error('Invalid Game clock client receiver.');
                registry.#admit(entry);
                return mode === 'observed' || entry.observer !== null;
            },
            frame(run: () => void): void {
                if (this !== client) throw new Error('Invalid Game clock client receiver.');
                registry.#admit(entry);
                if (mode !== 'observed' || entry.manual !== token || !entry.observer)
                    throw new Error('Owned clock step requires begin and its exact live lease.');
                registry.#executable(entry);
                if (entry.frame) throw new Error('Nested or parallel owned frame.');
                const frame: Frame = { owner: token, entered: false, returned: false };
                entry.frame = frame;
                try {
                    run();
                    if (!frame.entered || !frame.returned) throw new Error('Original Director frame did not return.');
                    if (entry.terminal) throw closed();
                    if (entry.faulted || entry.manual !== token || !entry.observer)
                        throw new Error('Owned frame lost its live Game owner.');
                } finally {
                    if (entry.frame === frame) entry.frame = null;
                }
            },
            end(): boolean {
                if (this !== client) throw new Error('Invalid Game clock client receiver.');
                registry.#admit(entry);
                if (mode !== 'observed') {
                    if (entry.observer) throw new Error('Clock has not acquired this observed Game.');
                    entry.legacyClocks.delete(token);
                    return false;
                }
                if (!entry.observer) throw new Error('Observed clock lost its owner.');
                if (entry.frame) throw new Error('Cannot end an active owned frame.');
                if (entry.manual === null && ended) return true;
                if (entry.manual !== token) throw new Error('Clock no longer owns the manual Game lease.');
                registry.#transition(entry, Object.freeze({ ...snapshot(entry), manual: false }), null);
                ended = true;
                return true;
            },
        });
        return client;
    }
    /** Sticky before observer admission and before user teardown; faulted owners cannot veto termination. */
    terminal(target: object): boolean {
        return this.#entry(target).terminal;
    }
    terminate(target: object): boolean {
        const entry = this.#entry(target);
        if (!entry.everObserved && !entry.observer) return false;
        if (entry.terminal) return true;
        const before = snapshot(entry);
        entry.terminal = true;
        entry.manual = null;
        entry.frame = null;
        const next = snapshot(entry);
        let plan: GameClockPlan | undefined,
            failed = false,
            first: unknown,
            effectEntered = false,
            effectReturned = false;
        const previousAdmission = entry.admission;
        entry.admission = { failed: false, error: undefined };
        try {
            entry.observer?.admit(false);
            plan = entry.observer?.prepare(before, next, false);
            this.#checked(entry);
            plan?.commit();
        } catch (error) {
            failed = true;
            first = error;
        }
        // Terminal was latched first: detach exactly once, even if owner admission failed.
        try {
            entry.source.disposeEvents?.();
        } catch (error) {
            if (!failed) first = error;
            failed = true;
        }
        // Pacer stop is independent of owner or event-detach failure, before user teardown.
        try {
            effectEntered = true;
            entry.source.applyPaused(true, entry.backgroundPaused);
            effectReturned = true;
            this.#checked(entry);
        } catch (error) {
            if (!failed) first = error;
            failed = true;
        }
        if (failed) {
            entry.faulted = true;
            try {
                plan?.fail({
                    error: first,
                    actual: next,
                    reasonCommitted: true,
                    effectEntered,
                    effectReturned,
                    sourcePaused: null,
                });
            } catch {
                /* Preserve first. */
            }
        }
        try {
            plan?.dispose();
        } catch (error) {
            if (!failed) first = error;
            failed = entry.faulted = true;
        }
        entry.admission = previousAdmission;
        if (previousAdmission && !previousAdmission.failed) {
            previousAdmission.failed = true;
            previousAdmission.error = failed ? first : closed();
        }
        if (failed) throw first;
        return true;
    }
}
const registry = new GameClockControlRegistry();
export function installGameClockSource(
    target: object,
    director: object,
    source: GameClockSource,
    paused: boolean,
): void {
    registry.install(target, director, source, paused);
}
export function registerGameClockObserver(target: object, observer: GameClockObserver): GameClockObservation {
    return registry.register(target, observer);
}
export function changeGameClockReason(
    target: object,
    reason: 'application' | 'background',
    paused: boolean,
): { changed: boolean } | undefined {
    return registry.reason(target, reason, paused);
}
export function withLegacyGameEngineReason(target: object, run: () => void): void {
    registry.legacyEngine(target, run);
}
export function assertGameClockStep(target: object, director: object): void {
    registry.beforeStep(target, director);
}
export function enterGameClockFrame(target: object, director: object): (() => void) | undefined {
    return registry.enterFrame(target, director);
}
export function createGameClockClient(target: object): GameClockClient {
    return registry.client(target);
}
export function terminateGameClock(target: object): boolean {
    return registry.terminate(target);
}
export function isGameClockTerminal(target: object): boolean {
    return registry.terminal(target);
}
