/** Protected real HTTP fixture for AU01-AU03. Uses the U01 payload and its genuine
 * first-byte hold / wait-held / wait-aborted / release control protocol. No browser mocks. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const send = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
};
async function listen(server) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    return `http://127.0.0.1:${server.address().port}`;
}
function loopback(value) {
    const url = new URL(value);
    assert.equal(url.protocol, 'http:');
    assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'loopback origin required');
    return url.origin;
}
async function createRequestFixture({ root = ROOT, onEvent = () => {} } = {}) {
    const source = require(path.join(root, 'test/fixtures/upstream-request-policy/server.cjs'));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools/benchmark/upstream/public-inputs.json')));
    const resourceHashes = {};
    for (const name of ['model.gltf', 'mesh.bin', 'pixel.png']) {
        const bytes = source.payload('default-options', name, '').body;
        const frozen = manifest.resources.find((row) => row.id === `http-${name}`);
        assert.equal(hash(bytes), frozen.sha256, `public HTTP payload changed: ${name}`);
        resourceHashes[name] = frozen.sha256;
    }
    const sessions = new Map(),
        rawEvents = [];
    let nextSession = 0,
        primaryOrigin = null,
        closed = false;
    const newState = (id, holdOrdinals) => {
        const state = source.createState((event) => {
            const observed = { session: id, ...event };
            rawEvents.push(observed);
            onEvent(observed);
        });
        state.holdOrdinals = [...holdOrdinals];
        state.sessionId = id;
        sessions.set(id, state);
        return state;
    };
    const base = newState('base', []);
    const snapshot = () => ({
        schema: 'upstream-request-server-observations/1',
        origins: { primary: primaryOrigin, cross: crossOrigin },
        resourceHashes,
        sessions: Object.fromEntries(
            [...sessions].map(([id, state]) => [
                id,
                {
                    holdOrdinals: state.holdOrdinals,
                    entries: state.entries.map((entry) => ({ ...entry })),
                    held: [...state.held.keys()],
                    listenerCount: state.listeners.size,
                },
            ]),
        ),
        rawEvents: rawEvents.map((event) => ({ ...event })),
    });
    function asset(req, res, state, caseId, resource, originKind) {
        if (!['GET', 'OPTIONS'].includes(req.method)) {
            send(res, 405, { error: 'GET or OPTIONS required' });
            return;
        }
        if (!['default-options', 'http-cache', 'cross-origin-headers', 'abort-buffer'].includes(caseId)) {
            send(res, 404, { error: 'unknown fixture case' });
            return;
        }
        const data = source.payload(caseId, resource, crossOrigin);
        if (!data) {
            res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
            res.end('missing fixture asset');
            return;
        }
        const count =
            state.entries.filter(
                (entry) => entry.case === caseId && entry.resource === resource && entry.method === req.method,
            ).length + 1;
        const entry = {
            id: state.entries.length + 1,
            case: caseId,
            resource,
            count,
            origin: originKind,
            method: req.method,
            headers: Object.fromEntries(
                ['x-fixture', 'x-benchmark-fixture', 'if-none-match', 'cache-control', 'pragma']
                    .filter((name) => req.headers[name] !== undefined)
                    .map((name) => [name, req.headers[name]]),
            ),
            held: false,
            aborted: false,
            finished: false,
            status: req.method === 'OPTIONS' ? 204 : 200,
            bodySha256: hash(data.body),
            bytes: data.body.length,
        };
        state.entries.push(entry);
        res.once('finish', () => {
            entry.finished = true;
            state.emit('response-finish', entry);
        });
        res.once('close', () => {
            if (!entry.finished) entry.aborted = true;
            state.emit('response-close', entry);
        });
        state.emit('request', entry);
        if (originKind === 'cross') {
            res.setHeader('Access-Control-Allow-Origin', primaryOrigin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Headers', 'X-Fixture, X-Benchmark-Fixture');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        }
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const etag = `"${entry.bodySha256}"`;
        entry.etag = etag;
        if (caseId === 'http-cache' && req.headers['if-none-match'] === etag) entry.status = 304;
        const headers = {
            'Content-Type': data.mime,
            ETag: etag,
            'Cache-Control': caseId === 'http-cache' ? 'public, max-age=3600' : 'no-store',
        };
        if (entry.status !== 304) headers['Content-Length'] = data.body.length;
        res.writeHead(entry.status, headers);
        if (caseId === 'abort-buffer' && resource === 'mesh.bin' && state.holdOrdinals.includes(count)) {
            entry.held = true;
            state.held.set(`${caseId}/${resource}/${count}`, { response: res, tail: data.body.subarray(1) });
            res.write(data.body.subarray(0, 1));
            res.flushHeaders();
            state.emit('body-held', entry);
        } else res.end(entry.status === 304 ? undefined : data.body);
    }
    function handle(req, res, originKind = 'primary') {
        const url = new URL(req.url, 'http://fixture.invalid');
        if (url.pathname === '/__paired-request/config') {
            send(res, 200, browserConfig());
            return true;
        }
        if (url.pathname === '/__paired-request/state') {
            send(res, 200, snapshot());
            return true;
        }
        if (url.pathname === '/__paired-request/new-session') {
            if (req.method !== 'POST') {
                send(res, 405, { error: 'POST required' });
                return true;
            }
            const kind = url.searchParams.get('kind');
            if (!['single', 'concurrent'].includes(kind)) {
                send(res, 400, { error: 'unknown session kind' });
                return true;
            }
            const id = `session-${++nextSession}`;
            const state = newState(id, kind === 'concurrent' ? [1, 2] : [1]);
            state.origins = { primary: primaryOrigin, cross: crossOrigin };
            send(res, 200, {
                id,
                modelURL: `${primaryOrigin}/__paired-request/${id}/assets/model.gltf`,
                controlURL: `${primaryOrigin}/__paired-request/${id}/control`,
            });
            return true;
        }
        const scoped = /^\/__paired-request\/(session-\d+)\/(assets\/([^/]+)|control)$/.exec(url.pathname);
        if (scoped) {
            const state = sessions.get(scoped[1]);
            if (!state) {
                send(res, 404, { error: 'unknown session' });
                return true;
            }
            if (scoped[2] === 'control') {
                const original = req.url;
                url.searchParams.set('case', 'abort-buffer');
                req.url = `/__policy/control?${url.searchParams}`;
                try {
                    source.handler(state, 'primary')(req, res);
                } finally {
                    req.url = original;
                }
            } else asset(req, res, state, 'abort-buffer', scoped[3], originKind);
            return true;
        }
        const basic = /^\/__policy\/assets\/([^/]+)\/([^/]+)$/.exec(url.pathname);
        if (basic) {
            asset(req, res, base, basic[1], basic[2], originKind);
            return true;
        }
        return false;
    }
    const cross = http.createServer((req, res) => {
        try {
            if (!handle(req, res, 'cross')) send(res, 404, { error: 'not a fixture route' });
        } catch (error) {
            send(res, 500, { error: error.message });
        }
    });
    const crossOrigin = await listen(cross);
    function browserConfig() {
        if (!primaryOrigin) throw new Error('Set the primary origin before serving fixture configuration');
        return {
            primaryOrigin,
            crossOrigin,
            resourceHashes,
            basicURL: `${primaryOrigin}/__policy/assets/default-options/model.gltf`,
            failureURL: `${primaryOrigin}/__policy/assets/default-options/missing.gltf`,
            cacheURL: `${primaryOrigin}/__policy/assets/http-cache/model.gltf`,
            crossURL: `${primaryOrigin}/__policy/assets/cross-origin-headers/model.gltf`,
        };
    }
    return {
        handle,
        browserConfig,
        receipts: snapshot,
        state: { sessions, rawEvents },
        setOrigin(origin) {
            primaryOrigin = loopback(origin);
            for (const state of sessions.values()) state.origins = { primary: primaryOrigin, cross: crossOrigin };
        },
        async close() {
            if (closed) return;
            closed = true;
            for (const state of sessions.values()) {
                for (const held of state.held.values()) held.response.destroy();
                state.held.clear();
            }
            cross.closeAllConnections();
            await new Promise((resolve, reject) => cross.close((error) => (error ? reject(error) : resolve())));
        },
    };
}
async function startRequestReferenceServer({ root = ROOT, staticOrigin, onEvent } = {}) {
    if (staticOrigin) staticOrigin = loopback(staticOrigin);
    const fixture = await createRequestFixture({ root, onEvent });
    const server = http.createServer((req, res) => {
        try {
            if (fixture.handle(req, res)) return;
            if (!staticOrigin) {
                send(res, 404, { error: 'no static route' });
                return;
            }
            const requestURL = new URL(req.url, 'http://fixture.invalid');
            const targetURL = new URL(staticOrigin);
            targetURL.pathname = requestURL.pathname;
            targetURL.search = requestURL.search;
            const proxy = http.request(
                targetURL,
                { method: req.method, headers: { accept: req.headers.accept || '*/*' } },
                (upstream) => {
                    res.writeHead(upstream.statusCode, upstream.headers);
                    upstream.pipe(res);
                },
            );
            proxy.on('error', (error) => {
                if (!res.headersSent) send(res, 502, { error: error.message });
                else res.destroy(error);
            });
            res.once('close', () => proxy.destroy());
            req.pipe(proxy);
        } catch (error) {
            if (!res.headersSent) send(res, 500, { error: error.message });
            else res.destroy(error);
        }
    });
    try {
        const origin = await listen(server);
        fixture.setOrigin(origin);
        let closed = false;
        return {
            origin,
            crossOrigin: fixture.browserConfig().crossOrigin,
            state: fixture.state,
            receipts: fixture.receipts,
            async close() {
                if (closed) return;
                closed = true;
                await fixture.close();
                server.closeAllConnections();
                await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
            },
        };
    } catch (error) {
        await fixture.close();
        throw error;
    }
}
module.exports = { createRequestFixture, startRequestReferenceServer };
