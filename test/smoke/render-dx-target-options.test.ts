import { createAirRenderTarget } from '../../src/air/rendering/render-target';
import { Material } from '../../src/cocos/asset/assets/material';
import { director } from '../../src/cocos/game/director';
import { API, Format, FormatFeatureBit, Type, deviceManager } from '../../src/cocos/gfx';
import { genHandle } from '../../src/cocos/render-scene/core/pass-utils';

// This suite tests CPU option/allocation contracts. The small native window/GL
// stand-ins do not establish actual GPU storage, rendering, or hardware fallback.
function simulatedDevice(colorSamples: number[] = [], depthSamples: number[] = colorSamples) {
    let draw: unknown = null;
    let read: unknown = null;
    const gl = {
        RGBA8: 32856,
        RGBA16F: 34842,
        RGBA32F: 34836,
        SRGB8_ALPHA8: 35907,
        DEPTH24_STENCIL8: 35056,
        RENDERBUFFER: 36161,
        SAMPLES: 32937,
        DRAW_FRAMEBUFFER_BINDING: 36006,
        READ_FRAMEBUFFER_BINDING: 36010,
        DRAW_FRAMEBUFFER: 36009,
        READ_FRAMEBUFFER: 36008,
        FRAMEBUFFER_COMPLETE: 36053,
        getInternalformatParameter: jest.fn(
            (_target: number, format: number) => new Int32Array(format === 35056 ? depthSamples : colorSamples),
        ),
        getParameter: jest.fn((parameter: number) => (parameter === 32937 ? 0 : parameter === 36006 ? draw : read)),
        bindFramebuffer: jest.fn((target: number, framebuffer: unknown) => {
            if (target === 36009) draw = framebuffer;
            if (target === 36008) read = framebuffer;
        }),
        checkFramebufferStatus: jest.fn(() => 36053),
    };
    const device = {
        gfxAPI: API.WEBGL2,
        gl,
        swapchainFormat: Format.RGBA8,
        capabilities: { maxTextureSize: 1024 },
        getFormatFeatures: jest.fn(
            () => FormatFeatureBit.RENDER_TARGET | FormatFeatureBit.SAMPLED_TEXTURE | FormatFeatureBit.LINEAR_FILTER,
        ),
        getGeneralBarrier: () => ({}),
        getSampler: (info: unknown) => ({ info }),
    };
    const createWindow = jest.fn((info: any) => {
        const texture = {
            width: info.width,
            height: info.height,
            format: info.renderPassInfo.colorAttachments[0].format,
            samples: 1,
        };
        const framebuffer = {
            colorTextures: [texture],
            depthStencilTexture: null,
            getGpuFramebuffer: () => ({ glFramebuffer: {} }),
        };
        return { framebuffer, destroy: jest.fn() };
    });
    const destroyWindow = jest.fn((window: any) => window.destroy());
    jest.spyOn(deviceManager, 'gfxDevice', 'get').mockReturnValue(device as never);
    const pipelineEvent = { on: jest.fn(), off: jest.fn() };
    jest.spyOn(director, 'root', 'get').mockReturnValue({
        device,
        createWindow,
        destroyWindow,
        pipelineEvent,
    } as never);
    return { device, gl, createWindow, destroyWindow };
}

