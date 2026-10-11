import {
    Color,
    ColorMask,
    BufferTextureCopy,
    DynamicStateFlagBit,
    DynamicStates,
    Format,
    FormatInfos,
    FormatSize,
    getTypedArrayConstructor,
    LoadOp,
    Rect,
    Type,
    TextureType,
    SampleCount,
    SamplerInfo,
    ComparisonFunc,
} from '../../src/cocos/gfx/base/define';
import { RasterizerState } from '../../src/cocos/gfx/base/pipeline-state';
import { WebGLConstants as GL } from '../../src/cocos/gfx/gl-constants';
import {
    WebGL2CmdFuncBeginRenderPass,
    WebGL2CmdFuncBindStates,
    WebGL2CmdFuncCopyBuffersToTexture,
    WebGL2CmdFuncCopyTextureToBuffers,
    WebGL2CmdFuncInvalidateState,
} from '../../src/cocos/gfx/webgl2/webgl2-commands';
import { WebGL2StateCache } from '../../src/cocos/gfx/webgl2/webgl2-state-cache';
import { WebGL2DeviceManager } from '../../src/cocos/gfx/webgl2/webgl2-define';
import { WebGL2Sampler } from '../../src/cocos/gfx/webgl2/states/webgl2-sampler';

function fixture(useVAO = false) {
    const calls: Record<string, jest.Mock> = {};
    const gl = new Proxy({}, { get: (_, key: string) => calls[key] ?? (calls[key] = jest.fn()) }) as any;
    gl.createVertexArray.mockReturnValue({});
    const cache = new WebGL2StateCache();
    cache.initialize(8, 8, 16);
    const device = {
        gl,
        getStateCache: () => cache,
        capabilities: { maxVertexAttributes: 16 },
        extensions: { useVAO },
    } as any;
    return { device, gl, cache };
}

function clear(device: any, formats: Format[], colors: Color[]) {
    const pass = {
        colorAttachments: formats.map((format) => ({ format, loadOp: LoadOp.CLEAR })),
        depthStencilAttachment: null,
    };
    WebGL2CmdFuncBeginRenderPass(
        device,
        pass as any,
        { glFramebuffer: {}, gpuColorViews: [], gpuDepthStencilView: null } as any,
        new Rect(0, 0, 4, 4),
        colors,
        1,
        0,
    );
}

