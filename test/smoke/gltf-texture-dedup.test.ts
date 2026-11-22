import { TextDecoder, TextEncoder } from 'util';
import { assetManager, createAirApp, configureGLTFLoaderDefaults, GLTFLoader, GLTFAsset } from '../../src';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { ImageAsset } from '../../src/cocos/asset/assets/image-asset';
import { CCObject } from '../../src/cocos/core/data/object';
import { setTextureSupportForTesting } from '../../src/air/assets/gltf/extensions/texture/image-formats';
import type { GLTFDocument } from '../../src/air/assets/gltf/schema';
import { toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];
const bytes = Uint8Array.from([...signature, ...signature]);

function fixture (): GLTFDocument {
    return {
        asset: { version: '2.0' }, buffers: [{ byteLength: bytes.length }],
        bufferViews: [{ buffer: 0, byteLength: signature.length }, { buffer: 0, byteOffset: signature.length, byteLength: signature.length }],
        images: [{ bufferView: 0, mimeType: 'image/png' }, { bufferView: 1, mimeType: 'image/png' }],
        samplers: [{ minFilter: 9987, magFilter: 9729, wrapS: 10497, wrapT: 10497 }, { minFilter: 9729 }, { wrapT: 33071 }],
        textures: Array.from({ length: 100 }, (_, i) => i % 2 ? { source: 0, sampler: 0 } : { source: 0 }),
        nodes: [], scenes: [{ nodes: [] }],
    };
}

