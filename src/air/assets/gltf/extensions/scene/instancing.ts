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
/**
 * `EXT_mesh_gpu_instancing`: correctness path first — per-instance transforms validated
 * at parse time and expanded to child nodes that share the same Mesh/Material. The
 * original node remains the anchor (keeps children and the node transform); instance nodes
 * carry the per-instance TRS. Native instanced-draw fast path is a later, explicit step.
 *
 * Timing contract: validate() checks JSON accessor metadata (runs before loadBuffers);
 * resolveData() snapshots binary channel values during parse (the registry's
 * pre-release window); buildNode() consumes the snapshot at instantiate time.
 */
import { Quat, Vec3 } from '../../../../../cocos/core/math';
import { Node } from '../../../../../cocos/scene-graph/node';
import { GLTFError } from '../../diagnostics';
import type { GLTFExtensionFactory, GLTFExtensionHandler, GLTFInstantiationContext } from '../../extension-registry';
import type { GLTFParserContext } from '../../parser-context';
import { check, item } from '../../schema';

export const EXT_MESH_GPU_INSTANCING = 'EXT_mesh_gpu_instancing';

interface InstancingDef { attributes: Record<string, number>; }

interface ChannelsSnapshot { count: number; translation?: number[]; rotation?: number[]; scale?: number[]; }

const CHANNELS: Record<string, { components: number; type: string }> = {
    TRANSLATION: { components: 3, type: 'VEC3' },
    ROTATION: { components: 4, type: 'VEC4' },
    SCALE: { components: 3, type: 'VEC3' },
};

function invalid (message: string): GLTFError {
    return new GLTFError('GLTF_EXTENSION_INVALID', message, EXT_MESH_GPU_INSTANCING);
}

function defOf (json: GLTFParserContext['json'], nodeIndex: number): InstancingDef | undefined {
    return json.nodes![nodeIndex].extensions?.[EXT_MESH_GPU_INSTANCING] as InstancingDef | undefined;
}

/** JSON-metadata-only channel validation; safe to run before buffer loading. */
function validateDef (ctx: GLTFParserContext, def: InstancingDef): number {
    const entries = Object.entries(def.attributes || {});
    if (!entries.length) { throw invalid(`${EXT_MESH_GPU_INSTANCING}: attributes must be a non-empty map`); }
    let count = -1;
    for (const [channel, accessorIndex] of entries) {
        const expected = CHANNELS[channel];
        if (!expected) { throw invalid(`${EXT_MESH_GPU_INSTANCING}: unsupported channel ${channel}`); }
        const source = item(ctx.json.accessors, accessorIndex, `accessor for ${channel}`);
        if (source.type !== expected.type || source.componentType !== 5126 || source.normalized) {
            throw invalid(`${EXT_MESH_GPU_INSTANCING}: channel ${channel} must be a non-normalized float ${expected.type}`);
        }
        if (count === -1) { count = source.count; }
        if (source.count !== count) { throw invalid(`${EXT_MESH_GPU_INSTANCING}: channels must share the instance count`); }
    }
    check(count > 0, `${EXT_MESH_GPU_INSTANCING}: zero instance count`);
    return count;
}

export function meshGPUInstancingFactory (context: GLTFParserContext): GLTFExtensionHandler {
    void context;
    const parsed = new Map<number, number>();
    const snapshots = new Map<number, ChannelsSnapshot>();
    return {
        name: EXT_MESH_GPU_INSTANCING,
        support: () => ({ name: EXT_MESH_GPU_INSTANCING, status: 'supported',
            reason: 'correctness path: expansion to shared-asset child nodes' }),
        validate (ctx): void {
            for (const nodeIndex of (ctx.json.nodes || []).keys()) {
                const def = defOf(ctx.json, nodeIndex);
                if (!def) { continue; }
                check(ctx.json.nodes![nodeIndex].skin === undefined, `${EXT_MESH_GPU_INSTANCING} nodes must not be skin nodes`);
                parsed.set(nodeIndex, validateDef(ctx, def));
            }
        },
        resolveData (ctx): void {
            for (const [nodeIndex, count] of parsed) {
                const def = defOf(ctx.json, nodeIndex)!;
                const snapshot: ChannelsSnapshot = { count };
                for (const [channel, accessorIndex] of Object.entries(def.attributes)) {
                    const data = ctx.accessor(accessorIndex);
                    check(data.components === CHANNELS[channel].components, `${EXT_MESH_GPU_INSTANCING}: ${channel} width`);
                    const values = Array.from(data.values);
                    if (channel === 'ROTATION') {
                        for (let instance = 0; instance < count; ++instance) {
                            const length = Math.hypot(values[instance * 4], values[instance * 4 + 1],
                                values[instance * 4 + 2], values[instance * 4 + 3]);
                            if (!(Number.isFinite(length) && length > 1e-6)) {
                                throw invalid(`${EXT_MESH_GPU_INSTANCING}: zero/invalid instance quaternion`);
                            }
                        }
                    }
                    (snapshot as unknown as Record<string, number[]>)[channel.toLowerCase()] = values;
                }
                snapshots.set(nodeIndex, snapshot);
            }
        },
        buildNode (nodeIndex: number, node: Node, ctx: GLTFInstantiationContext): Node[] | null {
            const snapshot = snapshots.get(nodeIndex);
            if (!snapshot) { return null; }
            const instances: Node[] = [];
            for (let instance = 0; instance < snapshot.count; ++instance) {
                const child = new Node(`${node.name}__inst_${instance}`);
                const p = snapshot.translation ? new Vec3(
                    snapshot.translation[instance * 3], snapshot.translation[instance * 3 + 1],
                    snapshot.translation[instance * 3 + 2]) : new Vec3();
                const q = snapshot.rotation ? new Quat(
                    snapshot.rotation[instance * 4], snapshot.rotation[instance * 4 + 1],
                    snapshot.rotation[instance * 4 + 2], snapshot.rotation[instance * 4 + 3]) : new Quat();
                if (snapshot.rotation) { Quat.normalize(q, q); }
                const s = snapshot.scale ? new Vec3(
                    snapshot.scale[instance * 3], snapshot.scale[instance * 3 + 1], snapshot.scale[instance * 3 + 2]) : new Vec3(1, 1, 1);
                child.setRTS(q, p, s);
                instances.push(child);
            }
            // Renderers belong to the instances; the anchor keeps children and hierarchy only.
            ctx.renderTargets.set(node, instances);
            return [node, ...instances];
        },
    };
}

export const meshGPUInstancingExtension: GLTFExtensionFactory = meshGPUInstancingFactory;
