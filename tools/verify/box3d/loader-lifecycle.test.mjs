// These are transport/lifecycle unit tests. Fake modules are never physics evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createBox3DSTLoader, normalizeBox3DSTOptions } from '../../../src/air/physics/box3d/loader/st-loader.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const encode = (value) => Buffer.from(JSON.stringify(value));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
    });
    return { promise, resolve, reject };
};
function fixture(options = {}) {
    const identity = {
        coreSha: 'a'.repeat(40),
        bindingBaseSha: 'b'.repeat(40),
        schemaSha256: 'c'.repeat(64),
        patchChainSha256: 'd'.repeat(64),
        abiVersion: 1,
        variant: 'st-simd',
    };
    const files = new Map(
        ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts'].map((p) => [p, Buffer.from(p)]),
    );
    const manifest = {
        schemaVersion: 1,
        ...identity,
        artifacts: Array.from(files, ([path, data]) => ({ path, bytes: data.length, sha256: sha(data) })),
    };
    options.manifest?.(manifest);
    files.set('manifest.json', encode(manifest));
    const descriptor = {
        identity,
        manifestSha256: sha(files.get('manifest.json')),
        facadeSha256: sha(files.get('facade.mjs')),
    };
    options.descriptor?.(descriptor);
    const calls = [],
        released = [],
        disposed = [];
    const loader = createBox3DSTLoader(
        descriptor,
        { defaultAssetBaseUrl: './physics/st', documentBaseUrl: 'https://example.test/sub/app.html' },
        {
            async fetch(url, init) {
                const name = new URL(url).pathname.split('/').at(-1);
                calls.push({ name, signal: init.signal, url });
                if (options.fetch) return options.fetch({ name, url, init, files });
                const data = options.corrupt === name ? Buffer.from('corrupt') : files.get(name);
                return new Response(data, {
                    status: options.http === name ? 404 : 200,
                    headers: {
                        'content-type':
                            options.mime === name
                                ? 'text/plain'
                                : name.endsWith('.wasm')
                                  ? 'application/wasm'
                                  : name.endsWith('.json')
                                    ? 'application/json'
                                    : 'text/javascript',
                    },
                });
            },
            async loadModule(url) {
                calls.push({ name: 'import', url });
                if (options.loadModule) return options.loadModule(url);
                return { default: options.factory ?? (async (args) => ({ args, fake: true })) };
            },
            createBinding(module, expected) {
                if (options.createBinding) return options.createBinding(module, expected);
                return {
                    fake: true,
                    dispose() {
                        disposed.push(module);
                        if (options.disposeFailure) throw new Error('binding cleanup failed');
                    },
                };
            },
            async releaseModule(module) {
                released.push(module);
                if (options.releaseFailure) throw new Error('module cleanup failed');
            },
        },
    );
    return { loader, files, manifest, descriptor, calls, released, disposed };
}

test('import and creation are lazy; normalized options are copied and frozen without touching caller', async () => {
    const f = fixture();
    assert.equal(f.calls.length, 0);
    assert.equal(f.loader.diagnostics().status, 'IDLE');
    const input = { assetBaseUrl: './x', solverSubSteps: 2 };
    const normalized = normalizeBox3DSTOptions(input, { documentBaseUrl: 'https://example.test/sub/app' });
    assert.deepEqual(input, { assetBaseUrl: './x', solverSubSteps: 2 });
    assert.equal(normalized.assetBaseUrl, 'https://example.test/sub/x/');
    assert(Object.isFrozen(normalized));
    const oldFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = () => {
        requests++;
        throw Error('unexpected fetch');
    };
    try {
        await import('../../../src/air/physics/box3d/loader/st-loader.mjs?lazy-control=1');
    } finally {
        globalThis.fetch = oldFetch;
    }
    assert.equal(requests, 0);
});

test('invalid options and unsupported modes reject before asset requests', () => {
    const f = fixture();
    for (const options of [
        null,
        [],
        { workerCount: NaN },
        { workerCount: null },
        { solverSubSteps: null },
        { threading: null },
        { assetBaseUrl: null },
        { workerCount: Infinity },
        { workerCount: 1.5 },
        { workerCount: 2 },
        { workerCount: '1' },
        { solverSubSteps: 3 },
        { solverSubSteps: NaN },
        { solverSubSteps: '4' },
        { threading: 'unknown' },
        { threading: 'multi' },
        { threading: 'auto' },
        { assetBaseUrl: '' },
        { assetBaseUrl: 'file:///tmp/x' },
        { assetBaseUrl: 'https://a:b@example.test/x' },
        { assetBaseUrl: 'https://example.test/x?q=1' },
        { assetBaseUrl: 'https://example.test/x#fragment' },
    ])
        assert.throws(
            () => f.loader.prepare(options),
            (error) => error.code.startsWith('AIR_E_BOX3D_'),
        );
    assert.equal(f.calls.length, 0);
});

