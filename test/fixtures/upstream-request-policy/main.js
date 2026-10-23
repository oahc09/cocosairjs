import * as cc from 'cocosair';

// This observer delegates every request to the browser's actual fetch. It never supplies
// response bytes, intercepts Playwright routes, replaces Image, or substitutes an engine.
const nativeFetch = window.fetch.bind(window);
const specs = await (await nativeFetch('./cases.json')).json();
const caseId = new URLSearchParams(location.search).get('case');
if (!specs.some((entry) => entry.id === caseId)) throw new Error('unknown request-policy case');
const config = await (await nativeFetch(`/__policy/config?case=${caseId}`)).json();
const assetURL = `${location.origin}/__policy/assets/${caseId}/model.gltf`;
const calls = [],
    progress = [],
    checks = [],
    destroyed = [],
    restores = [],
    assets = new Set(),
    borrowedProviders = [];
const counters = { textureUploads: 0, meshesInitialized: 0, blobsCreated: 0, blobsRevoked: 0 };
const serializeError = (error) => ({ name: error?.name, message: error?.message, code: error?.code });
const deferred = () => {
    let resolve;
    const promise = new Promise((yes) => (resolve = yes));
    return { promise, resolve };
};
const check = (name, pass, actual) => checks.push({ name, pass: !!pass, actual });
const app = await cc.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
const scene = new cc.Scene('request-policy-contract');
app.run(scene);
const clock = cc.createStepClock({ stepTimeoutMs: 10000 });
clock.begin();
const gl = app.canvas.getContext('webgl2');
if (!gl) throw new Error('WEBGL2_REQUIRED');
const metadata = { backend: 'webgl2', version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER) };
const initialChildren = scene.children.length;
function instrument(object, key, observer) {
    const original = object[key];
    object[key] = function (...args) {
        observer.call(this, ...args);
        return original.apply(this, args);
    };
    restores.push(() => (object[key] = original));
}
window.fetch = function (input, init) {
    const url = input instanceof Request ? input.url : new URL(String(input), location.href).href;
    if (url.includes('/__policy/assets/')) {
        calls.push({
            url,
            init: {
                credentials: init?.credentials,
                cache: init?.cache ?? null,
                priority: init?.priority ?? null,
                redirect: init?.redirect ?? null,
                headers: Object.fromEntries(new Headers(init?.headers)),
                signal: !!init?.signal,
            },
        });
    }
    return nativeFetch(input, init);
};
restores.push(() => (window.fetch = nativeFetch));
instrument(cc.GLTFAsset.prototype, 'destroy', function () {
    destroyed.push({ asset: this, resources: [...this.meshes, ...this.materials, ...this.textures, ...this.images] });
});
instrument(cc.Texture2D.prototype, 'setFilters', () => counters.textureUploads++);
instrument(cc.Mesh.prototype, 'initialize', () => counters.meshesInitialized++);
instrument(URL, 'createObjectURL', () => counters.blobsCreated++);
instrument(URL, 'revokeObjectURL', () => counters.blobsRevoked++);
const resetDefaults = () =>
    cc.configureGLTFLoaderDefaults({
        request: undefined,
        signal: undefined,
        onProgress: undefined,
        dracoDecoder: undefined,
        meshoptDecoder: undefined,
        ktx2Transcoder: undefined,
    });
resetDefaults();
async function control(op, resource, ordinal = 1) {
    const response = await nativeFetch(
        `/__policy/control?case=${caseId}&op=${op}&resource=${resource || ''}&ordinal=${ordinal}`,
        {
            method: op === 'release' ? 'POST' : 'GET',
            cache: 'no-store',
        },
    );
    if (!response.ok) throw new Error(`control ${op}: ${response.status} ${await response.text()}`);
    return response.json();
}
function load(options, url = assetURL) {
    return new cc.GLTFLoader(options).loadAsync(url).then((asset) => {
        assets.add(asset);
        return asset;
    });
}
function settled(promise) {
    return promise.then(
        (asset) => ({ status: 'fulfilled', asset }),
        (error) => ({ status: 'rejected', error: serializeError(error) }),
    );
}
function abortCheck(result) {
    check('abort-error', result.status === 'rejected' && result.error?.name === 'AbortError', {
        ...result,
        asset: undefined,
    });
}
function noMount() {
    check('no-mounted-result', scene.children.length === initialChildren, {
        before: initialChildren,
        after: scene.children.length,
    });
}
function temporaryResourcesReleased() {
    const actual = destroyed.map((entry) => ({
        assetValid: entry.asset.isValid,
        resourcesValid: entry.resources.map((value) => value.isValid),
    }));
    check(
        'temporary-resources-released',
        actual.length === 1 &&
            actual.every((entry) => !entry.assetValid && entry.resourcesValid.every((valid) => !valid)),
        actual,
    );
}
function configuredIsolation() {
    check('configured-cache-isolation', cc.assetManager.assets.get(assetURL) === undefined, {
        nativeCacheEntry: !!cc.assetManager.assets.get(assetURL),
    });
}
function resourceCheck(asset, name = 'resources-valid') {
    const actual = {
        asset: asset.isValid,
        meshes: asset.meshes.length,
        textures: asset.textures.length,
        allValid: [...asset.meshes, ...asset.materials, ...asset.textures].every((value) => value.isValid),
    };
    check(name, actual.asset && actual.allValid && (actual.meshes > 0 || actual.textures > 0), actual);
}
const trackProgress = (event) => progress.push({ ...event });
const basic = { request: { httpCache: 'no-store' }, onProgress: trackProgress };
let runStarted = false,
    closeStarted = false;
