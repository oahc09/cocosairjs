/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// TEST-ONLY additional export in one built graph. Never a public product entry.
import { registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
export { createBox3DBinding as __testOnlyCreateBox3DBinding } from '../../../src/air/physics/box3d/binding/facade.mjs';

export function __testOnlyRegisterBox3DAdapter() {
    registerBox3DWorldAdapter(
        createBox3DWorldAdapter(
            selector,
            {
                collisionMask: (group) => PhysicsSystem.instance.collisionMatrix[group],
                sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
            },
            undefined,
            { physicsSystem: () => PhysicsSystem.instance },
        ),
    );
}
export function __testOnlyBox3DGraphIdentity() {
    return { PhysicsSystem, system: PhysicsSystem.instance, selector, Box3DPhysicsWorld };
}
