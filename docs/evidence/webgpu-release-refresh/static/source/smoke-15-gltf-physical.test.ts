/**
 * T5.1 physical material foundation: KHR_materials_emissive_strength / ior / specular.
 * Covers handler validation, feature normalization, physical effect selection and the
 * airPhysicalParams / airSpecularColorFactor uniform surface, plus loader end to end.
 */
import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, Vec4 } from '../../src';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import {
    createMaterialFeatures,
    physicalScalars,
    GLTFMaterialFeatures,
} from '../../src/air/assets/gltf/material/features';
import { gltfEffect, createGLTFMaterial } from '../../src/air/assets/gltf/material';
import {
    gltfPhysicalEffect,
    physicalParams,
    PHYSICAL_CONSTANT,
    PHYSICAL_COLOR_CONSTANT,
} from '../../src/air/assets/gltf/material/physical-effect';
import { emissiveStrengthFactory } from '../../src/air/assets/gltf/extensions/material/emissive-strength';
import { iorFactory } from '../../src/air/assets/gltf/extensions/material/ior';
import { specularFactory } from '../../src/air/assets/gltf/extensions/material/specular';
import { unlitFactory } from '../../src/air/assets/gltf/extensions/material/unlit';
import type { GLTFExtensionHandler } from '../../src/air/assets/gltf/extension-registry';
import type { GLTFMaterial } from '../../src/air/assets/gltf/schema';
import { CCObject } from '../../src/cocos/core/data/object';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { BlendFactor } from '../../src/cocos/gfx';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

const PHYSICAL_FACTORIES = [emissiveStrengthFactory, iorFactory, specularFactory];
/** Mimics the loader's material feature pipeline for the physical extensions. */
function physicalFeatures(source: GLTFMaterial): GLTFMaterialFeatures {
    const features = createMaterialFeatures(-1, source);
    const noop = null as unknown as GLTFParserContext;
    unlitFactory(noop).extendMaterial?.(-1, features, noop);
    for (const factory of PHYSICAL_FACTORIES) {
        factory(noop).extendMaterial?.(-1, features, noop);
    }
    return features;
}
function validate(factory: (ctx: GLTFParserContext) => GLTFExtensionHandler, materials: unknown[]): void {
    const handler = factory({ json: { materials } } as unknown as GLTFParserContext);
    handler.validate?.({ json: { materials } } as unknown as GLTFParserContext);
}
const read = (
    material: { passes: Array<{ getHandle(name: string): number; getUniform(h: number, o: Vec4): void }> },
    name: string,
): Vec4 | undefined => {
    const pass = material.passes[0];
    const handle = pass.getHandle(name);
    if (!handle) {
        return undefined;
    }
    const value = new Vec4();
    pass.getUniform(handle, value);
    return value;
};

