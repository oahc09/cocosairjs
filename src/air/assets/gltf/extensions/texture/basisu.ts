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
 * `KHR_texture_basisu`: KTX2/BasisU GPU textures via an injected transcoder provider.
 * Optional extensions with a core `source` fall back with a warning when no transcoder
 * is configured; required or fallback-less files fail with `GLTF_DECODER_MISSING`.
 * Payload magic is validated; the transcoder result is a raw memory image source
 * (compressed block data or RGBA8) uploaded without browser image decoding.
 */
import { GLTFError } from '../../diagnostics';
import { KTX2_RAW_MIME } from '../../decoder/types';
import type { DecodedTextureSource } from '../../decoder/types';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { item } from '../../schema';
import { deviceKTX2Formats } from './device-formats';

const RASTER_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

interface BasisuImageRef { source: number; }

interface KTX2ImageLike { uri?: string; bufferView?: number; mimeType?: string; }

/** KTX2 file identifier: 0xAB 'KTX 20' 0xBB 0x0D 0x0A 0x1A 0x0A. */
export function isKTX2 (bytes: Uint8Array): boolean {
    return bytes.length >= 12 && bytes[0] === 0xAB && bytes[1] === 0x4B && bytes[2] === 0x54 && bytes[3] === 0x58
        && bytes[4] === 0x20 && bytes[5] === 0x32 && bytes[6] === 0x30 && bytes[7] === 0x42 && bytes[8] === 0x42
        && bytes[9] === 0xBB && bytes[10] === 0x0D && bytes[11] === 0x0A;
}

export function basisuFactory (context: GLTFParserContext): GLTFExtensionHandler {
    const name = 'KHR_texture_basisu';
    return {
        name,
        support () {
            if (!context.options.ktx2Transcoder) {
                return { name, status: 'decoder-required', reason: 'configure setKTX2Transcoder / createKTX2Transcoder' };
            }
            return { name, status: 'supported' };
        },
        validate (ctx): void {
            for (const [index, texture] of (ctx.json.textures || []).entries()) {
                const ext = texture.extensions?.[name] as BasisuImageRef | undefined;
                if (ext) { item(ctx.json.images, ext.source, `image for texture ${index} (${name})`); }
            }
        },
        async resolveTextureSource (textureIndex, ctx): Promise<DecodedTextureSource | null> {
            const texture = ctx.json.textures![textureIndex];
            const ext = texture.extensions?.[name] as BasisuImageRef | undefined;
            if (!ext) { return null; }
            const transcoder = ctx.options.ktx2Transcoder;
            if (!transcoder) {
                if (texture.source === undefined) {
                    throw new GLTFError('GLTF_DECODER_MISSING',
                        `texture ${textureIndex}: ${name} requires a KTX2 transcoder and no core image source exists`, name);
                }
                ctx.warn(`texture ${textureIndex}: ${name} transcoder not configured, using core image fallback`);
                return null;
            }
            const image = item(ctx.json.images, ext.source, 'ktx2 image source') as KTX2ImageLike;
            const bytes = image.uri !== undefined
                ? new Uint8Array(await ctx.request(image.uri))
                : (image.bufferView !== undefined ? ctx.bufferView(image.bufferView) : null);
            if (!bytes) { return null; }
            if (!isKTX2(bytes)) {
                throw new GLTFError('GLTF_EXTENSION_INVALID', `texture ${textureIndex}: ${name} image is not a KTX2 container`, name);
            }
            const decoded = await transcoder.transcode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
                deviceKTX2Formats());
            if (decoded.mimeType === KTX2_RAW_MIME) {
                if (!decoded.width || !decoded.height || decoded.format === undefined) {
                    throw new GLTFError('GLTF_DECODE_FAILED', `texture ${textureIndex}: raw transcode result lacks geometry/format`);
                }
                if (!decoded.data.byteLength) { throw new GLTFError('GLTF_DECODE_FAILED', `texture ${textureIndex}: empty transcode output`); }
            } else if (!RASTER_MIMES.includes(decoded.mimeType)) {
                throw new GLTFError('GLTF_DECODE_FAILED', `texture ${textureIndex}: transcoder returned unsupported mime '${decoded.mimeType}'`);
            }
            return decoded;
        },
    };
}
