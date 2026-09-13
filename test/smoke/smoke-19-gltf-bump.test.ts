/**
 * T5.2 bump: EXT_materials_bump validation, interaction with normalTexture and the
 * derivative perturbation injection on the physical effect.
 */
import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, Vec4 } from '../../src';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { createMaterialFeatures, physicalScalars } from '../../src/air/assets/gltf/material/features';
import { createGLTFMaterial } from '../../src/air/assets/gltf/material';
import { gltfPhysicalEffect, BUMP_CONSTANT } from '../../src/air/assets/gltf/material/physical-effect';
import { bumpFactory } from '../../src/air/assets/gltf/extensions/material/bump';
import type { GLTFExtensionHandler } from '../../src/air/assets/gltf/extension-registry';
import { CCObject } from '../../src/cocos/core/data/object';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

const warnings: string[] = [];
function validate (materials: unknown[]): void {
    const handler = bumpFactory({ json: { materials } } as unknown as GLTFParserContext) as GLTFExtensionHandler;
    handler.validate?.({ json: { materials } } as unknown as GLTFParserContext);
}
function extend (source: Parameters<typeof createMaterialFeatures>[1]) {
    const features = createMaterialFeatures(-1, source);
    warnings.length = 0;
    const ctx = { warn: (m: string): void => { warnings.push(m); } } as unknown as GLTFParserContext;
    bumpFactory(ctx).extendMaterial?.(-1, features, ctx);
    return features;
}
const read = (material: { passes: Array<{ getHandle(name: string): number; getUniform(h: number, o: Vec4): void }> }, name: string): Vec4 | undefined => {
    const pass = material.passes.find((x) => x.getHandle(name)) ?? material.passes[0];
    const handle = pass.getHandle(name);
    if (!handle) { return undefined; }
    const value = new Vec4(); pass.getUniform(handle, value); return value;
};

describe('glTF T5.2 EXT_materials_bump', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); });

    test('validation enforces texture index and factor', () => {
        expect(() => validate([{ extensions: { EXT_materials_bump: { bumpTexture: { index: 0 } } } },
            { extensions: { EXT_materials_bump: { bumpTexture: { index: 0 }, bumpFactor: 2 } } }])).not.toThrow();
        expect(() => validate([{ extensions: { EXT_materials_bump: {} } }])).toThrow(/bumpTexture/);
        expect(() => validate([{ extensions: { EXT_materials_bump: { bumpTexture: { index: -1 } } } }])).toThrow(/bumpTexture/);
        expect(() => validate([{ extensions: { EXT_materials_bump: { bumpTexture: { index: 0 }, bumpFactor: -0.5 } } }])).toThrow(/bumpFactor/);
    });

    test('extendMaterial defaults and normal-texture exclusion with warning', () => {
        expect(physicalScalars(extend({ extensions: { EXT_materials_bump: { bumpTexture: { index: 0 } } } })).bump)
            .toEqual({ factor: 1 });
        expect(physicalScalars(extend({ normalTexture: { index: 0 }, extensions: { EXT_materials_bump: { bumpTexture: { index: 1 }, bumpFactor: 0.5 } } })).bump)
            .toBeUndefined();
        expect(warnings.join(' ')).toMatch(/skipped/);
    });

    test('bump texture selects the physical effect with derivative math bound', () => {
        const material = createGLTFMaterial(extend({ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1] },
            extensions: { EXT_materials_bump: { bumpTexture: { index: 0 }, bumpFactor: 1.5 } } }), [new Texture2D()], false);
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        expect(read(material, BUMP_CONSTANT)!.x).toBeCloseTo(1.5, 5);
        expect(material.passes.some((p) => p.getHandle('airBumpUV0') !== 0)).toBe(true);
        material.destroy();
    });

    test('derived effect carries the derivative perturbation', () => {
        const shader = gltfPhysicalEffect().shaders.find((x) => x.name.includes('standard-fs'))!;
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            const stage = (shader as unknown as Record<string, { frag: string } | undefined>)[language];
            if (!stage) { continue; }
            expect(stage.frag).toContain('USE_AIR_BUMP');
            expect(stage.frag).toContain('dFdx(s.position)');
            expect(stage.frag).toContain('bdet');
        }
    });

    test('loader end to end applies bump', async () => {
        const f = fixture();
        const uv = f.json.accessors!.length;
        f.json.accessors!.push({ bufferView: f.json.accessors![0].bufferView, componentType: 5126, count: 3, type: 'VEC2' });
        f.json.meshes![0].primitives[0].attributes.TEXCOORD_0 = uv;
        f.json.meshes![0].primitives[0].material = 0;
        // 1x1 PNG height field appended to the binary buffer.
        const png = new Uint8Array(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
            .split('').map((c) => c.charCodeAt(0)));
        const bin = new Uint8Array(f.bin);
        const padded = (bin.length + 3) & ~3;
        const merged = new Uint8Array(padded + png.length); merged.set(bin, 0); merged.set(png, padded);
        const RealImage = globalThis.Image;
        class StubImage {
            public onload: (() => void) | null = null;
            public onerror: (() => void) | null = null;
            public width = 1; public height = 1;
            set src (_v: string) { setTimeout(() => this.onload?.(), 0); }
            get src (): string { return ''; }
        }
        const realCreate = URL.createObjectURL; const realRevoke = URL.revokeObjectURL;
        URL.createObjectURL = () => 'blob:stub'; URL.revokeObjectURL = () => undefined;
        (globalThis as { Image: unknown }).Image = StubImage;
        f.json.bufferViews!.push({ buffer: 0, byteOffset: padded, byteLength: png.length });
        f.json.images = [{ bufferView: f.json.bufferViews!.length - 1, mimeType: 'image/png' }];
        f.json.textures = [{ source: 0 }];
        f.json.buffers![0].byteLength = merged.byteLength;
        f.json.materials = [{ name: 'bumpy', pbrMetallicRoughness: { baseColorFactor: [0.7, 0.7, 0.7, 1], roughnessFactor: 0.6 },
            extensions: { EXT_materials_bump: { bumpTexture: { index: 0 } } } }];
        f.json.extensionsUsed = ['EXT_materials_bump']; f.json.extensionsRequired = ['EXT_materials_bump'];
        (f as { bin: ArrayBuffer }).bin = merged.buffer;
        try {
            const asset = await new GLTFLoader().parseAsync(toGLB(f.json, merged.buffer));
            expect(asset.materials[0]!.effectAsset!.name).toBe('air-gltf-physical');
            asset.destroy();
        } finally {
            (globalThis as { Image: unknown }).Image = RealImage;
            URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke;
        }
    });
});
