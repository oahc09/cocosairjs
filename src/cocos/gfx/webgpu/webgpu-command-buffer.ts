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
import {
    BufferUsageBit,
    BlendFactor,
    BlendOp,
    CommandBufferType,
    StencilFace,
    BufferSource,
    DrawInfo,
    CommandBufferInfo,
    BufferTextureCopy,
    Color,
    Rect,
    Viewport,
    Filter,
    TextureBlit,
    DescriptorSetInfo,
    Format,
    DispatchInfo,
} from '../base/define';
import { Framebuffer } from '../base/framebuffer';
import { InputAssembler } from '../base/input-assembler';
import { PipelineState } from '../base/pipeline-state';
import { Texture } from '../base/texture';
import { WebGPUDescriptorSetLayout } from './webgpu-descriptor-set-layout';
import { WebGPUDescriptorSet } from './webgpu-descriptor-set';
import { WebGPUBuffer } from './webgpu-buffer';
import { WebGPUCommandAllocator } from './webgpu-command-allocator';
import {
    clearRect,
    WebGPUCmdPackage,
} from './webgpu-commands';
import { WebGPUFramebuffer } from './webgpu-framebuffer';
import {
    IWebGPUGPUInputAssembler,
    IWebGPUGPUDescriptorSet,
    IWebGPUGPUPipelineState,
    IWebGPUGPUPipelineLayout,
} from './webgpu-gpu-objects';
import { WebGPUInputAssembler } from './webgpu-input-assembler';
import { WebGPUPipelineState } from './webgpu-pipeline-state';
import { WebGPUTexture } from './webgpu-texture';
import { RenderPass } from '../base/render-pass';
import { WebGPURenderPass } from './webgpu-render-pass';
import { INT_MAX } from '../../core/math/bits';
import { GeneralBarrier } from '../base/states/general-barrier';
import { TextureBarrier } from '../base/states/texture-barrier';
import { BufferBarrier } from '../base/states/buffer-barrier';
import { WebGPUCmdFuncUpdateBuffer, WebGPUCmdFuncBlitTexture, WebGPUCmdFuncCopyBuffersToTexture } from './webgpu-commands';
import { WebGPUDeviceManager } from './define';
import { WebGPUSwapchain } from './webgpu-swapchain';
import { WebGPUPipelineLayout } from './webgpu-pipeline-layout';
import { error, errorID } from '../../core';

export interface IWebGPUDepthBias {
    constantFactor: number;
    clamp: number;
    slopeFactor: number;
}

export interface IWebGPUDepthBounds {
    minBounds: number;
    maxBounds: number;
}

export interface IWebGPUStencilWriteMask {
    face: StencilFace;
    writeMask: number;
}

export interface IWebGPUStencilCompareMask {
    face: StencilFace;
    reference: number;
    compareMask: number;
}

interface CommandEncoder { commandEncoder: GPUCommandEncoder, renderPassEncoder: GPURenderPassEncoder }
let currPipelineState: WebGPUPipelineState | null = null;
const descriptorSets: WebGPUDescriptorSet[] = [];
const groupSets: number[] = [0, 1, 2];
const renderAreas: Rect[] = [];
let samples: number = 1;
export class WebGPUCommandBuffer extends CommandBuffer {
    public pipelineBarrier (
        barrier: Readonly<GeneralBarrier> | null,
        bufferBarriers?: readonly BufferBarrier[] | undefined,
        buffers?: readonly Buffer[] | undefined,
        textureBarriers?: readonly TextureBarrier[] | undefined,
        textures?: readonly Texture[] | undefined,
    ): void {
        if (this._isInRenderPass) throw new Error('WEBGPU_BARRIER_IN_RENDER_PASS');
        this.submitComputePass();
    }
    public blitTexture (srcTexture: Readonly<Texture>, dstTexture: Texture, regions: readonly TextureBlit[], filter: Filter): void {
        if (this._isInRenderPass) throw new Error('WEBGPU_COPY_IN_RENDER_PASS');
        this.submitComputePass();
        WebGPUCmdFuncBlitTexture(WebGPUDeviceManager.instance, srcTexture, dstTexture, regions, filter);
    }

