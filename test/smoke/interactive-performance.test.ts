const { stats } = require('../../tools/verify/interactive-performance.cjs');
describe('local performance raw-statistics contract', () => {
    test('percentiles use documented sorted lower-order statistic without mutating samples', () => {
        const values = [8, 0, 3, 2, 1];
        expect(stats(values)).toEqual({ count: 5, p50: 2, p95: 3, p99: 3, worst: 8, mean: 2.8 });
        expect(values).toEqual([8, 0, 3, 2, 1]);
    });
    test('one sample has one exact value at each percentile', () => {
        expect(stats([0.5])).toEqual({ count: 1, p50: 0.5, p95: 0.5, p99: 0.5, worst: 0.5, mean: 0.5 });
    });
    test.each([[[]], [[-1]], [[NaN]], [[Infinity]]])('invalid sample set is rejected: %p', (values) => {
        expect(() => stats(values)).toThrow('finite nonnegative');
    });
    test('large outlier remains in worst and mean rather than being silently removed', () => {
        const samples = Array(99).fill(1).concat([101]);
        expect(stats(samples).worst).toBe(101);
        expect(stats(samples).mean).toBe(2);
    });
});

const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
const { INPUTS, PILOT_BUDGET } = require('../../tools/verify/interactive-performance.cjs');
const { checkReport } = require('../../tools/verify/interactive-performance-audit.cjs');
const { fixture } = require('./interactive-performance-fixture.cjs');
describe('pilot identity and attribution gates (synthetic CPU only)', () => {
    let dir: string, report: any;
    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ier-perf-contract-'));
        report = fixture(dir, INPUTS, 'ier-performance-pilot/2');
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
    test('complete frozen contract remains LIMITED, with device acceptance NOT_RUN', () =>
        expect(checkReport(report)).toEqual({
            measurementValid: true,
            result: 'LIMITED',
            deviceAcceptance: 'NOT_RUN',
            errors: [],
        }));
    test('includes actual dynamic lifecycle and independent auditor inputs', () =>
        expect(INPUTS).toEqual(
            expect.arrayContaining([
                'examples/shared/asset-lifecycle.js',
                'examples/shared/asset-lifecycle.d.ts',
                'tools/verify/interactive-performance-audit.cjs',
            ]),
        ));
    test.each(['duplicate', 'missing', 'unknown', 'drift', 'budget', 'device', 'first-interval', 'tool', 'frame'])(
        'rejects %s corruption without treating it as a performance result',
        (name) => {
            const clone = JSON.parse(JSON.stringify(report));
            if (name === 'duplicate') clone.fingerprints[0] = clone.fingerprints[1];
            if (name === 'missing') clone.fingerprints.pop();
            if (name === 'unknown') clone.fingerprints[0].path = 'test/unknown-input';
            if (name === 'drift') clone.fingerprints[0].sha256 = '0'.repeat(64);
            if (name === 'budget') clone.budget.frameTimeBudget = '16.67ms alleged';
            if (name === 'device') clone.budget.device = 'unmeasured device';
            if (name === 'first-interval') clone.rows[0].raw[0].interval = 0;
            if (name === 'tool') clone.rows.find((r: any) => r.screenshots).toolSamples[0].operation = 'unknown';
            if (name === 'frame') clone.rows[0].raw[0].nativeFrame = 0;
            expect(checkReport(clone).measurementValid).toBe(false);
        },
    );
    test('pilot supplies no frame deadline or quality budget', () => {
        expect(PILOT_BUDGET.frameTimeBudget).toBe('NOT_PROVIDED');
        expect(PILOT_BUDGET.visibleQualityBudget).toBe('NOT_PROVIDED');
    });
});
