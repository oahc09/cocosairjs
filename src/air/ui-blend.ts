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
import type { Node } from '../cocos/scene-graph/node';
import { UIRenderer } from '../cocos/2d/framework/ui-renderer';
import { BlendFactor } from '../cocos/gfx';

export type AirUIBlendMode = 'normal' | 'add' | 'multiply';
type NativeBlend = UIRenderer & { _srcBlendFactor: BlendFactor; _dstBlendFactor: BlendFactor };
const factors: Record<AirUIBlendMode, readonly [BlendFactor, BlendFactor]> = {
    normal: [BlendFactor.SRC_ALPHA, BlendFactor.ONE_MINUS_SRC_ALPHA], add: [BlendFactor.SRC_ALPHA, BlendFactor.ONE], multiply: [BlendFactor.DST_COLOR, BlendFactor.ONE_MINUS_SRC_ALPHA],
};
/** Explicit opt-in subtree controller. Native nodes gain no implicit global blend inheritance. */
export function createAirUIBlendScope(root: Node, mode: AirUIBlendMode = 'normal'): {
    set(node: Node, mode: AirUIBlendMode | null): void; update(): void; dispose(): void;
} {
    if (!Object.prototype.hasOwnProperty.call(factors, mode)) throw new Error('AIR_E_UI_BLEND_MODE');
    const overrides = new Map<Node, AirUIBlendMode>([[root, mode]]);
    const originals = new Map<UIRenderer, { factors: readonly [BlendFactor, BlendFactor]; applied: readonly [BlendFactor, BlendFactor] }>();
    let disposed = false;
    const alive = (): void => { if (disposed) throw new Error('AIR_E_UI_BLEND_DISPOSED'); };
    const apply = (renderer: UIRenderer, pair: readonly [BlendFactor, BlendFactor]): void => {
        const native = renderer as unknown as NativeBlend;
        native._srcBlendFactor = pair[0]; native._dstBlendFactor = pair[1];
        const material = renderer.getMaterialInstance(0), target = material?.passes[0]?.blendState.targets[0];
        if (!material || !target || (target.blendSrc === pair[0] && target.blendDst === pair[1])) return;
        // The native factor setter mutates Pass directly; the supported instance API
        // also invalidates the material/PSO hash for an already-rendered particle batch.
        material.overridePipelineStates({ blendState: { targets: [{ ...target, blend: true, blendSrc: pair[0], blendDst: pair[1] }] } }, 0);
        renderer.markForUpdateRenderData();
    };
    const restore = (renderer: UIRenderer): void => {
        const row = originals.get(renderer); originals.delete(renderer); if (!row || !renderer.isValid) return;
        const native = renderer as unknown as NativeBlend;
        if (native._srcBlendFactor === row.applied[0] && native._dstBlendFactor === row.applied[1]) {
            apply(renderer, row.factors);
        }
    };
    const update = (): void => {
        alive(); const visited = new Set<UIRenderer>();
        const visit = (node: Node, inherited: AirUIBlendMode): void => {
            if (!node.isValid) return;
            const selected = overrides.get(node) ?? inherited, pair = factors[selected];
            for (const renderer of node.getComponents(UIRenderer)) {
                visited.add(renderer); const native = renderer as unknown as NativeBlend;
                let row = originals.get(renderer);
                if (!row) { row = { factors: [native._srcBlendFactor, native._dstBlendFactor], applied: pair }; originals.set(renderer, row); }
                apply(renderer, pair); row.applied = pair;
            }
            node.children.forEach((child) => visit(child, selected));
        };
        visit(root, overrides.get(root) ?? 'normal');
        originals.forEach((_row, renderer) => { if (!visited.has(renderer)) restore(renderer); });
    };
    update();
    return { set(node, value) { alive(); if (value !== null && !Object.prototype.hasOwnProperty.call(factors, value)) throw new Error('AIR_E_UI_BLEND_MODE'); if (value === null) overrides.delete(node); else overrides.set(node, value); update(); }, update,
        dispose() { if (disposed) return; originals.forEach((_row, renderer) => restore(renderer)); overrides.clear(); disposed = true; } };
}
