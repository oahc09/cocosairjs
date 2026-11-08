import { BufferInfo, BufferUsageBit, MemoryUsageBit } from '../../src/cocos/gfx/base/define';
import { WebGLConstants as GL } from '../../src/cocos/gfx/gl-constants';
import { WebGLBuffer } from '../../src/cocos/gfx/webgl/webgl-buffer';
import { WebGLDeviceManager } from '../../src/cocos/gfx/webgl/webgl-define';
import { WebGL2Buffer } from '../../src/cocos/gfx/webgl2/webgl2-buffer';
import { WebGL2DeviceManager } from '../../src/cocos/gfx/webgl2/webgl2-define';
import { EmptyBuffer } from '../../src/cocos/gfx/empty/empty-buffer';
import { InstancedBuffer } from '../../src/cocos/rendering/instanced-buffer';

// Actual buffer classes/commands with only allocation at the GL boundary substituted.
describe.each([
    ['WebGL', WebGLBuffer, WebGLDeviceManager],
    ['WebGL2', WebGL2Buffer, WebGL2DeviceManager],
] as const)('%s actual resize capacity', (_, Resource, Manager) => {
    test.each([BufferUsageBit.VERTEX, BufferUsageBit.INDEX, BufferUsageBit.UNIFORM])(
        'usage %s updates count and memory from allocated bytes and permits retry',
        (usage) => {
            const original = Manager.instance;
            let allocated = 16;
            let limit = 20;
            const gl = {
                bufferData: jest.fn((_target: number, size: number) => {
                    if (size <= limit) allocated = size;
                }),
                getBufferParameter: jest.fn(() => allocated),
                bindBuffer: jest.fn(),
            };
            const cache = { glArrayBuffer: null, glElementArrayBuffer: null, glUniformBuffer: null, glVAO: null };
            const device: any = {
                gl,
                stateCache: cache,
                getStateCache: () => cache,
                extensions: { useVAO: false },
                memoryStatus: { bufferSize: 16 },
            };
            (Manager as any).setInstance(device);
            const resource: any = new Resource();
            Object.assign(resource, {
                _size: 16,
                _stride: 4,
                _count: 4,
                _usage: usage,
                _gpuBuffer: { size: 16, usage, memUsage: MemoryUsageBit.DEVICE, glBuffer: {} },
            });
            try {
                resource.resize(32);
                // WebGL1 uniforms are CPU-backed; only WebGL2 has a GL uniform buffer.
                const cpuUniform = Resource === WebGLBuffer && usage === BufferUsageBit.UNIFORM;
                expect(resource.size).toBe(cpuUniform ? 32 : 16);
                expect(resource.count).toBe(cpuUniform ? 8 : 4);
                expect(device.memoryStatus.bufferSize).toBe(resource.size);
                if (!cpuUniform) {
                    resource.resize(32);
                    expect(gl.getBufferParameter).toHaveBeenCalledTimes(2);
                    limit = 64;
                    resource.resize(32);
                    expect(resource.size).toBe(32);
                    expect(resource.count).toBe(8);
                    expect(device.memoryStatus.bufferSize).toBe(32);
                    resource.resize(0);
                    expect(allocated).toBe(0);
                    expect(resource.size).toBe(0);
                    expect(device.memoryStatus.bufferSize).toBe(0);
                    expect(gl.getBufferParameter).toHaveBeenCalledWith(
                        usage === BufferUsageBit.VERTEX
                            ? GL.ARRAY_BUFFER
                            : usage === BufferUsageBit.INDEX
                              ? GL.ELEMENT_ARRAY_BUFFER
                              : GL.UNIFORM_BUFFER,
                        GL.BUFFER_SIZE,
                    );
                }
            } finally {
                (Manager as any).setInstance(original);
            }
        },
    );
});

test('EmptyBuffer reports resized count for headless batch logic', () => {
    const buffer = new EmptyBuffer();
    buffer.initialize(new BufferInfo(BufferUsageBit.VERTEX, MemoryUsageBit.HOST, 8, 4));
    buffer.resize(24);
    expect([buffer.size, buffer.count]).toEqual([24, 6]);
    buffer.resize(0);
    expect([buffer.size, buffer.count]).toEqual([0, 0]);
});

test.each([
    ['fallback', 12, 3],
    ['rejected', 8, 2],
    ['shrunken', 4, 1],
])('InstancedBuffer %s allocation preserves bounded writes and existing bytes', (_, actual, count) => {
    const vb = {
        size: 8,
        resize: jest.fn(function (this: { size: number }, size: number) {
            this.size = Math.min(size, actual as number);
        }),
    };
    const instance: any = { count: 2, capacity: 2, stride: 4, vb, data: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]) };
    const owner: any = { hasPendingModels: false };
    (InstancedBuffer.prototype as any)._appendInstance.call(owner, instance, Uint8Array.from([9, 10, 11, 12]), {}, {});
    expect(instance.count).toBe(count);
    expect(instance.capacity).toBe((actual as number) / 4);
    expect(instance.count * instance.stride).toBeLessThanOrEqual(vb.size);
    expect([...instance.data.slice(0, 4)]).toEqual([1, 2, 3, 4]);
    if (count === 3) expect([...instance.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    else expect(owner.hasPendingModels).toBe(false);
});
