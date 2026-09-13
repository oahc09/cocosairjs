/**
 * KHR_materials_dispersion: splits refractive samples by wavelength (Abbe-style).
 * dispersionFactor >= 0 (default 0). Green is the reference channel; R and B refract
 * with scaled IOR offsets derived from it. Requires the scene-color refraction pipeline
 * (needs volume/transmission geometry), so it reports the same capability gate.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';
import { transmissionPipelineAvailable } from '../../material/transmission-capability';

export function dispersionFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_dispersion';
    return {
        name,
        support () {
            const cap = transmissionPipelineAvailable();
            return cap.available
                ? { name, status: 'supported' }
                : { name, status: 'device-dependent', reason: `requires the scene-color transmission pipeline (${cap.detail})` };
        },
        validate (ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as { dispersionFactor?: number } | undefined;
                if (!ext) { continue; }
                const factor = ext.dispersionFactor ?? 0;
                if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: dispersionFactor must be finite >= 0`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as { dispersionFactor?: number } | undefined;
            if (!ext) { return; }
            physicalScalars(features).dispersion = { factor: ext.dispersionFactor ?? 0 };
        },
    };
}
