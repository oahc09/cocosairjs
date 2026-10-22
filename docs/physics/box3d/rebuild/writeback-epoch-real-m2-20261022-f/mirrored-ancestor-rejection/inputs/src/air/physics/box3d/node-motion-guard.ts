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
import type { Node } from '../../../cocos/scene-graph/node';
import { registerNodeTransformGuard } from '../../../cocos/scene-graph/node-transform-validation';
import type { NodeTransformGuardLease } from '../../../cocos/scene-graph/node-transform-validation';

/**
 * Internal opt-in primitive only. No target/world registration or native mutation.
 * World/handle ownership must dispose this lease before teardown or reparenting.
 * Expected-pose verification and the committed native write epoch belong to the
 * future world consumer; a consumed Node permit alone does not prove physics sync.
 */
export function createBox3DNodeMotionGuard(node: Node): NodeTransformGuardLease {
    const nodes: Node[] = [];
    const seen = new Set<Node>();
    for (let current: Node | null = node; current; current = current.parent) {
        if (seen.has(current)) {
            throw Object.assign(new Error('Box3D motion ownership requires acyclic Node ancestry.'), {
                code: 'AIR_E_BOX3D_CONFIG',
            });
        }
        seen.add(current);
        nodes.push(current);
    }
    return registerNodeTransformGuard(nodes, {
        code: 'AIR_E_BOX3D_CONFIG',
        message: 'Box3D motion control owns this Node or an affected descendant; use its explicit motion API',
    });
}
