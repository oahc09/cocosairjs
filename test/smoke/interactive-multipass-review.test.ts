/** Lead 审查：合成结构只验证门槛，不能作为浏览器实证。无需 output/ 下的历史报告。 */
const {
    validateMatrix,
    validateLifecycle,
    validateNegatives,
} = require('../../tools/verify/interactive-multipass-browser.cjs');

function matrix() {
    return {
        mode: 'capture',
        matrix: {
            combos: ['rgba8', 'rgba16f'].flatMap((colorFormat) =>
                [1, 4].map((samples) => ({
                    colorFormat,
                    requestedSamples: samples,
                    effectiveSamples: samples,
                    glSamples: samples === 1 ? 0 : samples,
                    framebufferComplete: true,
                    resolveRequired: samples > 1,
                    readbackType: colorFormat === 'rgba8' ? 'Uint8Array' : 'Float32Array',
                    readbackLength: 4,
                    readbackValues: [0, 0, 0, 0],
                    ok: true,
                })),
            ),
        },
    };
}

describe('IER-02 Lead review: refuse false coverage and self-reported flags', () => {
    test('four skipped matrix allocations cannot pass the measured matrix', () => {
        const row: any = matrix();
        expect(validateMatrix(row)).toEqual([]);
        row.matrix.combos.forEach((c: any) => {
            c.notRun = true;
            c.reason = 'unavailable';
        });
        expect(validateMatrix(row).length).toBeGreaterThan(0);
    });
    test('four duplicates do not cover the four format/sample combinations', () => {
        const row = matrix();
        expect(validateMatrix(row)).toEqual([]);
        row.matrix.combos = Array(4).fill(row.matrix.combos[0]);
        expect(validateMatrix(row).length).toBeGreaterThan(0);
    });
    test('reported effective 4x must agree with the observed GL allocation', () => {
        const row = matrix();
        expect(validateMatrix(row)).toEqual([]);
        row.matrix.combos.find((c) => c.requestedSamples === 4)!.glSamples = 0;
        expect(validateMatrix(row).length).toBeGreaterThan(0);
    });
    test('resized flag cannot override a non-advancing generation', () => {
        const row = {
            mode: 'capture',
            lifecycle: {
                rounds: 10,
                textureDelta: 0,
                bufferDelta: 0,
                ownedRefs: [1],
                rows: Array.from({ length: 10 }, (_, round) => ({
                    round,
                    generationAfterCreate: 1,
                    generationAfterResize: 1,
                    resized: true,
                    disposed: true,
                })),
            },
        };
        expect(validateLifecycle(row).length).toBeGreaterThan(0);
    });
    test('native lifecycle must inspect the per-round destruction observations', () => {
        const row = {
            mode: 'native',
            lifecycle: {
                rounds: 10,
                textureDelta: 0,
                bufferDelta: 0,
                ownedRefs: [],
                rows: Array.from({ length: 10 }, (_, round) => ({ round, destroyed: false })),
            },
        };
        expect(validateLifecycle(row).length).toBeGreaterThan(0);
    });
    test('NO_ERROR is not a failing duplicate-binding observation', () => {
        const row = {
            mode: 'capture',
            negatives: {
                cases: [{ kind: 'duplicate-binding', actualError: 'NO_ERROR', located: 'binding', correctedOk: true }],
            },
        };
        expect(validateNegatives(row).length).toBeGreaterThan(0);
    });
    test('GL zero cannot prove a std140 failure even when correctedOk is true', () => {
        const row = {
            mode: 'native',
            negatives: {
                cases: [
                    {
                        kind: 'glsl-declaration-order',
                        actualError: 'undeclared identifier',
                        located: 'fragment',
                        correctedOk: true,
                    },
                    {
                        kind: 'std140-layout',
                        actualError: 'gl.getError()=0x0',
                        wrongGlError: 0,
                        okGlError: 0,
                        located: 'binding 0',
                        correctedOk: true,
                    },
                    {
                        kind: 'unbound-sampler',
                        actualError: 'gl.getError()=0x502',
                        missingGlError: 0x502,
                        fixedGlError: 0,
                        located: 'binding 1',
                        correctedOk: true,
                    },
                ],
            },
        };
        expect(validateNegatives(row).length).toBeGreaterThan(0);
    });
});

describe('IER-02 explicit selected browser scope', () => {
    const { validateReport, validateSelectedReport } = require('../../tools/verify/interactive-multipass-browser.cjs');
    test.each([['chromium'], ['webkit']])('single %s never passes the full-matrix header', (engine) => {
        const report = { schemaVersion: 'ier-multipass/2', engines: [engine], rows: [] };
        expect(validateReport(report).errors).toContain('invalid report header');
        expect(validateSelectedReport(report).ok).toBe(false);
        expect(validateSelectedReport(report).errors).not.toContain('invalid report header');
    });
    test.each([[], ['webkit', 'webkit'], ['unknown']])('invalid selection is rejected: %j', (...engines) => {
        // Jest spreads each row; preserve exactly that invalid selection.
        const report = { schemaVersion: 'ier-multipass/2', engines, rows: [] };
        expect(validateSelectedReport(report).ok).toBe(false);
    });
});
