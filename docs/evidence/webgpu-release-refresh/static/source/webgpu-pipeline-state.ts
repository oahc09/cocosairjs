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

import { PipelineState, PipelineStateInfo } from '../base/pipeline-state';
import { IWebGPUGPUInputAssembler, IWebGPUGPUPipelineState } from './webgpu-gpu-objects';
import { WebGPURenderPass } from './webgpu-render-pass';
import { WebGPUShader } from './webgpu-shader';
import { BlendFactor, BlendOp, CullMode, DynamicStateFlagBit, Format, FormatInfos, PipelineBindPoint, PrimitiveMode, ShaderStageFlagBit } from '../base/define';
import { DescriptorSet } from '../base/descriptor-set';
import { WebGPUDescriptorSet } from './webgpu-descriptor-set';
import { WebGPUDescriptorSetLayout } from './webgpu-descriptor-set-layout';
import { DescriptorSetLayoutBinding, DescriptorSetLayoutInfo, PipelineLayoutInfo, DescriptorSetInfo, ViewDimension, SampleType } from '../base/define';
import { WebGPUPipelineLayout } from './webgpu-pipeline-layout';
import {
    GFXFormatToWGPUFormat,
    WebGPUBlendFactors,
    WebGPUBlendOps,
    WebGPUCompereFunc,
    WebGPUStencilOp,
    GFXFormatToWGPUVertexFormat,
    WebGPUBlendMask,
    SEPARATE_SAMPLER_BINDING_OFFSET,
} from './webgpu-commands';
import { WebGPUDeviceManager } from './define';

const WebPUPrimitives: GPUPrimitiveTopology[] = [
    'point-list',
    'line-list',
    'line-strip',
    'line-strip',   // no line_loop in webgpu
    'line-list',
    'line-strip',
    'line-list',
    'triangle-list',
    'triangle-strip',
    'triangle-strip',
    'triangle-list',
    'triangle-strip',
    'triangle-strip',
    'triangle-strip',    // no quad
];

export class WebGPUPipelineState extends PipelineState {
    get gpuPipelineState (): IWebGPUGPUPipelineState {
        return this._gpuPipelineState!;
    }

    private _gpuPipelineState: IWebGPUGPUPipelineState | null = null;
    private _projectedSets: WebGPUDescriptorSet[] = [];
    private _shaderSetLayouts: WebGPUDescriptorSetLayout[] = [];
    public prepareDescriptorSet (set: number, source?: DescriptorSet): WebGPUDescriptorSet {
        const device = WebGPUDeviceManager.instance;
        const owner = this._pipelineLayout as WebGPUPipelineLayout;
        let layout = owner.setLayouts[set];
        const sampleTypes = this._shaderSetLayouts[set].bindings.map((original) => {
            const index = original.binding;
            const present = source?.layout?.bindingIndices[index] !== undefined && source.layout.bindingIndices[index] >= 0;
            const texture = present ? source!.getTexture(index) : null;
            if (texture && (FormatInfos[texture.format].hasDepth
                || ([Format.R32F, Format.RG32F, Format.RGBA32F].includes(texture.format) && !device.floatFilterable))) {
                return SampleType.UNFILTERABLE_FLOAT;
            }
            return original.sampleType;
        });
        if (sampleTypes.some((type, i) => type !== layout.bindings[i].sampleType)) {
            const bindings = this._shaderSetLayouts[set].bindings.map((original, i) => {
                const binding = new DescriptorSetLayoutBinding(); binding.copy(original);
                binding.sampleType = sampleTypes[i]; return binding;
            });
            const previous = layout;
            layout = device.createDescriptorSetLayout(new DescriptorSetLayoutInfo(bindings));
            owner.changeSetLayout(set, layout as WebGPUDescriptorSetLayout);
            this._projectedSets[set]?.destroy(); delete this._projectedSets[set];
            if (previous !== this._shaderSetLayouts[set]) previous.destroy();
            this._gpuPipelineState!.pipelineState!.layout = owner.fetchPipelineLayout();
            this._gpuPipelineState!.nativePipeline = undefined;
        }
        let target = this._projectedSets[set];
        if (!target) target = this._projectedSets[set] = WebGPUDeviceManager.instance.createDescriptorSet(new DescriptorSetInfo(layout)) as WebGPUDescriptorSet;
        for (const binding of layout.bindings) {
            const index = binding.binding;
            const present = source?.layout?.bindingIndices[index] !== undefined && source.layout.bindingIndices[index] >= 0;
            target.bindBuffer(index, (present ? source!.getBuffer(index) : null)!);
            target.bindTexture(index, (present ? source!.getTexture(index) : null)!);
            target.bindSampler(index, (present ? source!.getSampler(index) : null)!);
        }
        target.prepare();
        return target;
    }

