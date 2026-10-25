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
import { Box3DFixedConstraint } from './fixed-constraint';
import { Box3DHingeConstraint } from './hinge-constraint';
import { Box3DPointToPointConstraint } from './point-to-point-constraint';
import type { Box3DWorldOwnerEnvironment } from './world-command-owner';
import { PhysicsSystem } from '../../../cocos/physics/framework/physics-system';
import type { IPhysicsSelector } from '../../../cocos/physics/framework/physics-selector';
import type { Box3DWorldAdapter } from './prepare';
import { Box3DPhysicsWorld } from './world';
import { Box3DRigidBody } from './rigid-body';
import { Box3DBoxShape, Box3DSphereShape, Box3DCapsuleShape } from './box-sphere-shape';
import { Box3DHullShape } from './hull-shape';
import { Box3DRoundHullShape } from './round-hull-shape';
import type { Box3DComponentConfiguration } from './shared-body';
import { requireComponentBinding, requireWorldBinding, worldError } from './world-binding';
import { createUnsupportedBox3DComponents } from './unsupported';
import { copyWritebackQualification } from './world-writeback';
import type { Box3DWritebackQualification } from './world-writeback';

/** Explicit factory only: module evaluation never registers a world/feature or requests assets. */
export function createBox3DWorldAdapter(
    selector: IPhysicsSelector,
    components: Box3DComponentConfiguration | undefined,
    qualification: Box3DWritebackQualification | undefined,
    ownerEnvironment: Box3DWorldOwnerEnvironment,
): Box3DWorldAdapter {
    if (!ownerEnvironment || typeof ownerEnvironment !== 'object')
        throw worldError('AIR_E_BOX3D_CONFIG', 'world registration', 'Expected actual System identity reader.');
    const systemReader = ownerEnvironment.physicsSystem;
    if (typeof systemReader !== 'function')
        throw worldError('AIR_E_BOX3D_CONFIG', 'world registration', 'Expected actual System identity reader.');
    const writebackQualification = copyWritebackQualification(qualification);
    return (lease, options, preparation) => {
        requireWorldBinding(lease.binding); // Fail before selector mutation and native world allocation.
        if (components) {
            requireComponentBinding(lease.binding);
            if (typeof components.collisionMask !== 'function' || typeof components.sleepThreshold !== 'function')
                throw worldError(
                    'AIR_E_BOX3D_CONFIG',
                    'component registration',
                    'Expected actual PhysicsSystem configuration readers.',
                );
        }
        let constructed = false;
        let ownedWorld: Box3DPhysicsWorld | null = null;
        const getWorld = () => {
            if (!ownedWorld)
                throw worldError('AIR_E_BOX3D_CONFIG', 'component construction', 'The owned world is not constructed.');
            return ownedWorld;
        };
        const componentWrappers = components
            ? {
                  HingeConstraint: class extends Box3DHingeConstraint {
                      constructor() {
                          super(getWorld);
                      }
                  },
                  PointToPointConstraint: class extends Box3DPointToPointConstraint {
                      constructor() {
                          super(getWorld);
                      }
                  },
                  FixedConstraint: class extends Box3DFixedConstraint {
                      constructor() {
                          super(getWorld);
                      }
                  },
                  RigidBody: class extends Box3DRigidBody {
                      constructor() {
                          super(getWorld, components!);
                      }
                  },
                  BoxShape: class extends Box3DBoxShape {
                      constructor() {
                          super(getWorld, components!);
                      }
                  },
                  CapsuleShape: class extends Box3DCapsuleShape {
                      constructor() {
                          super(getWorld, components!);
                      }
                  },
                  CylinderShape: class extends Box3DRoundHullShape {
                      constructor() {
                          super('cylinder', getWorld, components!);
                      }
                  },
                  ConeShape: class extends Box3DRoundHullShape {
                      constructor() {
                          super('cone', getWorld, components!);
                      }
                  },
                  TrimeshShape: class extends Box3DHullShape {
                      constructor() {
                          super(getWorld, components!);
                      }
                  },
                  SphereShape: class extends Box3DSphereShape {
                      constructor() {
                          super(getWorld, components!);
                      }
                  },
              }
            : {};
        const wrapper = Object.freeze({
            ...createUnsupportedBox3DComponents(),
            ...componentWrappers,
            PhysicsWorld: class extends Box3DPhysicsWorld {
                constructor() {
                    if (constructed)
                        throw worldError(
                            'AIR_E_BOX3D_CONFIG_CONFLICT',
                            'world construction',
                            'This preparation already constructed a world.',
                        );
                    const system = systemReader();
                    if (!(system instanceof PhysicsSystem))
                        throw worldError(
                            'AIR_E_BOX3D_CONFIG',
                            'world construction',
                            'Reader did not return the actual PhysicsSystem.',
                        );
                    constructed = true;
                    super(lease, options, preparation, writebackQualification, system);
                    ownedWorld = this;
                }
            },
        });
        return Object.freeze({
            select() {
                const receipt = preparation.diagnostics();
                if (!['preparing', 'prepared'].includes(receipt.status))
                    throw worldError('AIR_E_BOX3D_DISPOSED', 'selection', 'Preparation is closed or failed.');
                if (constructed || selector.physicsWorld)
                    throw worldError(
                        'AIR_E_BOX3D_CONFIG_CONFLICT',
                        'selection',
                        'Runtime world selection is already complete.',
                    );
                selector.register('box3d', wrapper);
            },
        });
    };
}
