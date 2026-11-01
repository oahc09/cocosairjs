/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Independent double-precision segment projection, not a Box3D distance/manifold call.
// This finite oracle excludes the nonunique normal at coincident sphere/segment centers.
import assert from 'node:assert/strict';

export const TOLERANCE = Object.freeze({ point: 0.00002, normal: 0.00002, separation: 0.00002, basis: 0 });
export const CHECKS = Object.freeze([
    'eighteenSideAndEndpointCases',
    'sameGenerationFullIdentityAndExactRetainedPoses',
    'bothCreationOrdersAllAxesAndOppositeNormals',
    'readOnlyRepeatedGeometryAndDeepFreeze',
    'realHeapGrowthPreservesCopiedGeometry',
    'stepMutationDestroyInvalidateOldCapabilities',
    'nativeForeignInvalidShortBufferNoPartialWrite',
    'sameModuleCoreAndNativeGlobalBridgeReturnToBaseline',
]);
export const CASES = Object.freeze(
    [0, 1, 2].flatMap((axis) =>
        ['side', 'cap-minus', 'cap-plus'].flatMap((region) =>
            [0, 1].map((creationOrder) =>
                Object.freeze({ axis, region, creationOrder, caseId: `${axis}/${region}/${creationOrder}` }),
            ),
        ),
    ),
);
const vector = (v, n, label) => {
    assert.ok(Array.isArray(v) && v.length === n && v.every(Number.isFinite), label);
    return v;
};
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const near = (a, b, tolerance, label) => {
    vector(a, b.length, label);
    a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tolerance, `${label}[${i}]: ${v} != ${b[i]}`));
};
// Explicit matrix, separate from the quaternion cross-product implementation in the facade.
function matrix(pose) {
    vector(pose, 10, 'retained pose');
    const [x, y, z, w] = pose.slice(3, 7);
    assert.ok(Math.abs(x * x + y * y + z * z + w * w - 1) < 1e-5, 'unit rotation');
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
}
export const rotate = (pose, v) => matrix(pose).map((row) => dot(row, v));
const inverse = (pose, v) => {
    const m = matrix(pose);
    return [0, 1, 2].map((column) =>
        dot(
            m.map((row) => row[column]),
            v,
        ),
    );
};
export const transform = (pose, v) => add(pose.slice(0, 3), rotate(pose, v));

export function sphereCapsuleOracle(shapeA, poseA, shapeB, poseB) {
    const flip = shapeA.kind === 'sphere';
    const sphere = flip ? shapeA : shapeB,
        capsule = flip ? shapeB : shapeA;
    const sp = flip ? poseA : poseB,
        cp = flip ? poseB : poseA;
    assert.equal(sphere.kind, 'sphere');
    assert.equal(capsule.kind, 'capsule');
    vector(sphere.center, 3, 'sphere center');
    vector(capsule.center, 3, 'capsule center');
    assert.ok(sphere.radius > 0 && Number.isFinite(sphere.radius));
    assert.ok(capsule.radius > 0 && Number.isFinite(capsule.radius));
    assert.ok(capsule.halfSegment > 0 && Number.isFinite(capsule.halfSegment));
    assert.ok([0, 1, 2].includes(capsule.direction));
    // The bridge stores float32 endpoints, not an idealized unrounded center/segment.
    const endpoints = [-1, 1].map((sign) =>
        capsule.center.map((v, i) =>
            Math.fround(Math.fround(v) + (i === capsule.direction ? sign * Math.fround(capsule.halfSegment) : 0)),
        ),
    );
    const [p, q] = endpoints.map((endpoint) => transform(cp, endpoint));
    const center = transform(sp, sphere.center.map(Math.fround));
    const axis = sub(q, p),
        length2 = dot(axis, axis);
    assert.ok(length2 > 0, 'nondegenerate qualified segment');
    const t = Math.max(0, Math.min(1, dot(sub(center, p), axis) / length2));
    const closest = add(p, scale(axis, t)),
        delta = sub(center, closest),
        distance = Math.hypot(...delta);
    assert.ok(distance > 1e-8, 'unique finite normal required by this oracle');
    const capsuleToSphere = scale(delta, 1 / distance);
    const point = scale(
        add(
            add(closest, scale(capsuleToSphere, Math.fround(capsule.radius))),
            sub(center, scale(capsuleToSphere, Math.fround(sphere.radius))),
        ),
        0.5,
    );
    const normal = scale(capsuleToSphere, flip ? -1 : 1);
    return {
        point,
        normal,
        separation: distance - Math.fround(capsule.radius) - Math.fround(sphere.radius),
        closestParameter: t,
        localPointA: inverse(poseA, sub(point, poseA.slice(0, 3))),
        localPointB: inverse(poseB, sub(point, poseB.slice(0, 3))),
        localNormalA: inverse(poseA, normal),
        localNormalB: inverse(poseB, normal),
    };
}

