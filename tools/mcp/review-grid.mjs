import { PNG } from 'pngjs';

const BAR = 22;
const digits = ['010111010010111', '110001010100111', '110001010001110', '101101111001001'];
export function reviewGrid(review, maxImageBytes = 1024 * 1024) {
    if (!review?.ok || !Array.isArray(review.frames) || review.frames.length < 1 || review.frames.length > 4) {
        throw new Error('Review must contain 1–4 successful frames.');
    }
    const frames = review.frames.map((frame) => {
        const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(frame.png ?? '');
        if (!match || match[1].length > Math.ceil(maxImageBytes / 3) * 4)
            throw new Error('Review PNG exceeds the input budget.');
        const bytes = Buffer.from(match[1], 'base64');
        // Restrict the decoder to the bounded, non-interlaced canvas PNG subset.
        // pngjs accepts repeated IHDR chunks and its interlaced inflater is unbounded.
        if (
            bytes.length > maxImageBytes ||
            bytes.length < 33 ||
            !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        )
            throw new Error('Invalid PNG header or input budget.');
        let offset = 8;
        let width, height;
        let sawData = false;
        let ended = false;
        while (offset < bytes.length) {
            if (bytes.length - offset < 12) throw new Error('Truncated PNG chunk.');
            const length = bytes.readUInt32BE(offset);
            const type = bytes.toString('latin1', offset + 4, offset + 8);
            if (length > bytes.length - offset - 12) throw new Error('Truncated PNG chunk data.');
            if (offset === 8) {
                if (type !== 'IHDR' || length !== 13) throw new Error('PNG must start with one 13-byte IHDR.');
                width = bytes.readUInt32BE(offset + 8);
                height = bytes.readUInt32BE(offset + 12);
                if (
                    width < 1 ||
                    height < 1 ||
                    width > 640 ||
                    height > 480 ||
                    width !== frame.width ||
                    height !== frame.height
                )
                    throw new Error('Review PNG dimensions must match metadata and fit 640×480.');
                if (
                    bytes[offset + 16] !== 8 ||
                    bytes[offset + 17] !== 6 ||
                    bytes[offset + 18] !== 0 ||
                    bytes[offset + 19] !== 0 ||
                    bytes[offset + 20] !== 0
                )
                    throw new Error('Review PNG must be 8-bit RGBA and non-interlaced.');
            } else if (type === 'IDAT') {
                sawData = true;
            } else if (type === 'IEND') {
                if (!sawData || length !== 0 || offset + 12 !== bytes.length)
                    throw new Error('PNG requires a final empty IEND after IDAT.');
                ended = true;
            } else {
                throw new Error('Unsupported or repeated PNG chunk: ' + type);
            }
            offset += length + 12;
        }
        if (!ended) throw new Error('PNG requires IDAT and final IEND.');
        const decoded = PNG.sync.read(bytes, { checkCRC: true });
        if (decoded.width !== width || decoded.height !== height || decoded.data.length !== width * height * 4)
            throw new Error('Decoded PNG differs from its validated dimensions.');
        return decoded;
    });
    const width = Math.max(...frames.map((f) => f.width));
    const height = Math.max(...frames.map((f) => f.height));
    const columns = Math.min(2, frames.length),
        rows = Math.ceil(frames.length / columns);
    const grid = new PNG({ width: columns * width, height: rows * (height + BAR) });
    for (let i = 0; i < grid.data.length; i += 4) {
        grid.data[i] = 24;
        grid.data[i + 1] = 28;
        grid.data[i + 2] = 36;
        grid.data[i + 3] = 255;
    }
    const metadata = review.frames.map(({ png, ...frame }, i) => {
        const x = (i % columns) * width,
            y = Math.floor(i / columns) * (height + BAR);
        PNG.bitblt(frames[i], grid, 0, 0, frames[i].width, frames[i].height, x, y + BAR);
        // Numeric keys remain readable without platform fonts; full user labels are in structured metadata.
        for (let row = 0; row < 5; row++)
            for (let col = 0; col < 3; col++) {
                if (digits[i][row * 3 + col] !== '1') continue;
                for (let dy = 0; dy < 3; dy++)
                    for (let dx = 0; dx < 3; dx++) {
                        const offset = ((y + 3 + row * 3 + dy) * grid.width + x + 8 + col * 3 + dx) * 4;
                        grid.data.fill(240, offset, offset + 3);
                    }
            }
        return { ...frame, tile: { x, y: y + BAR, width: frames[i].width, height: frames[i].height } };
    });
    const encoded = PNG.sync.write(grid);
    if (encoded.length > maxImageBytes) throw new Error('Review grid exceeds 1 MiB; request fewer views.');
    const { frames: ignored, ...summary } = review;
    return {
        metadata: { ...summary, width: grid.width, height: grid.height, shots: metadata },
        data: encoded.toString('base64'),
    };
}
