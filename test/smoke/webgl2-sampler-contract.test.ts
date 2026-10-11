import { ComparisonFunc, Format, FormatFeatureBit, SamplerInfo } from '../../src/cocos/gfx/base/define';
import { WebGLConstants } from '../../src/cocos/gfx/gl-constants';
import { WebGL2Device } from '../../src/cocos/gfx/webgl2/webgl2-device';
import { WebGL2DeviceManager } from '../../src/cocos/gfx/webgl2/webgl2-define';
import { WebGL2Sampler } from '../../src/cocos/gfx/webgl2/states/webgl2-sampler';

function makeDevice(anisotropyLimit: number | null = 16) {
    const ext =
        anisotropyLimit === null
            ? null
            : {
                  TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe,
                  MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff,
              };
    let serial = 0;
    const values = new Map<WebGLSampler, Map<number, number>>();
    const gl = {
        createSampler: jest.fn(() => {
            const sampler = { serial: ++serial } as unknown as WebGLSampler;
            values.set(sampler, new Map());
            return sampler;
        }),
        samplerParameteri: jest.fn((sampler, name, value) => values.get(sampler)!.set(name, value)),
        samplerParameterf: jest.fn((sampler, name, value) => values.get(sampler)!.set(name, value)),
        getParameter: jest.fn(() => anisotropyLimit),
        deleteSampler: jest.fn(),
        bindSampler: jest.fn(),
    };
    const device = new WebGL2Device();
    (device as any)._context = gl;
    (device as any)._swapchain = {
        extensions: { EXT_texture_filter_anisotropic: ext },
        stateCache: { glSamplerUnits: [] },
    };
    WebGL2DeviceManager.setInstance(device);
    return { device, gl, values };
}

