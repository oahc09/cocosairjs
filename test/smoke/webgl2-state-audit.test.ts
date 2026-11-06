import { DynamicStates, Format, Filter, LoadOp, Rect } from '../../src/cocos/gfx/base/define';
import { WebGLConstants as GL } from '../../src/cocos/gfx/gl-constants';
import { WebGL2StateCache } from '../../src/cocos/gfx/webgl2/webgl2-state-cache';
import {
    WebGL2CmdFuncBeginRenderPass,
    WebGL2CmdFuncBindStates,
    WebGL2CmdFuncCreateInputAssember,
    WebGL2CmdFuncBlitTexture,
} from '../../src/cocos/gfx/webgl2/webgl2-commands';

function fixture(useVAO = false) {
    const calls: Record<string, jest.Mock> = {};
    const gl = new Proxy(GL, {
        get: (target, key: string) => target[key] ?? calls[key] ?? (calls[key] = jest.fn()),
    }) as any;
    gl.createVertexArray.mockReturnValue({});
    gl.checkFramebufferStatus.mockReturnValue(GL.FRAMEBUFFER_COMPLETE);
    const cache = new WebGL2StateCache();
    cache.initialize(8, 8, 16);
    const device = {
        gl,
        getStateCache: () => cache,
        capabilities: { maxVertexAttributes: 16 },
        extensions: { useVAO },
        blitManager: { srcFramebuffer: {}, dstFramebuffer: {} },
    } as any;
    return { device, gl, cache };
}

