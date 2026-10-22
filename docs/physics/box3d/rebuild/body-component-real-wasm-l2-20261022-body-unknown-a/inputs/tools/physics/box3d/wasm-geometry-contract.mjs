// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Independent analytic sphere/finite-box oracle, using separately retained pre-call body poses.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]);
const raw = resolve(dir, 'wasm-geometry-contract.raw.json');
assert.ok(!existsSync(raw), 'Preserve previous geometry attempt');
const samplesPath = resolve(dir, 'geometry-samples.raw.jsonl');
writeFileSync(samplesPath, '', { flag: 'wx' });
let sampleCount = 0;
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    tolerance: { point: 0.00002, normal: 0.00002, separation: 0.00002, basis: 0 },
    scope: 'Finite generation-epoch sphere/sphere and finite-box face qualification, not full C21/G1',
    limitations: [
        'No mesh/compound/heightfield/capsule/hull-hull qualification',
        'No current-surface or same-epoch impulse claim',
        'Finite reuse/growth loops are not universal ABA or whole-heap leak proof',
        'Node WASM, not browser/CSP/sanitizer evidence',
    ],
    checks: [],
    observations: {},
    samples: [],
};
const save = () => writeFileSync(raw, JSON.stringify(report, null, 2) + '\n');
const pass = (name, value = true) => {
    report.checks.push({ name, value, result: 'PASS' });
    save();
};
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
const norm = (a) => Math.hypot(...a);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rotate = (q, v) => {
    const t = scale(cross(q.slice(0, 3), v), 2);
    return add(v, add(scale(t, q[3]), cross(q.slice(0, 3), t)));
};
const inv = (q, v) => rotate([-q[0], -q[1], -q[2], q[3]], v);
const transform = (pose, p) => add(pose.slice(0, 3), rotate(pose.slice(3, 7), p));
const key = (id) => `${id.low}:${id.high}`;
const near = (a, b, t, label) => {
    assert.equal(a.length, b.length);
    a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= t, `${label}[${i}] ${v} != ${b[i]}`));
};
const axisAngle = (axis, angle) => [...scale(axis, Math.sin(angle / 2)), Math.cos(angle / 2)];
function oracle(shapeA, poseA, shapeB, poseB) {
    if (shapeA.kind === 'sphere' && shapeB.kind === 'sphere') {
        const ca = transform(poseA, shapeA.center),
            cb = transform(poseB, shapeB.center),
            d = sub(cb, ca),
            distance = norm(d),
            n = scale(d, 1 / distance);
        return {
            normal: n,
            separation: distance - shapeA.radius - shapeB.radius,
            point: scale(add(add(ca, scale(n, shapeA.radius)), sub(cb, scale(n, shapeB.radius))), 0.5),
        };
    }
    const flip = shapeA.kind === 'sphere',
        ball = flip ? shapeA : shapeB,
        box = flip ? shapeB : shapeA;
    const bp = flip ? poseA : poseB,
        xp = flip ? poseB : poseA,
        center = transform(bp, ball.center);
    const local = inv(xp.slice(3, 7), sub(center, xp.slice(0, 3)));
    // Freeze this suite to an interior +Y finite face. Do not accept an infinite plane oracle.
    assert.ok(
        Math.abs(local[0]) < box.half[0] - 0.1 && Math.abs(local[2]) < box.half[2] - 0.1 && local[1] > box.half[1],
    );
    const face = transform(xp, [local[0], box.half[1], local[2]]),
        delta = sub(center, face),
        distance = norm(delta),
        n = scale(delta, 1 / distance);
    return {
        normal: scale(n, flip ? -1 : 1),
        separation: distance - ball.radius,
        point: scale(add(face, sub(center, scale(n, ball.radius))), 0.5),
    };
}
try {
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
    report.identity = manifest;
    report.fixtureSha256 = sha256(readFileSync(fileURLToPath(import.meta.url)));
    for (const file of manifest.artifacts) assert.equal(sha256(readFileSync(resolve(dir, file.path))), file.sha256);
    const { default: createModule } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
    const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')).href);
    const module = await createModule({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    const api = createBox3DBinding(module, manifest);
    const secondModule = await createModule({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    const other = createBox3DBinding(secondModule, manifest);
    const baseline = api.liveBytes();
    const cases = [];
    const sphereWorld = api.createWorld([0, 0, 0]);
    const qa = axisAngle([0, 0, 1], 0.23),
        qb = axisAngle([1, 0, 0], 0.41);
    const oa = [-0.4, 0.2, 0.15],
        ca = [0.12, 0.17, -0.08],
        cb = [-0.25, 0.12, 0.2];
    const centerA = add(oa, rotate(qa, ca)),
        centerB = add(centerA, [1.08, 0.25, 0.1]);
    const sa = api.createBody(sphereWorld, { type: 0, position: oa, rotation: qa });
    const sb = api.createBody(sphereWorld, {
        position: sub(centerB, rotate(qb, cb)),
        rotation: qb,
        angularVelocity: [0.4, 0.7, -0.3],
        enableSleep: false,
    });
    const ssa = api.createOffsetSphere(sa, ca, 0.7),
        ssb = api.createOffsetSphere(sb, cb, 0.5);
    cases.push({
        name: 'asymmetric-offset-rotating-spheres',
        world: sphereWorld,
        bodies: [sa, sb],
        shapes: new Map([
            [key(ssa), { kind: 'sphere', center: ca, radius: Math.fround(0.7) }],
            [key(ssb), { kind: 'sphere', center: cb, radius: 0.5 }],
        ]),
        ticks: 80,
    });
    const boxQ = axisAngle([0, 0, 1], 0.2),
        boxOrigin = [0.2, -0.3, 0.1];
    const boxWorld = api.createWorld(rotate(boxQ, [0, -10, 0]));
    const box = api.createBody(boxWorld, { type: 0, position: boxOrigin, rotation: boxQ });
    // Finite domain chosen before this attempt: impulse/mass < 0.48 m/s,
    // < 4 m drift over the remaining 8 seconds, inside a 12 m half-face.
    const bs = api.createBox(box, [12, 0.5, 12]);
    const offset = [0.18, -0.12, 0.07],
        ballQ = axisAngle([1, 0, 0], 0.35),
        ballCenter = add(boxOrigin, rotate(boxQ, [0.3, 0.98, -0.2]));
    const ball = api.createBody(boxWorld, {
        position: sub(ballCenter, rotate(ballQ, offset)),
        rotation: ballQ,
        angularVelocity: [0.4, 0.1, 0.3],
    });
    const ballShape = api.createOffsetSphere(ball, offset, 0.5);
    cases.push({
        name: 'finite-rotated-box-face-offset-sphere',
        world: boxWorld,
        bodies: [box, ball],
        shapes: new Map([
            [key(bs), { kind: 'box', half: [12, 0.5, 12] }],
            [key(ballShape), { kind: 'sphere', center: offset, radius: 0.5 }],
        ]),
        ticks: 600,
    });
    let retained, retainedText, retainedToken;
    for (const scene of cases) {
        const boundaries = new Map(),
            revisions = new Set();
        let contactSamples = 0,
            recycled = 0,
            sleeping = 0,
            maxPointError = 0;
        for (let tick = 1; tick <= scene.ticks; tick++) {
            // Explicit secondary motion variant: preserve sleeping/recycle coverage, then
            // wake and move tangentially so this finite-face scene actually regenerates.
            if (scene === cases[1] && tick === 120) api.applyCenterImpulse(ball, rotate(boxQ, [0.25, 0, 0]));
            const poses = api.bodyTransforms(scene.world, scene.bodies);
            boundaries.set(
                tick - 1,
                new Map(scene.bodies.map((body, i) => [key(body), Array.from(poses.slice(i * 10, i * 10 + 10))])),
            );
            api.step(scene.world);
            const snapshot = api.readStepSnapshot(scene.world);
            recycled += snapshot.geometryCounters.recycledContactCount;
            for (const contact of snapshot.contactsOfOwnedBodies) {
                const geometry = api.contactWorldPoints(contact.handle);
                assert.equal(geometry, contact.geometry);
                assert.equal(geometry, api.contactWorldPoints(contact.handle));
                assert.equal(geometry.generatedAfterStep.high, 0);
                assert.equal(geometry.geometryRevision.high, 0);
                assert.ok(geometry.geometryRevision.low > 0);
                revisions.add(geometry.geometryRevision.low);
                const boundary = boundaries.get(geometry.generatedAfterStep.low);
                assert.ok(boundary, 'generation boundary retained independently');
                const pa = boundary.get(key(contact.bodyA)),
                    pb = boundary.get(key(contact.bodyB));
                near(geometry.generationPoseA, pa, 0, 'exact generation A');
                near(geometry.generationPoseB, pb, 0, 'exact generation B');
                report.lastOracleInput = { scene: scene.name, tick, contact, pa, pb };
                const expected = oracle(
                    scene.shapes.get(key(contact.shapeA)),
                    pa,
                    scene.shapes.get(key(contact.shapeB)),
                    pb,
                );
                appendFileSync(
                    samplesPath,
                    JSON.stringify({
                        scene: scene.name,
                        tick,
                        contact,
                        independentPoseA: pa,
                        independentPoseB: pb,
                        shapeA: scene.shapes.get(key(contact.shapeA)),
                        shapeB: scene.shapes.get(key(contact.shapeB)),
                        expected,
                        counters: snapshot.geometryCounters,
                    }) + '\n',
                );
                ++sampleCount;
                for (let m = 0; m < geometry.manifolds.length; m++) {
                    const manifold = geometry.manifolds[m];
                    near(manifold.normalAtoB, expected.normal, report.tolerance.normal, 'independent normal');
                    near(
                        manifold.normalBtoA,
                        scale(expected.normal, -1),
                        report.tolerance.normal,
                        'opposite listener normal',
                    );
                    near(
                        manifold.localNormalAtoB_A,
                        inv(pa.slice(3, 7), expected.normal),
                        report.tolerance.normal,
                        'local normal A',
                    );
                    near(
                        manifold.localNormalAtoB_B,
                        inv(pb.slice(3, 7), expected.normal),
                        report.tolerance.normal,
                        'local normal B',
                    );
                    for (let p = 0; p < manifold.points.length; p++) {
                        const point = manifold.points[p];
                        near(point.worldPointA, expected.point, report.tolerance.point, 'independent world A');
                        near(point.worldPointB, expected.point, report.tolerance.point, 'independent world B');
                        near(
                            point.localPointA,
                            inv(pa.slice(3, 7), sub(expected.point, pa.slice(0, 3))),
                            report.tolerance.point,
                            'independent local A',
                        );
                        near(
                            point.localPointB,
                            inv(pb.slice(3, 7), sub(expected.point, pb.slice(0, 3))),
                            report.tolerance.point,
                            'independent local B',
                        );
                        assert.ok(
                            Math.abs(contact.manifolds[m].points[p].baseSeparation - expected.separation) <=
                                report.tolerance.separation,
                        );
                        maxPointError = Math.max(
                            maxPointError,
                            norm(sub(point.worldPointA, expected.point)),
                            norm(sub(point.worldPointB, expected.point)),
                        );
                    }
                }
                if (!contact.awakeA && !contact.awakeB) sleeping++;
                contactSamples++;
                if (tick === 1 || !contact.awakeB || contactSamples < 4) {
                    if (report.samples.filter((s) => s.scene === scene.name).length < 12)
                        report.samples.push({ scene: scene.name, tick, contact, expected });
                }
                if (scene === cases[1] && tick === 2) {
                    retained = geometry;
                    retainedText = JSON.stringify(retained);
                    retainedToken = contact.handle;
                    const growth = [];
                    for (let i = 0; i < 2; i++) {
                        const old = module.HEAPU8.buffer,
                            before = old.byteLength;
                        const ptr = module._malloc(before + 65536);
                        assert.ok(ptr);
                        assert.notEqual(module.HEAPU8.buffer, old);
                        growth.push({ before, after: module.HEAPU8.byteLength });
                        module._free(ptr);
                        assert.equal(JSON.stringify(retained), retainedText);
                        assert.equal(api.contactWorldPoints(retainedToken), retained);
                    }
                    report.observations.growth = growth;
                    const state = JSON.stringify(snapshot);
                    for (const token of [{ ...retainedToken }, { contactId: [...retainedToken.contactId] }])
                        assert.throws(() => api.contactWorldPoints(token), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
                    assert.throws(() => other.contactWorldPoints(retainedToken), {
                        code: 'AIR_E_BOX3D_STALE_SNAPSHOT',
                    });
                    assert.equal(JSON.stringify(api.readStepSnapshot(scene.world)), state);
                    assert.throws(() => {
                        retained.manifolds[0].points[0].worldPointA[0] = 10;
                    }, TypeError);
                    // Native wrong-world/capacity must preserve the entire caller output.
                    const p = module._malloc(128);
                    module.HEAPU32.set(contact.contactId, p >>> 2);
                    module.HEAPU32.fill(0x12345678, (p + 16) >>> 2, (p + 116) >>> 2);
                    const canary = module.HEAPU32.slice((p + 16) >>> 2, (p + 116) >>> 2);
                    assert.equal(module._air_b3_contact_geometry(sphereWorld.id, p, p + 16, 25), 1);
                    assert.equal(module._air_b3_contact_geometry(scene.world.id, p, p + 16, 24), 4);
                    assert.deepEqual(module.HEAPU32.slice((p + 16) >>> 2, (p + 116) >>> 2), canary);
                    module._free(p);
                }
                if (retained && tick > 2 && scene === cases[1]) {
                    assert.equal(JSON.stringify(retained), retainedText);
                    assert.throws(() => api.contactWorldPoints(retainedToken), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
                }
            }
        }
        assert.ok(contactSamples > 0);
        assert.ok(revisions.size > 1, 'actual regeneration observed');
        if (scene === cases[1]) {
            assert.ok(recycled > 0, 'native recycle branch executed');
            assert.ok(sleeping > 0, 'real sleeping contact retained');
        }
        report.observations[scene.name] = {
            contactSamples,
            recycled,
            sleeping,
            revisions: [...revisions],
            maxPointError,
        };
        pass(scene.name + '-independent-world-local-normal-separation-and-exact-boundary');
    }
    pass('real-heap-growth-copied-geometry-and-foreign-forged-native-capacity-rejection');
    // Destroy and reuse the actual body slot without retargeting old geometry capabilities.
    const last = api.readStepSnapshot(boxWorld),
        oldContact = last.contactsOfOwnedBodies[0],
        oldGeometry = api.contactWorldPoints(oldContact.handle),
        oldText = JSON.stringify(oldGeometry);
    api.destroyBody(ball);
    const reused = api.createBody(boxWorld, { position: ballCenter });
    api.createSphere(reused, 0.5);
    assert.equal(reused.high, ball.high, 'official stored ID high word is index1');
    assert.notEqual(reused.low, ball.low, 'official stored ID low word carries generation');
    assert.throws(() => api.contactWorldPoints(oldContact.handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    api.step(boxWorld);
    assert.equal(JSON.stringify(oldGeometry), oldText);
    pass('actual-body-slot-reuse-does-not-retarget-old-contact-geometry');
    // A real hull/hull contact is explicitly unsupported, not an empty geometry success.
    const unsupported = api.createWorld();
    const uf = api.createBody(unsupported, { type: 0, position: [0, -0.5, 0] });
    api.createBox(uf, [2, 0.5, 2]);
    const ub = api.createBody(unsupported, { position: [0, 0.49, 0] });
    api.createBox(ub, [0.5, 0.5, 0.5]);
    api.step(unsupported);
    const uc = api.readStepSnapshot(unsupported).contactsOfOwnedBodies;
    assert.ok(uc.length > 0);
    for (const c of uc) {
        assert.equal(c.geometry.status, 'UNSUPPORTED_GEOMETRY_FAMILY');
        assert.throws(() => api.contactWorldPoints(c.handle), { code: 'AIR_E_BOX3D_UNSUPPORTED_GEOMETRY' });
    }
    pass('real-unsupported-hull-hull-contact-fails-closed');
    for (const w of [sphereWorld, boxWorld, unsupported]) api.destroyWorld(w);
    assert.equal(JSON.stringify(oldGeometry), oldText);
    assert.throws(() => api.contactWorldPoints(oldContact.handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    assert.equal(JSON.stringify(retained), retainedText);
    assert.equal(api.liveBytes(), baseline);
    api.dispose();
    other.dispose();
    pass('destroyed-world-copies-unchanged-core-live-bytes-baseline');
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.samplesArtifact = {
        path: 'geometry-samples.raw.jsonl',
        records: sampleCount,
        bytes: readFileSync(samplesPath).length,
        sha256: sha256(readFileSync(samplesPath)),
    };
    report.completedAt = new Date().toISOString();
    save();
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, error: report.error, raw }));
}
