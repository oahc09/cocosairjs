/**
 * KHR_materials_volume: gives the surface an interior medium. thickness (factor [0,inf)
 * default 0, thicknessTexture.G) drives path length; attenuation (distance >0 default inf,
 * color rgb) applies Beer-Lambert absorption along the refracted ray. Meaningful together
 * with transmission; gated on the same scene-color pipeline capability.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';
import { transmissionPipelineAvailable } from '../../material/transmission-capability';

export function volumeFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_volume';
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
                const ext = material.extensions?.[name] as {
                    thicknessFactor?: number; attenuationDistance?: number; attenuationColor?: number[];
                } | undefined;
                if (!ext) { continue; }
                const thickness = ext.thicknessFactor ?? 0;
                if (typeof thickness !== 'number' || !Number.isFinite(thickness) || thickness < 0) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: thicknessFactor must be finite >= 0`, name);
                }
                const distance = ext.attenuationDistance ?? Infinity;
                if (distance !== Infinity && (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0)) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: attenuationDistance must be > 0 or omitted (inf)`, name);
                }
                const color = ext.attenuationColor ?? [1, 1, 1];
                if (color.length !== 3 || !color.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: attenuationColor must be rgb in [0,1]`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as {
                thicknessFactor?: number; attenuationDistance?: number; attenuationColor?: number[];
            } | undefined;
            if (!ext) { return; }
            physicalScalars(features).volume = {
                thicknessFactor: ext.thicknessFactor ?? 0,
                attenuationDistance: ext.attenuationDistance ?? Infinity,
                attenuationColor: ext.attenuationColor ?? [1, 1, 1],
            };
        },
    };
}
