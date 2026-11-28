const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { audit, identity, visualProbe, writeNew } = require('./evidence.cjs');
const { desktop } = require('./catalog.json');

function attempt() {
    return {
        caseId: 'S02',
        errors: [],
        marks: {
            bootstrapEntry: 2,
            moduleImportStart: 4,
            moduleImportEnd: 10,
            engineInitStart: 14,
            engineInitEnd: 35,
            sceneBuildStart: 35,
            sceneBuildEnd: 45,
            sceneActivateStart: 50,
            firstDrawEvent: 60,
            inputAt: 70,
            inputDrawEvent: 80,
            inputFrame: 2,
            rotation: 15,
            framebuffer: [1280, 720],
            antialias: false,
            dpr: 1,
        },
        bundleTiming: { decodedBodySize: 5 },
        bundleBytes: 5,
    };
}

test('diagnostic audit rejects missing stages, wrong workload and fabricated transport', () => {
    assert.equal(audit(attempt(), desktop), null);
    const a = attempt();
    a.marks.moduleImportStart = 12;
    assert.equal(audit(a, desktop), 'MISSING_OR_UNORDERED_MARK');
    const b = attempt();
    b.marks.framebuffer[0] = 640;
    assert.equal(audit(b, desktop), 'FRAMEBUFFER_MISMATCH');
    const c = attempt();
    c.marks.rotation = 0;
    assert.equal(audit(c, desktop), 'INPUT_EFFECT_MISSING');
    const d = attempt();
    d.bundleTiming.decodedBodySize = 0;
    assert.equal(audit(d, desktop), 'BUNDLE_TIMING_MISMATCH');
    const e = attempt();
    e.errors.push('context lost');
    assert.equal(audit(e, desktop), 'BROWSER_ERROR');
});

test('visual probe rejects white page, no interactive change and wrong displayed color', () => {
    const image = (left, rgb) => {
        const data = Buffer.alloc(1280 * 720 * 4, 56);
        if (left) {
            for (let y = 330; y < 390; y++) {
                for (let x = left; x < left + 80; x++) {
                    data.set(rgb, (y * 1280 + x) * 4);
                }
            }
        }
        return { width: 1280, height: 720, data };
    };
    const clear = image(0);
    const initial = image(600, [255, 128, 64]);
    const moved = image(610, [255, 128, 64]);
    assert.equal(visualProbe('S01', clear).ok, true);
    assert.equal(visualProbe('S01', initial).ok, false);
    assert.equal(visualProbe('S02', initial, moved).ok, true);
    assert.equal(visualProbe('S02', initial, initial).ok, false);
    assert.equal(visualProbe('S02', initial, image(610, [229, 157, 64])).ok, false);
});

test('identity and exclusive evidence writes preserve the original receipt', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-receipt-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'receipt.json');
    writeNew(file, { ok: true });
    assert.throws(() => writeNew(file, { ok: false }), { code: 'EEXIST' });
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).ok, true);
    const bytes = Buffer.from('cocosair'.repeat(300));
    const id = identity(bytes);
    assert.equal(id.rawBytes, bytes.length);
    assert.ok(id.gzipBytes < bytes.length && id.brBytes < bytes.length);
    assert.match(id.sha256, /^[0-9a-f]{64}$/);
});
