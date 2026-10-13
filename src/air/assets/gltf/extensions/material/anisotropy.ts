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
