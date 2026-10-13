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
