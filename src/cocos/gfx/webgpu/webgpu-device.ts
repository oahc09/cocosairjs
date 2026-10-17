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

import { DescriptorSet } from '../base/descriptor-set';
import { Buffer } from '../base/buffer';
import { CommandBuffer } from '../base/command-buffer';
import { Device } from '../base/device';
import { Framebuffer } from '../base/framebuffer';
import { InputAssembler } from '../base/input-assembler';
import { PipelineState, PipelineStateInfo } from '../base/pipeline-state';
import { Queue } from '../base/queue';
import { RenderPass } from '../base/render-pass';
import { Sampler } from '../base/states/sampler';
import { Shader } from '../base/shader';
import { PipelineLayout } from '../base/pipeline-layout';
import { DescriptorSetLayout } from '../base/descriptor-set-layout';
import { Texture } from '../base/texture';
import { WebGPUDescriptorSet } from './webgpu-descriptor-set';
import { WebGPUBuffer } from './webgpu-buffer';
import { WebGPUCommandBuffer } from './webgpu-command-buffer';
import { WebGPUFramebuffer } from './webgpu-framebuffer';
import { WebGPUInputAssembler } from './webgpu-input-assembler';
import { WebGPUDescriptorSetLayout } from './webgpu-descriptor-set-layout';
import { WebGPUPipelineLayout } from './webgpu-pipeline-layout';
import { WebGPUPipelineState } from './webgpu-pipeline-state';
import { WebGPUQueue } from './webgpu-queue';
import { WebGPURenderPass } from './webgpu-render-pass';
import { WebGPUSampler } from './webgpu-sampler';
import { WebGPUShader } from './webgpu-shader';
import { WebGPUStateCache } from './webgpu-state-cache';
import { WebGPUTexture } from './webgpu-texture';
import { DefaultResources, hashCombineNum, hashCombineStr, webGPU, WebGPUDeviceManager } from './define';
import {
    Filter, Format,
    QueueType, Feature, BufferTextureCopy, Rect, Size, DescriptorSetInfo,
    BufferInfo, BufferViewInfo, CommandBufferInfo, DeviceInfo,
    FramebufferInfo, InputAssemblerInfo, QueueInfo, RenderPassInfo, SamplerInfo,
    ShaderInfo, PipelineLayoutInfo, DescriptorSetLayoutInfo, TextureInfo, TextureViewInfo, GeneralBarrierInfo, TextureBarrierInfo,
    SwapchainInfo,
    BufferBarrierInfo,
    API,
    FormatFeatureBit,
    FormatFeature,
    TextureType,
    TextureUsageBit,
    TextureFlagBit,
    SampleCount,
    BufferUsageBit,
    MemoryUsageBit,
    BufferFlagBit,
    DescriptorSetLayoutBinding,
    DescriptorType,
    ShaderStageFlagBit,
} from '../base/define';
import { WebGPUCommandAllocator } from './webgpu-command-allocator';
import { GeneralBarrier } from '../base/states/general-barrier';
import { TextureBarrier } from '../base/states/texture-barrier';
import { BufferBarrier } from '../base/states/buffer-barrier';
import { Swapchain } from '../base/swapchain';
import { WebGPUSwapchain } from './webgpu-swapchain';

import { IWebGPUBindingMapping, IWebGPUGPUBuffer as IWebGPUBuffer, IWebGPUGPUSampler as IWebGPUSampler, IWebGPUTexture } from './webgpu-gpu-objects';
import { debug, warn, error } from '../../core';
import { WebGPUCmdFuncCopyBuffersToTexture, WebGPUCmdFuncCopyTexImagesToTexture,
    WebGPUCmdFuncCopyTextureToBuffer, WGPUFormatToGFXFormat, GFXFormatToWGPUFormat } from './webgpu-commands';
import { waitForWebGPUWasmInstantiation } from './instantiated';

let loadWebGPUPromise: Promise<void> | undefined;

export function loadWebGPUWasmModule (): Promise<void> {
    if (loadWebGPUPromise) return loadWebGPUPromise;
    loadWebGPUPromise = Promise.resolve()
        .then(() => waitForWebGPUWasmInstantiation());
    return loadWebGPUPromise;
}

