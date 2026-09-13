import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, GLTFError } from '../../src';
import { Format } from '../../src/cocos/gfx';
import { isKTX2 } from '../../src/air/assets/gltf/extensions/texture/basisu';
import { KTX2_RAW_MIME } from '../../src/air/assets/gltf/decoder/types';
import type { DecodedTextureSource } from '../../src/air/assets/gltf/decoder/types';
import { createKTX2Transcoder, isKTX2Available } from '../../src/air/assets/gltf/decoder/ktx2';
import { deviceKTX2Formats } from '../../src/air/assets/gltf/extensions/texture/device-formats';
import { fixture, toGLB } from '../fixtures/gltf/fixture';
import { CCObject } from '../../src/cocos/core/data/object';
import { setTextureSupportForTesting } from '../../src/air/assets/gltf/extensions/texture/image-formats';
import type { GLTFDocument } from '../../src/air/assets/gltf/schema';

Object.assign(globalThis, { TextDecoder, TextEncoder });

/** A complete KTX2 header (RGBA8 supercompression scheme is irrelevant to the fake transcoder). */
function ktx2Bytes (width: number, height: number): Uint8Array {
    const out = new Uint8Array(64);
    Object.assign(out, { 0: 0xAB, 1: 0x4B, 2: 0x54, 3: 0x58, 4: 0x20, 5: 0x32, 6: 0x30, 7: 0x42, 8: 0x42, 9: 0xBB, 10: 0x0D, 11: 0x0A });
    const view = new DataView(out.buffer);
    view.setUint32(12, 0, true);        // vkFormat (KHR_DF_TRANCODED_COLOR_MODEL=0 opaque)
    view.setUint32(20, width, true);    // pixelWidth
    view.setUint32(24, height, true);   // pixelHeight
    view.setUint32(32, 1, true);        // layerCount
    view.setUint32(36, 1, true);        // faceCount
    view.setUint32(40, 1, true);        // levelCount
    view.setUint32(44, 0, true);        // supercompressionScheme (none)
    return out;
}

/** A Basis module mock that transcodes any KTX2 to a single-level RGBA8 buffer. */
function fakeBasisModule (options?: { srgb?: boolean; uastc?: boolean; failFirstFormat?: number; width?: number; height?: number }) {
    const requests: number[] = [];
    const module = {
        initializeBasis () { /* no-op */ },
        KTX2_KHR_DF_TRANSFER_SRGB: 0x04,
        KTX2File: class {
            private readonly data: Uint8Array;
            constructor (data: Uint8Array) { this.data = data; }
            isValid () { return isKTX2(this.data); }
            isUASTC () { return !!options?.uastc; }
            getWidth () { return options?.width ?? 2; }
            getHeight () { return options?.height ?? 2; }
            getLayers () { return 1; }
            getLevels () { return 1; }
            getFaces () { return 1; }
            getHasAlpha () { return true; }
            getDFDFlags () { return options?.srgb ? 0x04 : 0; }
            startTranscoding () { return true; }
            getImageLevelInfo () { return { width: 2, height: 2, origWidth: 2, origHeight: 2 }; }
            getImageTranscodedSizeInBytes (_mip: number, _layer: number, _face: number, format: number) {
                requests.push(format);
                return format === 13 || format === 7 ? 16 : 0;
            }
            transcodeImage (dst: Uint8Array, _mip: number, _layer: number, _face: number, format: number) {
                if (options?.failFirstFormat === format) { return false; }
                if (format !== 13 && format !== 7) { return false; }
                for (let i = 0; i < dst.length; ++i) { dst[i] = 255; }
                return true;
            }
            close () { /* no-op */ }
            delete () { /* no-op */ }
        },
    };
    return { module, requests };
}