    public cmdPackage: WebGPUCmdPackage = new WebGPUCmdPackage();
    protected _webGPUAllocator: WebGPUCommandAllocator | null = null;
    protected _isInRenderPass = false;
    protected _curGPUPipelineState: IWebGPUGPUPipelineState | null = null;
    protected _curWebGPUPipelineState: WebGPUPipelineState | null = null;
    protected _curGPUDescriptorSets: IWebGPUGPUDescriptorSet[] = [];
    protected _curGPUInputAssembler: IWebGPUGPUInputAssembler | null = null;
    protected _curDynamicOffsets: number[][] = [];
    protected _curViewport: Viewport | null = null;
    protected _curScissor: Rect | null = null;
    protected _curLineWidth: number | null = null;
    protected _curDepthBias: IWebGPUDepthBias | null = null;
    protected _curBlendConstants: number[] = [];
    protected _curDepthBounds: IWebGPUDepthBounds | null = null;
    protected _curStencilWriteMask: IWebGPUStencilWriteMask | null = null;
    protected _curStencilCompareMask: IWebGPUStencilCompareMask | null = null;
    protected _isStateValid = false;
    protected _globalDescriptors: WebGPUDescriptorSet[] = [];

    private _nativeCommandBuffer: GPUCommandBuffer | null = null;
    private _encoder: CommandEncoder | undefined = undefined;
    private _descSetDirtyIndex: number = INT_MAX;
    private _nativePassDesc: GPURenderPassDescriptor | null = null;
    private _wgpuRenderPass!: WebGPURenderPass;

    private _renderPassFuncQueue: ((renPassEncoder: GPURenderPassEncoder) => void)[] = [];
    private _computeFuncQueue: ((computePassEncoder: GPUComputePassEncoder) => void)[] = [];

    public initialize (info: CommandBufferInfo): boolean {
        this._type = info.type;
        this._queue = info.queue;
        const device = WebGPUDeviceManager.instance;
        this._webGPUAllocator = device.cmdAllocator;
        this._encoder = {} as CommandEncoder;

        const setCount = device.bindingMappings.blockOffsets.length;
        for (let i = 0; i < setCount; i++) {
            this._curGPUDescriptorSets.push(null!);
            this._curDynamicOffsets.push([]);
        }

        return true;
    }

    public destroy (): void {
        if (this._webGPUAllocator) {
            this._webGPUAllocator.clearCmds(this.cmdPackage);
            this._webGPUAllocator = null;
        }
    }

    public begin (renderPass?: RenderPass, subpass?: number, frameBuffer?: Framebuffer): void {
        if (WebGPUDeviceManager.instance.isLost) throw new Error('WEBGPU_DEVICE_LOST');
        this._webGPUAllocator!.clearCmds(this.cmdPackage);
        renderAreas.length = 0;
        this._curGPUPipelineState = null;
        this._curGPUInputAssembler = null;
        this._curGPUDescriptorSets.length = 0;
        const dynamicOffsetSize = this._curDynamicOffsets.length;
        for (let i = 0; i < dynamicOffsetSize; i++) {
            this._curDynamicOffsets[i].length = 0;
        }
        this._curViewport = null;
        this._curScissor = null;
        this._curLineWidth = null;
        this._curDepthBias = null;
        this._curBlendConstants.length = 0;
        this._curDepthBounds = null;
        this._curStencilWriteMask = null;
        this._curStencilCompareMask = null;
        this._numDrawCalls = 0;
        this._numDispatches = 0;
        this._numInstances = 0;
        this._numTris = 0;
        this._computeFuncQueue.length = 0;
    }

    public end (): void {
        if (this._isInRenderPass) throw new Error('WEBGPU_RENDER_PASS_NOT_ENDED');
        this.submitComputePass();
        this._isStateValid = false;
        this._isInRenderPass = false;
        this._computeFuncQueue.length = 0;
    }

