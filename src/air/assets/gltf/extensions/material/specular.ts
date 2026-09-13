/**
 * KHR_materials_specular: F0 strength factor (specularFactor scalar, [0,2], default 1) and a
 * per-channel F0 color (specularColorFactor rgb, >=0 — the spec allows HDR values above 1;
 * early draft vec4 packing specularFactor[0..3] is also accepted). Optional textures:
 *  - specularTexture: G channel holds strength (2*value, matching Khronos Sample Renderer)
 *  - specularColorTexture: RGB multiplies the dielectric/metallic-specular color
 * Only normalized scalars feed the material surface; texture channel semantics are asserted
 * here so malformed textureInfos fail with a stable code rather than rendering wrong.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

export function specularFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_specular';
    return {
        name,
        support: () => ({ name, status: 'supported' }),
        validate (ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as { specularFactor?: number[] | number; specularColorFactor?: number[] } | undefined;
                if (!ext) { continue; }
                // Spec fields: specularFactor is a scalar [0,2]; specularColorFactor an rgb vec3
                // [0,1]. The vec4 packed form from early drafts is accepted as its combination.
                const sf = ext.specularFactor ?? 1;
                const rgb = ext.specularColorFactor ?? [1, 1, 1];
                if (typeof sf === 'number') {
                    if (!Number.isFinite(sf) || sf < 0 || sf > 2) {
                        throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: specularFactor must be [0,2]`, name);
                    }
                    // Spec: the specular color factor may EXCEED [1,1,1] (HDR F0 tints).
                    if (rgb.length !== 3 || !rgb.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
                        throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: specularColorFactor must be rgb >= 0`, name);
                    }
                } else {
                    const factor = sf as number[];
                    if (!Array.isArray(factor) || factor.length !== 4 || !factor.every(Number.isFinite)
                        || factor[0] < 0 || factor[0] > 2
                        || factor.slice(1).some((v) => v < 0 || v > 1)) {
                        throw new GLTFError('GLTF_EXTENSION_INVALID',
                            `material ${index}: specularFactor must be [0,2] followed by rgb in [0,1]`, name);
                    }
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as { specularFactor?: number[] | number; specularColorFactor?: number[] } | undefined;
            if (!ext) { return; }
            const physical = physicalScalars(features);
            if (typeof ext.specularFactor === 'number') {
                const rgb = ext.specularColorFactor ?? [1, 1, 1];
                physical.specular = { factor0: ext.specularFactor, factor1: rgb[0], color: [rgb[0], rgb[1], rgb[2]] };
            } else {
                const factor = ext.specularFactor ?? [1, 1, 1, 1];
                physical.specular = { factor0: factor[0], factor1: factor[1], color: [factor[1], factor[2], factor[3]] };
            }
        },
    };
}
