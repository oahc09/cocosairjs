import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import pngjs from 'pngjs';
import { inspectPng } from './agent-review.mjs';

const { PNG } = pngjs;
test('PNG smoke floor counts contrasting pixels, treats uniform frame as zero, and hashes original bytes', () => {
    const png = new PNG({ width: 2, height: 1 });
    const capture = () => {
        const bytes = PNG.sync.write(png);
        const frame = { png: 'data:image/png;base64,' + bytes.toString('base64'), width: 2, height: 1 };
        return { bytes, frame };
    };
    png.data.set([15, 15, 15, 255, 15, 15, 15, 255]);
    assert.equal(inspectPng(capture().frame, PNG).contrastPixels, 0);
    png.data[4] = 30;
    const { bytes, frame } = capture();
    const report = inspectPng(frame, PNG);
    assert.equal(report.contrastPixels, 1);
    assert.equal(report.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.throws(() => inspectPng({ ...frame, width: 1 }, PNG), { code: 'CAPTURE_INVALID' });
    assert.throws(() => inspectPng({ ...frame, height: 481 }, PNG), { code: 'CAPTURE_INVALID' });
});
