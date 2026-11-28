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
const limit = 4096;
export const bone2dImageBudget = 16 * 1024 * 1024;
type Header = readonly [width: number, height: number];

/** Inspect only tightly bounded raster data. Never pass a source URL from the asset to an image element. */
export function bone2dImageHeader(url: unknown, name: string, fail: (reason: string) => never): Header {
    if (typeof url !== 'string' || url.length > bone2dImageBudget)
        return fail(`missing or oversized embedded picture: ${name}`);
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
    if (!match) return fail(`expected embedded PNG, JPEG, WebP or GIF (no image URLs): ${name}`);
    let data: string;
    try {
        data = globalThis.atob(match[2]);
    } catch {
        return fail(`invalid base64 picture: ${name}`);
    }
    const b = (i: number): number => data.charCodeAt(i);
    const short = (i: number): number => b(i) + 256 * b(i + 1);
    const big = (i: number): number => b(i) * 16777216 + b(i + 1) * 65536 + b(i + 2) * 256 + b(i + 3);
    const le32 = (i: number): number => short(i) + 65536 * short(i + 2);
    const safe = (w: number, h: number): Header => {
        if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > limit || h > limit)
            return fail(`invalid image dimensions: ${name}`);
        return [w, h];
    };
    const bad = (): never => fail(`invalid ${match[1]} image header: ${name}`);
    const animated = (): never => fail(`animated images must be authored as a Bone-2D picture sequence: ${name}`);

    switch (match[1]) {
        case 'png':
            if (data.length < 33 || !data.startsWith('\x89PNG\r\n\x1a\n\0\0\0\rIHDR')) return bad();
            for (let p = 8; p + 12 <= data.length;) {
                const len = big(p),
                    kind = data.slice(p + 4, p + 8);
                if (p + 12 + len > data.length) return bad();
                if (kind === 'acTL') return animated();
                if (kind === 'IDAT') return safe(big(16), big(20));
                p += 12 + len;
            }
            return bad();
        case 'webp': {
            if (
                data.length < 25 ||
                !data.startsWith('RIFF') ||
                data.slice(8, 12) !== 'WEBP' ||
                le32(4) + 8 !== data.length
            )
                return bad();
            const type = data.slice(12, 16);
            const length = le32(16);
            if (20 + length > data.length) return bad();
            if (type === 'VP8X' && length === 10) {
                if (b(20) & 2) return animated();
                return safe(1 + short(24) + b(26) * 65536, 1 + short(27) + b(29) * 65536);
            }
            if (type === 'VP8L' && length >= 5 && b(20) === 47) {
                const pack = le32(21);
                return safe(1 + (pack & 16383), 1 + ((pack >>> 14) & 16383));
            }
            if (type === 'VP8 ' && length >= 10 && data.slice(23, 26) === '\x9d\x01\x2a') {
                return safe(short(26) & 16383, short(28) & 16383);
            }
            return bad();
        }
        case 'jpeg': {
            if (data.length < 10 || b(0) !== 255 || b(1) !== 216) return bad();
            let p = 2;
            while (p + 4 <= data.length && b(p++) === 255) {
                while (b(p) === 255) p++;
                const kind = b(p++);
                if (kind === 217 || kind === 218) return bad();
                const n = 256 * b(p) + b(p + 1);
                if (!(n >= 2 && p + n <= data.length)) return bad();
                if (kind === 192 || kind === 193 || kind === 194) {
                    if (n < 8) return bad();
                    return safe(256 * b(p + 5) + b(p + 6), 256 * b(p + 3) + b(p + 4));
                }
                p += n;
            }
            return bad();
        }
        case 'gif': {
            if (data.length < 14 || (!data.startsWith('GIF87a') && !data.startsWith('GIF89a'))) return bad();
            const header = safe(short(6), short(8));
            const tableSize = (flags: number): number => (flags & 128 ? 3 * (2 << (flags & 7)) : 0);
            let p = 13 + tableSize(b(10)),
                frames = 0;
            while (p < data.length) {
                const tag = b(p++);
                if (tag === 59) return frames === 1 ? header : bad();
                if (tag === 33) p++;
                else if (tag === 44) {
                    if (++frames > 1) return animated();
                    if (p + 9 >= data.length) return bad();
                    const frame = safe(short(p + 4), short(p + 6));
                    if (short(p) + frame[0] > header[0] || short(p + 2) + frame[1] > header[1]) return bad();
                    p += 10 + tableSize(b(p + 8));
                } else return bad();
                while (p < data.length && b(p)) p += 1 + b(p);
                p++;
            }
            return bad();
        }
        default:
            return bad();
    }
}
