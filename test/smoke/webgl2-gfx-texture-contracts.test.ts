import {
    BufferTextureCopy,
    Format,
    TextureInfo,
    TextureType,
    TextureUsageBit,
    TextureViewInfo,
} from '../../src/cocos/gfx/base/define';
import { WebGL2Texture } from '../../src/cocos/gfx/webgl2/webgl2-texture';
import { WebGL2DeviceManager } from '../../src/cocos/gfx/webgl2/webgl2-define';
import { WebGL2Framebuffer } from '../../src/cocos/gfx/webgl2/webgl2-framebuffer';
import {
    WebGL2CmdFuncCreateTexture,
    WebGL2CmdFuncDestroyTexture,
    WebGL2CmdFuncResizeTexture,
} from '../../src/cocos/gfx/webgl2/webgl2-commands';

jest.mock('../../src/cocos/gfx/webgl2/webgl2-commands', () => ({
    WebGL2CmdFuncCreateTexture: jest.fn(),
    WebGL2CmdFuncDestroyTexture: jest.fn(),
    WebGL2CmdFuncResizeTexture: jest.fn(),
    WebGL2CmdFuncCreateFramebuffer: jest.fn(),
    WebGL2CmdFuncDestroyFramebuffer: jest.fn(),
}));

function createTexture(type = TextureType.TEX2D_ARRAY, levels = 3): WebGL2Texture {
    const info = new TextureInfo();
    info.type = type;
    info.format = Format.RGBA8;
    info.usage = TextureUsageBit.COLOR_ATTACHMENT | TextureUsageBit.SAMPLED;
    info.width = 16;
    info.height = 16;
    info.levelCount = levels;
    info.layerCount = type === TextureType.CUBE ? 6 : type === TextureType.TEX2D_ARRAY ? 4 : 1;
    info.depth = type === TextureType.TEX3D ? 8 : 1;
    const texture = new WebGL2Texture();
    texture.initialize(info);
    return texture;
}

function createView(texture: WebGL2Texture, baseLevel = 0, baseLayer = 0, layers = 1): WebGL2Texture {
    const info = new TextureViewInfo(texture, texture.type, texture.format, baseLevel, 1, baseLayer, layers);
    const view = new WebGL2Texture();
    view.initialize(info);
    return view;
}

