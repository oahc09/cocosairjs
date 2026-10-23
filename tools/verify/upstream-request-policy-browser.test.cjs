const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const { specs, expectedCounts, validateRow, selectedBrowser } = require('./upstream-request-policy-browser.cjs');
const { model, payload, createState, handler } = require('../../test/fixtures/upstream-request-policy/server.cjs');

// These unit-test streams exercise the HTTP handler and validator only. They never
// launch a browser and must not be saved as browser observations or acceptance evidence.
function request(state, caseId, resource, count = 1, extra = {}) {
    const origin = caseId === 'cross-origin-headers' && resource !== 'model.gltf' ? 'cross' : 'primary';
    const headers = { cookie: 'air_policy_fixture=synthetic' };
    if (caseId === 'policy-inheritance') headers['x-synthetic-test'] = 'global';
    if (caseId === 'cross-origin-headers') {
        delete headers.cookie;
        if (origin === 'primary') headers['x-synthetic-test'] = 'origin-only';
    }
    if (caseId.startsWith('abort-decode-')) {
        headers['x-synthetic-test'] = resource === 'provider.bin' ? 'provider-owned' : 'loader-owned';
        if (resource === 'provider.bin') delete headers.cookie;
    }
    if (caseId.startsWith('multi-consumer')) {
        headers['x-synthetic-consumer'] =
            caseId === 'multi-consumer-same-policy' ? 'same' : ['A', 'B', 'A-retry'][count - 1];
        delete headers.cookie;
    }
    if (caseId === 'http-cache' && count === 2)
        headers['if-none-match'] = state.entries.find((row) => row.resource === resource).etag;
    Object.assign(headers, extra);
    const req = new EventEmitter();
    Object.assign(req, { url: `/__policy/assets/${caseId}/${resource}`, method: 'GET', headers });
    const res = new EventEmitter();
    Object.assign(res, {
        headers: {},
        chunks: [],
        destroyed: false,
        headersSent: false,
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        writeHead(status, values = {}) {
            this.status = status;
            this.headersSent = true;
            for (const [name, value] of Object.entries(values)) this.setHeader(name, value);
        },
        write(bytes) {
            this.chunks.push(Buffer.from(bytes));
        },
        flushHeaders() {},
        end(bytes) {
            if (bytes) this.write(bytes);
            this.emit('finish');
            this.emit('close');
        },
        destroy() {
            this.destroyed = true;
            this.emit('close');
        },
    });
    handler(state, origin)(req, res);
    return res;
}
function synthetic(caseId) {
    const state = createState();
    state.origins = { primary: 'http://primary.test', cross: 'http://cross.test' };
    const counts = expectedCounts(caseId);
    const held = [];
    for (const [resource, count] of Object.entries(counts))
        for (let i = 1; i <= count; i++) {
            const res = request(state, caseId, resource, i);
            if (state.entries.at(-1).held) held.push(res);
            // Keep both consumers pending before cancellation, exactly as the browser fixture does.
            if (held.length === 2) {
                held[0].destroy();
                held[1].end();
                held.length = 0;
            }
        }
    for (const res of held) res.destroy();
    const spec = specs.find((entry) => entry.id === caseId);
    const calls = [];
    for (const [resource, count] of Object.entries(
        caseId === 'http-cache' ? { 'model.gltf': 5, 'mesh.bin': 5, 'pixel.png': 5 } : counts,
    )) {
        for (let i = 0; i < count; i++) {
            const init = { priority: null, cache: 'no-store', credentials: 'same-origin', redirect: null, headers: {} };
            if (['default-options', 'redirect-headers'].includes(caseId)) init.cache = null;
            if (caseId === 'policy-inheritance')
                Object.assign(init, {
                    priority: 'high',
                    credentials: 'include',
                    redirect: 'error',
                    headers: { 'x-synthetic-test': 'global' },
                });
            if (caseId === 'policy-override') Object.assign(init, { priority: 'auto', cache: 'default' });
            if (caseId === 'cross-origin-headers') {
                Object.assign(init, { priority: 'low', credentials: 'omit' });
                if (resource === 'model.gltf')
                    Object.assign(init, { redirect: 'error', headers: { 'x-synthetic-test': 'origin-only' } });
            }
            if (caseId === 'redirect-headers')
                Object.assign(init, { redirect: 'error', headers: { 'x-synthetic-test': 'do-not-forward' } });
            if (caseId === 'http-cache')
                init.cache = ['force-cache', 'force-cache', 'no-cache', 'no-store', 'no-store'][i];
            if (caseId.startsWith('abort-decode-'))
                Object.assign(
                    init,
                    resource === 'provider.bin'
                        ? {
                              priority: 'low',
                              cache: 'reload',
                              credentials: 'omit',
                              headers: { 'x-synthetic-test': 'provider-owned' },
                          }
                        : {
                              priority: 'high',
                              credentials: 'include',
                              redirect: 'error',
                              headers: { 'x-synthetic-test': 'loader-owned' },
                          },
                );
            if (caseId.startsWith('multi-consumer')) {
                const label =
                    caseId === 'multi-consumer-same-policy'
                        ? 'same'
                        : resource === 'model.gltf'
                          ? ['A', 'B', 'A-retry'][i]
                          : ['B', 'A-retry'][i];
                const first = label !== 'B';
                Object.assign(init, {
                    priority: first ? 'low' : 'high',
                    cache: first ? 'no-store' : 'reload',
                    credentials: 'omit',
                    redirect: 'error',
                    headers: { 'x-synthetic-consumer': label },
                });
            }
            calls.push({ url: `http://unit.test/__policy/assets/${caseId}/${resource}`, init });
        }
    }
    return {
        observation: {
            schema: 'air-upstream-request-policy-observation/1',
            status: 'OBSERVED_NOT_VALIDATED',
            completed: true,
            case: caseId,
            engine: {
                backend: 'webgl2',
                version: 'WebGL 2 SYNTHETIC UNIT TEST ONLY',
                renderer: 'UNIT TEST ONLY, NOT REAL BROWSER',
            },
            prioritySchedulingClaim: false,
            compositorEvidence: false,
            calls,
            progress: [],
            checks: spec.checks.map((name) => ({ name, pass: true, actual: { unitTestOnly: true } })),
        },
        receipts: state.entries,
    };
}
test('all 18 cases retain T01–T06 and distinct required assertions', () => {
    assert.equal(specs.length, 18);
    assert.equal(new Set(specs.map((entry) => entry.id)).size, specs.length);
    assert.deepEqual([...new Set(specs.flatMap((entry) => entry.acceptance))].sort(), [
        'T01',
        'T02',
        'T03',
        'T04',
        'T05',
        'T06',
    ]);
    for (const spec of specs) assert.equal(new Set(spec.checks).size, spec.checks.length);
});
test('local payloads have a valid PNG, triangle layout, and explicit injected-provider boundaries', () => {
    const base = model('default-options', 'http://cross.test');
    const geometry = payload('default-options', 'mesh.bin').body;
    assert.equal(geometry.length, base.buffers[0].byteLength);
    assert.equal(base.accessors[0].count, 3);
    assert.equal(PNG.sync.read(payload('default-options', 'pixel.png').body).width, 1);
    assert.equal(
        model('cross-origin-headers', 'http://cross.test').images[0].uri,
        'http://cross.test/__policy/assets/cross-origin-headers/pixel.png',
    );
    for (const id of ['abort-decode-meshopt', 'abort-decode-draco', 'abort-decode-ktx2'])
        assert.equal(model(id).extensionsRequired.length, 1);
});
test('handler retains bounded synthetic receipt fields, never raw credentials', () => {
    const state = createState();
    request(state, 'default-options', 'mesh.bin', 1, {
        authorization: 'DO-NOT-RETAIN',
        cookie: 'secret=DO-NOT-RETAIN; air_policy_fixture=synthetic',
        'x-unrelated': 'DO-NOT-RETAIN',
    });
    assert.equal(state.entries[0].syntheticCookie, true);
    assert.equal(JSON.stringify(state.entries).includes('DO-NOT-RETAIN'), false);
    assert.equal(state.entries[0].finished, true);
    assert.equal(state.entries[0].aborted, false);
});
test('explicit partial-body barrier distinguishes abort from a completed response', () => {
    const state = createState();
    const response = request(state, 'abort-main', 'model.gltf');
    assert.equal(
        response.chunks.reduce((sum, chunk) => sum + chunk.length, 0),
        1,
    );
    assert.equal(state.entries[0].held, true);
    assert.equal(state.entries[0].finished, false);
    response.destroy();
    assert.equal(state.entries[0].aborted, true);
    const retry = request(state, 'abort-main', 'model.gltf', 2);
    assert.equal(retry.status, 200);
    assert.equal(state.entries[1].held, false);
    assert.equal(state.entries[1].finished, true);
});
test('validator accepts complete synthetic shape without publishing browser evidence', () => {
    for (const spec of specs) {
        const { observation, receipts } = synthetic(spec.id);
        const result = validateRow(observation, receipts);
        assert.equal(result.status, 'PASS', `${spec.id}: ${result.failures.join('; ')}`);
    }
});
test('every missing assertion, false assertion, or missing receipt fails closed', () => {
    for (const spec of specs) {
        const value = synthetic(spec.id);
        const missing = structuredClone(value);
        missing.observation.checks.pop();
        assert.equal(validateRow(missing.observation, missing.receipts).status, 'FAIL', spec.id);
        value.observation.checks[0].pass = false;
        assert.equal(validateRow(value.observation, value.receipts).status, 'FAIL', spec.id);
        const count = synthetic(spec.id);
        if (count.receipts.length) {
            count.receipts.pop();
            assert.equal(validateRow(count.observation, count.receipts).status, 'FAIL', spec.id);
        }
    }
});
test('mutated cache, leakage, provider ownership, overlap and terminal facts cannot be promoted', () => {
    const mutations = [
        [
            'http-cache',
            (v) => {
                v.receipts.find((r) => r.status === 304).headers['if-none-match'] = 'wrong';
            },
        ],
        [
            'http-cache',
            (v) => {
                v.receipts.find((r) => r.status === 304).status = 200;
            },
        ],
        [
            'cross-origin-headers',
            (v) => {
                v.receipts.find((r) => r.origin === 'cross').headers['x-synthetic-test'] = 'leaked';
            },
        ],
        [
            'cross-origin-headers',
            (v) => {
                v.receipts.find((r) => r.origin === 'cross').syntheticCookie = true;
            },
        ],
        [
            'redirect-headers',
            (v) => {
                v.receipts[0].origin = 'cross';
            },
        ],
        [
            'abort-decode-draco',
            (v) => {
                v.receipts.find((r) => r.resource === 'provider.bin').headers['x-synthetic-test'] = 'loader-owned';
            },
        ],
        [
            'multi-consumer',
            (v) => {
                v.receipts[1].startEvent = v.receipts[0].abortEvent + 1;
            },
        ],
        [
            'multi-consumer-same-policy',
            (v) => {
                v.receipts[1].held = false;
            },
        ],
        [
            'abort-main',
            (v) => {
                v.receipts[0].aborted = false;
            },
        ],
        [
            'policy-inheritance',
            (v) => {
                v.receipts[0].headers['x-synthetic-test'] = 'mutated-after-configure';
            },
        ],
        [
            'default-options',
            (v) => {
                v.observation.calls.pop();
            },
        ],
        [
            'policy-inheritance',
            (v) => {
                v.observation.calls[0].init.priority = 'low';
            },
        ],
        [
            'policy-override',
            (v) => {
                v.observation.calls[0].init.cache = 'no-store';
            },
        ],
        [
            'default-options',
            (v) => {
                v.observation.engine.backend = 'empty';
            },
        ],
        [
            'default-options',
            (v) => {
                v.observation.prioritySchedulingClaim = true;
            },
        ],
        [
            'default-options',
            (v) => {
                v.observation.compositorEvidence = true;
            },
        ],
        [
            'default-options',
            (v) => {
                v.observation.completed = false;
            },
        ],
        [
            'default-options',
            (v) => {
                v.observation.checks.push(v.observation.checks[0]);
            },
        ],
    ];
    for (const [id, mutate] of mutations) {
        const value = synthetic(id);
        mutate(value);
        assert.equal(validateRow(value.observation, value.receipts).status, 'FAIL', `${id}: ${mutate}`);
    }
    assert.equal(validateRow(null, []).status, 'FAIL');
});
test('collector help is side-effect free and fixture executes public APIs with actual fetch', () => {
    const output = execFileSync(process.execPath, [__filename.replace('.test.cjs', '.cjs'), '--help'], {
        encoding: 'utf8',
    });
    assert.match(output, /record-not-run/);
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../test/fixtures/upstream-request-policy/main.js'),
        'utf8',
    );
    for (const text of [
        'cc.createAirApp(',
        'new cc.GLTFLoader(',
        'nativeFetch(input, init)',
        'window.__requestPolicy =',
        'clock.begin()',
        'clock.end()',
    ])
        assert.ok(source.includes(text), text);
    assert.doesNotMatch(source, /renderMode:\s*3|page\.route\(|new Response\(/);
});

test('three explicit browser dimensions select once without fallback', () => {
    assert.equal(selectedBrowser([]), 'chromium');
    for (const browser of ['chromium', 'firefox', 'webkit'])
        assert.equal(selectedBrowser([`--browser=${browser}`]), browser);
    assert.throws(() => selectedBrowser(['--browser=unknown']), /browser must/);
});

test('malformed observation collections fail closed rather than bypassing assertions', () => {
    for (const checks of [null, {}, [null]]) {
        const value = synthetic('default-options');
        value.observation.checks = checks;
        assert.equal(validateRow(value.observation, value.receipts).status, 'FAIL');
    }
    assert.equal(validateRow(synthetic('default-options').observation, [null]).status, 'FAIL');
    const value = synthetic('default-options');
    value.observation.calls[0] = null;
    assert.equal(validateRow(value.observation, value.receipts).status, 'FAIL');
});
