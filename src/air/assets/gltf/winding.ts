import { ccclass } from 'cc.decorator';
import { Component } from '../../../cocos/scene-graph/component';
import { MeshRenderer } from '../../../cocos/3d/framework/mesh-renderer';
import { SkinnedMeshRenderer } from '../../../cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer';
import { Mat4 } from '../../../cocos/core/math';

/** Keep glTF winding correct when an imported node or an application ancestor is mirrored. */
@ccclass('air.GLTFWinding')
export class GLTFWinding extends Component {
    public renderers: MeshRenderer[] = [];
    private readonly mirrored = new Map<MeshRenderer, boolean>();
    public lateUpdate (): void {
        for (const renderer of this.renderers) {
            const transform = renderer instanceof SkinnedMeshRenderer ? renderer.skinningRoot! : renderer.node;
            const negative = Mat4.determinant(transform.worldMatrix) < 0;
            if ((this.mirrored.get(renderer) ?? false) === negative) { continue; }
            this.mirrored.set(renderer, negative);
            for (let slot = 0; slot < renderer.sharedMaterials.length; ++slot) {
                renderer.getMaterialInstance(slot)?.overridePipelineStates({ rasterizerState: { isFrontFaceCCW: !negative } });
            }
        }
    }
}
