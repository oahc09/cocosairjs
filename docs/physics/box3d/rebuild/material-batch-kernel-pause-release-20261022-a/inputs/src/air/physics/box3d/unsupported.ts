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
import { worldError } from './world-binding';

/** All component slots in the current 3D selector, not a fallback physics implementation. */
export const BOX3D_UNIMPLEMENTED_COMPONENTS = Object.freeze([
    'RigidBody',
    'BoxCharacterController',
    'CapsuleCharacterController',
    'BoxShape',
    'SphereShape',
    'CapsuleShape',
    'TrimeshShape',
    'CylinderShape',
    'ConeShape',
    'TerrainShape',
    'SimplexShape',
    'PlaneShape',
    'PointToPointConstraint',
    'HingeConstraint',
    'FixedConstraint',
    'ConfigurableConstraint',
] as const);
export function unsupportedBox3D(operation: string): never {
    throw worldError(
        'AIR_E_BOX3D_UNSUPPORTED',
        operation,
        'This Box3D capability is not implemented; use a supported backend.',
    );
}
export function createUnsupportedBox3DComponents(): Readonly<Record<string, new () => never>> {
    const wrappers: Record<string, new () => never> = {};
    for (const name of BOX3D_UNIMPLEMENTED_COMPONENTS) {
        wrappers[name] = class {
            constructor() {
                unsupportedBox3D(name);
            }
        } as new () => never;
    }
    return Object.freeze(wrappers);
}
