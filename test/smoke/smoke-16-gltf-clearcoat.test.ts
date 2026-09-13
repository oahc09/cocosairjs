/**
 * T5.2 clearcoat: KHR_materials_clearcoat validation, second GGX layer selection,
 * airClearcoat uniform, tangent-space clearcoat normal path.
 */
import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, Vec4 } from '../../src';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { createMaterialFeatures, physicalScalars, GLTFMaterialFeatures } from '../../src/air/assets/gltf/material/features';
import { createGLTFMaterial } from '../../src/air/assets/gltf/material';
import { gltfPhysicalEffect, CLEARCOAT_CONSTANT } from '../../src/air/assets/gltf/material/physical-effect';
import { clearcoatFactory } from '../../src/air/assets/gltf/extensions/material/clearcoat';
import type { GLTFExtensionHandler } from '../../src/air/assets/gltf/extension-registry';
import type { GLTFMaterial } from '../../src/air/assets/gltf/schema';
import { CCObject } from '../../src/cocos/core/data/object';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

function featuresOf (source: GLTFMaterial): GLTFMaterialFeatures {
    const features = createMaterialFeatures(-1, source);
    const noop = null as unknown as GLTFParserContext;
    clearcoatFactory(noop).extendMaterial?.(-1, features, noop);
    return features;
}
function validate (materials: unknown[]): void {
    const handler = clearcoatFactory({ json: { materials } } as unknown as GLTFParserContext) as GLTFExtensionHandler;
    handler.validate?.({ json: { materials } } as unknown as GLTFParserContext);
}
const read = (material: { passes: Array<{ getHandle(name: string): number; getUniform(h: number, o: Vec4): void }> }, name: string): Vec4 | undefined => {
    const pass = material.passes.find((x) => x.getHandle(name)) ?? material.passes[0];
    const handle = pass.getHandle(name);
    if (!handle) { return undefined; }
    const value = new Vec4(); pass.getUniform(handle, value); return value;
};

describe('glTF T5.2 clearcoat', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); });

    test('validation accepts defaults and rejects out-of-range scalars', () => {
        expect(() => validate([{}, { extensions: { KHR_materials_clearcoat: {} } },
            { extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0 } } }])).not.toThrow();
        expect(() => validate([{ extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1.2 } } }])).toThrow(/clearcoatFactor/);
        expect(() => validate([{ extensions: { KHR_materials_clearcoat: { clearcoatRoughnessFactor: -0.1 } } }])).toThrow(/clearcoatRoughnessFactor/);
        expect(() => validate([{ extensions: { KHR_materials_clearcoat: { clearcoatNormalTexture: { index: 0, scale: 4 } } } }])).toThrow(/scale/);
    });

    test('extendMaterial normalizes spec defaults (factor 1, roughness 0, scale 1)', () => {
        expect(physicalScalars(featuresOf({ extensions: { KHR_materials_clearcoat: {} } })).clearcoat)
            .toEqual({ factor: 1, roughness: 0, normalScale: 1 });
        expect(physicalScalars(featuresOf({})).clearcoat).toBeUndefined();
    });

    test('clearcoat selects the physical effect and binds the layer uniforms', () => {
        const material = createGLTFMaterial(featuresOf({ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.1, 0.1, 1] },
            extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.6, clearcoatRoughnessFactor: 0.2,
                clearcoatNormalTexture: { index: 0, scale: 0.5 } } } }), [new Texture2D()], false);
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        const cc = read(material, CLEARCOAT_CONSTANT)!;
        expect(cc.x).toBeCloseTo(0.6, 5); expect(cc.y).toBeCloseTo(0.2, 5); expect(cc.z).toBe(0.5); expect(cc.w).toBe(1);
        expect(material.passes.some((pass) => pass.getHandle('clearcoatNormalMap') !== 0)).toBe(true);
        material.destroy();
    });

    test('factor 0 with no textures keeps the base effect (no layer)', () => {
        const material = createGLTFMaterial(featuresOf({ extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0 } } }), [new Texture2D()], false);
        expect(material.effectAsset!.name).toBe('air-gltf-standard');
        material.destroy();
    });

    test('derived effect carries the clearcoat lobe sources', () => {
        const effect = gltfPhysicalEffect();
        const shader = effect.shaders[0];
        expect((shader.samplerTextures || []).some((x) => x.name === 'clearcoatNormalMap')).toBe(true);
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            const stage = (shader as unknown as Record<string, { frag: string } | undefined>)[language];
            if (!stage) { continue; }
            expect(stage.frag).toContain('airCCFactorTex');
            expect(stage.frag).toContain('airCCNormal');
            expect(stage.frag).toContain('USE_AIR_CLEARCOAT');
            expect(stage.frag).toContain('vec3(0.04) * CalcSpecular(ccRough');
        }
    });

    test('loader end to end applies clearcoat and stable-codes invalid bodies', async () => {
        const f = fixture();
        f.json.meshes![0].primitives[0].material = 0;
        f.json.materials = [{ name: 'cc', pbrMetallicRoughness: { baseColorFactor: [1, 0.2, 0.2, 1] },
            extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.8, clearcoatRoughnessFactor: 0.1 } } }];
        f.json.extensionsUsed = ['KHR_materials_clearcoat']; f.json.extensionsRequired = ['KHR_materials_clearcoat'];
        const asset = await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
        const material = asset.materials[0]!;
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        expect(read(material, CLEARCOAT_CONSTANT)!.x).toBeCloseTo(0.8);
        asset.destroy();
        const broken = JSON.parse(JSON.stringify(f.json));
        broken.materials[0].extensions.KHR_materials_clearcoat.clearcoatFactor = 2;
        await expect(new GLTFLoader().parseAsync(toGLB(broken, f.bin))).rejects.toThrow(/clearcoatFactor|GLTF_EXTENSION_INVALID/);
    });
});
