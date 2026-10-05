import type { Material } from '../../cocos/asset/assets/material';
import { describeAirTextureFormat } from './color-contract';

export interface AirMaterialPassDiagnostic {
    readonly index: number;
    readonly program: string;
    readonly propertyIndex: number;
    readonly priority: number;
    readonly phase: number;
    readonly stage: number;
    readonly depthTest: boolean;
    readonly depthWrite: boolean;
    readonly depthFunc: number;
    readonly cullMode: number;
    readonly blendTargets: readonly Readonly<{
        blend: boolean; blendSrc: number; blendDst: number; blendEq: number;
        blendSrcAlpha: number; blendDstAlpha: number; blendAlphaEq: number; blendColorMask: number;
    }>[];
    readonly textures: readonly Readonly<{
        name: string; binding: number; index: number; bound: boolean;
        format?: ReturnType<typeof describeAirTextureFormat>; width?: number; height?: number;
        mipLevels?: number; comparison?: number;
    }>[];
}

/** Read-only native pass/descriptor snapshot. Does not compile, mutate, draw or query the GPU.
 * Priority/phase are submission inputs, not a prediction of final camera/depth-sorted draw order.
 * Only material-set combined sampler textures are reported; global/local bindings belong to the renderer.
 */
export function inspectAirMaterial (material: Material): readonly AirMaterialPassDiagnostic[] {
    return Object.freeze(material.passes.map((pass, index) => {
        const shader = material.effectAsset?.shaders.find((candidate) => candidate.name === pass.program);
        const textures: AirMaterialPassDiagnostic['textures'][number][] = [];
        for (const entry of shader?.samplerTextures || []) {
            for (let element = 0; element < entry.count; ++element) {
                const texture = pass.descriptorSet?.getTexture(entry.binding, element);
                const sampler = pass.descriptorSet?.getSampler(entry.binding, element);
                textures.push(Object.freeze({ name: entry.name, binding: entry.binding, index: element, bound: !!texture,
                    ...(texture ? { format: describeAirTextureFormat(texture.format), width: texture.width, height: texture.height, mipLevels: texture.levelCount } : {}),
                    ...(sampler ? { comparison: sampler.info.cmpFunc } : {}) }));
            }
        }
        const dss = pass.depthStencilState;
        return Object.freeze({ index, program: pass.program, propertyIndex: pass.propertyIndex,
            priority: pass.priority, phase: pass.phase, stage: pass.stage,
            depthTest: dss.depthTest, depthWrite: dss.depthWrite, depthFunc: dss.depthFunc,
            cullMode: pass.rasterizerState.cullMode,
            blendTargets: Object.freeze(pass.blendState.targets.map((target) => Object.freeze({
                blend: target.blend, blendSrc: target.blendSrc, blendDst: target.blendDst, blendEq: target.blendEq,
                blendSrcAlpha: target.blendSrcAlpha, blendDstAlpha: target.blendDstAlpha,
                blendAlphaEq: target.blendAlphaEq, blendColorMask: target.blendColorMask,
            }))), textures: Object.freeze(textures) });
    }));
}
