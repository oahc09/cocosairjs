import { equalAirOptions, normalizeAirOptions } from '../../src/air/app-config';

describe('PG-29 engine-free config normalization', () => {
    beforeEach(() => { document.body.innerHTML = '<canvas id="GameCanvas"></canvas>'; });
    test('default and explicit default options match, callbacks use identity', () => {
        const defaults = normalizeAirOptions({ canvas: '#GameCanvas' });
        expect(equalAirOptions(defaults, normalizeAirOptions({ canvas: document.querySelector('canvas')!,
            renderMode: 0, physics: 'builtin', diagnostics: 'errors', pixelRatioCap: 2, contextLoss: { autoPause: true } }))).toBe(true);
        const callback = () => {};
        const a = normalizeAirOptions({ canvas: '#GameCanvas', contextLoss: { onEvent: callback } });
        expect(equalAirOptions(a, normalizeAirOptions({ canvas: '#GameCanvas', contextLoss: { onEvent: callback } }))).toBe(true);
        expect(equalAirOptions(a, normalizeAirOptions({ canvas: '#GameCanvas', contextLoss: { onEvent: () => {} } }))).toBe(false);
    });
    test.each([0, -1, Infinity, NaN, '2'])('invalid density %p rejects before modifying DOM', (pixelRatioCap) => {
        const before = document.body.innerHTML;
        expect(() => normalizeAirOptions({ canvas: '#GameCanvas', pixelRatioCap: pixelRatioCap as number })).toThrow('AIR_E_PIXEL_RATIO_CAP');
        expect(document.body.innerHTML).toBe(before);
    });
    test('resolution is copied and frozen; native policy is validated', () => {
        const resolution = { width: 640, height: 480, policy: 0 };
        const config = normalizeAirOptions({ canvas: '#GameCanvas', designResolution: resolution });
        resolution.width = 1;
        expect(config.designResolution!.width).toBe(640); expect(Object.isFrozen(config.designResolution)).toBe(true);
        expect(() => normalizeAirOptions({ canvas: '#GameCanvas', designResolution: { width: 1, height: 1, policy: 99 } }))
            .toThrow('AIR_E_DESIGN_RESOLUTION');
    });
});
