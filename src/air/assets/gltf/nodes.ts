import { Node } from '../../../cocos/scene-graph/node';
import { Mat4, Quat, Vec3 } from '../../../cocos/core/math';
import { Skeleton } from '../../../cocos/3d/assets/skeleton';
import { deviceManager } from '../../../cocos/gfx';
import { UBOSkinning } from '../../../cocos/rendering/define';
import { GLTFParserContext } from './parser-context';
import { check, item } from './schema';

export interface NodeLayout { names: string[]; paths: string[]; parents: number[]; transforms: { p: Vec3; q: Quat; s: Vec3 }[]; }
export function prepareNodes (context: GLTFParserContext): NodeLayout {
    const nodes = context.json.nodes || [];
    const parents = nodes.map(() => -1);
    const names = nodes.map((n, i) => `${(n.name || 'node').replace(/[\\/]/g, '_')}__${i}`);
    for (const [i, node] of nodes.entries()) {
        for (const child of node.children || []) { item(nodes, child, 'child'); check(child !== i && parents[child] === -1, 'node cycle/multiple parents'); parents[child] = i; }
        if (node.camera !== undefined) { item(context.json.cameras, node.camera, 'camera'); context.warn(`node ${i}: camera metadata retained, camera not instantiated`); }
    }
    const paths: string[] = [];
    const visiting = new Set<number>();
    const path = (i: number): string => {
        if (paths[i]) { return paths[i]; }
        check(!visiting.has(i), 'node cycle'); visiting.add(i);
        const result = parents[i] === -1 ? names[i] : `${path(parents[i])}/${names[i]}`;
        visiting.delete(i); paths[i] = result; return result;
    };
    nodes.forEach((_, i) => path(i));
    const transforms = nodes.map((node) => {
        const p = new Vec3(); const q = new Quat(); const s = new Vec3(1, 1, 1);
        const vector = (values: number[], length: number): void => { check(values.length === length && values.every(Number.isFinite), 'invalid node transform'); };
        if (node.matrix) {
            check(!node.translation && !node.rotation && !node.scale, 'matrix and TRS are mutually exclusive'); vector(node.matrix, 16);
            const m = Mat4.fromArray(new Mat4(), node.matrix);
            check(Math.abs(Mat4.determinant(m)) > 1e-12, 'singular node matrix cannot be decomposed');
            Mat4.toSRT(m, q, p, s);
            const rebuilt = Mat4.fromRTS(new Mat4(), q, p, s);
            const values = Mat4.toArray(new Array<number>(16), rebuilt);
            check(values.every((value, i) => Math.abs(value - node.matrix![i]) <= 1e-5 * Math.max(1, Math.abs(value), Math.abs(node.matrix![i]))), 'node matrix contains unsupported shear');
        } else {
            if (node.translation) { vector(node.translation, 3); p.set(...node.translation as [number, number, number]); }
            if (node.scale) { vector(node.scale, 3); s.set(...node.scale as [number, number, number]); }
            if (node.rotation) {
                vector(node.rotation, 4); q.set(...node.rotation as [number, number, number, number]);
                check(Math.hypot(q.x, q.y, q.z, q.w) > 1e-12, 'zero node quaternion'); Quat.normalize(q, q);
            }
        }
        return { p, q, s };
    });
    for (const scene of context.json.scenes || []) {
        const seen = new Set<number>();
        for (const index of scene.nodes || []) { item(nodes, index, 'scene node'); check(parents[index] === -1 && !seen.has(index), 'scene nodes must be unique roots'); seen.add(index); }
    }
    if (context.json.scene !== undefined) { item(context.json.scenes, context.json.scene, 'default scene'); }
    return { names, paths, parents, transforms };
}
/**
 * Builds the node tree. `replace` may swap a freshly created node for derived nodes
 * (extension buildNode hook); replacements reparent children and inherit placement.
 */
export function makeNodes (layout: NodeLayout, included: Set<number>, root: Node,
    replace?: (index: number, node: Node) => Node | Node[] | null): Map<number, Node> {
    const nodes = new Map<number, Node>();
    for (const i of included) {
        const node = new Node(layout.names[i]); nodes.set(i, node);
        const { p, q, s } = layout.transforms[i]; node.setRTS(q, p, s);
    }
    // Pass 1: let handlers replace nodes before any mounting, so children reparent onto
    // the first replacement node (original stays an unmounted anchor afterwards).
    const mounts = new Map<number, Node[]>();
    for (const [i, node] of nodes) {
        let effective: Node[] = [node];
        if (replace) {
            const replaced = replace(i, node);
            if (replaced) { effective = Array.isArray(replaced) ? replaced : [replaced]; }
        }
        mounts.set(i, effective);
    }
    // Pass 2: mount; a replacement list nests as a subtree (first element at the original
    // position, remaining elements as its children) so handlers return flat node lists.
    const anchor = (index: number): Node => mounts.get(index)?.[0] ?? root;
    for (const [i, effective] of mounts) {
        const parent = layout.parents[i] === -1 ? root : anchor(layout.parents[i]);
        const head = effective[0];
        parent.addChild(head);
        for (let k = 1; k < effective.length; ++k) { head.addChild(effective[k]); }
    }
    return nodes;
}
export function createSkeletons (context: GLTFParserContext, layout: NodeLayout, skeletons: Skeleton[]): void {
    for (const [i, skin] of (context.json.skins || []).entries()) {
        check(skin.joints.length > 0 && new Set(skin.joints).size === skin.joints.length, 'skin requires unique joints');
        const capacity = UBOSkinning.JOINT_UNIFORM_CAPACITY;
        check(skin.joints.length <= Math.max(capacity, 256), 'skin exceeds native joint palette capacity');
        if (skin.joints.length > capacity && deviceManager.gfxDevice.capabilities.maxVertexAttributes > 0) {
            check(deviceManager.gfxDevice.capabilities.maxVertexTextureUnits > 0, 'device cannot sample a joint texture');
        }
        const skeleton = new Skeleton(); skeletons.push(skeleton); skeleton.name = skin.name || `skin_${i}`;
        skeleton.joints = skin.joints.map((joint) => { item(layout.paths, joint, 'joint node'); return layout.paths[joint]; });
        if (skin.skeleton !== undefined) { item(layout.paths, skin.skeleton, 'skin skeleton'); }
        if (skin.inverseBindMatrices === undefined) { skeleton.bindposes = skin.joints.map(() => new Mat4()); }
        else {
            const accessor = context.accessor(skin.inverseBindMatrices);
            check(accessor.source.type === 'MAT4' && accessor.source.componentType === 5126 && accessor.count === skin.joints.length, 'invalid inverseBindMatrices');
            skeleton.bindposes = skin.joints.map((_, j) => Mat4.fromArray(new Mat4(), accessor.values, j * 16));
        }
    }
}
