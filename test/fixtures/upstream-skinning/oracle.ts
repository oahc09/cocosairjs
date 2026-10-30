/** Independent scalar reference: no engine matrix, AABB, skinning cache, or shader helpers. */
export type Point = [number, number, number];
export interface LocalNode {
    position: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    parent: LocalNode | null;
}

export function localToWorld(point: Point, node: LocalNode | null): Point {
    let [x, y, z] = point;
    for (let current = node; current; current = current.parent) {
        x *= current.scale.x;
        y *= current.scale.y;
        z *= current.scale.z;
        const q = current.rotation;
        // Quaternion rotation via two cross products, independently of engine TRS composition.
        const tx = 2 * (q.y * z - q.z * y);
        const ty = 2 * (q.z * x - q.x * z);
        const tz = 2 * (q.x * y - q.y * x);
        [x, y, z] = [
            x + q.w * tx + q.y * tz - q.z * ty + current.position.x,
            y + q.w * ty + q.z * tx - q.x * tz + current.position.y,
            z + q.w * tz + q.x * ty - q.y * tx + current.position.z,
        ];
    }
    return [x, y, z];
}

export const POSITIONS = [-1, -1, 0, 1, -1, 0, 0, 1, 0];
export const JOINTS = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
export const WEIGHTS = [1, 0, 0, 0, 0, 1, 0, 0, 0.25, 0.75, 0, 0];
export const DELTAS = [0, 0, 0, 0, 0, 0, 0, 0.75, 0];

/** Both original fixtures deliberately use identity inverse bind matrices. */
export function skinnedVertices(joints: LocalNode[], morphWeight = 0): Point[] {
    return [0, 1, 2].map((vertex) => {
        const point = [0, 1, 2].map(
            (axis) => POSITIONS[vertex * 3 + axis] + morphWeight * DELTAS[vertex * 3 + axis],
        ) as Point;
        const result: Point = [0, 0, 0];
        for (let influence = 0; influence < 4; influence++) {
            const slot = vertex * 4 + influence;
            if (!WEIGHTS[slot]) continue;
            const transformed = localToWorld(point, joints[JOINTS[slot]]);
            for (let axis = 0; axis < 3; axis++) result[axis] += WEIGHTS[slot] * transformed[axis];
        }
        return result;
    });
}

export function containment(bounds: { center: Point; halfExtents: Point }, vertices: Point[]) {
    const min = [0, 1, 2].map((axis) => Math.min(...vertices.map((point) => point[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...vertices.map((point) => point[axis])));
    const sceneDiagonal = Math.hypot(...min.map((value, axis) => max[axis] - value));
    const tolerance = 1e-5 * Math.max(1, sceneDiagonal);
    const violations = vertices.flatMap((point, vertex) =>
        point.flatMap((value, axis) => {
            const low = bounds.center[axis] - bounds.halfExtents[axis];
            const high = bounds.center[axis] + bounds.halfExtents[axis];
            return value < low - tolerance || value > high + tolerance ? [{ vertex, axis, value, low, high }] : [];
        }),
    );
    return { sceneDiagonal, tolerance, violations };
}
