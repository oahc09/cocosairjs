const { evaluateProbeRanges } = require('../../tools/verify/probe-ranges.cjs');

describe('independent probe numeric ranges', () => {
    test('uses inclusive boundaries including zero and resolves array components', () => {
        const probe = { pixel: [0, 156, 180], count: 256 };
        const results = evaluateProbeRanges(probe, {
            'pixel.0': { min: 0, max: 0 },
            'pixel.1': { min: 156 },
            'pixel.2': { max: 180 },
            count: { min: 256, max: 256 },
        });
        expect(results.every((r: any) => r.ok)).toBe(true);
        expect(evaluateProbeRanges(probe, { 'pixel.1': { min: 157 } })[0].ok).toBe(false);
        expect(evaluateProbeRanges(probe, { count: { max: 255 } })[0].ok).toBe(false);
    });
    test.each([undefined, null, NaN, Infinity, -Infinity, '156', true, new Number(156), [], {}])(
        'rejects a non-finite or non-number actual value: %s',
        (actual) => {
            expect(evaluateProbeRanges({ pixel: actual }, { pixel: { min: 150, max: 160 } })[0].ok).toBe(false);
        },
    );
    test('missing nested fields fail instead of becoming zero', () => {
        expect(evaluateProbeRanges({}, { 'pixel.center': { min: 0 } })[0].ok).toBe(false);
    });
    test.each([
        null,
        [],
        {},
        { min: '0' },
        { max: Infinity },
        { min: NaN },
        { min: 2, max: 1 },
        { minimum: 0 },
        { min: 0, tolerance: 10 },
    ])('rejects malformed bounds: %s', (bounds) => {
        expect(evaluateProbeRanges({ pixel: 156 }, { pixel: bounds })[0].ok).toBe(false);
    });
    test('optional absent range config has no assertions, explicit invalid config fails', () => {
        expect(evaluateProbeRanges({}, undefined)).toEqual([]);
        expect(evaluateProbeRanges({}, null)[0].ok).toBe(false);
        expect(evaluateProbeRanges({}, [])[0].ok).toBe(false);
        expect(evaluateProbeRanges({}, { '': { min: 0 } })[0].ok).toBe(false);
    });
});
