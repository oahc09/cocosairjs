/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import type { Collider } from '../cocos/physics/framework/components/colliders/collider';
import type { RigidBody } from '../cocos/physics/framework/components/rigid-body';
import { PhysicsSystem } from '../cocos/physics/framework/physics-system';
import type { Box3DBeforeStepContext, Box3DBodyMotionVector, Box3DBodyMotionRotation } from './box3d-controls';
import { findBox3DCommittedQuerySource } from './physics/box3d/committed-query-source';
export interface Box3DQueryOptions {
    readonly group: number;
    readonly mask: number;
    readonly queryTrigger: boolean;
}
export interface Box3DQueryStamp {
    readonly worldGeneration: number;
    readonly tickIndex: number;
    readonly attemptId: number;
    readonly nativeStepIndex: number;
    readonly nativeMutationRevision: number;
    readonly complete: true;
}
export interface Box3DCommittedQueryHit {
    /** Original Mesh submesh/triangle ordinal, composed from the cooked native face map. Non-Mesh hits omit it. */
    readonly meshFace?: Readonly<{ submesh: number; primitive: number; flatFace: number }>;
    readonly collider: Collider;
    readonly logicalId: number;
    readonly distance: number;
    readonly fraction: number;
    readonly point: Box3DBodyMotionVector;
    readonly normal: Box3DBodyMotionVector;
}
export interface Box3DCommittedQueryChild {
    readonly collider: Collider;
    readonly kind: 'box' | 'sphere' | 'capsule';
    readonly origin: Box3DBodyMotionVector;
    readonly rotation: Box3DBodyMotionRotation;
    /** Baked box halfXYZ, sphere radius, or capsule [radius, halfCylinder, axis0/1/2]. */
    readonly dimensions: readonly number[];
    /** Exact copied convex support proxy. Points are world-oriented relative to body origin. */
    readonly support: Readonly<{
        origin: Box3DBodyMotionVector;
        points: readonly Box3DBodyMotionVector[];
        radius: number;
    }>;
}
export interface Box3DCommittedColliderQuery extends Box3DQueryStamp {
    readonly translation: Box3DBodyMotionVector;
    readonly children: readonly Box3DCommittedQueryChild[];
    readonly overlaps: readonly Readonly<{
        queryCollider: Collider;
        collider: Collider;
        blockingGeometry: Box3DCommittedQueryChild | null;
    }>[];
    /** Same-epoch blocker geometry also accompanies cast-only initial slop hits.
     * This is an observation, not automatic permission to ignore a zero hit. */
    readonly hits: readonly Readonly<
        Box3DCommittedQueryHit & {
            queryCollider: Collider;
            blockingGeometry: Box3DCommittedQueryChild | null;
        }
    >[];
    /** Conservative native overlap/slop observation, NOT an MTD or a departure permission. */
    readonly initialOverlap: boolean;
    readonly nearestDistance: number | null;
}
export interface Box3DCommittedRayQuery extends Box3DQueryStamp {
    readonly origin: Box3DBodyMotionVector;
    readonly translation: Box3DBodyMotionVector;
    readonly hits: readonly Box3DCommittedQueryHit[];
}
export interface Box3DKinematicTargetHandle {
    setTarget(pose: Readonly<{ position: Box3DBodyMotionVector; rotation: Box3DBodyMotionRotation }>): void;
    clear(): void;
    dispose(): void;
}
function source() {
    const world = PhysicsSystem.instance?.physicsWorld;
    const value = world && findBox3DCommittedQuerySource(world);
    if (!value)
        throw Object.assign(new Error('Current world has no Box3D committed query source.'), {
            code: 'AIR_E_PHYSICS_BACKEND_UNAVAILABLE',
        });
    return value;
}
/** Exact current before-step callback context only. Queries committed native geometry,
 * not pending commands/Node poses. All active child colliders of every included body are required and checked before native reads.
 * Only the supplied group is excluded. Results are complete copied observations. */
export function queryBox3DCommittedColliders(
    context: Readonly<Box3DBeforeStepContext>,
    colliders: readonly Collider[],
    translation: Box3DBodyMotionVector,
    options: Box3DQueryOptions,
): Box3DCommittedColliderQuery {
    return source().colliders(context, colliders, translation, options);
}
/** Same live callback lease; full generic ray results, no automatic ignore list. */
export function queryBox3DCommittedRay(
    context: Readonly<Box3DBeforeStepContext>,
    origin: Box3DBodyMotionVector,
    translation: Box3DBodyMotionVector,
    options: Box3DQueryOptions,
): Box3DCommittedRayQuery {
    return source().ray(context, origin, translation, options);
}
/** Acquires the existing exclusive native kinematic command lease while idle.
 * setTarget queues for the next safe fixed tick; it never changes Node pose directly.
 * Dispose/clear obey the owner's existing paired velocity cleanup and phase guards. */
export function createBox3DKinematicTarget(body: RigidBody): Box3DKinematicTargetHandle {
    return source().target(body);
}
