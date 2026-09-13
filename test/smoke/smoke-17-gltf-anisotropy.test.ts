/**
 * T5.2 anisotropy: KHR_materials_anisotropy validation, uniform encoding
 * (strength + rotation as cos/sin), effect selection and the anisotropic GGX injection.
 */
import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, Vec4 } from '../../src';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { createMaterialFeatures, physicalScalars } from '../../src/air/assets/gltf/material/features';
import { createGLTFMaterial } from '../../src/air/assets/gltf/material';
import { gltfPhysicalEffect, ANISO_CONSTANT } from '../../src/air/assets/gltf/material/physical-effect';
import { anisotropyFactory } from '../../src/air/assets/gltf/extensions/material/anisotropy';
import type { GLTFExtensionHandler } from '../../src/air/assets/gltf/extension-registry';
import type { GLTFMaterial } from '../../src/air/assets/gltf/schema';
import { CCObject } from '../../src/cocos/core/data/object';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

function featuresOf (source: GLTFMaterial) {
    const features = createMaterialFeatures(-1, source);
    const noop = null as unknown as GLTFParserContext;
    anisotropyFactory(noop).extendMaterial?.(-1, features, noop);
    return features;
}
function validate (materials: unknown[]): void {
    const handler = anisotropyFactory({ json: { materials } } as unknown as GLTFParserContext) as GLTFExtensionHandler;
    handler.validate?.({ json: { materials } } as unknown as GLTFParserContext);
}
const read = (material: { passes: Array<{ getHandle(name: string): number; getUniform(h: number, o: Vec4): void }> }, name: string): Vec4 | undefined => {
    const pass = material.passes.find((x) => x.getHandle(name)) ?? material.passes[0];
    const handle = pass.getHandle(name);
    if (!handle) { return undefined; }
    const value = new Vec4(); pass.getUniform(handle, value); return value;
};

describe('glTF T5.2 anisotropy', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); });

    test('validation accepts spec ranges and rejects invalid bodies', () => {
        expect(() => validate([{}, { extensions: { KHR_materials_anisotropy: {} } },
            { extensions: { KHR_materials_anisotropy: { anisotropyStrength: 1, anisotropyRotation: 3.14 } } }])).not.toThrow();
        expect(() => validate([{ extensions: { KHR_materials_anisotropy: { anisotropyStrength: 1.5 } } }])).toThrow(/anisotropyStrength/);
        expect(() => validate([{ extensions: { KHR_materials_anisotropy: { anisotropyStrength: -0.2 } } }])).toThrow(/anisotropyStrength/);
        expect(() => validate([{ extensions: { KHR_materials_anisotropy: { anisotropyRotation: Infinity } } }])).toThrow(/anisotropyRotation/);
    });

    test('defaults: strength 0 without texture, 1 with texture; rotation 0', () => {
        expect(physicalScalars(featuresOf({ extensions: { KHR_materials_anisotropy: {} } })).anisotropy)
            .toEqual({ strength: 0, rotation: 0 });
        expect(physicalScalars(featuresOf({ extensions: { KHR_materials_anisotropy: {
            anisotropyTexture: { index: 0 } } } })).anisotropy).toEqual({ strength: 1, rotation: 0 });
    });

    test('strength selects physical effect; rotation encodes as cos/sin', () => {
        const material = createGLTFMaterial(featuresOf({ extensions: { KHR_materials_anisotropy: {
            anisotropyStrength: 0.8, anisotropyRotation: Math.PI / 2 } } }), [], false);
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        const u = read(material, ANISO_CONSTANT)!;
        expect(u.x).toBeCloseTo(0.8, 5);
        expect(u.y).toBeCloseTo(Math.cos(Math.PI / 2), 5);
        expect(u.z).toBeCloseTo(Math.sin(Math.PI / 2), 5);
        material.destroy();
        const zero = createGLTFMaterial(featuresOf({ extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0 } } }), [], false);
        expect(zero.effectAsset!.name).toBe('air-gltf-standard');
        zero.destroy();
    });

    test('derived effect carries the anisotropic GGX sources', () => {
        const shader = gltfPhysicalEffect().shaders.find((x) => x.name.includes('standard-fs'))!;
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            const stage = (shader as unknown as Record<string, { frag: string } | undefined>)[language];
            if (!stage) { continue; }
            expect(stage.frag).toContain('airAnisoVisibility');
            expect(stage.frag).toContain('airAnisoT');
            expect(stage.frag).toContain('USE_AIR_ANISOTROPY');
        }
    });

    test('loader end to end applies anisotropy and stable-codes invalid bodies', async () => {
        const f = fixture();
        f.json.meshes![0].primitives[0].material = 0;
        f.json.materials = [{ name: 'brushed', pbrMetallicRoughness: { baseColorFactor: [0.9, 0.6, 0.25, 1], metallicFactor: 1, roughnessFactor: 0.3 },
            extensions: { KHR_materials_anisotropy: { anisotropyStrength: 0.9, anisotropyRotation: 1.57 } } }];
        f.json.extensionsUsed = ['KHR_materials_anisotropy']; f.json.extensionsRequired = ['KHR_materials_anisotropy'];
        const asset = await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
        const material = asset.materials[0]!;
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        expect(read(material, ANISO_CONSTANT)!.x).toBeCloseTo(0.9);
        asset.destroy();
        const broken = JSON.parse(JSON.stringify(f.json));
        broken.materials[0].extensions.KHR_materials_anisotropy.anisotropyStrength = 4;
        await expect(new GLTFLoader().parseAsync(toGLB(broken, f.bin))).rejects.toThrow(/anisotropyStrength|GLTF_EXTENSION_INVALID/);
    });
});
