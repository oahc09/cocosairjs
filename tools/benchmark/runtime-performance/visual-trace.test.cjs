'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const { anchorName, captureCategory, makeSignature, analyze } = require('./visual-trace.cjs');

function image(kind, scale = 1) {
    const png = new PNG({ width: 160 * scale, height: 90 * scale });
    for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++) {
            const u = x / png.width,
                v = y / png.height;
            const cube = u >= 0.39 && u < 0.6 && v >= 0.3 && v < 0.7;
            const model = u >= 0.69 && u < 0.83 && v >= 0.3 && v < 0.63;
            const fill = kind === 'fill' || (kind !== 'clear' && cube);
            const rgb =
                kind === 'shell'
                    ? [250, 250, 250]
                    : kind === 'model' && model
                      ? [32, 225, 200]
                      : fill
                        ? [255, 128, 64]
                        : [56, 56, 56];
            png.data.set([...rgb, 255], 4 * (x + y * png.width));
        }
    return png;
}
const anchor = { name: anchorName, cat: 'blink.user_timing', ts: 100000 };
const cube = makeSignature(image('clear'), image('cube'), [0.27, 0.23, 0.66, 0.77]);
const model = makeSignature(image('cube'), image('model'), [0.63, 0.21, 0.91, 0.73]);
const frame = (ms, kind, isJpeg = false) => {
    const im = image(kind, isJpeg ? 1 : 2);
    const bytes = isJpeg ? jpeg.encode(im, 70).data : PNG.sync.write(im);
    return {
        name: 'Screenshot',
        cat: captureCategory,
        ts: anchor.ts + ms * 1000,
        args: { snapshot: bytes.toString('base64') },
    };
};

test('brackets first orange cube, not startup shell, using mixed snapshot encodings', () => {
    const r = analyze(
        [anchor, frame(-10, 'cube'), frame(4, 'shell'), frame(11, 'clear'), frame(30, 'cube', true)],
        cube,
    );
    assert.equal(r.status, 'bounded');
    assert.deepEqual(r.intervalMs, { lastAbsent: 11, firstPresent: 30, width: 19 });
    assert.equal(r.snapshots[0].state, 'unknown');
    assert.equal(r.displayPresentMs, null);
});
test('model delay and absence do not mistake the orange scene for the model', () => {
    const delayed = analyze([anchor, frame(14, 'cube'), frame(200, 'cube', true), frame(502, 'model', true)], model);
    assert.equal(delayed.status, 'bounded');
    assert.deepEqual(delayed.intervalMs, { lastAbsent: 200, firstPresent: 502, width: 302 });
    const absent = analyze([anchor, frame(14, 'cube'), frame(1100, 'cube')], model);
    assert.equal(absent.status, 'not-observed');
    assert.equal(absent.intervalMs.firstPresent, null);
});
test('fills, left censoring, missing captures and instability do not produce a usable interval', () => {
    assert.equal(analyze([anchor, frame(25, 'fill')], cube).status, 'not-observed');
    assert.equal(analyze([anchor, frame(25, 'cube')], cube).status, 'left-censored');
    assert.equal(analyze([anchor], cube).status, 'no-postmark-snapshots');
    assert.equal(analyze([anchor, frame(2, 'clear'), frame(25, 'cube'), frame(70, 'clear')], cube).status, 'unstable');
});
test('malformed payloads and ambiguous time axes fail closed', () => {
    assert.throws(() => analyze([anchor, anchor], cube), /ambiguous document mark/);
    assert.throws(() => analyze([anchor, frame(10, 'clear'), frame(10, 'cube')], cube), /ambiguous screenshot clock/);
    const f = frame(2, 'clear');
    f.args.snapshot = '%%%';
    assert.throws(() => analyze([anchor, f], cube), /Invalid screenshot payload/);
});

test('collector subscribes before navigation and drains completion, including overflow rejection', async () => {
    const { EventEmitter } = require('node:events');
    const { streamTrace } = require('./visual-trace-collect.cjs');
    class FakeCDP extends EventEmitter {
        calls = [];
        constructor(overflow) {
            super();
            this.overflow = overflow;
        }
        async send(cmd, args) {
            this.calls.push(cmd);
            if (cmd === 'Tracing.start') assert.ok(args.traceConfig.includedCategories.includes(captureCategory));
            else {
                this.emit('Tracing.dataCollected', { value: this.overflow ? Array(20001).fill(anchor) : [anchor] });
                this.emit('Tracing.tracingComplete', { dataLossOccurred: false });
            }
        }
    }
    const cdp = new FakeCDP(false);
    const result = await streamTrace(cdp, () => {
        assert.deepEqual(cdp.calls, ['Tracing.start']);
    });
    assert.deepEqual(cdp.calls, ['Tracing.start', 'Tracing.end']);
    assert.deepEqual(result, [anchor]);
    assert.equal(cdp.listenerCount('Tracing.dataCollected'), 0);
    await assert.rejects(
        streamTrace(new FakeCDP(true), () => {}),
        /exceeded bounds/,
    );
});
