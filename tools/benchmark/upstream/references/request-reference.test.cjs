/** CPU tests exercise actual loopback HTTP and aborts, not browser/engine validation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { startRequestReferenceServer } = require('./request-server.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/benchmark/upstream/public-inputs.json')));
const outcome = (promise) =>
    promise.then(
        (value) => ({ value }),
        (error) => ({ error }),
    );
const json = async (url, method = 'GET') => {
    const response = await fetch(url, { method });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
};
const moduleURL = pathToFileURL(path.join(__dirname, 'request-reference.mjs')).href;
async function fixture(t, options) {
    const server = await startRequestReferenceServer(options);
    t.after(async () => {
        if (process.env.UPSTREAM_REQUEST_TEST_ARTIFACT_DIR) {
            const folder = path.resolve(process.env.UPSTREAM_REQUEST_TEST_ARTIFACT_DIR);
            fs.mkdirSync(folder, { recursive: true });
            const name = t.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
            fs.writeFileSync(
                path.join(folder, `${name}.json`),
                JSON.stringify(
                    {
                        schema: 'upstream-request-cpu-http-probe/1',
                        node: process.version,
                        browserRuns: 0,
                        engineRuns: 0,
                        modelRuns: 0,
                        test: t.name,
                        server: server.receipts(),
                    },
                    null,
                    2,
                ) + '\n',
            );
        }
        await server.close();
    });
    return server;
}
async function session(server, kind) {
    const info = await json(`${server.origin}/__paired-request/new-session?kind=${kind}`, 'POST');
    const control = (op, ordinal = 1) =>
        json(`${info.controlURL}?op=${op}&resource=mesh.bin&ordinal=${ordinal}`, op === 'release' ? 'POST' : 'GET');
    return { ...info, control, bufferURL: new URL('mesh.bin', info.modelURL).href };
}
test('public HTTP bytes, genuine 404, ETag 304, and no fallback responses', async (t) => {
    const server = await fixture(t);
    const config = await json(`${server.origin}/__paired-request/config`);
    for (const file of ['model.gltf', 'mesh.bin', 'pixel.png']) {
        const response = await fetch(new URL(file, config.basicURL));
        assert.equal(response.status, 200);
        const expected = manifest.resources.find((row) => row.id === `http-${file}`);
        assert.equal(hash(Buffer.from(await response.arrayBuffer())), expected.sha256);
    }
    assert.equal((await fetch(config.failureURL)).status, 404);
    assert.equal((await fetch(`${server.origin}/unknown`)).status, 404);
    const first = await fetch(config.cacheURL);
    await first.arrayBuffer();
    const second = await fetch(config.cacheURL, { headers: { 'If-None-Match': first.headers.get('etag') } });
    assert.equal(second.status, 304);
    assert.equal((await second.arrayBuffer()).byteLength, 0);
    assert.equal(server.receipts().sessions.base.entries.at(-1).status, 304);
});
test('cross-origin dependencies use actual separate endpoint and server-recorded headers', async (t) => {
    const server = await fixture(t);
    const config = await json(`${server.origin}/__paired-request/config`);
    const document = await (await fetch(config.crossURL, { headers: { 'X-Fixture': 'origin-only' } })).json();
    assert.equal(new URL(document.buffers[0].uri).origin, server.crossOrigin);
    assert.notEqual(server.origin, server.crossOrigin);
    const dependency = await fetch(document.buffers[0].uri);
    assert.equal(dependency.headers.get('access-control-allow-origin'), server.origin);
    assert.equal(hash(Buffer.from(await dependency.arrayBuffer())), config.resourceHashes['mesh.bin']);
    const entries = server.receipts().sessions.base.entries;
    assert.equal(entries[0].headers['x-fixture'], 'origin-only');
    assert.equal(entries[1].headers['x-fixture'], undefined);
    const preflight = await fetch(document.images[0].uri, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
});
test(
    'real first-byte barrier abort rejects body, closes response, and fresh retry returns exact bytes',
    { timeout: 15000 },
    async (t) => {
        const server = await fixture(t),
            run = await session(server, 'single');
        const controller = new AbortController();
        const response = await fetch(run.bufferURL, { signal: controller.signal });
        const pending = outcome(response.arrayBuffer());
        const held = await run.control('wait-held');
        assert.equal(held.held, true);
        assert.equal(held.finished, false);
        controller.abort();
        const result = await pending;
        assert.equal(result.error?.name, 'AbortError');
        const aborted = await run.control('wait-aborted');
        assert.equal(aborted.aborted, true);
        assert(aborted.abortEvent > aborted.startEvent);
        assert.equal((await run.control('release')).released, true);
        const retry = await fetch(run.bufferURL, { signal: new AbortController().signal });
        assert.equal(hash(Buffer.from(await retry.arrayBuffer())), server.receipts().resourceHashes['mesh.bin']);
        const receipt = server.receipts().sessions[run.id];
        assert.equal(receipt.entries[1].finished, true);
        assert.deepEqual(receipt.held, []);
    },
);
test(
    'same exact URL concurrent requests: abort A, release B, and retry without replacing B bytes',
    { timeout: 15000 },
    async (t) => {
        const server = await fixture(t),
            run = await session(server, 'concurrent');
        const controller = new AbortController();
        const a = await fetch(run.bufferURL, { signal: controller.signal });
        const aBody = outcome(a.arrayBuffer());
        await run.control('wait-held');
        const b = await fetch(run.bufferURL, { signal: new AbortController().signal });
        const bBody = outcome(b.arrayBuffer());
        await run.control('wait-held', 2);
        controller.abort();
        assert.equal((await aBody).error.name, 'AbortError');
        await run.control('wait-aborted');
        await run.control('release');
        await run.control('release', 2);
        const survivor = await bBody;
        assert.equal(survivor.error, undefined);
        const survivorBefore = Buffer.from(survivor.value);
        const retry = Buffer.from(await (await fetch(run.bufferURL)).arrayBuffer());
        assert.deepEqual(retry, survivorBefore);
        assert.equal(hash(survivorBefore), server.receipts().resourceHashes['mesh.bin']);
        const rows = server.receipts().sessions[run.id].entries;
        assert.deepEqual(
            rows.map((row) => [row.count, row.held, row.aborted, row.finished]),
            [
                [1, true, true, false],
                [2, true, false, true],
                [3, false, false, true],
            ],
        );
    },
);
test(
    'fetch observer delegates real bytes and retains actual failure and aborted response records',
    { timeout: 15000 },
    async (t) => {
        const server = await fixture(t),
            reference = await import(moduleURL);
        const target = { fetch: globalThis.fetch };
        const observer = reference.observeFetch(target);
        t.after(() => observer.restore());
        const config = await json(`${server.origin}/__paired-request/config`);
        const response = await target.fetch(config.basicURL, {
            priority: 'low',
            cache: 'no-store',
            headers: { 'X-Fixture': 'captured' },
        });
        const bytes = await response.arrayBuffer();
        assert.equal((await target.fetch(config.failureURL)).status, 404);
        const run = await session(server, 'single'),
            controller = new AbortController();
        const heldResponse = await target.fetch(run.bufferURL, { signal: controller.signal });
        const body = outcome(heldResponse.arrayBuffer());
        await run.control('wait-held');
        controller.abort();
        assert.equal((await body).error?.name, 'AbortError');
        await run.control('wait-aborted');
        await run.control('release');
        await observer.settle();
        assert.equal(observer.calls[0].responseSha256, hash(Buffer.from(bytes)));
        assert.equal(observer.calls[0].priority, 'low');
        assert.equal(observer.calls[0].headers['x-fixture'], 'captured');
        assert.equal(observer.calls[1].httpStatus, 404);
        assert.equal(observer.calls[2].bodyReadError?.name, 'AbortError');
        assert.equal(observer.calls[2].responseSha256, null);
    },
);
test('policy override replaces and snapshots headers without inheriting hidden values', async () => {
    const reference = await import(moduleURL);
    const inherited = {
        priority: 'high',
        httpCache: 'reload',
        headers: { 'X-Fixture': 'global', 'X-Benchmark-Fixture': 'not inherited' },
    };
    const mutable = new Headers({ 'X-Fixture': 'local' });
    const policy = reference.mergeThreePolicy(inherited, { priority: 'auto', httpCache: 'default', headers: mutable });
    mutable.set('X-Fixture', 'after-construction');
    assert.deepEqual(policy, { priority: 'auto', httpCache: 'default', headers: { 'x-fixture': 'local' } });
    await assert.rejects(reference.runRequestReference('AU99'), /Unsupported/);
    assert.equal(reference.requestReferenceCoverage.browserExecution, 'NOT_EXECUTED_BY_SOURCE_PREPARATION');
});
test('static gateway keeps a fixed upstream for normal and absolute-form request targets', async (t) => {
    const upstream = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(req.url);
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        upstream.closeAllConnections();
        await new Promise((resolve) => upstream.close(resolve));
    });
    const server = await fixture(t, { staticOrigin: `http://127.0.0.1:${upstream.address().port}` });
    assert.equal(await (await fetch(`${server.origin}/entry.html?mode=1`)).text(), '/entry.html?mode=1');
    const body = await new Promise((resolve, reject) => {
        const req = http.get(
            {
                host: '127.0.0.1',
                port: new URL(server.origin).port,
                path: 'http://192.0.2.1:1/only-fixed-upstream?q=2',
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => resolve(data));
            },
        );
        req.on('error', reject);
    });
    assert.equal(body, '/only-fixed-upstream?q=2');
});
