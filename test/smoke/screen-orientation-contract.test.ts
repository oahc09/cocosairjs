import { RenderWindow } from '../../src/cocos/render-scene/core/render-window';
import { Orientation } from '../../src/pal/screen-adapter/enum-type/orientation';
import { SurfaceTransform } from '../../src/cocos/gfx';
import { screenAdapter } from 'pal/screen-adapter';
import { createAirDiagnostics } from '../../src/air/diagnostics';

describe('native resize accepts orientation policy values', () => {
    afterEach(() => jest.restoreAllMocks());
    test.each([
        [Orientation.AUTO, SurfaceTransform.IDENTITY],
        [Orientation.LANDSCAPE, SurfaceTransform.IDENTITY],
        [Orientation.PORTRAIT, SurfaceTransform.IDENTITY],
        [Orientation.LANDSCAPE_RIGHT, SurfaceTransform.ROTATE_90],
        [Orientation.PORTRAIT_UPSIDE_DOWN, SurfaceTransform.ROTATE_180],
        [Orientation.LANDSCAPE_LEFT, SurfaceTransform.ROTATE_270],
    ])('orientation %i preserves resize and resolves transform %i without warnings', (orientation, transform) => {
        jest.spyOn(screenAdapter, 'orientation', 'get').mockReturnValue(orientation);
        const resize = jest.fn(), cameraResize = jest.fn(), native = new RenderWindow();
        Object.assign(native, { _swapchain: { width: 390, height: 844, resize }, _cameras: [{ resize: cameraResize }] });
        const diagnostics = createAirDiagnostics('warnings');
        try {
            native.resize(390, 844);
            expect(resize).toHaveBeenCalledWith(390, 844, transform);
            expect(cameraResize).toHaveBeenCalledWith(390, 844);
            expect(diagnostics.snapshot().some(m => m.message.includes('Unexpected screen orientation'))).toBe(false);
            expect(screenAdapter.orientation).toBe(orientation);
        } finally { diagnostics.destroy(); }
    });
    test('an actually unknown direction still warns and falls back to identity', () => {
        jest.spyOn(screenAdapter, 'orientation', 'get').mockReturnValue(99 as Orientation);
        const native = new RenderWindow(), resize = jest.fn();
        Object.assign(native, { _swapchain: { width: 1, height: 1, resize } });
        const diagnostics = createAirDiagnostics('warnings');
        try {
            native.resize(100, 100);
            expect(resize).toHaveBeenCalledWith(100, 100, SurfaceTransform.IDENTITY);
            expect(diagnostics.snapshot().filter(m => m.message.includes('Unexpected screen orientation: 99')).length).toBe(1);
        } finally { diagnostics.destroy(); }
    });
});
