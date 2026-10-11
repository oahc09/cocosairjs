const gate = require('../../tools/verify/shaders-wave2-gate.cjs');

describe('Wave 2 observed error integrity (NODE_CONTRACT)', () => {
    test('accepts explicit empty page and console observations', () => {
        expect(gate.validateObservedErrors({ pageErrors: [], consoleErrors: [] })).toEqual({ ok: true, errors: [] });
    });
    test.each([
        null,
        undefined,
        'text',
        [],
        {},
        { pageErrors: [] },
        { consoleErrors: [] },
        { pageErrors: null, consoleErrors: [] },
        { pageErrors: [], consoleErrors: 'none' },
        { pageErrors: ['runtime failure'], consoleErrors: [] },
        { pageErrors: [], consoleErrors: ['compile failure'] },
    ])('rejects missing, invalid or nonempty observations %#', (input) => {
        const result = gate.validateObservedErrors(input);
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
    test('two passing effects cannot unlock the next Wave', () => {
        expect(gate.validateWave([{ task: 'Wave2/E04' }, { task: 'Wave2/E05' }]).ok).toBe(false);
    });
    test('duplicate effect gates cannot supply missing E03 coverage', () => {
        expect(
            gate.validateWave([{ task: 'Wave2/E04' }, { task: 'Wave2/E04' }, { task: 'Wave2/E05' }]).errors,
        ).toContain('exact E03/E04/E05 coverage required');
    });
    test.each([null, [], {}, { bindings: [] }])('gate structure is total %#', (input) => {
        expect(gate.validateGate(input).ok).toBe(false);
    });
    test('unknown effect has no implicit verification', () => {
        expect(gate.validateEffectReports('E99', {}, {}).ok).toBe(false);
    });
    test.each([null, undefined, 'report', [], {}, { effects: [] }, { effects: [{}, {}, {}] }])(
        'wave report structure rejects incomplete input without throwing %#',
        (input) => {
            expect(() => gate.validateWaveReport(input)).not.toThrow();
            expect(gate.validateWaveReport(input).ok).toBe(false);
        },
    );
});