    private _locations: Map<string, number> = new Map<string, number>();
    public initialize (info: Readonly<PipelineStateInfo>): void {
        this._primitive = info.primitive;
        this._shader = info.shader;
        const shader = info.shader as WebGPUShader;
        const device = WebGPUDeviceManager.instance;
        const setLayouts: WebGPUDescriptorSetLayout[] = [];
        for (let set = 0; set < 3; set++) {
            const bindings: DescriptorSetLayoutBinding[] = [];
            for (const original of info.pipelineLayout.setLayouts[set]?.bindings || []) {
                const active = shader.gpuShader.bindings.get(set) || [];
                if (!active.includes(original.binding) && !active.includes(original.binding + SEPARATE_SAMPLER_BINDING_OFFSET)) continue;
                if (original.count !== 1) throw new Error('WEBGPU_BINDING_ARRAY_UNSUPPORTED');
                const binding = new DescriptorSetLayoutBinding();
                binding.copy(original);
                binding.stageFlags = 0;
                for (const stage of shader.gpuShader.gpuStages) {
                    if ((stage.bindings[set] || []).some((index) => index === original.binding || index === original.binding + SEPARATE_SAMPLER_BINDING_OFFSET)) binding.stageFlags |= stage.type;
                }
                for (const stage of shader.gpuShader.gpuStages) {
                    const declaration = new RegExp(`@group\\(${set}\\)\\s*@binding\\(${binding.binding}\\)\\s*var(?:<[^>]+>)?\\s+\\w+\\s*:\\s*(\\w+)(?:<([^>]+)>)?`).exec(stage.source);
                    if (!declaration) continue;
                    const nativeType = declaration[1];
                    if (!nativeType.startsWith('texture_')) continue;
                    binding.viewDimension = nativeType.includes('cube_array') ? ViewDimension.TEXCUBE_ARRAY
                        : nativeType.includes('cube') ? ViewDimension.TEXCUBE
                        : nativeType.includes('3d') ? ViewDimension.TEX3D
                        : nativeType.includes('2d_array') ? ViewDimension.TEX2D_ARRAY
                        : nativeType.includes('1d') ? ViewDimension.TEX1D : ViewDimension.TEX2D;
                    if (declaration[2] === 'u32') binding.sampleType = SampleType.UINT;
                    else if (declaration[2] === 'i32') binding.sampleType = SampleType.SINT;
                }
                bindings.push(binding);
            }
            setLayouts.push(device.createDescriptorSetLayout(new DescriptorSetLayoutInfo(bindings)) as WebGPUDescriptorSetLayout);
        }
        this._pipelineLayout = device.createPipelineLayout(new PipelineLayoutInfo(setLayouts));
        this._shaderSetLayouts = setLayouts;
        (this._pipelineLayout as WebGPUPipelineLayout).fetchPipelineLayout();
        this._rs = info.rasterizerState;
        this._dss = info.depthStencilState;
        this._bs = info.blendState;
        this._is = info.inputState;
        this._renderPass = info.renderPass;
        this._dynamicStates = info.dynamicStates;

        const dynamicStates: DynamicStateFlagBit[] = [];
        for (let i = 0; i < 31; i++) {
            if (this._dynamicStates & (1 << i)) {
                dynamicStates.push(1 << i);
            }
        }

        const gpuShader = info.shader as WebGPUShader;
        const pipelineLayoutObj = this._pipelineLayout as WebGPUPipelineLayout;
        const shaderStages = gpuShader.gpuShader.gpuStages;

        if (info.bindPoint === PipelineBindPoint.COMPUTE) {
            // ---- Compute Pipeline ----
            let computeStage: GPUProgrammableStage | undefined;
            const stageSize = shaderStages.length;
            for (let i = 0; i < stageSize; i++) {
                if (shaderStages[i].type === ShaderStageFlagBit.COMPUTE) {
                    computeStage = shaderStages[i].gpuShader!;
                }
            }

            const computeDesc: GPUComputePipelineDescriptor = {
                layout: pipelineLayoutObj.gpuPipelineLayout!.nativePipelineLayout,
                compute: computeStage!,
            };

            this._gpuPipelineState = {
                gpuPrimitive: 'triangle-list' as GPUPrimitiveTopology,
                gpuShader: gpuShader.gpuShader,
                gpuPipelineLayout: pipelineLayoutObj.gpuPipelineLayout,
                rs: info.rasterizerState,
                dss: info.depthStencilState,
                stencilRef: 0,
                bs: info.blendState,
                gpuRenderPass: null,
                dynamicStates,
                pipelineState: computeDesc,
                nativePipeline: undefined,
            };
        } else {
            // ---- Render Pipeline ----
            const constantFactors: BlendFactor[] = [];
            for (const target of this._bs.targets) {
                if (target.blend && target.blendEq !== BlendOp.MIN && target.blendEq !== BlendOp.MAX) {
                    constantFactors.push(target.blendSrc, target.blendDst);
                }
            }
            if (constantFactors.some((factor) => factor === BlendFactor.CONSTANT_ALPHA || factor === BlendFactor.ONE_MINUS_CONSTANT_ALPHA)
                && constantFactors.some((factor) => factor === BlendFactor.CONSTANT_COLOR || factor === BlendFactor.ONE_MINUS_CONSTANT_COLOR)) {
                throw new Error('WEBGPU_MIXED_BLEND_CONSTANT_UNSUPPORTED');
            }
            // colorstates
            const colorAttachments = this._renderPass.colorAttachments;
            const colorDescs: GPUColorTargetState[] = [];
            const colAttachmentSize = colorAttachments.length;
            for (let i = 0; i < colAttachmentSize; i++) {
                const colDesc: GPUColorTargetState = {
                    format: GFXFormatToWGPUFormat(colorAttachments[i].format),
                    writeMask: WebGPUBlendMask(this._bs.targets[i].blendColorMask),
                };
                if (this._bs.targets[i].blend) {
                    const colorMinMax = this._bs.targets[i].blendEq === BlendOp.MIN || this._bs.targets[i].blendEq === BlendOp.MAX;
                    const alphaMinMax = this._bs.targets[i].blendAlphaEq === BlendOp.MIN || this._bs.targets[i].blendAlphaEq === BlendOp.MAX;
                    colDesc.blend = {
                        color: {
                            dstFactor: colorMinMax ? 'one' : WebGPUBlendFactors[this._bs.targets[i].blendDst],
                            operation: WebGPUBlendOps[this._bs.targets[i].blendEq],
                            srcFactor: colorMinMax ? 'one' : WebGPUBlendFactors[this._bs.targets[i].blendSrc],
                        },
                        alpha: {
                            dstFactor: alphaMinMax ? 'one' : WebGPUBlendFactors[this._bs.targets[i].blendDstAlpha],
                            operation: WebGPUBlendOps[this._bs.targets[i].blendAlphaEq],
                            srcFactor: alphaMinMax ? 'one' : WebGPUBlendFactors[this._bs.targets[i].blendSrcAlpha],
                        },
                    };
                }
                colorDescs.push(colDesc);
            }

            let vertexStage: GPUProgrammableStage;
            let fragmentStage: GPUProgrammableStage;
            const stageSize = shaderStages.length;
            for (let i = 0; i < stageSize; i++) {
                if (shaderStages[i].type === ShaderStageFlagBit.VERTEX) { vertexStage = shaderStages[i].gpuShader!; }
                if (shaderStages[i].type === ShaderStageFlagBit.FRAGMENT) { fragmentStage = shaderStages[i].gpuShader!; }
            }

            const shaderAttrs = gpuShader.attributes;
            const attrsSize = shaderAttrs.length;
            for (let i = 0; i < attrsSize; i++) {
                this._locations.set(shaderAttrs[i].name, shaderAttrs[i].location);
            }
            const stripTopology = (info.primitive === PrimitiveMode.LINE_STRIP || info.primitive === PrimitiveMode.TRIANGLE_STRIP);
            const renderPplDesc: GPURenderPipelineDescriptor = {
                layout: pipelineLayoutObj.gpuPipelineLayout!.nativePipelineLayout,
                vertex: {
                    module: vertexStage!.module,
                    entryPoint: vertexStage!.entryPoint,
                    buffers: [],
                },
                primitive: {
                    topology: WebPUPrimitives[info.primitive],
                    frontFace: this._rs.isFrontFaceCCW ? 'ccw' : 'cw',
                    cullMode: this._rs.cullMode === CullMode.NONE ? 'none' : (this._rs.cullMode === CullMode.FRONT) ? 'front' : 'back',
                },

                fragment: {
                    module: fragmentStage!.module,
                    entryPoint: fragmentStage!.entryPoint,
                    targets: colorDescs,
                },
            };
            if (stripTopology) renderPplDesc.primitive!.stripIndexFormat = 'uint16';

            // depthstencil states
            let stencilRef = 0;
            if (this._renderPass.depthStencilAttachment?.format !== Format.UNKNOWN) {
                const dssDesc = {} as GPUDepthStencilState;
                dssDesc.format = GFXFormatToWGPUFormat(this._renderPass.depthStencilAttachment!.format);
                dssDesc.depthWriteEnabled = this._dss.depthWrite;
                dssDesc.depthCompare = this._dss.depthTest ? WebGPUCompereFunc[this._dss.depthFunc] : 'always';
                let stencilReadMask = 0;
                let stencilWriteMask = 0;

                if (this._dss.stencilTestFront) {
                    dssDesc.stencilFront = {
                        compare: WebGPUCompereFunc[this._dss.stencilFuncFront],
                        depthFailOp: WebGPUStencilOp[this._dss.stencilZFailOpFront],
                        passOp: WebGPUStencilOp[this._dss.stencilPassOpFront],
                        failOp: WebGPUStencilOp[this._dss.stencilFailOpFront],
                    };
                    stencilReadMask |= this._dss.stencilReadMaskFront;
                    stencilWriteMask |= this._dss.stencilWriteMaskFront;
                    stencilRef |= this._dss.stencilRefFront;
                }
                if (this._dss.stencilTestBack) {
                    dssDesc.stencilBack = {
                        compare: WebGPUCompereFunc[this._dss.stencilFuncBack],
                        depthFailOp: WebGPUStencilOp[this._dss.stencilZFailOpBack],
                        passOp: WebGPUStencilOp[this._dss.stencilPassOpBack],
                        failOp: WebGPUStencilOp[this._dss.stencilFailOpBack],
                    };
                    stencilReadMask |= this._dss.stencilReadMaskBack;
                    stencilWriteMask |= this._dss.stencilWriteMaskBack;
                    stencilRef |= this._dss.stencilRefBack;
                }
                dssDesc.stencilReadMask = stencilReadMask;
                dssDesc.stencilWriteMask = stencilWriteMask;
                dssDesc.depthBias = this._rs.depthBias;
                dssDesc.depthBiasSlopeScale = this._rs.depthBiasSlop;
                dssDesc.depthBiasClamp = this._rs.depthBiasClamp;
                renderPplDesc.depthStencil = dssDesc;
            }

            this._gpuPipelineState = {
                gpuPrimitive: WebPUPrimitives[info.primitive],
                gpuShader: gpuShader.gpuShader,
                gpuPipelineLayout: pipelineLayoutObj.gpuPipelineLayout,
                rs: info.rasterizerState,
                dss: info.depthStencilState,
                stencilRef,
                bs: info.blendState,
                gpuRenderPass: (info.renderPass as WebGPURenderPass).gpuRenderPass,
                dynamicStates,
                pipelineState: renderPplDesc,
                nativePipeline: undefined,
            };
        }
    }

