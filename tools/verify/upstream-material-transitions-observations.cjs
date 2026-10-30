// Independent raw-pixel admission. This module never invokes the renderer under test.
const assert = require('node:assert/strict');
const iors = [1, 1.2, 1.3, 2.33334, 2.5];
function compare(a, b, tolerance = 2) {
    assert(Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.length > 0);
    let max = 0,
        different = 0;
    for (let i = 0; i < a.length; i++) {
        assert(
            Number.isInteger(a[i]) && a[i] >= 0 && a[i] <= 255 && Number.isInteger(b[i]) && b[i] >= 0 && b[i] <= 255,
            'RGBA8 bytes required',
        );
        const delta = Math.abs(a[i] - b[i]);
        max = Math.max(max, delta);
        if (delta > tolerance) different++;
    }
    return { max, different, withinTolerance: max <= tolerance };
}
function validate(report) {
    assert.equal(report?.schema, 'upstream-material-transitions/1');
    assert.equal(report.status, 'OBSERVED_NOT_VALIDATED');
    assert.equal(report.width, 96);
    assert.equal(report.height, 96);
    assert.equal(report.samples, 1);
    assert.equal(report.toleranceBytes, 2);
    assert.equal(report.roi, 'full RGBA8 target; no post-hoc edge exclusion');
    assert.equal(report.glError, 0);
    assert(typeof report.renderer === 'string' && report.renderer.length > 0);
    assert(/WebGL 2/.test(report.version));
    const count = 96 * 96 * 4;
    const pixels = (value) => {
        assert.equal(value?.length, count, 'complete fixed-size framebuffer required');
        compare(value, value);
        const rgb = new Set();
        for (let i = 0; i < value.length; i += 4) rgb.add(value[i] + ',' + value[i + 1] + ',' + value[i + 2]);
        assert(rgb.size > 8, 'blank or fixture-free framebuffer');
    };
    const expected = [false, true].flatMap((textured) =>
        iors.map((ior) => `${textured ? 'RG-textured' : 'constant'}/${ior}`),
    );
    assert.deepEqual(report.rows.map((r) => r.id).sort(), expected.sort(), 'exact mutation pair matrix required');
    const pairs = [];
    for (const row of report.rows) {
        assert.equal(row.id, `${row.textured ? 'RG-textured' : 'constant'}/${row.ior}`);
        for (const field of ['initialPixels', 'mutatedPixels', 'freshPixels']) pixels(row[field]);
        const same = compare(row.mutatedPixels, row.freshPixels);
        assert(same.withinTolerance, `${row.id}: mutation differs from independently rebuilt final document`);
        assert(
            compare(row.initialPixels, row.mutatedPixels).different > 128,
            `${row.id}: mutation had no visible effect`,
        );
        for (const field of ['albedo', 'uv0', 'uv1', 'iridescence']) {
            assert.equal(row.mutatedState[field]?.length, 4);
            assert.equal(row.freshState[field]?.length, 4);
            row.mutatedState[field].forEach((value, index) =>
                assert(
                    Number.isFinite(value) &&
                        Number.isFinite(row.freshState[field][index]) &&
                        Math.abs(value - row.freshState[field][index]) <= 1e-5,
                    `${row.id}/${field} state mismatch`,
                ),
            );
        }
        assert.deepEqual(row.mutatedState.iridescence, [0.95, row.ior, 80, 670]);
        pairs.push({ id: row.id, ...same });
    }
    assert.deepEqual(
        report.semantics.map((row) => row.id).sort(),
        [
            'linear-red-factor-green-thickness',
            'missing-texture-uses-maximum',
            'film-independent-of-volume-thickness',
        ].sort(),
    );
    for (const row of report.semantics) {
        pixels(row.leftPixels);
        pixels(row.rightPixels);
        assert(
            compare(row.leftPixels, row.rightPixels).withinTolerance,
            row.id + ': independent semantic reference mismatch',
        );
    }
    const oracle = report.semantics.find((row) => row.id === 'linear-red-factor-green-thickness').oracle;
    assert.deepEqual(oracle.rgba, [64, 192, 128, 255]);
    assert(
        Math.abs(oracle.factor - (0.8 * 64) / 255) < 1e-12 &&
            Math.abs(oracle.thickness - (80 + (590 * 192) / 255)) < 1e-12,
    );
    const restoration = report.restoration;
    for (const field of [
        'baselinePixels',
        'activePixels',
        'disabledPixels',
        'reenabledPixels',
        'destroyedPixels',
        'recreatedPixels',
    ])
        pixels(restoration[field]);
    const restored = ['disabledPixels', 'destroyedPixels'].map((field) => ({
        field,
        ...compare(restoration.baselinePixels, restoration[field]),
    }));
    const resumed = ['reenabledPixels', 'recreatedPixels'].map((field) => ({
        field,
        ...compare(restoration.activePixels, restoration[field]),
    }));
    assert(
        restored.concat(resumed).every((row) => row.withinTolerance),
        'capture lifecycle changed restored or rearmed image',
    );
    assert(
        compare(restoration.baselinePixels, restoration.activePixels).different > 128,
        'capture path never visibly affected the crystal',
    );
    for (const field of ['disabledBindings', 'destroyedBindings']) {
        assert(restoration[field]?.length > 0);
        restoration[field].forEach((row) =>
            assert.deepEqual(row, { layerRestored: true, textureRestored: true, infoRestored: true }),
        );
    }
    assert(/only one capture/.test(restoration.rejection));
    assert.deepEqual(
        report.checks.map((row) => row.name).sort(),
        [
            'capture-live-texture',
            'second-capture-rejected',
            'disable-restores-bindings',
            'destroy-restores-bindings',
        ].sort(),
    );
    assert(
        report.checks.every((row) => row.pass === true),
        'native binding/lifecycle checks failed',
    );
    return {
        validated: true,
        toleranceBytes: 2,
        pairs,
        restored,
        resumed,
        scope: 'U02 mutation/rebuild and U04 transmission lifecycle raw-pixel subset; not full plan/mobile/performance acceptance',
    };
}
module.exports = { compare, validate, iors };
