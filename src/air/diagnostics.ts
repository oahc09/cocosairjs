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
/** Opt-in observation of the native Cocos diagnostic stream (PG-18). */
import { _subscribeDiagnosticLogs } from '../cocos/core/platform/debug';
import type { DiagnosticLogEntry } from '../cocos/core/platform/debug';

export type AirDiagnosticMode = 'errors' | 'warnings';

export interface AirDiagnosticMessage extends DiagnosticLogEntry {
    /** Repeated identical native diagnostics share one bounded entry. */
    occurrences: number;
    firstSeen: number;
    lastSeen: number;
}

export interface AirDiagnostics {
    readonly mode: AirDiagnosticMode;
    snapshot(): readonly AirDiagnosticMessage[];
    onMessage(listener: (message: Readonly<AirDiagnosticMessage>) => void): () => void;
    clear(): void;
    /** Idempotently unsubscribe this channel. Used by app cleanup or failed boot. */
    destroy(): void;
}

/** @engineInternal Bootstrap owns this bounded channel; no console monkey patching. */
export function createAirDiagnostics (mode: AirDiagnosticMode = 'errors'): AirDiagnostics {
    if (mode !== 'errors' && mode !== 'warnings') {
        throw new TypeError('[AIR_E_DIAGNOSTIC_MODE] diagnostics must be errors or warnings');
    }
    const entries = new Map<string, AirDiagnosticMessage>();
    const listeners = new Set<(message: Readonly<AirDiagnosticMessage>) => void>();
    let closed = false;
    const unsubscribe = _subscribeDiagnosticLogs((entry) => {
        if (closed || (entry.severity === 'warning' && mode !== 'warnings')) { return; }
        const message = entry.message.slice(0, 600);
        const key = `${entry.severity}:${entry.id}:${message}`;
        const now = Date.now();
        const previous = entries.get(key);
        const record: AirDiagnosticMessage = previous
            ? { ...previous, occurrences: previous.occurrences + 1, lastSeen: now }
            : { ...entry, message, occurrences: 1, firstSeen: now, lastSeen: now };
        entries.delete(key);
        entries.set(key, record);
        if (entries.size > 80) { entries.delete(entries.keys().next().value); }
        // Deliver each distinct message once, while keeping repeated occurrences observable.
        if (!previous) {
            for (const listener of Array.from(listeners)) {
                if (!listeners.has(listener)) { continue; }
                try { listener(Object.freeze({ ...record })); } catch { /* Diagnostic observers are isolated. */ }
            }
        }
    });
    return {
        mode,
        snapshot: () => Array.from(entries.values(), (entry) => Object.freeze({ ...entry })),
        onMessage: (listener) => {
            if (closed) { return (): void => {}; }
            if (typeof listener !== 'function') { throw new TypeError('diagnostic listener must be a function'); }
            const owned = (entry: Readonly<AirDiagnosticMessage>): void => listener(entry);
            listeners.add(owned);
            return (): void => { listeners.delete(owned); };
        },
        clear: () => { entries.clear(); },
        destroy: () => {
            if (closed) { return; }
            closed = true;
            unsubscribe();
            listeners.clear();
            entries.clear();
        },
    };
}