    protected _getShaderLocation (name: string): number | undefined {
        return this._locations.get(name);
    }

    public updatePipelineLayout (): void {
        if (this._gpuPipelineState && this._gpuPipelineState.pipelineState) {
            this._gpuPipelineState.pipelineState.layout = (this._pipelineLayout as WebGPUPipelineLayout).gpuPipelineLayout!.nativePipelineLayout;
        }
    }

    public prepare (ia: IWebGPUGPUInputAssembler, forceUpdate: boolean = false): void {
        if (this._gpuPipelineState!.nativePipeline && !forceUpdate) {
            return;
        }
        const webgpuDevice = (WebGPUDeviceManager.instance);
        const nativeDevice = webgpuDevice.nativeDevice;

        const pipelineState = this._gpuPipelineState!.pipelineState!;
        // Compute pipeline: no vertex attributes, no multisample
        if ('compute' in pipelineState) {
            const nativePipeline = nativeDevice?.createComputePipeline(
                pipelineState,
            );
            this._gpuPipelineState!.nativePipeline = nativePipeline;
            return;
        }

        // Render pipeline
        const gpuShader = this.shader;
        const shaderAttrs = gpuShader.attributes;
        const vertexAttrs: GPUVertexBufferLayout[] = [];
        const emptyPushAttr: string[] = [];
        const streamCount = ia.gpuVertexBuffers.length;
        for (let i = 0; i < streamCount; i++) {
            const currBufferLayout: GPUVertexBufferLayout = {
                arrayStride: 0,
                attributes: [],
            };
            const currAttrs: GPUVertexAttribute[] = [];
            const shaderAttrSize = shaderAttrs.length;
            for (let j = 0; j < shaderAttrSize; j++) {
                const shaderAttr = shaderAttrs[j];
                let hasAttr = false;
                const gpuAttrSize = ia.gpuAttribs.length;
                for (let k = 0; k < gpuAttrSize; k++) {
                    const gpuAttr = ia.gpuAttribs[k];
                    const attr = ia.attributes[k];
                    if (attr.name === shaderAttr.name) {
                        hasAttr = true;
                        const loc = shaderAttr.location;
                        if (attr.stream === i) {
                            currBufferLayout.arrayStride = gpuAttr.stride;
                            currBufferLayout.stepMode = attr.isInstanced ? 'instance' : 'vertex';
                            const attrLayout: GPUVertexAttribute = {
                                format: GFXFormatToWGPUVertexFormat(attr.format),
                                offset: gpuAttr.offset,
                                shaderLocation: loc,
                            };
                            currAttrs.push(attrLayout);
                        }
                        break;
                    }
                }
                const format = shaderAttr.format;
                if (!hasAttr && !emptyPushAttr.includes(shaderAttr.name)
                    && (FormatInfos[format].size <= ia.gpuVertexBuffers[i].stride)) {
                    emptyPushAttr.push(shaderAttr.name);
                    const attrLayout: GPUVertexAttribute = {
                        format: GFXFormatToWGPUVertexFormat(format),
                        offset: 0,
                        shaderLocation: shaderAttr.location,
                    };
                    currAttrs.push(attrLayout);
                }
            }

            if (currAttrs.length) {
                currBufferLayout.attributes = currAttrs;
                vertexAttrs.push(currBufferLayout);
            }
        }

        pipelineState.vertex.buffers = vertexAttrs;
        pipelineState.multisample = { count: ia.samples };
        const nativePipeline = nativeDevice?.createRenderPipeline(pipelineState);
        this._gpuPipelineState!.nativePipeline = nativePipeline;
    }

    public destroy (): void {
        for (const set of this._projectedSets) set?.destroy();
        this._projectedSets.length = 0;
        for (const layout of new Set([...(this._pipelineLayout?.setLayouts || []), ...this._shaderSetLayouts])) layout.destroy();
        this._shaderSetLayouts.length = 0;
        this._pipelineLayout?.destroy();
        this._gpuPipelineState = null;
    }
}
