/*
 Copyright (c) 2020-2023 Xiamen Yaji Software Co., Ltd.

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

import { Shader, RenderPass, InputAssembler, Device, PipelineState, InputState, PipelineStateInfo, PipelineBindPoint } from '../gfx';
import { Pass } from '../render-scene/core/pass';

type ShaderPipelines = Map<number, PipelineState>;
type InputPipelines = Map<number, ShaderPipelines>;
type RenderPassPipelines = Map<number, InputPipelines>;

export class PipelineStateManager {
    private constructor () {}

    private static _PSOHashMap: Map<number, RenderPassPipelines> = new Map();

    private static _computePSOHashMap: Map<number, ShaderPipelines> = new Map();

    // pass is only needed on TS.
    static getOrCreatePipelineState (device: Device, pass: Pass, shader: Shader, renderPass: RenderPass, ia: InputAssembler): PipelineState {
        const hash1 = pass.hash;
        const hash2 = renderPass.hash;
        const hash3 = ia.attributesHash;
        const hash4 = shader.typedID;

        // Preserve every component and its position: XOR loses both, so different
        // shader/state tuples can otherwise reuse the first tuple's pipeline.
        // Nested numeric maps allocate only on misses, never on a warmed draw path.
        let renderPasses = this._PSOHashMap.get(hash1);
        if (!renderPasses) { this._PSOHashMap.set(hash1, renderPasses = new Map()); }
        let inputs = renderPasses.get(hash2);
        if (!inputs) { renderPasses.set(hash2, inputs = new Map()); }
        let shaders = inputs.get(hash3);
        if (!shaders) { inputs.set(hash3, shaders = new Map()); }
        let pso = shaders.get(hash4);
        if (!pso) {
            const pipelineLayout = pass.pipelineLayout;
            const inputState = new InputState(ia.attributes);
            const psoInfo = new PipelineStateInfo(
                shader,
                pipelineLayout,
                renderPass,
                inputState,
                pass.rasterizerState,
                pass.depthStencilState,
                pass.blendState,
                pass.primitive,
                pass.dynamicStates,
            );
            pso = device.createPipelineState(psoInfo);
            shaders.set(hash4, pso);
        }

        return pso;
    }

    /**
     * @en Get or create a compute pipeline state.
     * A compute pipeline only depends on the shader variant and the pipeline layout,
     * both carried by the pass. Keep pass.hash and shader.typedID as independent
     * keys, without the graphics-side renderPass/inputState factors.
     * @zh 获取或创建计算管线状态。
     * 计算管线仅依赖于着色器变体与管线布局（均由 pass 携带），
     * 因此分别按 pass.hash 和 shader.typedID 缓存，不包含 renderPass/顶点布局因子。
     */
    static getOrCreateComputePipelineState (device: Device, pass: Pass, shader: Shader): PipelineState {
        const hash1 = pass.hash;
        const hash2 = shader.typedID;

        let shaders = this._computePSOHashMap.get(hash1);
        if (!shaders) { this._computePSOHashMap.set(hash1, shaders = new Map()); }
        let pso = shaders.get(hash2);
        if (!pso) {
            const pipelineLayout = pass.pipelineLayout;
            const psoInfo = new PipelineStateInfo(
                shader,
                pipelineLayout,
            );
            psoInfo.bindPoint = PipelineBindPoint.COMPUTE;
            pso = device.createPipelineState(psoInfo);
            shaders.set(hash2, pso);
        }

        return pso;
    }
}