describe('WebGL2 command contracts', () => {
    test('descriptor view LOD bounds are inclusive and comparison samplers reuse only matching ranges', () => {
        const { device, gl } = fixture();
        const originalDevice = WebGL2DeviceManager.instance;
        WebGL2DeviceManager.setInstance(device);
        let serial = 0;
        gl.createSampler.mockImplementation(() => ({ serial: ++serial }));
        try {
            const info = new SamplerInfo();
            info.cmpFunc = ComparisonFunc.LESS_EQUAL;
            const sampler = new WebGL2Sampler(info, 1);
            const view = {
                baseLevel: 2,
                levelCount: 1,
                gpuTexture: { format: Format.DEPTH, size: 64, glTexture: {}, glTarget: GL.TEXTURE_2D },
            };
            const descriptorSet = {
                descriptorIndices: [0],
                gpuDescriptors: [{ gpuTextureView: view, gpuSampler: sampler.gpuSampler }],
            };
            const shader = {
                glProgram: {},
                glBlocks: [],
                glInputs: [],
                glSamplerTextures: [{ set: 0, binding: 0, units: [0], type: Type.SAMPLER2D }],
            };
            const pipeline = {
                gpuShader: shader,
                gpuPipelineLayout: { dynamicOffsetIndices: [] },
                dynamicStates: [],
            } as any;
            const bind = () =>
                WebGL2CmdFuncBindStates(device, pipeline, null, [descriptorSet] as any, [], new DynamicStates());
            bind();
            const first = gl.bindSampler.mock.calls[0][1];
            expect(gl.samplerParameterf.mock.calls).toContainEqual([first, GL.TEXTURE_MIN_LOD, 2]);
            expect(gl.samplerParameterf.mock.calls).toContainEqual([first, GL.TEXTURE_MAX_LOD, 2]);
            view.levelCount = 2;
            bind();
            const second = gl.bindSampler.mock.calls[1][1];
            expect(second).not.toBe(first);
            expect(gl.samplerParameterf.mock.calls).toContainEqual([second, GL.TEXTURE_MIN_LOD, 2]);
            expect(gl.samplerParameterf.mock.calls).toContainEqual([second, GL.TEXTURE_MAX_LOD, 3]);
            for (const handle of [first, second]) {
                expect(gl.samplerParameteri.mock.calls).toContainEqual([
                    handle,
                    GL.TEXTURE_COMPARE_MODE,
                    GL.COMPARE_REF_TO_TEXTURE,
                ]);
                expect(gl.samplerParameteri.mock.calls).toContainEqual([handle, GL.TEXTURE_COMPARE_FUNC, GL.LEQUAL]);
            }
            view.levelCount = 1;
            bind();
            expect(gl.bindSampler.mock.calls[2]).toEqual([0, first]);
            expect(gl.createSampler).toHaveBeenCalledTimes(2);
        } finally {
            WebGL2DeviceManager.setInstance(originalDevice);
        }
    });

    test('RGB10A2UI uploads one packed UINT32 per pixel and validates the clear channel ranges', () => {
        const { device, gl } = fixture();
        expect(FormatSize(Format.RGB10A2UI, 1, 1, 1)).toBe(4);
        expect(getTypedArrayConstructor(FormatInfos[Format.RGB10A2UI])).toBe(Uint32Array);
        const texture = {
            format: Format.RGB10A2UI,
            type: TextureType.TEX2D,
            glTexture: {},
            glTarget: GL.TEXTURE_2D,
            glFormat: GL.RGBA_INTEGER,
            glType: GL.UNSIGNED_INT_2_10_10_10_REV,
            width: 1,
            height: 1,
            flags: 0,
            samples: SampleCount.X1,
        } as any;
        const region = new BufferTextureCopy();
        region.texExtent.width = region.texExtent.height = region.texExtent.depth = 1;
        const packed = new Uint32Array([0xffffffff]);
        WebGL2CmdFuncCopyBuffersToTexture(device, [packed], texture, [region]);
        const uploaded = gl.texSubImage2D.mock.calls[0][8];
        expect(uploaded).toBeInstanceOf(Uint32Array);
        expect(Array.from(uploaded)).toEqual([0xffffffff]);
        clear(device, [Format.RGB10A2UI], [new Color(1023, 0, 512, 3)]);
        expect(Array.from(gl.clearBufferuiv.mock.calls[0][2])).toEqual([1023, 0, 512, 3]);
        expect(() => clear(device, [Format.RGB10A2UI], [new Color(1024, 0, 0, 3)])).toThrow();
        expect(() => clear(device, [Format.RGB10A2UI], [new Color(0, 0, 0, 4)])).toThrow();
        expect(() =>
            WebGL2CmdFuncCopyTextureToBuffers(device, { gpuTexture: texture } as any, [new Uint32Array(1)], [region]),
        ).toThrow('WEBGL2_READBACK_FORMAT_UNSUPPORTED');
    });

    test('mixed integer clear preserves UINT/INT precision and restores the color mask', () => {
        const { device, gl, cache } = fixture();
        cache.bs.targets[0].blendColorMask = ColorMask.R;
        const captured: number[][] = [];
        gl.clearBufferuiv.mockImplementation((_: number, index: number, values: Uint32Array) =>
            captured.push([index, ...values]),
        );
        gl.clearBufferiv.mockImplementation((_: number, index: number, values: Int32Array) =>
            captured.push([index, ...values]),
        );
        clear(
            device,
            [Format.RGBA32UI, Format.RGBA32I, Format.RGBA8],
            [
                new Color(16777217, 4294967295, 0, 1),
                new Color(-16777217, -2147483648, 2147483647, 0),
                new Color(0.25, 0.5, 0.75, 1),
            ],
        );
        expect(captured).toEqual([
            [0, 16777217, 4294967295, 0, 1],
            [1, -16777217, -2147483648, 2147483647, 0],
        ]);
        expect(gl.clearBufferfv).toHaveBeenCalledTimes(1);
        expect(gl.clear).not.toHaveBeenCalled();
        expect(gl.colorMask.mock.calls.at(-1)).toEqual([true, false, false, false]);
    });

    test('ordinary MRT clear also restores the color mask without a duplicate clear', () => {
        const { device, gl, cache } = fixture();
        cache.bs.targets[0].blendColorMask = ColorMask.G;
        clear(device, [Format.RGBA8, Format.RGBA8], [new Color(0, 0, 0, 1), new Color(1, 1, 1, 1)]);
        expect(gl.clearBufferfv).toHaveBeenCalledTimes(2);
        expect(gl.clear).not.toHaveBeenCalled();
        expect(gl.colorMask.mock.calls.at(-1)).toEqual([false, true, false, false]);
    });

    test.each([NaN, Infinity, -1, 256, 0.5])('invalid UINT8 clear %s is rejected before GL changes', (value) => {
        const { device, gl } = fixture();
        expect(() => clear(device, [Format.RGBA8UI], [new Color(value, 0, 0, 0)])).toThrow();
        expect(gl.bindFramebuffer).not.toHaveBeenCalled();
        expect(gl.colorMask).not.toHaveBeenCalled();
    });

    test.each([false, true])(
        'shader integer and float attributes select the correct binding path (VAO=%s)',
        (useVAO) => {
            const { device, gl } = fixture(useVAO);
            const attributes = [
                {
                    name: 'integer',
                    glBuffer: {},
                    glType: GL.INT,
                    size: 16,
                    count: 4,
                    stride: 84,
                    offset: 0,
                    isNormalized: false,
                    isInstanced: true,
                },
                {
                    name: 'color',
                    glBuffer: {},
                    glType: GL.UNSIGNED_BYTE,
                    size: 4,
                    count: 4,
                    stride: 84,
                    offset: 16,
                    isNormalized: true,
                    isInstanced: false,
                },
                {
                    name: 'matrix',
                    glBuffer: {},
                    glType: GL.FLOAT,
                    size: 16,
                    count: 4,
                    stride: 84,
                    offset: 20,
                    isNormalized: false,
                    isInstanced: true,
                },
            ];
            const shader = {
                glProgram: {},
                glInputs: [
                    { name: 'integer', type: Type.INT4, glType: GL.INT_VEC4, glLoc: 0, count: 1 },
                    { name: 'color', type: Type.FLOAT4, glType: GL.FLOAT_VEC4, glLoc: 1, count: 1 },
                    { name: 'matrix', type: Type.MAT4, glType: GL.FLOAT_MAT4, glLoc: 2, count: 1 },
                ],
            };
            const pipeline = { gpuShader: shader, dynamicStates: [] } as any;
            const assembler = { glAttribs: attributes, glVAOs: new Map(), gpuIndexBuffer: null } as any;
            WebGL2CmdFuncBindStates(device, pipeline, assembler, [], [], new DynamicStates());
            expect(gl.vertexAttribIPointer.mock.calls).toEqual([[0, 4, GL.INT, 84, 0]]);
            expect(gl.vertexAttribPointer.mock.calls).toEqual([
                [1, 4, GL.UNSIGNED_BYTE, true, 84, 16],
                [2, 4, GL.FLOAT, false, 84, 20],
                [3, 4, GL.FLOAT, false, 84, 36],
                [4, 4, GL.FLOAT, false, 84, 52],
                [5, 4, GL.FLOAT, false, 84, 68],
            ]);
            expect(gl.vertexAttribDivisor.mock.calls).toEqual([
                [0, 1],
                [1, 0],
                [2, 1],
                [3, 1],
                [4, 1],
                [5, 1],
            ]);
        },
    );

    test('static and dynamic bias apply slope/constant and the enabled bit independently', () => {
        const { device, gl } = fixture();
        const rs = new RasterizerState();
        rs.depthBiasEnabled = true;
        rs.depthBias = -4;
        rs.depthBiasSlop = 1.25;
        WebGL2CmdFuncBindStates(device, { rs, dynamicStates: [] } as any, null, [], [], new DynamicStates());
        expect(gl.enable).toHaveBeenCalledWith(GL.POLYGON_OFFSET_FILL);
        expect(gl.polygonOffset).toHaveBeenLastCalledWith(1.25, -4);
        const dynamic = new DynamicStates();
        dynamic.depthBiasConstant = -8;
        dynamic.depthBiasSlope = 2.5;
        WebGL2CmdFuncBindStates(
            device,
            { rs, dynamicStates: [DynamicStateFlagBit.DEPTH_BIAS] } as any,
            null,
            [],
            [],
            dynamic,
        );
        expect(gl.polygonOffset).toHaveBeenLastCalledWith(2.5, -8);
        const disabled = new RasterizerState();
        WebGL2CmdFuncBindStates(device, { rs: disabled, dynamicStates: [] } as any, null, [], [], dynamic);
        expect(gl.disable).toHaveBeenCalledWith(GL.POLYGON_OFFSET_FILL);
    });

    test('reinitialization invalidates pipeline identity so the same pipeline reapplies static bias', () => {
        const { device, gl, cache } = fixture();
        const rs = new RasterizerState();
        rs.depthBiasEnabled = true;
        rs.depthBias = -4;
        rs.depthBiasSlop = 1.25;
        const pipeline = { rs, dynamicStates: [] } as any;
        const bind = () => WebGL2CmdFuncBindStates(device, pipeline, null, [], [], new DynamicStates());
        bind();
        expect(gl.enable).toHaveBeenCalledWith(GL.POLYGON_OFFSET_FILL);
        expect(gl.polygonOffset).toHaveBeenLastCalledWith(1.25, -4);
        gl.enable.mockClear();
        gl.polygonOffset.mockClear();
        bind();
        expect(gl.enable).not.toHaveBeenCalled();
        expect(gl.polygonOffset).not.toHaveBeenCalled();
        WebGL2CmdFuncInvalidateState();
        cache.rs.depthBiasEnabled = false;
        cache.rs.depthBias = 0;
        cache.rs.depthBiasSlop = 0;
        cache.rs.depthBiasClamp = 0;
        bind();
        expect(gl.enable).toHaveBeenCalledWith(GL.POLYGON_OFFSET_FILL);
        expect(gl.polygonOffset).toHaveBeenLastCalledWith(1.25, -4);
        expect(cache.rs.depthBiasEnabled).toBe(true);
        expect(cache.rs.depthBias).toBe(-4);
        expect(cache.rs.depthBiasSlop).toBe(1.25);
    });
});
