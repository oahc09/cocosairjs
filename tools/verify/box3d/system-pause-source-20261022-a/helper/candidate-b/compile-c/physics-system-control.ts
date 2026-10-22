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
/** Internal System cache observation over B0. No AIR/native imports, public barrel,
 * world lookup, native authority, queue/producers or inferred physical outcome.
 */
import { PhysicsStateObserverRegistry } from './physics-state-observer';
import type {
    PhysicsStateChangeTicket,
    PhysicsStateChangeContext,
    PhysicsStateEffect,
    PhysicsStateObserver,
    PhysicsStateSnapshot,
} from './physics-state-observer';

export type PhysicsSystemControlOperation = 'system-enable' | 'system-auto-simulation';
export type PhysicsSystemControlState = Extract<PhysicsStateSnapshot, { kind: 'system-control' }>;
export type PhysicsSystemDisposition = 'ready' | 'paused';
export interface PhysicsSystemControlLease {
    readonly initialState: PhysicsSystemControlState;
    dispose(): void;
}
type Source = () => Readonly<{ enabled: boolean; autoSimulation: boolean }>;
type Entry = {
    readonly source: Source;
    readonly disposition: () => PhysicsSystemDisposition;
    ticket?: PhysicsStateChangeTicket;
};
type Admission = { failed: boolean; error: unknown };
function object(value: unknown): value is object {
    return value !== null && typeof value === 'object';
}
function state(source: Source): PhysicsSystemControlState {
    const input = source();
    if (!object(input)) throw new TypeError('System control source must return private flags.');
    const enabled = input.enabled,
        autoSimulation = input.autoSimulation;
    if (typeof enabled !== 'boolean' || typeof autoSimulation !== 'boolean')
        throw new TypeError('Observed System control flags must be boolean.');
    return Object.freeze({ kind: 'system-control', enabled, autoSimulation });
}

/** Isolated registry for source controls. Production uses the single private instance below. */
export class PhysicsSystemControlRegistry {
    readonly #observer = new PhysicsStateObserverRegistry();
    readonly #sources = new WeakMap<object, Source>();
    readonly #entries = new WeakMap<object, Entry>();
    #admission: Admission | undefined;

