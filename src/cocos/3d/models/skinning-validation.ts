import type { Mesh } from '../assets/mesh';
import type { Skeleton } from '../assets/skeleton';
import type { Node } from '../../scene-graph/node';
import type { AABB } from '../../core/geometry/aabb';
import { error } from '../../core/platform/debug';

/** Validate weighted joints before replacing a model's current binding. */
export function validateSkinningBinding (skeleton: Skeleton, root: Node, mesh: Mesh): (AABB | null)[] {
    const bounds = mesh.getBoneSpaceBounds(skeleton);
    for (let index = 0; index < bounds.length; index++) {
        if (!bounds[index]) { continue; }
        const path = skeleton.joints[index];
        if (typeof path !== 'string' || !root.getChildByPath(path)) {
            const code = 'AIR_E_SKINNING_JOINT_PATH';
            const resource = mesh.name || mesh.uuid;
            const message = `[${code}] Mesh "${resource}", skeleton "${skeleton.name || skeleton.uuid}", root "${root.name}": weighted joint ${index} path "${path}" is missing. Create the joint below the skinning root or correct its relative path.`;
            error(message);
            throw Object.assign(new Error(message), { code, resource, node: root.name, joint: index, path });
        }
    }
    return bounds;
}

/** Check the slots the realtime uploader writes, not the total skeleton size. */
export function validateSkinningCapacity (skeleton: Skeleton, root: Node, mesh: Mesh,
    bounds: readonly (AABB | null)[], capacity: number): void {
    const maps = mesh.struct.jointMaps;
    for (let joint = 0; joint < bounds.length; joint++) {
        if (!bounds[joint]) { continue; }
        const slots = maps ? maps.map((map, palette) => ({ slot: map.indexOf(joint), palette }))
            : [{ slot: joint, palette: 0 }];
        for (const { slot, palette } of slots) {
            if (slot < capacity) { continue; }
            const code = 'AIR_E_SKINNING_CAPACITY';
            const resource = mesh.name || mesh.uuid;
            const message = `[${code}] Mesh "${resource}", skeleton "${skeleton.name || skeleton.uuid}", root "${root.name}": weighted joint ${joint} occupies palette ${palette} slot ${slot}, but realtime transport has ${capacity} slots. Split the mesh into local joint palettes whose weighted slots are below ${capacity}; increasing the skeleton size does not increase transport capacity.`;
            error(message);
            throw Object.assign(new Error(message), { code, resource, node: root.name, joint, palette, slot, capacity });
        }
    }
}
