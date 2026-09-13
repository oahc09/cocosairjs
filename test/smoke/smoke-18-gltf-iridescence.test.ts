/**
 * T5.2 iridescence: KHR_materials_iridescence validation, uniform packing
 * (factor, filmIor, thicknessMin, thicknessMax) and the thin-film F0 helper.
 */
import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, Vec4 } from '../../src';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { createMaterialFeatures, physicalScalars } from '../../src/air/assets/gltf/material/features';
import { createGLTFMaterial } from '../../src/air/assets/gltf/material';
import { gltfPhysicalEffect, IRIDESCENCE_CONSTANT } from '../../src/air/assets/gltf/material/physical-effect';
import { iridescenceFactory } from '../../src/air/assets/gltf/extensions/material/iridescence';
import type { GLTFExtensionHandler } from '../../src/air/assets/gltf/extension-registry';
import { CCObject } from '../../src/cocos/core/data/object';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

function validate (materials: unknown[]): void {
    const handler = iridescenceFactory({ json: { materials } } as unknown as GLTFParserContext) as GLTFExtensionHandler;
    handler.validate?.({ json: { materials } } as unknown as GLTFParserContext);
}
const read = (material: { passes: Array<{ getHandle(name: string): number; getUniform(h: number, o: Vec4): void }> }, name: string): Vec4 | undefined => {
    const pass = material.passes.find((x) => x.getHandle(name)) ?? material.passes[0];
    const handle = pass.getHandle(name);
    if (!handle) { return undefined; }
    const value = new Vec4(); pass.getUniform(handle, value); return value;
};

describe('glTF T5.2 iridescence', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); });

    test('validation enforces factor/ior ranges and ordered thickness', () => {
        expect(() => validate([{}, { extensions: { KHR_materials_iridescence: {
            iridescenceFactor: 1, iridescenceIor: 1.3, iridescenceThicknessMinimum: 0, iridescenceThicknessMaximum: 1000 } } }])).not.toThrow();
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceFactor: 1.4 } } }])).toThrow(/iridescenceFactor/);
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceIor: 1.1 } } }])).toThrow(/iridescenceIor/);
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceIor: 2.5 } } }])).toThrow(/iridescenceIor/);
        expect(() => validate([{ extensions: { KHR_materials_iridescence: { iridescenceThicknessMinimum: 400, iridescenceThicknessMaximum: 100 } } }])).toThrow(/thickness/);
    });

    test('spec defaults populate', () => {
        const features = createMaterialFeatures(-1, { extensions: { KHR_materials_iridescence: {} } } as never);
        iridescenceFactory(null as never).extendMaterial?.(-1, features, null as never);
        expect(physicalScalars(features).iridescence).toEqual({ factor: 0, ior: 1.3, thicknessMin: 100, thicknessMax: 400 });
    });

    test('factor selects the physical effect and packs the uniform', () => {
        const features = createMaterialFeatures(-1, { extensions: { KHR_materials_iridescence: {
            iridescenceFactor: 0.7, iridescenceIor: 1.8, iridescenceThicknessMinimum: 200, iridescenceThicknessMaximum: 450 } } } as never);
        iridescenceFactory(null as never).extendMaterial?.(-1, features, null as never);
        const material = createGLTFMaterial(features, [], false);
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        const u = read(material, IRIDESCENCE_CONSTANT)!;
        expect(u.x).toBeCloseTo(0.7, 5); expect(u.y).toBeCloseTo(1.8, 5); expect(u.z).toBeCloseTo(200, 3); expect(u.w).toBeCloseTo(450, 3);
        material.destroy();
        const off = createMaterialFeatures(-1, { extensions: { KHR_materials_iridescence: { iridescenceFactor: 0 } } } as never);
        iridescenceFactory(null as never).extendMaterial?.(-1, off, null as never);
        const offMaterial = createGLTFMaterial(off, [], false);
        expect(offMaterial.effectAsset!.name).toBe('air-gltf-standard');
        offMaterial.destroy();
    });

    test('derived effect carries the thin-film Airy helper', () => {
        const shader = gltfPhysicalEffect().shaders.find((x) => x.name.includes('standard-fs'))!;
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            const stage = (shader as unknown as Record<string, { frag: string } | undefined>)[language];
            if (!stage) { continue; }
            expect(stage.frag).toContain('airIridescenceF0');
            expect(stage.frag).toContain('USE_AIR_IRIDESCENCE');
            expect(stage.frag).toContain('vec3 phase');
        }
    });

    test('loader end to end applies iridescence and stable-codes invalid bodies', async () => {
        const f = fixture();
        f.json.meshes![0].primitives[0].material = 0;
        f.json.materials = [{ name: 'film', pbrMetallicRoughness: { baseColorFactor: [0.3, 0.3, 0.32, 1] },
            extensions: { KHR_materials_iridescence: { iridescenceFactor: 1, iridescenceIor: 1.5, iridescenceThicknessMaximum: 300 } } }];
        f.json.extensionsUsed = ['KHR_materials_iridescence']; f.json.extensionsRequired = ['KHR_materials_iridescence'];
        const asset = await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
        const material = asset.materials[0]!;
        expect(material.effectAsset!.name).toBe('air-gltf-physical');
        expect(read(material, IRIDESCENCE_CONSTANT)!.w).toBeCloseTo(300, 3);
        asset.destroy();
        const broken = JSON.parse(JSON.stringify(f.json));
        broken.materials[0].extensions.KHR_materials_iridescence.iridescenceIor = 3;
        await expect(new GLTFLoader().parseAsync(toGLB(broken, f.bin))).rejects.toThrow(/iridescenceIor|GLTF_EXTENSION_INVALID/);
    });
});
