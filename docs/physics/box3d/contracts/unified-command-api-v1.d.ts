/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/** Frozen design declarations only. Not exported by the product and not evidence of implementation. */
import type { RigidBody } from '../../../../src/cocos/physics/framework/components/rigid-body';
import type { IVec3Like } from '../../../../src/cocos/core/math/type-define';
export interface Box3DProducerHandle {
    readonly enabled: boolean;
    readonly disposed: boolean;
    enable(): void;
    disable(): void;
    dispose(): void;
}
export interface Box3DBeforeStepContext {
    readonly tickIndex: number;
    readonly attemptId: number;
    readonly fixedDt: number;
    readonly solverSubSteps: 1 | 2 | 4 | 8;
}
export interface Box3DContinuousForceDescriptor {
    readonly force?: IVec3Like;
    readonly torque?: IVec3Like;
    readonly relativePoint?: IVec3Like;
    readonly space?: 'world' | 'local';
}
export interface Box3DContinuousForceHandle extends Box3DProducerHandle {
    update(descriptor: Box3DContinuousForceDescriptor): void;
}
export declare function registerBox3DBeforeStep(
    callback: (context: Readonly<Box3DBeforeStepContext>) => void,
    options?: { enabled?: boolean },
): Box3DProducerHandle;
export declare function createBox3DContinuousForce(
    body: RigidBody,
    descriptor: Box3DContinuousForceDescriptor,
    options?: { enabled?: boolean },
): Box3DContinuousForceHandle;
export declare function cancelPendingBox3DCommands(body: RigidBody): number;
