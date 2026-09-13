import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, configureGLTFLoaderDefaults, GLTFError, GLTFExtensionRegistry } from '../../src';
import type { GLTFAsset } from '../../src';
import { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { unlitFactory } from '../../src/air/assets/gltf/extensions/material/unlit';
import { textureTransformFactory } from '../../src/air/assets/gltf/extensions/texture/transform';
import { CCObject } from '../../src/cocos/core/data/object';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

describe('glTF extension registry and parser context', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); jest.restoreAllMocks(); });

    test('registry rejects duplicate handler names and missing dependencies', () => {
        const context = new GLTFParserContext({ asset: { version: '2.0' } });
        const registry = new GLTFExtensionRegistry().register(unlitFactory).register(textureTransformFactory);
        expect(registry.createHandlers(context).map((handler) => handler.name))
            .toEqual(['KHR_materials_unlit', 'KHR_texture_transform']);
        const second = new GLTFExtensionRegistry().register(unlitFactory).register(unlitFactory);
        // register() is idempotent per factory, so simulate a distinct factory with the same name.
        second.register((c) => ({ ...unlitFactory(c) }));
        expect(() => second.createHandlers(context)).toThrow(/duplicate extension handler/);
        const dependent = new GLTFExtensionRegistry().register((c) => ({ ...textureTransformFactory(c), dependencies: ['KHR_materials_unlit'] }));
        expect(() => dependent.createHandlers(context)).toThrow(/requires unregistered extension/);
    });

    test('unknown required extension fails with a stable GLTFError code', async () => {
        const f = fixture();
        f.json.extensionsRequired = ['KHR_materials_not_implemented'];
        f.json.extensionsUsed = ['KHR_materials_not_implemented'];
        await expect(new GLTFLoader().parseAsync(toGLB(f.json, f.bin))).rejects.toMatchObject({
            code: 'GLTF_EXTENSION_UNSUPPORTED', extension: 'KHR_materials_not_implemented',
        });
        await expect(new GLTFLoader().parseAsync(toGLB(f.json, f.bin))).rejects.toBeInstanceOf(GLTFError);
    });

    test('decoder-backed extensions: required fails, optional falls back to core attributes', async () => {
        const f = fixture();
        f.json.extensionsUsed = ['KHR_draco_mesh_compression'];
        // A required declaration is rejected while validating extensionsRequired.
        f.json.extensionsRequired = ['KHR_draco_mesh_compression'];
        await expect(new GLTFLoader().parseAsync(toGLB(f.json, f.bin))).rejects.toMatchObject({
            code: 'GLTF_DECODER_MISSING', extension: 'KHR_draco_mesh_compression',
        });
        // Optional with no decoder: the primitive keeps its core accessors, so the loader must
        // fall through to them (not silently drop geometry, not hard-fail).
        f.json.extensionsRequired = undefined;
        f.json.meshes![0].primitives[0].extensions = { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } };
        const fallback = await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
        expect(fallback.warnings.join(' ')).toMatch(/no decoder configured.*core fallback/);
        expect(Array.from((fallback.meshes[0] as any).readAttribute(0, 'a_position')!).length).toBeGreaterThan(0);
        fallback.destroy();
        // Optional but WITHOUT core POSITION: no fallback exists, so fail cleanly rather than
        // render an empty mesh as if supported.
        const g = fixture();
        g.json.extensionsUsed = ['KHR_draco_mesh_compression'];
        delete (g.json.meshes![0].primitives[0].attributes as { POSITION?: number }).POSITION;
        g.json.meshes![0].primitives[0].extensions = { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } };
        await expect(new GLTFLoader().parseAsync(toGLB(g.json, g.bin))).rejects.toMatchObject({
            code: 'GLTF_DECODER_MISSING', extension: 'KHR_draco_mesh_compression',
        });
    });

    test('handler ordering follows registration order', async () => {
        const order: string[] = [];
        const loader = new GLTFLoader();
        loader.register((c) => ({ name: 'TEST_FIRST', extendMaterial: () => { order.push('first'); void c; } }));
        loader.register((c) => ({ name: 'TEST_SECOND', extendMaterial: () => { order.push('second'); void c; } }));
        const f = fixture();
        f.json.materials = [{ name: 'm' }];
        f.json.meshes![0].primitives[0].material = 0;
        await loader.parseAsync(toGLB(f.json, f.bin));
        expect(order).toEqual(['first', 'second']);
    });

    test('dependency cache executes a key once and evicts failed promises', async () => {
        const context = new GLTFParserContext({ asset: { version: '2.0' } });
        let calls = 0;
        const load = (): Promise<number> => { ++calls; return Promise.resolve(7); };
        const [a, b] = await Promise.all([context.dependency('k', load), context.dependency('k', load)]);
        expect([a, b]).toEqual([7, 7]);
        expect(calls).toBe(1);
        let attempts = 0;
        await expect(context.dependency('bad', (): Promise<number> => { ++attempts; return Promise.reject(new Error('boom')); })).rejects.toThrow(/boom/);
        await expect(context.dependency('bad', (): Promise<number> => { ++attempts; return Promise.reject(new Error('boom2')); })).rejects.toThrow(/boom2/);
        expect(attempts).toBe(2);
        // The settled good entry stays cached; the failed ones do not poison later keys.
        await context.dependency('k', load);
        expect(calls).toBe(1);
    });

    test('capability and error contract is machine readable through the public API', async () => {
        // Every failure mode is asserted on the structured `code`, never on the message text.
        const required = (name: string, support: () => { status: string; reason?: string }): Promise<GLTFAsset> => {
            const f = fixture();
            f.json.extensionsUsed = [name];
            f.json.extensionsRequired = [name];
            const loader = new GLTFLoader();
            loader.register((c) => ({ name, support: support as never, validate: () => { void c; } }));
            return loader.parseAsync(toGLB(f.json, f.bin));
        };
        await expect(required('TEST_DEVICE', () => ({ status: 'device-dependent', reason: 'no GPU format' })))
            .rejects.toMatchObject({ code: 'GLTF_DEVICE_UNSUPPORTED', extension: 'TEST_DEVICE' });
        await expect(required('TEST_DECODER', () => ({ status: 'decoder-required' })))
            .rejects.toMatchObject({ code: 'GLTF_DECODER_MISSING', extension: 'TEST_DECODER' });
        await expect(required('TEST_FALLBACK', () => ({ status: 'fallback' })))
            .rejects.toMatchObject({ code: 'GLTF_EXTENSION_UNSUPPORTED', extension: 'TEST_FALLBACK' });
        // An unsupported required extension and an invalid extension payload keep distinct codes.
        const f = fixture();
        f.json.extensionsRequired = ['KHR_materials_unknown'];
        f.json.extensionsUsed = ['KHR_materials_unknown'];
        await expect(new GLTFLoader().parseAsync(toGLB(f.json, f.bin)))
            .rejects.toMatchObject({ code: 'GLTF_EXTENSION_UNSUPPORTED' });
        f.json.extensionsRequired = undefined;
        f.json.bufferViews![0].extensions = { KHR_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 1, byteStride: 4, count: 1, mode: 'NOPE' } };
        await expect(new GLTFLoader({ meshoptDecoder: { decodeGltfBufferAsync: async () => new Uint8Array(4) } })
            .parseAsync(toGLB(f.json, f.bin))).rejects.toMatchObject({ code: 'GLTF_EXTENSION_INVALID', extension: 'KHR_meshopt_compression' });
        // Every code above is a GLTFError, so callers can branch on `code` alone.
        for (const code of ['GLTF_EXTENSION_UNSUPPORTED', 'GLTF_DECODER_MISSING', 'GLTF_DEVICE_UNSUPPORTED',
            'GLTF_EXTENSION_INVALID', 'GLTF_DECODE_FAILED'] as const) {
            expect(new GLTFError(code, 'message', 'ACME_demo')).toMatchObject({ code, extension: 'ACME_demo' });
        }
        // The report mirrors the live configuration: registering a decoder flips the status.
        const before = new GLTFLoader().getExtensionSupport().find((e) => e.name === 'KHR_draco_mesh_compression')!;
        const after = new GLTFLoader({ dracoDecoder: { decodePrimitive: async () => ({ attributes: {} }) } })
            .getExtensionSupport().find((e) => e.name === 'KHR_draco_mesh_compression')!;
        expect(before.status).toBe('decoder-required');
        expect(after.status).toBe('supported');
        expect(before.reason).toBeTruthy();
    });

    test('cleanup stack disposes LIFO and survives failing cleanups', () => {
        const context = new GLTFParserContext({ asset: { version: '2.0' } });
        const order: string[] = [];
        context.addCleanup(() => { order.push('a'); });
        context.addCleanup(() => { order.push('b'); throw new Error('cleanup boom'); });
        context.addCleanup(() => { order.push('c'); });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        context.dispose();
        expect(order).toEqual(['c', 'b', 'a']);
        expect(warn).toHaveBeenCalled();
        context.dispose(); // idempotent
        expect(order).toEqual(['c', 'b', 'a']);
    });

    test('abort signal cancels before parse and during load', async () => {
        const preAborted = new AbortController();
        preAborted.abort();
        await expect(new GLTFLoader({ signal: preAborted.signal }).parseAsync('{}')).rejects.toMatchObject({ name: 'AbortError' });
        const during = new AbortController();
        // A fetch that only settles on abort: proves the in-flight network phase is cancellable.
        const fetchMock = jest.fn((_url: string, init?: { signal?: AbortSignal }): Promise<ArrayBuffer> =>
            new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); }));
        Object.assign(globalThis, { fetch: fetchMock });
        try {
            const f = fixture();
            f.json.buffers![0].uri = 'model.bin';
            const promise = new GLTFLoader({ signal: during.signal }).parseAsync(JSON.stringify(f.json), 'https://example.test/models/');
            during.abort();
            await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
        } finally { jest.restoreAllMocks(); }
    });

    test('progress phases and configureGLTFLoaderDefaults reach instance loaders', async () => {
        const events: { phase: string; loaded: number; total: number }[] = [];
        const restore = { onProgress: (progress: { phase: string; loaded: number; total: number }): void => { events.push(progress); } };
        configureGLTFLoaderDefaults(restore);
        try {
            const f = fixture();
            // Instance has no options: the global defaults must still drive onProgress.
            await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
            const phases = events.map((event) => event.phase);
            expect(phases).toEqual(expect.arrayContaining(['container', 'dependencies', 'decode', 'objects']));
            expect(events.filter((event) => event.phase === 'dependencies')[0]).toMatchObject({ loaded: 1, total: 1 });
        } finally {
            configureGLTFLoaderDefaults({ onProgress: undefined });
        }
        const loader = new GLTFLoader();
        const support = loader.getExtensionSupport();
        expect(support.filter((entry) => entry.name === 'KHR_materials_unlit' || entry.name === 'KHR_texture_transform'))
            .toHaveLength(2);
        // Geometry extensions are implemented; without a decoder they report decoder-required.
        for (const name of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression']) {
            expect(support.find((entry) => entry.name === name)).toMatchObject({ status: 'decoder-required' });
        }
        expect(support.find((entry) => entry.name === 'KHR_mesh_quantization')).toMatchObject({ status: 'supported' });
    });
});
