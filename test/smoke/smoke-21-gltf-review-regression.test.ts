/**
 * V0.5 Code Review regression: locks the spec-correct semantics the initial acceptance missed.
 * These tests were added AFTER a review found 10 issues that the existing suite did not catch,
 * because those only asserted "loads / right effect type / no GL error". Each test here checks a
 * concrete spec value or channel (per Khronos READMEs), not merely that a file parsed.
 */
import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, GLTFError } from '../../src';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { checkAttributeType, attributeTypeRule } from '../../src/air/assets/gltf/attributes';
import { transmissionFactory } from '../../src/air/assets/gltf/extensions/material/transmission';
import { volumeFactory } from '../../src/air/assets/gltf/extensions/material/volume';
import { dispersionFactory } from '../../src/air/assets/gltf/extensions/material/dispersion';
import { specularFactory } from '../../src/air/assets/gltf/extensions/material/specular';
import { anisotropyFactory } from '../../src/air/assets/gltf/extensions/material/anisotropy';
import { createMaterialFeatures, physicalScalars } from '../../src/air/assets/gltf/material/features';
import { setTransmissionPipelineAvailable, transmissionPipelineAvailable } from '../../src/air/assets/gltf/material/transmission-capability';
import { gltfPhysicalEffect } from '../../src/air/assets/gltf/material/physical-effect';
import type { GLTFExtensionHandler } from '../../src/air/assets/gltf/extension-registry';
import { CCObject } from '../../src/cocos/core/data/object';

Object.assign(globalThis, { TextDecoder, TextEncoder });
const C = { FLOAT: 5126, BYTE: 5120, UNSIGNED_BYTE: 5121, SHORT: 5122, UNSIGNED_SHORT: 5123 };

function validate (factory: (ctx: GLTFParserContext) => GLTFExtensionHandler, materials: unknown[]): void {
    const handler = factory({ json: { materials } } as unknown as GLTFParserContext);
    handler.validate?.({ json: { materials } } as unknown as GLTFParserContext);
}
function extend (factory: (ctx: GLTFParserContext) => GLTFExtensionHandler, source: Parameters<typeof createMaterialFeatures>[1]) {
    const features = createMaterialFeatures(-1, source);
    factory(null as never).extendMaterial?.(-1, features, null as never);
    return physicalScalars(features);
}
function sourceOf (): string {
    const shader = gltfPhysicalEffect().shaders.find((x) => x.name.includes('standard-fs'))!;
    return (shader as unknown as Record<string, { frag: string }>).glsl4.frag;
}

describe('V0.5 review regression', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); });

    // #5 — KHR_mesh_quantization allowed-type table.
    test('quantized POSITION accepts unnormalized integer types', () => {
        for (const t of [C.BYTE, C.UNSIGNED_BYTE, C.SHORT, C.UNSIGNED_SHORT]) {
            expect(() => checkAttributeType('POSITION', t, false, true)).not.toThrow();
            expect(() => checkAttributeType('TEXCOORD_0', t, false, true)).not.toThrow();
        }
    });
    test('quantized NORMAL/TANGENT require signed normalized types', () => {
        expect(() => checkAttributeType('NORMAL', C.BYTE, true, true)).not.toThrow();
        expect(() => checkAttributeType('NORMAL', C.SHORT, true, true)).not.toThrow();
        expect(() => checkAttributeType('TANGENT', C.BYTE, true, true)).not.toThrow();
        expect(() => checkAttributeType('NORMAL', C.BYTE, false, true)).toThrow(); // unnormalized normal illegal
        expect(() => checkAttributeType('NORMAL', C.UNSIGNED_BYTE, true, true)).toThrow(); // unsigned normal illegal
        expect(() => checkAttributeType('TANGENT', C.UNSIGNED_SHORT, true, true)).toThrow(); // unsigned tangent illegal
    });

    // #2 — the dispersion JSON key is `dispersion`, not `dispersionFactor`.
    test('KHR_materials_dispersion reads the `dispersion` field', () => {
        expect(extend(dispersionFactory, { extensions: { KHR_materials_dispersion: { dispersion: 4 } } } as never).dispersion)
            .toEqual({ factor: 4 });
        expect(extend(dispersionFactory, { extensions: { KHR_materials_dispersion: { dispersionFactor: 4 } } } as never).dispersion)
            .toEqual({ factor: 0 }); // the non-spec key must be ignored (defaults to 0), not read
        expect(() => validate(dispersionFactory, [{ extensions: { KHR_materials_dispersion: { dispersion: -1 } } }])).toThrow(/dispersion/);
    });

    // #3 — specularTexture samples the alpha channel; specularColorFactor may exceed 1 (HDR).
    test('KHR_materials_specular uses the texture alpha channel and allows HDR color', () => {
        const frag = sourceOf();
        expect(frag).toMatch(/airSpecScale = texture\(specularMap[^\n]*\)\.a;/); // alpha channel per spec
        expect(frag).not.toMatch(/airSpecScale = [^\n]*\.g;/); // the old green*2 form is gone
        // energy conservation: dielectric diffuse is scaled by (1 - F0)
        expect(frag).toMatch(/vec3 diffuse = s\.albedo\.rgb \* \(1\.0 - s\.metallic\)[^\n]*airDielectric/);
        // HDR color factors are permitted (the reviewer flagged the old [0,1] rejection)
        expect(() => validate(specularFactory, [{ extensions: { KHR_materials_specular: { specularColorFactor: [5.441, 5.441, 5.441] } } }])).not.toThrow();
        expect(() => validate(specularFactory, [{ extensions: { KHR_materials_specular: { specularColorFactor: [-0.1, 1, 1] } } }])).toThrow(/specularColorFactor/);
    });

    // #4 — anisotropyTexture blue channel carries per-texel strength.
    test('KHR_materials_anisotropy folds the blue channel into strength', () => {
        const frag = sourceOf();
        expect(frag).toContain('airAnisoStrength *= aTex.z');
        // direction uses only RG remapped to [-1,1]; B is used unmodified
        expect(frag).toMatch(/vec2 aDir = vec2\(aTex\.x, aTex\.y\) \* 2\.0 - 1\.0;/);
        expect(frag).toMatch(/clamp\(airAnisoStrength, 0\.0, 1\.0\)/);
    });

    // #1/#9 + capability — transmission stays device-dependent until armed, then supported.
    test('transmission/volume/dispersion flip from device-dependent to supported on arming', () => {
        setTransmissionPipelineAvailable(false);
        expect(transmissionFactory(null as never).support!().status).toBe('device-dependent');
        expect(volumeFactory(null as never).support!().status).toBe('device-dependent');
        expect(dispersionFactory(null as never).support!().status).toBe('device-dependent');
        setTransmissionPipelineAvailable(true, 'test arm');
        expect(transmissionFactory(null as never).support!().status).toBe('supported');
        expect(transmissionPipelineAvailable().available).toBe(true);
        setTransmissionPipelineAvailable(false);
    });

    // #6 — the meshopt handler declares it provides placeholder-buffer decompression.
    test('meshopt handler advertises providesPlaceholders for no-URI fallback buffers', async () => {
        const { meshoptCompressionFactory, KHR_MESHOPT_COMPRESSION } = await import('../../src/air/assets/gltf/extensions/geometry/meshopt');
        const handler = meshoptCompressionFactory(KHR_MESHOPT_COMPRESSION)({ json: { asset: { version: '2.0' } } } as unknown as GLTFParserContext);
        expect(handler.providesPlaceholders).toBe(true);
    });
});
