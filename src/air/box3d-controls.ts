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
