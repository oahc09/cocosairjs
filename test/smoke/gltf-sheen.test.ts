import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, Vec4 } from '../../src';
import { createMaterialFeatures, physicalScalars } from '../../src/air/assets/gltf/material/features';
import { sheenFactory } from '../../src/air/assets/gltf/extensions/material/sheen';
import { createGLTFMaterial } from '../../src/air/assets/gltf/material';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { textureTransformFactory } from '../../src/air/assets/gltf/extensions/texture/transform';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });
const context = (materials: unknown[]) => ({ json: { materials } }) as GLTFParserContext;

describe('glTF sheen', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    test('validates factors and incompatible unlit; defaults disable sheen', () => {
        const handler = sheenFactory(context([]));
        for (const ext of [{ sheenColorFactor: [1, -1, 0] }, { sheenRoughnessFactor: 2 }, { sheenColorFactor: [1] }]) {
            expect(() => handler.validate?.(context([{ extensions: { KHR_materials_sheen: ext } }]))).toThrow(/sheen/);
        }
        expect(() =>
            handler.validate?.(context([{ extensions: { KHR_materials_sheen: {}, KHR_materials_unlit: {} } }])),
        ).toThrow(/sheen/);
        const features = createMaterialFeatures(0, { extensions: { KHR_materials_sheen: {} } });
        handler.extendMaterial?.(0, features, context([]));
        expect(physicalScalars(features).sheen).toEqual({ color: [0, 0, 0], roughness: 0 });
        const material = createGLTFMaterial(features, [], false);
        expect(material.effectAsset?.name).toBe('air-gltf-standard');
        material.destroy();
    });
    test('binds both texture slots with independent UV sets and transforms', () => {
        const ctx = context([]);
        const features = createMaterialFeatures(0, {
            extensions: {
                KHR_materials_sheen: {
                    sheenColorFactor: [0.5, 0.4, 0.3],
                    sheenRoughnessFactor: 0.8,
                    sheenColorTexture: {
                        index: 0,
                        extensions: {
                            KHR_texture_transform: {
                                texCoord: 1,
                                scale: [2, 3],
                                offset: [0.25, 0.5],
                            },
                        },
                    },
                    sheenRoughnessTexture: { index: 1 },
                },
            },
        });
        sheenFactory(ctx).extendMaterial?.(0, features, ctx);
        textureTransformFactory(ctx).extendMaterial?.(0, features, ctx);
        const textures = [new Texture2D(), new Texture2D()];
        const material = createGLTFMaterial(features, textures, false);
        try {
            expect(material.getProperty('sheenColorMap')).toBe(textures[0]);
            expect(material.getProperty('sheenRoughnessMap')).toBe(textures[1]);
            expect(features.uv.sheenColor?.texCoord).toBe(1);
            expect(features.uv.sheenRoughness?.texCoord).toBe(0);
            const row = new Vec4();
            const pass = material.passes[0];
            pass.getUniform(pass.getHandle('airSheenColorUV0'), row);
            expect([row.x, row.y, row.z]).toEqual([2, 0, 0.25]);
            pass.getUniform(pass.getHandle('airSheenColorUV1'), row);
            expect([row.x, row.y, row.z]).toEqual([0, 3, 0.5]);
            pass.getUniform(pass.getHandle('airSheenRoughnessUV0'), row);
            expect([row.x, row.y, row.z]).toEqual([1, 0, 0]);
        } finally {
            material.destroy();
            textures.forEach((texture) => texture.destroy());
        }
    });
    test('required extension loads through parser and binds the physical uniform', async () => {
        const f = fixture();
        f.json.meshes![0].primitives[0].material = 0;
        f.json.extensionsUsed = ['KHR_materials_sheen'];
        f.json.extensionsRequired = ['KHR_materials_sheen'];
        f.json.materials = [
            { extensions: { KHR_materials_sheen: { sheenColorFactor: [0.8, 0.2, 0.1], sheenRoughnessFactor: 0.5 } } },
        ];
        const invalid = JSON.parse(JSON.stringify(f.json));
        invalid.materials[0].extensions.KHR_materials_sheen.sheenRoughnessFactor = -1;
        await expect(new GLTFLoader().parseAsync(toGLB(invalid, f.bin))).rejects.toMatchObject({
            code: 'GLTF_EXTENSION_INVALID',
        });
        const asset = await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
        try {
            const material = asset.materials[0];
            expect(material.effectAsset?.name).toBe('air-gltf-physical');
            const value = new Vec4();
            material.passes[0].getUniform(material.passes[0].getHandle('airSheen'), value);
            expect(value.x).toBeCloseTo(0.8);
            expect(value.w).toBe(0.5);
        } finally {
            asset.destroy();
        }
    });
});
