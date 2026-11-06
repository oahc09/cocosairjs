import { systemInfo } from 'pal/system-info';
import { OS } from '../../src/pal/system-info/enum-type';
import { BufferUsageBit, DynamicStates, MemoryUsageBit } from '../../src/cocos/gfx/base/define';
import { WebGLConstants as GL } from '../../src/cocos/gfx/gl-constants';
import { WebGL2Buffer } from '../../src/cocos/gfx/webgl2/webgl2-buffer';
import {
    WebGL2CmdFuncBindStates,
    WebGL2CmdFuncDestroyBuffer,
    WebGL2CmdFuncInvalidateState,
    WebGL2CmdFuncUpdateBuffer,
} from '../../src/cocos/gfx/webgl2/webgl2-commands';
import { WebGL2DeviceManager } from '../../src/cocos/gfx/webgl2/webgl2-define';
import { WebGL2StateCache } from '../../src/cocos/gfx/webgl2/webgl2-state-cache';

function fixture() {
    const calls: Record<string, jest.Mock> = {};
    const gl = new Proxy({}, { get: (_, key: string) => calls[key] ?? (calls[key] = jest.fn()) }) as any;
    const cache = new WebGL2StateCache();
    cache.initialize(8, 8, 16);
    const device = { gl, getStateCache: () => cache, capabilities: {}, extensions: { useVAO: true } } as any;
    return { gl, cache, device };
}

function buffer(target: number, size = 32) {
    return { usage: 0, memUsage: MemoryUsageBit.DEVICE, glTarget: target, glBuffer: {}, size } as any;
}

