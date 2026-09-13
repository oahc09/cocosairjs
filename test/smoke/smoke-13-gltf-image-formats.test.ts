import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader } from '../../src';
import { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { detectImageMime, imageExtensionFactory, setTextureSupportForTesting } from '../../src/air/assets/gltf/extensions/texture/image-formats';
import { fixture, toGLB } from '../fixtures/gltf/fixture';
import { CCObject } from '../../src/cocos/core/data/object';
import type { GLTFDocument } from '../../src/air/assets/gltf/schema';

Object.assign(globalThis, { TextDecoder, TextEncoder });

const WEBP = new Uint8Array(Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'));
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const AVIF = new Uint8Array([0, 0, 0, 0x1c, 102, 116, 121, 112, 97, 118, 105, 102]);

describe('image format detection', () => {
    test('magic numbers map to the supported mimes', () => {
        expect(detectImageMime(WEBP)).toBe('image/webp');
        expect(detectImageMime(PNG)).toBe('image/png');
        expect(detectImageMime(AVIF)).toBe('image/avif');
        expect(detectImageMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
    });
});

function imageContext (extensions: Record<string, unknown>, imageBytes: Uint8Array, mime?: string): GLTFParserContext {
    const json: GLTFDocument = { asset: { version: '2.0' }, buffers: [{ byteLength: 0 }],
        images: [Object.assign({ uri: 'texture.webp' }, mime ? { mimeType: mime } : {})],
        textures: [{ extensions }], nodes: [], scenes: [{ nodes: [] }] };
    const context = new GLTFParserContext(json, undefined);
    context.request = async () => imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength);
    return context;
}

describe('EXT_texture_webp / EXT_texture_avif handlers', () => {
    afterEach(() => { setTextureSupportForTesting('image/webp', null); setTextureSupportForTesting('image/avif', null); });

    test('supported browser returns extension source bytes', async () => {
        setTextureSupportForTesting('image/webp', true);
        const context = imageContext({ EXT_texture_webp: { source: 0 } }, WEBP);
        const handler = imageExtensionFactory('EXT_texture_webp')(context);
        const decoded = await handler.resolveTextureSource!(0, context);
        expect(decoded?.mimeType).toBe('image/webp');
        expect(Array.from(decoded!.data)).toEqual(Array.from(WEBP));
    });

    test('unsupported browser falls back to core with a warning', async () => {
        setTextureSupportForTesting('image/webp', false);
        const context = imageContext({ EXT_texture_webp: { source: 0 } }, WEBP);
        const handler = imageExtensionFactory('EXT_texture_webp')(context);
        expect(await handler.resolveTextureSource!(0, context)).toBeNull();
        expect(context.warnings.some((w) => /EXT_texture_webp.*unavailable/.test(w))).toBe(true);
    });

    test('required extension without decoding capability fails with GLTF_DEVICE_UNSUPPORTED', async () => {
        setTextureSupportForTesting('image/avif', false);
        const context = imageContext({ EXT_texture_avif: { source: 0 } }, AVIF);
        context.json.extensionsRequired = ['EXT_texture_avif'];
        const handler = imageExtensionFactory('EXT_texture_avif')(context);
        await expect(handler.resolveTextureSource!(0, context)).rejects.toMatchObject({ code: 'GLTF_DEVICE_UNSUPPORTED' });
    });

    test('payload/magic mismatch is rejected as invalid extension data', async () => {
        setTextureSupportForTesting('image/webp', true);
        const context = imageContext({ EXT_texture_webp: { source: 0 } }, PNG);
        const handler = imageExtensionFactory('EXT_texture_webp')(context);
        await expect(handler.resolveTextureSource!(0, context)).rejects.toMatchObject({ code: 'GLTF_EXTENSION_INVALID' });
    });

    test('declared mimeType must match the extension format', async () => {
        setTextureSupportForTesting('image/webp', true);
        const context = imageContext({ EXT_texture_webp: { source: 0 } }, WEBP, 'image/jpeg');
        const handler = imageExtensionFactory('EXT_texture_webp')(context);
        await expect(handler.resolveTextureSource!(0, context)).rejects.toMatchObject({ code: 'GLTF_EXTENSION_INVALID' });
    });

    test('textures without the extension yield no source', async () => {
        setTextureSupportForTesting('image/webp', true);
        const context = imageContext({}, WEBP);
        const handler = imageExtensionFactory('EXT_texture_webp')(context);
        expect(await handler.resolveTextureSource!(0, context)).toBeNull();
    });

    test('capability status reflects the probe verdict', async () => {
        const loader = new GLTFLoader();
        const status = (entry: string) => loader.getExtensionSupport().find((e) => e.name === entry);
        expect(status('EXT_texture_webp')?.status).not.toBe('unsupported');
        setTextureSupportForTesting('image/webp', false);
        expect(status('EXT_texture_webp')?.status).toBe('device-dependent');
        setTextureSupportForTesting('image/webp', true);
        expect(status('EXT_texture_webp')?.status).toBe('supported');
        expect(status('EXT_texture_avif')?.status).toBe('supported'); // optimistic pre-probe
    });

    test('validate rejects dangling image references', () => {
        setTextureSupportForTesting('image/webp', true);
        const context = imageContext({ EXT_texture_webp: { source: 7 } }, WEBP);
        const handler = imageExtensionFactory('EXT_texture_webp')(context);
        expect(() => handler.validate!(context)).toThrow();
    });
});

describe('webp texture through the loader', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(() => { setTextureSupportForTesting('image/webp', null); CCObject._deferredDestroy(); });

    test('parse with a webp image source reaches texture decoding with core fallback ordering', async () => {
        setTextureSupportForTesting('image/webp', true);
        const f = fixture();
        const json = f.json;
        json.images = json.images || [];
        json.textures = json.textures || [];
        json.bufferViews = json.bufferViews || [];
        json.extensionsUsed = ['EXT_texture_webp'];
        // Append the webp image and a UV channel to the shared binary buffer.
        const uvBytes = new Uint8Array(new Float32Array([0, 0, 1, 0, 0, 1]).buffer);
        let offset = (json.buffers![0].byteLength + 3) & ~3;
        const merged = new Uint8Array(offset + WEBP.length + 4 + uvBytes.length);
        merged.set(new Uint8Array(f.bin), 0);
        const imageView = json.bufferViews.length;
        json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: WEBP.length });
        merged.set(WEBP, offset);
        offset = (offset + WEBP.length + 3) & ~3;
        const uvView = json.bufferViews.length;
        json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: uvBytes.length });
        merged.set(uvBytes, offset);
        offset += uvBytes.length;
        (f as { bin: ArrayBuffer }).bin = merged.slice(0, offset).buffer;
        json.buffers![0].byteLength = offset;
        const imageIndex = json.images.length;
        json.images.push({ bufferView: imageView, mimeType: 'image/webp' });
        const textureIndex = json.textures.length;
        json.textures.push({ extensions: { EXT_texture_webp: { source: imageIndex } } });
        const uvAccessor = json.accessors!.length;
        json.accessors!.push({ bufferView: uvView, componentType: 5126, count: 3, type: 'VEC2' });
        json.meshes![0].primitives[0].attributes.TEXCOORD_0 = uvAccessor;
        json.materials = [{ name: 'web', extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: textureIndex } } }];
        json.meshes![0].primitives[0].material = 0;

        // jsdom Image never fires onload; stub the decode seam with a 1x1 solid element.
        const RealImage = globalThis.Image;
        class StubImage {
            public onload: (() => void) | null = null;
            public onerror: (() => void) | null = null;
            public width = 1;
            public height = 1;
            set src (_value: string) { setTimeout(() => this.onload?.(), 0); }
            get src (): string { return ''; }
        }
        (globalThis as { Image: unknown }).Image = StubImage;
        const realCreate = URL.createObjectURL;
        const realRevoke = URL.revokeObjectURL;
        URL.createObjectURL = () => 'blob:stub';
        URL.revokeObjectURL = () => undefined;
        try {
            const asset = await new GLTFLoader().parseAsync(toGLB(json, f.bin));
            expect(asset.textures.length).toBe(1);
            asset.destroy();
        } finally {
            (globalThis as { Image: unknown }).Image = RealImage;
            URL.createObjectURL = realCreate;
            URL.revokeObjectURL = realRevoke;
        }
    });
});
