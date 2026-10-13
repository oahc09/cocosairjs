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
