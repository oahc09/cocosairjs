/**
 * T5.2 iridescence: KHR_materials_iridescence validation, uniform packing
 * (factor, filmIor, thicknessMin, thicknessMax) and the thin-film F0 helper.
 */
import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, Vec4, Node, MeshRenderer } from '../../src';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { createMaterialFeatures, physicalScalars } from '../../src/air/assets/gltf/material/features';
import { createGLTFMaterial } from '../../src/air/assets/gltf/material';
import { gltfPhysicalEffect, IRIDESCENCE_CONSTANT } from '../../src/air/assets/gltf/material/physical-effect';
import { iridescenceFactory } from '../../src/air/assets/gltf/extensions/material/iridescence';
import { textureCoordinates } from '../../src/air/assets/gltf/material/texture-slots';
import type { GLTFExtensionHandler } from '../../src/air/assets/gltf/extension-registry';
import { CCObject } from '../../src/cocos/core/data/object';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

function validate(materials: unknown[]): void {
    const handler = iridescenceFactory({ json: { materials } } as unknown as GLTFParserContext) as GLTFExtensionHandler;
    handler.validate?.({ json: { materials } } as unknown as GLTFParserContext);
}
const read = (
    material: { passes: Array<{ getHandle(name: string): number; getUniform(h: number, o: Vec4): void }> },
    name: string,
): Vec4 | undefined => {
    const pass = material.passes.find((x) => x.getHandle(name)) ?? material.passes[0];
    const handle = pass.getHandle(name);
    if (!handle) {
        return undefined;
    }
    const value = new Vec4();
    pass.getUniform(handle, value);
    return value;
};