    public beginRenderPass (
        renderPass: RenderPass,
        framebuffer: Framebuffer,
        renderArea: Rect,
        clearColors: Color[],
        clearDepth: number,
        clearStencil: number,
    ): void {
        this.submitComputePass();
        const device = WebGPUDeviceManager.instance;
        if (device.isLost) throw new Error('WEBGPU_DEVICE_LOST');
        const gpuDevice = device;
        this._wgpuRenderPass = renderPass as WebGPURenderPass;
        const nativePassDesc = this._nativePassDesc = this._wgpuRenderPass.gpuRenderPass.nativeRenderPass!;
        const originalRP = this._wgpuRenderPass.gpuRenderPass.originalRP!;
        const gpuFramebuffer = (framebuffer as WebGPUFramebuffer).gpuFramebuffer;
        renderAreas.push(renderArea);
        let needPartialClear = false;
        samples = 1;
        const renderingFullScreen = gpuFramebuffer.gpuColorTextures.every((val) => {
            if (renderArea.x !== 0 || renderArea.y !== 0 || renderArea.width !== val.width || renderArea.height !== val.height) {
                return false;
            }
            return true;
        });
        const swapchain = gpuDevice.getSwapchains()[0] as WebGPUSwapchain;
        const clearColorSize = clearColors.length;
        for (let i = 0; i < clearColorSize; i++) {
            let colorTex: GPUTextureView;
            let currGPUTex;
            if (gpuFramebuffer.isOffscreen) {
                currGPUTex = gpuFramebuffer.gpuColorTextures[i];
                colorTex = currGPUTex.getTextureView()!;
            } else {
                colorTex = swapchain.colorGPUTextureView;
            }
            colorTex.label = gpuFramebuffer.isOffscreen ? 'offscreen' : 'swapchain';
            if (!renderingFullScreen) {
                needPartialClear = originalRP.colorAttachments[i].loadOp === 'clear';
                if (renderAreas.length > 1) {
                    nativePassDesc.colorAttachments[i].loadOp = 'load';
                }
            }
            nativePassDesc.colorAttachments[i].view = colorTex;
            if (currGPUTex && currGPUTex.resolveTex) {
                samples = currGPUTex.samples;
                nativePassDesc.colorAttachments[i].resolveTarget = currGPUTex.resolveTex.gpuTexture.createView();
            }
            nativePassDesc.colorAttachments[i].clearValue = [clearColors[i].x, clearColors[i].y, clearColors[i].z, clearColors[i].w];
        }

        if (this._wgpuRenderPass.depthStencilAttachment?.format !== Format.UNKNOWN) {
            const tex = gpuFramebuffer.gpuDepthStencilTexture?.gpuTexture;
            const depthTex = tex ? gpuFramebuffer.gpuDepthStencilTexture!.getTextureView()! : swapchain.gpuDepthStencilTextureView;
            const depthStencilAttachment = nativePassDesc.depthStencilAttachment!;
            depthStencilAttachment.view = depthTex;
            depthStencilAttachment.depthClearValue = clearDepth;
            if (depthStencilAttachment.stencilLoadOp !== undefined) depthStencilAttachment.stencilClearValue = clearStencil;
        }

        renderArea.x = Math.floor(renderArea.x);
        renderArea.y = Math.floor(renderArea.y);
        renderArea.width = Math.floor(renderArea.width);
        renderArea.height = Math.floor(renderArea.height);
        const vpfunc = (passEncoder: GPURenderPassEncoder): void => {
            passEncoder.setViewport(renderArea.x, renderArea.y, renderArea.width, renderArea.height, 0.0, 1.0);
        };
        const srfunc = (passEncoder: GPURenderPassEncoder): void => {
            passEncoder.setScissorRect(renderArea.x, renderArea.y, renderArea.width, renderArea.height);
        };

        this._renderPassFuncQueue.push(vpfunc);
        this._renderPassFuncQueue.push(srfunc);

        if (!renderingFullScreen && needPartialClear) {
            let idx = 0;
            gpuFramebuffer.gpuColorTextures.forEach((tex) => {
                clearRect(device, tex, renderArea, clearColors[idx]);
                idx++;
            });
        }

        this._isInRenderPass = true;
    }

    public endRenderPass (): void {
        const device = WebGPUDeviceManager.instance;
        const nativeDevice = (device).nativeDevice!;
        const cmdEncoder = nativeDevice.createCommandEncoder();
        const passEncoder = cmdEncoder.beginRenderPass(this._nativePassDesc!);
        this._renderPassFuncQueue.forEach((cb) => {
            cb(passEncoder);
        });

        passEncoder.end();
        nativeDevice?.queue.submit([cmdEncoder.finish()]);
        let idx = 0;
        for (const attachment of this._nativePassDesc!.colorAttachments) {
            attachment!.loadOp = this._wgpuRenderPass.gpuRenderPass.originalRP!.colorAttachments[idx].loadOp;
            idx++;
        }
        this._isInRenderPass = false;
        this._isStateValid = false;
        this._renderPassFuncQueue.length = 0;
    }

