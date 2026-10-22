/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual AIR/Node/PhysicsSystem + current real WASM. No physics readback replacement or second clock.
 */
import '../../../src/exports/base';
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import { airBootstrapRegistry } from '../../../src/air/app-config';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import { Node } from '../../../src/cocos/scene-graph/node';
import { Scene } from '../../../src/cocos/scene-graph/scene';
import { assertNodeTransformEntry } from '../../../src/cocos/scene-graph/node-transform-validation';
import { director, game } from '../../../src/cocos/game';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld, Box3DId } from '../../../src/air/physics/box3d/binding/facade.mjs';
import { inspectNode, localSample, sameLocal } from './writeback-epoch-oracle';
interface Fixture {
    loader: Box3DSTLoader;
    expected: string;
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    bodies(): Box3DId[];
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_WRITEBACK_EPOCH'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_WRITEBACK_EPOCH_FIXTURE__: Fixture;
const fixture = __BOX3D_WRITEBACK_EPOCH_FIXTURE__;
const serializeError = (error: any) => (error ? { message: String(error), code: error.code ?? null } : null);
const attempt = (action: () => void): any => {
    try {
        action();
        return null;
    } catch (error) {
        return error;
    }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
interface Subject {
    node: Node;
    body: RigidBody;
    id: Box3DId;
}

test('actual AIR writeback epoch qualification; one independent process per scenario', async () => {
    const epochLimit =
        fixture.expected === 'epoch-exhaustion-one' ? 1 : fixture.expected === 'epoch-exhaustion' ? 2 : null;
    let app: AirApp | undefined, failure: any;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
    const cleanupNodes = new Set<Node>();
    const listeners: { node: Node; listener: (flags: number) => void }[] = [];
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        const components = {
            collisionMask: (group: number) => PhysicsSystem.instance.collisionMatrix[group],
            sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
        };
        // Internal qualification-only seam. Until implemented, ignored third argument must NOT count as support.
        const adapter =
            epochLimit !== null
                ? Reflect.apply(createBox3DWorldAdapter, undefined, [
                      selector,
                      components,
                      Object.freeze({ epochLimit }),
                  ])
                : createBox3DWorldAdapter(selector, components);
        registerBox3DWorldAdapter(adapter);
        app = await createAirApp({
            canvas: '#GameCanvas',
            renderMode: 3,
            physics: 'box3d',
            physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } },
        });
        game.pause();
        const system = PhysicsSystem.instance,
            world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        system.gravity = new Vec3(0, 0, 0);
        const binding = fixture.binding(),
            token = fixture.token(),
            scene = new Scene('writeback-epoch-' + fixture.expected);
        director.runSceneImmediate(scene);
        game.pause();
        fixture.checkpoint('actual-headless-startup', {
            case: fixture.expected,
            preparation: airBootstrapRegistry().physicsPreparation,
            world: world.diagnostics(),
            qualification: epochLimit !== null ? { epochLimit } : null,
        });
        if (epochLimit !== null) {
            const wb = (world.diagnostics() as any).writeback;
            if (!wb || wb.epochLimit !== epochLimit || wb.epoch !== 0) {
                fixture.checkpoint('missing-internal-epoch-policy', {
                    world: world.diagnostics(),
                    native: binding.stepDiagnostics(token),
                    steps: fixture.observations().calls.filter((r: any) => r.name === 'step').length,
                });
                throw Object.assign(new Error('Internal readonly epochLimit qualification seam is not implemented'), {
                    code: 'PENDING_FIXTURE_SEAM',
                });
            }
        }
        const makeNode = (name: string, parent: Node = scene, position = [0, 10, 0]) => {
            const node = new Node(name);
            node.setPosition(position[0], position[1], position[2]);
            parent.addChild(node);
            return node;
        };
        const attach = (node: Node, velocity = [0, 0, 0], offset = false): Subject => {
            const body = node.addComponent(RigidBody);
            body.useGravity = false;
            body.linearDamping = 0;
            body.angularDamping = 0;
            const collider = node.addComponent(BoxCollider);
            if (offset) collider.center = new Vec3(0.25, 0, 0);
            body.setLinearVelocity(new Vec3(velocity[0], velocity[1], velocity[2]));
            const ids = fixture.bodies();
            return { node, body, id: ids[ids.length - 1] };
        };
        if (['initial-shear-rejection', 'mirrored-ancestor-rejection'].includes(fixture.expected)) {
            const parent = makeNode('unsupported-parent');
            const child = makeNode('unsupported-child', parent, [0, 5, 0]);
            if (fixture.expected === 'initial-shear-rejection') {
                parent.setRotationFromEuler(0, 30, 0);
                parent.setScale(2, 3, 4);
                child.setRotationFromEuler(0, 0, 45);
            } else {
                parent.setScale(-1, -1, -1);
                child.setScale(-1, -1, -1);
            }
            const start = {
                world: world.diagnostics(),
                native: binding.stepDiagnostics(token),
                calls: fixture.observations().calls.length,
                node: inspectNode(child),
                worldScale: [child.worldScale.x, child.worldScale.y, child.worldScale.z],
            };
            const error = attempt(() => child.addComponent(RigidBody));
            const calls = fixture.observations().calls.slice(start.calls);
            check('unsupported initial hierarchy rejected', !!error, serializeError(error));
            check(
                'initial rejection made no native body mutation',
                !calls.some((r: any) => r.name === 'createBody' || r.name.startsWith('setBody') || r.name === 'step'),
                calls,
            );
            check(
                'initial rejection preserves world and native diagnostics',
                same(start.world, world.diagnostics()) && same(start.native, binding.stepDiagnostics(token)),
                world.diagnostics(),
            );
            check(
                'initial rejection has zero owned bodies',
                binding.worldCounts(token).counts[0] === 0,
                binding.worldCounts(token),
            );
            fixture.checkpoint('unsupported-initial-hierarchy-zero-native-mutation', {
                temporaryMirrorGap: fixture.expected === 'mirrored-ancestor-rejection',
                start,
                error: serializeError(error),
                calls,
            });
        } else {
            const subjects: Subject[] = [];
            let parent: Node | undefined;
            if (['child-before-parent', 'static-child-dynamic-parent'].includes(fixture.expected)) {
                parent = makeNode('physics-parent');
                const child = makeNode('physics-child', parent, [0, 5, 0]);
                const childSubject = attach(child);
                if (fixture.expected === 'static-child-dynamic-parent') childSubject.body.type = 2;
                subjects.push(childSubject, attach(parent, [1, 0, 0])); // Intentionally child-first insertion.
            } else if (fixture.expected === 'nonuniform-parent') {
                parent = makeNode('rotated-nonuniform-parent');
                parent.setRotationFromEuler(0, 30, 0);
                parent.setScale(2, 3, 4);
                subjects.push(attach(makeNode('shear-free-child', parent, [0, 5, 0]), [1, 0, 0]));
            } else if (['parent-flush-alias', 'prestep-parent-alias'].includes(fixture.expected)) {
                parent = makeNode('nonphysics-parent');
                subjects.push(attach(makeNode('body', parent, [0, 5, 0]), [1, 0, 0]));
            } else {
                const node = makeNode('body-a');
                if (fixture.expected === 'quaternion-sign') node.setRotation(0, 0, 0, -1);
                if (fixture.expected === 'scale-dirty') node.setScale(2, 2, 2);
                subjects.push(attach(node, [1, 0, 0], fixture.expected === 'baseline'));
                if (fixture.expected === 'sibling-flush-alias')
                    subjects.push(attach(makeNode('body-b', scene, [10, 10, 0]), [0, 0, 0]));
            }
            for (const subject of subjects) {
                let node: Node | null = subject.node;
                while (node) {
                    cleanupNodes.add(node);
                    node = node.parent;
                }
            }
            const pose = (s: Subject) => Array.from(binding.bodyTransforms(token, [s.id]));
            const snapshot = () =>
                subjects.map((s) => {
                    const native = pose(s);
                    return {
                        id: s.id,
                        native,
                        state: binding.bodyState(token, s.id),
                        node: inspectNode(s.node, native),
                    };
                });
            const before = { world: world.diagnostics(), native: binding.stepDiagnostics(token), subjects: snapshot() };
            const events: any[] = [];
            let triggered = false;
            const source = fixture.expected === 'sibling-flush-alias' ? subjects[1].node : subjects[0].node;
            const adversarial = [
                'self-flush-alias',
                'parent-flush-alias',
                'sibling-flush-alias',
                'setter-caught',
                'setter-uncaught',
            ];
            if (adversarial.includes(fixture.expected)) {
                const listener = (flags: number) => {
                    if (triggered || !(flags & 2)) return; // Rotation is second owned setter, not setup or first position event.
                    triggered = true;
                    events.push({ flags, stage: 'entered' });
                    if (fixture.expected.startsWith('setter-')) {
                        if (fixture.expected === 'setter-caught') {
                            const error = attempt(() => source.setWorldPosition(123, 456, 789));
                            events.push({ stage: 'business-setter-caught', error: serializeError(error) });
                        } else source.setWorldPosition(123, 456, 789);
                    } else {
                        const victim =
                            fixture.expected === 'parent-flush-alias'
                                ? parent!
                                : fixture.expected === 'sibling-flush-alias'
                                  ? subjects[0].node
                                  : source;
                        void victim.worldMatrix;
                        void source.worldMatrix; // Explicit flush before unsupported raw alias mutation.
                        (victim.position as Vec3).x += 2;
                        events.push({
                            stage: 'raw-local-alias',
                            victim: victim.name,
                            local: localSample(victim).position,
                        });
                    }
                };
                source.on(Node.EventType.TRANSFORM_CHANGED, listener);
                listeners.push({ node: source, listener });
            }
            if (fixture.expected === 'prestep-parent-alias') {
                void parent!.worldMatrix;
                void subjects[0].node.worldMatrix;
                (parent!.position as Vec3).x += 2;
            }
            if (fixture.expected === 'scale-dirty') subjects[0].node.hasChangedFlags |= 4;
            const preAttemptNodes = subjects.map((s) => localSample(s.node));
            const error = attempt(() => system.step(1 / 60)); // The ONLY native-step path in this fixture.
            const after = { world: world.diagnostics(), native: binding.stepDiagnostics(token), subjects: snapshot() };
            fixture.checkpoint('first-actual-step', { before, after, error: serializeError(error), events });
            const faultCases = [
                'self-flush-alias',
                'parent-flush-alias',
                'sibling-flush-alias',
                'setter-uncaught',
                'static-child-dynamic-parent',
            ];
            if (faultCases.includes(fixture.expected)) {
                if (fixture.expected !== 'static-child-dynamic-parent')
                    check('listener really executed', triggered, events);
                check('post-native writeback violation faults', !!error && after.world.state === 'faulted', {
                    error: serializeError(error),
                    world: after.world,
                });
                check(
                    'native completion remains known',
                    after.world.lastStepOutcome === 'completed' &&
                        after.world.native.nativeCompleted &&
                        after.world.nativeObservationCurrent,
                    after.world,
                );
                check(
                    'exactly one native step',
                    after.native.nativeStepIndex === before.native.nativeStepIndex + 1,
                    after.native,
                );
                const count = after.native.nativeStepIndex,
                    retry = attempt(() => system.step(1 / 60));
                check(
                    'fault cannot replay native step',
                    !!retry && binding.stepDiagnostics(token).nativeStepIndex === count,
                    { retry: serializeError(retry), native: binding.stepDiagnostics(token) },
                );
            } else if (fixture.expected === 'prestep-parent-alias') {
                check(
                    'raw ancestor alias rejected before native',
                    !!error && after.native.nativeStepIndex === before.native.nativeStepIndex,
                    { error: serializeError(error), native: after.native },
                );
                check('preflight rejection preserves world diagnostics', same(after.world, before.world), {
                    before: before.world,
                    after: after.world,
                });
                check(
                    'preflight does not rewrite body locals',
                    subjects.every((s, i) => sameLocal(preAttemptNodes[i], localSample(s.node))),
                    after.subjects,
                );
            } else {
                check('valid writeback completes ready', !error && after.world.state === 'ready', {
                    error: serializeError(error),
                    world: after.world,
                });
                check(
                    'exactly one native step',
                    after.native.nativeStepIndex === before.native.nativeStepIndex + 1,
                    after.native,
                );
                for (const s of after.subjects)
                    check(
                        'scene origin and orientation match immutable native ' + s.node.name,
                        s.node.errors!.origin < 1e-6 && s.node.errors!.angular < 1e-6,
                        s,
                    );
                if (fixture.expected === 'setter-caught')
                    check(
                        'caught business setter rejected synchronously',
                        triggered && events.some((e) => e.error?.code === 'AIR_E_BOX3D_CONFIG'),
                        events,
                    );
                if (fixture.expected === 'scale-dirty')
                    check(
                        'SCALE dirty preserved',
                        (subjects[0].node.hasChangedFlags & 4) !== 0,
                        subjects[0].node.hasChangedFlags,
                    );
                if (fixture.expected === 'baseline') {
                    const secondError = attempt(() => system.step(1 / 60)),
                        end = snapshot();
                    check(
                        'default configuration second real step',
                        !secondError && binding.stepDiagnostics(token).nativeStepIndex === 2,
                        serializeError(secondError),
                    );
                    check(
                        'independent constant velocity displacement',
                        Math.abs(end[0].native[0] - before.subjects[0].native[0] - 2 * Math.fround(1 / 60)) < 1e-6,
                        end,
                    );
                    check('origin is not COM', Math.abs(end[0].native[7] - end[0].native[0] - 0.25) < 1e-6, end[0]);
                    check('second scene origin matches', end[0].node.errors!.origin < 1e-6, end[0]);
                    fixture.checkpoint('default-policy-second-tick', {
                        subjects: end,
                        world: world.diagnostics(),
                        native: binding.stepDiagnostics(token),
                    });
                }
                if (epochLimit !== null && !error) {
                    const secondError = epochLimit === 2 ? attempt(() => system.step(1 / 60)) : null;
                    const full = {
                        world: world.diagnostics(),
                        native: binding.stepDiagnostics(token),
                        subjects: snapshot(),
                    };
                    const exhausted = attempt(() => system.step(1 / 60)),
                        final = {
                            world: world.diagnostics(),
                            native: binding.stepDiagnostics(token),
                            subjects: snapshot(),
                        };
                    check(
                        'artificial limit allows its real tick count',
                        !secondError && (full.world as any).writeback.epoch === epochLimit,
                        full,
                    );
                    check(
                        'epoch exhaustion rejects with no native or scene mutation',
                        !!exhausted && same(full, final),
                        {
                            error: serializeError(exhausted),
                            full,
                            final,
                        },
                    );
                    fixture.checkpoint('artificial-safe-integer-boundary', {
                        epochLimit,
                        notNaturalMaxSafeIntegerExhaustion: true,
                        error: serializeError(exhausted),
                        full,
                        final,
                    });
                }
            }
        }
        const native = binding.stepDiagnostics(token),
            observations = fixture.observations();
        check(
            'observed real native steps match native counter',
            observations.calls.filter((r: any) => r.name === 'step' && r.returned).length === native.nativeStepIndex,
            native,
        );
        fixture.checkpoint('case-verdict-before-real-close', { checks, world: world.diagnostics(), native });
    } catch (error) {
        failure = error;
    } finally {
        // Do not release product guards in the fixture. Real scene/component/app close must own that cleanup.
        if (app) {
            try {
                const close = await app.close!();
                const observations = fixture.observations();
                fixture.checkpoint('complete-close-receipt-before-assertions', {
                    close,
                    loader: fixture.loader.diagnostics(),
                    observations,
                });
                check('app close released', close.status === 'released', close);
                check('close is idempotent', (await app.close!()) === close, close);
                check(
                    'native core bytes return to actual initial count',
                    observations.beforeBindingDispose?.coreBytes === observations.initialCoreBytes,
                    observations.beforeBindingDispose,
                );
                check(
                    'native bridge resources zero',
                    same(observations.beforeBindingDispose?.bridge, {
                        liveBytes: '0',
                        liveAllocations: 0,
                        shapeHandles: 0,
                        primitiveCapacity: 0,
                        capturedPrimitives: 0,
                    }),
                    observations.beforeBindingDispose,
                );
                check(
                    'loader disposed without observation failures',
                    fixture.loader.diagnostics().status === 'DISPOSED' && observations.observationErrors.length === 0,
                    fixture.loader.diagnostics(),
                );
                for (const { node, listener } of listeners) node.off(Node.EventType.TRANSFORM_CHANGED, listener);
                for (const node of cleanupNodes) {
                    // Destroyed Cocos Nodes deliberately clear their TRS fields. Check the real registry without touching them.
                    const error = attempt(() => assertNodeTransformEntry(node, 'setPosition'));
                    check('temporary Node guard released by close ' + node.name, !error, serializeError(error));
                }
            } catch (error) {
                failure = failure ?? error;
            }
        }
    }
    fixture.checkpoint('final-assertions', { checks, failure: serializeError(failure) });
    if (!failure && checks.some((c) => !c.pass))
        failure = new Error(
            'Writeback invariant failure: ' +
                checks
                    .filter((c) => !c.pass)
                    .map((c) => c.id)
                    .join('; '),
        );
    if (failure) {
        fixture.fail(failure);
        throw failure;
    }
    fixture.complete('PASS_LIMITED_WRITEBACK_EPOCH');
});
