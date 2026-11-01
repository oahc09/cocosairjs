/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import type {
    queryBox3DCommittedColliders,
    queryBox3DCommittedRay,
    createBox3DKinematicTarget,
} from '../../box3d-queries';
import { worldError } from './world-binding';
export interface Box3DCommittedQuerySource {
    colliders: typeof queryBox3DCommittedColliders;
    ray: typeof queryBox3DCommittedRay;
    target: typeof createBox3DKinematicTarget;
}
const sources = new WeakMap<object, Box3DCommittedQuerySource>();
export function installBox3DCommittedQuerySource(
    world: object,
    source: Box3DCommittedQuerySource,
): { dispose(): void } {
    if (sources.has(world)) throw worldError('AIR_E_BOX3D_CONFIG', 'committed query source', 'Duplicate source.');
    const frozen = Object.freeze({ ...source });
    sources.set(world, frozen);
    return Object.freeze({
        dispose() {
            if (sources.get(world) === frozen) sources.delete(world);
        },
    });
}
export function findBox3DCommittedQuerySource(world: object): Box3DCommittedQuerySource | undefined {
    return sources.get(world);
}