describe('WebGL2 texture view ownership and range contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        WebGL2DeviceManager.setInstance({ memoryStatus: { textureSize: 0 } } as any);
    });

    it('preserves explicit mip and layer ranges without allocating a second resource', () => {
        const texture = createTexture();
        const view = createView(texture, 1, 2, 2);
        expect(view.gpuTexture).toBe(texture.gpuTexture);
        expect(view.gpuTextureView).toMatchObject({ baseLevel: 1, levelCount: 1, baseLayer: 2, layerCount: 2 });
        expect(WebGL2CmdFuncCreateTexture).toHaveBeenCalledTimes(1);
    });

    it('keeps layer zero distinct from other selected layers', () => {
        const texture = createTexture();
        expect(createView(texture, 0, 0).gpuTextureView).toMatchObject({ baseLayer: 0, layerCount: 1 });
        expect(createView(texture, 0, 3).gpuTextureView).toMatchObject({ baseLayer: 3, layerCount: 1 });
    });

    it('describes all array layers and mip levels in the default resource view', () => {
        expect(createTexture().gpuTextureView).toMatchObject({
            baseLevel: 0,
            levelCount: 3,
            baseLayer: 0,
            layerCount: 4,
        });
    });

    it('retains the six-face cube sampling view', () => {
        const texture = createTexture(TextureType.CUBE);
        const info = new TextureViewInfo(texture, TextureType.CUBE, Format.RGBA8, 0, 3, 0, 6);
        const view = new WebGL2Texture();
        view.initialize(info);
        expect(view.gpuTextureView).toMatchObject({ levelCount: 3, baseLayer: 0, layerCount: 6 });
    });

    it.each([
        ['negative mip', -1, 1, 0, 1],
        ['fractional mip', 0.5, 1, 0, 1],
        ['empty mip range', 0, 0, 0, 1],
        ['mip overflow', 2, 2, 0, 1],
        ['negative layer', 0, 1, -1, 1],
        ['fractional layer', 0, 1, 0.5, 1],
        ['empty layer range', 0, 1, 0, 0],
        ['layer overflow', 0, 1, 3, 2],
        ['nonfinite layer', 0, 1, Infinity, 1],
    ])('rejects %s before allocating a GPU object', (_name, baseLevel, levelCount, baseLayer, layerCount) => {
        const texture = createTexture();
        const info = new TextureViewInfo(
            texture,
            texture.type,
            texture.format,
            baseLevel,
            levelCount,
            baseLayer,
            layerCount,
        );
        expect(() => new WebGL2Texture().initialize(info)).toThrow();
        expect(WebGL2CmdFuncCreateTexture).toHaveBeenCalledTimes(1);
    });

    it('rejects format reinterpretation instead of exposing an incompatible attachment', () => {
        const texture = createTexture();
        const info = new TextureViewInfo(texture, texture.type, Format.RGBA32UI);
        expect(() => new WebGL2Texture().initialize(info)).toThrow();
    });

    it('validates 3D slice ranges at their selected mip', () => {
        const texture = createTexture(TextureType.TEX3D);
        expect(createView(texture, 1, 3).gpuTextureView).toMatchObject({ baseLevel: 1, baseLayer: 3 });
        expect(() => createView(texture, 1, 4)).toThrow();
    });

    it('invalidates a destroyed view without destroying the shared texture', () => {
        const texture = createTexture();
        const view = createView(texture, 1, 1);
        const resource = texture.gpuTexture;
        view.destroy();
        expect(WebGL2CmdFuncDestroyTexture).not.toHaveBeenCalled();
        expect(view.gpuTexture).toBeNull();
        expect(view.gpuTextureView).toBeNull();
        expect(texture.gpuTexture).toBe(resource);
    });

    it('invalidates the owning wrapper and makes repeated destruction harmless', () => {
        const texture = createTexture();
        texture.destroy();
        texture.destroy();
        expect(texture.gpuTexture).toBeNull();
        expect(texture.gpuTextureView).toBeNull();
        expect(WebGL2CmdFuncDestroyTexture).toHaveBeenCalledTimes(1);
        expect(WebGL2DeviceManager.instance.memoryStatus.textureSize).toBe(0);
    });

    it('updates resource and default-view mip metadata after resize while preserving explicit requests', () => {
        const texture = createTexture(TextureType.TEX2D, 4);
        const view = createView(texture, 3);
        texture.resize(4, 4);
        expect(texture.gpuTexture.mipLevel).toBe(texture.levelCount);
        expect(texture.gpuTextureView.levelCount).toBe(texture.levelCount);
        expect(view.gpuTextureView.baseLevel).toBe(3);
        expect(view.gpuTextureView.gpuTexture.mipLevel).toBe(texture.levelCount);
        expect(WebGL2CmdFuncResizeTexture).toHaveBeenCalledTimes(1);
    });

    it('rejects resizing a view before changing the owning resource or metadata', () => {
        const texture = createTexture();
        const view = createView(texture, 1, 1);
        expect(() => view.resize(8, 8)).toThrow();
        expect(texture.width).toBe(16);
        expect(view.width).toBe(16);
        expect(WebGL2CmdFuncResizeTexture).not.toHaveBeenCalled();
    });

    it('keeps a valid base mip when an owning mipmapped resource shrinks to one pixel', () => {
        const texture = createTexture(TextureType.TEX2D);
        texture.resize(1, 1);
        expect(texture.levelCount).toBe(1);
        expect(texture.gpuTexture.mipLevel).toBe(1);
        expect(texture.gpuTextureView.levelCount).toBe(1);
    });

    it('computes public and GPU framebuffer dimensions from every selected mip attachment', () => {
        const first = createView(createTexture(), 1);
        const second = createView(createTexture(), 2);
        const depth = createView(createTexture(), 0);
        const framebuffer = new WebGL2Framebuffer();
        framebuffer.initialize({
            renderPass: { getGpuRenderPass: () => ({}) },
            colorTextures: [first, second],
            depthStencilTexture: depth,
        } as any);
        expect(framebuffer.width).toBe(4);
        expect(framebuffer.height).toBe(4);
        expect(framebuffer.getGpuFramebuffer().width).toBe(4);
        expect(framebuffer.getGpuFramebuffer().height).toBe(4);
    });

    it('recalculates selected attachment dimensions after resource resize', () => {
        const texture = createTexture(TextureType.TEX2D);
        const view = createView(texture, 1);
        const framebuffer = new WebGL2Framebuffer();
        framebuffer.initialize({
            renderPass: { getGpuRenderPass: () => ({}) },
            colorTextures: [view],
            depthStencilTexture: null,
        } as any);
        expect(framebuffer.width).toBe(8);
        texture.resize(8, 8);
        expect(framebuffer.width).toBe(4);
        expect(framebuffer.height).toBe(4);
    });

    it('detects renderbuffer replacement for framebuffer rebuilds', () => {
        const texture = createTexture(TextureType.TEX2D);
        texture.gpuTexture.glRenderbuffer = {};
        const framebuffer = new WebGL2Framebuffer();
        framebuffer.initialize({
            renderPass: { getGpuRenderPass: () => ({}) },
            colorTextures: [texture],
            depthStencilTexture: null,
        } as any);
        expect(framebuffer.needRebuild).toBe(false);
        texture.gpuTexture.glRenderbuffer = {};
        expect(framebuffer.needRebuild).toBe(true);
    });
});

