/**
 * T6 parser + capability layer: KHR_materials_transmission / volume / dispersion validate,
 * normalize into features, and report device-dependent support until the scene-color pipeline
 * is armed. A file that *requires* these extensions with the pipeline unavailable must fail
 * cleanly (no silent alpha-blend-as-supported); optional ones warn and continue.
 */
import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, GLTFError } from '../../src';
import type { GLTFParserContext } from '../../src/air/assets/gltf/parser-context';
import { createMaterialFeatures, physicalScalars } from '../../src/air/assets/gltf/material/features';
import { transmissionFactory } from '../../src/air/assets/gltf/extensions/material/transmission';
import { volumeFactory } from '../../src/air/assets/gltf/extensions/material/volume';
import { dispersionFactory } from '../../src/air/assets/gltf/extensions/material/dispersion';
import { setTransmissionPipelineAvailable } from '../../src/air/assets/gltf/material/transmission-capability';
import type { GLTFExtensionHandler } from '../../src/air/assets/gltf/extension-registry';
import { CCObject } from '../../src/cocos/core/data/object';
import { fixture, toGLB } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

function validate (factory: (ctx: GLTFParserContext) => GLTFExtensionHandler, materials: unknown[]): void {
    const handler = factory({ json: { materials } } as unknown as GLTFParserContext);
    handler.validate?.({ json: { materials } } as unknown as GLTFParserContext);
}
function extend (factory: (ctx: GLTFParserContext) => GLTFExtensionHandler, source: Parameters<typeof createMaterialFeatures>[1]) {
    const features = createMaterialFeatures(-1, source);
    factory(null as never).extendMaterial?.(-1, features, null as never);
    return physicalScalars(features);
}

describe('glTF T6 transmission/volume/dispersion', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); });

    test('validate enforces factor/distance/color ranges', () => {
        expect(() => validate(transmissionFactory, [{ extensions: { KHR_materials_transmission: { transmissionFactor: 1 } } }])).not.toThrow();
        expect(() => validate(transmissionFactory, [{ extensions: { KHR_materials_transmission: { transmissionFactor: 1.5 } } }])).toThrow(/transmissionFactor/);
        expect(() => validate(volumeFactory, [{ extensions: { KHR_materials_volume: { thicknessFactor: 0.5, attenuationDistance: 2, attenuationColor: [1, 0.5, 0] } } }])).not.toThrow();
        expect(() => validate(volumeFactory, [{ extensions: { KHR_materials_volume: { attenuationDistance: 0 } } }])).toThrow(/attenuationDistance/);
        expect(() => validate(volumeFactory, [{ extensions: { KHR_materials_volume: { attenuationColor: [1, 1] } } }])).toThrow(/attenuationColor/);
        expect(() => validate(dispersionFactory, [{ extensions: { KHR_materials_dispersion: { dispersion: 0.1 } } }])).not.toThrow();
        expect(() => validate(dispersionFactory, [{ extensions: { KHR_materials_dispersion: { dispersion: -1 } } }])).toThrow(/dispersion/);
    });

    test('defaults normalize per spec', () => {
        expect(extend(transmissionFactory, { extensions: { KHR_materials_transmission: {} } } as never).transmission).toEqual({ factor: 0 });
        expect(extend(volumeFactory, { extensions: { KHR_materials_volume: {} } } as never).volume)
            .toEqual({ thicknessFactor: 0, attenuationDistance: Infinity, attenuationColor: [1, 1, 1] });
        expect(extend(dispersionFactory, { extensions: { KHR_materials_dispersion: { dispersion: 4.0 } } } as never).dispersion).toEqual({ factor: 4.0 });
    });

    test('report device-dependent while the pipeline is unarmed, supported when armed', () => {
        setTransmissionPipelineAvailable(false);
        expect(transmissionFactory(null as never).support!().status).toBe('device-dependent');
        expect(volumeFactory(null as never).support!().status).toBe('device-dependent');
        expect(dispersionFactory(null as never).support!().status).toBe('device-dependent');
        setTransmissionPipelineAvailable(true, 'scene-color pass available');
        expect(transmissionFactory(null as never).support!().status).toBe('supported');
        expect(volumeFactory(null as never).support!().status).toBe('supported');
        setTransmissionPipelineAvailable(false);
    });

    test('required transmission fails cleanly when the pipeline is unavailable; optional warns', async () => {
        setTransmissionPipelineAvailable(false);
        const f = fixture();
        f.json.meshes![0].primitives[0].material = 0;
        f.json.materials = [{ name: 'glass', extensions: { KHR_materials_transmission: { transmissionFactor: 1 } } }];
        f.json.extensionsUsed = ['KHR_materials_transmission'];
        f.json.extensionsRequired = ['KHR_materials_transmission'];
        await expect(new GLTFLoader().parseAsync(toGLB(f.json, f.bin))).rejects.toBeInstanceOf(GLTFError);
        // optional: parses with a warning, does not silently claim full support in status
        f.json.extensionsRequired = [];
        const asset = await new GLTFLoader().parseAsync(toGLB(f.json, f.bin));
        expect(asset.warnings.join(' ')).toMatch(/KHR_materials_transmission.*device-dependent/);
        asset.destroy();
    });
});
