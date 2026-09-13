/**
 * KHR_materials_specular: F0 strength factor (specularFactor[0], [0,2], default 1) and a
 * per-channel factor (specularFactor[1..3] rgb, [0,1], default white). Optional textures:
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
                const ext = material.extensions?.[name] as { specularFactor?: number[] } | undefined;
                if (!ext) { continue; }
                const factor = ext.specularFactor ?? [1, 1, 1, 1];
                if (factor.length !== 4 || !factor.every(Number.isFinite)
                    || factor[0] < 0 || factor[0] > 2
                    || factor.slice(1).some((v) => v < 0 || v > 1)) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID',
                        `material ${index}: specularFactor must be [0,2] followed by rgb in [0,1]`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as { specularFactor?: number[] } | undefined;
            if (!ext) { return; }
            const factor = ext.specularFactor ?? [1, 1, 1, 1];
            const physical = physicalScalars(features);
            physical.specular = { factor0: factor[0], factor1: factor[1], color: [factor[1], factor[2], factor[3]] };
        },
    };
}
