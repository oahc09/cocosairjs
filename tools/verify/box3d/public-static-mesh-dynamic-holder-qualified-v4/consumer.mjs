/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Unchanged normal production ESM and exported APIs only. No registered adapter or native instrumentation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { root, loadLock, verifyInputs, sha } from './inputs.mjs';
import { installHost, BASE } from './host.mjs';
import { identity, samples, transform, rayOracle, sourceMesh, rejectedMesh } from './geometry.mjs';
const [runtimeArgument, lockArgument, outputArgument] = process.argv.slice(2);
assert(
    runtimeArgument && lockArgument && outputArgument,
    'Pass ready runtime, frozen lock, and fresh result directory',
);
const artifacts = resolve(runtimeArgument),
    out = resolve(outputArgument),
    lockPath = resolve(lockArgument);
assert(!existsSync(out), 'Preserve every prior attempt; select a fresh output directory');
const { lock, lockSha256 } = loadLock(lockPath);
verifyInputs(artifacts, lock);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'input-lock.json'), readFileSync(lockPath), { flag: 'wx' });
for (const entry of lock.fixture) {
    const destination = join(out, 'frozen-fixture', entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(join(root, entry.path)), { flag: 'wx' });
}
const raw = join(out, 'consumer.raw.json');
const report = {
    schema: 'box3d-public-static-mesh-production-esm-v1',
    status: 'RUNNING',
    scope: lock.scope,
    fullGates: 'NOT_RUN',
    C16: 'NOT_RUN',
    C17: 'NOT_RUN',
    C18: 'NOT_RUN',
    C19: 'NOT_RUN',
    publicMeshEvents: 'UNQUALIFIED_REJECTED; not an event qualification PASS',
    identityLabel: lock.identityLabel,
    hostBoundary:
        'Node HEADLESS/JSDOM, not a browser, GPU, or presentation acceptance. Only exact frozen asset transport and URL resolution are adapted; engine and WASM are unchanged.',
    observableBoundary:
        'Public rays, copied face metadata, component state, native body-motion snapshots, real simulation and close reports only. No private resource counts, native allocation bytes, cook call tracing, or exact native lease-count claim. Shared-source lifecycle behavior does not by itself prove cache deduplication.',
    cookFailureBoundary:
        'Duplicate oriented indices are source-intake rejection. The separate undersized nonzero triangle exercises the public native-error path; native cook entry and allocation atomicity need the separately retained source/native fixture evidence.',
    startedAt: new Date().toISOString(),
    lockSha256,
    runtimeIdentity: lock.runtime,
    declaredRuntimeProducerCommit: lock.declaredRuntimeProducerCommit,
    checkoutAtFreeze: lock.checkoutAtFreeze,
    sourceSnapshotRole: lock.sourceSnapshotRole,
    transport: [],
    moduleResolution: [],
    hostErrors: [],
    checks: [],
    frames: [],
    rays: [],
    committedQueries: [],
    rejections: [],
    lifecycles: [],
    motionSamples: [],
};
const flush = () => writeFileSync(raw, JSON.stringify(report, null, 2) + '\n');
const check = (name, pass, detail = null) => {
    report.checks.push({ name, pass: !!pass, detail });
    flush();
    assert(pass, name);
};
const xyz = (v) => [v.x, v.y, v.z];
const vectorError = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const objectVector = ([x, y, z]) => ({ x, y, z });
let app,
    host,
    clock,
    ticks = 0,
    failure,
    savedQueries,
    savedQueriesJSON;
