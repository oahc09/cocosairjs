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
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { physicalScalars } from '../../material/features';

interface Sheen {
    sheenColorFactor?: number[];
    sheenRoughnessFactor?: number;
}

export function sheenFactory(_context: GLTFParserContext): GLTFExtensionHandler {
    const name = 'KHR_materials_sheen';
    return {
        name,
        support: () => ({
            name,
            status: 'supported',
            reason: 'Charlie direct-light lobe with Ashikhmin visibility; conservative base attenuation; no dedicated sheen IBL convolution',
        }),
        validate(ctx): void {
            for (const [index, material] of (ctx.json.materials || []).entries()) {
                const ext = material.extensions?.[name] as Sheen | undefined;
                if (!ext) {
                    continue;
                }
                const unit = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
                const color = ext.sheenColorFactor ?? [0, 0, 0];
                if (
                    !Array.isArray(color) ||
                    color.length !== 3 ||
                    !color.every(unit) ||
                    !unit(ext.sheenRoughnessFactor ?? 0) ||
                    material.extensions?.KHR_materials_unlit !== undefined ||
                    material.extensions?.KHR_materials_pbrSpecularGlossiness !== undefined
                ) {
                    throw new GLTFError(
                        'GLTF_EXTENSION_INVALID',
                        `material ${index}: invalid sheen factors or incompatible material`,
                        name,
                    );
                }
            }
        },
        extendMaterial(_index, features): void {
            const ext = features.source.extensions?.[name] as Sheen | undefined;
            if (ext) {
                physicalScalars(features).sheen = {
                    color: [...(ext.sheenColorFactor ?? [0, 0, 0])],
                    roughness: ext.sheenRoughnessFactor ?? 0,
                };
            }
        },
    };
}
