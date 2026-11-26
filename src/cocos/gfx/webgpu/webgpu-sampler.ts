/*
 Copyright (c) 2024 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

import { Sampler } from '../base/states/sampler';
import { WebGPUCmdFuncCreateSampler, WebGPUCmdFuncDestroySampler, WebGPUCmdFuncGetSamplerDescriptor } from './webgpu-commands';
import { IWebGPUGPUSampler } from './webgpu-gpu-objects';
import { Filter, SamplerInfo } from '../base/define';
import { WebGPUDeviceManager } from './define';

const samplerCaches = new WeakMap<GPUDevice, Map<string, GPUSampler>>();

export class WebGPUSampler extends Sampler {
    public get gpuSampler (): IWebGPUGPUSampler {
        return this._gpuSampler!;
    }

    public get samplerInfo (): SamplerInfo {
        return this._info;
    }

    private _gpuSampler: IWebGPUGPUSampler | null = null;
    private _hasChange: boolean = false;
    get hasChange (): boolean {
        return this._hasChange;
    }
    public resetChange (): void {
        this._hasChange = false;
    }
    constructor (info: Readonly<SamplerInfo>, hash: number) {
        super(info, hash);
        this._gpuSampler = {
            gpuSampler: null,
            compare: info.cmpFunc,
            minFilter: info.minFilter,
            magFilter: info.magFilter,
            mipFilter: info.mipFilter,
            addressU: info.addressU,
            addressV: info.addressV,
            addressW: info.addressW,
            maxAnisotropy: info.maxAnisotropy,
            mipLevel: 1,

            gpuMinFilter: 'linear',
            gpuMagFilter: 'linear',
            gpuMipFilter: 'linear',
            gpuWrapS: 'clamp-to-edge',
            gpuWrapT: 'clamp-to-edge',
            gpuWrapR: 'clamp-to-edge',
        };
    }

    public createGPUSampler (mipLevel: number = 1, forcePoint = false): GPUSampler | null {
        if (!this._gpuSampler) {
            return null;
        }
        const info = { ...this._gpuSampler, mipLevel };
        if (forcePoint) {
            info.minFilter = info.magFilter = info.mipFilter = Filter.POINT;
            // Native anisotropy greater than one requires all three filters to be linear.
            info.maxAnisotropy = 1;
        }
        const device = WebGPUDeviceManager.instance;
        const nativeDevice = device.nativeDevice!;
        const descriptor = WebGPUCmdFuncGetSamplerDescriptor(info);
        // Use the effective native descriptor, with identical field order at
        // every construction. No compare/LOD/aniso bits can overlap.
        const key = JSON.stringify(descriptor);
        let cache = samplerCaches.get(nativeDevice);
        if (!cache) {
            cache = new Map();
            samplerCaches.set(nativeDevice, cache);
        }
        let currGPUSampler = cache.get(key);
        if (currGPUSampler) return currGPUSampler;

        this._hasChange = true;
        WebGPUCmdFuncCreateSampler(device, info, descriptor);
        currGPUSampler = info.gpuSampler!;
        cache.set(key, currGPUSampler);
        return currGPUSampler;
    }

    public destroy (): void {
        if (!this._gpuSampler) {
            return;
        }
        this._hasChange = true;
        const device = WebGPUDeviceManager.instance;
        WebGPUCmdFuncDestroySampler(device, this._gpuSampler);
        this._gpuSampler = null;
    }
}
