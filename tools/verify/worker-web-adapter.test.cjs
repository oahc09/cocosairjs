// Executes the minified AIR adapter and its generated Blob script in separate VM
// contexts. This is CPU protocol coverage, not browser/CSP acceptance evidence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

function load() {
    const source = fs.readFileSync(path.join(__dirname, '../../src/air/platform/worker-web.ts'), 'utf8');
    const compiled = esbuild.transformSync(source, {
        loader: 'ts',
        format: 'cjs',
        target: 'chrome66',
        minify: true,
    }).code;
    let blobSource;
    let raw;
    const revoked = [];
    class Worker {
        constructor() {
            raw = this;
            this.context = {
                self: {
                    postMessage: (reply, transfer) => {
                        const data = structuredClone(reply, { transfer: transfer || [] });
                        queueMicrotask(() => this.onmessage?.({ data }));
                    },
                },
                ArrayBuffer,
                Uint8Array,
                SharedArrayBuffer,
            };
            vm.createContext(this.context);
            vm.runInContext(blobSource, this.context);
        }
        postMessage(message, transfer) {
            const data = structuredClone(message, { transfer });
            this.context.self.onmessage({ data });
        }
        terminate() {
            this.stopped = true;
        }
    }
    const context = {
        module: { exports: {} },
        Worker,
        navigator: { hardwareConcurrency: 4 },
        Blob: class {
            constructor(parts) {
                blobSource = parts.join('');
            }
        },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: (url) => revoked.push(url) },
    };
    vm.runInNewContext(compiled, context);
    return { backend: context.module.exports.createWorkerBackend(), raw: () => raw, revoked };
}

function execute(worker, args, transfer = []) {
    return new Promise((resolve, reject) => {
        worker.onMessage(resolve);
        worker.onError(reject);
        worker.postMessage({ id: 7, args }, transfer);
    });
}

test('minified generated function source executes asynchronous tasks and transfers buffers in both directions', async () => {
    const { backend, revoked, raw } = load();
    const worker = backend.createFunctionWorker(async (bytes) => {
        bytes[0] *= 2;
        return { bytes, alias: bytes };
    });
    const input = new Uint8Array([21]);
    const reply = await execute(worker, [input], [input.buffer]);
    assert.equal(input.byteLength, 0);
    assert.equal(reply.id, 7);
    assert.equal(reply.ok, true);
    assert.equal(reply.value.bytes[0], 42);
    assert.equal(reply.value.alias, reply.value.bytes);
    worker.terminate();
    worker.terminate();
    assert.deepEqual(revoked, ['blob:test']);
    assert.equal(raw().stopped, true);
});

test('minified bootstrap reports thrown, async-rejected and uncloneable results as task errors', async () => {
    for (const task of [
        () => {
            throw new Error('computation failed');
        },
        async () => {
            throw new Error('async failed');
        },
        () => () => 42,
    ]) {
        const { backend } = load();
        const worker = backend.createFunctionWorker(task);
        const reply = await execute(worker, []);
        assert.equal(reply.id, 7);
        assert.equal(reply.ok, false);
        assert.equal(typeof reply.error, 'string');
        worker.terminate();
    }
});
