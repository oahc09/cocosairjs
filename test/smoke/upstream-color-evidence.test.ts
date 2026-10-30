// Synthetic reports below test the validator only. They are NOT GPU observations or acceptance evidence.
const { validateObservations } = require('../../tools/verify/upstream-color-observations.cjs');
const reference = require('../fixtures/upstream-color-contract/reference.cjs');
const frozen = require('../fixtures/upstream-color-contract/vectors.json');
function synthetic() {
    const pixels = (rgba: number[], count = 1) =>
        Array.from({ length: count }, () => rgba.map((v) => Math.round(reference.clamp(v) * 255))).flat();
    const engine = {
        renderer: 'synthetic-validator-only',
        version: 'WebGL 2.0 synthetic',
        glErrors: [],
        rows: [] as any[],
    };
    const isolated = { glErrors: [], highFloat: { precision: 23 }, rows: [] as any[] };
    for (const toneMapping of ['default', 'linear'])
        for (const vector of frozen.vectors)
            engine.rows.push({
                kind: 'native-output',
                id: `${toneMapping}/${vector.id}`,
                input: vector.rgba,
                toneMapping,
                pipelineMacros: { CC_USE_HDR: true, CC_TONE_MAPPING_TYPE: toneMapping === 'default' ? 0 : 1 },
                pixels: pixels(reference.output(vector.rgba, { toneMapping }), 16),
            });
    for (const mode of ['none', 'shader-srgb', 'hardware-srgb'])
        isolated.rows.push({
            kind: 'texture-decode',
            id: mode,
            mode,
            bytes: [128, 64, 192, 102],
            pixels: pixels(
                reference.decodeRGBA(
                    [128, 64, 192, 102].map((v) => v / 255),
                    mode,
                ),
            ),
        });
    for (const id of ['straight', 'premultiplied'])
        isolated.rows.push({
            kind: 'linear-blend',
            id,
            input: [0.2, 0.4, 0.6, 0.25],
            destination: [0.1, 0.2, 0.3, 0.8],
            pixels: pixels(reference.sourceOver([0.2, 0.4, 0.6, 0.25], [0.1, 0.2, 0.3, 0.8])),
        });
    for (const depth of [0.125, 0.5, 0.875])
        for (const [label, offset, bias] of [
            ['below', -(2 ** -20), 0],
            ['above', 2 ** -20, 0],
            ['bias', 2 ** -20, 2 ** -19],
        ] as const)
            isolated.rows.push({
                kind: 'depth24-compare',
                id: `${depth}/${label}`,
                depth,
                referenceDepth: depth + offset,
                bias,
                pixels: pixels([label === 'above' ? 0 : 1, depth, 0, 1]),
            });
    return {
        schemaVersion: 1,
        status: 'OBSERVED_NOT_VALIDATED',
        compositorEvidence: false,
        engine,
        isolated,
        submittedSources: [
            {
                source: '#version 300 es\nprecision highp float; uniform highp sampler2D sceneDepth; uniform vec2 compareParams;',
            },
            { source: '#version 300 es\nvec4 CCFragOutput; vec3 ACESToneMap;' },
        ],
    };
}
describe('U03 evidence validator fail-closed negative controls (synthetic CPU reports only)', () => {
    test('accepts complete synthetic data only as a validator unit test', () => {
        expect(validateObservations(synthetic()).status).toBe('PASS');
    });
    test.each([
        'missing-row',
        'duplicate-row',
        'wrong-pixel',
        'changed-input',
        'missing-renderer',
        'wrong-macro',
        'gl-error',
        'missing-source',
        'low-sampler',
        'compositor-claim',
        'nan-pixel',
    ])('%s cannot produce focused GPU PASS', (fault) => {
        const report = synthetic();
        switch (fault) {
            case 'missing-row':
                report.engine.rows.pop();
                break;
            case 'duplicate-row':
                report.engine.rows[1] = report.engine.rows[0];
                break;
            case 'wrong-pixel':
                report.engine.rows[0].pixels[0] = 255;
                break;
            case 'changed-input':
                report.engine.rows[0].input = [1, 0, 0, 1];
                break;
            case 'missing-renderer':
                report.engine.renderer = '';
                break;
            case 'wrong-macro':
                report.engine.rows[0].pipelineMacros.CC_TONE_MAPPING_TYPE = 1;
                break;
            case 'gl-error':
                (report.isolated.glErrors as number[]).push(1282);
                break;
            case 'missing-source':
                report.submittedSources = [];
                break;
            case 'low-sampler':
                report.submittedSources[0].source = report.submittedSources[0].source.replace(
                    'highp sampler2D',
                    'lowp sampler2D',
                );
                break;
            case 'compositor-claim':
                report.compositorEvidence = true;
                break;
            case 'nan-pixel':
                report.engine.rows[0].pixels[0] = NaN;
                break;
        }
        expect(validateObservations(report).status).toBe('FAIL');
    });
    test('missing entire sections fail without being misclassified as a successful empty subset', () => {
        expect(validateObservations({}).status).toBe('FAIL');
    });
});

export {};
