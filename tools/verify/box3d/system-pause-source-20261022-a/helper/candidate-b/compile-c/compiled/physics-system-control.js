"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertPhysicsSystemManualStep = exports.getPhysicsSystemControlDisposition = exports.beginPhysicsSystemControl = exports.readPhysicsSystemControl = exports.registerPhysicsSystemControl = exports.installPhysicsSystemControlSource = exports.PhysicsSystemControlRegistry = void 0;
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
const physics_state_observer_1 = require("./physics-state-observer");
function object(value) {
    return value !== null && typeof value === 'object';
}
function state(source) {
    const input = source();
    if (!object(input))
        throw new TypeError('System control source must return private flags.');
    const enabled = input.enabled, autoSimulation = input.autoSimulation;
    if (typeof enabled !== 'boolean' || typeof autoSimulation !== 'boolean')
        throw new TypeError('Observed System control flags must be boolean.');
    return Object.freeze({ kind: 'system-control', enabled, autoSimulation });
}
/** Isolated registry for source controls. Production uses the single private instance below. */
class PhysicsSystemControlRegistry {
    #observer = new physics_state_observer_1.PhysicsStateObserverRegistry();
    #sources = new WeakMap();
    #entries = new WeakMap();
    #admission;
    #notAdmitting() {
        if (!this.#admission)
            return;
        const error = new Error('System execution admission cannot re-enter.');
        if (!this.#admission.failed) {
            this.#admission.failed = true;
            this.#admission.error = error;
        }
        throw error;
    }
    /** Called only by the original System constructor, with a closure over private fields. */
    installSource(target, source) {
        this.#notAdmitting();
        if (!object(target) || typeof source !== 'function')
            throw new TypeError('Expected System identity and source.');
        if (this.#sources.has(target))
            throw new Error('System control source already installed.');
        this.#sources.set(target, source);
    }
    /** Private owner bootstrap read. It neither registers an observer nor checks selector binding. */
    readState(target) {
        this.#notAdmitting();
        const source = this.#sources.get(target);
        if (!source)
            throw new Error('Original System control source is not installed.');
        const ticket = this.#entries.get(target)?.ticket;
        if (ticket && !ticket.diagnostics().disposed)
            throw new Error('System control transition is in progress.');
        const admission = { failed: false, error: undefined };
        this.#admission = admission;
        try {
            const actual = state(source);
            if (admission.failed)
                throw admission.error;
            return actual;
        }
        catch (error) {
            throw admission.failed ? admission.error : error;
        }
        finally {
            this.#admission = undefined;
        }
    }
    register(target, observer, disposition) {
        this.#notAdmitting();
        const registry = this;
        let copied, initialState, source;
        // B0 guards callback/source reads and rejects caught registration reentry.
        const lease = this.#observer.register(target, {
            get open() {
                if (registry.#entries.has(target))
                    throw new Error('System already has an observed physical owner.');
                const found = registry.#sources.get(target);
                if (!found || !object(observer) || typeof disposition !== 'function')
                    throw new TypeError('Expected original System source, observer and disposition reader.');
                source = found;
                const open = observer.open, preflight = observer.preflight, commit = observer.commit, fail = observer.fail, dispose = observer.dispose;
                if ([open, preflight, commit, fail, dispose].some((method) => typeof method !== 'function'))
                    throw new TypeError('System observer requires five trusted callbacks.');
                copied = Object.freeze({ open, preflight, commit, fail, dispose });
                initialState = state(source);
                return (context) => copied.open.call(observer, context);
            },
            preflight: (context, before, candidate) => copied.preflight.call(observer, context, before, candidate),
            commit: (context, actual) => copied.commit.call(observer, context, actual),
            fail: (context, failure) => copied.fail.call(observer, context, failure),
            dispose: (context) => copied.dispose.call(observer, context),
        });
        const entry = { source, disposition };
        const result = Object.freeze({
            initialState,
            dispose() {
                if (this !== result)
                    throw new Error('Invalid System control lease receiver.');
                registry.#notAdmitting();
                lease.dispose(); // Open B0 tickets refuse before unregistering either registry.
                if (registry.#entries.get(target) === entry)
                    registry.#entries.delete(target);
            },
        });
        this.#entries.set(target, entry);
        return result;
    }
    begin(target, operation) {
        this.#notAdmitting();
        const entry = this.#entries.get(target);
        if (!entry)
            return undefined; // Preserve no-observer behavior without reading source or operation.
        if (operation !== 'system-enable' && operation !== 'system-auto-simulation')
            throw new TypeError('Unknown System control operation.');
        const ticket = this.#observer.begin(target, operation);
        entry.ticket = ticket;
        const registry = this;
        const receiver = (value) => {
            registry.#notAdmitting();
            if (value !== result)
                throw new Error('Invalid System control ticket receiver.');
        };
        const unlink = () => {
            if (ticket.diagnostics().disposed && entry.ticket === ticket)
                entry.ticket = undefined;
        };
        const result = Object.freeze({
            prepare(reader) {
                receiver(this);
                try {
                    ticket.prepare(reader);
                }
                finally {
                    unlink();
                }
            },
            effect(fact) {
                receiver(this);
                try {
                    ticket.effect(fact);
                }
                finally {
                    unlink();
                }
            },
            commit(reader) {
                receiver(this);
                try {
                    ticket.commit(reader);
                }
                finally {
                    unlink();
                }
            },
            fail(error, reader) {
                receiver(this);
                const diagnostic = ticket.diagnostics();
                // prepare/effect/commit may already have notified, released and terminalized B0.
                if (diagnostic.disposed)
                    throw diagnostic.hasFailure ? diagnostic.error : error;
                try {
                    return ticket.fail(error, reader);
                }
                finally {
                    unlink();
                }
            },
            dispose() {
                receiver(this);
                try {
                    ticket.dispose();
                }
                finally {
                    unlink();
                }
            },
            diagnostics() {
                if (this !== result)
                    throw new Error('Invalid System control ticket receiver.');
                return ticket.diagnostics();
            },
        });
        return result;
    }
    disposition(target) {
        this.#notAdmitting();
        const entry = this.#entries.get(target);
        if (!entry)
            return undefined;
        if (entry.ticket && !entry.ticket.diagnostics().disposed)
            throw new Error('System control transition is in progress.');
        const admission = { failed: false, error: undefined };
        this.#admission = admission;
        try {
            const actual = state(entry.source);
            const disposition = entry.disposition(); // Owner throws its original fault/closed/binding error.
            if (admission.failed)
                throw admission.error;
            if (disposition !== 'ready' && disposition !== 'paused')
                throw new TypeError('Invalid owner disposition.');
            return actual.enabled ? disposition : 'paused';
        }
        catch (error) {
            throw admission.failed ? admission.error : error;
        }
        finally {
            this.#admission = undefined;
        }
    }
    assertManualStep(target) {
        if (this.disposition(target) === 'paused')
            throw new Error('Observed physics owner is paused.');
    }
}
exports.PhysicsSystemControlRegistry = PhysicsSystemControlRegistry;
const registry = new PhysicsSystemControlRegistry();
function installPhysicsSystemControlSource(target, source) {
    registry.installSource(target, source);
}
exports.installPhysicsSystemControlSource = installPhysicsSystemControlSource;
function registerPhysicsSystemControl(target, observer, disposition) {
    return registry.register(target, observer, disposition);
}
exports.registerPhysicsSystemControl = registerPhysicsSystemControl;
function readPhysicsSystemControl(target) {
    return registry.readState(target);
}
exports.readPhysicsSystemControl = readPhysicsSystemControl;
function beginPhysicsSystemControl(target, operation) {
    return registry.begin(target, operation);
}
exports.beginPhysicsSystemControl = beginPhysicsSystemControl;
function getPhysicsSystemControlDisposition(target) {
    return registry.disposition(target);
}
exports.getPhysicsSystemControlDisposition = getPhysicsSystemControlDisposition;
function assertPhysicsSystemManualStep(target) {
    registry.assertManualStep(target);
}
exports.assertPhysicsSystemManualStep = assertPhysicsSystemManualStep;
