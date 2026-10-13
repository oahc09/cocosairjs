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
 * `EXT_texture_webp` / `EXT_texture_avif`: browser-native texture encodings. The handler
 * only claims support when the running browser can actually decode the image; otherwise the
 * file's core `source` fallback is used (spec: optional extensions). `KHR_texture_basisu`
 * is the separate KTX2 handler.
 */
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { item } from '../../schema';

interface ImageExtension { source: number; }

export const SUPPORTED_IMAGE_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

/** Magic-number detection for raster image payloads; null when the encoding is unknown. */
export function detectImageMime (bytes: Uint8Array): string | null {
    if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) { return 'image/png'; }
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) { return 'image/jpeg'; }
    if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70
        && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) { return 'image/webp'; }
    // ISO-BMFF 'ftyp' box with an AVIF brand (avif/avis).
    if (bytes.length >= 12 && bytes[4] === 102 && bytes[5] === 116 && bytes[6] === 121 && bytes[7] === 112
        && bytes[8] === 97 && bytes[9] === 118 && bytes[10] === 105 && (bytes[11] === 102 || bytes[11] === 115)) { return 'image/avif'; }
    return null;
}

const FORMATS: Record<string, { mime: string; decoder: 'webp' | 'avif' }> = {
    EXT_texture_webp: { mime: 'image/webp', decoder: 'webp' },
    EXT_texture_avif: { mime: 'image/avif', decoder: 'avif' },
};

/** Cached decode-capability probes: one data-URI test image per mime per tab. */
const supportPromises = new Map<string, Promise<boolean>>();
const probeResults = new Map<string, boolean>();
function probeSupport (mime: string): Promise<boolean> {
    let promise = supportPromises.get(mime);
    if (!promise) {
        // 1x1 lossy WebP / minimal AVIF header; a decode error marks the format unsupported.
        const data = mime === 'image/webp'
            ? 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
            : 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRzYwAAAAAAAAAAAAAAAAAAAAAAAAA=';
        promise = new Promise<boolean>((resolve) => {
            const image = new Image();
            image.onload = (): void => resolve(image.width === 1 && image.height === 1);
            image.onerror = (): void => resolve(false);
            image.src = data;
        });
        supportPromises.set(mime, promise);
        void promise.then((value) => probeResults.set(mime, value));
    }
    return promise;
}

/** Test seam: preset the probe result for a mime (null clears the cached probe). */
export function setTextureSupportForTesting (mime: string, supported: boolean | null): void {
    if (supported === null) { supportPromises.delete(mime); probeResults.delete(mime); return; }
    supportPromises.set(mime, Promise.resolve(supported));
    probeResults.set(mime, supported);
}

export function imageExtensionFactory (name: 'EXT_texture_webp' | 'EXT_texture_avif'): GLTFExtensionFactory {
    return (): GLTFExtensionHandler => ({
        name,
        support () {
            // The probe is async; kick it off and report the cached verdict. Before the probe
            // resolves the status is optimistically 'supported' and resolveTextureSource
            // performs the authoritative check (with stable error codes).
            const format = FORMATS[name];
            void probeSupport(format.mime);
            if (probeResults.get(format.mime) === false) {
                return { name, status: 'device-dependent', reason: `${format.decoder} decoding is unavailable in this browser` };
            }
            return { name, status: 'supported' };
        },
        validate (ctx): void {
            for (const [index, texture] of (ctx.json.textures || []).entries()) {
                const ext = texture.extensions?.[name] as ImageExtension | undefined;
                if (ext) { item(ctx.json.images, ext.source, `image for texture ${index} (${name})`); }
            }
        },
        async resolveTextureSource (textureIndex, ctx) {
            const texture = ctx.json.textures![textureIndex];
            const ext = texture.extensions?.[name] as ImageExtension | undefined;
            if (!ext) { return null; }
            const format = FORMATS[name];
            if (!await probeSupport(format.mime)) {
                if (ctx.json.extensionsRequired?.includes(name)) {
                    throw new GLTFError('GLTF_DEVICE_UNSUPPORTED',
                        `${name} required but ${format.decoder} decoding is unavailable in this browser`, name);
                }
                ctx.warn(`texture ${textureIndex}: ${name} ${format.decoder} unavailable, using core image fallback`);
                return null;
            }
            const image = item(ctx.json.images, ext.source, 'extension image source');
            const bytes = image.uri !== undefined
                ? new Uint8Array(await ctx.request(image.uri))
                : (image.bufferView !== undefined ? ctx.bufferView(image.bufferView) : null);
            if (!bytes) { return null; }
            if (detectImageMime(bytes) !== format.mime) {
                throw new GLTFError('GLTF_EXTENSION_INVALID', `texture ${textureIndex}: ${name} image is not valid ${format.decoder}`, name);
            }
            if (image.mimeType && image.mimeType !== format.mime) {
                throw new GLTFError('GLTF_EXTENSION_INVALID', `texture ${textureIndex}: ${name} declared ${image.mimeType}, expected ${format.mime}`, name);
            }
            return { data: bytes, mimeType: format.mime };
        },
    });
}
