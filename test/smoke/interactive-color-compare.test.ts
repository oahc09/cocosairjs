const { differences } = require('../../tools/verify/interactive-color-compare-browser.cjs');
describe('frozen RGBA8 color comparison (synthetic arithmetic, not browser proof)', () => {
    test('identical capture has zero difference', () => {
        const pixels = Array(256 * 256 * 4).fill(0);
        expect(differences(pixels, pixels)).toEqual({ changed: 0, max: 0 });
    });
    test('two-channel-byte tolerance does not erase larger differences', () => {
        const a = Array(256 * 256 * 4).fill(0),
            b = [...a];
        b[0] = 2;
        b[4] = 3;
        expect(differences(a, b)).toEqual({ changed: 1, max: 3 });
    });
    test.each([NaN, Infinity, -1, 256, 1.5])('rejects invalid raw value %s', (v) => {
        const a = Array(256 * 256 * 4).fill(0),
            b = [...a];
        b[0] = v;
        expect(() => differences(a, b)).toThrow('complete RGBA8');
    });
    test('truncated capture cannot compare as equal', () =>
        expect(() => differences([0], [0])).toThrow('complete RGBA8'));
});

const {
    checkRow,
    checkReport,
    selectedEngines,
    DESIGN,
} = require('../../tools/verify/interactive-color-compare-browser.cjs');
describe('explicit selected color scope and complete native captures', () => {
    test('default requests all three browsers and single selection is explicit', () => {
        expect(selectedEngines()).toEqual(['chromium', 'firefox', 'webkit']);
        expect(selectedEngines('webkit')).toEqual(['webkit']);
        expect(() => selectedEngines('unknown')).toThrow('unknown browser');
    });
    test.each([{ engines: [] }, { engines: ['webkit', 'webkit'] }, { engines: ['unknown'] }])(
        'invalid engine list is rejected: %j',
        ({ engines }) => {
            expect(
                checkReport(
                    {
                        schemaVersion: 'ier-color-compare/2',
                        sourceStatus: 'recreated',
                        subset: true,
                        completed: false,
                        design: DESIGN,
                        engines,
                    },
                    { selected: true },
                ).errors,
            ).toContain('invalid requested browser matrix');
        },
    );
    test.each(['truncated', 'NaN', 'projection-size', 'projection-Infinity'])(
        'rejects malformed %s native capture before PNG acceptance',
        (kind) => {
            const states = ['plain', 'oblique', 'discard', 'alpha-base', 'alpha-instance'].map((mode) => ({
                mode,
                bytes: Array(256 * 256 * 4).fill(0),
                projection: Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)),
            }));
            if (kind === 'truncated') states[0].bytes.pop();
            if (kind === 'NaN') states[0].bytes[0] = NaN;
            if (kind === 'projection-size') states[0].projection.pop();
            if (kind === 'projection-Infinity') states[0].projection[0] = Infinity;
            const result = checkRow({ pageErrors: [], consoleErrors: [], states });
            expect(result.pass).toBe(false);
            expect(result.errors).toContain(
                kind.startsWith('projection')
                    ? 'finite 16-value native projection required'
                    : 'complete RGBA8 captures required',
            );
        },
    );
});
