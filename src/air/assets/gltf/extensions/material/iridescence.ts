/**
 * KHR_materials_iridescence: thin-film layer above the base material.
 * factor [0,1], ior [1.3,2.3333], thickness range in nm [0,∞) (min<=max).
 * Textures: iridescenceTexture.R, iridescenceIorTexture.G (maps [1.3,2.3333]),
 * iridescenceThicknessTexture.G (maps [min,max]). Without the volume extension the
 * effective thickness is the maximum (thickness factor 1) per the spec fallback.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

export function iridescenceFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_iridescence';
    const inRange = (value: number, lo: number, hi: number): boolean => Number.isFinite(value) && value >= lo && value <= hi;
    return {
        name,
        support: () => ({ name, status: 'supported' }),
        validate (ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as {
                    iridescenceFactor?: number; iridescenceIor?: number;
                    iridescenceThicknessMinimum?: number; iridescenceThicknessMaximum?: number;
                } | undefined;
                if (!ext) { continue; }
                const factor = ext.iridescenceFactor ?? 0;
                const ior = ext.iridescenceIor ?? 1.3;
                const min = ext.iridescenceThicknessMinimum ?? 100;
                const max = ext.iridescenceThicknessMaximum ?? 400;
                if (!inRange(factor, 0, 1)) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: iridescenceFactor must be [0,1]`, name);
                }
                if (!inRange(ior, 1.3, 2.33334)) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: iridescenceIor must be [1.3,2.3333]`, name);
                }
                if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < min) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: iridescence thickness range must be 0<=min<=max`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as {
                iridescenceFactor?: number; iridescenceIor?: number;
                iridescenceThicknessMinimum?: number; iridescenceThicknessMaximum?: number;
            } | undefined;
            if (!ext) { return; }
            physicalScalars(features).iridescence = {
                factor: ext.iridescenceFactor ?? 0,
                ior: ext.iridescenceIor ?? 1.3,
                thicknessMin: ext.iridescenceThicknessMinimum ?? 100,
                thicknessMax: ext.iridescenceThicknessMaximum ?? 400,
            };
        },
    };
}
