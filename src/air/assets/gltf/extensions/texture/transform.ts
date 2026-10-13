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
import type { GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { TEXTURE_SLOTS, slotTextureInfo } from '../../material/features';
import { textureCoordinates } from '../../material/texture-slots';

/** KHR_texture_transform: UV offset/rotation/scale and texCoord override per texture slot. */
export function textureTransformFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    return {
        name: 'KHR_texture_transform',
        extendMaterial (_materialIndex, features) {
            for (const slot of TEXTURE_SLOTS) {
                const info = slotTextureInfo(features.source, slot);
                if (info && info.extensions?.KHR_texture_transform !== undefined) {
                    features.uv[slot] = textureCoordinates(info);
                }
            }
        },
    };
}
