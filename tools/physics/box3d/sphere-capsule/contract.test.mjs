/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Pure arithmetic/source controls. Synthetic samples are NOT actual native geometry evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { CASES, CHECKS, sphereCapsuleOracle, verifySphereCapsuleSample } from './oracle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const identity = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const capsule = { kind: 'capsule', center: [0, 0, 0], radius: 0.5, halfSegment: 1, direction: 1 };
const sphere = { kind: 'sphere', center: [0, 0, 0], radius: 0.25 };
const spherePose = (p) => [...p, 0, 0, 0, 1, ...p];

test('independent side projection has exact midpoint, opposite normal and separation', () => {
    const o = sphereCapsuleOracle(capsule, identity, sphere, spherePose([0.7, 0.2, 0]));
    assert.ok(Math.abs(o.closestParameter - 0.6) < 1e-15);
    assert.ok(Math.abs(o.point[0] - 0.475) < 1e-15);
    assert.ok(Math.abs(o.point[1] - 0.2) < 1e-15);
    assert.ok(Math.abs(o.separation + 0.05) < 1e-15);
    assert.ok(Math.abs(o.normal[0] - 1) < 1e-15);
    const reversed = sphereCapsuleOracle(sphere, spherePose([0.7, 0.2, 0]), capsule, identity);
    assert.deepEqual(reversed.point, o.point);
    assert.deepEqual(
        reversed.normal,
        o.normal.map((v) => -v),
    );
    assert.deepEqual(reversed.localPointA, o.localPointB);
});
for (const sign of [-1, 1])
    test(`independent ${sign} endpoint clamps to finite segment, not infinite cylinder`, () => {
        const o = sphereCapsuleOracle(capsule, identity, sphere, spherePose([0, sign * 1.7, 0]));
        assert.equal(o.closestParameter, sign < 0 ? 0 : 1);
        assert.ok(Math.abs(o.point[1] - sign * 1.475) < 1e-15);
        assert.ok(Math.abs(o.separation + 0.05) < 1e-15);
    });
test('large offset uses native float32 endpoints rather than an ideal symmetric segment', () => {
    const cap = { ...capsule, center: [2 ** 24, 0, 0], direction: 0 };
    const o = sphereCapsuleOracle(cap, identity, sphere, spherePose([2 ** 24 + 0.7, 0, 0]));
    assert.equal(o.closestParameter, 1);
    assert.ok(Math.abs(o.separation + 0.05) < 1e-8);
});
for (const bad of [
    { ...capsule, direction: 3 },
    { ...capsule, halfSegment: 0 },
    { ...capsule, radius: NaN },
    { ...capsule, kind: 'mesh' },
])
    test('oracle explicitly rejects nonqualified shape: ' + JSON.stringify(bad), () => {
        assert.throws(() => sphereCapsuleOracle(bad, identity, sphere, spherePose([0.7, 0, 0])));
    });
test('coincident center/segment normal is not falsely advertised as a unique analytic oracle', () => {
    assert.throws(() => sphereCapsuleOracle(capsule, identity, sphere, identity), /unique finite normal/);
});

