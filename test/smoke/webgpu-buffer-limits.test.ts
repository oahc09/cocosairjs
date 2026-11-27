import {
    BufferInfo,
    BufferUsageBit,
    BufferViewInfo,
    DescriptorSetLayoutBinding,
    DescriptorType,
    MemoryUsageBit,
} from '../../src/cocos/gfx/base/define';
import { WebGPUBuffer } from '../../src/cocos/gfx/webgpu/webgpu-buffer';
import { WebGPUDescriptorSet } from '../../src/cocos/gfx/webgpu/webgpu-descriptor-set';
import { WebGPUDeviceManager } from '../../src/cocos/gfx/webgpu/define';

const device = {
    nativeDevice: {
        limits: { maxBufferSize: 1024, maxStorageBufferBindingSize: 256 },
        createBuffer: jest.fn(({ size }) => ({ size, destroy: jest.fn() })),
    },
    memoryStatus: { bufferSize: 0 },
};
const makeBuffer = (size: number): WebGPUBuffer => {
    const buffer = new WebGPUBuffer();
    buffer.initialize(new BufferInfo(BufferUsageBit.STORAGE, MemoryUsageBit.DEVICE, size));
    return buffer;
};
beforeEach(() => {
    jest.spyOn(WebGPUDeviceManager, 'instance', 'get').mockReturnValue(device as never);
    (globalThis as any).GPUBufferUsage = { STORAGE: 128, COPY_DST: 8 };
    device.nativeDevice.createBuffer.mockClear();
    device.memoryStatus.bufferSize = 0;
});
afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as any).GPUBufferUsage;
});

test('rejects oversized allocation and keeps the original buffer on a rejected resize', () => {
    expect(() => makeBuffer(1028)).toThrow(expect.objectContaining({ code: 'WEBGPU_BUFFER_SIZE_LIMIT', limit: 1024 }));
    expect(device.nativeDevice.createBuffer).not.toHaveBeenCalled();
    const buffer = makeBuffer(1024);
    const original = buffer.gpuBuffer.gpuBuffer;
    expect(() => buffer.resize(1028)).toThrow(expect.objectContaining({ code: 'WEBGPU_BUFFER_SIZE_LIMIT' }));
    expect(buffer.size).toBe(1024);
    expect(buffer.gpuBuffer.gpuBuffer).toBe(original);
    expect(original!.destroy).not.toHaveBeenCalled();
    expect(device.memoryStatus.bufferSize).toBe(1024);
    expect(device.nativeDevice.createBuffer).toHaveBeenCalledTimes(1);
    buffer.resize(512);
    expect(original!.destroy).toHaveBeenCalledTimes(1);
    expect(device.memoryStatus.bufferSize).toBe(512);
    buffer.destroy();
    expect(device.memoryStatus.bufferSize).toBe(0);
});

test('rejects a whole storage range and admits aligned chunks of the same native buffer', () => {
    const owner = makeBuffer(768);
    const descriptor = new WebGPUDescriptorSet() as any;
    descriptor._gpuDescriptorSet = { gpuDescriptors: [] };
    const binding = new DescriptorSetLayoutBinding(0, DescriptorType.STORAGE_BUFFER);
    expect(() => descriptor._bindBufferEntry(binding, owner)).toThrow(
        expect.objectContaining({ code: 'WEBGPU_STORAGE_BINDING_SIZE_LIMIT', binding: 0, size: 768, limit: 256 }),
    );
    expect(descriptor._bindGroupEntries.size).toBe(0);
    for (const offset of [0, 256, 512]) {
        const view = new WebGPUBuffer();
        view.initialize(new BufferViewInfo(owner, offset, 256));
        descriptor._bindBufferEntry(binding, view);
        expect(descriptor._bindGroupEntries.get(0).resource).toEqual({
            buffer: owner.gpuBuffer.gpuBuffer,
            size: 256,
            offset,
        });
        view.destroy();
    }
    expect(device.nativeDevice.createBuffer).toHaveBeenCalledTimes(1);
    expect(owner.gpuBuffer.gpuBuffer!.destroy).not.toHaveBeenCalled();
    owner.destroy();
});