flush();
try {
    host = installHost(artifacts, lock, report, flush);
    const sdk = await import(host.bundle);
    check(
        'Production import does not acquire native assets',
        report.transport.length === 0 && report.moduleResolution.length === 0,
    );
    check(
        'Exact frozen production runtime build',
        sdk.AIR_BUILD_NUMBER === lock.runtimeBuildNumber,
        sdk.AIR_BUILD_NUMBER,
    );
    const required = [
        'createAirApp',
        'createStepClock',
        'Node',
        'Scene',
        'RigidBody',
        'MeshCollider',
        'SphereCollider',
        'Mesh',
        'PhysicsSystem',
        'Vec3',
        'readBox3DBodyMotion',
        'registerBox3DBeforeStep',
        'queryBox3DCommittedRay',
    ];
    check(
        'Required APIs are actual public exports',
        required.every((name) => typeof sdk[name] === 'function') &&
            typeof sdk.geometry?.Ray === 'function' &&
            typeof sdk.gfx?.Attribute === 'function',
        required,
    );
    check(
        'No test-only/native-state entry exported',
        !Object.keys(sdk).some((name) => name.startsWith('__testOnly')) && !('readBox3DBodyState' in sdk),
    );
    app = await sdk.createAirApp({
        canvas: '#GameCanvas',
        renderMode: 3,
        physics: 'box3d',
        physicsOptions: { box3d: { assetBaseUrl: BASE, threading: 'single', workerCount: 1, solverSubSteps: 4 } },
    });
    check(
        'Public loader consumes the exact frozen ST assets',
        report.transport.map((entry) => entry.path).join(',') ===
            ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].map((name) => 'physics/box3d/st/' + name).join(',') &&
            report.moduleResolution.length === 1,
    );
    const { Node, Scene, RigidBody, MeshCollider, SphereCollider, PhysicsSystem, Vec3 } = sdk;
    const system = PhysicsSystem.instance;
    system.enable = true;
    system.autoSimulation = false;
    system.gravity = new Vec3();
    system.fixedTimeStep = 1 / 60;
    system.maxSubSteps = 1;
    const scene = new Scene('public-static-mesh-production-esm');
    app.run(scene);
    clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
    clock.begin();
    const step = async () => {
        const frame = await clock.step(1 / 60);
        ticks++;
        assert.deepEqual(frame, { step: ticks, dt: 1 / 60, afterDraw: true });
        report.frames.push(frame);
        flush();
    };
    const make = (id, x, mesh, overrides = {}, type = RigidBody.Type.STATIC) => {
        const spec = { ...identity, position: [x, 0, 0], ...overrides };
        const node = new Node(id);
        node.setPosition(...spec.position);
        node.setScale(...spec.scale);
        node.setRotationFromEuler(0, spec.yaw, 0);
        const body = node.addComponent(RigidBody);
        body.type = type;
        const collider = node.addComponent(MeshCollider);
        collider.center = new Vec3(...spec.center);
        collider.mesh = mesh;
        scene.addChild(node);
        return { id, node, body, collider, spec };
    };
    const read = (item) => sdk.readBox3DBodyMotion(item.body);
    const ray = (item, sample, stage, expectedHit = true) => {
        const surface = transform(sample, item.spec),
            origin = [surface[0], surface[1] + 2, surface[2]],
            direction = [0, -1, 0];
        const oracleHits = rayOracle(origin, direction, item.spec);
        assert.equal(oracleHits.length, 1);
        const hit = system.raycastClosest(new sdk.geometry.Ray(...origin, ...direction), -1, 5, false);
        const result = hit ? system.raycastClosestResult : null;
        const row = {
            id: item.id,
            stage,
            origin,
            direction,
            expectedHit,
            hit,
            oracleHits,
            ...(result
                ? {
                      distance: result.distance,
                      point: xyz(result.hitPoint),
                      normal: xyz(result.hitNormal),
                      colliderMatches: result.collider === item.collider,
                  }
                : {}),
        };
        report.rays.push(row);
        flush();
        assert.equal(hit, expectedHit, `${item.id} ${stage}: expected ray visibility`);
        if (hit) {
            const expected = oracleHits[0];
            assert.equal(row.colliderMatches, true, 'Ray returns the same public collider');
            assert(Math.abs(row.distance - expected.distance) <= 2e-5, 'Ray distance error <= 2e-5');
            assert(vectorError(row.point, expected.point) <= 2e-5, 'Ray point error <= 2e-5');
            assert(vectorError(row.normal, expected.normal) <= 2e-5, 'Ray normal error <= 2e-5');
        }
        return row;
    };
    // The gap has no triangles. Keep it distinct from a disabled/destroyed visible triangle.
    const gap = (item, stage) => {
        const p = transform([0, 0, 0], item.spec),
            origin = [p[0], p[1] + 2, p[2]];
        assert.deepEqual(rayOracle(origin, [0, -1, 0], item.spec), []);
        const hit = system.raycastClosest(new sdk.geometry.Ray(...origin, 0, -1, 0), -1, 5, false);
        report.rays.push({ id: item.id, stage: stage + '-concave-gap', origin, expectedHit: false, hit });
        check(item.id + ' ' + stage + ' concave gap is empty', !hit);
    };
    const allRays = (items, stage) => {
        system.syncSceneToPhysics();
        for (const item of items) {
            for (const sample of samples) ray(item, sample, stage);
            gap(item, stage);
        }
    };
    const committed = async (items, stage) => {
        let calls = 0;
        const observations = [];
        system.autoSimulation = true;
        const hook = sdk.registerBox3DBeforeStep((context) => {
            calls++;
            for (const item of items) {
                for (const sample of samples) {
                    const p = transform(sample, item.spec),
                        origin = [p[0], p[1] + 2, p[2]];
                    const expected = rayOracle(origin, [0, -1, 0], item.spec)[0];
                    const q = sdk.queryBox3DCommittedRay(
                        context,
                        objectVector(origin),
                        { x: 0, y: -5, z: 0 },
                        { group: -1, mask: -1, queryTrigger: false },
                    );
                    assert.equal(q.complete, true);
                    assert.equal(q.hits.length, 1);
                    const hit = q.hits[0];
                    assert.equal(hit.collider, item.collider);
                    assert.deepEqual(hit.meshFace, expected.meshFace);
                    assert(Math.abs(hit.distance - expected.distance) <= 2e-5);
                    assert(Math.abs(hit.fraction - expected.distance / 5) <= 2e-5);
                    assert(vectorError(xyz(hit.point), expected.point) <= 2e-5);
                    assert(vectorError(xyz(hit.normal), expected.normal) <= 2e-5);
                    assert(
                        Object.isFrozen(q) &&
                            Object.isFrozen(q.hits) &&
                            Object.isFrozen(hit) &&
                            Object.isFrozen(hit.meshFace) &&
                            Object.isFrozen(hit.point) &&
                            Object.isFrozen(hit.normal),
                    );
                    observations.push({
                        id: item.id,
                        stage,
                        ...q,
                        hits: q.hits.map((value) => ({ ...value, collider: item.id })),
                    });
                }
            }
        });
        try {
            await step();
        } finally {
            hook.dispose();
            system.autoSimulation = false;
        }
        report.committedQueries.push(...observations);
        check(
            stage + ' copied source-face metadata from exactly one real fixed tick',
            calls === 1 && observations.length === items.length * 4,
            { calls, queries: observations.length },
        );
        return observations;
    };
    const shared = sourceMesh(sdk);
    const a = make('shared-a', 0, shared),
        b = make('shared-b', 10, shared),
        c = make('shared-c', 20, shared);
    allRays([a, b, c], 'initial-three-shared-source');
    savedQueries = await committed([a, b, c], 'initial-three-shared-source');
    savedQueriesJSON = JSON.stringify(savedQueries);
    const authoredBefore = sha(shared.data);
    shared.data.fill(0);
    check('Authored source bytes really changed after admission', sha(shared.data) !== authoredBefore);
    allRays([a, b, c], 'authored-source-mutated-native-snapshot-stable');
    const reject = (label, operation, expectedCode) => {
        let caught;
        try {
            operation();
        } catch (error) {
            caught = error;
        }
        const row = {
            label,
            rejected: !!caught,
            code: caught?.code ?? null,
            name: caught?.name ?? null,
            message: caught?.message ?? null,
        };
        report.rejections.push(row);
        check(label + ' rejects with expected public error', !!caught && row.code === expectedCode, row);
        return row;
    };
    const invalidMeshes = [
        ['invalid-second-submesh', sourceMesh(sdk, 0, true), 'TOPOLOGY'],
        [
            'duplicate-oriented-triangle-source-admission',
            rejectedMesh(sdk, 'duplicate-oriented-triangle'),
            'DUPLICATE_FACE',
        ],
        ['undersized-nonzero-triangle-native-error-path', rejectedMesh(sdk, 'undersized'), 'AIR_E_BOX3D_NATIVE'],
    ];
    for (const [label, mesh, code] of invalidMeshes) {
        const motions = [a, b, c].map(read),
            old = a.collider.mesh;
        reject(
            label,
            () => {
                a.collider.mesh = mesh;
            },
            code,
        );
        assert.equal(a.collider.mesh, old);
        assert.deepEqual([a, b, c].map(read), motions);
        allRays([a, b, c], label + '-atomicity');
        check(label + ' preserves all three public borrowers', true);
    }
    for (const type of [RigidBody.Type.DYNAMIC, RigidBody.Type.KINEMATIC]) {
        const before = read(a);
        reject(
            'existing-static-mesh-body-rejects-type-' + type,
            () => {
                a.body.type = type;
            },
            'AIR_E_BOX3D_UNSUPPORTED',
        );
        assert.equal(a.body.type, RigidBody.Type.STATIC);
        assert.deepEqual(read(a), before);
        const holder = make('nonstatic-holder-' + type, 140 + type * 10, null, {}, type);
        // An enabled dynamic body needs real effective geometry before world preflight.
        // Keep its MeshCollider empty: only the primitive supplies mass for the rejection probe.
        const primitive = type === RigidBody.Type.DYNAMIC ? holder.node.addComponent(SphereCollider) : null;
        const primitiveState = () =>
            primitive && {
                body: primitive.attachedRigidBody,
                radius: primitive.radius,
                enabled: primitive.enabled,
                isTrigger: primitive.isTrigger,
            };
        if (primitive) {
            assert.equal(primitive.attachedRigidBody, holder.body);
            assert(primitive.radius > 0 && Number.isFinite(primitive.radius));
            assert.equal(primitive.enabled, true);
            assert.equal(primitive.isTrigger, false);
        }
        assert.equal(holder.collider.mesh, null);
        system.syncSceneToPhysics();
        const holderBefore = read(holder);
        assert.equal(holder.body.type, type);
        // Public motion uses native type numbers, not ERigidBodyType.
        assert.equal(holderBefore.type, type === RigidBody.Type.DYNAMIC ? 2 : 1);
        assert.equal(holderBefore.enabled, true);
        if (primitive) {
            assert.equal(holderBefore.massPending, false);
            assert(holderBefore.mass > 0 && Number.isFinite(holderBefore.mass));
        }
        const primitiveBefore = primitiveState();
        reject(
            'nonstatic-body-rejects-mesh-assignment-' + type,
            () => {
                holder.collider.mesh = sourceMesh(sdk);
            },
            'AIR_E_BOX3D_UNSUPPORTED',
        );
        assert.equal(holder.collider.mesh, null);
        assert.deepEqual(read(holder), holderBefore);
        assert.deepEqual(primitiveState(), primitiveBefore);
        holder.node.destroy();
        await step();
    }
    // This is an explicit unsupported boundary, never a claim that Mesh events are qualified.
    reject(
        'unqualified-Mesh-collision-listener-boundary',
        () => a.collider.on('onCollisionEnter', () => {}),
        'AIR_E_BOX3D_UNSUPPORTED',
    );
    await committed([a, b, c], 'after-rejected-mutations');
    a.collider.mesh = sourceMesh(sdk, 0.25);
    a.spec = { ...a.spec, meshY: 0.25 };
    allRays([a, b, c], 'one-borrower-replaced-other-two-preserved');
    b.collider.enabled = false;
    ray(b, samples[0], 'disabled-shared-borrower', false);
    allRays([a, c], 'sibling-disable-preserves-survivors');
    b.collider.enabled = true;
    allRays([a, b, c], 're-enabled-copied-source-despite-authored-zero-bytes');
    c.node.destroy();
    await step();
    ray(c, samples[0], 'destroyed-first-shared-borrower', false);
    allRays([a, b], 'survivors-after-first-destroy');
    a.collider.mesh = null;
    ray(a, samples[0], 'replacement-detached', false);
    allRays([b], 'last-original-borrower-survives');
    b.collider.mesh = null;
    ray(b, samples[0], 'last-original-borrower-detached', false);
    b.collider.mesh = sourceMesh(sdk);
    allRays([b], 'fresh-assignment-after-last-release');
    a.node.destroy();
    b.node.destroy();
    await step();
    ray(b, samples[0], 'last-recreated-borrower-destroyed', false);
    report.lifecycles.push({
        stage: 'three-shared-source-lifecycle',
        operations: [
            'replace-one',
            'disable-other',
            'reenable-other',
            'destroy-third',
            'detach-replacement',
            'detach-last-original',
            'assign-fresh',
            'destroy-all',
        ],
        publicBehavior: 'PASS',
        internalCacheLeaseCounts: 'NOT_OBSERVED',
    });
    const fresh = sourceMesh(sdk);
    const scaled = make('scaled', 40, fresh, { scale: [2, 1, 3], center: [0.25, 0.5, 0] });
    const mirrored = make('mirrored', 60, fresh, { scale: [-1, 1, 1], center: [0.2, 0, 0] });
    const turned = make('turned', 80, fresh, { yaw: 90 });
    const closeA = make('shared-live-at-close-a', 100, fresh),
        closeB = make('shared-live-at-close-b', 110, fresh);
    const live = [scaled, mirrored, turned, closeA, closeB];
    allRays(live, 'transforms-and-live-shared-close-borrowers');
    await committed(live, 'transformed-source-face-mapping');
    const makeBall = (id, x, z) => {
        const node = new Node(id);
        node.setPosition(x, 2, z);
        const body = node.addComponent(RigidBody);
        body.type = RigidBody.Type.DYNAMIC;
        body.mass = 1;
        body.allowSleep = false;
        const sphere = node.addComponent(SphereCollider);
        sphere.radius = 0.2;
        scene.addChild(node);
        return { node, body, sphere };
    };
    const onMesh = transform(samples[0], scaled.spec),
        inGap = transform([0, 0, 0], scaled.spec);
    const ball = makeBall('sphere-falls-on-real-mesh', onMesh[0], onMesh[2]);
    const gapBall = makeBall('sphere-falls-through-concave-gap', inGap[0], inGap[2]);
    system.gravity = new Vec3(0, -10, 0);
    system.autoSimulation = true;
    for (let i = 0; i < 120; i++) {
        await step();
        report.motionSamples.push({
            frame: i + 1,
            onMeshNodeY: ball.node.worldPosition.y,
            onMeshMotion: read({ body: ball.body }),
            gapNodeY: gapBall.node.worldPosition.y,
        });
        flush();
    }
    system.autoSimulation = false;
    const ys = report.motionSamples.map((row) => row.onMeshNodeY),
        tail = ys.slice(-20);
    check(
        'Real Sphere falls then rests on scaled static triangle mesh',
        ys[0] > 1.9 &&
            Math.min(...ys) >= 0.64 &&
            ys.at(-1) > 0.68 &&
            ys.at(-1) < 0.73 &&
            Math.max(...tail) - Math.min(...tail) < 0.01,
        {
            initial: ys[0],
            minimum: Math.min(...ys),
            final: ys.at(-1),
            expectedSurfaceY: 0.5,
            radius: 0.2,
            tailRange: Math.max(...tail) - Math.min(...tail),
        },
    );
    check('Independent Sphere falls through the real concave gap', report.motionSamples.at(-1).gapNodeY < -5, {
        final: report.motionSamples.at(-1).gapNodeY,
    });
    report.lifecycles.push({
        stage: 'normal-close-with-live-shared-source',
        colliders: live.map((item) => item.id),
        note: 'Two unchanged same-source/same-transform borrowers remain live for app.close. Private lease and memory counts are not public observations.',
    });
    check(
        'Copied source-face observations remain stable after mutations and real simulation',
        JSON.stringify(savedQueries) === savedQueriesJSON,
    );
} catch (error) {
    failure = error;
    report.error = String(error.stack ?? error);
    report.errorCode = error.code ?? null;
} finally {
    if (app)
        try {
            const first = app.close(),
                duplicate = app.close();
            check('Public app.close is idempotent', first === duplicate);
            report.close = await first;
            check(
                'Normal app.close reports released with no failures',
                report.close.status === 'released' && report.close.failures.length === 0,
                report.close,
            );
            check(
                'Public physics-preparation ownership released',
                report.close.physicsPreparation?.status === 'closed' &&
                    report.close.physicsPreparation.cleanupErrors.length === 0 &&
                    report.close.physicsPreparation.acquired.length > 0 &&
                    report.close.physicsPreparation.acquired.every(
                        (entry) =>
                            entry.backend === 'box3d' && entry.cleanup === 'released' && entry.retained.length === 0,
                    ),
                report.close.physicsPreparation,
            );
            report.sharedRetainedAtClose = {
                values: report.close.retained,
                boundary:
                    'Runtime/scheduler/builtin resources/shared asset caches may intentionally remain. This is not total-runtime zero-memory or zero-leak evidence.',
            };
            if (savedQueries)
                check(
                    'Copied face observations survive close unchanged',
                    JSON.stringify(savedQueries) === savedQueriesJSON,
                );
        } catch (error) {
            report.closeError = String(error.stack ?? error);
            failure ??= error;
        }
    try {
        verifyInputs(artifacts, lock);
        assert.equal(sha(readFileSync(lockPath)), lockSha256);
        report.inputsUnchanged = true;
    } catch (error) {
        report.inputError = String(error.stack ?? error);
        failure ??= error;
    }
    try {
        host?.close();
    } catch (error) {
        report.hostCloseError = String(error.stack ?? error);
        failure ??= error;
    }
    report.status = failure ? 'FAIL' : 'PASS_LIMITED_NODE_HEADLESS_PUBLIC_STATIC_MESH';
    report.completedAt = new Date().toISOString();
    report.totalSteps = ticks;
    if (failure) process.exitCode = 1;
    flush();
}
console.log(
    JSON.stringify({
        status: report.status,
        checks: report.checks.length,
        rays: report.rays.length,
        committedQueries: report.committedQueries.length,
        rejections: report.rejections.length,
        motionSamples: report.motionSamples.length,
        error: report.error ?? report.closeError ?? report.inputError ?? null,
    }),
);
