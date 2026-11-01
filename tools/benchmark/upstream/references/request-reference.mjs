/** Protected AU01-AU03 reference configuration. Real native engine loading/rendering,
 * real browser fetch, and real HTTP barriers only. No validator import or PASS fields. */
import { loadFixedDocument, disposeAsset } from './three-reference.mjs';
const SCHEMA = 'upstream-agent-observation/1';
const TASKS = Object.freeze(['AU01', 'AU02', 'AU03']);
export const requestReferenceCoverage = Object.freeze({
    taskIds: TASKS,
    browserExecution: 'NOT_EXECUTED_BY_SOURCE_PREPARATION',
});
const abortError = () => Object.assign(new Error('Cancelled consumer cannot publish an asset'), { name: 'AbortError' });
const settled = (promise) =>
    promise.then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error }),
    );
async function withinDeadline(promise, milliseconds, label) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Reference operation timed out: ${label}`)), milliseconds);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
const errorRecord = (error) => error && { name: error.name, message: error.message, code: error.code ?? null };
const digest = async (bytes) =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
        v.toString(16).padStart(2, '0'),
    ).join('');
export function mergeThreePolicy(defaults = {}, overrides = {}) {
    const policy = { ...defaults };
    for (const [key, value] of Object.entries(overrides)) if (value !== undefined) policy[key] = value;
    if (policy.headers !== undefined) policy.headers = Object.fromEntries(new Headers(policy.headers));
    return policy;
}
/** Observes the effective call and clones actual response bytes; never supplies a response. */
export function observeFetch(target = globalThis) {
    const original = target.fetch;
    if (typeof original !== 'function') throw new TypeError('Real fetch required');
    const calls = [],
        bodyReads = [];
    const nativeFetch = original.bind(target);
    target.fetch = async function (input, init) {
        const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
        const url = request?.url || new URL(String(input), globalThis.location?.href).href;
        const matched = /\/(?:__policy\/assets\/|__paired-request\/session-\d+\/assets\/)/.test(new URL(url).pathname);
        let row;
        if (matched) {
            const value = (name, fallback) => init?.[name] ?? request?.[name] ?? fallback;
            const file = new URL(url).pathname.split('/').at(-1);
            row = {
                url,
                role:
                    file === 'model.gltf'
                        ? 'document'
                        : file === 'mesh.bin'
                          ? 'buffer'
                          : file === 'pixel.png'
                            ? 'image'
                            : 'failure',
                priority: value('priority', 'auto'),
                cache: value('cache', 'default'),
                mode: value('mode', 'cors'),
                credentials: value('credentials', 'same-origin'),
                headers: Object.fromEntries(new Headers(value('headers', {}))),
                signalAbortedAtCall: !!value('signal', null)?.aborted,
                httpStatus: null,
                responseSha256: null,
                responseBytes: null,
                error: null,
            };
            calls.push(row);
        }
        try {
            const response = await nativeFetch(input, init);
            if (row) {
                row.httpStatus = response.status;
                bodyReads.push(
                    response
                        .clone()
                        .arrayBuffer()
                        .then(async (bytes) => {
                            row.responseBytes = bytes.byteLength;
                            row.responseSha256 = await digest(bytes);
                        })
                        .catch((error) => {
                            row.bodyReadError = errorRecord(error);
                        }),
                );
            }
            return response;
        } catch (error) {
            if (row) row.error = errorRecord(error);
            throw error;
        }
    };
    return {
        calls,
        nativeFetch,
        async settle() {
            await Promise.all(bodyReads);
        },
        restore() {
            target.fetch = original;
        },
    };
}
function identityMap() {
    const ids = new WeakMap();
    let sequence = 0;
    return (object) => {
        if (!ids.has(object)) ids.set(object, `request-owned-${++sequence}`);
        return ids.get(object);
    };
}
async function makeContext({ engine, cc, THREE, GLTFLoader, canvas }) {
    const records = new Set(),
        destroyed = [],
        ids = identityMap(),
        activeBlobs = new Set();
    const originalCreate = URL.createObjectURL,
        originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = function (...args) {
        const result = originalCreate.apply(this, args);
        activeBlobs.add(result);
        return result;
    };
    URL.revokeObjectURL = function (url) {
        const result = originalRevoke.call(this, url);
        activeBlobs.delete(url);
        return result;
    };
    let app,
        scene,
        clock,
        renderer,
        camera,
        restoreDestroy = () => {},
        closed = false;
    const restoreURLs = () => {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
    };
    const settleFrames = async () => {
        if (engine === 'cocosair') {
            await clock.step(0);
            await Promise.resolve();
            await clock.step(0);
        } else {
            renderer.render(scene, camera);
            await new Promise((resolve) => requestAnimationFrame(resolve));
            renderer.render(scene, camera);
            await Promise.resolve();
        }
    };
    const context = {
        engine,
        records,
        destroyed,
        activeBlobs,
        settle: settleFrames,
        remainingTemporary(start) {
            const live = new Set();
            for (const group of destroyed.slice(start))
                for (const resource of group) if (resource?.isValid === true) live.add(resource);
            return live.size + activeBlobs.size;
        },
        mounted(record) {
            return record && record.root?.parent === scene ? 1 : 0;
        },
        snapshot(record) {
            if (!record) return null;
            const root = record.root;
            return {
                rootId: ids(root),
                rootParentId: root.parent ? ids(root.parent) : null,
                position:
                    engine === 'three' ? root.position.toArray() : [root.position.x, root.position.y, root.position.z],
                meshes: record.meshCount,
                assetId: ids(record.asset),
            };
        },
        pixels() {
            const gl = engine === 'three' ? renderer.getContext() : app.canvas.getContext('webgl2');
            if (!gl || gl.isContextLost()) throw new Error('Real live WebGL2 context required');
            const width = 8,
                height = 8,
                data = new Uint8Array(width * height * 4);
            gl.readPixels(
                Math.floor(gl.drawingBufferWidth / 2) - 4,
                Math.floor(gl.drawingBufferHeight / 2) - 4,
                width,
                height,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                data,
            );
            if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL readback failed');
            return Array.from(data);
        },
        async load(
            url,
            {
                policy = {},
                signal,
                onProgress = () => {},
                afterConfiguration = () => {},
                nativeOptionFree = false,
            } = {},
        ) {
            let asset;
            if (engine === 'cocosair') {
                const loader = nativeOptionFree
                    ? new cc.GLTFLoader()
                    : new cc.GLTFLoader({ request: policy, signal, onProgress });
                afterConfiguration();
                asset = await loader.loadAsync(url);
            } else if (nativeOptionFree) {
                asset = await new GLTFLoader().loadAsync(url);
            } else {
                const snapshot = mergeThreePolicy({}, policy);
                afterConfiguration();
                asset = await loadFixedDocument({
                    loader: new GLTFLoader(),
                    url,
                    policy: snapshot,
                    signal,
                    onProgress,
                });
            }
            if (signal?.aborted) {
                if (engine === 'cocosair') asset.destroy();
                else disposeAsset(asset);
                throw abortError();
            }
            let record;
            if (engine === 'cocosair') {
                const instance = asset.instantiate();
                scene.addChild(instance.root);
                record = {
                    asset,
                    instance,
                    root: instance.root,
                    meshCount: asset.meshes.length,
                    sceneRoots: instance.root.children.length || 1,
                };
            } else {
                scene.add(asset.scene);
                let meshes = 0;
                asset.scene.traverse((node) => {
                    if (node.isMesh) meshes++;
                });
                record = { asset, root: asset.scene, meshCount: meshes, sceneRoots: asset.scene.children.length };
            }
            records.add(record);
            return record;
        },
        async dispose(record) {
            if (!record || !records.has(record)) return;
            if (engine === 'cocosair') {
                record.instance.dispose();
                if (![...records].some((other) => other !== record && other.asset === record.asset))
                    record.asset.destroy();
            } else {
                record.root.removeFromParent();
                disposeAsset(record.asset);
            }
            records.delete(record);
            await settleFrames();
        },
        async close() {
            if (closed) return;
            closed = true;
            try {
                for (const record of [...records]) await context.dispose(record);
                if (engine === 'cocosair') {
                    clock?.end();
                    await app?.releaseScene();
                    await app?.close();
                } else renderer?.dispose();
            } finally {
                restoreDestroy();
                restoreURLs();
            }
        },
    };
    try {
        if (engine === 'cocosair') {
            if (typeof cc?.GLTFLoader !== 'function') throw new TypeError('Pinned Cocos GLTFLoader required');
            const original = cc.GLTFAsset.prototype.destroy;
            cc.GLTFAsset.prototype.destroy = function (...args) {
                destroyed.push([this, ...this.meshes, ...this.materials, ...this.textures, ...this.images]);
                return original.apply(this, args);
            };
            restoreDestroy = () => {
                cc.GLTFAsset.prototype.destroy = original;
            };
            app = await cc.createAirApp({ canvas, pixelRatioCap: 1 });
            scene = new cc.Scene('paired-http-request');
            scene.globals.ambient.skyIllum = 9000;
            scene.globals.ambient.skyColor = new cc.Vec4(1, 1, 1, 1);
            const cameraNode = new cc.Node('camera');
            scene.addChild(cameraNode);
            cameraNode.setPosition(0, 0, 2);
            cameraNode.lookAt(new cc.Vec3());
            camera = cameraNode.addComponent(cc.Camera);
            camera.projection = cc.Camera.ProjectionType.ORTHO;
            camera.orthoHeight = 1;
            camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
            camera.clearColor = new cc.Color(0, 0, 0, 255);
            const light = new cc.Node('light');
            scene.addChild(light);
            light.addComponent(cc.DirectionalLight).illuminance = 65000;
            app.run(scene);
            clock = cc.createStepClock({ stepTimeoutMs: 10000 });
            clock.begin();
        } else {
            if (!THREE || typeof GLTFLoader !== 'function')
                throw new TypeError('Pinned three namespace and GLTFLoader required');
            const element = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
            renderer = new THREE.WebGLRenderer({ canvas: element, antialias: false, preserveDrawingBuffer: true });
            renderer.setPixelRatio(1);
            renderer.setSize(640, 360, false);
            renderer.setClearColor(0x000000, 1);
            renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
            renderer.toneMapping = THREE.NoToneMapping;
            scene = new THREE.Scene();
            scene.add(new THREE.AmbientLight(0xffffff, 2));
            camera = new THREE.OrthographicCamera(-640 / 360, 640 / 360, 1, -1, 0.1, 10);
            camera.position.z = 2;
            camera.lookAt(0, 0, 0);
            if (!renderer.getContext().getParameter(renderer.getContext().VERSION).includes('WebGL 2'))
                throw new Error('WebGL2 required');
        }
        await settleFrames();
        return context;
    } catch (error) {
        await context.close();
        throw error;
    }
}
async function jsonRequest(fetchImpl, url, method = 'GET') {
    const response = await fetchImpl(url, { method, cache: 'no-store' });
    if (!response.ok) throw new Error(`Real fixture request failed: ${response.status} ${await response.text()}`);
    return response.json();
}
async function basic(ctx, recorder, config) {
    const start = recorder.calls.length;
    const record = await ctx.load(config.basicURL, { policy: { httpCache: 'no-store' } });
    await ctx.settle();
    await recorder.settle();
    const calls = recorder.calls.slice(start),
        main = calls.find((call) => call.role === 'document');
    const load = {
        id: 'load',
        resourceSha256: main?.responseSha256,
        sceneRoots: record.sceneRoots,
        meshes: record.meshCount,
        pixels: ctx.pixels(),
        requests: calls,
    };
    await ctx.dispose(record);
    const failureStart = recorder.calls.length;
    const failed = await settled(ctx.load(config.failureURL, { policy: { httpCache: 'no-store' } }));
    await ctx.settle();
    await recorder.settle();
    const failedCalls = recorder.calls.slice(failureStart);
    const failure = {
        id: 'failure',
        httpStatus: failedCalls[0]?.httpStatus ?? null,
        attachedRoots: ctx.mounted(failed.value),
        errorMessage: failed.error?.message ?? null,
        error: errorRecord(failed.error),
        requests: failedCalls,
    };
    if (failed.value) await ctx.dispose(failed.value);
    // Leave the actual successful native scene mounted for the independent compositor capture.
    await ctx.load(config.basicURL, { policy: { httpCache: 'no-store' } });
    await ctx.settle();
    return [load, failure];
}
async function policies(ctx, recorder, config, options) {
    const calls = [],
        observations = [];
    for (const priority of ['auto', 'low', 'high'])
        for (const cache of ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached']) {
            if (cache === 'only-if-cached') {
                const warm = await ctx.load(config.cacheURL, { policy: { priority, httpCache: 'force-cache' } });
                await ctx.dispose(warm);
            }
            const before = await jsonRequest(recorder.nativeFetch, `${config.primaryOrigin}/__paired-request/state`);
            const start = recorder.calls.length;
            const loaded = await ctx.load(config.cacheURL, { policy: { priority, httpCache: cache } });
            await ctx.settle();
            await recorder.settle();
            const current = recorder.calls
                .slice(start)
                .filter((call) => ['document', 'buffer', 'image'].includes(call.role));
            for (const call of current) calls.push({ ...call, id: `${priority}/${cache}/${call.role}` });
            const after = await jsonRequest(recorder.nativeFetch, `${config.primaryOrigin}/__paired-request/state`);
            observations.push({
                priority,
                cache,
                serverEntriesBefore: before.sessions.base.entries.length,
                serverEntriesAfter: after.sessions.base.entries.length,
                requests: current,
            });
            await ctx.dispose(loaded);
        }
    const credentialObservations = [];
    for (const credentials of ['omit', 'same-origin', 'include']) {
        const start = recorder.calls.length;
        const loaded = await ctx.load(config.basicURL, {
            policy: { credentials, httpCache: 'no-store', headers: { 'X-Benchmark-Fixture': 'public-synthetic' } },
        });
        await ctx.dispose(loaded);
        await recorder.settle();
        credentialObservations.push({ requested: credentials, calls: recorder.calls.slice(start) });
    }
    const snapshotHeaders = new Headers({ 'X-Fixture': 'before-configuration' });
    const snapshotStart = recorder.calls.length;
    const snapshotted = await ctx.load(config.basicURL, {
        policy: { httpCache: 'no-store', headers: snapshotHeaders },
        afterConfiguration: () => snapshotHeaders.set('X-Fixture', 'after-configuration'),
    });
    await ctx.dispose(snapshotted);
    await recorder.settle();
    const headerSnapshotObservation = {
        mutatedOriginal: Object.fromEntries(snapshotHeaders),
        calls: recorder.calls.slice(snapshotStart),
    };
    const isolatedStart = recorder.calls.length;
    const isolated = await Promise.all([
        ctx.load(config.basicURL, { policy: { httpCache: 'no-store' } }),
        ctx.load(config.basicURL, { policy: { httpCache: 'no-store' } }),
    ]);
    const configuredConsumerObservation = {
        sameAsset: isolated[0].asset === isolated[1].asset,
        sameRoot: isolated[0].root === isolated[1].root,
        nativeCacheHasConfiguredAsset:
            ctx.engine === 'cocosair' ? options.cc.assetManager.assets.get(config.basicURL) !== undefined : null,
        scope: 'Configured native Cocos assets versus Three independent parsed asset wrapper; no claim that native cache APIs are equivalent.',
    };
    for (const record of isolated) await ctx.dispose(record);
    await recorder.settle();
    configuredConsumerObservation.calls = recorder.calls.slice(isolatedStart);
    const nativeStart = recorder.calls.length;
    const nativePair = await Promise.all([
        ctx.load(config.basicURL, { nativeOptionFree: true }),
        ctx.load(config.basicURL, { nativeOptionFree: true }),
    ]);
    await recorder.settle();
    const optionFreeNativeObservation = {
        api: ctx.engine === 'cocosair' ? 'GLTFLoader().loadAsync' : 'GLTFLoader().loadAsync',
        sameAsset: nativePair[0].asset === nativePair[1].asset,
        sameRoot: nativePair[0].root === nativePair[1].root,
        nativeCacheEntryPresent:
            ctx.engine === 'cocosair'
                ? options.cc.assetManager.assets.get(config.basicURL) !== undefined
                : options.THREE.Cache.get(config.basicURL) !== undefined,
        nativeCacheEnabled: ctx.engine === 'three' ? options.THREE.Cache.enabled : null,
        calls: recorder.calls.slice(nativeStart),
        scope: 'Observed option-free native loader/cache/in-flight behavior only; cache semantics and asset identity need not agree across engines.',
    };
    for (const record of nativePair) await ctx.dispose(record);

    const inherited = {
        priority: 'high',
        httpCache: 'reload',
        headers: { 'X-Fixture': 'inherited', 'X-Benchmark-Fixture': 'should-be-replaced' },
    };
    const overridePolicy = { priority: 'auto', httpCache: 'default', headers: { 'X-Fixture': 'local' } };
    if (ctx.engine === 'cocosair') options.cc.configureGLTFLoaderDefaults({ request: inherited });
    const overrideStart = recorder.calls.length;
    let overrideRecord;
    try {
        overrideRecord = await ctx.load(config.basicURL, {
            policy: ctx.engine === 'cocosair' ? overridePolicy : mergeThreePolicy(inherited, overridePolicy),
        });
    } finally {
        if (ctx.engine === 'cocosair') options.cc.configureGLTFLoaderDefaults({ request: undefined });
    }
    await ctx.dispose(overrideRecord);
    await recorder.settle();
    const overrideCalls = recorder.calls.slice(overrideStart),
        actual = overrideCalls.find((call) => call.role === 'document');
    const override = {
        id: 'override',
        effective: actual ? { priority: actual.priority, cache: actual.cache, headers: actual.headers } : null,
        calls: overrideCalls,
        headerSnapshotObservation,
        credentialObservations,
        configuredConsumerObservation,
        optionFreeNativeObservation,
    };
    const crossStart = recorder.calls.length;
    await ctx.load(config.crossURL, { policy: { httpCache: 'no-store', headers: { 'X-Fixture': 'origin-only' } } });
    await ctx.settle();
    await recorder.settle();
    const raw = await jsonRequest(recorder.nativeFetch, `${config.primaryOrigin}/__paired-request/state`);
    const crossEntries = raw.sessions.base.entries.filter(
        (entry) => entry.case === 'cross-origin-headers' && entry.method === 'GET',
    );
    return [
        {
            id: 'policy-matrix',
            origin: config.primaryOrigin,
            calls,
            prioritySchedulingClaim: false,
            requestPriorityPropertySupported: 'priority' in new Request(config.basicURL),
            httpCacheObservations: observations,
        },
        override,
        {
            id: 'cross-origin',
            documentHeaders:
                crossEntries.find((entry) => entry.resource === 'model.gltf' && entry.origin === 'primary')?.headers ??
                null,
            dependencyHeaders:
                crossEntries.find((entry) => entry.resource === 'mesh.bin' && entry.origin === 'cross')?.headers ??
                null,
            calls: recorder.calls.slice(crossStart),
            serverEntries: crossEntries,
        },
    ];
}
async function cancelCase(ctx, recorder, config, concurrent) {
    const session = await jsonRequest(
        recorder.nativeFetch,
        `${config.primaryOrigin}/__paired-request/new-session?kind=${concurrent ? 'concurrent' : 'single'}`,
        'POST',
    );
    const control = (op, ordinal = 1) =>
        jsonRequest(
            recorder.nativeFetch,
            `${session.controlURL}?op=${op}&resource=mesh.bin&ordinal=${ordinal}`,
            op === 'release' ? 'POST' : 'GET',
        );
    const controller = new AbortController(),
        progress = [],
        progressAfter = [],
        temporaryStart = ctx.destroyed.length;
    let aborted = false,
        mountedA = null,
        survivor = null;
    const survivorController = new AbortController();
    let loadB, heldB;
    try {
        const policy = { priority: 'auto', httpCache: 'no-store' };
        const loadA = settled(
            ctx
                .load(session.modelURL, {
                    policy,
                    signal: controller.signal,
                    onProgress: (value) => {
                        progress.push(value);
                        if (aborted) progressAfter.push(value);
                    },
                })
                .then((record) => {
                    mountedA = record;
                    return record;
                }),
        );
        const heldA = await control('wait-held');
        if (concurrent) {
            loadB = settled(ctx.load(session.modelURL, { policy, signal: survivorController.signal }));
            heldB = await control('wait-held', 2);
        }
        aborted = true;
        controller.abort();
        const resultA = await withinDeadline(loadA, 10000, 'aborted consumer rejection');
        const abortReceipt = await control('wait-aborted');
        await control('release');
        if (concurrent) {
            await control('release', 2);
            const resultB = await loadB;
            if (resultB.error) throw resultB.error;
            survivor = resultB.value;
        }
        await ctx.settle();
        await recorder.settle();
        const abortedAttachedRoots = ctx.mounted(mountedA),
            survivorBefore = ctx.snapshot(survivor);
        const remainingOwnedResources = ctx.remainingTemporary(temporaryStart);
        const retry = await ctx.load(session.modelURL, { policy, signal: new AbortController().signal });
        await ctx.settle();
        await recorder.settle();
        const row = {
            id: concurrent ? 'survivor-retry' : 'delayed-buffer',
            errorName: resultA.error?.name ?? null,
            error: errorRecord(resultA.error),
            abortedAttachedRoots,
            lateAttachedRoots: ctx.mounted(mountedA),
            progressAfterAbort: progressAfter.length,
            progress,
            remainingOwnedResources,
            resourceCountScope:
                'Observed parse-owned asset/resource validity and live Blob URLs, not total GPU or process memory.',
            retryAttachedRoots: ctx.mounted(retry),
            retryPixels: ctx.pixels(),
            barrierReceipts: { heldA, heldB: heldB ?? null, abortReceipt },
            survivorAttachedRoots: ctx.mounted(survivor),
            survivorBefore,
            survivorAfter: ctx.snapshot(survivor),
        };
        // Preserve the final retry for the compositor, but clear preceding case resources before the next case.
        return { row, retry, survivor };
    } finally {
        controller.abort();
        survivorController.abort();
        // On failure, release only actual server holds; never substitute a completion or observation.
        await Promise.allSettled([control('release'), ...(concurrent ? [control('release', 2)] : [])]);
    }
}
export async function runRequestReference(taskId, options = {}) {
    if (!TASKS.includes(taskId)) throw new Error(`Unsupported request reference task: ${taskId}`);
    const engine = options.engine ?? (options.cc ? 'cocosair' : 'three');
    if (!['cocosair', 'three'].includes(engine)) throw new Error('Explicit engine identity required');
    const fixtureOrigin = new URL(options.fixtureOrigin || location.origin).origin;
    if (fixtureOrigin !== location.origin)
        throw new Error('Request fixture must share the page origin for only-if-cached');
    const recorder = observeFetch();
    let ctx;
    try {
        const config = await jsonRequest(recorder.nativeFetch, `${fixtureOrigin}/__paired-request/config`);
        if (config.primaryOrigin !== fixtureOrigin)
            throw new Error('Fixture origin identity differs from current browser origin');
        ctx = await makeContext({ ...options, engine });
        let cases;
        if (taskId === 'AU01') cases = await basic(ctx, recorder, config);
        else if (taskId === 'AU02') cases = await policies(ctx, recorder, config, options);
        else {
            const first = await cancelCase(ctx, recorder, config, false);
            await ctx.dispose(first.retry);
            const second = await cancelCase(ctx, recorder, config, true);
            cases = [first.row, second.row];
        }
        await ctx.settle();
        await recorder.settle();
        const server = await jsonRequest(recorder.nativeFetch, `${fixtureOrigin}/__paired-request/state`);
        const report = {
            schema: SCHEMA,
            taskId,
            contractId: `${SCHEMA}:${taskId}`,
            engine,
            status: 'OBSERVED_NOT_VALIDATED',
            cases,
            collection: {
                source: 'native-engine-loads-real-fetch-and-real-HTTP-barriers',
                requests: recorder.calls,
                server,
                presentation:
                    'Canvas is left live. Collector must retain a genuine compositor screenshot before close; readback alone is not presentation proof.',
            },
        };
        Object.defineProperty(report, 'close', {
            enumerable: false,
            value: async () => {
                try {
                    await ctx.close();
                } finally {
                    recorder.restore();
                }
            },
        });
        return report;
    } catch (error) {
        try {
            await ctx?.close();
        } finally {
            recorder.restore();
        }
        throw error;
    }
}
