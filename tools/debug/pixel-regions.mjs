/** Optional development pixel metrics. No imports or default runtime dependency.
 * Inputs are RGBA bytes; rectangles use screenshot pixels with a top-left origin.
 * 'lit' means RGB distance from the region's modal background, not absolute brightness.
 */
export function measurePixelRegions(image, regions, { distance = 30, origin = 'top-left' } = {}) {
    const { width, height, data } = image;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        !data || data.length !== width * height * 4) throw new TypeError('Expected positive dimensions and width*height*4 RGBA bytes');
    if (!Number.isFinite(distance) || distance < 0 || !['top-left', 'bottom-left'].includes(origin))
        throw new TypeError('Expected a non-negative RGB distance and a supported row origin');
    const offset = (x, y) => ((origin === 'bottom-left' ? height - y - 1 : y) * width + x) * 4;
    return regions.map((input) => {
        if (![input.x, input.y, input.w, input.h].every(Number.isFinite) || input.w <= 0 || input.h <= 0)
            throw new TypeError('Region needs finite x/y and positive w/h');
        const x = Math.max(0, Math.min(width - 1, Math.round(input.x)));
        const y = Math.max(0, Math.min(height - 1, Math.round(input.y)));
        const w = Math.max(1, Math.min(width - x, Math.round(input.w)));
        const h = Math.max(1, Math.min(height - y, Math.round(input.h)));
        const bins = new Map();
        for (let row = y; row < y + h; row += 2) {
            for (let column = x; column < x + w; column += 2) {
                const i = offset(column, row);
                const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
                const bin = bins.get(key) || { count: 0, sums: [0, 0, 0] };
                ++bin.count;
                for (let channel = 0; channel < 3; ++channel) bin.sums[channel] += data[i + channel];
                bins.set(key, bin);
            }
        }
        let dominant;
        for (const bin of bins.values()) if (!dominant || bin.count > dominant.count) dominant = bin;
        const background = dominant.sums.map((sum) => sum / dominant.count);
        let count = 0;
        for (let row = y; row < y + h; ++row) {
            for (let column = x; column < x + w; ++column) {
                const i = offset(column, row);
                const squared = background.reduce((sum, value, channel) => sum + (data[i + channel] - value) ** 2, 0);
                if (Math.sqrt(squared) > distance) ++count;
            }
        }
        return { rect: { x, y, w, h }, litRatio: count / (w * h), litPixels: count,
            background: background.map(Math.round) };
    });
}

/** Reading must happen after a committed engine draw, before the browser discards the buffer. */
export function measureCanvasRegions(canvas, regions, options = {}) {
    const gl = canvas.getContext('webgl2');
    if (!gl || gl.isContextLost()) throw new Error('A live WebGL2 canvas is required');
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Unable to read the current framebuffer');
    return measurePixelRegions({ width: canvas.width, height: canvas.height, data }, regions,
        { ...options, origin: 'bottom-left' });
}
