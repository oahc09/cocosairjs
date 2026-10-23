/** Exact centered tetrahedron used by both rendered Mesh and convex MeshCollider. */
const r = 0.72;
export const HULL_VERTICES: readonly (readonly number[])[] = Object.freeze([
    Object.freeze([r, r, r]),
    Object.freeze([-r, -r, r]),
    Object.freeze([-r, r, -r]),
    Object.freeze([r, -r, -r]),
]);

/** Flat outward normals, explicit triangles. Native Hull consumes all actual POSITION values. */
export function hullMeshGeometry() {
    const positions: number[] = [],
        normals: number[] = [],
        indices: number[] = [];
    for (const face of [
        [0, 1, 2],
        [0, 3, 1],
        [0, 2, 3],
        [1, 3, 2],
    ]) {
        let [a, b, c] = face.map((index) => HULL_VERTICES[index]);
        const cross = (u: readonly number[], v: readonly number[]) => [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
        ];
        let normal = cross(
            b.map((v, i) => v - a[i]),
            c.map((v, i) => v - a[i]),
        );
        if (normal.reduce((sum, v, i) => sum + v * a[i], 0) < 0) {
            [b, c] = [c, b];
            normal = normal.map((v) => -v);
        }
        const length = Math.hypot(...normal);
        normal = normal.map((v) => v / length);
        for (const vertex of [a, b, c]) {
            indices.push(indices.length);
            positions.push(...vertex);
            normals.push(...normal);
        }
    }
    return { positions, normals, indices };
}

/** Minimum actual transformed source vertex height, not a native penetration/contact query. */
export function hullMinimumOffsetY(q: Readonly<{ x: number; y: number; z: number; w: number }>): number {
    const row = [2 * (q.x * q.y + q.z * q.w), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z - q.x * q.w)];
    return Math.min(...HULL_VERTICES.map((p) => p[0] * row[0] + p[1] * row[1] + p[2] * row[2]));
}
