/**
 * KHR_materials_emissive_strength: a linear multiplier (>=1) on the emissive factor,
 * used to carry HDR emissive beyond the core [0,1] emissiveFactor range.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

export function emissiveStrengthFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_emissive_strength';
    return {
        name,
        support: () => ({ name, status: 'supported' }),
        validate (ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as { emissiveStrength?: number } | undefined;
                if (!ext) { continue; }
                const value = ext.emissiveStrength;
                if (value === undefined) { continue; } // absent -> spec default 1
                if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: emissiveStrength must be finite and >= 1`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as { emissiveStrength?: number } | undefined;
            if (ext && ext.emissiveStrength !== undefined) { physicalScalars(features).emissiveStrength = ext.emissiveStrength; }
        },
    };
}
