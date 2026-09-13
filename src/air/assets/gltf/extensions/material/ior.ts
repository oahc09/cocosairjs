/**
 * KHR_materials_ior: index of refraction (>=1) controlling the dielectric F0 term.
 * Default 1.5 matches the engine base 0.08 and is therefore an identity at material level.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

export function iorFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_ior';
    return {
        name,
        support: () => ({ name, status: 'supported' }),
        validate (ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as { ior?: number } | undefined;
                if (!ext) { continue; }
                if (ext.ior === undefined) { continue; } // absent -> spec default 1.5
                if (typeof ext.ior !== 'number' || !Number.isFinite(ext.ior) || ext.ior < 1) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: ior must be finite and >= 1`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as { ior?: number } | undefined;
            if (ext && ext.ior !== undefined) { physicalScalars(features).ior = ext.ior; }
        },
    };
}
