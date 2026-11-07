import { createWorkerBackend } from '../../src/air/platform/worker-web';
import { WorkerPool } from '../../src/cocos/misc/worker-pool';
import { resetWorkerBackendCache } from '../../src/cocos/misc/worker';
import { wasm } from '../../src/exports/webassembly';
import * as palWasm from 'pal/wasm';

const host = globalThis as any;
let saved: any;
beforeEach(() => {
    saved = { Worker: host.Worker, Blob: host.Blob, URL: host.URL, crossOriginIsolated: host.crossOriginIsolated };
    resetWorkerBackendCache();
});
afterEach(() => {
    Object.assign(host, saved);
    resetWorkerBackendCache();
});

test('wasm exports the four existing Web PAL helpers unchanged', async () => {
    expect(Object.keys(wasm).sort()).toEqual(['ensureWasmModuleReady', 'fetchBuffer', 'fetchUrl', 'instantiateWasm']);
    expect(wasm.instantiateWasm).toBe(palWasm.instantiateWasm);
    expect(wasm.fetchBuffer).toBe(palWasm.fetchBuffer);
    expect(wasm.fetchUrl).toBe(palWasm.fetchUrl);
    expect(wasm.ensureWasmModuleReady).toBe(palWasm.ensureWasmModuleReady);
    await expect(wasm.ensureWasmModuleReady()).resolves.toBeUndefined();
});

test('missing browser Worker has no parallel/native/minigame backend, but functions still run inline', async () => {
    host.Worker = undefined;
    const backend = createWorkerBackend();
    expect(backend.concurrencyLimit).toBe(0);
    expect(backend.supportsFunctionWorker).toBe(false);
    expect(backend.supportsStandardWorker).toBe(false);
    expect(backend.scriptFallback).toBeNull();
    expect(backend.resolveScriptWorker('task.js').backend).toBeNull();
    const pool = new WorkerPool((a: number) => a * 2);
    try {
        expect(pool.backend).toBe('sync');
        await expect(pool.run([21])).resolves.toBe(42);
    } finally {
        pool.terminate();
    }
});

test('Blob URLs survive construction and are revoked once on termination or immediately on constructor failure', () => {
    const revoke = jest.fn();
    const terminate = jest.fn();
    host.URL = { createObjectURL: () => 'blob:owned', revokeObjectURL: revoke };
    host.Worker = class {
        terminate = terminate;
    };
    const backend = createWorkerBackend();
    const worker = backend.createFunctionWorker(() => 42)!;
    expect(revoke).not.toHaveBeenCalled();
    worker.terminate();
    worker.terminate();
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:owned');
    host.Worker = class {
        constructor() {
            throw new Error('CSP blocked');
        }
    };
    expect(() => createWorkerBackend().createFunctionWorker(() => 1)).toThrow('CSP blocked');
    expect(revoke).toHaveBeenCalledTimes(2);
});

test('transfer list passes through unchanged; messageerror is routed and termination detaches listeners', () => {
    let raw: any;
    host.Worker = class {
        postMessage = jest.fn();
        terminate = jest.fn();
        constructor() {
            raw = this;
        }
    };
    const worker = createWorkerBackend().createScriptWorker('task.js');
    const data = { payload: new ArrayBuffer(4) };
    const transfer = [data.payload];
    worker.postMessage(data, transfer);
    expect(raw.postMessage).toHaveBeenCalledWith(data, transfer);
    const error = jest.fn();
    worker.onError(error);
    raw.onmessageerror({});
    expect(error.mock.calls[0][0].message).toMatch(/deserialized/);
    worker.terminate();
    expect(raw.onmessageerror).toBeNull();
    expect(raw.onerror).toBeNull();
    expect(() => worker.postMessage(data)).toThrow(/terminated/);
});

test('SharedArrayBuffer capability requires cross-origin isolation', () => {
    host.Worker = class {};
    host.crossOriginIsolated = false;
    expect(createWorkerBackend().supportsSharedArrayBuffer).toBe(false);
    host.crossOriginIsolated = true;
    expect(createWorkerBackend().supportsSharedArrayBuffer).toBe(typeof SharedArrayBuffer !== 'undefined');
});