describe('WebGL2 readback native output layout', () => {
    const copy = (...args: any[]): void => {
        const commands = jest.requireActual('../../src/cocos/gfx/webgl2/webgl2-commands');
        commands.WebGL2CmdFuncCopyTextureToBuffers(...args);
    };

    function harness(format: Format, values: number[]): { device: any; view: any; gl: any; cache: any } {
        const readFramebuffer = {};
        const drawFramebuffer = {};
        const cache = {
            glReadFramebuffer: readFramebuffer,
            glFramebuffer: drawFramebuffer,
            viewport: { left: 0, top: 0, width: 2, height: 2 },
            scissorRect: { x: 0, y: 0, width: 2, height: 2 },
        };
        const gl = {
            createFramebuffer: jest.fn(() => ({})),
            deleteFramebuffer: jest.fn(),
            bindFramebuffer: jest.fn(),
            framebufferTexture2D: jest.fn(),
            framebufferTextureLayer: jest.fn(),
            checkFramebufferStatus: jest.fn(() => 0x8cd5),
            readBuffer: jest.fn(),
            drawBuffers: jest.fn(),
            pixelStorei: jest.fn(),
            bindBuffer: jest.fn(),
            getError: jest.fn(() => 0),
            getParameter: jest.fn((key) => {
                if (key === 0x8caa) return readFramebuffer;
                if (key === 0x8ca6) return drawFramebuffer;
                if (key === 0x0d05) return 4;
                if (key === 0x88ed) return null;
                return 0;
            }),
            readPixels: jest.fn((...args) => {
                const output = args.find((value) => ArrayBuffer.isView(value)) as any;
                output.set(values);
            }),
        };
        const gpuTexture = {
            type: TextureType.TEX2D,
            format,
            width: 2,
            height: 2,
            depth: 1,
            arrayLayer: 1,
            mipLevel: 1,
            samples: 1,
            glTarget: 0x0de1,
            glTexture: {},
            glRenderbuffer: null,
            glFormat: format === Format.RGBA8 ? 0x1908 : 0x8d99,
            glType: format === Format.RGBA8 ? 0x1401 : 0x1405,
        };
        const view = {
            gpuTexture,
            type: gpuTexture.type,
            format,
            baseLevel: 0,
            levelCount: 1,
            baseLayer: 0,
            layerCount: 1,
        };
        return { device: { gl, getStateCache: () => cache }, view, gl, cache };
    }

    function region(width = 1, height = 1): BufferTextureCopy {
        const value = new BufferTextureCopy();
        value.texExtent.width = width;
        value.texExtent.height = height;
        value.texExtent.depth = 1;
        return value;
    }

    it('narrows guaranteed RGBA integer readback to native R8UI bytes', () => {
        const { device, view } = harness(Format.R8UI, [255, 0, 0, 1]);
        const output = new Uint8Array(1);
        copy(device, view, [output], [region()]);
        expect(Array.from(output)).toEqual([255]);
    });

    it('keeps R32UI integer precision beyond float32 and preserves target byte offsets', () => {
        const { device, view } = harness(Format.R32UI, [16777217, 0, 0, 1]);
        const backing = new Uint32Array([0xdeadbeef, 0xdeadbeef, 0xdeadbeef, 0xdeadbeef]);
        const output = new Uint32Array(backing.buffer, 4, 2);
        const request = region();
        request.buffOffset = 4;
        copy(device, view, [output], [request]);
        expect(Array.from(backing)).toEqual([0xdeadbeef, 0xdeadbeef, 16777217, 0xdeadbeef]);
    });

    it('converts legal floating readback to native RGBA16F half words', () => {
        const { device, view } = harness(Format.RGBA16F, [0, 0.5, 1, -2]);
        const output = new Uint16Array(4);
        copy(device, view, [output], [region()]);
        expect(Array.from(output)).toEqual([0x0000, 0x3800, 0x3c00, 0xc000]);
    });

    it('keeps padded native rows and surrounding sentinels untouched', () => {
        const { device, view } = harness(Format.R8UI, [7, 0, 0, 1, 9, 0, 0, 1]);
        const output = new Uint8Array(8).fill(0xa5);
        const request = region(1, 2);
        request.buffOffset = 1;
        request.buffStride = 3;
        request.buffTexHeight = 4;
        copy(device, view, [output], [request]);
        expect(Array.from(output)).toEqual([0xa5, 7, 0xa5, 0xa5, 9, 0xa5, 0xa5, 0xa5]);
    });

    it('prechecks all region capacities before mutating any output', () => {
        const { device, view, gl } = harness(Format.R32UI, [11, 0, 0, 1]);
        const first = new Uint32Array([0xdeadbeef]);
        const second = new Uint8Array(3).fill(0xa5);
        expect(() => copy(device, view, [first, second], [region(), region()])).toThrow();
        expect(first[0]).toBe(0xdeadbeef);
        expect(Array.from(second)).toEqual([0xa5, 0xa5, 0xa5]);
        expect(gl.readPixels).not.toHaveBeenCalled();
    });

    it('restores framebuffer bindings and deletes the temporary FBO after readPixels throws', () => {
        const { device, view, gl, cache } = harness(Format.R32UI, [11, 0, 0, 1]);
        const originalRead = cache.glReadFramebuffer;
        const originalDraw = cache.glFramebuffer;
        gl.readPixels.mockImplementation(() => {
            throw new Error('injected readPixels failure');
        });
        const output = new Uint32Array([0xdeadbeef]);
        expect(() => copy(device, view, [output], [region()])).toThrow('injected readPixels failure');
        expect(gl.bindFramebuffer).toHaveBeenCalledWith(0x8ca8, originalRead);
        expect(cache.glReadFramebuffer).toBe(originalRead);
        expect(cache.glFramebuffer).toBe(originalDraw);
        expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
        expect(output[0]).toBe(0xdeadbeef);
    });

    it('rejects an incomplete temporary attachment and still releases its framebuffer', () => {
        const { device, view, gl } = harness(Format.R8UI, [11, 0, 0, 1]);
        gl.checkFramebufferStatus.mockReturnValue(0x8cd6);
        const output = new Uint8Array([0xa5]);
        expect(() => copy(device, view, [output], [region()])).toThrow();
        expect(gl.readPixels).not.toHaveBeenCalled();
        expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
        expect(output[0]).toBe(0xa5);
    });

    it('applies explicit mip and array-layer bases to relative readback regions', () => {
        const { device, view, gl } = harness(Format.R8UI, [7, 0, 0, 1]);
        view.gpuTexture.type = TextureType.TEX2D_ARRAY;
        view.gpuTexture.glTarget = 0x8c1a;
        view.gpuTexture.width = 8;
        view.gpuTexture.height = 8;
        view.gpuTexture.mipLevel = 3;
        view.gpuTexture.arrayLayer = 4;
        view.baseLevel = 1;
        view.levelCount = 2;
        view.baseLayer = 2;
        view.layerCount = 2;
        const request = region();
        request.texSubres.mipLevel = 1;
        request.texSubres.baseArrayLayer = 1;
        copy(device, view, [new Uint8Array(1)], [request]);
        expect(gl.framebufferTextureLayer).toHaveBeenCalledWith(0x8ca8, 0x8ce0, view.gpuTexture.glTexture, 2, 3);
    });

    it('rejects a view invalidated by resource mip shrink before touching GL or output', () => {
        const { device, view, gl } = harness(Format.R8UI, [7, 0, 0, 1]);
        view.baseLevel = 1;
        const output = new Uint8Array([0xa5]);
        expect(() => copy(device, view, [output], [region()])).toThrow();
        expect(gl.readPixels).not.toHaveBeenCalled();
        expect(gl.createFramebuffer).not.toHaveBeenCalled();
        expect(output[0]).toBe(0xa5);
    });

    it('uses native row and image strides across multiple array slices', () => {
        const { device, view, gl } = harness(Format.R8UI, []);
        view.gpuTexture.type = TextureType.TEX2D_ARRAY;
        view.gpuTexture.arrayLayer = 3;
        view.layerCount = 3;
        const vectors = [
            [7, 0, 0, 1, 8, 0, 0, 1],
            [9, 0, 0, 1, 10, 0, 0, 1],
        ];
        let slice = 0;
        gl.readPixels.mockImplementation((...args: any[]) => {
            args.find((value) => ArrayBuffer.isView(value)).set(vectors[slice++]);
        });
        const request = region(1, 2);
        request.buffOffset = 1;
        request.buffStride = 2;
        request.buffTexHeight = 3;
        request.texSubres.baseArrayLayer = 1;
        request.texSubres.layerCount = 2;
        const output = new Uint8Array(12).fill(0xa5);
        copy(device, view, [output], [request]);
        expect(Array.from(output)).toEqual([0xa5, 7, 0xa5, 8, 0xa5, 0xa5, 0xa5, 9, 0xa5, 10, 0xa5, 0xa5]);
        expect(gl.framebufferTextureLayer.mock.calls.map((call: any[]) => call[4])).toEqual([1, 2]);
    });

    it('selects 3D slices relative to the view base at the requested mip', () => {
        const { device, view, gl } = harness(Format.R8UI, [7, 0, 0, 1]);
        view.gpuTexture.type = TextureType.TEX3D;
        view.gpuTexture.depth = 8;
        view.gpuTexture.mipLevel = 3;
        view.baseLevel = 1;
        view.baseLayer = 1;
        view.layerCount = 3;
        const request = region();
        request.texOffset.z = 1;
        request.texExtent.depth = 2;
        const output = new Uint8Array(2);
        copy(device, view, [output], [request]);
        expect(Array.from(output)).toEqual([7, 7]);
        expect(gl.framebufferTextureLayer.mock.calls.map((call: any[]) => call.slice(3))).toEqual([
            [1, 2],
            [1, 3],
        ]);
    });

    it('selects a cube face without treating a cube target as a 2D attachment', () => {
        const { device, view, gl } = harness(Format.R8UI, [7, 0, 0, 1]);
        view.gpuTexture.type = TextureType.CUBE;
        view.gpuTexture.glTarget = 0x8513;
        view.gpuTexture.arrayLayer = 6;
        view.baseLayer = 5;
        copy(device, view, [new Uint8Array(1)], [region()]);
        expect(gl.framebufferTexture2D).toHaveBeenCalledWith(0x8ca8, 0x8ce0, 0x851a, view.gpuTexture.glTexture, 0);
    });

    it('restores nondefault PACK parameters and the existing pixel-pack buffer', () => {
        const { device, view, gl, cache } = harness(Format.R8UI, [7, 0, 0, 1]);
        const pbo = {};
        const saved = new Map<number, any>([
            [0x8caa, cache.glReadFramebuffer],
            [0x8ca6, cache.glFramebuffer],
            [0x88ed, pbo],
            [0x0d05, 8],
            [0x0d02, 7],
            [0x0d03, 2],
            [0x0d04, 3],
        ]);
        gl.getParameter.mockImplementation((key: number) => saved.get(key));
        copy(device, view, [new Uint8Array(1)], [region()]);
        for (const [key, value] of saved) {
            if ([0x0d05, 0x0d02, 0x0d03, 0x0d04].includes(key)) {
                expect(gl.pixelStorei).toHaveBeenCalledWith(key, value);
            }
        }
        expect(gl.bindBuffer).toHaveBeenLastCalledWith(0x88eb, pbo);
        expect(gl.bindFramebuffer).toHaveBeenCalledWith(0x8ca9, cache.glFramebuffer);
    });

    it('rejects packed RGB10A2UI readback before attaching or mutating a buffer', () => {
        const { device, view, gl } = harness(Format.RGB10A2UI, [1023, 1023, 1023, 3]);
        const output = new Uint32Array([0xdeadbeef]);
        expect(() => copy(device, view, [output], [region()])).toThrow('WEBGL2_READBACK_FORMAT_UNSUPPORTED');
        expect(gl.createFramebuffer).not.toHaveBeenCalled();
        expect(output[0]).toBe(0xdeadbeef);
    });

    it('rebuilds an existing framebuffer before a renderpass after its texture handle changes', () => {
        const { device, view, gl, cache } = harness(Format.RGBA8, []);
        const pass = { colorAttachments: [], depthStencilAttachment: null };
        const oldFramebuffer = {};
        const framebuffer = {
            gpuColorViews: [view],
            gpuDepthStencilView: null,
            glFramebuffer: oldFramebuffer,
            glAttachments: [{}],
        };
        const commands = jest.requireActual('../../src/cocos/gfx/webgl2/webgl2-commands');
        const savedRead = cache.glReadFramebuffer;
        commands.WebGL2CmdFuncBeginRenderPass(device, pass, framebuffer, { x: 0, y: 0, width: 2, height: 2 }, [], 1, 0);
        expect(gl.deleteFramebuffer).toHaveBeenCalledWith(oldFramebuffer);
        expect(gl.createFramebuffer).toHaveBeenCalledTimes(1);
        expect(framebuffer.glFramebuffer).toBe(gl.createFramebuffer.mock.results[0].value);
        expect(framebuffer.glAttachments).toEqual([view.gpuTexture.glTexture]);
        expect(gl.framebufferTexture2D).toHaveBeenCalledWith(0x8ca9, 0x8ce0, 0x0de1, view.gpuTexture.glTexture, 0);
        expect(cache.glReadFramebuffer).toBe(savedRead);
        expect(cache.glFramebuffer).toBe(framebuffer.glFramebuffer);
    });

    it('rejects an existing framebuffer whose selected mip became invalid before renderpass side effects', () => {
        const { device, view, gl } = harness(Format.RGBA8, []);
        view.baseLevel = 1;
        const framebuffer = {
            gpuColorViews: [view],
            gpuDepthStencilView: null,
            glFramebuffer: {},
            glAttachments: [view.gpuTexture.glTexture],
        };
        const commands = jest.requireActual('../../src/cocos/gfx/webgl2/webgl2-commands');
        expect(() =>
            commands.WebGL2CmdFuncBeginRenderPass(
                device,
                { colorAttachments: [], depthStencilAttachment: null },
                framebuffer,
                { x: 0, y: 0, width: 2, height: 2 },
                [],
                1,
                0,
            ),
        ).toThrow('WEBGL2_TEXTURE_VIEW_RANGE');
        expect(gl.bindFramebuffer).not.toHaveBeenCalled();
        expect(gl.createFramebuffer).not.toHaveBeenCalled();
        expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
    });
});
