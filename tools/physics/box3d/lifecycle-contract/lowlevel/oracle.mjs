// Independent CPU oracle only. No engine/cooker import; no native qualification credit.
export const TOLERANCE = 0.01;
export const heights = Object.freeze([0, 1, 4, 2, 5, 3, 6, 4, 8]);
export const baseSpec = Object.freeze({ scale: [2, 1, 3], center: [0, 0, 0], position: [0, 0, 0], yaw: 0 });
export const samples = Object.freeze([
    [0.5, 0.75, 0.75, 0],
    [1.5, 2.25, 3.25, 1],
    [2.5, 0.75, 2.75, 2],
    [3.5, 2.25, 3.75, 3],
    [0.5, 3.75, 3.75, 4],
    [3.5, 5.25, 5.75, 7],
]); // columns: scaled x,z, unscaled y, face
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const mul = (a, s) => a.map((v) => v * s);
export const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => mul(a, 1 / Math.hypot(...a));
export function transform(p, s = baseSpec) {
    const q = p.map((v, i) => (v + s.center[i]) * s.scale[i]),
        a = (s.yaw * Math.PI) / 180;
    return add([Math.cos(a) * q[0] + Math.sin(a) * q[2], q[1], -Math.sin(a) * q[0] + Math.cos(a) * q[2]], s.position);
}
export function geometry(s = baseSpec, h = heights) {
    const positions = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) positions.push(transform([i, h[j * 3 + i], j], s));
    const indices = [];
    for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
            const a = j * 3 + i;
            indices.push([a, a + 3, a + 1], [a + 4, a + 1, a + 3]);
        }
    return { positions, indices };
}
export function rayOracle(origin, direction, L, s = baseSpec, h = heights, backfaces = false) {
    const { positions, indices } = geometry(s, h),
        hits = [];
    indices.forEach((ids, face) => {
        const [a, b, c] = ids.map((i) => positions[i]),
            e1 = sub(b, a),
            e2 = sub(c, a),
            p = cross(direction, e2),
            det = dot(e1, p);
        if (backfaces ? Math.abs(det) < 1e-12 : det <= 1e-12) return;
        const tvec = sub(origin, a),
            u = dot(tvec, p) / det,
            q = cross(tvec, e1),
            v = dot(direction, q) / det,
            t = dot(e2, q) / det;
        if (u >= -1e-12 && v >= -1e-12 && u + v <= 1 + 1e-12 && t >= 0 && t < L)
            hits.push({ distance: t, point: add(origin, mul(direction, t)), normal: norm(cross(e1, e2)), face });
    });
    return hits.sort((a, b) => a.distance - b.distance);
}
// Region-based nearest point (independent triangle distance; no native collision result used).
export function triangleDistance(p, a, b, c) {
    const ab = sub(b, a),
        ac = sub(c, a),
        ap = sub(p, a),
        d1 = dot(ab, ap),
        d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return Math.hypot(...ap);
    const bp = sub(p, b),
        d3 = dot(ab, bp),
        d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return Math.hypot(...bp);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return Math.hypot(...sub(p, add(a, mul(ab, d1 / (d1 - d3)))));
    const cp = sub(p, c),
        d5 = dot(ab, cp),
        d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return Math.hypot(...cp);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return Math.hypot(...sub(p, add(a, mul(ac, d2 / (d2 - d6)))));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
        return Math.hypot(...sub(p, add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))))));
    return Math.abs(dot(ap, norm(cross(ab, ac))));
}
export function surfaceDistance(p, s = baseSpec, h = heights) {
    const g = geometry(s, h);
    return Math.min(...g.indices.map((ids) => triangleDistance(p, ...ids.map((i) => g.positions[i]))));
}
export function source(h = heights) {
    return { tileSize: 1, getVertexCountI: () => 3, getVertexCountJ: () => 3, getHeight: (i, j) => h[j * 3 + i] };
}