function syntheticSample(fixture) {
    const cap = { ...capsule, direction: fixture.axis },
        p = [0, 0, 0];
    if (fixture.region === 'side') {
        p[fixture.axis] = 0.2;
        p[(fixture.axis + 1) % 3] = 0.7;
    } else p[fixture.axis] = fixture.region === 'cap-minus' ? -1.7 : 1.7;
    const sp = spherePose(p),
        o = sphereCapsuleOracle(cap, identity, sphere, sp);
    const c = {
        contactId: [1, 2, 3],
        shapeA: { low: 1, high: 2 },
        shapeB: { low: 3, high: 4 },
        bodyA: { low: 5, high: 6 },
        bodyB: { low: 7, high: 8 },
        manifolds: [{ points: [{ baseSeparation: o.separation }] }],
    };
    c.geometry = {
        status: 'AVAILABLE',
        source: 'CACHED_MANIFOLD_GENERATION',
        contactId: [...c.contactId],
        shapeA: { ...c.shapeA },
        shapeB: { ...c.shapeB },
        bodyA: { ...c.bodyA },
        bodyB: { ...c.bodyB },
        geometryRevision: { low: 1, high: 0 },
        generatedAfterStep: { low: 0, high: 0 },
        readStepIndex: 1,
        readMutationRevision: 4,
        generationPoseA: [...identity],
        generationPoseB: [...sp],
        manifolds: [
            {
                normalAtoB: o.normal,
                normalBtoA: o.normal.map((v) => -v),
                localNormalAtoB_A: o.localNormalA,
                localNormalAtoB_B: o.localNormalB,
                points: [
                    {
                        worldPointA: o.point,
                        worldPointB: o.point,
                        localPointA: o.localPointA,
                        localPointB: o.localPointB,
                    },
                ],
            },
        ],
    };
    return {
        ...fixture,
        contact: c,
        independentPoseA: [...identity],
        independentPoseB: sp,
        shapeA: cap,
        shapeB: sphere,
    };
}
test('all 18 finite synthetic cases verify; this exercises the auditor, not native execution', () => {
    assert.equal(CASES.length, 18);
    assert.equal(new Set(CASES.map((c) => c.caseId)).size, 18);
    for (const c of CASES) verifySphereCapsuleSample(syntheticSample(c));
});
for (const [name, change] of [
    [
        'unsupported',
        (r) => {
            r.contact.geometry.status = 'UNSUPPORTED_GEOMETRY_FAMILY';
        },
    ],
    [
        'no basis',
        (r) => {
            r.contact.geometry.status = 'GEOMETRY_UNAVAILABLE';
        },
    ],
    [
        'old contact generation',
        (r) => {
            r.contact.geometry.contactId[2]++;
        },
    ],
    [
        'wrong shape generation',
        (r) => {
            r.contact.geometry.shapeA.low++;
        },
    ],
    [
        'wrong body',
        (r) => {
            r.contact.geometry.bodyB.high++;
        },
    ],
    [
        'old read step',
        (r) => {
            r.contact.geometry.readStepIndex = 0;
        },
    ],
    [
        'wrong generation boundary',
        (r) => {
            r.contact.geometry.generatedAfterStep.low = 1;
        },
    ],
    [
        'post-solve pose substituted',
        (r) => {
            r.contact.geometry.generationPoseB[0] += 0.01;
        },
    ],
    [
        'flipped normal',
        (r) => {
            r.contact.geometry.manifolds[0].normalAtoB = r.contact.geometry.manifolds[0].normalAtoB.map((v) => -v);
        },
    ],
    [
        'world-point drift',
        (r) => {
            r.contact.geometry.manifolds[0].points[0].worldPointA = [9, 9, 9];
        },
    ],
    [
        'missing manifold',
        (r) => {
            r.contact.geometry.manifolds = [];
        },
    ],
    [
        'wrong finite feature',
        (r) => {
            r.region = 'cap-plus';
        },
    ],
])
    test('synthetic negative control: ' + name, () => {
        const row = syntheticSample(CASES.find((c) => c.axis === 1 && c.region === 'side'));
        change(row);
        assert.throws(() => verifySphereCapsuleSample(row));
    });
test('source identity changes with added family while wire and unrelated exclusions remain fixed', () => {
    const text = read('tools/physics/box3d/abi-schema.json'),
        schema = JSON.parse(text),
        g = schema.contactGeometry;
    assert.equal(g.wireWords, 25);
    assert.deepEqual(g.admittedFamilies, [
        'sphere-sphere',
        'sphere-hull',
        'hull-hull',
        'capsule-hull',
        'capsule-capsule',
        'sphere-capsule',
    ]);
    for (const family of ['mesh', 'baked compound', 'heightfield']) assert.ok(g.unqualifiedFamilies.includes(family));
    const sha = createHash('sha256').update(text).digest('hex');
    assert.equal(JSON.parse(read('tools/physics/box3d/versions.lock.json')).apiSchemaSha256, sha);
    assert.ok(read('src/air/physics/box3d/binding/facade.mjs').includes(`const SCHEMA_SHA256 = '${sha}';`));
    assert.notEqual(sha, 'f5df4fae8476651b11ae3a952cb418ee987767ae1cfad0f5bb3c8f8e071bae28');
});
test('native path retains cached basis and no-write refusals, not fabricated points', () => {
    const native = read('tools/physics/box3d/native/geometry.c');
    assert.ok(native.includes('b == b3_hullShape || b == b3_capsuleShape'));
    assert.ok(native.includes('a == b3_hullShape || a == b3_capsuleShape'));
    assert.ok(native.includes('if (!b3Contact_GetGeometryBasis(id, &basis)) return AIR_B3_GEOMETRY_UNAVAILABLE;'));
    assert.ok(native.indexOf('if (capacity < 25)') < native.indexOf('memcpy(out, result'));
    const fixture = read('tools/physics/box3d/wasm-geometry-contract.mjs');
    assert.ok(fixture.includes('real-unsupported-mesh-sphere-contact-fails-closed'));
    assert.ok(fixture.includes('api.cookStaticMesh(unsupported'));
    assert.ok(fixture.includes("assert.equal(c.geometry.status, 'UNSUPPORTED_GEOMETRY_FAMILY')"));
    assert.equal(CHECKS.length, 8);
});
