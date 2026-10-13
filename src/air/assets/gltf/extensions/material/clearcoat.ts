/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
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
