import { RenderTexture } from '../../src/cocos/asset/assets/render-texture';
import { RenderWindow } from '../../src/cocos/render-scene/core/render-window';
import {
    ColorAttachment,
    DepthStencilAttachment,
    Format,
    RenderPassInfo,
    SampleCount,
    deviceManager,
} from '../../src/cocos/gfx';
import { director } from '../../src/cocos/game/director';
import { RenderPipeline } from '../../src/cocos/rendering/render-pipeline';

describe('native camera target attachment contracts', () => {
    afterEach(() => jest.restoreAllMocks());
    test('an explicit HDR render pass retains format and does not mutate the caller', () => {
        const color = new ColorAttachment(Format.RGBA16F);
        const pass = new RenderPassInfo([color], new DepthStencilAttachment(Format.DEPTH_STENCIL));
        const fake = { swapchainFormat: Format.RGBA8, getGeneralBarrier: () => ({}) };
        jest.spyOn(deviceManager, 'gfxDevice', 'get').mockReturnValue(fake as never);
        const window = { framebuffer: { colorTextures: [{ format: Format.RGBA16F }] } };
        const createWindow = jest.fn((_info: any) => window);
        jest.spyOn(director, 'root', 'get').mockReturnValue({ device: fake, createWindow } as never);
        const target = new RenderTexture();
        target.initialize({ width: 16, height: 8, passInfo: pass });
        expect(createWindow.mock.calls[0][0].renderPassInfo.colorAttachments[0].format).toBe(Format.RGBA16F);
        expect(color.format).toBe(Format.RGBA16F);
        expect(target.getPixelFormat()).toBe(Format.RGBA16F);
    });
    test('render windows create matching actual color/depth multisample resources', () => {
        const infos: any[] = [];
        const device = {
            createRenderPass: (info: unknown) => info,
            createTexture: (info: any) => {
                infos.push(info);
                return { info, samples: info.samples, format: info.format };
            },
            createFramebuffer: (info: unknown) => info,
        };
        const root: any = {};
        RenderWindow.registerCreateFunc(root);
        const window = root._createWindowFun(root);
        window.initialize(device, {
            width: 32,
            height: 16,
            renderPassInfo: new RenderPassInfo(
                [new ColorAttachment(Format.RGBA16F, SampleCount.X4)],
                new DepthStencilAttachment(Format.DEPTH_STENCIL, SampleCount.X4),
            ),
        });
        expect(infos.map((info) => info.samples)).toEqual([4, 4]);
        expect(infos.map((info) => info.format)).toEqual([Format.RGBA16F, Format.DEPTH_STENCIL]);
    });
    test('camera render-pass creation retains samples and sampled depth; color-only is legal', () => {
        const pipeline = new RenderPipeline() as any;
        pipeline._device = { getGeneralBarrier: () => ({}), createRenderPass: (info: unknown) => info };
        const pass = pipeline.createRenderPass(7, Format.RGBA16F, Format.DEPTH_STENCIL, 4, true);
        expect(pass.colorAttachments[0].sampleCount).toBe(4);
        expect(pass.depthStencilAttachment.sampleCount).toBe(4);
        expect(pass.depthStencilAttachment.depthStoreOp).toBe(0);
        const info = {
            type: 1,
            usage: 1,
            format: Format.RGBA8,
            width: 16,
            height: 16,
            flags: 0,
            layerCount: 1,
            levelCount: 1,
            samples: 1,
            depth: 1,
            externalRes: 0,
        };
        expect(() =>
            pipeline.getRenderPass(7, {
                colorTextures: [{ info, format: Format.RGBA8, samples: 1 }],
                depthStencilTexture: null,
            }),
        ).not.toThrow();
    });
});
