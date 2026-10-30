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
import { sampleAirImageShape } from './point-shapes';
import type { AirPointShape } from './point-shapes';

export interface AirTextShapeOptions {
    text: string;
    /** CSS canvas font. Browser/system font metrics affect the resulting shape. */
    font?: string;
    count: number;
    size?: number;
    seed?: number;
}

/** Sample a single line after document fonts load. The temporary canvas is always released. */
export async function sampleAirTextShape(options: AirTextShapeOptions): Promise<AirPointShape> {
    const font = options.font ?? 'bold 160px sans-serif';
    if (!options.text.trim() || /[\r\n]/.test(options.text))
        throw new Error('[AIR_POINT_TEXT] A non-empty single line is required.');
    await document.fonts.load(font, options.text);
    const canvas = document.createElement('canvas');
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('[AIR_POINT_TEXT] Canvas 2D is unavailable.');
        ctx.font = font;
        const metrics = ctx.measureText(options.text);
        const left = Math.max(0, metrics.actualBoundingBoxLeft),
            right = Math.max(metrics.width, metrics.actualBoundingBoxRight);
        const ascent = metrics.actualBoundingBoxAscent,
            descent = metrics.actualBoundingBoxDescent;
        const width = Math.ceil(left + right) + 4,
            height = Math.ceil(ascent + descent) + 4;
        if (!Number.isFinite(width + height) || width > 8192 || height > 2048 || width < 5 || height < 5)
            throw new Error('[AIR_POINT_TEXT] Glyph raster dimensions are unsupported.');
        canvas.width = width;
        canvas.height = height;
        ctx.font = font;
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(options.text, left + 2, ascent + 2);
        return sampleAirImageShape({
            rgba: ctx.getImageData(0, 0, width, height).data,
            width,
            height,
            count: options.count,
            size: options.size,
            seed: options.seed,
        });
    } finally {
        canvas.width = canvas.height = 0;
    }
}