export class WebGPUDevice extends Device {
    public createSwapchain (info: Readonly<SwapchainInfo>): Swapchain {
        const swapchain = new WebGPUSwapchain();
        this._swapchain = swapchain;
        swapchain.initialize(info);
        return swapchain;
    }
    public getSampler (info: Readonly<SamplerInfo>): Sampler {
        const hash = Sampler.computeHash(info);
        if (!this._samplers.has(hash)) {
            this._samplers.set(hash, new WebGPUSampler(info, hash));
        }
        return this._samplers.get(hash)!;
    }
    public getSwapchains (): readonly Swapchain[] {
        return [this._swapchain as Swapchain];
    }
    public getGeneralBarrier (info: Readonly<GeneralBarrierInfo>): GeneralBarrier {
        const hash = GeneralBarrier.computeHash(info);
        if (!this._generalBarrierss.has(hash)) {
            this._generalBarrierss.set(hash, new GeneralBarrier(info, hash));
        }
        return this._generalBarrierss.get(hash)!;
    }
    public getTextureBarrier (info: Readonly<TextureBarrierInfo>): TextureBarrier {
        const hash = TextureBarrier.computeHash(info);
        if (!this._textureBarriers.has(hash)) {
            this._textureBarriers.set(hash, new TextureBarrier(info, hash));
        }
        return this._textureBarriers.get(hash)!;
    }
    public getBufferBarrier (info: Readonly<BufferBarrierInfo>): BufferBarrier {
        const hash = BufferBarrier.computeHash(info);
        if (!this._bufferBarriers.has(hash)) {
            this._bufferBarriers.set(hash, new BufferBarrier(info, hash));
        }
        return this._bufferBarriers.get(hash)!;
    }
    public copyTextureToBuffers (): never {
        throw Object.assign(new Error('WebGPU readback is asynchronous; use copyTextureToBuffersAsync.'), { code: 'WEBGPU_ASYNC_READBACK_REQUIRED' });
    }
    public async copyTextureToBuffersAsync (texture: Readonly<Texture>, buffers: ArrayBufferView[], regions: readonly BufferTextureCopy[]): Promise<void> {
        if (!(texture.usage & TextureUsageBit.TRANSFER_SRC)) throw new Error('WEBGPU_READBACK_REQUIRES_TRANSFER_SRC');
        const view = texture.viewInfo;
        const adjusted = regions.map((region) => {
            if (region.texSubres.mipLevel >= view.levelCount || region.texSubres.baseArrayLayer + region.texSubres.layerCount > view.layerCount) {
                throw new Error('WEBGPU_READBACK_VIEW_RANGE');
            }
            const copy = new BufferTextureCopy(); copy.copy(region);
            copy.texSubres.mipLevel += view.baseLevel;
            copy.texSubres.baseArrayLayer += view.baseLayer;
            return copy;
        });
        await WebGPUCmdFuncCopyTextureToBuffer(this, (texture as WebGPUTexture).gpuTexture, buffers, adjusted);
    }
    public flushCommands (cmdBuffs: CommandBuffer[]): void {
        // noop
    }

    get isPremultipliedAlpha (): boolean {
        if (!this._gpuConfig) {
            return false;
        }
        return this._gpuConfig.alphaMode === 'premultiplied';
    }

    get multiDrawIndirectSupport (): boolean {
        return this._multiDrawIndirect;
    }

    get bindingMappings (): IWebGPUBindingMapping {
        return this._bindingMappings!;
    }

    get context (): GPUCanvasContext {
        return this._context!;
    }

    public stateCache: WebGPUStateCache = new WebGPUStateCache();
    public cmdAllocator: WebGPUCommandAllocator = new WebGPUCommandAllocator();
    public nullTex2D: WebGPUTexture | null = null;
    public nullTexCube: WebGPUTexture | null = null;
    public defaultResource: DefaultResources = new DefaultResources();

    private _adapter: GPUAdapter | null | undefined = null;
    private _device: GPUDevice | null | undefined = null;
    private _context: GPUCanvasContext | null = null;
    private _swapchain: WebGPUSwapchain | null = null;
    private _glslang;
    private _twgsl;
    private _bindingMappings: IWebGPUBindingMapping | null = null;
    private _multiDrawIndirect = false;
    private _gpuConfig: GPUCanvasConfiguration | null = null;
    protected _textureExclusive = new Array<boolean>(Format.COUNT);

    public isLost = false;
    public async initialize (info: Readonly<DeviceInfo>): Promise<boolean> {
        WebGPUDeviceManager.setInstance(this);
        try { return await this.initDevice(info); }
        catch (cause) { this.destroy(); throw cause; }
    }

