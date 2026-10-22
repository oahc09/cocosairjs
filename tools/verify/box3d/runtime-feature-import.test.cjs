/* Actual generated ESM bundle evaluation in Node VM + JSDOM, not a browser/CSP/HTTP/physics test.
 * Reads existing bundles only. All network/native-loading surfaces are trapped before evaluation.
 * Run: node --experimental-vm-modules --test --test-concurrency=1 tools/verify/box3d/runtime-feature-import.test.cjs
 * AIR_BOX3D_IMPORT_VARIANTS=selected restricts debugging to the already-complete selected bundle.
 * Every invocation creates a NEW output directory and retains raw per-case observations, including failures.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const test = require('node:test');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '../../..');
const stamp = new Date().toISOString().replace(/[-:.]/g, '');
const output = path.resolve(root, process.env.AIR_BOX3D_IMPORT_OUT_DIR || `output/box3d-runtime-import-${stamp}`);
fs.mkdirSync(output, { recursive: false });
const toolBytes = fs.readFileSync(__filename);
const toolIdentity = {
    path: path.relative(root, __filename),
    bytes: toolBytes.length,
    sha256: crypto.createHash('sha256').update(toolBytes).digest('hex'),
};
fs.writeFileSync(path.join(output, 'tool-source.cjs'), toolBytes);
fs.writeFileSync(path.join(output, 'tool-identity.json'), JSON.stringify(toolIdentity, null, 2) + '\n');
const variants = (process.env.AIR_BOX3D_IMPORT_VARIANTS || 'default,selected,min').split(',');
const inputs = {
    default: process.env.AIR_BOX3D_IMPORT_DEFAULT_BUNDLE || 'build/cocosair.module.js',
    selected:
        process.env.AIR_BOX3D_IMPORT_SELECTED_BUNDLE || 'output/box3d-runtime-selected-20261022-h2/cocosair.module.js',
    min: process.env.AIR_BOX3D_IMPORT_MIN_BUNDLE || 'build/cocosair.module.min.js',
};
for (const variant of variants) assert.ok(variant in inputs, `Unknown variant: ${variant}`);
const limits = Object.freeze({
    environment: 'Node VM SourceTextModule + JSDOM',
    proves: 'actual bundle evaluation and pre-engine Box3D rejection paths without intercepted resource requests',
    doesNotProve: [
        'browser execution',
        'CSP enforcement',
        'HTTP serving',
        'real physics',
        'successful app initialization',
    ],
    canvasContext: 'JSDOM does not provide real canvas contexts; getContext is a recorded null-returning stub',
});
const results = [];
process.on('exit', (exitCode) => {
    fs.writeFileSync(
        path.join(output, 'summary.json'),
        JSON.stringify(
            { schemaVersion: 1, exitCode, limits, nodeVersion: process.version, toolIdentity, variants, results },
            null,
            2,
        ) + '\n',
    );
});

function errorDetails(error) {
    return {
        code: error?.code ?? null,
        name: error?.name ?? null,
        message: String(error?.message ?? error),
        stack: String(error?.stack ?? ''),
    };
}
function display(value) {
    return typeof value === 'string' ? value : value instanceof Error ? value.stack : String(value);
}
function counts(requests) {
    const total = {
        fetch: 0,
        dynamicImport: 0,
        xhrSend: 0,
        worker: 0,
        sharedWorker: 0,
        jsdomResourceLoader: 0,
        staticImport: 0,
    };
    for (const request of requests) total[request.kind]++;
    return total;
}
function assertNoRequests(requests, stage) {
    assert.deepEqual(counts(requests), counts([]), `${stage}: no resource request may be attempted`);
}

async function runCase(variant, mode) {
    const caseId = `${variant}-${mode}`;
    const file = path.resolve(root, inputs[variant]);
    const record = {
        schemaVersion: 1,
        caseId,
        toolIdentity,
        limits,
        startedAt: new Date().toISOString(),
        status: 'RUNNING',
        requests: [],
        logs: [],
        canvasContexts: [],
        gameInitCalls: 0,
    };
    let dom;
    try {
        assert.equal(typeof vm.SourceTextModule, 'function', 'Run Node with --experimental-vm-modules');
        const bytes = fs.readFileSync(file);
        record.bundle = {
            path: path.relative(root, file),
            bytes: bytes.length,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        };
        let stage = 'module-evaluation';
        const request = (kind, url) => record.requests.push({ kind, stage, url: String(url) });
        class TrappedResources extends ResourceLoader {
            fetch(url) {
                request('jsdomResourceLoader', url);
                return null;
            }
        }
        const virtualConsole = new VirtualConsole();
        for (const event of ['log', 'info', 'warn', 'error', 'jsdomError'])
            virtualConsole.on(event, (...args) =>
                record.logs.push({ stage, event, text: args.map(display).join(' ') }),
            );
        dom = new JSDOM('<!doctype html><html><head></head><body><canvas id="app-canvas"></canvas></body></html>', {
            url: `https://box3d-import.invalid/${variant}/index.html`,
            runScripts: 'outside-only',
            resources: new TrappedResources(),
            virtualConsole,
            beforeParse(window) {
                window.TextEncoder = TextEncoder;
                window.TextDecoder = TextDecoder;
                window.fetch = async (url) => {
                    request('fetch', url?.url ?? url);
                    throw new Error('NETWORK_TRAPPED_FETCH');
                };
                window.Worker = class {
                    constructor(url) {
                        request('worker', url);
                        throw new Error('NETWORK_TRAPPED_WORKER');
                    }
                };
                window.SharedWorker = class {
                    constructor(url) {
                        request('sharedWorker', url);
                        throw new Error('NETWORK_TRAPPED_SHARED_WORKER');
                    }
                };
                const open = window.XMLHttpRequest.prototype.open;
                const xhrUrls = new WeakMap();
                window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                    xhrUrls.set(this, new window.URL(url, window.document.baseURI).href);
                    return open.call(this, method, url, ...rest);
                };
                window.XMLHttpRequest.prototype.send = function () {
                    request('xhrSend', xhrUrls.get(this) ?? '(not opened)');
                    throw new Error('NETWORK_TRAPPED_XHR');
                };
                window.HTMLCanvasElement.prototype.getContext = function (kind) {
                    record.canvasContexts.push({ stage, kind: String(kind) });
                    return null;
                };
            },
        });
        const module = new vm.SourceTextModule(bytes.toString('utf8'), {
            context: dom.getInternalVMContext(),
            identifier: `https://box3d-import.invalid/${variant}/cocosair.module.js`,
            initializeImportMeta(meta, item) {
                meta.url = item.identifier;
            },
            importModuleDynamically(specifier) {
                request('dynamicImport', specifier);
                throw new Error('NETWORK_TRAPPED_DYNAMIC_IMPORT');
            },
        });
        await module.link((specifier) => {
            request('staticImport', specifier);
            throw new Error('UNEXPECTED_STATIC_IMPORT');
        });
        await module.evaluate({ timeout: 15000 });
        await new Promise(setImmediate);
        record.moduleEvaluationCounts = counts(record.requests);
        assertNoRequests(record.requests, 'module evaluation');
        assert.equal(typeof module.namespace.createAirApp, 'function');
        if (mode !== 'import') {
            stage = 'application-rejection';
            // A trap, not an engine implementation: reaching game.init is a test failure.
            module.namespace.game.init = () => {
                record.gameInitCalls++;
                throw new Error('ENGINE_INIT_MUST_NOT_RUN');
            };
            let rejection;
            try {
                await module.namespace.createAirApp({
                    canvas: dom.window.document.getElementById('app-canvas'),
                    physics: 'box3d',
                    ...(mode === 'single' ? {} : { physicsOptions: { box3d: { threading: mode } } }),
                });
            } catch (error) {
                rejection = error;
            }
            record.applicationRejection = rejection ? errorDetails(rejection) : null;
            const expected =
                variant === 'selected'
                    ? mode === 'single'
                        ? 'AIR_E_BOX3D_UNSUPPORTED'
                        : 'AIR_E_BOX3D_VARIANT_UNAVAILABLE'
                    : 'AIR_E_PHYSICS_BACKEND_UNAVAILABLE';
            record.expectedErrorCode = expected;
            assert.equal(
                rejection?.code,
                expected,
                `actual ${variant} bundle must reject before engine initialization`,
            );
            assert.equal(record.gameInitCalls, 0);
            await new Promise(setImmediate);
            assertNoRequests(record.requests, 'application rejection');
        }
        dom.window.close();
        dom = undefined;
        record.finalCounts = counts(record.requests);
        assertNoRequests(record.requests, 'realm cleanup');
        record.status = 'PASS';
    } catch (error) {
        record.status = 'FAIL';
        record.failure = errorDetails(error);
        throw error;
    } finally {
        dom?.window.close();
        record.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(output, `${caseId}.json`), JSON.stringify(record, null, 2) + '\n');
        results.push({ caseId, status: record.status, raw: `${caseId}.json`, bundle: record.bundle });
    }
}

for (const variant of variants)
    for (const mode of variant === 'selected' ? ['import', 'single', 'multi', 'auto'] : ['import', 'single'])
        test(`${variant} actual ESM bundle: ${mode}, zero attempted resources`, { timeout: 30000 }, () =>
            runCase(variant, mode),
        );
