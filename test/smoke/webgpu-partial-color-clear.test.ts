import { Color, Format, LoadOp, Rect } from '../../src/cocos/gfx/base/define';
import { WebGPUDeviceManager } from '../../src/cocos/gfx/webgpu/define';
import { GFXFormatToWGPUFormat } from '../../src/cocos/gfx/webgpu/webgpu-commands';
import { WebGPUCommandBuffer } from '../../src/cocos/gfx/webgpu/webgpu-command-buffer';

function fixture() {
    const descriptors: any[] = [];
    const formats: string[] = [];
    const shaderModules: string[] = [];
    const buffers: any[] = [];
    const nativeDevice = {
        createCommandEncoder: () => ({
            beginRenderPass(descriptor: any) {
                descriptors.push(descriptor);
                return {
                    setViewport: jest.fn(),
                    setScissorRect: jest.fn(),
                    setPipeline: jest.fn(),
                    setBindGroup: jest.fn(),
                    draw: jest.fn(),
                    end: jest.fn(),
                };
            },
            finish: jest.fn(),
        }),
        createShaderModule: ({ code }: { code: string }) => {
            shaderModules.push(code);
            return {};
        },
        createBindGroupLayout: () => ({}),
        createPipelineLayout: () => ({}),
        createRenderPipeline: ({ fragment, multisample }: any) => {
            formats.push(fragment.targets[0].format + ':' + multisample.count);
            return {};
        },
        createBuffer: () => {
            const data = new ArrayBuffer(16);
            const buffer = { data, getMappedRange: () => data, unmap: jest.fn(), destroy: jest.fn() };
            buffers.push(buffer);
            return buffer;
        },
        createBindGroup: () => ({}),
        queue: { submit: jest.fn() },
    };
    const device = { isLost: false, nativeDevice, getSwapchains: () => [] } as any;
    return { device, descriptors, formats, shaderModules, buffers };
}

const first = new Color(1, 0, 0, 1);
const second = new Color(0, 1, 0, 1);
const bounds = new Rect(0, 0, 4, 4);
const subRect = new Rect(1, 1, 2, 2);

function run(f: ReturnType<typeof fixture>, ops: LoadOp[], area = subRect, formats = [Format.RGBA8, Format.RGBA16F]) {
    WebGPUDeviceManager.setInstance(f.device);
    const views = formats.map(() => ({ label: '' }));
    const template = {
        colorAttachments: formats.map((_, i) => ({ loadOp: ops[i] === LoadOp.LOAD ? 'load' : 'clear' })),
    };
    const pass = {
        colorAttachments: formats.map((format, i) => ({ format, loadOp: ops[i] })),
        depthStencilAttachment: { format: Format.UNKNOWN },
        gpuRenderPass: { originalRP: template, nativeRenderPass: template },
    };
    const framebuffer = {
        gpuFramebuffer: {
            isOffscreen: true,
            gpuColorTextures: views.map((view, i) => ({
                width: 4,
                height: 4,
                samples: 1,
                getTextureView: () => view,
                gpuTexture: { format: GFXFormatToWGPUFormat(formats[i]), createView: () => view },
            })),
        },
    };
    const cmd = new WebGPUCommandBuffer();
    cmd.beginRenderPass(pass as any, framebuffer as any, area, [first, second], 1, 0);
    cmd.endRenderPass();
    return { views, template };
}

describe('WebGPU offscreen partial color clear encoding (CPU descriptor doubles only)', () => {
    const original = WebGPUDeviceManager.instance;
    const globals = globalThis as any;
    const originalStage = globals.GPUShaderStage;
    const originalUsage = globals.GPUBufferUsage;
    beforeEach(() => {
        globals.GPUShaderStage = { FRAGMENT: 2 };
        globals.GPUBufferUsage = { UNIFORM: 64 };
    });
    afterEach(() => {
        WebGPUDeviceManager.setInstance(original);
        globals.GPUShaderStage = originalStage;
        globals.GPUBufferUsage = originalUsage;
    });

    test('only CLEAR target is drawn, even in the first pass and after a LOAD sibling', () => {
        const f = fixture();
        const a = run(f, [LoadOp.CLEAR, LoadOp.LOAD]);
        const b = run(f, [LoadOp.LOAD, LoadOp.CLEAR]);
        const again = run(f, [LoadOp.CLEAR, LoadOp.LOAD]);
        expect(f.descriptors).toHaveLength(6);
        expect(
            [f.descriptors[0], f.descriptors[2], f.descriptors[4]].map((desc) => desc.colorAttachments[0].view),
        ).toEqual([a.views[0], b.views[1], again.views[0]]);
        expect(f.descriptors[1].colorAttachments.map((t: any) => t.loadOp)).toEqual(['load', 'load']);
        expect(f.descriptors[3].colorAttachments.map((t: any) => t.loadOp)).toEqual(['load', 'load']);
        expect(a.template.colorAttachments.map((t) => t.loadOp)).toEqual(['clear', 'load']);
        expect(f.formats).toEqual(['rgba8unorm:1', 'rgba16float:1']);
        expect(f.buffers.every((v) => v.destroy.mock.calls.length === 1)).toBe(true);
    });

    test('full area uses native CLEAR and creates no auxiliary pass', () => {
        const f = fixture();
        run(f, [LoadOp.CLEAR, LoadOp.LOAD], bounds);
        expect(f.formats).toEqual([]);
        expect(f.descriptors).toHaveLength(1);
        expect(f.descriptors[0].colorAttachments.map((t: any) => t.loadOp)).toEqual(['clear', 'load']);
    });

    test('native pipeline is not shared across devices; integer format uses a typed shader', () => {
        const a = fixture();
        const b = fixture();
        run(a, [LoadOp.CLEAR, LoadOp.LOAD]);
        run(b, [LoadOp.CLEAR, LoadOp.CLEAR], subRect, [Format.RGBA8, Format.R32UI]);
        expect(a.formats).toEqual(['rgba8unorm:1']);
        expect(b.formats).toEqual(['rgba8unorm:1', 'r32uint:1']);
        expect(b.shaderModules.some((src) => src.includes('-> @location(0) vec4<u32>'))).toBe(true);
        expect([...new Uint32Array(b.buffers[1].data)]).toEqual([0, 1, 0, 1]);
    });
});
