const test = require('node:test');
const assert = require('node:assert/strict');
const { validateObservations } = require('./upstream-experiments-observations.cjs');
const { sourceAudit } = require('./upstream-experiments.cjs');
const bytes = (n) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, n, true);
    return [...b];
};
async function synthetic() {
    // Fabricated UNIT-TEST INPUT, not an execution report, browser evidence or persisted raw observation.
    const m = await import('../../test/fixtures/upstream-depth-experiments/model.mjs');
    return {
        schema: 'air-upstream-native-depth/1',
        status: 'OBSERVED_NOT_VALIDATED',
        compositorEvidence: false,
        performanceClaim: false,
        metadata: {
            backend: 'webgl2',
            version: 'WebGL 2 UNIT TEST ONLY',
            renderer: 'synthetic fixture, not real hardware',
        },
        requested: m.validateExperiment({ pipeline: 'native-target' }),
        glError: 0,
        allocated: {
            framebufferComplete: true,
            depthBits: 24,
            stencilBits: 8,
            componentType: 0x8c17,
            engineInternalFormat: 0x88f0,
        },
        submittedSources: [
            {
                stage: 0x8b30,
                source: '#version 300 es\nprecision highp float;\nprecision highp int;\nuniform highp sampler2D sceneDepth;\n',
            },
        ],
        rows: [
            [0.1, 100],
            [1, 1000],
            [10, 10000],
        ].flatMap(([near, far]) =>
            [near * 2, Math.sqrt(near * far), far * 0.5].map((distance) => {
                const d = Math.fround(m.depthAt(distance, near, far)),
                    r = Math.fround(m.reconstruct(d, near, far));
                return {
                    near,
                    far,
                    distance,
                    depthBytes: bytes(d),
                    depth: d,
                    reconstructedBytes: bytes(r),
                    reconstructed: r,
                    clearDepth: 1,
                    depthFunction: 1,
                    projection: m.projection(near, far),
                    comparisons: [
                        ['below', -(2 ** -18), 0, 255],
                        ['above', 2 ** -18, 0, 0],
                        ['bias', 2 ** -18, 2 ** -17, 255],
                    ].map(([label, offset, bias, result]) => ({
                        label,
                        referenceDepth: Math.fround(m.depthAt(distance, near, far) + offset),
                        bias,
                        pixels: [result, Math.round(d * 255), 0, 255],
                    })),
                };
            }),
        ),
    };
}
test('raw shape validator passes complete synthetic input but never promotes U08 acceptance', async () => {
    const result = await validateObservations(await synthetic());
    assert.equal(result.status, 'PASS', result.failures.join('\n'));
    assert.equal(result.acceptanceConclusion, 'BLOCKED');
});
test('missing rows, altered inputs, blank output, precision regression and fabricated formats fail closed', async () => {
    for (const mutate of [
        (p) => p.rows.pop(),
        (p) => p.rows.push(p.rows[0]),
        (p) => {
            p.rows[0].near = 2;
        },
        (p) => {
            p.rows[0].comparisons[0].pixels = [0, 0, 0, 0];
        },
        (p) => {
            p.rows[0].comparisons[0].bias = 0.1;
        },
        (p) => {
            p.rows[0].depthBytes = bytes(NaN);
        },
        (p) => {
            p.rows[0].clearDepth = 0;
        },
        (p) => {
            p.rows[0].projection[10] = 42;
        },
        (p) => {
            p.allocated.depthBits = 16;
        },
        (p) => {
            p.allocated.componentType = 0x1406;
        },
        (p) => {
            p.metadata.renderer = '';
        },
        (p) => {
            p.submittedSources[0].source = p.submittedSources[0].source.replace('highp sampler2D', 'mediump sampler2D');
        },
        (p) => {
            p.submittedSources[0].source = p.submittedSources[0].source.replace('precision highp int;', '');
        },
        (p) => {
            p.compositorEvidence = true;
        },
    ]) {
        const value = await synthetic();
        mutate(value);
        assert.equal((await validateObservations(value)).status, 'FAIL', mutate.toString());
    }
    assert.equal((await validateObservations(null)).status, 'FAIL');
});
test('source trace binds concrete defaults and sorted queue to current source bytes', () => {
    const result = sourceAudit();
    assert.equal(result.status, 'PASS', JSON.stringify(result.evidence.filter((row) => !row.found)));
    assert.equal(result.transparency.algorithm, 'priority-then-back-to-front-sorted-alpha-blending');
    assert.equal(result.transparency.searchHits.length, 0);
    assert.ok(result.evidence.every((row) => row.sha256.length === 64 && row.line > 0));
});