    public bindPipelineState (pipelineState: PipelineState): void {
        const webgpuPipelineState = (pipelineState as WebGPUPipelineState);
        const gpuPipelineState = webgpuPipelineState.gpuPipelineState;
        if (gpuPipelineState !== this._curGPUPipelineState) {
            this._curWebGPUPipelineState = webgpuPipelineState;
            this._curGPUPipelineState = gpuPipelineState;
            currPipelineState = webgpuPipelineState;
            this._isStateValid = true;
        }
    }

    public bindDescriptorSet (set: number, descriptorSet: DescriptorSet, dynamicOffsets?: number[]): void {
        const gpuDescriptorSets = (descriptorSet as unknown as WebGPUDescriptorSet).gpuDescriptorSet;
        if (gpuDescriptorSets !== this._curGPUDescriptorSets[set]) {
            this._curGPUDescriptorSets[set] = gpuDescriptorSets;
            descriptorSets[set] = descriptorSet as WebGPUDescriptorSet;
            this._isStateValid = true;
        }
        if (dynamicOffsets && dynamicOffsets.length) {
            const offsets = this._curDynamicOffsets[set];
            const dynamicOffsetSize = dynamicOffsets.length;
            for (let i = 0; i < dynamicOffsetSize; i++) offsets[i] = dynamicOffsets[i];
            offsets.length = dynamicOffsetSize;
            this._isStateValid = true;
        }
    }

    public bindInputAssembler (inputAssembler: InputAssembler): void {
        const gpuInputAssembler = (inputAssembler as unknown as WebGPUInputAssembler).gpuInputAssembler;
        this._curGPUInputAssembler = gpuInputAssembler;
        this._isStateValid = true;
    }

    public setViewport (viewport: Viewport): void {
        viewport.left = Math.floor(viewport.left);
        viewport.top = Math.floor(viewport.top);
        viewport.width = Math.floor(viewport.width);
        viewport.height = Math.floor(viewport.height);

        this._curViewport = new Viewport(viewport.left, viewport.top, viewport.width, viewport.height, viewport.minDepth, viewport.maxDepth);
        const vpfunc = (passEncoder: GPURenderPassEncoder): void => {
            passEncoder.setViewport(
                viewport.left,
                viewport.top,
                viewport.width,
                viewport.height,
                viewport.minDepth,
                viewport.maxDepth,
            );
        };
        this._renderPassFuncQueue.push(vpfunc);
        this._isStateValid = true;
    }

    public setScissor (scissor: Rect): void {
        scissor.x = Math.floor(scissor.x);
        scissor.y = Math.floor(scissor.y);
        scissor.width = Math.floor(scissor.width);
        scissor.height = Math.floor(scissor.height);
        const srfunc = (passEncoder: GPURenderPassEncoder): void => {
            passEncoder.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
        };
        this._renderPassFuncQueue.push(srfunc);
        this._isStateValid = true;
    }

    public setLineWidth (lineWidth: number): void {
        error('line width not supproted by webGPU');
    }

    public setDepthBias (depthBiasConstantFactor: number, depthBiasClamp: number, depthBiasSlopeFactor: number): void {
        if (!this._curDepthBias) {
            this._curDepthBias = {
                constantFactor: depthBiasConstantFactor,
                clamp: depthBiasClamp,
                slopeFactor: depthBiasSlopeFactor,
            };
            this._isStateValid = true;
        } else if (this._curDepthBias.constantFactor !== depthBiasConstantFactor
            || this._curDepthBias.clamp !== depthBiasClamp
            || this._curDepthBias.slopeFactor !== depthBiasSlopeFactor) {
            this._curDepthBias.constantFactor = depthBiasConstantFactor;
            this._curDepthBias.clamp = depthBiasClamp;
            this._curDepthBias.slopeFactor = depthBiasSlopeFactor;
            this._isStateValid = true;
        }
    }

