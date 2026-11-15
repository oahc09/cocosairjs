import {
    beginWebGPUResourceUse,
    retireWebGPUResource,
    closeWebGPUResourceUses,
    assertWebGPUDeviceActive,
} from '../../src/air/rendering/webgpu-resource-lifetime';

describe('unsubmitted WebGPU resource lifetime', () => {
    test('late work rejects closed/lost devices and preserves a live native identity', () => {
        const nativeDevice = {};
        expect(assertWebGPUDeviceActive({ isLost: false, nativeDevice })).toBe(nativeDevice);
        for (const device of [
            { isLost: true, nativeDevice },
            { isLost: false, nativeDevice: null },
        ]) {
            expect(() => assertWebGPUDeviceActive(device)).toThrow('WebGPU device is lost or closed.');
        }
    });
    test('idle retirement destroys immediately and is idempotent', () => {
        const device = {},
            resource = { destroy: jest.fn() };
        retireWebGPUResource(device, resource);
        retireWebGPUResource(device, resource);
        expect(resource.destroy).toHaveBeenCalledTimes(1);
    });

    test('every existing use must submit or abandon; a later use does not retain an old handle', () => {
        const device = {},
            resource = { destroy: jest.fn() };
        const first = beginWebGPUResourceUse(device),
            second = beginWebGPUResourceUse(device);
        retireWebGPUResource(device, resource);
        const later = beginWebGPUResourceUse(device);
        second();
        second();
        expect(resource.destroy).not.toHaveBeenCalled();
        first();
        expect(resource.destroy).toHaveBeenCalledTimes(1);
        later();
        expect(resource.destroy).toHaveBeenCalledTimes(1);
    });

    test('replacement between uses releases each native allocation at its own last use', () => {
        const device = {},
            first = { destroy: jest.fn() },
            second = { destroy: jest.fn() };
        const a = beginWebGPUResourceUse(device);
        retireWebGPUResource(device, first);
        const b = beginWebGPUResourceUse(device);
        retireWebGPUResource(device, second);
        a();
        expect(first.destroy).toHaveBeenCalledTimes(1);
        expect(second.destroy).not.toHaveBeenCalled();
        b();
        expect(second.destroy).toHaveBeenCalledTimes(1);
    });

    test('device loss drains pending resources and makes late releases harmless', () => {
        const device = {},
            resource = { destroy: jest.fn() };
        const end = beginWebGPUResourceUse(device);
        retireWebGPUResource(device, resource);
        closeWebGPUResourceUses(device);
        closeWebGPUResourceUses(device);
        end();
        retireWebGPUResource(device, resource);
        expect(resource.destroy).toHaveBeenCalledTimes(1);
        expect(() => beginWebGPUResourceUse(device)).toThrow('WEBGPU_DEVICE_LOST');
    });

    test('retirement does not cross device ownership', () => {
        const first = {},
            second = {},
            resource = { destroy: jest.fn() };
        const end = beginWebGPUResourceUse(first);
        retireWebGPUResource(second, resource);
        expect(resource.destroy).toHaveBeenCalledTimes(1);
        end();
    });
});