describe('2026-10-19 WebGL2 audit regressions', () => {
    test.each([false, true])('same PSO repairs drift, preserves IA and descriptors (VAO=%s)', (useVAO) => {
        const { device, gl, cache } = fixture(useVAO);
        const program = {};
        const shader = {
            glProgram: program,
            glBlocks: [{ set: 0, binding: 0, glBinding: 0 }],
            glInputs: [],
            glSamplerTextures: [],
        };
        const pipeline = {
            gpuShader: shader,
            gpuPipelineLayout: { dynamicOffsetIndices: [] },
            dynamicStates: [],
        } as any;
        const ia = { glVAOs: new Map(), glAttribs: [], gpuIndexBuffer: null } as any;
        const buffer = { glBuffer: {}, glOffset: 0, size: 16 };
        const descriptors = [{ descriptorIndices: [0], gpuDescriptors: [{ gpuBuffer: buffer }] }] as any;
        const bind = () => WebGL2CmdFuncBindStates(device, pipeline, ia, descriptors, [], new DynamicStates());
        bind();
        const vao = cache.glVAO;
        cache.glProgram = {} as any;
        buffer.glBuffer = {};
        bind();
        expect(cache.glProgram).toBe(program);
        expect(gl.useProgram).toHaveBeenCalledTimes(2);
        expect(gl.bindBufferRange).toHaveBeenLastCalledWith(GL.UNIFORM_BUFFER, 0, buffer.glBuffer, 0, buffer.size);
        expect(gl.bindBufferRange).toHaveBeenCalledTimes(2);
        expect(gl.bindBufferBase).not.toHaveBeenCalled();
        expect(cache.glBindUBOs[0]).toBe(buffer.glBuffer);
        expect(cache.glBindUBOOffsets[0]).toBe(0);
        expect(cache.glBindUBOSizes[0]).toBe(buffer.size);
        if (useVAO) expect(cache.glVAO).toBe(vao);
        bind();
        expect(gl.useProgram).toHaveBeenCalledTimes(2);
        expect(gl.bindBufferRange).toHaveBeenCalledTimes(2);
    });
    test.each([0, 15, 240, 0xffff])('stencil clear restores front and back mask %s', (front) => {
        const { device, gl, cache } = fixture();
        const back = front ^ 255;
        cache.dss.stencilWriteMaskFront = front;
        cache.dss.stencilWriteMaskBack = back;
        WebGL2CmdFuncBeginRenderPass(
            device,
            {
                colorAttachments: [],
                depthStencilAttachment: {
                    format: Format.DEPTH_STENCIL,
                    depthLoadOp: LoadOp.LOAD,
                    stencilLoadOp: LoadOp.CLEAR,
                },
            } as any,
            { glFramebuffer: {}, gpuColorViews: [], gpuDepthStencilView: null } as any,
            new Rect(0, 0, 4, 4),
            [],
            1,
            170,
        );
        for (const [face, mask] of [
            [GL.FRONT, front],
            [GL.BACK, back],
        ]) {
            expect(gl.stencilMaskSeparate.mock.calls.filter((c: number[]) => c[0] === face)).toEqual(
                mask === 0xffff
                    ? []
                    : [
                          [face, 0xffff],
                          [face, mask],
                      ],
            );
        }
        expect(cache.dss.stencilWriteMaskFront).toBe(front);
        expect(cache.dss.stencilWriteMaskBack).toBe(back);
    });
    test('ninth stream offsets are finite and accumulated', () => {
        const { device } = fixture();
        const ia = {
            attributes: [
                { name: 'x', format: Format.R32F, stream: 8 },
                { name: 'y', format: Format.R32F, stream: 8 },
            ],
            gpuVertexBuffers: Array.from({ length: 9 }, () => ({ glBuffer: {}, stride: 8 })),
        } as any;
        WebGL2CmdFuncCreateInputAssember(device, ia);
        expect(ia.glAttribs.map((a: any) => a.offset)).toEqual([0, 4]);
    });
    test.each([-1, 0.5, 9, NaN, Infinity])('invalid stream %s is rejected', (stream) => {
        const { device } = fixture();
        expect(() =>
            WebGL2CmdFuncCreateInputAssember(device, {
                attributes: [{ name: 'bad', format: Format.R32F, stream }],
                gpuVertexBuffers: Array.from({ length: 9 }, () => ({ glBuffer: {}, stride: 4 })),
            } as any),
        ).toThrow('WEBGL2_VERTEX_STREAM_INVALID');
    });
    test.each([false, true])('built-in and inactive inputs consume no attribute slot (VAO=%s)', (useVAO) => {
        const { device, gl } = fixture(useVAO);
        const names = ['gl_InstanceID', 'gl_VertexID', 'inactiveUserAttribute'];
        const pipeline = {
            gpuShader: {
                glProgram: {},
                glBlocks: [],
                glSamplerTextures: [],
                glInputs: names.map((name) => ({ name, glLoc: -1, glType: GL.INT, count: 1 })),
            },
            dynamicStates: [],
        } as any;
        const ia = { glVAOs: new Map(), glAttribs: names.map((name) => ({ name, glBuffer: {} })) } as any;
        const bind = () => WebGL2CmdFuncBindStates(device, pipeline, ia, [], [], new DynamicStates());
        expect(bind).not.toThrow();
        expect(bind).not.toThrow();
        expect(gl.enableVertexAttribArray).not.toHaveBeenCalled();
        expect(gl.vertexAttribPointer).not.toHaveBeenCalled();
        expect(gl.vertexAttribIPointer).not.toHaveBeenCalled();
        expect(gl.vertexAttribDivisor).not.toHaveBeenCalled();
    });
    test.each([false, true])('matrix at the last valid group of locations is accepted (VAO=%s)', (useVAO) => {
        const { device } = fixture(useVAO);
        const pipeline = {
            gpuShader: {
                glProgram: {},
                glBlocks: [],
                glSamplerTextures: [],
                glInputs: [{ name: 'lastMatrix', glLoc: 12, glType: GL.FLOAT_MAT4, count: 1 }],
            },
            dynamicStates: [],
        } as any;
        expect(() =>
            WebGL2CmdFuncBindStates(
                device,
                pipeline,
                { glVAOs: new Map(), glAttribs: [] } as any,
                [],
                [],
                new DynamicStates(),
            ),
        ).not.toThrow();
    });
    test.each([false, true])('matrix locations respect hardware limit (VAO=%s)', (useVAO) => {
        const { device } = fixture(useVAO);
        const pipeline = {
            gpuShader: {
                glProgram: {},
                glBlocks: [],
                glSamplerTextures: [],
                glInputs: [{ name: 'overflow', glLoc: 15, glType: GL.FLOAT_MAT4, count: 1 }],
            },
            dynamicStates: [],
        } as any;
        expect(() =>
            WebGL2CmdFuncBindStates(
                device,
                pipeline,
                { glVAOs: new Map(), glAttribs: [] } as any,
                [],
                [],
                new DynamicStates(),
            ),
        ).toThrow('WEBGL2_VERTEX_ATTRIBUTE_LIMIT');
    });
    test('scratch blit clears old attachments and restores distinct external read/draw FBOs', () => {
        const { device, gl, cache } = fixture();
        cache.glReadFramebuffer = {};
        cache.glFramebuffer = {};
        const [read, draw] = [cache.glReadFramebuffer, cache.glFramebuffer];
        const region = {
            srcSubres: { mipLevel: 0 },
            dstSubres: { mipLevel: 0 },
            srcOffset: { x: 0, y: 0 },
            dstOffset: { x: 0, y: 0 },
            srcExtent: { width: 4, height: 4 },
            dstExtent: { width: 4, height: 4 },
        };
        for (const format of [Format.RGBA8, Format.DEPTH_STENCIL, Format.RGBA8]) {
            WebGL2CmdFuncBlitTexture(
                device,
                { format, glTexture: {}, glTarget: GL.TEXTURE_2D } as any,
                { format, glRenderbuffer: {} } as any,
                [region] as any,
                Filter.POINT,
            );
            expect(cache.glReadFramebuffer).toBe(read);
            expect(cache.glFramebuffer).toBe(draw);
        }
        const detached = gl.framebufferRenderbuffer.mock.calls.filter((c: any[]) => c[3] === null);
        expect(detached).toHaveLength(24);
        for (const target of [GL.READ_FRAMEBUFFER, GL.DRAW_FRAMEBUFFER])
            for (const attachment of [
                GL.COLOR_ATTACHMENT0,
                GL.DEPTH_ATTACHMENT,
                GL.STENCIL_ATTACHMENT,
                GL.DEPTH_STENCIL_ATTACHMENT,
            ])
                expect(detached).toContainEqual([target, attachment, GL.RENDERBUFFER, null]);
    });
    test('empty blit is a no-op', () => {
        const { device, gl } = fixture();
        WebGL2CmdFuncBlitTexture(device, {} as any, {} as any, [], Filter.POINT);
        expect(gl.bindFramebuffer).not.toHaveBeenCalled();
    });
});
