const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../../test/fixtures/upstream-depth-experiments/model.mjs');
const close = (a, b, tolerance = 1e-8) =>
    assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);
test('full normal/reverse projections map endpoints, preserve order, and invert in both clip conventions', async () => {
    const m = await load();
    for (const { near, far } of m.ranges)
        for (const mode of ['normal', 'reverse']) {
            const expected = mode === 'normal' ? [0, 1] : [1, 0];
            close(m.depthAt(near, near, far, mode), expected[0]);
            close(m.depthAt(far, near, far, mode), expected[1]);
            for (const clipMin of [-1, 0]) {
                const p = m.projection(near, far, mode, clipMin);
                for (const distance of [near, near * 2, Math.sqrt(near * far), far * 0.9, far]) {
                    const ndc = (-distance * p[10] + p[14]) / distance;
                    const depth = clipMin === -1 ? (ndc + 1) / 2 : ndc;
                    close(depth, m.depthAt(distance, near, far, mode), 1e-12);
                    close(m.reconstruct(Math.max(0, Math.min(1, depth)), near, far, mode), distance, 1e-8);
                }
            }
            const c = m.convention(mode);
            assert.equal(c.clear, mode === 'normal' ? 1 : 0);
            assert.equal(c.compare, mode === 'normal' ? 'LESS' : 'GREATER');
            assert.equal(c.reconstruction, mode);
        }
});
test('compare-only reversal is rejected by negative control, not called Reverse-Z', async () => {
    const m = await load();
    const near = m.depthAt(4, 1, 100),
        far = m.depthAt(20, 1, 100);
    assert.ok(near < far);
    assert.equal(near > 1, false, 'GREATER with unchanged clear=1 draws nothing');
    assert.equal(far > near, true, 'GREATER with clear=0 but normal projection selects the farther surface');
    close(m.reconstruct(near, 1, 100, 'normal'), 4);
    assert.ok(Math.abs(m.reconstruct(near, 1, 100, 'reverse') - 4) > 0.1);
});
test('quantization oracle separates analytic storage from GPU interpolation and clip precision', async () => {
    const m = await load();
    for (const format of m.formats)
        for (const depth of [0, 0.125, 0.5, 0.875, 1]) {
            assert.ok(Number.isFinite(m.quantizeDepth(depth, format)));
            close(m.quantizeDepth(depth, format), depth, format === 'depth16' ? 1 / 65535 : 1e-7);
        }
    const normal = m.quantizeDepth(m.depthAt(900000, 1, 1000000), 'depth32f');
    const reverse = m.quantizeDepth(m.depthAt(900000, 1, 1000000, 'reverse'), 'depth32f');
    assert.ok(
        Math.abs(m.reconstruct(reverse, 1, 1000000, 'reverse') - 900000) <
            Math.abs(m.reconstruct(normal, 1, 1000000) - 900000),
    );
    // This is a storage-only calculation. WebGL [-1,1] clip cancellation can erase that benefit.
    for (const { near, far } of m.ranges) assert.equal(m.pairs(near, far).length, 6);
});
test('unsupported choices fail explicitly instead of changing defaults or silently degrading', async () => {
    const m = await load();
    for (const value of [
        { backend: 'webgpu' },
        { format: 'depth24plus' },
        { mode: 'log' },
        { samples: 4 },
        { shadows: true },
        { pipeline: 'native-target', mode: 'reverse' },
        { pipeline: 'native-target', format: 'depth32f' },
        { unknown: true },
    ])
        assert.throws(() => m.validateExperiment(value), /UNSUPPORTED/);
    assert.throws(() => m.depthAt(1, 0, 100), /INVALID_NEAR_FAR/);
    assert.throws(() => m.depthAt(101, 1, 100), /DISTANCE/);
    assert.throws(() => m.reconstruct(NaN, 1, 100), /INVALID_DEPTH/);
    assert.equal(m.validateExperiment().mode, 'normal');
    assert.equal(m.decodeFloat([0, 0, 0, 63]), 0.5);
});
