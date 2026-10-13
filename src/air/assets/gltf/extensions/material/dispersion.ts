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
 * KHR_materials_dispersion: splits refractive samples by wavelength (Abbe-style).
 * dispersion (spec field, = 20/Abbe number) >= 0 (default 0). Green is the reference channel; R and B refract
 * with scaled IOR offsets derived from it. Requires the scene-color refraction pipeline
 * (needs volume/transmission geometry), so it reports the same capability gate.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';
import { transmissionPipelineAvailable } from '../../material/transmission-capability';

export function dispersionFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const name = 'KHR_materials_dispersion';
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
                const ext = material.extensions?.[name] as { dispersion?: number } | undefined;
                if (!ext) { continue; }
                // Spec field name is `dispersion` (= 20 / Abbe number); there is no dispersionFactor.
                const factor = ext.dispersion ?? 0;
                if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
                    throw new GLTFError('GLTF_EXTENSION_INVALID', `material ${index}: dispersion must be finite >= 0`, name);
                }
            }
        },
        extendMaterial (_index, features): void {
            const ext = features.source.extensions?.[name] as { dispersion?: number } | undefined;
            if (!ext) { return; }
            physicalScalars(features).dispersion = { factor: ext.dispersion ?? 0 };
        },
    };
}
