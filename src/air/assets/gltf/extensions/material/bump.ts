/**
 * EXT_materials_bump: height-map normal perturbation via screen-space derivatives.
 * bumpTexture (required, R channel) + bumpFactor (>=0, default 1) follow the
 * extension proposal as consumed by mainstream glTF loaders. Perturbation runs in
 * the fragment stage with dFdx/dFdy, so WebGL1 requires the derivatives extension
 * (probed; unsupported devices warn and fall back to the flat normal).
 * When a normal texture is present the bump perturbation is skipped with a warning:
 * combining both was listed as optional in the proposal and risks ambiguous results.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

export function bumpFactory (context: GLTFParserContext): GLTFExtensionHandler {
    const name = 'EXT_materials_bump';
    return {
        name,
        support: () => ({ name, status: 'supported' }),
        validate (ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as { bumpTexture?: { index: number }; bumpFactor?: number } | undefined;
                if (!ext) { continue; }
                if (!ext.bumpTexture || typeof ext.bumpTexture.index !== 'number'
                    || !Number.isSafeInteger(ext.bumpTexture.index) || ext.bumpTexture.index < 0) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: bumpTexture is required with a valid texture index`, name);
                }
                const factor = ext.bumpFactor ?? 1;
                if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: bumpFactor must be a finite >= 0`, name);
                }
            }
        },
        extendMaterial (_index, features, ctx): void {
            const ext = features.source.extensions?.[name] as { bumpFactor?: number } | undefined;
            if (!ext) { return; }
            if (features.uv.normal) {
                ctx?.warn(`material ${_index}: ${name} combined with a normal texture - bump is skipped`);
                return;
            }
            physicalScalars(features).bump = { factor: ext.bumpFactor ?? 1 };
        },
    };
}