async function run() {
    if (runStarted) throw new Error('one run per isolated browser context');
    runStarted = true;
    if (caseId === 'default-options') {
        const [a, b] = await Promise.all([load(), load()]);
        check('native-shared-identity', a === b, { same: a === b });
        const cached = await load();
        check('native-cache-hit', cached === a && cc.assetManager.assets.get(assetURL) === a, { same: cached === a });
        check(
            'default-fetch-options',
            calls.length === 3 &&
                calls.every(
                    ({ init }) => init.credentials === 'same-origin' && init.cache === null && init.priority === null,
                ),
            calls,
        );
        resourceCheck(a);
    } else if (caseId === 'policy-inheritance' || caseId === 'policy-override') {
        const headers = new Headers({ 'X-Synthetic-Test': 'global' });
        cc.configureGLTFLoaderDefaults({
            request: { priority: 'high', httpCache: 'no-store', credentials: 'include', headers },
        });
        headers.set('X-Synthetic-Test', 'mutated-after-configure');
        cc.configureGLTFLoaderDefaults({ request: { priority: undefined } });
        const override = caseId === 'policy-override';
        const a = await load({
            request: override
                ? { priority: 'auto', httpCache: 'default', credentials: 'same-origin', headers: {} }
                : { priority: undefined },
        });
        if (override) {
            check(
                'explicit-defaults-win',
                calls.length === 3 &&
                    calls.every(
                        ({ init }) =>
                            init.priority === 'auto' && init.cache === 'default' && init.credentials === 'same-origin',
                    ),
                calls,
            );
            check(
                'headers-replaced',
                calls.every(({ init }) => !init.headers['x-synthetic-test']),
                calls,
            );
        } else {
            check(
                'inherited-policy',
                calls.length === 3 &&
                    calls.every(
                        ({ init }) =>
                            init.priority === 'high' && init.cache === 'no-store' && init.credentials === 'include',
                    ),
                calls,
            );
            check(
                'headers-snapshotted',
                calls.every(({ init }) => init.headers['x-synthetic-test'] === 'global'),
                calls,
            );
            configuredIsolation();
        }
        resourceCheck(a);
    } else if (caseId === 'cross-origin-headers') {
        const a = await load({
            request: {
                priority: 'low',
                httpCache: 'no-store',
                credentials: 'omit',
                headers: { 'X-Synthetic-Test': 'origin-only' },
            },
        });
        check(
            'main-origin-header',
            calls
                .filter((entry) => new URL(entry.url).origin === location.origin)
                .every(({ init }) => init.headers['x-synthetic-test'] === 'origin-only'),
            calls,
        );
        const cross = calls.filter((entry) => new URL(entry.url).origin === config.crossOrigin);
        check(
            'cross-origin-header-stripped',
            cross.length === 2 &&
                cross.every(({ init }) => Object.keys(init.headers).length === 0 && init.credentials === 'omit'),
            cross,
        );
        resourceCheck(a);
    } else if (caseId === 'redirect-headers') {
        const result = await settled(load({ request: { headers: { 'X-Synthetic-Test': 'do-not-forward' } } }));
        check('redirect-rejected', result.status === 'rejected', { ...result, asset: undefined });
        check('redirect-error-option', calls.length === 1 && calls[0].init.redirect === 'error', calls);
        noMount();
    } else if (caseId === 'http-cache') {
        const modes = ['force-cache', 'force-cache', 'no-cache', 'no-store', 'no-store'];
        const results = [];
        for (const mode of modes) results.push(await load({ request: { httpCache: mode } }));
        check(
            'separate-assets-http-cache',
            new Set(results).size === modes.length && cc.assetManager.assets.get(assetURL) === undefined,
            { distinct: new Set(results).size, loads: modes.length },
        );
        check(
            'all-cache-modes-forwarded',
            modes.every(
                (mode, i) =>
                    calls.slice(i * 3, i * 3 + 3).length === 3 &&
                    calls.slice(i * 3, i * 3 + 3).every(({ init }) => init.cache === mode),
            ),
            calls,
        );
        resourceCheck(results.at(-1));
    } else if (caseId === 'pre-abort') {
        const controller = new AbortController();
        controller.abort();
        abortCheck(await settled(load({ ...basic, signal: controller.signal })));
        check('no-fetch', calls.length === 0, calls);
        check('no-progress', progress.length === 0, progress);
        noMount();
    } else if (['abort-main', 'abort-buffer', 'abort-image'].includes(caseId)) {
        const controller = new AbortController();
        const resource = { 'abort-main': 'model.gltf', 'abort-buffer': 'mesh.bin', 'abort-image': 'pixel.png' }[caseId];
        const pending = settled(load({ ...basic, signal: controller.signal }));
        await control('wait-held', resource);
        controller.abort();
        abortCheck(await pending);
        const count = progress.length;
        const receipt = await control('wait-aborted', resource);
        check('server-saw-abort', receipt.aborted === true && receipt.finished === false, receipt);
        await control('release', resource);
        await clock.step(0);
        if (caseId !== 'abort-main') temporaryResourcesReleased();
        check(
            'no-progress-after-abort',
            progress.length === count && !progress.some((entry) => entry.phase === 'objects'),
            progress,
        );
        noMount();
        resourceCheck(await load(basic), 'retry-success');
    } else if (caseId.startsWith('abort-decode-')) {
        const kind = caseId.slice('abort-decode-'.length);
        const gate = deferred(),
            entered = deferred();
        let invocations = 0,
            disposeCalls = 0;
        const providerPolicy = Object.freeze({
            priority: 'low',
            cache: 'reload',
            credentials: 'omit',
            headers: Object.freeze({ 'X-Synthetic-Test': 'provider-owned' }),
        });
        const output = () =>
            kind === 'meshopt'
                ? new Uint8Array(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]).buffer)
                : kind === 'draco'
                  ? { attributes: { POSITION: new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]) } }
                  : {
                        data: new Uint8Array([255, 255, 255, 255]),
                        mimeType: 'image/ktx2-decoded',
                        width: 1,
                        height: 1,
                        format: cc.gfx.Format.RGBA8,
                    };
        const method = { meshopt: 'decodeGltfBufferAsync', draco: 'decodePrimitive', ktx2: 'transcode' }[kind];
        const provider = Object.freeze({
            request: providerPolicy,
            async [method]() {
                invocations++;
                const response = await fetch(assetURL.replace('model.gltf', 'provider.bin'), providerPolicy);
                if (!response.ok) throw new Error('provider-owned request failed');
                await response.arrayBuffer();
                entered.resolve();
                if (invocations === 1) await gate.promise;
                return output();
            },
            dispose() {
                disposeCalls++;
            },
        });
        borrowedProviders.push(() => disposeCalls === 0 && provider.request === providerPolicy);
        const key = { meshopt: 'meshoptDecoder', draco: 'dracoDecoder', ktx2: 'ktx2Transcoder' }[kind];
        const controller = new AbortController();
        const options = {
            request: {
                priority: 'high',
                httpCache: 'no-store',
                credentials: 'include',
                headers: { 'X-Synthetic-Test': 'loader-owned' },
            },
            [key]: provider,
            onProgress: trackProgress,
        };
        const pending = settled(load({ ...options, signal: controller.signal }));
        await entered.promise;
        controller.abort();
        abortCheck(await pending);
        const beforeLate = { ...counters, progress: progress.length };
        gate.resolve();
        // The caller-owned provider is deliberately uncancellable. Two event-loop turns
        // plus the native destruction boundary observe late settlement, not elapsed-speed success.
        await new Promise((resolve) => setTimeout(resolve, 0));
        await clock.step(0);
        const afterLate = { ...counters, progress: progress.length };
        check(
            'late-output-isolated',
            JSON.stringify(beforeLate) === JSON.stringify(afterLate) &&
                !progress.some((entry) => entry.phase === 'objects'),
            { beforeLate, afterLate },
        );
        noMount();
        temporaryResourcesReleased();
        const retry = await load(options);
        resourceCheck(retry, 'retry-success');
        retry.destroy();
        await clock.step(0);
        check(
            'borrowed-provider-unchanged',
            Object.isFrozen(provider) && provider.request === providerPolicy && invocations === 2 && disposeCalls === 0,
            { invocations, disposeCalls, frozen: Object.isFrozen(provider) },
        );
        const ownCalls = calls.filter((entry) => entry.url.endsWith('/provider.bin'));
        check(
            'provider-policy-retained',
            ownCalls.length === 2 &&
                ownCalls.every(
                    ({ init }) =>
                        init.priority === 'low' &&
                        init.cache === 'reload' &&
                        init.credentials === 'omit' &&
                        init.headers['x-synthetic-test'] === 'provider-owned',
                ),
            ownCalls,
        );
    } else if (caseId === 'abort-handoff') {
        const controller = new AbortController();
        abortCheck(
            await settled(
                load({
                    ...basic,
                    signal: controller.signal,
                    onProgress(event) {
                        trackProgress(event);
                        if (event.phase === 'objects') controller.abort();
                    },
                }),
            ),
        );
        await clock.step(0);
        const actual = destroyed.map((entry) => ({
            resourceCount: entry.resources.length,
            valid: entry.resources.map((value) => value.isValid),
        }));
        check(
            'created-resources-destroyed',
            actual.length === 1 && actual[0].resourceCount >= 4 && actual[0].valid.every((valid) => !valid),
            actual,
        );
        check('blob-urls-revoked', counters.blobsCreated > 0 && counters.blobsCreated === counters.blobsRevoked, {
            ...counters,
        });
        noMount();
        resourceCheck(await load(basic), 'retry-success');
    } else if (caseId.startsWith('multi-consumer')) {
        const controller = new AbortController();
        const same = caseId === 'multi-consumer-same-policy';
        const policy = (label) => ({
            priority: same || label.startsWith('A') ? 'low' : 'high',
            httpCache: same || label.startsWith('A') ? 'no-store' : 'reload',
            credentials: 'omit',
            headers: { 'X-Synthetic-Consumer': same ? 'same' : label },
        });
        const a = settled(load({ signal: controller.signal, request: policy('A') }));
        await control('wait-held', 'model.gltf');
        const b = load({ request: policy('B') });
        await control('wait-held', 'model.gltf', 2);
        controller.abort();
        abortCheck(await a);
        await control('wait-aborted', 'model.gltf');
        await control('release', 'model.gltf');
        await control('release', 'model.gltf', 2);
        const survivor = await b;
        resourceCheck(survivor, 'survivor-success');
        const retry = await load({ request: policy('A-retry') });
        resourceCheck(retry, 'retry-success');
        check(
            'consumer-policy-independent',
            survivor !== retry && calls.filter((entry) => entry.url === assetURL).length === 3,
            calls,
        );
        check(
            'policy-response-identity',
            survivor.sceneNames[0] === (same ? 'same' : 'B') && retry.sceneNames[0] === (same ? 'same' : 'A-retry'),
            { survivor: survivor.sceneNames, retry: retry.sceneNames },
        );
        check('native-cache-isolation', cc.assetManager.assets.get(assetURL) === undefined, {
            cached: !!cc.assetManager.assets.get(assetURL),
        });
    } else if (caseId === 'retry-network' || caseId === 'retry-parse') {
        const result = await settled(load(basic));
        check('first-load-rejected', result.status === 'rejected' && result.error?.name !== 'AbortError', {
            ...result,
            asset: undefined,
        });
        resourceCheck(await load(basic), 'retry-success');
        configuredIsolation();
    }
    const observation = {
        schema: 'air-upstream-request-policy-observation/1',
        case: caseId,
        status: 'OBSERVED_NOT_VALIDATED',
        completed: true,
        engine: metadata,
        prioritySchedulingClaim: false,
        compositorEvidence: false,
        calls,
        progress,
        checks,
        counters: { ...counters },
        destroyedAssets: destroyed.length,
        priorityCapability: 'priority' in Request.prototype ? 'exposed' : 'not-exposed-hint-may-be-ignored',
    };
    window.__requestPolicy.observation = observation;
    return observation;
}
async function close() {
    if (closeStarted) throw new Error('close called twice');
    closeStarted = true;
    resetDefaults();
    for (const asset of assets) asset.destroy();
    await clock.step(0);
    const allResourcesReleased = [...assets].every((asset) => !asset.isValid);
    clock.end();
    const release = await app.releaseScene();
    const closed = await app.close();
    for (const restore of restores.reverse()) restore();
    return {
        allResourcesReleased,
        borrowedProvidersUntouched: borrowedProviders.every((inspect) => inspect()),
        release,
        close: closed,
    };
}
window.__requestPolicy = {
    ready: true,
    case: caseId,
    run,
    close,
    observation: null,
    snapshot: () => ({
        case: caseId,
        calls,
        progress,
        checks,
        counters: { ...counters },
        destroyedAssets: destroyed.length,
    }),
};
