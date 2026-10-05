/** Flip Canvas2D rows for the examples' +90X native plane (visual top has v=1).
 * uploadData itself preserves byte order; Sprite's visual top has v=0 and needs top-first bytes.
 */
export function copyCanvasRows(image, target) {
    const stride = image.width * 4;
    if (target.length !== image.data.length) throw new Error('canvas texture buffer size mismatch');
    for (let y = 0; y < image.height; y++) {
        target.set(image.data.subarray(y * stride, (y + 1) * stride), (image.height - 1 - y) * stride);
    }
}