    public setBlendConstants (blendConstants: Color): void {
        if (
            this._curBlendConstants[0] !== blendConstants.x
            || this._curBlendConstants[1] !== blendConstants.y
            || this._curBlendConstants[2] !== blendConstants.z
            || this._curBlendConstants[3] !== blendConstants.w) {
            this._curBlendConstants.length = 0;
            Array.prototype.push.apply(this._curBlendConstants, [blendConstants.x, blendConstants.y, blendConstants.z, blendConstants.w]);
            this._isStateValid = true;
        }
    }

    public setDepthBound (minDepthBounds: number, maxDepthBounds: number): void {
        if (!this._curDepthBounds) {
            this._curDepthBounds = {
                minBounds: minDepthBounds,
                maxBounds: maxDepthBounds,
            };
            this._isStateValid = true;
        } else if (this._curDepthBounds.minBounds !== minDepthBounds
            || this._curDepthBounds.maxBounds !== maxDepthBounds) {
            this._curDepthBounds = {
                minBounds: minDepthBounds,
                maxBounds: maxDepthBounds,
            };
            this._isStateValid = true;
        }
    }

    public setStencilWriteMask (face: StencilFace, writeMask: number): void {
        if (!this._curStencilWriteMask) {
            this._curStencilWriteMask = {
                face,
                writeMask,
            };
            this._isStateValid = true;
        } else if (this._curStencilWriteMask.face !== face
            || this._curStencilWriteMask.writeMask !== writeMask) {
            this._curStencilWriteMask.face = face;
            this._curStencilWriteMask.writeMask = writeMask;
            this._isStateValid = true;
        }
    }

    public setStencilCompareMask (face: StencilFace, reference: number, compareMask: number): void {
        if (!this._curStencilCompareMask) {
            this._curStencilCompareMask = {
                face,
                reference,
                compareMask,
            };
            this._isStateValid = true;
        } else if (this._curStencilCompareMask.face !== face
            || this._curStencilCompareMask.reference !== reference
            || this._curStencilCompareMask.compareMask !== compareMask) {
            this._curStencilCompareMask.face = face;
            this._curStencilCompareMask.reference = reference;
            this._curStencilCompareMask.compareMask = compareMask;
            this._isStateValid = true;
        }
    }

    public draw (inputAssembler: InputAssembler): void {
        const device = WebGPUDeviceManager.instance;
        if (this._type === CommandBufferType.PRIMARY && !this._isInRenderPass) {
            errorID(16328);
            return;
        }
        if (this._isStateValid) {
            this.bindStates();
        }

        const ia = inputAssembler as unknown as WebGPUInputAssembler;
        const iaData = ia.gpuInputAssembler;

        const nativeDevice = device;

        if (ia.indirectBuffer) {
            const buffer = iaData.gpuIndirectBuffer!;
            const infos = buffer.indirects.map((info) => new DrawInfo().copy(info));
            this._renderPassFuncQueue.push((encoder) => {
                if (!infos.length) {
                    const stride = buffer.stride;
                    if (stride !== 16 && stride !== 20) throw new Error('WEBGPU_INDIRECT_STRIDE_UNSUPPORTED');
                    for (let offset = 0; offset + stride <= buffer.size; offset += stride) {
                        if (stride === 20) encoder.drawIndexedIndirect(buffer.gpuBuffer!, buffer.gpuOffset + offset);
                        else encoder.drawIndirect(buffer.gpuBuffer!, buffer.gpuOffset + offset);
                    }
                }
                for (const info of infos) {
                    if (info.indexCount) encoder.drawIndexed(info.indexCount, Math.max(1, info.instanceCount), info.firstIndex, info.vertexOffset, info.firstInstance);
                    else encoder.draw(info.vertexCount, Math.max(1, info.instanceCount), info.firstVertex, info.firstInstance);
                }
            });
        } else {
            const instanceCount = inputAssembler.instanceCount > 0 ? inputAssembler.instanceCount : 1;
            const drawByIndex = inputAssembler.indexBuffer && (ia.indexCount > 0);

            if (drawByIndex) {
                const drawFunc = (passEncoder: GPURenderPassEncoder): void => {
                    const instanceCount = Math.max(ia.instanceCount, 1);
                    passEncoder?.drawIndexed(ia.indexCount, instanceCount, ia.firstIndex, ia.firstVertex, ia.firstInstance);
                };
                this._renderPassFuncQueue.push(drawFunc);
            } else {
                const drawFunc = (passEncoder: GPURenderPassEncoder): void => {
                    const instanceCount = Math.max(ia.instanceCount, 1);
                    passEncoder?.draw(ia.vertexCount, instanceCount, ia.firstVertex, ia.firstInstance);
                };
                this._renderPassFuncQueue.push(drawFunc);
            }
        }

        ++this._numDrawCalls;
        this._numInstances += inputAssembler.instanceCount;
        const indexCount = inputAssembler.indexCount || inputAssembler.vertexCount;
        if (this._curGPUPipelineState) {
            const gpuPrimitive = this._curGPUPipelineState.gpuPrimitive;
            switch (gpuPrimitive) {
            case 'triangle-strip':
                this._numTris += (indexCount - 2) * Math.max(inputAssembler.instanceCount, 1);
                break;
            case 'triangle-list': {
                this._numTris += indexCount / 3 * Math.max(inputAssembler.instanceCount, 1);
                break;
            }
            default:
                break;
            }
        }
    }

