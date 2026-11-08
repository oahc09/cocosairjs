# Web workers in Cocos AIR

The main package exports `WorkerPool`, `createWorker`, `getWorkerCapabilities`, `isWorkerSupported`, `isSupportStandardWorker`, `getWorkerConcurrencyLimit`, `getOptimalWorkerCount`, and `checkWorkerScript` plus their public types. Only browser Web Workers are shipped. There is no native or mini-game Worker adapter in AIR.

## Self-contained function tasks

```ts
import { WorkerPool } from 'cocosair.js';

const pool = new WorkerPool((n: number) => n * 2, { maxWorkers: 2, timeout: 5000 });
try {
    const result = await pool.run([21]);
    console.log(result); // 42
} finally {
    pool.terminate();
}
```

A function is serialized into a Blob worker. It must not reference imports, closure variables, engine objects, or the document. Async functions are supported. When browser Worker/Blob support is absent or worker construction fails, function tasks may run on the main thread. Do not use this fallback for work that can block the UI indefinitely.

The page CSP must allow the worker's source, including `blob:` for function tasks. `checkWorkerScript()` only checks API availability and a nonempty script path; it cannot prove network access, MIME type, CSP, or script correctness before the asynchronous worker starts.

## Script tasks and transfers

Deploy [cc-worker-template.js](cc-worker-template.js) as a same-origin script, replace its task body, and pass its URL to `new WorkerPool(url, options)`. The pool sends `{ id, args }` and requires `{ id, ok: true, value }` or `{ id, ok: false, error }`. Raw `createWorker(url)` does not impose this protocol and is suitable for caller-managed messages.

`run(args, transferList)` transfers ownership of ArrayBuffers to the worker. Do not read a transferred input afterward. Transferable function results are collected with alias/cycle-safe traversal. A failed task whose arguments were transferred is rejected rather than rerun with detached data. A script pool can provide `options.fallback`; it must compute the same result and be safe to retry. Without a fallback, unavailable or broken script workers reject. Computation failures do not silently switch backends.

The default pool has one worker. Excess tasks queue. `idleReleaseAfter` defaults to 1000 ms; zero disables idle retirement. `timeout` defaults to zero, meaning no deadline. Set a suitable positive timeout in production. `terminate()` rejects pending tasks and releases workers, timers, listeners and adapter-owned Blob URLs. Caller-created Blob URLs remain caller-owned.

## WebAssembly

The `wasm` namespace exposes the existing Web PAL `fetchUrl`, `fetchBuffer`, `instantiateWasm` and `ensureWasmModuleReady`. Relative URLs resolve against the emitted engine module. This facade does not bundle a new WASM backend and does not bypass fetch, CORS or CSP restrictions.

See [the integration record](../notes/cocos4-ts-integration.md) for scope and verification limits.
