/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
import test from 'node:test';
import { identity, samples, transform, rayOracle } from './geometry.mjs';
test('independent scalar ray oracle separates four source faces and the concave gap', () => {
    for (const [flatFace, p] of samples.entries()) {
        const hits = rayOracle([p[0], 2, p[2]], [0, -1, 0]);
        assert.equal(hits.length, 1);
        assert.equal(hits[0].distance, 2);
        assert.deepEqual(hits[0].point, p);
        assert.deepEqual(hits[0].normal, [0, 1, 0]);
        assert.deepEqual(hits[0].meshFace, { submesh: Math.floor(flatFace / 2), primitive: flatFace % 2, flatFace });
    }
    assert.deepEqual(rayOracle([0, 2, 0], [0, -1, 0]), []);
});
test('scale, local center, mirrored winding, and yaw have independently known world positions', () => {
    const scaled = { ...identity, position: [40, 0, 0], scale: [2, 1, 3], center: [0.25, 0.5, 0] };
    const mirrored = { ...identity, position: [60, 0, 0], scale: [-1, 1, 1], center: [0.2, 0, 0] };
    const turned = { ...identity, position: [80, 0, 0], yaw: 90 };
    for (const [spec, expected] of [
        [scaled, [37.1, 0.5, 2.1]],
        [mirrored, [61.5, 0, 0.7]],
        [turned, [80.7, 0, 1.7]],
    ]) {
        const p = transform(samples[0], spec);
        assert(Math.hypot(...p.map((v, i) => v - expected[i])) < 1e-12);
        const hits = rayOracle([p[0], 2, p[2]], [0, -1, 0], spec);
        assert.equal(hits.length, 1);
        assert(Math.abs(hits[0].distance - (2 - expected[1])) < 1e-12);
        assert(Math.hypot(...hits[0].normal.map((v, i) => v - [0, 1, 0][i])) < 1e-12);
    }
});
