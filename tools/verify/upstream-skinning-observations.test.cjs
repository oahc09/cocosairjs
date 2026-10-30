const assert = require('node:assert/strict');
const test = require('node:test');
const { validate } = require('./upstream-skinning-observations.cjs');
// These are validator unit inputs, NOT collected rendering results.
const state = (weight = 0, x = 0) => ({
    weight,
    bone: [x, 0, 0],
    containment: { sceneDiagonal: 1, tolerance: 1e-5, violations: [] },
});
const pixels = (colored) => ({ width: 480, height: 360, glError: 0, colored, sums: [1, 1, 1, 1] });
function fixture() {
    return {
        schema: 'upstream-skinning-browser-observations/1',
        diagnostics: [],
        results: ['RGB', 'RGBA'].map((color) => ({
            color,
            shared: { meshes: true, clips: true, texture: true },
            independent: [state(0.125, 0.25), state(0.375, 0.75), state(0.75, 1.5)],
            combined: pixels(100),
            frustum: [-1, 0, 1].flatMap((weight) =>
                [-8, 0, 8, 0].map((x) => ({
                    weight,
                    x,
                    expectedVisible: x === 0,
                    state: state(weight),
                    pixels: pixels(x === 0 ? 100 : 0),
                })),
            ),
            baselineModels: 3,
            cycles: Array.from({ length: 30 }, (_, cycle) => ({
                cycle,
                rootValid: false,
                passes: 0,
                refs: 3,
                models: 3,
                frames: [cycle * 2, cycle * 2 + 1],
            })),
            unchangedOtherInstances: [state(0.375, 0.75), state(0.75, 1.5)],
        })),
    };
}
test('accepts a complete synthetic validator unit input without asserting any browser ran', () => {
    assert.equal(validate(fixture()).validated, true);
});
for (const [name, mutate] of [
    ['missing RGBA', (r) => r.results.pop()],
    [
        'blank visible frame',
        (r) => {
            r.results[0].frustum[1].pixels.colored = 0;
        },
    ],
    [
        'outside-frame pixels',
        (r) => {
            r.results[0].frustum[0].pixels.colored = 30;
        },
    ],
    ['escaped morph vertex', (r) => r.results[0].independent[0].containment.violations.push({ vertex: 2 })],
    [
        'retained material pass',
        (r) => {
            r.results[0].cycles[29].passes = 1;
        },
    ],
    ['only 29 lifecycle cycles', (r) => r.results[0].cycles.pop()],
    [
        'cross-instance weight contamination',
        (r) => {
            r.results[0].unchangedOtherInstances[0].weight = 1;
        },
    ],
    [
        'same-frame settlement',
        (r) => {
            r.results[0].cycles[0].frames = [1, 1];
        },
    ],
]) {
    test(`rejects ${name}`, () => {
        const report = fixture();
        mutate(report);
        assert.throws(() => validate(report));
    });
}