describe('glTF T5.2 iridescence', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => {
        CCObject._deferredDestroy();
        await Promise.resolve();
        CCObject._deferredDestroy();
    });

    test('validation enforces factor/ior ranges and ordered thickness', () => {
        expect(() =>
            validate([
                {},
                {
                    extensions: {
                        KHR_materials_iridescence: {
                            iridescenceFactor: 1,
                            iridescenceIor: 1.3,
                            iridescenceThicknessMinimum: 0,
                            iridescenceThicknessMaximum: 1000,
                        },
                    },
                },
            ]),
        ).not.toThrow();
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceFactor: 1.4 } } }])).toThrow(
            /iridescenceFactor/,
        );
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceIor: 0.99 } } }])).toThrow(
            /iridescenceIor/,
        );
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceIor: Infinity } } }])).toThrow(
            /iridescenceIor/,
        );
        expect(() =>
            validate([
                {
                    extensions: {
                        KHR_materials_iridescence: {
                            iridescenceThicknessMinimum: 400,
                            iridescenceThicknessMaximum: 100,
                        },
                    },
                },
            ]),
        ).toThrow(/thickness/);
    });

    test.each([1, 1.2, 1.3, 2.33334, 2.5, 10, Number.MAX_VALUE])('T07 accepts finite schema IOR %s', (ior) => {
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceIor: ior } } }])).not.toThrow();
    });

    test.each([-1, 0, 0.9999, NaN, Infinity, -Infinity, null, '1.3'])('T07 rejects invalid schema IOR %s', (ior) => {
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceIor: ior } } }])).toThrow(
            /iridescenceIor/,
        );
    });

    test.each([
        { iridescenceFactor: NaN },
        { iridescenceFactor: Infinity },
        { iridescenceFactor: null },
        { iridescenceThicknessMinimum: NaN },
        { iridescenceThicknessMaximum: Infinity },
        { iridescenceThicknessMinimum: -1 },
        { iridescenceThicknessMaximum: -1 },
        { iridescenceThicknessMinimum: 401, iridescenceThicknessMaximum: 400 },
        { iridescenceThicknessMinimum: null },
    ])('T08 rejects malformed factor or thickness %s', (extension) => {
        expect(() => validate([{ extensions: { KHR_materials_iridescence: extension } }])).toThrow();
    });

    test('spec defaults populate', () => {
        const features = createMaterialFeatures(-1, { extensions: { KHR_materials_iridescence: {} } } as never);
        iridescenceFactory(null as never).extendMaterial?.(-1, features, null as never);
        expect(physicalScalars(features).iridescence).toEqual({
            factor: 0,
            ior: 1.3,
            thicknessMin: 100,
            thicknessMax: 400,
        });
    });

    test('factor selects the physical effect and packs the uniform', () => {
        const features = createMaterialFeatures(-1, {
            extensions: {
                KHR_materials_iridescence: {
                    iridescenceFactor: 0.7,
                    iridescenceIor: 1.8,
                    iridescenceThicknessMinimum: 200,
                    iridescenceThicknessMaximum: 450,
                },
            },
        } as never);
        iridescenceFactory(null as never).extendMaterial?.(-1, features, null as never);
        const material = createGLTFMaterial(features, [], false);
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        const u = read(material, IRIDESCENCE_CONSTANT)!;
        expect(u.x).toBeCloseTo(0.7, 5);
        expect(u.y).toBeCloseTo(1.8, 5);
        expect(u.z).toBeCloseTo(200, 3);
        expect(u.w).toBeCloseTo(450, 3);
        material.destroy();
        const off = createMaterialFeatures(-1, {
            extensions: { KHR_materials_iridescence: { iridescenceFactor: 0 } },
        } as never);
        iridescenceFactory(null as never).extendMaterial?.(-1, off, null as never);
        const offMaterial = createGLTFMaterial(off, [], false);
        expect(offMaterial.effectAsset!.name).toBe('air-gltf-standard');
        offMaterial.destroy();
    });

    test('derived effect carries the thin-film Airy helper', () => {
        const shader = gltfPhysicalEffect().shaders.find((x) => x.name.includes('standard-fs'))!;
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            const stage = (shader as unknown as Record<string, { frag: string } | undefined>)[language];
            if (!stage) {
                continue;
            }
            expect(stage.frag).toContain('airIridescenceF0');
            expect(stage.frag).toContain('USE_AIR_IRIDESCENCE');
            expect(stage.frag).toContain('vec3 phase');
        }
    });

    test('T08 shader uses standard texture channels and no old IOR clamp', () => {
        const shader = gltfPhysicalEffect().shaders.find((x) => x.name.includes('standard-fs'))!;
        const fragment = shader.glsl3.frag;
        expect(fragment).toContain('float filmIor = airIriIorTex;');
        expect(fragment).not.toContain('clamp(airIriIorTex, 1.3, 2.33334)');
        expect(fragment).toContain('airIriThickTex = airIridescence.w;');
        expect(fragment).toMatch(/airIriFactorTex \*= .*iridescenceMap.*\.r;/);
        expect(fragment).toMatch(
            /airIriThickTex = mix\(airIridescence.z, airIridescence.w, .*iridescenceThicknessMap.*\.g\);/,
        );
    });

    test('T09 native uniform updates equal final-state construction and isolate instances', () => {
        const make = (ior: number, thickness: number, color: number[]) => {
            const features = createMaterialFeatures(-1, {
                alphaMode: 'BLEND',
                pbrMetallicRoughness: { baseColorFactor: color },
                extensions: {
                    KHR_materials_iridescence: {
                        iridescenceFactor: 0.8,
                        iridescenceIor: ior,
                        iridescenceThicknessMinimum: 100,
                        iridescenceThicknessMaximum: thickness,
                    },
                },
            } as never);
            iridescenceFactory(null as never).extendMaterial?.(-1, features, null as never);
            return createGLTFMaterial(features, [], false);
        };
        const template = make(1.3, 400, [1, 1, 1, 1]);
        const currentNode = new Node('current');
        const siblingNode = new Node('sibling');
        const currentRenderer = currentNode.addComponent(MeshRenderer);
        const siblingRenderer = siblingNode.addComponent(MeshRenderer);
        currentRenderer.setSharedMaterial(template, 0);
        siblingRenderer.setSharedMaterial(template, 0);
        const current = currentRenderer.getMaterialInstance(0)!;
        const sibling = siblingRenderer.getMaterialInstance(0)!;
        const reference = make(2.5, 620, [0.2, 0.4, 0.6, 0.5]);
        const passes = current.passes.slice();
        current.setProperty(IRIDESCENCE_CONSTANT, new Vec4(0.8, 2.5, 100, 620));
        current.setProperty('albedo', new Vec4(0.2, 0.4, 0.6, 0.5));
        const coordinates = textureCoordinates({
            index: 0,
            extensions: {
                KHR_texture_transform: {
                    offset: [0.25, 0.125],
                    scale: [2, 0.5],
                    rotation: Math.PI / 3,
                },
            },
        } as never);
        current.setProperty('airAlbedoUV0', coordinates.row0);
        current.setProperty('airAlbedoUV1', coordinates.row1);
        reference.setProperty('airAlbedoUV0', coordinates.row0);
        reference.setProperty('airAlbedoUV1', coordinates.row1);
        for (const property of [IRIDESCENCE_CONSTANT, 'albedo', 'airAlbedoUV0', 'airAlbedoUV1']) {
            expect(read(current, property)).toEqual(read(reference, property));
        }
        expect(current.passes).toEqual(passes);
        expect(read(template, IRIDESCENCE_CONSTANT)!.y).toBeCloseTo(1.3, 5);
        expect(read(sibling, IRIDESCENCE_CONSTANT)!.w).toBe(400);
        expect(read(sibling, 'albedo')).toEqual(new Vec4(1, 1, 1, 1));
        currentNode.destroy();
        siblingNode.destroy();
        reference.destroy();
        template.destroy();
    });

    test('loader end to end applies iridescence and stable-codes invalid bodies', async () => {
        const f = fixture();
        f.json.meshes![0].primitives[0].material = 0;
        f.json.materials = [
            {
                name: 'film',
                pbrMetallicRoughness: { baseColorFactor: [0.3, 0.3, 0.32, 1] },
                extensions: {
                    KHR_materials_iridescence: {
                        iridescenceFactor: 1,
                        iridescenceIor: 1.5,
                        iridescenceThicknessMaximum: 300,
                    },
                },
            },
        ];
        f.json.extensionsUsed = ['KHR_materials_iridescence'];
        f.json.extensionsRequired = ['KHR_materials_iridescence'];
        const asset = await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
        const material = asset.materials[0]!;
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        expect(read(material, IRIDESCENCE_CONSTANT)!.w).toBeCloseTo(300, 3);
        asset.destroy();
        const broken = JSON.parse(JSON.stringify(f.json));
        broken.materials[0].extensions.KHR_materials_iridescence.iridescenceIor = 0.5;
        await expect(new GLTFLoader().parseAsync(toGLB(broken, f.bin))).rejects.toThrow(
            /iridescenceIor|GLTF_EXTENSION_INVALID/,
        );
    });
});
