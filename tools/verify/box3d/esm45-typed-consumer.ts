/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Type-only consumer of freshly emitted, unmodified SDK declarations. Never executes.
import { createAirApp, createStepClock, Node, Scene, RigidBody, BoxCollider, PhysicsSystem, Vec3 } from 'cocosair.js';
import type { AirApp, AirAppOptions, AirStepClock } from 'cocosair.js';

const options: AirAppOptions = {
    canvas: '#GameCanvas',
    renderMode: 3,
    physics: 'box3d',
    physicsOptions: {
        box3d: {
            assetBaseUrl: 'https://box3d-esm45.invalid/st/',
            threading: 'single',
            workerCount: 1,
            solverSubSteps: 4,
        },
    },
};
const pending: Promise<AirApp> = createAirApp(options);
const clock: AirStepClock = createStepClock({ frameRate: 60 });
const scene: Scene = new Scene('typed-built-consumer');
const node: Node = new Node('body');
const body: RigidBody = node.addComponent(RigidBody);
const shape: BoxCollider = node.addComponent(BoxCollider);
body.useGravity = false;
body.setLinearVelocity(new Vec3(1, 0, 0));
shape.size = new Vec3(1, 1, 1);
scene.addChild(node);
const actual: PhysicsSystem = PhysicsSystem.instance;
void [pending, clock, actual];
// @ts-expect-error Unknown backend must not become any.
const badBackend: AirAppOptions['physics'] = 'box3d-made-up';
// @ts-expect-error Unqualified subdivision must not become number/any.
const badSubstep: NonNullable<NonNullable<AirAppOptions['physicsOptions']>['box3d']> = { solverSubSteps: 3 };
// @ts-expect-error Internal test registration must never appear in public DTS.
import { __testOnlyRegisterBox3DAdapter } from 'cocosair.js';
void [badBackend, badSubstep, __testOnlyRegisterBox3DAdapter];
