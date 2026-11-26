import {
    Format,
    FormatSurfaceSize,
    SampleCount,
    TextureInfo,
    TextureType,
    TextureUsageBit,
    TextureViewInfo,
} from '../../src/cocos/gfx/base/define';
import { WebGPUTexture } from '../../src/cocos/gfx/webgpu/webgpu-texture';
import { WebGPUDeviceManager } from '../../src/cocos/gfx/webgpu/define';
import { WebGPUCmdFuncCreateTexture, WebGPUCmdFuncResizeTexture } from '../../src/cocos/gfx/webgpu/webgpu-commands';
import type { IWebGPUTexture } from '../../src/cocos/gfx/webgpu/webgpu-gpu-objects';

jest.mock('../../src/cocos/gfx/webgpu/define', () => ({
    WebGPUDeviceManager: { instance: { memoryStatus: { textureSize: 0 } } },
}));
jest.mock('../../src/cocos/gfx/webgpu/webgpu-commands', () => ({
    GFXFormatToWGPUFormat: () => 'rgba8unorm',
    GFXTextureToWebGPUTexture: () => '2d',
    WebGPUCmdFuncCreateTexture: jest.fn(),
    WebGPUCmdFuncResizeTexture: jest.fn(),
    WebGPUCmdFuncDestroyTexture: jest.fn(),
}));

const create = jest.mocked(WebGPUCmdFuncCreateTexture);
const resize = jest.mocked(WebGPUCmdFuncResizeTexture);
const nativeDescriptors: { width: number; height: number; count: number }[] = [];
const views: GPUTextureViewDescriptor[] = [];

function recordNative(_device: unknown, gpu: IWebGPUTexture): void {
    const { width, height, mipLevel: count } = gpu;
    if (count < 1 || count > 1 + Math.floor(Math.log2(Math.max(width, height, gpu.depth)))) {
        throw new Error('invalid native mip count');
    }
    nativeDescriptors.push({ width, height, count });
    gpu.gpuTexture = {
        createView(descriptor: GPUTextureViewDescriptor) {
            if (descriptor.baseMipLevel! + descriptor.mipLevelCount! > count) throw new Error('invalid native view');
            views.push(descriptor);
            return {};
        },
    } as unknown as GPUTexture;
}

function texture(width: number, height: number, levels: number, samples = SampleCount.X1): WebGPUTexture {
    const result = new WebGPUTexture();
    const info = new TextureInfo(TextureType.TEX2D, TextureUsageBit.SAMPLED, Format.RGBA8, width, height);
    info.levelCount = levels;
    info.samples = samples;
    result.initialize(info);
    return result;
}

function assertResize(tex: WebGPUTexture, width: number, height: number, levels: number): void {
    tex.resize(width, height);
    expect(nativeDescriptors.at(-1)).toEqual({ width, height, count: levels });
    expect(tex.levelCount).toBe(levels);
    expect(tex.viewInfo.levelCount).toBe(levels);
    expect(tex.gpuTexture.mipLevel).toBe(levels);
    tex.getNativeTextureView();
    expect(views.at(-1)?.mipLevelCount).toBe(levels);
    tex.getNativeTextureView(true);
    expect(views.at(-1)?.mipLevelCount).toBe(1);
    const bytes = FormatSurfaceSize(Format.RGBA8, width, height, 1, levels);
    expect(tex.size).toBe(bytes);
    expect(WebGPUDeviceManager.instance.memoryStatus.textureSize).toBe(bytes);
}

beforeEach(() => {
    jest.clearAllMocks();
    create.mockImplementation(recordNative);
    resize.mockImplementation(recordNative);
    (globalThis as any).GPUTextureUsage = { RENDER_ATTACHMENT: 16 };
    WebGPUDeviceManager.instance.memoryStatus.textureSize = 0;
    nativeDescriptors.length = 0;
    views.length = 0;
});

test('full chain survives shrinking to one level and grows again', () => {
    const tex = texture(8, 8, 4);
    assertResize(tex, 2, 2, 2);
    assertResize(tex, 1, 1, 1);
    assertResize(tex, 8, 7, 4);
    const handle = tex.getTextureHandle();
    tex.resize(8, 7);
    expect(resize).toHaveBeenCalledTimes(3);
    expect(tex.getTextureHandle()).toBe(handle);
});

test('partial intent never becomes a full chain, even after a clamp and regrow', () => {
    const tex = texture(8, 8, 3);
    assertResize(tex, 16, 16, 3);
    assertResize(tex, 2, 2, 2);
    assertResize(tex, 16, 16, 3);
});

test.each([
    [1, SampleCount.X1],
    [8, SampleCount.X1],
    [1, SampleCount.X4],
])('one level stays one on growth (initial size %s, samples %s)', (size, samples) =>
    assertResize(texture(size, size, 1, samples), 8, 7, 1),
);

test('fixed subview rejects out of range before native validation and works again after growth', () => {
    const tex = texture(8, 8, 4);
    const view = new WebGPUTexture();
    view.initialize(new TextureViewInfo(tex, TextureType.TEX2D, Format.RGBA8, 1, 2));
    expect(() => view.resize(1, 1)).toThrow('views cannot resize');
    tex.resize(2, 2);
    expect(() => view.getNativeTextureView()).toThrow('mip range exceeds');
    expect(views).toHaveLength(0);
    tex.resize(8, 8);
    view.getNativeTextureView();
    expect(views[0]).toMatchObject({ baseMipLevel: 1, mipLevelCount: 2 });
});

test('invalid resize dimensions do not mutate the native allocation', () => {
    const tex = texture(8, 8, 4);
    expect(() => tex.resize(0, 2)).toThrow('positive integers');
    expect(() => tex.resize(2, NaN)).toThrow('positive integers');
    expect(tex.width).toBe(8);
    expect(tex.levelCount).toBe(4);
    expect(resize).not.toHaveBeenCalled();
});
