/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

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