    set gpuConfig (config: GPUCanvasConfiguration) {
        this._gpuConfig = config;
    }

    get gpuConfig (): GPUCanvasConfiguration {
        return this._gpuConfig!;
    }

    protected initFormatFeatures (exts: GPUSupportedFeatures): void {
        this._formatFeatures.fill(FormatFeatureBit.NONE);
        this._textureExclusive.fill(true);
        const storage = new Set(['rgba8unorm', 'rgba8snorm', 'rgba8uint', 'rgba8sint',
            'rgba16uint', 'rgba16sint', 'rgba16float', 'r32uint', 'r32sint', 'r32float',
            'rg32uint', 'rg32sint', 'rg32float', 'rgba32uint', 'rgba32sint', 'rgba32float']);
        const notRenderable = new Set(['r8snorm', 'rg8snorm', 'rgba8snorm', 'rgb9e5ufloat']);
        for (let format = 1; format < Format.COUNT; ++format) {
            let native: GPUTextureFormat;
            try { native = GFXFormatToWGPUFormat(format); } catch { continue; }
            const compressed = native.startsWith('bc') || native.startsWith('etc') || native.startsWith('eac') || native.startsWith('astc');
            if (compressed && !(native.startsWith('bc') ? exts.has('texture-compression-bc')
                : native.startsWith('astc') ? exts.has('texture-compression-astc') : exts.has('texture-compression-etc2'))) continue;
            let bits = FormatFeatureBit.SAMPLED_TEXTURE;
            const integer = /(?:uint|sint)$/.test(native);
            const depth = native.startsWith('depth');
            if (!integer && !depth && (!native.includes('32float') || exts.has('float32-filterable'))) bits |= FormatFeatureBit.LINEAR_FILTER;
            if (!compressed && !notRenderable.has(native)) bits |= FormatFeatureBit.RENDER_TARGET;
            if (storage.has(native)) bits |= FormatFeatureBit.STORAGE_TEXTURE;
            this._formatFeatures[format] = bits;
            this._textureExclusive[format] = false;
        }
        for (const format of [Format.R32F, Format.R32UI, Format.R32I, Format.RG8, Format.RG8SN, Format.RG8UI,
            Format.RG8I, Format.RG16F, Format.RG16UI, Format.RG16I, Format.RG32F, Format.RG32UI, Format.RG32I,
            Format.RGB32F, Format.RGB32UI, Format.RGB32I, Format.RGBA8, Format.RGBA8SN, Format.RGBA8UI,
            Format.RGBA8I, Format.RGBA16F, Format.RGBA16UI, Format.RGBA16I, Format.RGBA32F, Format.RGBA32UI, Format.RGBA32I]) {
            this._formatFeatures[format] |= FormatFeatureBit.VERTEX_ATTRIBUTE;
        }

    }

