import { RenderTexture } from '../../src/cocos/asset/assets/render-texture';
import { deviceManager } from '../../src/cocos/gfx/device-manager';

describe('RenderTexture GPU size limits', () => {
    let device: any;
    beforeEach(() => {
        device = deviceManager.gfxDevice;
    });
    afterEach(() => {
        (deviceManager as any)._gfxDevice = device;
    });
    test.each([4096, 8192, 16384])('uses GPU limit %s instead of 2048', (maxTextureSize) => {
        (deviceManager as any)._gfxDevice = { capabilities: { maxTextureSize } };
        const texture = new RenderTexture();
        const window = { resize: jest.fn() };
        (texture as any)._window = window;
        texture.resize(maxTextureSize + 1, 3000.9);
        expect([texture.width, texture.height]).toEqual([maxTextureSize, 3000]);
        expect(texture.validate()).toBe(true);
        expect(window.resize).toHaveBeenCalledWith(maxTextureSize, 3000);
        (texture as any)._width = maxTextureSize + 1;
        expect(texture.validate()).toBe(false);
    });
    test.each([undefined, 0])('unknown GPU limit %s retains fallback and deserialization', (maxTextureSize) => {
        (deviceManager as any)._gfxDevice =
            maxTextureSize === undefined ? undefined : { capabilities: { maxTextureSize } };
        const texture = new RenderTexture();
        texture.resize(8192, -3);
        expect([texture.width, texture.height]).toEqual([2048, 1]);
        (texture as any)._width = 8192;
        expect(texture.validate()).toBe(true);
        (texture as any)._height = 0;
        expect(texture.validate()).toBe(false);
    });
});
