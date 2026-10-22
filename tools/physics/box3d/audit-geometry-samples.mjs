// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Offline analytic audit from retained inputs, using explicit rotation matrices rather than fixture helpers.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]),
    out = resolve(dir, 'geometry-samples-audit.raw.json');
assert.ok(!existsSync(out));
const report = {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    records: 0,
    points: 0,
    maxPointError: 0,
    maxNormalError: 0,
    maxSeparationError: 0,
    branches: { generated: 0, recycled: 0, sleeping: 0 },
};
const vadd = (a, b) => a.map((v, i) => v + b[i]),
    vsub = (a, b) => a.map((v, i) => v - b[i]),
    times = (v, s) => v.map((x) => x * s);
const matrix = (q) => {
    const [x, y, z, w] = q;
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
};
const mv = (m, v) => m.map((row) => row.reduce((s, a, i) => s + a * v[i], 0));
const mtv = (m, v) => v.map((_, i) => m.reduce((s, row, k) => s + row[i] * v[k], 0));
const world = (p, local) => vadd(p.slice(0, 3), mv(matrix(p.slice(3, 7)), local));
const local = (p, point) => mtv(matrix(p.slice(3, 7)), vsub(point, p.slice(0, 3)));
const error = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
try {
    const contract = JSON.parse(readFileSync(resolve(dir, 'wasm-geometry-contract.raw.json')));
    assert.equal(contract.status, 'PASS');
    const bytes = readFileSync(resolve(dir, contract.samplesArtifact.path));
    assert.equal(sha256(bytes), contract.samplesArtifact.sha256);
    const rows = bytes
        .toString()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
    assert.equal(rows.length, contract.samplesArtifact.records);
    for (const row of rows) {
        const { contact, independentPoseA: pa, independentPoseB: pb, shapeA: a, shapeB: b } = row,
            g = contact.geometry;
        assert.deepEqual(g.generationPoseA, pa);
        assert.deepEqual(g.generationPoseB, pb);
        assert.equal(g.source, 'CACHED_MANIFOLD_GENERATION');
        let normal, point, separation;
        if (a.kind === 'sphere' && b.kind === 'sphere') {
            const ca = world(pa, a.center),
                cb = world(pb, b.center),
                d = vsub(cb, ca),
                length = Math.hypot(...d);
            normal = times(d, 1 / length);
            point = times(vadd(vadd(ca, times(normal, a.radius)), vsub(cb, times(normal, b.radius))), 0.5);
            separation = length - a.radius - b.radius;
        } else {
            const flip = a.kind === 'sphere',
                sphere = flip ? a : b,
                box = flip ? b : a,
                sp = flip ? pa : pb,
                bp = flip ? pb : pa;
            assert.equal(box.kind, 'box');
            const center = world(sp, sphere.center),
                q = local(bp, center);
            assert.ok(Math.abs(q[0]) < box.half[0] - 0.1 && Math.abs(q[2]) < box.half[2] - 0.1 && q[1] > box.half[1]);
            const face = world(bp, [q[0], box.half[1], q[2]]),
                delta = vsub(center, face),
                length = Math.hypot(...delta),
                outward = times(delta, 1 / length);
            point = times(vadd(face, vsub(center, times(outward, sphere.radius))), 0.5);
            normal = times(outward, flip ? -1 : 1);
            separation = length - sphere.radius;
        }
        assert.ok(error(point, row.expected.point) < 1e-12);
        assert.ok(error(normal, row.expected.normal) < 1e-12);
        assert.ok(Math.abs(separation - row.expected.separation) < 1e-12);
        for (let m = 0; m < g.manifolds.length; m++) {
            const manifold = g.manifolds[m];
            const ne = Math.max(
                error(normal, manifold.normalAtoB),
                error(times(normal, -1), manifold.normalBtoA),
                error(mtv(matrix(pa.slice(3, 7)), normal), manifold.localNormalAtoB_A),
                error(mtv(matrix(pb.slice(3, 7)), normal), manifold.localNormalAtoB_B),
            );
            assert.ok(ne <= contract.tolerance.normal);
            report.maxNormalError = Math.max(report.maxNormalError, ne);
            for (let p = 0; p < manifold.points.length; p++) {
                const observed = manifold.points[p],
                    pe = Math.max(
                        error(point, observed.worldPointA),
                        error(point, observed.worldPointB),
                        error(local(pa, point), observed.localPointA),
                        error(local(pb, point), observed.localPointB),
                    );
                const se = Math.abs(contact.manifolds[m].points[p].baseSeparation - separation);
                assert.ok(pe <= contract.tolerance.point);
                assert.ok(se <= contract.tolerance.separation);
                report.maxPointError = Math.max(report.maxPointError, pe);
                report.maxSeparationError = Math.max(report.maxSeparationError, se);
                report.points++;
            }
        }
        if (g.generatedAfterStep.low === row.tick - 1) report.branches.generated++;
        if (row.counters.recycledContactCount > 0) report.branches.recycled++;
        if (!contact.awakeA && !contact.awakeB) report.branches.sleeping++;
        report.records++;
    }
    assert.ok(Object.values(report.branches).every((v) => v > 0));
    report.inputs = {
        sampleSha256: sha256(bytes),
        contractSha256: sha256(readFileSync(resolve(dir, 'wasm-geometry-contract.raw.json'))),
        scriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    };
    report.identity = contract.identity;
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(
        JSON.stringify({
            status: report.status,
            records: report.records,
            maxPointError: report.maxPointError,
            error: report.error,
        }),
    );
}