    public getDefaultDescResources (
        entry: GPUBindGroupLayoutEntry,
        resourceInfo: IWebGPUBuffer | IWebGPUTexture | IWebGPUSampler,
    ): WebGPUBuffer | WebGPUTexture | WebGPUSampler | undefined {
        let currHash = hashCombineNum(entry.visibility, 0);
        const defaultRes = this.defaultResource;
        if (entry.buffer) {
            currHash = hashCombineStr(entry.buffer.type!, currHash);
            if (entry.buffer.hasDynamicOffset) currHash = hashCombineNum(entry.buffer.hasDynamicOffset ? 1 : 0, currHash);
            if (entry.buffer.minBindingSize !== undefined) currHash = hashCombineNum(entry.buffer.minBindingSize, currHash);
            if (defaultRes.buffersDescLayout.has(currHash)) {
                return defaultRes.buffersDescLayout.get(currHash);
            }
            resourceInfo = resourceInfo as IWebGPUBuffer;
            const bufferInfo = new BufferInfo();
            bufferInfo.usage = resourceInfo.usage;
            bufferInfo.size = bufferInfo.stride = 16;
            bufferInfo.memUsage = resourceInfo.memUsage;
            bufferInfo.flags = resourceInfo.flags!;
            defaultRes.buffersDescLayout.set(currHash, this.createBuffer(bufferInfo) as WebGPUBuffer);
            return defaultRes.buffersDescLayout.get(currHash);
        } else if (entry.texture) {
            resourceInfo = resourceInfo as IWebGPUTexture;
            currHash = hashCombineStr(entry.texture.sampleType!, currHash);
            currHash = hashCombineStr(entry.texture.viewDimension!, currHash);
            currHash = hashCombineNum(entry.texture.multisampled ? 1 : 0, currHash);
            currHash = hashCombineNum(resourceInfo.mipLevel, currHash);
            currHash = hashCombineNum(resourceInfo.arrayLayer, currHash);
            if (defaultRes.texturesDescLayout.has(currHash)) {
                return defaultRes.texturesDescLayout.get(currHash);
            }
            const texInfo = new TextureInfo(
                resourceInfo.type,
                resourceInfo.usage,
                resourceInfo.format,
                2 ** (resourceInfo.mipLevel - 1),
                2 ** (resourceInfo.mipLevel - 1),
                resourceInfo.flags,
                resourceInfo.arrayLayer,
                resourceInfo.mipLevel,
                resourceInfo.samples,
                1,
            );
            defaultRes.texturesDescLayout.set(currHash, this.createTexture(texInfo) as WebGPUTexture);
            return defaultRes.texturesDescLayout.get(currHash);
        } else if (entry.sampler) {
            resourceInfo = resourceInfo as IWebGPUSampler;
            currHash = hashCombineStr(entry.sampler.type!, currHash);
            if (defaultRes.samplersDescLayout.has(currHash)) {
                return defaultRes.samplersDescLayout.get(currHash);
            }
            const samplerInfo = new SamplerInfo();
            samplerInfo.minFilter = resourceInfo.minFilter;
            samplerInfo.magFilter = resourceInfo.magFilter;
            samplerInfo.mipFilter = resourceInfo.mipFilter;
            samplerInfo.addressU = resourceInfo.addressU;
            samplerInfo.addressV = resourceInfo.addressV;
            samplerInfo.addressW = resourceInfo.addressW;

            defaultRes.samplersDescLayout.set(currHash, this.getSampler(samplerInfo) as WebGPUSampler);
            return defaultRes.samplersDescLayout.get(currHash);
        }
        return undefined;
    }

    private _createDefaultDescSet (): void {
        const defaultResource = this.defaultResource;
        // default set layout
        const layoutInfo = new DescriptorSetLayoutInfo();
        const layoutBinding = new DescriptorSetLayoutBinding();
        layoutBinding.binding = 0;
        layoutBinding.count = 1;
        layoutBinding.descriptorType = DescriptorType.UNIFORM_BUFFER;
        layoutBinding.stageFlags = ShaderStageFlagBit.VERTEX;
        layoutInfo.bindings.push(layoutBinding);
        defaultResource.setLayout = this.createDescriptorSetLayout(layoutInfo);
        // default set
        const descInfo = new DescriptorSetInfo();
        descInfo.layout = defaultResource.setLayout;
        defaultResource.descSet = this.createDescriptorSet(descInfo);
        defaultResource.descSet.bindBuffer(0, defaultResource.buffer);
        defaultResource.descSet.update();
    }

    get floatFilterable (): boolean {
        return this._adapter!.features.has('float32-filterable');
    }