    public updateBuffer (buffer: Buffer, data: BufferSource, size?: number): void {
        if (this._type === CommandBufferType.PRIMARY && this._isInRenderPass) {
            errorID(16329);
            return;
        }
        const gpuBuffer = (buffer as unknown as WebGPUBuffer).gpuBuffer;
        if (!gpuBuffer) {
            return;
        }
        this.submitComputePass();
        const byteCount = size ?? (data as ArrayBuffer).byteLength;
        WebGPUCmdFuncUpdateBuffer(WebGPUDeviceManager.instance, gpuBuffer, data, gpuBuffer.gpuOffset, byteCount);

    }

    public copyBuffersToTexture (buffers: ArrayBufferView[], texture: Texture, regions: BufferTextureCopy[]): void {
        if (this._type === CommandBufferType.PRIMARY && this._isInRenderPass) {
            errorID(16330);
            return;
        }
        const gpuTexture = (texture as WebGPUTexture).gpuTexture;
        if (!gpuTexture) {
            return;
        }
        this.submitComputePass();
        WebGPUCmdFuncCopyBuffersToTexture(WebGPUDeviceManager.instance, buffers, gpuTexture, regions);
    }

    public execute (cmdBuffs: CommandBuffer[], count: number): void {
        if (count) throw new Error('WEBGPU_SECONDARY_COMMAND_BUFFERS_UNSUPPORTED');
    }

    private _preparedDescriptorSets: WebGPUDescriptorSet[] = [];

    private _prepareDescriptorSets (): void {
        for (const set of groupSets) {
            this._preparedDescriptorSets[set] = this._curWebGPUPipelineState!.prepareDescriptorSet(set, descriptorSets[set]);
        }
    }

    /**
     * Collect the bind groups and dynamic offsets for the currently bound descriptor sets.
     * Shared by the draw (bindStates) and compute (dispatch) paths.
     */
    private _collectBindGroups (): { wgpuBindGroups: GPUBindGroup[]; wgpuDynOffsets: number[][] } {
        const currGPUDescSize = groupSets.length;
        const wgpuBindGroups = new Array<GPUBindGroup>(currGPUDescSize);
        const wgpuDynOffsets = new Array<number[]>(currGPUDescSize);
        for (let i = 0; i < currGPUDescSize; i++) {
            const currSetIdx = groupSets[i];
            const descObj = this._preparedDescriptorSets[currSetIdx];
            const curGpuDesc = descObj.gpuDescriptorSet;
            wgpuBindGroups[currSetIdx] = curGpuDesc.bindGroup;
            const originalDynamic = (descriptorSets[currSetIdx]?.layout as WebGPUDescriptorSetLayout | undefined)?.gpuDescriptorSetLayout?.dynamicBindings || [];
            wgpuDynOffsets[currSetIdx] = descObj.dynamicOffsets.map((binding) => this._curDynamicOffsets[currSetIdx]?.[originalDynamic.indexOf(binding)] || 0);
            if (!descObj.dynamicOffsetCount) {
                wgpuDynOffsets[currSetIdx] = [];
            } else if (descObj.dynamicOffsetCount !== wgpuDynOffsets[currSetIdx].length) {
                wgpuDynOffsets[currSetIdx].length = descObj.dynamicOffsetCount;
                for (let j = 0; j < descObj.dynamicOffsetCount; j++) {
                    const currOffset = wgpuDynOffsets[currSetIdx][j];
                    if (!currOffset) {
                        wgpuDynOffsets[currSetIdx][j] = 0;
                    } else {
                        const currBind = descObj.dynamicOffsets[j];
                        const bindObj = descObj.gpuDescriptorSet.gpuDescriptors[currBind];
                        if (bindObj && bindObj.gpuBuffer && currOffset > bindObj.gpuBuffer.gpuBuffer!.size) {
                            wgpuDynOffsets[currSetIdx][j] = 0;
                        }
                    }
                }
            }
        }
        return { wgpuBindGroups, wgpuDynOffsets };
    }

