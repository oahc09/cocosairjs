import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFAsset, assetManager } from '../../src';
import { configureGLTFLoaderDefaults, GLTFLoader } from '../../src/air/assets/gltf/loader';
import { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { awaitAbortable, requestInit } from '../../src/air/assets/gltf/request-policy';
import type { AirRequestPolicy, GLTFLoadProgress } from '../../src/air/assets/gltf/progress';
import type { DecodedPrimitive, DecodedTextureSource } from '../../src/air/assets/gltf/decoder/types';
import { KTX2_RAW_MIME } from '../../src/air/assets/gltf/decoder/types';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { ImageAsset } from '../../src/cocos/asset/assets/image-asset';
import { CCObject } from '../../src/cocos/core/data/object';
import { fixture } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
function response(data: ArrayBuffer): Response {
    return { ok: true, status: 200, arrayBuffer: async () => data } as Response;
}
function encoded(json: unknown): ArrayBuffer {
    return new TextEncoder().encode(JSON.stringify(json)).buffer;
}
async function microtasks(): Promise<void> {
    for (let i = 0; i < 40; ++i) {
        await Promise.resolve();
    }
}
const empty = { asset: { version: '2.0' } };
const base = 'https://request-policy.test/models/';
const originalFetch = globalThis.fetch;
const originalImage = globalThis.Image;
const originalCreateURL = URL.createObjectURL;
const originalRevokeURL = URL.revokeObjectURL;

// CPU/headless contracts. Browser HTTP cache and priority scheduling are deliberately not
// inferred from mocked requests; multi-browser server/compositor evidence is separate.
describe('upstream U01 request policy and cancellation (T01-T06 CPU contracts)', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => {
        configureGLTFLoaderDefaults({
            request: undefined,
            signal: undefined,
            onProgress: undefined,
            dracoDecoder: undefined,
            meshoptDecoder: undefined,
            ktx2Transcoder: undefined,
        });
        Object.assign(globalThis, { fetch: originalFetch, Image: originalImage });
        URL.createObjectURL = originalCreateURL;
        URL.revokeObjectURL = originalRevokeURL;
        CCObject._deferredDestroy();
        await microtasks();
        CCObject._deferredDestroy();
        jest.restoreAllMocks();
    });

    test('T01 option-free loads still share the native cache and preserve credentials', async () => {
        const url = `${base}native.glb`;
        const fetcher = jest.fn().mockResolvedValue(response(encoded(empty)));
        Object.assign(globalThis, { fetch: fetcher });
        const loader = new GLTFLoader();
        const [a, b] = await Promise.all([loader.loadAsync(url), loader.loadAsync(url)]);
        expect(a).toBe(b);
        expect(assetManager.assets.get(url)).toBe(a);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin' });
        const remote = await new Promise<GLTFAsset>((resolve, reject) => {
            assetManager.loadRemote<GLTFAsset>(url, (error, value) => (error ? reject(error) : resolve(value)));
        });
        expect(remote).toBe(a);
        a.destroy();
    });

    test('T02 policies reach the main file and dependencies, but headers stop at its origin', async () => {
        const json = {
            ...empty,
            buffers: [
                { uri: 'local.bin', byteLength: 4 },
                { uri: 'https://other.test/remote.bin', byteLength: 4 },
            ],
        };
        const fetcher = jest.fn(async (url: string) =>
            response(url.endsWith('.gltf') ? encoded(json) : new ArrayBuffer(4)),
        );
        Object.assign(globalThis, { fetch: fetcher });
        const asset = await new GLTFLoader({
            request: {
                priority: 'high',
                httpCache: 'no-store',
                credentials: 'omit',
                headers: { 'X-Synthetic-Test': 'bounded' },
            },
        }).loadAsync(`${base}policy.gltf`);
        expect(fetcher).toHaveBeenCalledTimes(3);
        for (const [url, init] of fetcher.mock.calls as unknown as [string, RequestInit & { priority?: string }][]) {
            expect(init).toMatchObject({ priority: 'high', cache: 'no-store', credentials: 'omit' });
            if (url.startsWith(base)) {
                expect(new Headers(init.headers).get('X-Synthetic-Test')).toBe('bounded');
                expect(init.redirect).toBe('error');
            } else {
                expect(init.headers).toBeUndefined();
                expect(init.redirect).toBeUndefined();
            }
        }
        expect(assetManager.assets.get(`${base}policy.gltf`)).toBeUndefined();
        asset.destroy();
    });

    test('T02 same-origin redirects with configured headers fail closed; opaque origins never share headers', () => {
        const policy: AirRequestPolicy = { headers: [['X-Synthetic-Test', 'only-main-origin']] };
        expect(requestInit(`${base}redirect`, policy, undefined, new URL(base).origin).redirect).toBe('error');
        expect(requestInit('data:application/octet-stream;base64,AA==', policy).headers).toBeUndefined();
        expect(requestInit('https://other.test/data', policy, undefined, new URL(base).origin).headers).toBeUndefined();
        expect(
            requestInit(`${base}redirect`, { headers: {} }, undefined, new URL(base).origin).redirect,
        ).toBeUndefined();
    });

    test('T02 only-if-cached supplies the Fetch-required same-origin mode', () => {
        expect(requestInit(`${base}cached.bin`, { httpCache: 'only-if-cached' })).toMatchObject({
            cache: 'only-if-cached',
            mode: 'same-origin',
            credentials: 'same-origin',
        });
    });

    test('T03 defined defaults win; undefined fields inherit and mutable headers are snapshotted', async () => {
        const globalHeaders = new Headers({ 'X-Synthetic-Test': 'global' });
        configureGLTFLoaderDefaults({
            request: { priority: 'high', httpCache: 'no-store', credentials: 'include', headers: globalHeaders },
        });
        globalHeaders.set('X-Synthetic-Test', 'mutated');
        configureGLTFLoaderDefaults({ request: { priority: undefined } });
        const fetcher = jest.fn().mockResolvedValue(response(encoded(empty)));
        Object.assign(globalThis, { fetch: fetcher });
        const inherited = await new GLTFLoader({ request: { priority: undefined } }).loadAsync(`${base}inherit.gltf`);
        const inheritedInit = fetcher.mock.calls[0][1];
        expect(inheritedInit).toMatchObject({ priority: 'high', cache: 'no-store', credentials: 'include' });
        expect(new Headers(inheritedInit.headers).get('X-Synthetic-Test')).toBe('global');
        const explicit = await new GLTFLoader({
            request: { priority: 'auto', httpCache: 'default', credentials: 'same-origin', headers: {} },
        }).loadAsync(`${base}explicit.gltf`);
        expect(fetcher.mock.calls[1][1]).toMatchObject({
            priority: 'auto',
            cache: 'default',
            credentials: 'same-origin',
        });
        expect(new Headers(fetcher.mock.calls[1][1].headers).get('X-Synthetic-Test')).toBeNull();
        inherited.destroy();
        explicit.destroy();
    });

    test('T03 global defaults isolate even a loader without instance options; native assets remain untouched', async () => {
        const url = `${base}global-isolation.gltf`;
        const fetcher = jest.fn().mockResolvedValue(response(encoded(empty)));
        Object.assign(globalThis, { fetch: fetcher });
        const native = await new GLTFLoader().loadAsync(url);
        configureGLTFLoaderDefaults({ request: { httpCache: 'reload' } });
        const configured = await new GLTFLoader().loadAsync(url);
        expect(configured).not.toBe(native);
        expect(assetManager.assets.get(url)).toBe(native);
        expect(fetcher).toHaveBeenCalledTimes(2);
        configureGLTFLoaderDefaults({ request: undefined });
        expect(await new GLTFLoader().loadAsync(url)).toBe(native);
        configured.destroy();
        native.destroy();
    });

    test('T03 explicit legacy decoder disable and signal reset survive the native-route decision', async () => {
        const decoder = Object.freeze({ decodePrimitive: jest.fn(), dispose: jest.fn() });
        const controller = new AbortController();
        controller.abort();
        configureGLTFLoaderDefaults({ dracoDecoder: decoder, signal: controller.signal });
        const json = {
            ...empty,
            extensionsUsed: ['KHR_draco_mesh_compression'],
            extensionsRequired: ['KHR_draco_mesh_compression'],
        };
        Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue(response(encoded(json))) });
        await expect(new GLTFLoader().loadAsync(`${base}global-abort.gltf`)).rejects.toMatchObject({
            name: 'AbortError',
        });
        const reset = await new GLTFLoader({ signal: undefined }).loadAsync(`${base}signal-reset.gltf`);
        reset.destroy();
        configureGLTFLoaderDefaults({ signal: undefined });
        await expect(
            new GLTFLoader().setDRACODecoder(null).loadAsync(`${base}decoder-disabled.gltf`),
        ).rejects.toMatchObject({ code: 'GLTF_DECODER_MISSING' });
        expect(decoder.decodePrimitive).not.toHaveBeenCalled();
        expect(decoder.dispose).not.toHaveBeenCalled();
        expect(assetManager.assets.get(`${base}decoder-disabled.gltf`)).toBeUndefined();
    });

    test('T03 custom registrations are honored by loadAsync and isolated from native factory instances', async () => {
        const calls: string[] = [];
        const dispose = jest.fn();
        const cleanup = jest.fn();
        Object.assign(globalThis, {
            fetch: jest.fn().mockResolvedValue(response(encoded({ ...empty, materials: [{}] }))),
        });
        const loader = new GLTFLoader().register((context) => ({
            name: 'TEST_custom',
            extendMaterial: () => {
                calls.push('custom');
                context.addCleanup(cleanup);
            },
            dispose,
        }));
        const asset = await loader.loadAsync(`${base}custom.gltf`);
        expect(calls).toEqual(['custom']);
        expect(cleanup).not.toHaveBeenCalled();
        expect(assetManager.assets.get(`${base}custom.gltf`)).toBeUndefined();
        asset.destroy();
        // Handler destruction is the GLTFAsset lifetime contract, not decoder disposal.
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    test('T04 pre-cancel rejects before any native cache lookup, fetch, decoder or progress callback', async () => {
        const controller = new AbortController();
        controller.abort();
        const fetcher = jest.fn();
        const onProgress = jest.fn();
        Object.assign(globalThis, { fetch: fetcher });
        const native = jest.spyOn(assetManager, 'loadRemote');
        const loader = new GLTFLoader({ signal: controller.signal, onProgress });
        await expect(loader.loadAsync(`${base}pre-cancel.glb`)).rejects.toMatchObject({ name: 'AbortError' });
        await expect(loader.parseAsync('not JSON')).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetcher).not.toHaveBeenCalled();
        expect(native).not.toHaveBeenCalled();
        expect(onProgress).not.toHaveBeenCalled();
    });

    test('T04 an uncooperative main fetch rejects promptly and cancels its late response body', async () => {
        const controller = new AbortController();
        const pending = deferred<Response>();
        const cancel = jest.fn().mockResolvedValue(undefined);
        Object.assign(globalThis, { fetch: jest.fn(() => pending.promise) });
        const destroy = jest.spyOn(GLTFAsset.prototype, 'destroy');
        const promise = new GLTFLoader({ signal: controller.signal }).loadAsync(`${base}late-main.gltf`);
        controller.abort();
        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
        pending.resolve({ ...response(encoded(empty)), body: { cancel } } as unknown as Response);
        await microtasks();
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(destroy).not.toHaveBeenCalled();
        expect(assetManager.assets.get(`${base}late-main.gltf`)).toBeUndefined();
    });

    test('T04 response-body reading is abortable without entering parse', async () => {
        const controller = new AbortController();
        const pending = deferred<ArrayBuffer>();
        const read = deferred<void>();
        const onProgress = jest.fn();
        Object.assign(globalThis, {
            fetch: jest.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: () => {
                    read.resolve();
                    return pending.promise;
                },
            }),
        });
        const promise = new GLTFLoader({ signal: controller.signal, onProgress }).loadAsync(`${base}body.gltf`);
        await read.promise;
        controller.abort();
        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
        pending.resolve(encoded(empty));
        await microtasks();
        expect(onProgress).not.toHaveBeenCalled();
    });

    test('T05 failed request and dependency promises evict, preserving successful deduplication', async () => {
        const fetcher = jest
            .fn()
            .mockRejectedValueOnce(new Error('temporary outage'))
            .mockResolvedValue(response(new ArrayBuffer(4)));
        Object.assign(globalThis, { fetch: fetcher });
        const context = new GLTFParserContext(empty, base);
        await expect(context.dependency('buffer', () => context.request('retry.bin'))).rejects.toThrow(
            'temporary outage',
        );
        const a = context.dependency('buffer', () => context.request('retry.bin'));
        const b = context.dependency('buffer', () => context.request('retry.bin'));
        expect(a).toBe(b);
        expect((await a).byteLength).toBe(4);
        expect(fetcher).toHaveBeenCalledTimes(2);
        const syncFailure = (): Promise<number> => {
            throw new Error('synchronous decoder failure');
        };
        await expect(context.dependency('sync', syncFailure)).rejects.toThrow('synchronous decoder failure');
        await expect(context.dependency('sync', async () => 7)).resolves.toBe(7);
        context.dispose();
    });

    test('T05 cancellation during a dependency discards late bytes and retry with a new signal succeeds', async () => {
        const json = { ...empty, buffers: [{ uri: 'deferred.bin', byteLength: 4 }] };
        const pending = deferred<Response>();
        const controller = new AbortController();
        const fetcher = jest
            .fn()
            .mockImplementationOnce(() => pending.promise)
            .mockResolvedValue(response(new ArrayBuffer(4)));
        Object.assign(globalThis, { fetch: fetcher });
        const progress: GLTFLoadProgress[] = [];
        const load = new GLTFLoader({
            signal: controller.signal,
            onProgress: (event) => progress.push(event),
        }).parseAsync(JSON.stringify(json), base);
        await microtasks();
        controller.abort();
        await expect(load).rejects.toMatchObject({ name: 'AbortError' });
        pending.resolve(response(new ArrayBuffer(4)));
        await microtasks();
        expect(progress.some((event) => event.phase === 'objects')).toBe(false);
        const retried = await new GLTFLoader({ signal: new AbortController().signal }).parseAsync(
            JSON.stringify(json),
            base,
        );
        expect(fetcher).toHaveBeenCalledTimes(2);
        retried.destroy();
    });

    test('T05 an uncancellable Draco decoder is not disposed or reconfigured and late geometry is ignored', async () => {
        const f = fixture();
        f.json.extensionsUsed = ['KHR_draco_mesh_compression'];
        f.json.extensionsRequired = ['KHR_draco_mesh_compression'];
        f.json.meshes![0].primitives[0].extensions = {
            KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } },
        };
        f.json.buffers![0].uri = 'mesh.bin';
        const pending = deferred<DecodedPrimitive>();
        const started = deferred<void>();
        const decoder = Object.freeze({
            decodePrimitive: jest.fn(() => {
                started.resolve();
                return pending.promise;
            }),
            dispose: jest.fn(),
        });
        Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue(response(f.bin)) });
        const controller = new AbortController();
        const destroy = jest.spyOn(GLTFAsset.prototype, 'destroy');
        const progress = jest.fn();
        const load = new GLTFLoader({
            signal: controller.signal,
            dracoDecoder: decoder,
            onProgress: progress,
        }).parseAsync(JSON.stringify(f.json), base);
        await started.promise;
        controller.abort();
        await expect(load).rejects.toMatchObject({ name: 'AbortError' });
        const progressAtCancel = progress.mock.calls.length;
        pending.resolve({ attributes: { POSITION: new Float32Array(9) } });
        await microtasks();
        expect(decoder.dispose).not.toHaveBeenCalled();
        expect(decoder.decodePrimitive).toHaveBeenCalledTimes(1);
        expect(progress).toHaveBeenCalledTimes(progressAtCancel);
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    test('T05 uncancellable meshopt waits are isolated and the same provider can serve a successful retry', async () => {
        const json = {
            ...empty,
            extensionsUsed: ['EXT_meshopt_compression'],
            extensionsRequired: ['EXT_meshopt_compression'],
            buffers: [{ uri: 'compressed.bin', byteLength: 4 }, { byteLength: 4 }],
            bufferViews: [
                {
                    buffer: 1,
                    byteLength: 4,
                    extensions: {
                        EXT_meshopt_compression: {
                            buffer: 0,
                            byteLength: 4,
                            byteStride: 4,
                            count: 1,
                            mode: 'ATTRIBUTES',
                        },
                    },
                },
            ],
        };
        Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue(response(new ArrayBuffer(4))) });
        const pending = deferred<Uint8Array>();
        const started = deferred<void>();
        const decoder = Object.freeze({
            decodeGltfBufferAsync: jest
                .fn()
                .mockImplementationOnce(() => {
                    started.resolve();
                    return pending.promise;
                })
                .mockResolvedValue(new Uint8Array(4)),
            dispose: jest.fn(),
        });
        const controller = new AbortController();
        const load = new GLTFLoader({ signal: controller.signal, meshoptDecoder: decoder }).parseAsync(
            JSON.stringify(json),
            base,
        );
        await started.promise;
        controller.abort();
        await expect(load).rejects.toMatchObject({ name: 'AbortError' });
        pending.resolve(new Uint8Array(4));
        await microtasks();
        const retry = await new GLTFLoader({ meshoptDecoder: decoder }).parseAsync(JSON.stringify(json), base);
        expect(decoder.decodeGltfBufferAsync).toHaveBeenCalledTimes(2);
        expect(decoder.dispose).not.toHaveBeenCalled();
        retry.destroy();
        expect(decoder.dispose).not.toHaveBeenCalled();
    });

    test('T05 custom async material work cannot restart parser work after cancellation', async () => {
        const gate = deferred<void>();
        const started = deferred<void>();
        const cleanup = jest.fn();
        const dispose = jest.fn();
        const fetcher = jest.fn();
        Object.assign(globalThis, { fetch: fetcher });
        const controller = new AbortController();
        let lateRequestError: unknown;
        const loader = new GLTFLoader({ signal: controller.signal }).register((context) => ({
            name: 'TEST_slow_material',
            dispose,
            async extendMaterial() {
                started.resolve();
                await gate.promise;
                context.addCleanup(cleanup);
                try {
                    await context.request('must-not-start.bin');
                } catch (error) {
                    lateRequestError = error;
                }
            },
        }));
        const load = loader.parseAsync(JSON.stringify({ ...empty, materials: [{}] }), base);
        await started.promise;
        controller.abort();
        await expect(load).rejects.toMatchObject({ name: 'AbortError' });
        await microtasks();
        expect(dispose).toHaveBeenCalledTimes(1);
        gate.resolve();
        await microtasks();
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(fetcher).not.toHaveBeenCalled();
        expect(lateRequestError).toMatchObject({ name: 'AbortError' });
    });

    test('T05 failed configured parsing never poisons a same-URL retry', async () => {
        const url = `${base}repair.gltf`;
        const fetcher = jest
            .fn()
            .mockResolvedValueOnce(response(encoded({ asset: { version: 'invalid' } })))
            .mockResolvedValue(response(encoded(empty)));
        Object.assign(globalThis, { fetch: fetcher });
        const loader = new GLTFLoader({ request: { httpCache: 'reload' } });
        await expect(loader.loadAsync(url)).rejects.toThrow('only glTF 2.0 is supported');
        const retry = await loader.loadAsync(url);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(assetManager.assets.get(url)).toBeUndefined();
        retry.destroy();
    });

    test('T05 uncancellable KTX2 output is discarded before ImageAsset or Texture2D allocation', async () => {
        const ktx = new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0x42, 0x42, 0xbb, 0x0d, 0x0a]);
        const json = {
            ...empty,
            extensionsUsed: ['KHR_texture_basisu'],
            extensionsRequired: ['KHR_texture_basisu'],
            images: [{ uri: 'late.ktx2' }],
            textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
        };
        Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue(response(ktx.buffer)) });
        const pending = deferred<DecodedTextureSource>();
        const started = deferred<void>();
        const transcoder = Object.freeze({
            transcode: jest.fn(() => {
                started.resolve();
                return pending.promise;
            }),
            dispose: jest.fn(),
        });
        const controller = new AbortController();
        const upload = jest.spyOn(Texture2D.prototype, 'setFilters');
        const imageDestroy = jest.spyOn(ImageAsset.prototype, 'destroy');
        const load = new GLTFLoader({ signal: controller.signal, ktx2Transcoder: transcoder }).parseAsync(
            JSON.stringify(json),
            base,
        );
        await started.promise;
        controller.abort();
        await expect(load).rejects.toMatchObject({ name: 'AbortError' });
        pending.resolve({ data: new Uint8Array(4), mimeType: KTX2_RAW_MIME, width: 1, height: 1, format: 35 });
        await microtasks();
        expect(upload).not.toHaveBeenCalled();
        expect(imageDestroy).not.toHaveBeenCalled();
        expect(transcoder.dispose).not.toHaveBeenCalled();
    });

    test('T05 pending browser image decode revokes its blob and cannot allocate on a late onload', async () => {
        const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue(response(png.buffer)) });
        const started = deferred<void>();
        let lateLoad: (() => void) | null = null;
        const image = {
            onload: null as (() => void) | null,
            onerror: null as (() => void) | null,
            _src: '',
            set src(value: string) {
                this._src = value;
                if (value) {
                    lateLoad = this.onload;
                    started.resolve();
                }
            },
            get src() {
                return this._src;
            },
        };
        Object.assign(globalThis, { Image: jest.fn(() => image) });
        URL.createObjectURL = jest.fn(() => 'blob:test-image');
        URL.revokeObjectURL = jest.fn();
        const controller = new AbortController();
        const upload = jest.spyOn(Texture2D.prototype, 'setFilters');
        const json = { ...empty, images: [{ uri: 'late.png' }], textures: [{ source: 0 }] };
        const load = new GLTFLoader({ signal: controller.signal }).parseAsync(JSON.stringify(json), base);
        await started.promise;
        controller.abort();
        await expect(load).rejects.toMatchObject({ name: 'AbortError' });
        lateLoad?.();
        await microtasks();
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-image');
        expect(image.src).toBe('');
        expect(image.onload).toBeNull();
        expect(image.onerror).toBeNull();
        expect(upload).not.toHaveBeenCalled();
    });

    test('T05 cancellation at final objects progress destroys created native resources and never caches them', async () => {
        const f = fixture();
        const controller = new AbortController();
        const destroy = jest.spyOn(GLTFAsset.prototype, 'destroy');
        const load = new GLTFLoader({
            signal: controller.signal,
            onProgress: (progress) => {
                if (progress.phase === 'objects') {
                    controller.abort();
                }
            },
        }).parseAsync(f.glb);
        await expect(load).rejects.toMatchObject({ name: 'AbortError' });
        await microtasks();
        expect(destroy).toHaveBeenCalledTimes(1);
        const disposed = destroy.mock.instances[0] as GLTFAsset;
        const meshes = [...disposed.meshes];
        const materials = [...disposed.materials];
        CCObject._deferredDestroy();
        expect(meshes.length).toBeGreaterThan(0);
        expect(meshes.every((mesh) => !mesh.isValid)).toBe(true);
        expect(materials.every((material) => !material.isValid)).toBe(true);
    });

    test('T05 late owned results are cleaned and handler cleanup registered after disposal runs immediately', async () => {
        const pending = deferred<{ destroy: () => void }>();
        const controller = new AbortController();
        const destroy = jest.fn();
        const load = awaitAbortable(
            () => pending.promise,
            controller.signal,
            (value) => value.destroy(),
        );
        controller.abort();
        await expect(load).rejects.toMatchObject({ name: 'AbortError' });
        pending.resolve({ destroy });
        await microtasks();
        expect(destroy).toHaveBeenCalledTimes(1);
        const context = new GLTFParserContext(empty);
        const cleanup = jest.fn();
        const dispose = jest.fn();
        context.handlers = [{ name: 'TEST_dispose', dispose }];
        context.dispose();
        context.addCleanup(cleanup);
        context.dispose();
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    test('T06 same URL with different identity/cache policies cannot reuse in-flight, parse or asset results', async () => {
        const url = `${base}identity.gltf`;
        const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
            const identity = new Headers(init.headers).get('X-Synthetic-Identity');
            return response(encoded({ ...empty, scenes: [{ name: identity }] }));
        });
        Object.assign(globalThis, { fetch: fetcher });
        const [a, b] = await Promise.all([
            new GLTFLoader({
                request: { headers: { 'X-Synthetic-Identity': 'alpha' }, httpCache: 'force-cache' },
            }).loadAsync(url),
            new GLTFLoader({
                request: { headers: { 'X-Synthetic-Identity': 'beta' }, httpCache: 'no-store' },
            }).loadAsync(url),
        ]);
        expect(a).not.toBe(b);
        expect(a.sceneNames).toEqual(['alpha']);
        expect(b.sceneNames).toEqual(['beta']);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(assetManager.assets.get(url)).toBeUndefined();
        a.destroy();
        b.destroy();
    });

    test('T06 canceling one same-URL consumer does not kill its surviving consumer or poison a later native load', async () => {
        const url = `${base}consumers.gltf`;
        const first = deferred<Response>();
        const second = deferred<Response>();
        const a = new AbortController();
        const b = new AbortController();
        const fetcher = jest
            .fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise)
            .mockResolvedValue(response(encoded(empty)));
        Object.assign(globalThis, { fetch: fetcher });
        const canceled = new GLTFLoader({ signal: a.signal }).loadAsync(url);
        const surviving = new GLTFLoader({ signal: b.signal }).loadAsync(url);
        a.abort();
        await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
        expect(b.signal.aborted).toBe(false);
        first.resolve(response(encoded(empty)));
        second.resolve(response(encoded(empty)));
        const survivor = await surviving;
        await microtasks();
        expect(assetManager.assets.get(url)).toBeUndefined();
        const native = await new GLTFLoader().loadAsync(url);
        expect(native).not.toBe(survivor);
        expect(assetManager.assets.get(url)).toBe(native);
        expect(fetcher).toHaveBeenCalledTimes(3);
        survivor.destroy();
        native.destroy();
    });

    test('T01 progress reports phases but never embeds the parsed JSON body as a URL', async () => {
        const progress: GLTFLoadProgress[] = [];
        const source = JSON.stringify({ ...empty, asset: { version: '2.0', generator: 'private-text-not-a-url' } });
        const asset = await new GLTFLoader({ onProgress: (event) => progress.push(event) }).parseAsync(source, base);
        expect(progress.map((event) => event.phase)).toEqual(
            expect.arrayContaining(['container', 'decode', 'textures', 'objects']),
        );
        expect(progress.every((event) => event.url === undefined)).toBe(true);
        asset.destroy();
    });
});
