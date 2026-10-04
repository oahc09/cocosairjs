const assert = require('node:assert/strict');
const { PNG } = require('pngjs');

// Decode actual screenshots outside the application page, without adding DOM,
// canvases, GL reads, or resource uploads to the renderer under observation.
exports.verifyScreenshotPixels = async (page, png, points) => {
    const image = PNG.sync.read(png), viewport = page.viewportSize();
    assert(viewport, 'explicit screenshot viewport required');
    const sampled = points.map((point) => {
        const x = Math.min(image.width - 1, Math.floor(point.click[0] * image.width / viewport.width));
        const y = Math.min(image.height - 1, Math.floor(point.click[1] * image.height / viewport.height));
        const offset = (y * image.width + x) * 4;
        return { id: point.id, position: [x, y], color: point.color, pixel: [...image.data.subarray(offset, offset + 4)] };
    });
    for (const point of sampled) {
        for (let channel = 0; channel < 3; channel++) {
            assert(point.color[channel] ? point.pixel[channel] > 220 : point.pixel[channel] < 35,
                point.id + ' presented screenshot color: ' + point.pixel);
        }
        assert.equal(point.pixel[3], 255, point.id + ' presented screenshot alpha');
    }
    return sampled;
};
