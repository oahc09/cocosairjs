import { WebGL2PipelineState } from '../../src/cocos/gfx/webgl2/webgl2-pipeline-state';
import { PipelineStateInfo, BlendState, RasterizerState, DepthStencilState } from '../../src/cocos/gfx/base/pipeline-state';
import { BlendFactor, CullMode, ComparisonFunc } from '../../src/cocos/gfx';

test('cached GPU pipeline state owns immutable input snapshots across material overrides', () => {
    const info = new PipelineStateInfo();
    info.shader = { gpuShader: {} } as any; info.pipelineLayout = { getGpuPipelineLayout: () => ({}) } as any;
    info.renderPass = { getGpuRenderPass: () => ({}) } as any;
    info.blendState = new BlendState(); info.rasterizerState = new RasterizerState(); info.depthStencilState = new DepthStencilState();
    info.blendState.targets[0].blendDst = BlendFactor.ONE; info.rasterizerState.cullMode = CullMode.NONE; info.depthStencilState.depthFunc = ComparisonFunc.LESS;
    const state = new WebGL2PipelineState(); state.initialize(info);
    info.blendState.targets[0].blendDst = BlendFactor.ONE_MINUS_SRC_ALPHA; info.blendState.blendColor.x = 0.75;
    info.rasterizerState.cullMode = CullMode.BACK; info.depthStencilState.depthFunc = ComparisonFunc.ALWAYS;
    expect(state.gpuPipelineState.bs.targets[0].blendDst).toBe(BlendFactor.ONE);
    expect(state.gpuPipelineState.rs.cullMode).toBe(CullMode.NONE); expect(state.gpuPipelineState.dss.depthFunc).toBe(ComparisonFunc.LESS);
    expect(state.gpuPipelineState.bs.blendColor.x).toBe(0);
    state.destroy();
});
