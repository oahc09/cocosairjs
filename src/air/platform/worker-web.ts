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

import type { IPlatformWorkerBackend, IWorker, IWorkerDiagnosis } from 'pal/worker';

/**
 * AIR-owned browser adapter for the upstream Worker contract. No native or
 * mini-game implementation and no dependency on the frozen PAL vendor snapshot.
 */
function wrapWorker(worker: Worker, release?: () => void): IWorker {
    let stopped = false;
    return {
        postMessage(message, transfer = []) {
            if (stopped) throw new Error('Worker has been terminated');
            worker.postMessage(message, transfer);
        },
        onMessage(listener) {
            if (!stopped) worker.onmessage = (event) => listener(event.data);
        },
        onError(listener) {
            if (!stopped) {
                worker.onerror = listener;
                worker.onmessageerror = () => listener(new Error('Worker message could not be deserialized'));
            }
        },
        terminate() {
            if (stopped) return;
            stopped = true;
            worker.onmessage = worker.onerror = worker.onmessageerror = null;
            try {
                worker.terminate();
            } finally {
                if (release) release();
            }
        },
    };
}

// Stringified into a fresh worker realm. Do not capture module state here.
function bootstrap(task: (...args: any[]) => any): void {
    const scope = self as any;
    function collect(value: any): ArrayBuffer[] | undefined {
        try {
            const buffers = new Set<ArrayBuffer>();
            const seen = new Set<object>();
            const stack = [{ value, depth: 0 }];
            while (stack.length) {
                const item = stack.pop()!;
                const current = item.value;
                if (!current || typeof current !== 'object' || seen.has(current)) continue;
                seen.add(current);
                if (current instanceof ArrayBuffer) {
                    buffers.add(current);
                } else if (ArrayBuffer.isView(current)) {
                    if (current.buffer instanceof ArrayBuffer) buffers.add(current.buffer);
                } else if (item.depth < 64) {
                    // Never detach inherited values that structured clone would not include.
                    for (const key of Object.keys(current)) {
                        stack.push({ value: current[key], depth: item.depth + 1 });
                    }
                }
            }
            return Array.from(buffers);
        } catch {
            // Transfer collection is only an optimization. Let structured clone decide validity.
            return undefined;
        }
    }
    function failure(id: any, error: any): void {
        let message = 'Worker task failed';
        try {
            message = String(error && error.message ? error.message : error);
        } catch {
            /* An exception may itself be unprintable. */
        }
        scope.postMessage({ id, ok: false, error: message });
    }
    scope.onmessage = (event: any): void => {
        const { id, args } = event.data;
        const success = (value: any): void => {
            try {
                scope.postMessage({ id, ok: true, value }, collect(value));
            } catch (error) {
                failure(id, error);
            }
        };
        try {
            const result = task(...(Array.isArray(args) ? args : []));
            if (result && typeof result.then === 'function') {
                Promise.resolve(result).then(success, (error) => failure(id, error));
            } else {
                success(result);
            }
        } catch (error) {
            failure(id, error);
        }
    };
}

export function createWorkerBackend(): IPlatformWorkerBackend {
    const available = typeof Worker === 'function';
    const functions =
        available &&
        typeof Blob === 'function' &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function' &&
        typeof URL.revokeObjectURL === 'function';
    const reason = available ? '' : 'no worker backend on this platform: browser Worker is unavailable';
    const diagnose = (path: string): IWorkerDiagnosis => ({
        ready: available && typeof path === 'string' && path.length > 0,
        version: available && typeof path === 'string' && path.length > 0 ? 1 : 0,
        reason: reason || (typeof path === 'string' && path.length > 0 ? '' : 'Worker script path is empty'),
    });
    const backend: IPlatformWorkerBackend = {
        concurrencyLimit: available ? Infinity : 0,
        supportsTransfer: available,
        supportsSharedArrayBuffer:
            available && typeof SharedArrayBuffer !== 'undefined' && (globalThis as any).crossOriginIsolated === true,
        supportsFunctionWorker: functions,
        // This upstream flag describes the mini-game V2 API, not browser Workers.
        supportsStandardWorker: false,
        capabilityReason: reason,
        hardwareConcurrency:
            typeof navigator !== 'undefined' &&
            Number.isFinite(navigator.hardwareConcurrency) &&
            navigator.hardwareConcurrency > 0
                ? navigator.hardwareConcurrency
                : 1,
        scriptFallback: null,
        scriptFailureHint:
            'Use a same-origin browser worker URL, allow it in CSP, and implement the WorkerPool protocol.',
        diagnose,
        resolveScriptWorker(path) {
            const diagnosis = diagnose(path);
            return { backend: diagnosis.ready ? backend : null, diagnosis, warnOnFailure: !diagnosis.ready };
        },
        createScriptWorker(path) {
            const diagnosis = diagnose(path);
            if (!diagnosis.ready) throw new Error(diagnosis.reason);
            // Existence and CSP failures are asynchronous browser error events, not preflight guarantees.
            return wrapWorker(new Worker(path));
        },
        createFunctionWorker(fn) {
            if (!functions) return null;
            const source = Function.prototype.toString.call(fn);
            const url = URL.createObjectURL(
                new Blob(['(' + bootstrap.toString() + ')((' + source + '));'], { type: 'text/javascript' }),
            );
            try {
                return wrapWorker(new Worker(url), () => URL.revokeObjectURL(url));
            } catch (error) {
                URL.revokeObjectURL(url);
                throw error;
            }
        },
    };
    return backend;
}