    #notAdmitting(): void {
        if (!this.#admission) return;
        const error = new Error('System execution admission cannot re-enter.');
        if (!this.#admission.failed) {
            this.#admission.failed = true;
            this.#admission.error = error;
        }
        throw error;
    }
    /** Called only by the original System constructor, with a closure over private fields. */
    installSource(target: object, source: Source): void {
        this.#notAdmitting();
        if (!object(target) || typeof source !== 'function')
            throw new TypeError('Expected System identity and source.');
        if (this.#sources.has(target)) throw new Error('System control source already installed.');
        this.#sources.set(target, source);
    }
    /** Private owner bootstrap read. It neither registers an observer nor checks selector binding. */
    readState(target: object): PhysicsSystemControlState {
        this.#notAdmitting();
        const source = this.#sources.get(target);
        if (!source) throw new Error('Original System control source is not installed.');
        const ticket = this.#entries.get(target)?.ticket;
        if (ticket && !ticket.diagnostics().disposed) throw new Error('System control transition is in progress.');
        const admission: Admission = { failed: false, error: undefined };
        this.#admission = admission;
        try {
            const actual = state(source);
            if (admission.failed) throw admission.error;
            return actual;
        } catch (error) {
            throw admission.failed ? admission.error : error;
        } finally {
            this.#admission = undefined;
        }
    }
    register(
        target: object,
        observer: PhysicsStateObserver,
        disposition: () => PhysicsSystemDisposition,
    ): PhysicsSystemControlLease {
        this.#notAdmitting();
        const registry = this;
        let copied!: PhysicsStateObserver, initialState!: PhysicsSystemControlState, source!: Source;
        // B0 guards callback/source reads and rejects caught registration reentry.
        const lease = this.#observer.register(target, {
            get open() {
                if (registry.#entries.has(target)) throw new Error('System already has an observed physical owner.');
                const found = registry.#sources.get(target);
                if (!found || !object(observer) || typeof disposition !== 'function')
                    throw new TypeError('Expected original System source, observer and disposition reader.');
                source = found;
                const open = observer.open,
                    preflight = observer.preflight,
                    commit = observer.commit,
                    fail = observer.fail,
                    dispose = observer.dispose;
                if ([open, preflight, commit, fail, dispose].some((method) => typeof method !== 'function'))
                    throw new TypeError('System observer requires five trusted callbacks.');
                copied = Object.freeze({ open, preflight, commit, fail, dispose });
                initialState = state(source);
                return (context: Readonly<PhysicsStateChangeContext>) => copied.open.call(observer, context);
            },
            preflight: (context, before, candidate) => copied.preflight.call(observer, context, before, candidate),
            commit: (context, actual) => copied.commit.call(observer, context, actual),
            fail: (context, failure) => copied.fail.call(observer, context, failure),
            dispose: (context) => copied.dispose.call(observer, context),
        });
        const entry: Entry = { source, disposition };
        const result: PhysicsSystemControlLease = Object.freeze({
            initialState,
            dispose(): void {
                if (this !== result) throw new Error('Invalid System control lease receiver.');
                registry.#notAdmitting();
                lease.dispose(); // Open B0 tickets refuse before unregistering either registry.
                if (registry.#entries.get(target) === entry) registry.#entries.delete(target);
            },
        });
        this.#entries.set(target, entry);
        return result;
    }
    begin(target: object, operation: PhysicsSystemControlOperation): PhysicsStateChangeTicket | undefined {
        this.#notAdmitting();
        const entry = this.#entries.get(target);
        if (!entry) return undefined; // Preserve no-observer behavior without reading source or operation.
        if (operation !== 'system-enable' && operation !== 'system-auto-simulation')
            throw new TypeError('Unknown System control operation.');
        const ticket = this.#observer.begin(target, operation)!;
        entry.ticket = ticket;
        const registry = this;
        const receiver = (value: unknown): void => {
            registry.#notAdmitting();
            if (value !== result) throw new Error('Invalid System control ticket receiver.');
        };
        const unlink = (): void => {
            if (ticket.diagnostics().disposed && entry.ticket === ticket) entry.ticket = undefined;
        };
        const result: PhysicsStateChangeTicket = Object.freeze({
            prepare(reader: () => Readonly<{ before: PhysicsStateSnapshot; candidate: PhysicsStateSnapshot }>): void {
                receiver(this);
                try {
                    ticket.prepare(reader);
                } finally {
                    unlink();
                }
            },
            effect(fact: PhysicsStateEffect): void {
                receiver(this);
                try {
                    ticket.effect(fact);
                } finally {
                    unlink();
                }
            },
            commit(reader: () => PhysicsStateSnapshot): void {
                receiver(this);
                try {
                    ticket.commit(reader);
                } finally {
                    unlink();
                }
            },
            fail(error: unknown, reader?: () => PhysicsStateSnapshot): never {
                receiver(this);
                const diagnostic = ticket.diagnostics();
                // prepare/effect/commit may already have notified, released and terminalized B0.
                if (diagnostic.disposed) throw diagnostic.hasFailure ? diagnostic.error : error;
                try {
                    return ticket.fail(error, reader);
                } finally {
                    unlink();
                }
            },
            dispose(): void {
                receiver(this);
                try {
                    ticket.dispose();
                } finally {
                    unlink();
                }
            },
            diagnostics() {
                if (this !== result) throw new Error('Invalid System control ticket receiver.');
                return ticket.diagnostics();
            },
        });
        return result;
    }
    disposition(target: object): PhysicsSystemDisposition | undefined {
        this.#notAdmitting();
        const entry = this.#entries.get(target);
        if (!entry) return undefined;
        if (entry.ticket && !entry.ticket.diagnostics().disposed)
            throw new Error('System control transition is in progress.');
        const admission: Admission = { failed: false, error: undefined };
        this.#admission = admission;
        try {
            const actual = state(entry.source);
            const disposition = entry.disposition(); // Owner throws its original fault/closed/binding error.
            if (admission.failed) throw admission.error;
            if (disposition !== 'ready' && disposition !== 'paused') throw new TypeError('Invalid owner disposition.');
            return actual.enabled ? disposition : 'paused';
        } catch (error) {
            throw admission.failed ? admission.error : error;
        } finally {
            this.#admission = undefined;
        }
    }
    assertManualStep(target: object): void {
        if (this.disposition(target) === 'paused') throw new Error('Observed physics owner is paused.');
    }
}
const registry = new PhysicsSystemControlRegistry();
export function installPhysicsSystemControlSource(target: object, source: Source): void {
    registry.installSource(target, source);
}
export function registerPhysicsSystemControl(
    target: object,
    observer: PhysicsStateObserver,
    disposition: () => PhysicsSystemDisposition,
): PhysicsSystemControlLease {
    return registry.register(target, observer, disposition);
}
export function readPhysicsSystemControl(target: object): PhysicsSystemControlState {
    return registry.readState(target);
}
export function beginPhysicsSystemControl(
    target: object,
    operation: PhysicsSystemControlOperation,
): PhysicsStateChangeTicket | undefined {
    return registry.begin(target, operation);
}
export function getPhysicsSystemControlDisposition(target: object): PhysicsSystemDisposition | undefined {
    return registry.disposition(target);
}
export function assertPhysicsSystemManualStep(target: object): void {
    registry.assertManualStep(target);
}
