/**
 * KHR_materials_transmission: light transmitted through the surface by refracting the
 * opaque background. factor [0,1] (default 0), transmissionTexture.R. Refraction needs
 * the scene-color pipeline (see transmission-capability.ts); while it is not armed the
 * handler reports `device-dependent` so required files fail cleanly and optional ones
 * warn+skip rather than pretending a flat alpha surface is transmission.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';
import { transmissionPipelineAvailable } from '../../material/transmission-capability';

export function transmissionFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_transmission';
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
                const ext = material.extensions?.[name] as { transmissionFactor?: number } | undefined;
                if (!ext) { continue; }
                const factor = ext.transmissionFactor ?? 0;
                if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0 || factor > 1) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: transmissionFactor must be [0,1]`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as { transmissionFactor?: number } | undefined;
            if (!ext) { return; }
            physicalScalars(features).transmission = { factor: ext.transmissionFactor ?? 0 };
        },
    };
}
