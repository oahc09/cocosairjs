const gate = require('../../tools/verify/shaders-wave3-gate.cjs');
const oracle = require('../../tools/verify/shaders-liquid-metal-oracle.cjs');

function qualityRow() {
    const params = { ...oracle.defaults(), quality: 'low' };
    const state = {
        params,
        seed: params.seed,
        released: false,
        oneCanvas: 1,
        linearDiagnostic: false,
        background: [9, 10, 14],
        viewport: { width: 1280, height: 720 },
        dpr: 1,
        canvas: { width: 1280, height: 720, css: { width: 1280, height: 720 } },
        frame: 1,
        instance: 1,
        time: 0,
        paused: false,
    };
    return {
        profile: { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
        quality: 'low',
        tierStart: JSON.parse(JSON.stringify(state)),
        fixedStart: JSON.parse(JSON.stringify(state)),
        fixedEnd: { ...JSON.parse(JSON.stringify(state)), frame: 91, time: 1.5 },
    };
}

describe('Wave3 quality measurement state (NODE_CONTRACT)', () => {
    test('accepts a frozen actual-state contract', () => {
        expect(gate.validateLiquidQualityRow(qualityRow())).toEqual({ ok: true, errors: [] });
    });
    test.each([
        [
            'changed turbulence',
            (r: any) => {
                r.tierStart.params.turbulence = 0;
            },
        ],
        [
            'missing seed',
            (r: any) => {
                delete r.fixedStart.seed;
            },
        ],
        [
            'quality label',
            (r: any) => {
                r.quality = 'high';
            },
        ],
        [
            'parameter changed at end',
            (r: any) => {
                r.fixedEnd.params.warp = 0;
            },
        ],
        [
            'wrong backing',
            (r: any) => {
                r.tierStart.canvas.width = 1;
            },
        ],
        [
            'nonzero start time',
            (r: any) => {
                r.tierStart.time = 5;
            },
        ],
        [
            'NaN time',
            (r: any) => {
                r.fixedEnd.time = NaN;
            },
        ],
        [
            'no simulation progress',
            (r: any) => {
                r.fixedEnd.time = 0;
            },
        ],
        [
            'no frame progress',
            (r: any) => {
                r.fixedEnd.frame = 1;
            },
        ],
        [
            'paused',
            (r: any) => {
                r.fixedEnd.paused = true;
            },
        ],
        [
            'changed instance',
            (r: any) => {
                r.fixedEnd.instance = 2;
            },
        ],
        [
            'second canvas',
            (r: any) => {
                r.fixedStart.oneCanvas = 2;
            },
        ],
        [
            'released',
            (r: any) => {
                r.fixedStart.released = true;
            },
        ],
        [
            'missing state',
            (r: any) => {
                delete r.tierStart;
            },
        ],
    ])('rejects %s from the accepted baseline', (_name, mutate: any) => {
        const row = qualityRow();
        mutate(row);
        expect(gate.validateLiquidQualityRow(row).ok).toBe(false);
    });
    test.each([null, undefined, [], {}, 'row'])('rejects malformed quality row %# without throwing', (input) => {
        expect(() => gate.validateLiquidQualityRow(input)).not.toThrow();
        expect(gate.validateLiquidQualityRow(input).ok).toBe(false);
    });
    test('an E07 pass alone cannot unlock Wave4', () => {
        expect(gate.validateWave([{ task: 'Wave3/E07' }]).ok).toBe(false);
    });
    test('duplicate effects cannot supply E08/E09 coverage', () => {
        expect(
            gate.validateWave([{ task: 'Wave3/E07' }, { task: 'Wave3/E07' }, { task: 'Wave3/E09' }]).errors,
        ).toContain('exact E07/E08/E09 coverage required');
    });
    test.each([null, undefined, [], {}, { effects: [] }])('rejects incomplete Wave3 summary %#', (input) => {
        expect(() => gate.validateWaveReport(input)).not.toThrow();
        expect(gate.validateWaveReport(input).ok).toBe(false);
    });
});

describe('Wave3 complete trusted controls (NODE_CONTRACT)', () => {
    const types = ['parameter:turbulence', 'pause', 'resume', 'reset', 'release'];
    const good = () => ({ normal: { events: types.map((type) => ({ type, isTrusted: true })) } });
    test('accepts all five actual actions in order', () => {
        expect(gate.validateTrustedControls(good()).ok).toBe(true);
    });
    test.each([0, 1, 2, 3, 4])('rejects removal of action %i even if release remains', (index) => {
        const input = good();
        input.normal.events.splice(index, 1);
        expect(gate.validateTrustedControls(input).ok).toBe(false);
    });
});