    public dispatch (info: DispatchInfo): void {
        if (this._isInRenderPass) throw new Error('WEBGPU_COMPUTE_IN_RENDER_PASS');
        const indirect = (info.indirectBuffer as WebGPUBuffer | null)?.gpuBuffer;
        if (info.indirectBuffer && !indirect) throw new Error('WEBGPU_INDIRECT_DISPATCH_RANGE');
        const indirectOffset = (indirect?.gpuOffset || 0) + info.indirectOffset;
        if (indirect && (!(indirect.usage & BufferUsageBit.INDIRECT) || !Number.isInteger(indirectOffset)
            || indirectOffset < 0 || indirectOffset % 4 || info.indirectOffset + 12 > indirect.size)) {
            throw new Error('WEBGPU_INDIRECT_DISPATCH_RANGE');
        }
        const limits = WebGPUDeviceManager.instance.capabilities.maxComputeWorkGroupCount;
        if (!indirect && (![info.groupCountX, info.groupCountY, info.groupCountZ].every((n) => Number.isInteger(n) && n >= 0)
            || info.groupCountX > limits.x || info.groupCountY > limits.y || info.groupCountZ > limits.z)) {
            throw new Error('WEBGPU_DISPATCH_LIMIT');
        }
        if (!this._curGPUPipelineState) {
            return;
        }
        // Prepare descriptor sets (same logic as bindStates)
        this._prepareDescriptorSets();

        // Create compute pipeline
        this._curWebGPUPipelineState!.prepare(null!);

        const computePipeline = this._curGPUPipelineState.nativePipeline as GPUComputePipeline;

        // Build bind groups for compute pass
        const { wgpuBindGroups, wgpuDynOffsets } = this._collectBindGroups();

        const { groupCountX, groupCountY, groupCountZ } = info;
        const func = (passEncoder: GPUComputePassEncoder): void => {
            passEncoder.setPipeline(computePipeline);
            const gpuBindGroupSize = wgpuBindGroups.length;
            for (let i = 0; i < gpuBindGroupSize; i++) {
                passEncoder.setBindGroup(i, wgpuBindGroups[i], wgpuDynOffsets[i]);
            }
            if (indirect) passEncoder.dispatchWorkgroupsIndirect(indirect.gpuBuffer!, indirectOffset);
            else passEncoder.dispatchWorkgroups(groupCountX, groupCountY, groupCountZ);
        };
        this._computeFuncQueue.push(func);
        ++this._numDispatches;
        this._isStateValid = false;
    }

    public submitComputePass (): void {
        if (WebGPUDeviceManager.instance.isLost) throw new Error('WEBGPU_DEVICE_LOST');
        if (this._computeFuncQueue.length === 0) {
            return;
        }
        const device = WebGPUDeviceManager.instance;
        const nativeDevice = device.nativeDevice!;
        const cmdEncoder = nativeDevice.createCommandEncoder();
        const computePassEncoder = cmdEncoder.beginComputePass();
        this._computeFuncQueue.forEach((cb) => {
            cb(computePassEncoder);
        });
        computePassEncoder.end();
        nativeDevice.queue.submit([cmdEncoder.finish()]);
        this._computeFuncQueue.length = 0;
    }