test('identical preparation is one exact promise; conflicts do not replace it; disposal is idempotent', async () => {
    const f = fixture();
    const options = { solverSubSteps: 4 };
    const one = f.loader.prepare(options),
        two = f.loader.prepare({ workerCount: 1 });
    assert.equal(one, two);
    options.solverSubSteps = 8;
    assert.throws(() => f.loader.prepare(options), { code: 'AIR_E_BOX3D_CONFIG_CONFLICT' });
    const lease = await one;
    assert.equal(lease.options.solverSubSteps, 4);
    assert.deepEqual(
        f.calls.map((c) => c.name),
        ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs', 'import'],
    );
    assert.equal(f.loader.prepare(), one);
    assert.equal(lease.binding.fake, true);
    await Promise.all([lease.dispose(), lease.dispose(), f.loader.dispose()]);
    assert.equal(f.disposed.length, 1);
    assert.equal(f.released.length, 1);
    assert.equal(f.loader.diagnostics().status, 'DISPOSED');
    const next = await f.loader.prepare();
    assert.equal(next.generation, 2);
    await lease.dispose();
    assert.equal(f.loader.diagnostics().status, 'READY');
    await next.dispose();
});

test('HTTP, MIME and integrity failures do not import or acquire a module; retry gets a new generation', async () => {
    for (const [kind, name, code] of [
        ['http', 'manifest.json', 'AIR_E_BOX3D_FETCH'],
        ['mime', 'box3d-st.wasm', 'AIR_E_BOX3D_MIME'],
        ['corrupt', 'box3d-st.wasm', 'AIR_E_BOX3D_ASSET_HASH'],
        ['corrupt', 'box3d-st.mjs', 'AIR_E_BOX3D_ASSET_HASH'],
        ['corrupt', 'manifest.json', 'AIR_E_BOX3D_ASSET_HASH'],
    ]) {
        const f = fixture({ [kind]: name });
        await assert.rejects(f.loader.prepare(), { code });
        assert.equal(
            f.calls.some((c) => c.name === 'import'),
            false,
        );
        assert.deepEqual(f.loader.diagnostics().acquired, []);
        assert.deepEqual(f.loader.diagnostics().cleanup, []);
        await assert.rejects(f.loader.prepare(), { code });
        assert.equal(f.loader.diagnostics().generation, 2);
    }
});

test('trusted identity, facade identity, required assets, duplicate and traversal paths are fail-closed', async () => {
    for (const mutate of [
        (m) => (m.schemaSha256 = 'e'.repeat(64)),
        (m) => (m.patchChainSha256 = 'e'.repeat(64)),
        (m) => delete m.patchChainSha256,
        (m) => m.artifacts.pop(),
        (m) => m.artifacts.push(m.artifacts[0]),
        (m) => (m.artifacts[0].path = '../loader.mjs'),
        (m) => (m.artifacts[0].path = '%2e%2e/loader.mjs'),
        (m) => (m.artifacts[0].path = 'https://example.test/x'),
        (m) => (m.artifacts[0].bytes = -1),
        (m) => (m.artifacts[2].sha256 = 'f'.repeat(64)),
    ]) {
        const f = fixture({ manifest: mutate });
        await assert.rejects(f.loader.prepare(), (error) =>
            ['AIR_E_BOX3D_ABI', 'AIR_E_BOX3D_MANIFEST'].includes(error.code),
        );
        assert.equal(f.calls.length, 1);
        assert.deepEqual(f.loader.diagnostics().acquired, []);
    }
    assert.throws(() => fixture({ descriptor: (d) => delete d.identity.patchChainSha256 }), {
        code: 'AIR_E_BOX3D_CONFIG',
    });
});

test('a failed factory retains the original error, creates no fictitious release, and can retry', async () => {
    let attempts = 0;
    const original = Object.assign(new Error('factory failed'), { code: 'TEST_FACTORY' });
    const f = fixture({
        factory: async () => {
            if (++attempts === 1) throw original;
            return {};
        },
    });
    await assert.rejects(f.loader.prepare(), (error) => error === original);
    assert.deepEqual(f.loader.diagnostics().cleanup, []);
    assert.equal(f.released.length, 0);
    assert.equal(f.loader.diagnostics().originalError.code, 'TEST_FACTORY');
    const lease = await f.loader.prepare();
    assert.equal(lease.generation, 2);
    await lease.dispose();
});