    private async initDevice (info: Readonly<DeviceInfo>): Promise<boolean> {
        const gpu = typeof navigator === 'undefined' ? undefined : navigator.gpu;
        if (!gpu) throw Object.assign(new Error('WebGPU requires a supported secure browser context.'), { code: 'WEBGPU_UNSUPPORTED' });
        this._adapter = await gpu.requestAdapter();
        if (!this._adapter) throw Object.assign(new Error('No WebGPU adapter is available.'), { code: 'WEBGPU_ADAPTER_UNAVAILABLE' });
        const maxVertAttrs = this._adapter!.limits.maxVertexAttributes;
        const maxSampledTexPerShaderStage = this._adapter!.limits.maxSampledTexturesPerShaderStage;
        const submitFeatures: GPUFeatureName[] = [];
        if (this._adapter!.features.has('float32-filterable')) {
            submitFeatures.push('float32-filterable');
        } else {
            warn('Filterable 32-bit float textures support is not available');
        }
        for (const feature of ['texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc', 'indirect-first-instance'] as GPUFeatureName[]) {
            if (this._adapter.features.has(feature)) submitFeatures.push(feature);
        }
        try { this._device = await this._adapter.requestDevice({
            requiredLimits: {
                // Must be changed, default support for 16 is not enough
                maxVertexAttributes: maxVertAttrs,
                maxSampledTexturesPerShaderStage: maxSampledTexPerShaderStage,
            },
            requiredFeatures: submitFeatures,
        });
        } catch (cause) {
            throw Object.assign(new Error('WebGPU device request failed.'), { code: 'WEBGPU_DEVICE_REQUEST_FAILED', cause });
        }
        this._device.lost.then(() => { this.isLost = true; });
        this._device.addEventListener('uncapturederror', (event) => {
            error('[WEBGPU_VALIDATION_ERROR]', (event as GPUUncapturedErrorEvent).error.message);
        });
        await loadWebGPUWasmModule();
        this._glslang = webGPU.glslang;
        this._twgsl = webGPU.twgsl;

        this._gfxAPI = API.WEBGPU;
        this._swapchainFormat = WGPUFormatToGFXFormat(navigator.gpu.getPreferredCanvasFormat());
        const mapping = this._bindingMappingInfo = info.bindingMappingInfo;
        const blockOffsets: number[] = [];
        const samplerTextureOffsets: number[] = [];
        const firstSet = mapping.setIndices[0];
        blockOffsets[firstSet] = 0;
        samplerTextureOffsets[firstSet] = 0;
        const mappingIdxSize =  mapping.setIndices.length;
        for (let i = 1; i < mappingIdxSize; ++i) {
            const curSet = mapping.setIndices[i];
            const prevSet = mapping.setIndices[i - 1];
            // accumulate the per set offset according to the specified capacity
            blockOffsets[curSet] = mapping.maxBlockCounts[prevSet] + blockOffsets[prevSet];
            samplerTextureOffsets[curSet] = mapping.maxSamplerTextureCounts[prevSet] + samplerTextureOffsets[prevSet];
        }
        for (let i = 0; i < mappingIdxSize; ++i) {
            const curSet = mapping.setIndices[i];
            // textures always come after UBOs
            samplerTextureOffsets[curSet] -= mapping.maxBlockCounts[curSet];
        }
        this._bindingMappings = {
            blockOffsets,
            samplerTextureOffsets,
            flexibleSet: mapping.setIndices[mappingIdxSize - 1],
        };

        const canvas = Device.canvas;
        this._context = canvas.getContext('webgpu');
        if (!this._context) throw Object.assign(new Error('Canvas cannot acquire a WebGPU context.'), { code: 'WEBGPU_CANVAS_FAILED' });
        const device: GPUDevice = this._device as GPUDevice;

        const adapterInfo = this._adapter!.info;
        this._vendor = adapterInfo.vendor;
        this._renderer = adapterInfo.device;
        const description = adapterInfo.description;

        const limits = this._device!.limits;
        this._caps.clipSpaceMinZ = 0.0;
        this._caps.screenSpaceSignY = -1.0;
        this._caps.uboOffsetAlignment = 256;
        this._caps.maxTextureUnits = limits.maxSampledTexturesPerShaderStage;
        this._caps.maxVertexTextureUnits = limits.maxSampledTexturesPerShaderStage;
        this._caps.maxFragmentUniformVectors = Math.floor(limits.maxUniformBufferBindingSize / 16);
        this._caps.maxVertexUniformVectors = Math.floor(limits.maxUniformBufferBindingSize / 16);
        this._caps.maxVertexAttributes = limits.maxVertexAttributes;
        this._caps.maxUniformBufferBindings = limits.maxUniformBuffersPerShaderStage;
        this._caps.maxTextureSize = limits.maxTextureDimension2D;
        this._caps.maxArrayTextureLayers = limits.maxTextureArrayLayers;
        this._caps.max3DTextureSize = limits.maxTextureDimension3D;
        this._caps.uboOffsetAlignment  = limits.minUniformBufferOffsetAlignment;

        // Compute limits are read from the device (not the adapter): no elevated
        // compute limits are requested, so these are the values validation enforces.
        const deviceLimits = device.limits;
        this._caps.maxComputeSharedMemorySize = deviceLimits.maxComputeWorkgroupStorageSize;
        this._caps.maxComputeWorkGroupInvocations = deviceLimits.maxComputeInvocationsPerWorkgroup;
        this._caps.maxComputeWorkGroupSize = new Size(
            deviceLimits.maxComputeWorkgroupSizeX,
            deviceLimits.maxComputeWorkgroupSizeY,
            deviceLimits.maxComputeWorkgroupSizeZ,
        );
        this._caps.maxComputeWorkGroupCount = new Size(
            deviceLimits.maxComputeWorkgroupsPerDimension,
            deviceLimits.maxComputeWorkgroupsPerDimension,
            deviceLimits.maxComputeWorkgroupsPerDimension,
        );

        const features = device.features;
        // FIXME: require by query
        this._multiDrawIndirect = false;

        this._features.fill(false);
        this._features[Feature.ELEMENT_INDEX_UINT] = true;
        this._features[Feature.INSTANCED_ARRAYS] = true;
        this._features[Feature.MULTIPLE_RENDER_TARGETS] = true;
        this._features[Feature.COMPUTE_SHADER] = true;
        this.initFormatFeatures(features);

        this._queue = this.createQueue(new QueueInfo(QueueType.GRAPHICS));
        this._cmdBuff = this.createCommandBuffer(new CommandBufferInfo(this._queue));

        const texInfo = new TextureInfo(
            TextureType.TEX2D,
            TextureUsageBit.STORAGE | TextureUsageBit.SAMPLED | TextureUsageBit.TRANSFER_DST,
            Format.RGBA8,
            16,
            16,
            TextureFlagBit.NONE,
            1,
            1,
            SampleCount.X1,
            1,
        );
        const defaultDescTexResc = this.createTexture(texInfo);

        const cubeTexInfo = new TextureInfo(
            TextureType.CUBE,
            TextureUsageBit.STORAGE | TextureUsageBit.SAMPLED | TextureUsageBit.TRANSFER_DST,
            Format.RGBA8,
            16,
            16,
            TextureFlagBit.NONE,
            6,
        );
        const defaultDescCubeTexResc = this.createTexture(cubeTexInfo);

        const bufferInfo = new BufferInfo(
            BufferUsageBit.UNIFORM,
            MemoryUsageBit.DEVICE,
            16,
            16, // in bytes
            BufferFlagBit.NONE,
        );
        const defaultDescBuffResc = this.createBuffer(bufferInfo);
        const samplerInfo = new SamplerInfo();
        const defaultDescSmplResc = this.getSampler(samplerInfo);
        const defaultResource = this.defaultResource;
        defaultResource.buffer = defaultDescBuffResc as WebGPUBuffer;
        defaultResource.texture = defaultDescTexResc as WebGPUTexture;
        defaultResource.sampler = defaultDescSmplResc as WebGPUSampler;
        defaultResource.cubeTexture = defaultDescCubeTexResc as WebGPUTexture;
        this._createDefaultDescSet();

        let compressedFormat = '';

        if (this.getFormatFeatures(Format.ETC_RGB8)) {
            compressedFormat += 'etc1 ';
        }

        if (this.getFormatFeatures(Format.ETC2_RGB8)) {
            compressedFormat += 'etc2 ';
        }

        if (this.getFormatFeatures(Format.BC1)) {
            compressedFormat += 'dxt ';
        }

        if (this.getFormatFeatures(Format.PVRTC_RGB2)) {
            compressedFormat += 'pvrtc ';
        }

        if (this.getFormatFeatures(Format.ASTC_RGBA_4X4)) {
            compressedFormat += 'astc ';
        }
        debug('WebGPU device initialized.');
        debug(`RENDERER: ${this._renderer}`);
        debug(`VENDOR: ${this._vendor}`);
        debug(`DESCRIPTION: ${description}`);
        debug(`COMPRESSED_FORMAT: ${compressedFormat}`);
        return Promise.resolve(true);
    }

