declare var DecompressionStream: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
export async function decodePngLocally(bytes: Uint8Array): Promise<{ width: number; height: number; data: number[] }> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 8,
        width = 0,
        height = 0,
        bitDepth = 0,
        colorType = 0;
    const idat: Uint8Array[] = [];
    while (offset + 8 <= bytes.byteLength) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = view.getUint32(offset + 8);
            height = view.getUint32(offset + 12);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        offset += 12 + length;
    }
    if (bitDepth !== 8 || colorType !== 6) throw new Error('INPUTDISSOLVE_PNG_FORMAT');
    const compressed = new Uint8Array(idat.reduce((n, part) => n + part.length, 0));
    let at = 0;
    for (const part of idat) {
        compressed.set(part, at);
        at += part.length;
    }
    const blobStream = new Blob([
        compressed as unknown as BlobPart,
    ]).stream() as unknown as ReadableStream<Uint8Array> & {
        pipeThrough(t: TransformStream<Uint8Array, Uint8Array>): ReadableStream<Uint8Array>;
    };
    const inflated = new Uint8Array(
        await new Response(blobStream.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer(),
    );
    // Reverse per-row filters (bytesPerPixel = 4 for RGBA8).
    const bpp = 4,
        stride = width * bpp;
    const raw = new Uint8Array(height * stride);
    let src = 0;
    for (let y = 0; y < height; y++) {
        const filter = inflated[src++];
        const rowStart = y * stride;
        for (let x = 0; x < stride; x++) {
            const value = inflated[src++];
            const left = x >= bpp ? raw[rowStart + x - bpp] : 0;
            const up = y > 0 ? raw[rowStart - stride + x] : 0;
            const upLeft = y > 0 && x >= bpp ? raw[rowStart - stride + x - bpp] : 0;
            let out: number;
            switch (filter) {
                case 0:
                    out = value;
                    break;
                case 1:
                    out = value + left;
                    break;
                case 2:
                    out = value + up;
                    break;
                case 3:
                    out = value + ((left + up) >> 1);
                    break;
                case 4: {
                    const p = left + up - upLeft,
                        pa = Math.abs(p - left),
                        pb = Math.abs(p - up),
                        pc = Math.abs(p - upLeft);
                    out = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
                    break;
                }
                default:
                    throw new Error('INPUTDISSOLVE_PNG_FILTER');
            }
            raw[rowStart + x] = out & 0xff;
        }
    }
    return { width, height, data: Array.from(raw) };
}
export function premultipliedImage(data: readonly number[]): Uint8Array {
    const bytes = new Uint8Array(data.length);
    const decode = (x: number) => (x / 255 <= 0.04045 ? x / 255 / 12.92 : Math.pow((x / 255 + 0.055) / 1.055, 2.4));
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        for (let c = 0; c < 3; c++)
            bytes[i + c] = Math.round(Math.max(0, Math.min(1, decode(data[i + c]) * alpha)) * 255);
        bytes[i + 3] = data[i + 3];
    }
    return bytes;
}
