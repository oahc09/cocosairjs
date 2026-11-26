import { Address, ComparisonFunc, Filter, SamplerInfo } from '../../src/cocos/gfx/base/define';
import { WebGPUDeviceManager } from '../../src/cocos/gfx/webgpu/define';
import { WebGPUSampler } from '../../src/cocos/gfx/webgpu/webgpu-sampler';

jest.mock('../../src/cocos/gfx/webgpu/define', () => ({
    WebGPUDeviceManager: { instance: { nativeDevice: null } },
}));

function useDevice() {
    const native = { createSampler: jest.fn((descriptor: GPUSamplerDescriptor) => ({ descriptor })) };
    Object.assign(WebGPUDeviceManager.instance, { nativeDevice: native });
    return native;
}

function sampler(compare = ComparisonFunc.ALWAYS, anisotropy = 1, filter = Filter.POINT) {
    const info = new SamplerInfo(
        filter,
        filter,
        filter,
        Address.CLAMP,
        Address.CLAMP,
        Address.CLAMP,
        anisotropy,
        compare,
    );
    return new WebGPUSampler(info, 0);
}

test.each([1, 2, 3])('comparison cache is independent of the LOD clamp (%i)', (mips) => {
    const device = useDevice();
    const first = sampler().createGPUSampler(mips);
    const second = sampler(ComparisonFunc.LESS_EQUAL).createGPUSampler(mips);
    expect(first).not.toBe(second);
    expect(device.createSampler.mock.calls.map(([d]) => [d.compare, d.lodMaxClamp])).toEqual([
        [undefined, mips],
        ['less-equal', mips],
    ]);
    expect(sampler().createGPUSampler(mips)).toBe(first);
});

test('normalizes native-equivalent requests without merging distinct anisotropy', () => {
    const device = useDevice();
    const defaults = sampler(ComparisonFunc.ALWAYS, 0, Filter.LINEAR).createGPUSampler();
    const one = sampler(ComparisonFunc.ALWAYS, 1, Filter.LINEAR).createGPUSampler();
    const sixteen = sampler(ComparisonFunc.ALWAYS, 16, Filter.LINEAR).createGPUSampler();
    expect(defaults).toBe(one);
    expect(sixteen).not.toBe(one);
    expect(device.createSampler.mock.calls.map(([descriptor]) => descriptor.maxAnisotropy)).toEqual([1, 16]);
});

test('native samplers do not cross device ownership', () => {
    const first = useDevice();
    const request = sampler();
    const initial = request.createGPUSampler();
    const other = useDevice();
    expect(request.createGPUSampler()).not.toBe(initial);
    expect(first.createSampler).toHaveBeenCalledTimes(1);
    expect(other.createSampler).toHaveBeenCalledTimes(1);
});

test('forced point shares effective nearest settings without changing linear anisotropy', () => {
    const device = useDevice();
    const request = sampler(ComparisonFunc.ALWAYS, 4, Filter.LINEAR);
    const point = request.createGPUSampler(1, true);
    expect(sampler().createGPUSampler()).toBe(point);
    expect(request.createGPUSampler()).not.toBe(point);
    expect(request.samplerInfo.maxAnisotropy).toBe(4);
    expect(device.createSampler.mock.calls.map(([d]) => [d.minFilter, d.maxAnisotropy])).toEqual([
        ['nearest', 1],
        ['linear', 4],
    ]);
});