    protected bindStates (): void {
        if (!this._curGPUPipelineState) {
            return;
        }
        const gpuPipelineLayout = this._curGPUPipelineState.gpuPipelineLayout as IWebGPUGPUPipelineLayout;
        this._prepareDescriptorSets();
        const gpuIA = this._curGPUInputAssembler!;
        // only 4x MSAA is supported
        gpuIA.samples = samples > 1 ? 4 : 1;
        this._curWebGPUPipelineState!.prepare(gpuIA);
        // ----------------------------wgpu pipline state-----------------------------
        const wgpuPipeline = this._curGPUPipelineState.nativePipeline as GPURenderPipeline;
        const pplFunc = (passEncoder: GPURenderPassEncoder): void => {
            passEncoder.setPipeline(wgpuPipeline);
        };
        this._renderPassFuncQueue.push(pplFunc);
        const pipelineDesc = this._curGPUPipelineState.pipelineState;
        if (pipelineDesc && 'depthStencil' in pipelineDesc && pipelineDesc.depthStencil) {
            const stencilRef = this._curGPUPipelineState.stencilRef;
            const stencilRefFunc = (passEncoder: GPURenderPassEncoder): void => {
                passEncoder.setStencilReference(stencilRef);
            };
            this._renderPassFuncQueue.push(stencilRefFunc);
        }
        const { wgpuBindGroups, wgpuDynOffsets } = this._collectBindGroups();

        const bgfunc = (passEncoder: GPURenderPassEncoder): void => {
            const gpuBindGroupSize = wgpuBindGroups.length;
            for (let i = 0; i < gpuBindGroupSize; i++) {
                // FIXME: this is a special sentence that 2 in 3 parameters I'm not certain.
                passEncoder.setBindGroup(i, wgpuBindGroups[i], wgpuDynOffsets[i]);
            }
        };
        this._renderPassFuncQueue.push(bgfunc);

        // ---------------------------- wgpu input assembly  -----------------------------
        const ia = gpuIA;
        const wgpuVertexBuffers = new Array<{ slot: number, buffer: GPUBuffer, offset: number }>(ia.gpuVertexBuffers.length);
        const gpuVertBuffSize = ia.gpuVertexBuffers.length;
        for (let i = 0; i < gpuVertBuffSize; i++) {
            wgpuVertexBuffers[i] = { slot: i, buffer: ia.gpuVertexBuffers[i].gpuBuffer!, offset: ia.gpuVertexBuffers[i].gpuOffset };
        }
        const vbFunc = (passEncoder: GPURenderPassEncoder): void => {
            const vertBuffSize = wgpuVertexBuffers.length;
            for (let i = 0; i < vertBuffSize; i++) {
                passEncoder.setVertexBuffer(wgpuVertexBuffers[i].slot, wgpuVertexBuffers[i].buffer, wgpuVertexBuffers[i].offset);
            }
        };
        this._renderPassFuncQueue.push(vbFunc);
        if (ia.gpuIndexBuffer) {
            const wgpuIndexBuffer: { indexType: GPUIndexFormat, buffer: GPUBuffer, offset: number, size: number } = {
                indexType: ia.gpuIndexType,
                buffer: ia.gpuIndexBuffer.gpuBuffer as GPUBuffer,
                offset: ia.gpuIndexBuffer.gpuOffset,
                size: ia.gpuIndexBuffer.size,
            };
            const ibFunc = (passEncoder: GPURenderPassEncoder): void => {
                passEncoder.setIndexBuffer(
                    wgpuIndexBuffer.buffer,
                    wgpuIndexBuffer.indexType,
                    wgpuIndexBuffer.offset,
                    wgpuIndexBuffer.size,
                );
            };
            this._renderPassFuncQueue.push(ibFunc);
        }
        const color = this._curGPUPipelineState.bs.blendColor;
        const constants = this._curBlendConstants.length ? this._curBlendConstants.slice() : [color.x, color.y, color.z, color.w];
        const alphaOnly = this._curGPUPipelineState.bs.targets.some((target) => target.blend
            && target.blendEq !== BlendOp.MIN && target.blendEq !== BlendOp.MAX
            && [target.blendSrc, target.blendDst].some((factor) => factor === BlendFactor.CONSTANT_ALPHA
                || factor === BlendFactor.ONE_MINUS_CONSTANT_ALPHA));
        const value = alphaOnly ? [constants[3], constants[3], constants[3], constants[3]] : constants;
        this._renderPassFuncQueue.push((passEncoder): void => { passEncoder.setBlendConstant(value); });

        this._isStateValid = false;
    }
}
