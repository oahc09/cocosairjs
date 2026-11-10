import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { reviewGrid } from './review-grid.mjs';
const frame = (width = 16, height = 12, color = 100) => {
    const png = new PNG({ width, height });
    png.data.fill(color);
    return { png: `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`, width, height, label: 'View' };
};
test('grid preserves pixel tiles, orders labels and omits source base64 from metadata', () => {
    const first = frame(16, 12, 90),
        second = frame(16, 12, 150);
    const result = reviewGrid({ ok: true, cameraRestored: true, frames: [first, second] });
    const grid = PNG.sync.read(Buffer.from(result.data, 'base64'));
    assert.equal(grid.width, 32);
    assert.equal(grid.height, 34);
    assert.equal(grid.data[22 * 32 * 4], 90);
    assert.equal(grid.data[(22 * 32 + 16) * 4], 150);
    assert.equal(result.metadata.cameraRestored, true);
    assert.ok(result.metadata.shots.every((s) => !('png' in s)));
});
test('grid rejects oversized IHDR before decode, invalid image, mismatched metadata and output budget', () => {
    const valid = frame();
    const oversized = Buffer.from(valid.png.split(',')[1], 'base64');
    oversized.writeUInt32BE(100000, 16);
    for (const bad of [
        { ...valid, png: `data:image/png;base64,${oversized.toString('base64')}` },
        { ...valid, width: 17 },
        { ...valid, png: 'data:image/png;base64,eA==' },
    ]) {
        assert.throws(() => reviewGrid({ ok: true, frames: [bad] }));
    }
    assert.throws(() => reviewGrid({ ok: true, frames: [] }));
    assert.throws(() => reviewGrid({ ok: true, frames: Array(5).fill(valid) }));
    assert.throws(() => reviewGrid({ ok: true, frames: [valid] }, 1));
});

test('repeated IHDR cannot override the checked dimensions', () => {
    const small = frame(1, 1);
    const large = frame(641, 1);
    const bytes = Buffer.concat([
        Buffer.from(small.png.split(',')[1], 'base64').subarray(0, 33),
        Buffer.from(large.png.split(',')[1], 'base64').subarray(8),
    ]);
    assert.throws(
        () =>
            reviewGrid({ ok: true, frames: [{ ...small, png: `data:image/png;base64,${bytes.toString('base64')}` }] }),
        /repeated PNG chunk: IHDR/,
    );
});

test('interlaced and non-RGBA input is rejected before decoding', () => {
    for (const [offset, value] of [
        [28, 1],
        [24, 16],
        [25, 2],
        [26, 1],
        [27, 1],
    ]) {
        const valid = frame();
        const bytes = Buffer.from(valid.png.split(',')[1], 'base64');
        bytes[offset] = value;
        // CRC is intentionally not repaired: the format guard must run before the decoder's CRC check.
        assert.throws(
            () =>
                reviewGrid({
                    ok: true,
                    frames: [{ ...valid, png: `data:image/png;base64,${bytes.toString('base64')}` }],
                }),
            /8-bit RGBA and non-interlaced/,
        );
    }
});

test('PNG chunk structure rejects missing, truncated, trailing and unexpected chunks', () => {
    const valid = frame();
    const bytes = Buffer.from(valid.png.split(',')[1], 'base64');
    const wrongLength = Buffer.from(bytes);
    wrongLength.writeUInt32BE(12, 8);
    const unknown = Buffer.from(bytes);
    unknown.write('tEXt', 37, 'ascii');
    for (const malformed of [
        wrongLength,
        unknown,
        bytes.subarray(0, 33),
        Buffer.concat([bytes.subarray(0, 33), bytes.subarray(-12)]),
        bytes.subarray(0, bytes.length - 1),
        Buffer.concat([bytes, Buffer.from([0])]),
    ]) {
        assert.throws(() =>
            reviewGrid({
                ok: true,
                frames: [{ ...valid, png: `data:image/png;base64,${malformed.toString('base64')}` }],
            }),
        );
    }
});
