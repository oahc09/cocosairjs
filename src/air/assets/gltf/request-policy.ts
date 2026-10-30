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
import type { AirRequestPolicy } from './progress';
import { check } from './schema';

/** Snapshot mutable headers and merge only defined fields, including explicit default values. */
export function mergeRequestPolicy (...policies: (AirRequestPolicy | undefined)[]): AirRequestPolicy | undefined {
    let merged: AirRequestPolicy | undefined;
    for (const policy of policies) {
        if (policy === undefined) { continue; }
        merged ??= {};
        if (policy.priority !== undefined) { merged.priority = policy.priority; }
        if (policy.httpCache !== undefined) { merged.httpCache = policy.httpCache; }
        if (policy.credentials !== undefined) { merged.credentials = policy.credentials; }
        if (policy.headers !== undefined) { merged.headers = new Headers(policy.headers); }
    }
    return merged;
}

export function abortError (): DOMException { return new DOMException('glTF load aborted', 'AbortError'); }
export function throwIfAborted (signal?: AbortSignal): void { if (signal?.aborted) { throw abortError(); } }

/**
 * Cancels the consumer, not the underlying third-party operation. Always observes late
 * settlement, and disposes owned late results when requested. The factory is not run on
 * pre-abort. No caller-owned decoder is disposed or reconfigured here.
 */
export function awaitAbortable<T> (factory: () => T | PromiseLike<T>, signal?: AbortSignal,
    discard?: (value: T) => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        if (signal?.aborted) { reject(abortError()); return; }
        let settled = false;
        const aborted = (): void => {
            if (settled) { return; }
            settled = true; signal?.removeEventListener('abort', aborted); reject(abortError());
        };
        signal?.addEventListener('abort', aborted, { once: true });
        const release = (value: T): void => {
            try { discard?.(value); } catch (error) { console.warn('[glTF] late-result cleanup failed', error); }
        };
        let work: T | PromiseLike<T>;
        try { work = factory(); } catch (error) {
            if (!settled) { settled = true; signal?.removeEventListener('abort', aborted); reject(error); }
            return;
        }
        Promise.resolve(work).then((value) => {
            if (settled) { release(value); return; }
            if (signal?.aborted) { aborted(); release(value); return; }
            settled = true; signal?.removeEventListener('abort', aborted); resolve(value);
        }, (error) => {
            if (settled) { return; }
            settled = true; signal?.removeEventListener('abort', aborted); reject(error);
        });
    });
}

/** Undefined means no trustworthy HTTP origin, not the shared opaque origin 'null'. */
export function requestOrigin (url?: string): string | undefined {
    if (!url) { return undefined; }
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : undefined;
}

export function requestInit (url: string, policy?: AirRequestPolicy, signal?: AbortSignal,
    origin?: string): RequestInit & { priority?: AirRequestPolicy['priority'] } {
    const init: RequestInit & { priority?: AirRequestPolicy['priority'] } = {
        signal, credentials: policy?.credentials ?? 'same-origin',
    };
    if (policy?.priority !== undefined) { init.priority = policy.priority; }
    if (policy?.httpCache !== undefined) {
        init.cache = policy.httpCache;
        // Fetch only permits this standard cache mode with same-origin request mode.
        // A cross-origin target fails rather than silently changing the cache contract.
        if (policy.httpCache === 'only-if-cached') { init.mode = 'same-origin'; }
    }
    if (policy?.headers !== undefined && origin !== undefined && requestOrigin(url) === origin) {
        const headers = new Headers(policy.headers);
        init.headers = headers;
        let hasHeaders = false;
        headers.forEach(() => { hasHeaders = true; });
        // Automatic redirects can forward custom headers to another origin. In browsers,
        // manual cross-origin redirect locations are opaque: fail closed rather than leak.
        if (hasHeaders) { init.redirect = 'error'; }
    }
    return init;
}

function discardResponse (response: Response): void {
    try { void response.body?.cancel().catch(() => undefined); } catch { /* Body may already be locked/closed. */ }
}

export async function requestArrayBuffer (url: string, policy?: AirRequestPolicy, signal?: AbortSignal,
    origin?: string): Promise<ArrayBuffer> {
    const response = await awaitAbortable(() => fetch(url, requestInit(url, policy, signal, origin)), signal, discardResponse);
    try {
        throwIfAborted(signal);
        check(response.ok, `request failed: ${url} (${response.status})`);
        return await awaitAbortable(() => response.arrayBuffer(), signal);
    } catch (error) {
        discardResponse(response);
        throw error;
    }
}