describe('WebGL2 buffer byte ranges and UBO views', () => {
    beforeEach(() => WebGL2CmdFuncInvalidateState());

    test.each([GL.ARRAY_BUFFER, GL.ELEMENT_ARRAY_BUFFER, GL.UNIFORM_BUFFER])(
        'target %i uploads an explicit byte prefix of a nonzero-offset typed-array view',
        (target) => {
            const { gl, device } = fixture();
            const words = new Uint16Array([0xffff, 0x1234, 0xabcd, 0x5678, 0xffff]);
            const view = words.subarray(1, 4);
            WebGL2CmdFuncUpdateBuffer(device, buffer(target), view, 8, 4);
            const [actualTarget, offset, bytes] = gl.bufferSubData.mock.calls[0];
            expect(actualTarget).toBe(target);
            expect(offset).toBe(8);
            expect(Array.from(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))).toEqual(
                Array.from(new Uint8Array(words.buffer, view.byteOffset, 4)),
            );
            expect(bytes.byteLength).toBe(4);
        },
    );

    test.each([GL.ARRAY_BUFFER, GL.ELEMENT_ARRAY_BUFFER, GL.UNIFORM_BUFFER])(
        'target %i accepts DataView byte prefixes without numeric reinterpretation',
        (target) => {
            const { gl, device } = fixture();
            const raw = Uint8Array.from([99, 17, 34, 51, 68, 85, 102, 99]);
            WebGL2CmdFuncUpdateBuffer(device, buffer(target), new DataView(raw.buffer, 1, 6), 3, 4);
            const bytes = gl.bufferSubData.mock.calls[0][2];
            expect(Array.from(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))).toEqual([
                17, 34, 51, 68,
            ]);
        },
    );

    test('two disjoint updates preserve both writes and untouched bytes', () => {
        const { gl, device } = fixture();
        const stored = new Uint8Array(16).fill(199);
        gl.bufferSubData.mockImplementation((_: number, offset: number, bytes: ArrayBufferView) => {
            stored.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset);
        });
        const gpu = buffer(GL.ARRAY_BUFFER, stored.byteLength);
        WebGL2CmdFuncUpdateBuffer(device, gpu, Uint8Array.from([1, 2, 3, 4]), 0, 4);
        WebGL2CmdFuncUpdateBuffer(device, gpu, Uint8Array.from([5, 6, 7, 8]), 8, 4);
        expect(Array.from(stored)).toEqual([1, 2, 3, 4, 199, 199, 199, 199, 5, 6, 7, 8, 199, 199, 199, 199]);
    });

    test('a size-less public update uses the whole new source after a partial update', () => {
        const { gl, device } = fixture();
        const originalDevice = WebGL2DeviceManager.instance;
        WebGL2DeviceManager.setInstance(device);
        try {
            const resource = new WebGL2Buffer();
            (resource as any)._gpuBuffer = buffer(GL.ARRAY_BUFFER, 16);
            (resource as any)._usage = BufferUsageBit.VERTEX;
            resource.update(new Float32Array([1, 2, 3, 4]), 4);
            resource.update(new Float32Array([5, 6, 7, 8]));
            expect(gl.bufferSubData.mock.calls.map((call: any[]) => call[2].byteLength)).toEqual([4, 16]);
        } finally {
            WebGL2DeviceManager.setInstance(originalDevice);
        }
    });

    test.each([
        [-1, 4],
        [0.5, 4],
        [0, -1],
        [0, 1.5],
        [0, 9],
        [5, 4],
        [NaN, 4],
        [0, Infinity],
    ])('invalid offset %s and size %s fail before changing GL state', (offset, size) => {
        const { gl, device } = fixture();
        expect(() =>
            WebGL2CmdFuncUpdateBuffer(device, buffer(GL.ARRAY_BUFFER, 8), new ArrayBuffer(8), offset, size),
        ).toThrow('WEBGL2_BUFFER_UPDATE_RANGE');
        expect(gl.bindBuffer).not.toHaveBeenCalled();
        expect(gl.bindVertexArray).not.toHaveBeenCalled();
        expect(gl.bufferSubData).not.toHaveBeenCalled();
    });

    test('zero-byte upload is a no-op', () => {
        const { gl, device } = fixture();
        WebGL2CmdFuncUpdateBuffer(device, buffer(GL.ARRAY_BUFFER, 8), new ArrayBuffer(0), 8, 0);
        expect(gl.bindBuffer).not.toHaveBeenCalled();
        expect(gl.bufferSubData).not.toHaveBeenCalled();
    });

    test.each([GL.ARRAY_BUFFER, GL.ELEMENT_ARRAY_BUFFER, GL.UNIFORM_BUFFER])(
        'iOS target %i only reallocates for a complete destination replacement',
        (target) => {
            const { gl, device } = fixture();
            const originalOS = systemInfo.os;
            (systemInfo as any).os = OS.IOS;
            try {
                const gpu = buffer(target, 16);
                gpu.memUsage = MemoryUsageBit.HOST;
                WebGL2CmdFuncUpdateBuffer(device, gpu, new ArrayBuffer(4), 0, 4);
                expect(gl.bufferData).not.toHaveBeenCalled();
                expect(gl.bufferSubData.mock.calls[0][2].byteLength).toBe(4);
                WebGL2CmdFuncUpdateBuffer(device, gpu, new ArrayBuffer(20), 0, 16);
                expect(gl.bufferData).toHaveBeenCalledTimes(1);
                expect(gl.bufferData.mock.calls[0][1].byteLength).toBe(16);
            } finally {
                (systemInfo as any).os = originalOS;
            }
        },
    );

    test('index uploads detach the current VAO before changing its element binding', () => {
        const { gl, cache, device } = fixture();
        cache.glVAO = {};
        const order: string[] = [];
        gl.bindVertexArray.mockImplementation((vao: unknown) => {
            expect(vao).toBe(null);
            order.push('detach');
        });
        gl.bindBuffer.mockImplementation(() => order.push('bind'));
        gl.bufferSubData.mockImplementation(() => order.push('upload'));
        WebGL2CmdFuncUpdateBuffer(device, buffer(GL.ELEMENT_ARRAY_BUFFER), new Uint16Array([0, 1, 2]), 0, 6);
        expect(order).toEqual(['detach', 'bind', 'upload']);
        expect(cache.glVAO).toBe(null);
    });

    function uniformFixture(offset = 0, size = 16) {
        const base = fixture();
        const gpu = { glBuffer: {}, glOffset: offset, size };
        const set = { descriptorIndices: [0], gpuDescriptors: [{ gpuBuffer: gpu }] };
        const pipeline = {
            gpuShader: { glProgram: {}, glBlocks: [{ set: 0, binding: 0, glBinding: 2 }], glSamplerTextures: [] },
            gpuPipelineLayout: { dynamicOffsetIndices: [] },
            dynamicStates: [],
        } as any;
        const bind = (offsets: number[] = []) =>
            WebGL2CmdFuncBindStates(base.device, pipeline, null, [set] as any, offsets, new DynamicStates());
        return { ...base, gpu, set, pipeline, bind };
    }

    test('a zero-offset UBO view binds its exact range instead of the entire backing buffer', () => {
        const { gl, cache, gpu, bind } = uniformFixture();
        bind();
        expect(gl.bindBufferRange).toHaveBeenCalledWith(GL.UNIFORM_BUFFER, 2, gpu.glBuffer, 0, 16);
        expect(gl.bindBufferBase).not.toHaveBeenCalled();
        expect(cache.glBindUBOSizes[2]).toBe(16);
    });

    test.each([0, 256])('range-only changes at offset %i invalidate the UBO binding cache', (offset) => {
        const { gl, gpu, bind } = uniformFixture(offset);
        bind();
        bind();
        expect(gl.bindBufferRange).toHaveBeenCalledTimes(1);
        gpu.size = 32;
        bind();
        expect(gl.bindBufferRange).toHaveBeenCalledTimes(2);
        expect(gl.bindBufferRange.mock.calls[1]).toEqual([GL.UNIFORM_BUFFER, 2, gpu.glBuffer, offset, 32]);
    });

    test('two uniform slots retain independent ranges of the same buffer and dynamic byte offsets', () => {
        const { gl, cache, gpu, pipeline, set, bind } = uniformFixture(0, 16);
        pipeline.gpuShader.glBlocks.push({ set: 0, binding: 1, glBinding: 3 });
        pipeline.gpuPipelineLayout.dynamicOffsetIndices = [[-1, 0]];
        set.descriptorIndices.push(1);
        set.gpuDescriptors.push({ gpuBuffer: { glBuffer: gpu.glBuffer, glOffset: 256, size: 32 } });
        bind([256]);
        expect(gl.bindBufferRange.mock.calls).toEqual([
            [GL.UNIFORM_BUFFER, 2, gpu.glBuffer, 0, 16],
            [GL.UNIFORM_BUFFER, 3, gpu.glBuffer, 512, 32],
        ]);
        bind([256]);
        expect(gl.bindBufferRange).toHaveBeenCalledTimes(2);
        expect(cache.glBindUBOOffsets.slice(2, 4)).toEqual([0, 512]);
        expect(cache.glBindUBOSizes.slice(2, 4)).toEqual([16, 32]);
    });

    test('buffer deletion invalidates every matching indexed range before a replacement is bound', () => {
        const { gl, cache, device, gpu, bind } = uniformFixture(256, 32);
        bind();
        cache.glBindUBOs[3] = gpu.glBuffer;
        cache.glBindUBOOffsets[3] = 512;
        cache.glBindUBOSizes[3] = 64;
        const unrelated = {};
        cache.glBindUBOs[4] = unrelated;
        cache.glBindUBOOffsets[4] = 768;
        cache.glBindUBOSizes[4] = 16;
        WebGL2CmdFuncDestroyBuffer(device, { ...gpu, glTarget: GL.UNIFORM_BUFFER } as any);
        expect(cache.glBindUBOs.slice(2, 5)).toEqual([null, null, unrelated]);
        expect(cache.glBindUBOOffsets.slice(2, 5)).toEqual([0, 0, 768]);
        expect(cache.glBindUBOSizes.slice(2, 5)).toEqual([0, 0, 16]);
        gpu.glBuffer = {};
        bind();
        expect(gl.bindBufferRange).toHaveBeenCalledTimes(2);
        expect(gl.bindBufferRange.mock.calls[1]).toEqual([GL.UNIFORM_BUFFER, 2, gpu.glBuffer, 256, 32]);
    });
});
