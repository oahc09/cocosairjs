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
import type { RigidBody } from '../cocos/physics/framework/components/rigid-body';
import { readBox3DBodyMotionSource } from './physics/box3d/body-motion-source';
import { PhysicsSystem } from '../cocos/physics/framework/physics-system';
import { findBox3DBeforeStepSource } from './physics/box3d/before-step-source';

/** Formal fixed-tick context. See before-step-api-v1.md for qualification boundaries. */
export interface Box3DBeforeStepContext {
    readonly tickIndex: number;
    readonly attemptId: number;
    readonly fixedDt: number;
    readonly solverSubSteps: 1 | 2 | 4 | 8;
}
export interface Box3DBeforeStepHandle {
    readonly enabled: boolean;
    readonly disposed: boolean;
    enable(): void;
    disable(): void;
    dispose(): void;
}
export type Box3DBeforeStepCallback = (context: Readonly<Box3DBeforeStepContext>) => void;
/**
 * Called once by the existing Box3D owner per attempted fixed tick, after scene sync
 * and before batch validation/commit. Must synchronously return undefined.
 * enable/disable/dispose are configuration operations, not callable from this callback.
 * Pausing invokes no hooks; existing enabled hook registrations persist across resume.
 * This hook is not a joint, independent clock, post-step event or solver substep hook.
 */
export function registerBox3DBeforeStep(
    callback: Box3DBeforeStepCallback,
    options?: { enabled?: boolean },
): Box3DBeforeStepHandle {
    if (typeof callback !== 'function')
        throw Object.assign(new Error('Expected a synchronous before-step callback.'), { code: 'AIR_E_BOX3D_CONFIG' });
    const world = PhysicsSystem.instance?.physicsWorld;
    const source = world && findBox3DBeforeStepSource(world);
    if (!source)
        throw Object.assign(new Error('The current world has no registered Box3D before-step source.'), {
            code: 'AIR_E_PHYSICS_BACKEND_UNAVAILABLE',
        });
    // Return the callback result so the existing queue rejects Promise/non-undefined returns.
    // Do not catch callback errors, replay callbacks, or commit any native force here.
    return source.register(callback, options);
}

/** Copied native vector, not a mutable Cocos Vec3 or a reference into WASM memory. */
export interface Box3DBodyMotionVector {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}
export interface Box3DBodyMotionRotation extends Box3DBodyMotionVector {
    readonly w: number;
}
/** Actual committed native body motion; every nested value is copied and frozen. */
export interface Box3DBodyMotion {
    /** World-space body origin, not the center of mass or a pending Node transform. */
    readonly position: Box3DBodyMotionVector;
    readonly rotation: Box3DBodyMotionRotation;
    readonly worldCOM: Box3DBodyMotionVector;
    /** Native body-frame COM offset; shape scale is already baked into this value. */
    readonly localCenter: Box3DBodyMotionVector;
    /** World-space velocity of the COM, not the velocity of the body origin. */
    readonly linearVelocity: Box3DBodyMotionVector;
    /** World-space angular velocity in radians per second. */
    readonly angularVelocity: Box3DBodyMotionVector;
    readonly mass: number;
    readonly enabled: boolean;
    /** Native Box3D type: 0 = static, 1 = kinematic, 2 = dynamic (not ERigidBodyType). */
    readonly type: 0 | 1 | 2;
    readonly massPending: boolean;
}
/**
 * Reads the actual current world's initialized RigidBody without synchronizing the
 * scene, stepping, or committing queued commands. Valid in before-step callbacks:
 * queued commands have not yet affected this committed native snapshot. Disabled
 * and mass-pending bodies are observable; callers must check those flags before use.
 * Foreign, uninitialized, destroyed, stale-generation and faulted ownership reject.
 * No adapter, native handle, Node/renderer estimate or shape restriction is exposed.
 */
export function readBox3DBodyMotion(body: RigidBody): Readonly<Box3DBodyMotion> {
    const world = PhysicsSystem.instance?.physicsWorld;
    if (!world || !findBox3DBeforeStepSource(world))
        throw Object.assign(new Error('The current world has no registered Box3D body motion source.'), {
            code: 'AIR_E_PHYSICS_BACKEND_UNAVAILABLE',
        });
    return readBox3DBodyMotionSource(body, world);
}

/** Requested/committed Fixed state and native copied observations, not a native handle.
 * Pending requests commit before the next physical step; broken joints only rearm
 * on an explicit disable→enable transition. Other backends have no such owner. */
export { readConstraintState as readBox3DConstraintState } from '../cocos/physics/framework/constraint-state-control';
