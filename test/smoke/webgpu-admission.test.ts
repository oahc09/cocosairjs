import { normalizeAirOptions, equalAirOptions } from '../../src/air/app-config';

describe('explicit WebGPU admission', () => {
    beforeEach(() => {
        document.body.innerHTML = '<canvas id="gpu"></canvas>';
    });

    test('default stays WebGL2 even in a WebGPU-capable browser', () => {
        expect(normalizeAirOptions({ canvas: '#gpu' })).toMatchObject({ renderer: 'webgl2', renderMode: 2 });
        expect(normalizeAirOptions({ canvas: '#gpu', renderer: 'webgpu' })).toMatchObject({
            renderer: 'webgpu',
            renderMode: 4,
        });
        expect(normalizeAirOptions({ canvas: '#gpu', renderMode: 3 }).renderMode).toBe(3);
    });

    test('conflicting selectors and irrelevant translator options reject before initialization', () => {
        expect(() => normalizeAirOptions({ canvas: '#gpu', renderer: 'webgpu', renderMode: 2 })).toThrow(
            'AIR_E_RENDERER_CONFLICT',
        );
        expect(() => normalizeAirOptions({ canvas: '#gpu', webgpu: {} })).toThrow('AIR_E_WEBGPU_OPTIONS');
    });

    test('asset relocation participates in singleton identity', () => {
        const first = normalizeAirOptions({ canvas: '#gpu', renderer: 'webgpu', webgpu: { assetBaseUrl: '/first' } });
        const second = normalizeAirOptions({
            canvas: '#gpu',
            renderer: 'webgpu',
            webgpu: { assetBaseUrl: '/second/' },
        });
        expect(first.webgpuAssetBaseUrl).toBe(new URL('/first/', document.baseURI).href);
        expect(equalAirOptions(first, second)).toBe(false);
    });
});