describe('AirRenderTarget CPU option validation and explicit simulated fallback', () => {
    afterEach(() => jest.restoreAllMocks());

    test('explicit undefined options reject before native allocation', () => {
        const device = simulatedDevice();
        for (const name of ['colorFormat', 'depthFormat', 'samples', 'filter', 'scale', 'sampleFallback'])
            expect(() => createAirRenderTarget({ width: 64, height: 32, [name]: undefined } as any)).toThrow(
                /AIR_E_RENDER_TARGET_OPTION.*explicitly undefined/,
            );
        expect(device.createWindow).not.toHaveBeenCalled();
    });

    test('invalid format names and native numeric enum values reject before allocation', () => {
        const device = simulatedDevice();
        for (const colorFormat of ['rgba16', 'RGBA16F', Format.RGBA16F, 'toString'])
            expect(() => createAirRenderTarget({ width: 64, height: 32, colorFormat } as any)).toThrow(
                /AIR_E_RENDER_TARGET_FORMAT/,
            );
        expect(device.createWindow).not.toHaveBeenCalled();
    });

    test('invalid enum values and unknown option aliases reject before allocation', () => {
        const device = simulatedDevice();
        for (const options of [
            { samples: 3 },
            { depthFormat: 'depth32' },
            { filter: 'cubic' },
            { sampleFallback: 'silent' },
            { format: 'rgba16f' },
        ])
            expect(() => createAirRenderTarget({ width: 64, height: 32, ...options } as any)).toThrow(
                /AIR_E_RENDER_TARGET_OPTION/,
            );
        expect(device.createWindow).not.toHaveBeenCalled();
    });

    test('nonfinite/nonpositive sizes and scale reject before allocation', () => {
        const device = simulatedDevice();
        for (const value of [0, -1, NaN, Infinity]) {
            for (const key of ['width', 'height', 'scale'])
                expect(() => createAirRenderTarget({ width: 64, height: 32, [key]: value } as any)).toThrow(
                    /AIR_E_RENDER_TARGET_SIZE/,
                );
        }
        expect(device.createWindow).not.toHaveBeenCalled();
    });

    test('missing attachment/filter capabilities reject before allocation', () => {
        const device = simulatedDevice();
        device.device.getFormatFeatures.mockReturnValue(FormatFeatureBit.SAMPLED_TEXTURE);
        expect(() => createAirRenderTarget({ width: 64, height: 32, colorFormat: 'rgba16f' })).toThrow(
            /AIR_E_RENDER_TARGET_FORMAT/,
        );
        device.device.getFormatFeatures.mockReturnValue(
            FormatFeatureBit.SAMPLED_TEXTURE | FormatFeatureBit.RENDER_TARGET,
        );
        expect(() => createAirRenderTarget({ width: 64, height: 32, filter: 'linear' })).toThrow(
            /AIR_E_RENDER_TARGET_FILTER/,
        );
        expect(device.createWindow).not.toHaveBeenCalled();
    });

    test('strict samples require the intersection of color and depth support', () => {
        const device = simulatedDevice([4, 2], [2]);
        expect(() => createAirRenderTarget({ width: 64, height: 32, samples: 4 })).toThrow(
            /AIR_E_RENDER_TARGET_SAMPLES.*supported=1,2/,
        );
        expect(device.gl.getInternalformatParameter).toHaveBeenCalledTimes(2);
        expect(device.createWindow).not.toHaveBeenCalled();
    });

    test('explicit lower records requested 4 and simulated effective 1 without format replacement', () => {
        const device = simulatedDevice();
        const target = createAirRenderTarget({
            width: 64,
            height: 32,
            colorFormat: 'rgba16f',
            samples: 4,
            sampleFallback: 'lower',
        });
        try {
            expect(target.info.requested.samples).toBe(4);
            expect(target.info.effective).toMatchObject({ colorFormat: 'rgba16f', samples: 1 });
            expect(target.info.supportedSamples).toEqual([1]);
            expect(target.info.glSamples).toBe(0); // WebGL reports zero for a single-sample FBO.
            expect(target.info.resolveRequired).toBe(false);
            expect(target.texture.getGFXTexture()!.format).toBe(Format.RGBA16F);
            expect(device.createWindow).toHaveBeenCalledTimes(1);
            expect(device.createWindow.mock.calls[0][0].renderPassInfo.colorAttachments[0].sampleCount).toBe(1);
        } finally {
            target.dispose();
        }
    });

    test('rejected resize preserves the native target, generation, storage and material binding', () => {
        const device = simulatedDevice();
        const target = createAirRenderTarget({ width: 64, height: 32, samples: 4, sampleFallback: 'lower' });
        const material = new Material();
        const bindTexture = jest.fn();
        (material as any)._passes = [
            {
                propertyIndex: 0,
                getHandle: () => genHandle(1, Type.SAMPLER2D, 1),
                bindTexture,
                bindSampler: jest.fn(),
                resetTexture: jest.fn(),
            },
        ];
        (material as any)._props = [{ colorSource: null }];
        const unbind = target.bindColor(material, 'colorSource');
        const before = target.info;
        const nativeTarget = target.renderTexture;
        const texture = target.texture.getGFXTexture();
        try {
            for (const [width, height] of [
                [0, 32],
                [64, NaN],
                [1025, 32],
                [64, 1025],
            ]) {
                expect(() => target.resize(width, height)).toThrow(/AIR_E_RENDER_TARGET_SIZE/);
                expect(target.info).toEqual(before);
                expect(target.renderTexture).toBe(nativeTarget);
                expect(target.texture.getGFXTexture()).toBe(texture);
                expect(material.getProperty('colorSource')).toBe(target.texture);
            }
            expect(device.createWindow).toHaveBeenCalledTimes(1);
            expect(device.destroyWindow).not.toHaveBeenCalled();
            expect(bindTexture).toHaveBeenCalledTimes(1);
            expect(bindTexture.mock.calls[0][1]).toBe(texture);
        } finally {
            unbind();
            target.dispose();
        }
        expect(material.getProperty('colorSource')).toBeNull();
    });
    test('equal targets keep cameras/materials isolated through resize, DPR-sized inputs and recreation', () => {
        const device = simulatedDevice();
        const a = createAirRenderTarget({ width: 64, height: 32, depthFormat: 'none' });
        const b = createAirRenderTarget({ width: 64, height: 32, depthFormat: 'none' });
        const material = () => {
            const m = new Material();
            (m as any)._passes = [
                {
                    propertyIndex: 0,
                    getHandle: () => genHandle(1, Type.SAMPLER2D, 1),
                    bindTexture: jest.fn(),
                    bindSampler: jest.fn(),
                    resetTexture: jest.fn(),
                },
            ];
            (m as any)._props = [{ colorSource: null }];
            return m;
        };
        const ma = material(),
            mb = material();
        const ca = { targetTexture: null, camera: {}, isValid: true } as any;
        const cb = { targetTexture: null, camera: {}, isValid: true } as any;
        const da = a.attachCamera(ca),
            db = b.attachCamera(cb);
        a.bindColor(ma, 'colorSource');
        b.bindColor(mb, 'colorSource');
        const textureB = b.texture.getGFXTexture(),
            nativeB = b.renderTexture,
            before = a.info;
        expect(a.renderTexture).not.toBe(b.renderTexture);
        expect(a.texture.getGFXTexture()).not.toBe(textureB);
        a.resize(64, 32);
        expect(a.info.generation).toBe(before.generation);
        // The caller supplies actual target size after DPR changes; no hidden global DPR dependency.
        a.resize(128, 64);
        expect(a.info.generation).toBe(before.generation + 1);
        expect(ca.targetTexture).toBe(a.renderTexture);
        expect(cb.targetTexture).toBe(nativeB);
        expect(b.texture.getGFXTexture()).toBe(textureB);
        expect(ma.getProperty('colorSource')).toBe(a.texture);
        expect(mb.getProperty('colorSource')).toBe(b.texture);
        expect((ma.passes[0] as any).bindTexture).toHaveBeenLastCalledWith(1, a.texture.getGFXTexture(), undefined);
        a.dispose();
        a.dispose();
        da();
        expect(ca.targetTexture).toBeNull();
        expect(ma.getProperty('colorSource')).toBeNull();
        expect(cb.targetTexture).toBe(nativeB);
        expect(mb.getProperty('colorSource')).toBe(b.texture);
        expect(() => a.resize(64, 32)).toThrow(/AIR_E_RENDER_TARGET_DISPOSED/);
        const replacement = createAirRenderTarget({ width: 64, height: 32, depthFormat: 'none' });
        expect(replacement.texture.getGFXTexture()).not.toBe(textureB);
        expect(device.createWindow).toHaveBeenCalledTimes(4);
        replacement.dispose();
        db();
        b.dispose();
        expect(cb.targetTexture).toBeNull();
        expect(mb.getProperty('colorSource')).toBeNull();
    });
});