describe('WebGL2 sampler and format contracts', () => {
    const originalDevice = WebGL2DeviceManager.instance;
    afterAll(() => WebGL2DeviceManager.setInstance(originalDevice));

    test('half-float filtering is core while float32 filtering remains extension gated', () => {
        const { device } = makeDevice();
        (device as any).initFormatFeatures({});
        for (const format of [Format.R16F, Format.RG16F, Format.RGB16F, Format.RGBA16F]) {
            expect(device.getFormatFeatures(format) & FormatFeatureBit.LINEAR_FILTER).toBeTruthy();
        }
        for (const format of [Format.R32F, Format.RG32F, Format.RGB32F, Format.RGBA32F]) {
            expect(device.getFormatFeatures(format) & FormatFeatureBit.LINEAR_FILTER).toBe(0);
        }
        (device as any).initFormatFeatures({ OES_texture_float_linear: {} });
        expect(device.getFormatFeatures(Format.RGBA32F) & FormatFeatureBit.LINEAR_FILTER).toBeTruthy();
    });

    test('integer formats never advertise linear filtering', () => {
        const { device } = makeDevice();
        (device as any).initFormatFeatures({});
        for (const format of [
            Format.RGB10A2UI,
            Format.R8I,
            Format.R8UI,
            Format.R16I,
            Format.R16UI,
            Format.R32I,
            Format.R32UI,
            Format.RG8I,
            Format.RG8UI,
            Format.RG16I,
            Format.RG16UI,
            Format.RG32I,
            Format.RG32UI,
            Format.RGB8I,
            Format.RGB8UI,
            Format.RGB16I,
            Format.RGB16UI,
            Format.RGB32I,
            Format.RGB32UI,
            Format.RGBA8I,
            Format.RGBA8UI,
            Format.RGBA16I,
            Format.RGBA16UI,
            Format.RGBA32I,
            Format.RGBA32UI,
        ]) {
            expect(device.getFormatFeatures(format) & FormatFeatureBit.LINEAR_FILTER).toBe(0);
        }
    });

    test.each([{}, { EXT_color_buffer_half_float: {} }, { EXT_color_buffer_float: {} }])(
        'renderability is independent of filtering and restricted to legal channel layouts (%j)',
        (extensions) => {
            const { device } = makeDevice();
            (device as any).initFormatFeatures(extensions);
            const halfRenderable =
                'EXT_color_buffer_half_float' in extensions || 'EXT_color_buffer_float' in extensions;
            for (const format of [Format.R16F, Format.RG16F, Format.RGBA16F]) {
                expect(!!(device.getFormatFeatures(format) & FormatFeatureBit.RENDER_TARGET)).toBe(halfRenderable);
                expect(device.textureExclusive[format]).toBe(!halfRenderable);
                expect(device.getFormatFeatures(format) & FormatFeatureBit.LINEAR_FILTER).toBeTruthy();
            }
            for (const format of [Format.R32F, Format.RG32F, Format.RGBA32F]) {
                expect(!!(device.getFormatFeatures(format) & FormatFeatureBit.RENDER_TARGET)).toBe(
                    'EXT_color_buffer_float' in extensions,
                );
                expect(device.getFormatFeatures(format) & FormatFeatureBit.LINEAR_FILTER).toBe(0);
            }
            for (const format of [
                Format.RGB16F,
                Format.RGB32F,
                Format.RGB8I,
                Format.RGB8UI,
                Format.RGB16I,
                Format.RGB16UI,
                Format.RGB32I,
                Format.RGB32UI,
            ]) {
                expect(device.getFormatFeatures(format) & FormatFeatureBit.RENDER_TARGET).toBe(0);
                expect(device.textureExclusive[format]).toBe(true);
                expect(device.getFormatFeatures(format) & FormatFeatureBit.SAMPLED_TEXTURE).toBeTruthy();
            }
        },
    );

    test.each([
        [ComparisonFunc.NEVER, WebGLConstants.NEVER],
        [ComparisonFunc.LESS, WebGLConstants.LESS],
        [ComparisonFunc.EQUAL, WebGLConstants.EQUAL],
        [ComparisonFunc.LESS_EQUAL, WebGLConstants.LEQUAL],
        [ComparisonFunc.GREATER, WebGLConstants.GREATER],
        [ComparisonFunc.NOT_EQUAL, WebGLConstants.NOTEQUAL],
        [ComparisonFunc.GREATER_EQUAL, WebGLConstants.GEQUAL],
        [ComparisonFunc.ALWAYS, WebGLConstants.ALWAYS],
    ])('comparison function %s reaches every GL sampler LOD variant', (comparison, expected) => {
        const { device, values } = makeDevice();
        const info = new SamplerInfo();
        info.cmpFunc = comparison;
        const sampler = device.getSampler(info) as WebGL2Sampler;
        expect(device.getSampler(info)).toBe(sampler);
        for (const range of [
            [0, 1],
            [1, 3],
        ]) {
            const handle = sampler.gpuSampler.getGLSampler(device, range[0], range[1]);
            expect(sampler.gpuSampler.getGLSampler(device, range[0], range[1])).toBe(handle);
            expect(values.get(handle)!.get(WebGLConstants.TEXTURE_COMPARE_FUNC)).toBe(expected);
            expect(values.get(handle)!.get(WebGLConstants.TEXTURE_COMPARE_MODE)).toBe(
                comparison === ComparisonFunc.ALWAYS ? WebGLConstants.NONE : WebGLConstants.COMPARE_REF_TO_TEXTURE,
            );
        }
    });

    test.each([
        [0, 0, 1],
        [1, 1, 1],
        [4, 4, 4],
        [16, 8, 8],
        [32, 8, 8],
    ])(
        'anisotropy %s is normalized before caching and applied to all LOD variants',
        (request, normalized, expected) => {
            const { device, values } = makeDevice(8);
            const info = new SamplerInfo();
            info.maxAnisotropy = request;
            const sampler = device.getSampler(info) as WebGL2Sampler;
            expect(info.maxAnisotropy).toBe(request);
            expect(sampler.info.maxAnisotropy).toBe(normalized);
            const equivalent = new SamplerInfo();
            equivalent.maxAnisotropy = normalized;
            expect(device.getSampler(equivalent)).toBe(sampler);
            for (const range of [
                [0, 1],
                [1, 3],
            ]) {
                const handle = sampler.gpuSampler.getGLSampler(device, range[0], range[1]);
                expect(values.get(handle)!.get(0x84fe)).toBe(expected);
            }
        },
    );

    test('extension absence falls back to one without issuing unsupported parameters', () => {
        const { device, values } = makeDevice(null);
        const info = new SamplerInfo();
        info.maxAnisotropy = 16;
        const sampler = device.getSampler(info) as WebGL2Sampler;
        expect(sampler.info.maxAnisotropy).toBe(1);
        expect(values.get(sampler.gpuSampler.getGLSampler(device, 0, 1))!.has(0x84fe)).toBe(false);
    });

    test('devices above sixteen retain the public hash range and comparison cache isolation', () => {
        const { device, values } = makeDevice(32);
        const info = new SamplerInfo();
        info.maxAnisotropy = 32;
        const ordinary = device.getSampler(info) as WebGL2Sampler;
        expect(ordinary.info.maxAnisotropy).toBe(16);
        expect(values.get(ordinary.gpuSampler.getGLSampler(device, 0, 1))!.get(0x84fe)).toBe(16);
        info.cmpFunc = ComparisonFunc.LESS;
        expect(device.getSampler(info)).not.toBe(ordinary);
    });

    test.each([-1, 8, 0.5, NaN, Infinity])('invalid comparison function %s is rejected before caching', (value) => {
        const { device } = makeDevice();
        const info = new SamplerInfo();
        info.cmpFunc = value;
        expect(() => device.getSampler(info)).toThrow();
        expect((device as any)._samplers.size).toBe(0);
    });

    test.each([-1, 0.5, NaN, Infinity, -Infinity])(
        'invalid anisotropy %s is rejected before cache mutation',
        (value) => {
            const { device, gl } = makeDevice();
            const info = new SamplerInfo();
            info.maxAnisotropy = value;
            expect(() => device.getSampler(info)).toThrow();
            expect((device as any)._samplers.size).toBe(0);
            expect(gl.createSampler).not.toHaveBeenCalled();
        },
    );

    test('destroy releases each LOD variant once, unbinds it, and permits recreation', () => {
        const { device, gl } = makeDevice();
        const info = new SamplerInfo();
        info.cmpFunc = ComparisonFunc.LESS_EQUAL;
        info.maxAnisotropy = 4;
        const sampler = device.getSampler(info) as WebGL2Sampler;
        const first = sampler.gpuSampler.getGLSampler(device, 0, 1);
        const second = sampler.gpuSampler.getGLSampler(device, 1, 3);
        device.getStateCache().glSamplerUnits.push(first, second);
        let deletes = 0;
        gl.deleteSampler.mockImplementation(() => {
            if (++deletes > 2) throw new Error('Repeated sampler deletion: iterator did not advance');
        });
        sampler.destroy();
        expect(gl.deleteSampler.mock.calls).toEqual([[first], [second]]);
        expect(device.getStateCache().glSamplerUnits).toEqual([null, null]);
        expect(gl.bindSampler.mock.calls).toEqual([
            [0, null],
            [1, null],
        ]);
        const replacement = device.getSampler(info) as WebGL2Sampler;
        expect(replacement).not.toBe(sampler);
        expect(replacement.info.cmpFunc).toBe(ComparisonFunc.LESS_EQUAL);
        expect(replacement.info.maxAnisotropy).toBe(4);
        expect(replacement.gpuSampler.getGLSampler(device, 0, 1)).not.toBe(first);
    });
});
