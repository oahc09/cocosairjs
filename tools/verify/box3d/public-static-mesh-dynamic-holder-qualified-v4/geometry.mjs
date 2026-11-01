/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Independently authored geometry and scalar ray oracle. No production source imports.
export const parts = [
    [
        [-2, 0, -1],
        [-2, 0, 1],
        [-0.5, 0, 1],
        [-2, 0, -1],
        [-0.5, 0, 1],
        [-0.5, 0, -1],
    ],
    [
        [0.5, 0, -1],
        [0.5, 0, 1],
        [2, 0, 1],
        [0.5, 0, -1],
        [2, 0, 1],
        [2, 0, -1],
    ],
];
// Interior points, one for each source triangle. None lies on a shared edge.
export const samples = [
    [-1.7, 0, 0.7],
    [-0.8, 0, -0.7],
    [0.8, 0, 0.7],
    [1.7, 0, -0.7],
];
export const identity = { position: [0, 0, 0], scale: [1, 1, 1], center: [0, 0, 0], yaw: 0, meshY: 0 };
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function transform(point, spec = identity) {
    const p = point.map(
        (value, axis) => (value + (axis === 1 ? spec.meshY : 0) + spec.center[axis]) * spec.scale[axis],
    );
    const angle = (spec.yaw * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
    return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]].map((v, i) => v + spec.position[i]);
}
export function rayOracle(origin, direction, spec = identity, maxDistance = 5) {
    const hits = [];
    for (let submesh = 0; submesh < parts.length; submesh++) {
        for (let primitive = 0; primitive < 2; primitive++) {
            const [a, b, c] = parts[submesh].slice(primitive * 3, primitive * 3 + 3).map((p) => transform(p, spec));
            const e1 = sub(b, a),
                e2 = sub(c, a),
                p = cross(direction, e2),
                determinant = dot(e1, p);
            if (Math.abs(determinant) < 1e-12) continue;
            const t = sub(origin, a),
                u = dot(t, p) / determinant,
                q = cross(t, e1);
            const v = dot(direction, q) / determinant,
                distance = dot(e2, q) / determinant;
            if (u < 0 || v < 0 || u + v > 1 || distance < 0 || distance > maxDistance) continue;
            let normal = cross(e1, e2);
            // Negative node-scale parity must preserve authored CCW front-face orientation.
            if (spec.scale.filter((value) => value < 0).length % 2) normal = normal.map((value) => -value);
            const length = Math.hypot(...normal);
            hits.push({
                distance,
                point: origin.map((value, axis) => value + direction[axis] * distance),
                normal: normal.map((value) => value / length),
                meshFace: { submesh, primitive, flatFace: submesh * 2 + primitive },
            });
        }
    }
    return hits.sort((a, b) => a.distance - b.distance);
}
export function sourceMesh(sdk, y = 0, malformed = false) {
    const { Mesh, gfx } = sdk;
    const values = Float32Array.from(
        parts.flat().flatMap((point) => point.map((value, axis) => value + (axis === 1 ? y : 0))),
    );
    const mesh = new Mesh();
    mesh.reset({
        struct: {
            vertexBundles: parts.map((_, i) => ({
                view: { offset: i * 72, length: 72, count: 6, stride: 12 },
                attributes: [new gfx.Attribute(gfx.AttributeName.ATTR_POSITION, gfx.Format.RGB32F)],
            })),
            primitives: parts.map((_, i) => ({
                primitiveMode: malformed && i === 1 ? gfx.PrimitiveMode.LINE_LIST : gfx.PrimitiveMode.TRIANGLE_LIST,
                vertexBundelIndices: [i],
            })),
        },
        data: new Uint8Array(values.buffer),
    });
    return mesh;
}
export function rejectedMesh(sdk, kind) {
    const { Mesh, gfx } = sdk,
        duplicate = kind === 'duplicate-oriented-triangle';
    const bytes = new Uint8Array(duplicate ? 48 : 36);
    new Float32Array(bytes.buffer, 0, 9).set(
        duplicate ? [-2, 0, -1, -2, 0, 1, -0.5, 0, 1] : [0, 0, 0, 0, 0, 0.0001, 0.0001, 0, 0],
    );
    if (duplicate) new Uint16Array(bytes.buffer, 36, 6).set([0, 1, 2, 0, 1, 2]);
    const mesh = new Mesh();
    mesh.reset({
        struct: {
            vertexBundles: [
                {
                    view: { offset: 0, length: 36, count: 3, stride: 12 },
                    attributes: [new gfx.Attribute(gfx.AttributeName.ATTR_POSITION, gfx.Format.RGB32F)],
                },
            ],
            primitives: [
                {
                    primitiveMode: gfx.PrimitiveMode.TRIANGLE_LIST,
                    vertexBundelIndices: [0],
                    ...(duplicate ? { indexView: { offset: 36, length: 12, count: 6, stride: 2 } } : {}),
                },
            ],
        },
        data: bytes,
    });
    return mesh;
}