    public destroy (): void {
        if (this._queue) {
            this._queue.destroy();
            this._queue = null;
        }

        if (this._cmdBuff) {
            this._cmdBuff.destroy();
            this._cmdBuff = null;
        }

        const it = this._samplers.values();
        let res = it.next();
        while (!res.done) {
            (res.value as WebGPUSampler).destroy();
            res = it.next();
        }

        this._samplers.clear();
        this._swapchain?.destroy();
        this._swapchain = null;
        for (const item of [...this.defaultResource.buffersDescLayout.values(), ...this.defaultResource.texturesDescLayout.values(),
            ...this.defaultResource.storageBuffers, this.defaultResource.buffer, this.defaultResource.texture, this.defaultResource.cubeTexture,
            this.defaultResource.descSet, this.defaultResource.setLayout]) item?.destroy();
        this.defaultResource.buffersDescLayout.clear();
        this.defaultResource.texturesDescLayout.clear();
        this._context?.unconfigure();
        this._device?.destroy();
        this._device = null;
        this._context = null;
    }

    public resize (width: number, height: number): void {
        // noop
    }

    public acquire (): void {
        // noop
    }

    get nativeDevice (): GPUDevice | null | undefined {
        return this._device;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    public get glslang () {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this._glslang;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    public get twgsl () {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this._twgsl;
    }

    public present (): void {
        const queue = (this._queue as unknown as WebGPUQueue);
        this._numDrawCalls = queue.numDrawCalls;
        this._numDispatches = queue.numDispatches;
        this._numInstances = queue.numInstances;
        this._numTris = queue.numTris;
        queue.clear();
    }

    public createCommandBuffer (info: CommandBufferInfo): CommandBuffer {
        const cmdBuff = new WebGPUCommandBuffer();
        if (cmdBuff.initialize(info)) {
            return cmdBuff;
        }
        return null!;
    }

    public createBuffer (info: Readonly<BufferInfo> | Readonly<BufferViewInfo>): Buffer {
        const buffer = new WebGPUBuffer();
        buffer.initialize(info);
        return buffer;
    }

    public createTexture (info: Readonly<TextureInfo> | Readonly<TextureViewInfo>): Texture {
        const texture = new WebGPUTexture();
        texture.initialize(info);
        return texture;
    }

    public createDescriptorSet (info: Readonly<DescriptorSetInfo>): DescriptorSet {
        const descriptorSet = new WebGPUDescriptorSet();
        descriptorSet.initialize(info);
        return descriptorSet;
    }

    public createShader (info: Readonly<ShaderInfo>): Shader {
        const shader = new WebGPUShader();
        shader.initialize(info);
        return shader;
    }

    public createInputAssembler (info: Readonly<InputAssemblerInfo>): InputAssembler {
        const inputAssembler = new WebGPUInputAssembler();
        inputAssembler.initialize(info);
        return inputAssembler;
    }

    public createRenderPass (info: Readonly<RenderPassInfo>): RenderPass {
        const renderPass = new WebGPURenderPass();
        renderPass.initialize(info);
        return renderPass;
    }

    public createFramebuffer (info: Readonly<FramebufferInfo>): Framebuffer {
        const framebuffer = new WebGPUFramebuffer();
        framebuffer.initialize(info);
        return framebuffer;
    }

    public createDescriptorSetLayout (info: Readonly<DescriptorSetLayoutInfo>): DescriptorSetLayout {
        const descriptorSetLayout = new WebGPUDescriptorSetLayout();
        descriptorSetLayout.initialize(info);
        return descriptorSetLayout;
    }

    public createPipelineLayout (info: PipelineLayoutInfo): PipelineLayout {
        const pipelineLayout = new WebGPUPipelineLayout();
        if (pipelineLayout.initialize(info)) {
            return pipelineLayout;
        }
        return null!;
    }

    public createPipelineState (info: Readonly<PipelineStateInfo>): PipelineState {
        const pipelineState = new WebGPUPipelineState();
        pipelineState.initialize(info);
        return pipelineState;
    }

    public createQueue (info: QueueInfo): Queue {
        const queue = new WebGPUQueue();
        if (queue.initialize(info)) {
            return queue;
        }
        return null!;
    }

    public copyBuffersToTexture (buffers: ArrayBufferView[], texture: Texture, regions: BufferTextureCopy[]): void {
        WebGPUCmdFuncCopyBuffersToTexture(
            this,
            buffers,
            (texture as unknown as WebGPUTexture).gpuTexture,
            regions,
        );
    }

    public copyTexImagesToTexture (
        texImages: TexImageSource[],
        texture: Texture,
        regions: BufferTextureCopy[],
    ): void {
        WebGPUCmdFuncCopyTexImagesToTexture(
            this,
            texImages,
            (texture as unknown as WebGPUTexture).gpuTexture,
            regions,
        );
    }

    public copyFramebufferToBuffer (
        srcFramebuffer: Framebuffer,
        dstBuffer: ArrayBuffer,
        regions: BufferTextureCopy[],
    ): void {
        // noop
    }

    public blitFramebuffer (src: Framebuffer, dst: Framebuffer, srcRect: Rect, dstRect: Rect, filter: Filter): void {
        // noop
    }
}
