import assert from 'node:assert/strict';
import test from 'node:test';
import { samples, baseSpec, transform, rayOracle, triangleDistance } from './oracle.mjs';
test('six hand-calculated non-bilinear heights / b-c diagonal / unequal XZ spacing', () => {
    for (const [x, z, y, face] of samples) {
        const [r] = rayOracle([x, 20, z], [0, -1, 0], 30);
        assert.equal(r.face, face);
        assert.ok(Math.abs(r.point[1] - y) < 1e-12);
    }
});
test('nonzero center, positive nonuniform scale, translation and rotation', () => {
    const spec = { ...baseSpec, center: [0.25, 0.5, -0.75], position: [20, 3, -9], yaw: 37, scale: [2, 1.5, 3] };
    for (const [x, z, y, face] of samples) {
        const p = transform([x / 2, y, z / 3], spec),
            [r] = rayOracle([p[0], p[1] + 10, p[2]], [0, -1, 0], 20, spec);
        assert.equal(r.face, face);
        assert.ok(Math.hypot(...r.point.map((n, i) => n - p[i])) < 1e-12);
    }
});
test('[0,L), backface and independent point-triangle distance', () => {
    const p = [0.5, 0.75, 0.75];
    assert.equal(rayOracle([p[0], p[1] + 2, p[2]], [0, -1, 0], 2).length, 0);
    assert.equal(rayOracle(p, [0, -1, 0], 2).length, 1);
    assert.equal(rayOracle([p[0], p[1] - 2, p[2]], [0, 1, 0], 3).length, 0);
    assert.equal(rayOracle([p[0], p[1] - 2, p[2]], [0, 1, 0], 3, baseSpec, undefined, true).length, 1);
    assert.equal(triangleDistance([0.2, 2, 0.2], [0, 0, 0], [0, 0, 1], [1, 0, 0]), 2);
    assert.equal(triangleDistance([0, 0, -1], [0, 0, 0], [0, 0, 1], [1, 0, 0]), 1);
});