describe('glTF texture sharing', () => {
    const realImage = globalThis.Image;
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    beforeEach(() => {
        class StubImage {
            public onload: (() => void) | null = null;
            public onerror: (() => void) | null = null;
            public width = 4;
            public height = 4;
            set src (_value: string) { setTimeout(() => this.onload?.(), 0); }
        }
        (globalThis as { Image: unknown }).Image = StubImage;
        URL.createObjectURL = () => 'blob:stub';
        URL.revokeObjectURL = () => undefined;
    });
    afterEach(() => {
        globalThis.Image = realImage;
        URL.createObjectURL = createObjectURL;
        URL.revokeObjectURL = revokeObjectURL;
        setTextureSupportForTesting('image/webp', null);
        jest.restoreAllMocks();
        CCObject._deferredDestroy();
    });

    test('100 references share one upload without collapsing index slots or incompatible variants', async () => {
        const doc = fixture();
        doc.textures!.push({ source: 0, sampler: 1 }, { source: 0, sampler: 2 }, { source: 1 },
            { source: 0 }, { source: 0 }, { source: 0 });
        doc.materials = [
            { pbrMetallicRoughness: { baseColorTexture: { index: 103 } }, normalTexture: { index: 104 } },
            { emissiveTexture: { index: 105 } },
        ];
        const upload = jest.spyOn(Texture2D.prototype, 'image', 'set');
        const asset = await new GLTFLoader({ experimentalTextureDeduplication: true }).parseAsync(toGLB(doc, bytes.buffer));
        try {
            expect(asset.textures).toHaveLength(106);
            expect(new Set(asset.textures.slice(0, 100)).size).toBe(1);
            expect(asset.textures[103]).toBe(asset.textures[105]);
            expect(new Set(asset.textures).size).toBe(6);
            const allocations = asset.textures.map((texture) => texture.getGFXTexture());
            expect(allocations.every(Boolean)).toBe(true);
            expect(new Set(allocations).size).toBe(6);
            expect(upload).toHaveBeenCalledTimes(6);
            const second = await new GLTFLoader({ experimentalTextureDeduplication: true }).parseAsync(toGLB(doc, bytes.buffer));
            try {
                expect(second.textures[0]).not.toBe(asset.textures[0]);
            } finally { second.destroy(); }
            const dispose = jest.spyOn(Texture2D.prototype, 'destroy');
            expect(asset.destroy()).toBe(true);
            expect(asset.destroy()).toBe(false);
            expect(dispose).toHaveBeenCalledTimes(6);
        } finally { asset.destroy(); }
    });

    test('default slots keep names and sampler state independent while decoding the image once', async () => {
        const doc = fixture();
        doc.textures = [{ source: 0, name: 'first' }, { source: 0, name: 'second' }];
        const upload = jest.spyOn(Texture2D.prototype, 'image', 'set');
        const asset = await new GLTFLoader().parseAsync(toGLB(doc, bytes.buffer));
        try {
            const [first, second] = asset.textures;
            expect(first).not.toBe(second);
            expect([first.name, second.name]).toEqual(['first', 'second']);
            expect(first.image).toBe(second.image);
            expect(first.getGFXTexture()).not.toBe(second.getGFXTexture());
            expect(upload).toHaveBeenCalledTimes(2);
            const originalWrap = second.getSamplerInfo().addressU;
            first.name = 'changed';
            first.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.REPEAT);
            expect(second.name).toBe('second');
            expect(first.getSamplerInfo().addressU).not.toBe(originalWrap);
            expect(second.getSamplerInfo().addressU).toBe(originalWrap);
            first.destroy();
            expect(second.getGFXTexture()).toBeTruthy();
        } finally { asset.destroy(); }
    });

    test('opt-in URL loads are isolated from the native cache, which always preserves slots', async () => {
        const url = 'https://example.test/dedup-cache.glb';
        const factoryURL = 'https://example.test/dedup-factory.glb';
        const doc = fixture();
        doc.textures = [{ source: 0, name: 'first' }, { source: 0, name: 'second' }];
        const glb = toGLB(doc, bytes.buffer);
        const oldFetch = globalThis.fetch;
        globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => glb });
        const assets: GLTFAsset[] = [];
        const experimental = { experimentalTextureDeduplication: true };
        // JavaScript consumers can nevertheless pass extra keys to these APIs.
        configureGLTFLoaderDefaults(experimental as never);
        try {
            const normal = await new GLTFLoader().loadAsync(url); assets.push(normal);
            expect(normal.textures[0]).not.toBe(normal.textures[1]);
            const optedIn = await new GLTFLoader(experimental).loadAsync(url); assets.push(optedIn);
            expect(optedIn).not.toBe(normal);
            expect(optedIn.textures[0]).toBe(optedIn.textures[1]);
            expect(await new GLTFLoader().loadAsync(url)).toBe(normal);
            const factory = await new Promise<GLTFAsset>((resolve, reject) => assetManager.loadRemote<GLTFAsset>(
                factoryURL, { gltf: experimental }, (error, asset) => error ? reject(error) : resolve(asset),
            )); assets.push(factory);
            expect(factory.textures[0]).not.toBe(factory.textures[1]);
        } finally {
            [url, factoryURL].forEach((key) => assetManager.assets.remove(key));
            assets.forEach((asset) => { asset.destroy(); });
            globalThis.fetch = oldFetch;
        }
    });

    test('a texture with an extension fallback is not merged into the core texture', async () => {
        setTextureSupportForTesting('image/webp', false);
        const doc = fixture();
        doc.extensionsUsed = ['EXT_texture_webp'];
        doc.textures!.push({ source: 0, extensions: { EXT_texture_webp: { source: 1 } } });
        const asset = await new GLTFLoader({ experimentalTextureDeduplication: true }).parseAsync(toGLB(doc, bytes.buffer));
        try {
            expect(asset.textures[100]).not.toBe(asset.textures[0]);
            expect(asset.textures[100].image).toBe(asset.textures[0].image);
        } finally { asset.destroy(); }
    });

    test('partial parse failure destroys a shared upload and decoded image only once', async () => {
        const doc = fixture();
        doc.samplers!.push({ minFilter: 0 });
        doc.textures!.push({ source: 0, sampler: 3 });
        const disposeTexture = jest.spyOn(Texture2D.prototype, 'destroy');
        const disposeImage = jest.spyOn(ImageAsset.prototype, 'destroy');
        await expect(new GLTFLoader({ experimentalTextureDeduplication: true }).parseAsync(toGLB(doc, bytes.buffer))).rejects.toThrow(/invalid texture filter/);
        expect(disposeTexture).toHaveBeenCalledTimes(1);
        expect(disposeImage).toHaveBeenCalledTimes(1);
    });

    test('abort after texture publication to the owning asset destroys aliases only once', async () => {
        const controller = new AbortController();
        const disposeTexture = jest.spyOn(Texture2D.prototype, 'destroy');
        const disposeImage = jest.spyOn(ImageAsset.prototype, 'destroy');
        const loader = new GLTFLoader({
            signal: controller.signal,
            experimentalTextureDeduplication: true,
            onProgress: ({ phase }) => { if (phase === 'textures') { controller.abort(); } },
        });
        await expect(loader.parseAsync(toGLB(fixture(), bytes.buffer))).rejects.toMatchObject({ name: 'AbortError' });
        // The abort race settles the public call before the parser's cleanup.
        await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
        expect(disposeTexture).toHaveBeenCalledTimes(1);
        expect(disposeImage).toHaveBeenCalledTimes(1);
    });
});