describe('KHR_texture_basisu transcoder', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(() => { setTextureSupportForTesting('image/webp', null); CCObject._deferredDestroy(); });

    test('isKTX2 detects the container magic', () => {
        expect(isKTX2(ktx2Bytes(4, 4))).toBe(true);
        expect(isKTX2(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBe(false);
    });

    test('isKTX2Available validates the module surface', () => {
        expect(isKTX2Available(undefined)).toBe(false);
        expect(isKTX2Available({ initializeBasis: () => undefined, KTX2File: function () { /* empty */ } } as never)).toBe(true);
    });

    test('device formats returns a supported subset or undefined', () => {
        const formats = deviceKTX2Formats();
        // jsdom EmptyDevice reports no compressed formats: adapter must still rank defaults.
        expect(formats === undefined || Array.isArray(formats)).toBe(true);
    });

    test('adapter walks ranked targets and takes the first that yields data', async () => {
        const { module, requests } = fakeBasisModule();
        const transcoder = createKTX2Transcoder(() => module as never);
        const result: DecodedTextureSource = await transcoder.transcode(ktx2Bytes(2, 2).buffer as ArrayBuffer);
        // ETC1S ranking: ETC2 (size 0), ASTC (size 0), BC7 (16 bytes) wins with alpha.
        expect(requests).toEqual([1, 10, 7]);
        expect(result.mimeType).toBe(KTX2_RAW_MIME);
        expect(result.compressed).toBe(true);
        expect(result.format).toBe(Format.BC7);
        expect(result.data.length).toBe(16);
    });

    test('adapter applies the sRGB variant from the DFD transfer flag', async () => {
        const { module } = fakeBasisModule({ srgb: true });
        const transcoder = createKTX2Transcoder(() => module as never);
        const result = await transcoder.transcode(ktx2Bytes(2, 2).buffer as ArrayBuffer);
        expect(result.format).toBe(Format.BC7_SRGB);
    });

    test('adapter throws when a payload is not KTX2', async () => {
        const { module } = fakeBasisModule();
        const transcoder = createKTX2Transcoder(() => module as never);
        await expect(transcoder.transcode(new Uint8Array(64).buffer)).rejects.toMatchObject({ code: 'GLTF_DECODE_FAILED' });
    });

    test('absurd dimensions fail the allocation ceiling before any transcode', async () => {
        const { module } = fakeBasisModule({ width: 17000 });
        const transcoder = createKTX2Transcoder(() => module);
        await expect(transcoder.transcode(ktx2Bytes(2, 2) as unknown as Uint8Array))
            .rejects.toMatchObject({ code: 'GLTF_DECODE_FAILED' });
    });

    test('adapter surfaces missing module surface as GLTF_DECODER_MISSING', async () => {
        const transcoder = createKTX2Transcoder(() => ({}) as never);
        await expect(transcoder.transcode(ktx2Bytes(2, 2).buffer as ArrayBuffer)).rejects.toMatchObject({ code: 'GLTF_DECODER_MISSING' });
    });

    test('loader end-to-end uploads a KTX2 texture via an injected provider', async () => {
        const { module } = fakeBasisModule();
        const provider = createKTX2Transcoder(() => module as never);
        // Build a glTF whose single texture is KTX2-only (no core image source) to force the path.
        const json: GLTFDocument = { asset: { version: '2.0' },
            extensionsUsed: ['KHR_texture_basisu', 'KHR_materials_unlit'],
            buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], images: [], textures: [], materials: [], meshes: [], nodes: [], scenes: [{ nodes: [] }] };
        const ktx = ktx2Bytes(2, 2);
        const positions = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
        const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
        const pad = (n: number) => (n + 3) & ~3;
        const posOff = 0; const uvOff = pad(positions.byteLength); const ktxOff = pad(uvOff + uvs.byteLength);
        const bin = new Uint8Array(ktxOff + ktx.length);
        bin.set(new Uint8Array(positions.buffer), posOff);
        bin.set(new Uint8Array(uvs.buffer), uvOff);
        bin.set(ktx, ktxOff);
        json.bufferViews!.push({ buffer: 0, byteOffset: posOff, byteLength: positions.byteLength });
        json.bufferViews!.push({ buffer: 0, byteOffset: uvOff, byteLength: uvs.byteLength });
        json.bufferViews!.push({ buffer: 0, byteOffset: ktxOff, byteLength: ktx.length });
        json.images!.push({ bufferView: 2 });
        json.textures!.push({ extensions: { KHR_texture_basisu: { source: 0 } } });
        json.materials!.push({ name: 'ktx', extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } });
        json.accessors!.push({ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' });
        json.accessors!.push({ bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' });
        json.buffers![0].byteLength = bin.byteLength;
        json.meshes!.push({ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] });
        json.nodes!.push({ mesh: 0, name: 'ktx-quad' });
        json.scenes![0].nodes!.push(0);
        json.scene = 0;
        const asset = await new GLTFLoader({ ktx2Transcoder: provider }).parseAsync(toGLB(json, bin.buffer));
        expect(asset.textures.length).toBe(1);
        expect(asset.warnings.some((w) => /ktx|basis/i.test(w))).toBe(false);
        asset.destroy();
    });

    test('optional extension falls back to core with no transcoder configured', async () => {
        // Minimal solid 1x1 PNG as the core source; browser/jsdom decoding is stubbed.
        const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
            0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
        const RealImage = globalThis.Image;
        class StubImage {
            public onload: (() => void) | null = null;
            public onerror: (() => void) | null = null;
            public width = 1;
            public height = 1;
            set src (_value: string) { setTimeout(() => this.onload?.(), 0); }
            get src (): string { return ''; }
        }
        const realCreate = URL.createObjectURL;
        const realRevoke = URL.revokeObjectURL;
        URL.createObjectURL = () => 'blob:stub';
        URL.revokeObjectURL = () => undefined;
        (globalThis as { Image: unknown }).Image = StubImage;
        try {
            const json = { asset: { version: '2.0' },
                extensionsUsed: ['KHR_texture_basisu'],
                buffers: [{ byteLength: png.length }],
                bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.length }],
                accessors: [], images: [{ bufferView: 0 }],
                textures: [{ extensions: { KHR_texture_basisu: { source: 0 } }, source: 0 }],
                nodes: [], scenes: [{ nodes: [] }],
            } as unknown as GLTFDocument;
            const asset = await new GLTFLoader().parseAsync(toGLB(json, png.buffer));
            expect(asset.warnings.some((w) => /KHR_texture_basisu.*transcoder|fallback/.test(w))).toBe(true);
            asset.destroy();
        } finally {
            (globalThis as { Image: unknown }).Image = RealImage;
            URL.createObjectURL = realCreate;
            URL.revokeObjectURL = realRevoke;
        }
    });

    test('required extension without a core source fails with GLTF_DECODER_MISSING', async () => {
        const f = fixture();
        const json = f.json;
        json.extensionsUsed = ['KHR_texture_basisu'];
        json.extensionsRequired = ['KHR_texture_basisu'];
        json.bufferViews = json.bufferViews || [];
        json.images = json.images || [];
        json.textures = json.textures || [];
        const ktx = ktx2Bytes(2, 2);
        const ktxView = json.bufferViews.length;
        const byteOffset = (json.buffers![0].byteLength + 3) & ~3;
        json.bufferViews.push({ buffer: 0, byteOffset, byteLength: ktx.length });
        void ktxView;
        const merged = new Uint8Array(byteOffset + ktx.length);
        merged.set(new Uint8Array(f.bin), 0);
        merged.set(ktx, byteOffset);
        (f as { bin: ArrayBuffer }).bin = merged.buffer;
        json.buffers![0].byteLength = merged.byteLength;
        json.images.push({ bufferView: json.bufferViews.length - 1 });
        json.textures.push({ extensions: { KHR_texture_basisu: { source: json.images.length - 1 } } });
        // no texture.source -> required without core must fail
        await expect(new GLTFLoader().parseAsync(toGLB(json, f.bin))).rejects.toBeInstanceOf(GLTFError);
        await expect(new GLTFLoader().parseAsync(toGLB(json, f.bin))).rejects.toMatchObject({ code: 'GLTF_DECODER_MISSING' });
    });
});