export function verifySphereCapsuleSample(row) {
    const expectedCase = CASES.find((c) => c.caseId === row.caseId);
    assert.ok(expectedCase, 'known exact case');
    for (const key of ['axis', 'region', 'creationOrder']) assert.equal(row[key], expectedCase[key]);
    const c = row.contact,
        g = c.geometry;
    assert.equal(g.status, 'AVAILABLE');
    assert.equal(g.source, 'CACHED_MANIFOLD_GENERATION');
    assert.deepEqual(g.contactId, c.contactId);
    for (const key of ['shapeA', 'shapeB', 'bodyA', 'bodyB']) assert.deepEqual(g[key], c[key], key);
    assert.deepEqual(g.geometryRevision, { low: 1, high: 0 });
    assert.deepEqual(g.generatedAfterStep, { low: 0, high: 0 });
    assert.equal(g.readStepIndex, 1);
    assert.ok(Number.isSafeInteger(g.readMutationRevision) && g.readMutationRevision >= 0);
    near(g.generationPoseA, row.independentPoseA, 0, 'exact retained generation A');
    near(g.generationPoseB, row.independentPoseB, 0, 'exact retained generation B');
    const cap = row.shapeA.kind === 'capsule' ? row.shapeA : row.shapeB;
    assert.equal(cap.direction, row.axis);
    const expected = sphereCapsuleOracle(row.shapeA, row.independentPoseA, row.shapeB, row.independentPoseB);
    if (row.region === 'side') assert.ok(expected.closestParameter > 0.1 && expected.closestParameter < 0.9);
    else assert.equal(expected.closestParameter, row.region === 'cap-minus' ? 0 : 1);
    assert.equal(g.manifolds.length, 1);
    assert.equal(c.manifolds.length, 1);
    const m = g.manifolds[0];
    assert.equal(m.points.length, 1);
    assert.equal(c.manifolds[0].points.length, 1);
    near(m.normalAtoB, expected.normal, TOLERANCE.normal, 'world normal A to B');
    near(m.normalBtoA, scale(expected.normal, -1), TOLERANCE.normal, 'world normal B to A');
    near(m.localNormalAtoB_A, expected.localNormalA, TOLERANCE.normal, 'local normal A');
    near(m.localNormalAtoB_B, expected.localNormalB, TOLERANCE.normal, 'local normal B');
    near(m.points[0].worldPointA, expected.point, TOLERANCE.point, 'world A');
    near(m.points[0].worldPointB, expected.point, TOLERANCE.point, 'world B');
    near(m.points[0].localPointA, expected.localPointA, TOLERANCE.point, 'local A');
    near(m.points[0].localPointB, expected.localPointB, TOLERANCE.point, 'local B');
    near(
        [c.manifolds[0].points[0].baseSeparation],
        [expected.separation],
        TOLERANCE.separation,
        'generation separation',
    );
    return expected;
}
