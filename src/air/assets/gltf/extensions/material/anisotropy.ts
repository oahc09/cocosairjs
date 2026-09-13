/**
 * KHR_materials_anisotropy: tangent-aligned anisotropic specular (brushed metals).
 * strength [0,1] (default 0 = isotropic) and rotation (radians, default 0).
 * anisotropyTexture RGB encodes the tangent-space anisotropic direction (unit vec3,
 * encoded [-1,1]) and the strength modulation follows the Khronos sample renderer.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

export function anisotropyFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_anisotropy';
    return {
        name,
        support: () => ({ name, status: 'supported' }),
        validate (ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as { anisotropyStrength?: number; anisotropyRotation?: number } | undefined;
                if (!ext) { continue; }
                const strength = ext.anisotropyStrength ?? 0;
                const rotation = ext.anisotropyRotation ?? 0;
                if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0 || strength > 1) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: anisotropyStrength must be [0,1]`, name);
                }
                if (typeof rotation !== 'number' || !Number.isFinite(rotation)) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: anisotropyRotation must be finite`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as { anisotropyStrength?: number; anisotropyRotation?: number; anisotropyTexture?: unknown } | undefined;
            if (!ext) { return; }
            physicalScalars(features).anisotropy = {
                strength: ext.anisotropyStrength ?? (ext.anisotropyTexture ? 1 : 0),
                rotation: ext.anisotropyRotation ?? 0,
            };
        },
    };
}
