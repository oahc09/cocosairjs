// Invoked ONLY by a separately authorized fresh production-ESM/ST harness.
// Importing this module never loads an engine, WASM, native library, or browser.
import assert from 'node:assert/strict';
import { baseSpec, samples, heights, source, transform, rayOracle, surfaceDistance, TOLERANCE } from './oracle.mjs';
import { DROP, reviewDropTrace } from './drop-oracle.mjs';
const xyz = (v) => [v.x, v.y, v.z],
    vec = ([x, y, z]) => ({ x, y, z });
const near = (a, b) => assert.ok(Math.abs(a - b) <= TOLERANCE, `${a} vs ${b}; original 0.01 m tolerance`);
export async function runPublicTerrainQueries(sdk, scene, step, observe = () => {}) {
    // Observation-only copies: failure evidence must not depend on the fixture reaching return.
    const emit = (kind, value) => observe(kind, structuredClone(value));
    const { Node, RigidBody, TerrainCollider, SphereCollider, PhysicsMaterial, PhysicsSystem, Vec3 } = sdk,
        system = PhysicsSystem.instance;
    assert.equal(typeof TerrainCollider, 'function', 'new product must actually export TerrainCollider');
    assert.equal(typeof PhysicsMaterial, 'function', 'explicit reproducible drop material required');
    const material = new PhysicsMaterial();
    material.restitution = 0;
    material.friction = 0.6;
    material.rollingFriction = 0;
    material.spinningFriction = 0;
    const report = {
        scope: 'candidate public TerrainCollider; NOT full gates',
        rays: [],
        sweeps: [],
        drops: [],
        committedQueries: [],
        cleanupErrors: [],
        C19: 'NOT_QUALIFIED_BY_PUBLIC_BEHAVIOR',
    };
    const original = {
        gravity: system.gravity.clone(),
        autoSimulation: system.autoSimulation,
        fixedTimeStep: system.fixedTimeStep,
        maxSubSteps: system.maxSubSteps,
    };
    system.fixedTimeStep = DROP.dt;
    system.maxSubSteps = 1;
    system.autoSimulation = false;
    system.gravity = new Vec3();
    const nodes = [],
        shared = source();
    const make = (id, spec = baseSpec, asset = shared) => {
        const node = new Node(id);
        nodes.push(node);
        node.setPosition(...spec.position);
        node.setScale(...spec.scale);
        node.setRotationFromEuler(0, spec.yaw, 0);
        const body = node.addComponent(RigidBody);
        body.type = RigidBody.Type.STATIC;
        const collider = node.addComponent(TerrainCollider);
        collider.sharedMaterial = material;
        collider.center = new Vec3(...spec.center);
        collider.terrain = asset;
        scene.addChild(node);
        return { id, node, body, collider, spec };
    };
    const ray = (item, sample = samples[0], expected = true, L = 30, up = false) => {
        const [x, z, y] = sample,
            p = transform([x / 2, y, z / 3], item.spec),
            origin = [p[0], p[1] + (up ? -10 : 10), p[2]],
            dir = [0, up ? 1 : -1, 0];
        const oracle = rayOracle(origin, dir, L, item.spec);
        system.syncSceneToPhysics();
        const hit = system.raycastClosest(new sdk.geometry.Ray(...origin, ...dir), -1, L, false);
        const row = { id: item.id, origin, dir, L, hit, expectedHit: expected };
        if (hit) {
            const r = system.raycastClosestResult;
            row.point = xyz(r.hitPoint);
            row.distance = r.distance;
            row.colliderMatches = r.collider === item.collider;
            row.faceOracle = oracle[0]?.face ?? null;
        }
        report.rays.push(row);
        emit('ray', row);
        assert.equal(hit, expected);
        if (hit) {
            assert.equal(oracle.length, 1);
            const r = system.raycastClosestResult,
                e = oracle[0];
            assert.equal(r.collider, item.collider);
            near(r.distance, e.distance);
            xyz(r.hitPoint).forEach((n, i) => near(n, e.point[i]));
            row.point = xyz(r.hitPoint);
            row.faceOracle = e.face;
        }
        return row;
    };
    let primaryFailed = false;
    try {
        const a = make('terrain-a'),
            b = make('terrain-b', { ...baseSpec, position: [20, 0, 0] }),
            c = make('terrain-c', { ...baseSpec, position: [40, 0, 0] });
        const turned = make('terrain-centered-rotated', {
            ...baseSpec,
            center: [0.25, 0.5, -0.75],
            scale: [2, 1.5, 3],
            position: [70, 3, -9],
            yaw: 37,
        });
        for (const item of [a, b, c, turned]) for (const s of samples) ray(item, s);
        // Endpoint/backface are separately reported; they never relax the six-ray height threshold.
        ray(a, samples[0], false, 10);
        ray(a, samples[0], true, 10.02);
        ray(a, samples[0], false, 30, true);
        // All three public primitive sweeps must retain TerrainCollider attribution.
        const p = transform([0.25, 0.75, 0.25], a.spec),
            cast = new sdk.geometry.Ray(p[0], p[1] + 10, p[2], 0, -1, 0),
            q = { x: 0, y: 0, z: 0, w: 1 };
        for (const [kind, run] of [
            ['sphere', () => system.sweepSphereClosest(cast, 0.05, -1, 30, false)],
            ['box', () => system.sweepBoxClosest(cast, new Vec3(0.05, 0.05, 0.05), q, -1, 30, false)],
            ['capsule', () => system.sweepCapsuleClosest(cast, 0.05, 0.1, q, -1, 30, false)],
        ]) {
            const hit = run(),
                r = system.sweepCastClosestResult;
            const row = {
                kind,
                hit,
                distance: hit ? r.distance : null,
                collider: hit && r.collider === a.collider ? a.id : null,
            };
            report.sweeps.push(row);
            emit('sweep', row);
            assert.equal(hit, true);
            assert.equal(r.collider, a.collider);
            assert.ok(r.distance >= 0 && r.distance < 30);
        }
        let copied,
            savedCopied,
            calls = 0;
        const hook = sdk.registerBox3DBeforeStep((context) => {
            calls++;
            const result = sdk.queryBox3DCommittedRay(context, vec([0.5, 20, 0.75]), vec([0, -30, 0]), {
                group: -1,
                mask: -1,
                queryTrigger: false,
            });
            const observation = {
                complete: result.complete,
                hits: result.hits.map((hit) => ({ ...hit, collider: hit.collider?.node?.name ?? null })),
            };
            report.committedQueries.push(observation);
            emit('committed-query', observation);
            assert.equal(result.complete, true);
            assert.equal(result.hits.length, 1);
            assert.equal(result.hits[0].collider, a.collider);
            assert.ok(result.hits[0].collider instanceof TerrainCollider, 'public TerrainCollider identity');
            const diagnostic = result.hits[0].collider.shape.impl;
            assert.equal(diagnostic.kind, 'terrain-shape');
            assert.equal(diagnostic.nativeKind, 'mesh');
            assert.equal(diagnostic.provenance, 'heightfield-cooked-static-triangle-mesh');
            assert.equal(result.hits[0].meshFace.flatFace, 0);
            assert.ok(Object.isFrozen(result.hits[0].meshFace));
            copied = result.hits[0];
            savedCopied = JSON.stringify({ ...copied, collider: a.id });
        });
        system.autoSimulation = true;
        try {
            await step();
        } finally {
            hook.dispose();
            system.autoSimulation = false;
        }
        assert.equal(calls, 1);
        for (const type of [RigidBody.Type.DYNAMIC, RigidBody.Type.KINEMATIC]) {
            assert.throws(() => (a.body.type = type));
            assert.equal(a.body.type, RigidBody.Type.STATIC);
            ray(a);
        }
        const old = a.collider.terrain;
        assert.throws(() => (a.collider.terrain = { ...source(), getHeight: () => NaN }));
        assert.equal(a.collider.terrain, old);
        ray(a);
        assert.throws(() => (a.collider.isTrigger = true));
        assert.equal(a.collider.isTrigger, false);
        assert.throws(() => a.collider.on('onCollisionEnter', () => {}));
        // Null/disabled shapes continue guarding their owning static body.
        a.collider.terrain = null;
        ray(a, samples[0], false);
        assert.throws(() => (a.body.type = RigidBody.Type.DYNAMIC));
        a.collider.terrain = old;
        ray(a);
        b.collider.enabled = false;
        ray(b, samples[0], false);
        assert.throws(() => (b.body.type = RigidBody.Type.KINEMATIC));
        ray(a);
        ray(c);
        b.collider.enabled = true;
        ray(b);
        c.node.destroy();
        await step();
        ray(c, samples[0], false);
        ray(a);
        ray(b);
        b.node.destroy();
        await step();
        ray(b, samples[0], false);
        ray(a);
        // New source assignment changes only this collider and source-face snapshot remains copied.
        a.collider.terrain = source(heights.map((v) => v + 0.25));
        const changed = { ...a, spec: { ...a.spec, position: [0, 0.25, 0] } };
        ray(changed);
        a.collider.terrain = old;
        ray(a);
        assert.equal(
            JSON.stringify({ ...copied, collider: a.id }),
            savedCopied,
            'copied committed query remains immutable after terrain swap/destroy',
        );
        // Actual dynamic sphere onto the SAME uneven 3x3 terrain. Detect first contact geometrically,
        // not a false horizontal-plane resting oracle (the ball is allowed to roll on a slope).
        const ballNode = new Node('terrain-drop');
        nodes.push(ballNode);
        ballNode.setPosition(0.5, 2, 0.75);
        const ball = ballNode.addComponent(RigidBody);
        ball.type = RigidBody.Type.DYNAMIC;
        ball.mass = 1;
        ball.linearDamping = 0;
        ball.angularDamping = 0;
        const sphere = ballNode.addComponent(SphereCollider);
        sphere.radius = 0.1;
        sphere.sharedMaterial = material;
        scene.addChild(ballNode);
        system.gravity = new Vec3(0, -10, 0);
        system.autoSimulation = true;
        let firstContact = -1;
        for (let i = 0; i < DROP.maxApproachSteps + DROP.responseSteps; i++) {
            await step();
            const position = xyz(ballNode.worldPosition),
                clearance = surfaceDistance(position) - 0.1;
            const row = { step: i + 1, position, clearance };
            report.drops.push(row);
            emit('drop', row);
            const vertical = rayOracle([position[0], 30, position[2]], [0, -1, 0], 60);
            assert.ok(vertical.length > 0, 'drop must remain over the finite terrain before first contact');
            assert.ok(
                position[1] >= vertical[0].point[1] - TOLERANCE,
                'unsigned distance must not hide tunneling below terrain',
            );
            assert.ok(clearance >= -TOLERANCE, 'sphere must not penetrate the independent triangle surface by > .01 m');
            if (firstContact < 0 && clearance <= TOLERANCE) firstContact = i;
            if (firstContact >= 0 && i >= firstContact + DROP.responseSteps) break;
        }
        report.dropResponse = reviewDropTrace(report.drops);
        assert.ok(report.drops.at(-1).position[1] < 1.99, 'real gravity movement, not a static mock');
        report.status = 'PASS';
        return report;
    } catch (error) {
        primaryFailed = true;
        report.status = 'FAIL';
        report.error = String(error?.stack ?? error);
        try {
            emit('fixture-failure', report);
        } catch (observationError) {
            report.observationError = String(observationError?.stack ?? observationError);
        }
        throw error;
    } finally {
        // Attempt every cleanup and preserve the primary assertion instead of masking it with a cleanup tick failure.
        let cleanupFailure,
            cleanupFailed = false;
        const cleanup = async (stage, action) => {
            try {
                await action();
            } catch (error) {
                if (!cleanupFailed) cleanupFailure = error;
                cleanupFailed = true;
                report.status = 'FAIL';
                const row = { stage, error: String(error?.stack ?? error) };
                report.cleanupErrors.push(row);
                try {
                    emit('fixture-cleanup-failure', row);
                } catch (observationError) {
                    report.observationError = String(observationError?.stack ?? observationError);
                }
            }
        };
        await cleanup('stop-simulation', () => {
            system.autoSimulation = false;
        });
        for (const n of nodes)
            await cleanup('destroy-' + n.name, () => {
                if (n.isValid) n.destroy();
            });
        await cleanup('deferred-destroy-tick', () => step());
        await cleanup('destroy-material', () => material.destroy());
        await cleanup('restore-gravity', () => {
            system.gravity = original.gravity;
        });
        await cleanup('restore-auto-simulation', () => {
            system.autoSimulation = original.autoSimulation;
        });
        await cleanup('restore-fixed-step', () => {
            system.fixedTimeStep = original.fixedTimeStep;
        });
        await cleanup('restore-substeps', () => {
            system.maxSubSteps = original.maxSubSteps;
        });
        if (!primaryFailed && cleanupFailed) throw cleanupFailure;
    }
}
