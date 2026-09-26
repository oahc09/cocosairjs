/** Convert Canvas2D top-first rows to the bottom-first rows consumed by uploadData. */
export function copyCanvasRows(image, target) {
    const stride = image.width * 4;
    if (target.length !== image.data.length) throw new Error('canvas texture buffer size mismatch');
    for (let y = 0; y < image.height; y++) {
        target.set(image.data.subarray(y * stride, (y + 1) * stride), (image.height - 1 - y) * stride);
    }
}