test('cancel during an unabortable factory waits for late acquisition and releases it before retry', async () => {
    const started = deferred(),
        result = deferred();
    const f = fixture({
        factory: async () => {
            started.resolve();
            return result.promise;
        },
    });
    const preparation = f.loader.prepare();
    const rejected = assert.rejects(preparation, { code: 'AIR_E_BOX3D_CANCELLED' });
    await started.promise;
    const closing = f.loader.dispose();
    assert.throws(() => f.loader.prepare(), { code: 'AIR_E_BOX3D_BUSY' });
    result.resolve({ late: true });
    await rejected;
    await closing;
    assert.equal(f.released.length, 1);
    assert.equal(f.released[0].late, true);
    assert.equal(f.disposed.length, 0);
    assert.equal(f.loader.diagnostics().status, 'CANCELLED');
    assert.equal(f.calls[0].signal.aborted, true);
});

test('binding failure still releases the acquired module, preserving original and cleanup errors separately', async () => {
    const original = Object.assign(new Error('ABI check failed'), { code: 'AIR_E_BOX3D_ABI' });
    const f = fixture({
        createBinding: () => {
            throw original;
        },
        releaseFailure: true,
    });
    await assert.rejects(f.loader.prepare(), (error) => error === original);
    assert.equal(f.released.length, 1);
    assert.equal(f.loader.diagnostics().cleanupErrors.length, 1);
    assert.equal(f.loader.diagnostics().status, 'CLEANUP_FAILED');
    assert.equal(f.loader.diagnostics().originalError.code, original.code);
    assert.throws(() => f.loader.prepare(), { code: 'AIR_E_BOX3D_CLEANUP_FAILED' });
});

test('normal cleanup attempts both resources even if each throws; failed cleanup cannot silently restart', async () => {
    const f = fixture({ disposeFailure: true, releaseFailure: true });
    await f.loader.prepare();
    await assert.rejects(f.loader.dispose(), AggregateError);
    assert.equal(f.disposed.length, 1);
    assert.equal(f.released.length, 1);
    assert.equal(f.loader.diagnostics().cleanupErrors.length, 2);
    assert.equal(f.loader.diagnostics().status, 'CLEANUP_FAILED');
    assert.throws(() => f.loader.prepare(), { code: 'AIR_E_BOX3D_CLEANUP_FAILED' });
    await f.loader.dispose();
    assert.equal(f.disposed.length, 1);
    assert.equal(f.released.length, 1);
});

test('cancellation before manifest response acquires and releases nothing fictitious', async () => {
    const response = deferred();
    const f = fixture({ fetch: () => response.promise });
    const pending = f.loader.prepare();
    const rejected = assert.rejects(pending, { code: 'AIR_E_BOX3D_CANCELLED' });
    const closing = f.loader.dispose();
    response.resolve(new Response(f.files.get('manifest.json'), { headers: { 'content-type': 'application/json' } }));
    await rejected;
    await closing;
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.loader.diagnostics().acquired, []);
    assert.deepEqual(f.loader.diagnostics().cleanup, []);
});

test('cancellation during module import does not invoke the late factory', async () => {
    const started = deferred(),
        imported = deferred();
    let factories = 0;
    const f = fixture({
        loadModule: () => {
            started.resolve();
            return imported.promise;
        },
    });
    const pending = f.loader.prepare();
    const rejected = assert.rejects(pending, { code: 'AIR_E_BOX3D_CANCELLED' });
    await started.promise;
    const closing = f.loader.dispose();
    imported.resolve({
        default: async () => {
            factories++;
            return {};
        },
    });
    await rejected;
    await closing;
    assert.equal(factories, 0);
    assert.equal(f.released.length, 0);
});

test('runtime asset resolution rejects any unlisted resource before module acquisition', async () => {
    const f = fixture({
        factory: async (options) => {
            assert.equal(options.locateFile('box3d-st.wasm'), 'https://example.test/sub/physics/st/box3d-st.wasm');
            options.locateFile('../worker.js');
        },
    });
    await assert.rejects(f.loader.prepare(), { code: 'AIR_E_BOX3D_ASSET_PATH' });
    assert.equal(f.released.length, 0);
    assert.deepEqual(f.loader.diagnostics().acquired, []);
});

test('an invalid factory result never becomes an acquired module', async () => {
    for (const value of [null, undefined, 0, 'not-a-module']) {
        const f = fixture({ factory: async () => value });
        await assert.rejects(f.loader.prepare(), { code: 'AIR_E_BOX3D_LOADER' });
        assert.deepEqual(f.loader.diagnostics().acquired, []);
        assert.equal(f.released.length, 0);
    }
});
