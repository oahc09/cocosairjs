/**
 * KHR_materials_clearcoat: a second specular GGX layer over the base material.
 * factor/roughness are [0,1] scalars (R and G channels of their textures); the
 * optional clearcoatNormalTexture perturbs the layer normal in tangent space.
 * The layer F0 is fixed at 0.04 with Schlick Fresnel, per the Khronos spec.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

export function clearcoatFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_clearcoat';
    const unit = (value: unknown, field: string, index: number): number => {
        if (value === undefined) { return 0; }
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
            throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: clearcoat.${field} must be [0,1]`, name);
        }
        return value;
    };
    return {
        name,
        support: () => ({ name, status: 'supported' }),
        validate (ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as {
                    clearcoatFactor?: number; clearcoatRoughnessFactor?: number;
                    clearcoatTexture?: { index: number }; clearcoatRoughnessTexture?: { index: number };
                    clearcoatNormalTexture?: { index: number; scale?: number };
                } | undefined;
                if (!ext) { continue; }
                unit(ext.clearcoatFactor, 'clearcoatFactor', index);
                unit(ext.clearcoatRoughnessFactor, 'clearcoatRoughnessFactor', index);
                const scale = ext.clearcoatNormalTexture?.scale;
                if (scale !== undefined && (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 0 || scale > 1)) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: clearcoatNormalTexture.scale must be [0,1]`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as {
                clearcoatFactor?: number; clearcoatRoughnessFactor?: number;
                clearcoatNormalTexture?: { scale?: number };
            } | undefined;
            if (!ext) { return; }
            physicalScalars(features).clearcoat = {
                factor: ext.clearcoatFactor ?? 1,
                roughness: ext.clearcoatRoughnessFactor ?? 0,
                normalScale: ext.clearcoatNormalTexture?.scale ?? 1,
            };
        },
    };
}
