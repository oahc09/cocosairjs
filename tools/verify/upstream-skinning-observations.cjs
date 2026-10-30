/** Read-only validator for the real-browser U05 fixture. Synthetic unit rows are never browser evidence. */
const assert = require('node:assert/strict');

function validate(report) {
    assert.equal(report?.schema, 'upstream-skinning-browser-observations/1');
    assert.equal(report.results?.length, 2, 'both RGB and RGBA observations are required');
    assert.deepEqual(report.results.map((row) => row.color).sort(), ['RGB', 'RGBA']);
    assert(Array.isArray(report.diagnostics), 'retain runtime diagnostics');
    assert.equal(report.diagnostics.filter((entry) => entry.severity === 'error').length, 0, 'runtime errors');
    function state(row) {
        assert(Number.isFinite(row.weight), 'finite morph weight');
        assert(row.bone.length === 3 && row.bone.every(Number.isFinite), 'finite root bone');
        assert(Number.isFinite(row.containment.sceneDiagonal), 'finite oracle scene diagonal');
        assert.equal(row.containment.tolerance, 1e-5 * Math.max(1, row.containment.sceneDiagonal));
        assert.deepEqual(row.containment.violations, [], 'independent skinned vertex escaped world bounds');
    }
    function pixels(row) {
        assert.equal(row.glError, 0);
        assert(row.width > 0 && row.height > 0, 'real framebuffer dimensions');
        assert(Number.isInteger(row.colored) && row.colored >= 0 && row.colored <= row.width * row.height);
        assert(row.sums.length === 4 && row.sums.every(Number.isFinite));
    }
    for (const row of report.results) {
        assert.deepEqual(row.shared, { meshes: true, clips: true, texture: true });
        assert.equal(row.independent.length, 3);
        row.independent.forEach((entry, index) => {
            state(entry);
            assert(Math.abs(entry.weight - [0.125, 0.375, 0.75][index]) < 1e-5);
            assert(Math.abs(entry.bone[0] - [0.25, 0.75, 1.5][index]) < 1e-5);
        });
        pixels(row.combined);
        assert(row.combined.colored > 30, 'combined scene must visibly render');
        assert.equal(row.frustum.length, 12, 'three morph weights and four positions per weight');
        row.frustum.forEach((entry, index) => {
            assert.equal(entry.weight, [-1, 0, 1][Math.floor(index / 4)]);
            assert.equal(entry.x, [-8, 0, 8, 0][index % 4]);
            assert.equal(entry.expectedVisible, entry.x === 0);
            state(entry.state);
            assert.equal(entry.state.weight, entry.weight);
            pixels(entry.pixels);
            if (entry.expectedVisible) assert(entry.pixels.colored > 30, 'visible position must draw');
            else assert.equal(entry.pixels.colored, 0, 'outside-frustum position must not draw');
        });
        assert.equal(row.cycles.length, 30);
        assert.equal(row.baselineModels, 3);
        row.cycles.forEach((entry, index) => {
            assert.equal(entry.cycle, index);
            assert.equal(entry.rootValid, false);
            assert.equal(entry.passes, 0, 'renderer-owned passes must be destroyed');
            assert.equal(entry.refs, 3, 'live-instance reference baseline');
            assert.equal(entry.models, row.baselineModels);
            assert.equal(entry.frames.length, 2);
            assert(entry.frames.every(Number.isSafeInteger) && entry.frames[1] > entry.frames[0]);
        });
        assert.equal(row.unchangedOtherInstances.length, 2);
        row.unchangedOtherInstances.forEach((entry, index) => {
            state(entry);
            assert.equal(entry.weight, row.independent[index + 1].weight);
            assert.deepEqual(entry.bone, row.independent[index + 1].bone);
        });
    }
    return {
        validated: true,
        scope: 'U05 runtime observations only; screenshots, browser identity and provenance are separate requirements',
    };
}
module.exports = { validate };
if (require.main === module) {
    const input = process.argv.find((arg) => arg.startsWith('--input='))?.slice(8);
    assert(input, '--input=<retained-browser-observations.json> is required');
    console.log(JSON.stringify(validate(JSON.parse(require('node:fs').readFileSync(input, 'utf8'))), null, 2));
}
