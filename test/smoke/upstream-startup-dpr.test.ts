import { createAirApp, MaxDPR } from '../../src';
import { Screen } from '../../src/cocos/core/platform/screen';
import { settings, SettingsCategory } from '../../src/cocos/core/settings';
import { screenAdapter } from 'pal/screen-adapter';
import { airBootstrapRegistry } from '../../src/air/app-config';
import * as admission from '../../src/air/app-config';
import type { AirApp } from '../../src/air/app';

describe('upstream #367 Web screen startup DPR contract', () => {
    const globals = globalThis as any;
    const originalDPR = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    beforeAll(() => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
    });
    beforeEach(() => {
        delete globals[Symbol.for('cocosair.bootstrap.v1')];
        delete globals.__CC_CANVAS__;
        delete globals.__CCDPR_CAP__;
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 5 });
        settings.overrideSettings(SettingsCategory.SCREEN, 'maxDevicePixelRatio', undefined);
        settings.overrideSettings(SettingsCategory.RENDERING, 'renderMode', 3);
    });
    afterEach(() => {
        (screenAdapter as any).destroyLayoutObserver?.();
        settings.overrideSettings(SettingsCategory.SCREEN, 'maxDevicePixelRatio', undefined);
        delete globals.__CCDPR_CAP__;
        delete globals.__CC_CANVAS__;
        delete globals[Symbol.for('cocosair.bootstrap.v1')];
    });
    afterAll(() => {
        if (originalDPR) Object.defineProperty(window, 'devicePixelRatio', originalDPR);
    });

    test.each([
        [MaxDPR.Performance, 1],
        [MaxDPR.Balanced, 2],
        [MaxDPR.Quality, 4],
        [1.5, 1.5],
        [undefined, 2],
    ])('Screen.init applies setting %s through the generated Web PAL', (maximum, expected) => {
        settings.overrideSettings(SettingsCategory.SCREEN, 'maxDevicePixelRatio', maximum);
        new Screen().init();
        expect(screenAdapter.maxDevicePixelRatio).toBe(maximum ?? null);
        expect(screenAdapter.devicePixelRatio).toBe(expected);
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
        expect(screenAdapter.devicePixelRatio).toBe(1);
    });

    test.each([0, -1, 0.5, NaN, Infinity, '2'])(
        'invalid setting %s is rejected before startup admission and by PAL initialization',
        async (maximum) => {
            settings.overrideSettings(SettingsCategory.SCREEN, 'maxDevicePixelRatio', maximum);
            await expect(createAirApp({ canvas: '#GameCanvas', renderMode: 3 })).rejects.toBeInstanceOf(RangeError);
            expect(airBootstrapRegistry().status).toBe('idle');
            expect(globals.__CCDPR_CAP__).toBeUndefined();
            expect(() => new Screen().init()).toThrow(RangeError);
        },
    );

    test.each([
        [4, undefined, 4],
        [4, 3, 3],
        [4, 0.75, 0.75],
        [undefined, undefined, 2],
    ])(
        'AIR admission resolves setting %s and explicit cap %s to %s before initialization',
        async (maximum, explicit, expected) => {
            settings.overrideSettings(SettingsCategory.SCREEN, 'maxDevicePixelRatio', maximum);
            // Replace only the expensive engine bootstrap. Real createAirApp admission and
            // Screen/PAL initialization run, proving the cap is available before frame sizing.
            const initialize = jest.fn(async (options) => {
                expect(options.pixelRatioCap).toBe(expected);
                expect(globals.__CCDPR_CAP__).toBe(expected);
                new Screen().init();
                expect(screenAdapter.devicePixelRatio).toBe(expected);
                return {} as AirApp;
            });
            const request = admission.requestAirApp;
            const boundary = jest
                .spyOn(admission, 'requestAirApp')
                .mockImplementation((options) => request(options, () => initialize));
            try {
                await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: explicit, renderMode: 3 });
                expect(initialize).toHaveBeenCalledTimes(1);
            } finally {
                boundary.mockRestore();
            }
        },
    );
});