describe('glTF T5.1 physical materials', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => {
        CCObject._deferredDestroy();
        await Promise.resolve();
        CCObject._deferredDestroy();
    });

    test('opaque and masked glTF materials preserve additive-light pass depth and blend states', () => {
        for (const alphaMode of ['OPAQUE', 'MASK'] as const) {
            const material = createGLTFMaterial(physicalFeatures({ alphaMode }), [], false);
            const additive = material.passes.filter((pass) => !!pass.defines.CC_FORWARD_ADD);
            expect(additive.length).toBeGreaterThan(0);
            expect(material.passes[0].blendState.targets[0].blend).toBe(false);
            for (const pass of additive) {
                expect(pass.depthStencilState.depthWrite).toBe(false);
                expect(pass.blendState.targets[0].blend).toBe(true);
                expect(pass.blendState.targets[0].blendSrc).toBe(BlendFactor.ONE);
                expect(pass.blendState.targets[0].blendDst).toBe(BlendFactor.ONE);
            }
            material.destroy();
        }
        const blended = createGLTFMaterial(physicalFeatures({ alphaMode: 'BLEND' }), [], false);
        expect(blended.passes.length).toBe(1);
        expect(blended.passes[0].depthStencilState.depthWrite).toBe(false);
        expect(blended.passes[0].blendState.targets[0].blendSrc).toBe(BlendFactor.SRC_ALPHA);
        expect(blended.passes[0].blendState.targets[0].blendDst).toBe(BlendFactor.ONE_MINUS_SRC_ALPHA);
        blended.destroy();
    });

    test('handler validation accepts valid and rejects invalid extension bodies', () => {
        expect(() =>
            validate(emissiveStrengthFactory, [
                { extensions: { KHR_materials_emissive_strength: {} } },
                { extensions: { KHR_materials_emissive_strength: { emissiveStrength: 1 } }, name: 'm' },
            ]),
        ).not.toThrow();
        expect(() =>
            validate(emissiveStrengthFactory, [
                { extensions: { KHR_materials_emissive_strength: { emissiveStrength: 0.5 } } },
            ]),
        ).toThrow(/emissiveStrength/);
        expect(() =>
            validate(emissiveStrengthFactory, [
                { extensions: { KHR_materials_emissive_strength: { emissiveStrength: Infinity } } },
            ]),
        ).toThrow(/emissiveStrength/);
        expect(() => validate(iorFactory, [{ extensions: { KHR_materials_ior: { ior: 1 } } }])).not.toThrow();
        expect(() => validate(iorFactory, [{ extensions: { KHR_materials_ior: { ior: 0.9 } } }])).toThrow(/ior/);
        expect(() => validate(iorFactory, [{ extensions: { KHR_materials_ior: { ior: 'glass' } } }])).toThrow(/ior/);
        expect(() =>
            validate(specularFactory, [
                { extensions: { KHR_materials_specular: {} } },
                { extensions: { KHR_materials_specular: { specularFactor: [2, 0, 1, 0.5] } } },
            ]),
        ).not.toThrow();
        expect(() =>
            validate(specularFactory, [{ extensions: { KHR_materials_specular: { specularFactor: [2.5, 1, 1, 1] } } }]),
        ).toThrow(/specularFactor/);
        expect(() =>
            validate(specularFactory, [{ extensions: { KHR_materials_specular: { specularFactor: [1, 1.5, 1, 1] } } }]),
        ).toThrow(/specularFactor/);
        expect(() =>
            validate(specularFactory, [{ extensions: { KHR_materials_specular: { specularFactor: [1, 1, 1] } } }]),
        ).toThrow(/specularFactor/);
    });

    test('extendMaterial normalizes scalars and defaults stay absent', () => {
        const plain = physicalFeatures({});
        expect(physicalScalars(plain)).toEqual({});
        const full = physicalScalars(
            physicalFeatures({
                extensions: {
                    KHR_materials_emissive_strength: { emissiveStrength: 4 },
                    KHR_materials_ior: { ior: 1.8 },
                    KHR_materials_specular: { specularFactor: [0.5, 1, 0.25, 0] },
                },
            }),
        );
        expect(full.emissiveStrength).toBe(4);
        expect(full.ior).toBe(1.8);
        expect(full.specular).toEqual({ factor0: 0.5, factor1: 1, color: [1, 0.25, 0] });
    });

    test('physicalParams converts IOR to the F0 ratio and guards ranges', () => {
        const defaultParams = physicalParams(1.5, 1, 1);
        // ior 1.5's F0 (0.04) equals the engine dielectric base: identity ratio.
        expect(defaultParams.x).toBe(1);
        expect(defaultParams.y).toBeCloseTo(1, 9);
        expect(defaultParams.z).toBe(1);
        expect(defaultParams.w).toBe(1);
        const glass = physicalParams(2, 1, 1);
        expect(glass.y).toBeCloseTo(Math.pow(1 / 3, 2) / 0.04, 5);
        expect(() => physicalParams(0.9, 1, 1)).toThrow(/ior/);
        expect(() => physicalParams(1.5, 3, 1)).toThrow(/specular/);
        expect(() => physicalParams(1.5, 1, 0.5)).toThrow(/emissive/);
    });

    test('identity materials keep the base glTF effect, physical scalars select the variant', () => {
        const plain = createGLTFMaterial(
            physicalFeatures({ pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0, 1] } }),
            [],
            false,
        );
        expect(plain.passes[0].getHandle(PHYSICAL_CONSTANT)).toBe(0);
        expect(plain.effectAsset!.name).toBe('air-gltf-standard');
        const identity = createGLTFMaterial(
            physicalFeatures({
                extensions: {
                    KHR_materials_ior: { ior: 1.5 },
                    KHR_materials_specular: { specularFactor: [1, 1, 1, 1] },
                    KHR_materials_emissive_strength: { emissiveStrength: 1 },
                },
            }),
            [],
            false,
        );
        expect(identity.effectAsset!.name).toBe('air-gltf-standard');
        const physical = createGLTFMaterial(
            physicalFeatures({
                pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0, 1] },
                extensions: {
                    KHR_materials_emissive_strength: { emissiveStrength: 4 },
                    KHR_materials_ior: { ior: 2 },
                    KHR_materials_specular: { specularFactor: [0.5, 1, 0.25, 0] },
                },
            }),
            [],
            false,
        );
        expect(physical.effectAsset!.name).toBe('air-gltf-physical');
        const params = read(physical, PHYSICAL_CONSTANT)!;
        expect(params.x).toBeCloseTo(4);
        expect(params.y).toBeCloseTo(Math.pow(1 / 3, 2) / 0.04, 5);
        expect(params.z).toBeCloseTo(0.5);
        const color = read(physical, PHYSICAL_COLOR_CONSTANT)!;
        expect([color.x, color.y, color.z, color.w]).toEqual([1, 0.25, 0, 1]);
        // The shared base surface still behaves identically on the physical variant.
        expect(read(physical, 'albedo')!.y).toBeCloseTo(0.5);
        plain.destroy();
        identity.destroy();
        physical.destroy();
    });

    test('specular textures bind the physical samplers; unlit ignores BRDF modifiers', () => {
        const texture = new Texture2D();
        const mapped = createGLTFMaterial(
            physicalFeatures({
                extensions: {
                    KHR_materials_specular: {
                        specularTexture: { index: 0, texCoord: 1 },
                        specularColorTexture: { index: 0 },
                    },
                },
            }),
            [texture],
            false,
        );
        expect(mapped.effectAsset!.name).toBe('air-gltf-physical');
        expect(mapped.passes[0].getHandle('specularMap')).not.toBe(0);
        expect(mapped.passes[0].getHandle('airSpecularUV0')).not.toBe(0);
        expect(mapped.passes[0].getHandle('airSpecularColorUV0')).not.toBe(0);
        expect(mapped.passes[0].getHandle('airPhysicalParams')).not.toBe(0);
        const unlit = createGLTFMaterial(
            { ...physicalFeatures({ extensions: { KHR_materials_ior: { ior: 2 } } }), unlit: true },
            [],
            false,
        );
        expect(unlit.effectAsset!.name).toBe('air-gltf-standard-single-pass');
        expect(unlit.passes[0].getHandle(PHYSICAL_CONSTANT)).toBe(0);
        unlit.destroy();
        mapped.destroy();
        texture.destroy();
    });

    test('effect derivation registers once and its sources declare the physical inputs', () => {
        const a = gltfPhysicalEffect();
        const b = gltfPhysicalEffect();
        expect(a).toBe(b);
        expect(a).not.toBe(gltfEffect());
        const shader = a.shaders[0];
        expect((shader.samplerTextures || []).some((s) => s.name === 'specularMap' && s.binding === 15)).toBe(true);
        expect((shader.samplerTextures || []).some((s) => s.name === 'specularColorMap' && s.binding === 16)).toBe(
            true,
        );
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            const stage = (shader as unknown as Record<string, { frag: string } | undefined>)[language];
            if (!stage) {
                continue;
            }
            expect(stage.frag).toContain('airSpec');
            expect(stage.frag).toContain('USE_AIR_SPECULAR_MAP');
            expect(stage.frag).toContain('s.specularIntensity = airPhysicalParams.y * 0.5;');
            expect(stage.frag).toContain('* airPhysicalParams.x');
            if (language === 'glsl4') {
                expect(stage.frag).toContain('layout(set = 1, binding = 15) uniform lowp sampler2D specularMap;');
                expect(stage.frag).toContain('layout(set = 1, binding = 27) uniform lowp sampler2D cc_sceneColorTex;');
            }
        }
    });

    test('loader applies physical extensions end to end and stable-codes invalid bodies', async () => {
        const f = fixture();
        f.json.meshes![0].primitives[0].material = 0;
        f.json.materials = [
            {
                name: 'physical',
                doubleSided: false,
                extensions: {
                    KHR_materials_emissive_strength: { emissiveStrength: 2 },
                    KHR_materials_ior: { ior: 1.3 },
                    KHR_materials_specular: { specularFactor: [1.5, 1, 1, 1] },
                },
            },
        ];
        f.json.extensionsUsed = ['KHR_materials_emissive_strength', 'KHR_materials_ior', 'KHR_materials_specular'];
        f.json.extensionsRequired = [...f.json.extensionsUsed!];
        const asset = await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
        const material = asset.materials[0]!;
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        expect(material.passes[0].getHandle(PHYSICAL_CONSTANT)).not.toBe(0);
        expect(read(material, PHYSICAL_CONSTANT)!.z).toBeCloseTo(1.5);
        asset.destroy();
        const broken = JSON.parse(JSON.stringify(f.json));
        broken.materials![0].extensions!.KHR_materials_ior = { ior: 0.5 };
        await expect(new GLTFLoader().parseAsync(toGLB(broken, f.bin))).rejects.toThrow(/GLTF_EXTENSION_INVALID|ior/);
    });
});
