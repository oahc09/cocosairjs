/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Independent scalar-array fixture oracle. Never participates in product execution or native stepping.
 */
import type { Node } from '../../../src/cocos/scene-graph/node';
export interface LocalSample {
    readonly node: Node;
    readonly parent: Node | null;
    readonly position: readonly number[];
    readonly rotation: readonly number[];
    readonly scale: readonly number[];
}
const finite = (a: readonly number[], count: number): void => {
    if (a.length !== count || !a.every(Number.isFinite)) throw new Error('Oracle requires finite complete vectors');
};
export function localSample(node: Node): LocalSample {
    const p = node.position,
        q = node.rotation,
        s = node.scale;
    return Object.freeze({
        node,
        parent: node.parent,
        position: Object.freeze([p.x, p.y, p.z]),
        rotation: Object.freeze([q.x, q.y, q.z, q.w]),
        scale: Object.freeze([s.x, s.y, s.z]),
    });
}
export function sameLocal(a: LocalSample, b: LocalSample): boolean {
    return (
        a.node === b.node &&
        a.parent === b.parent &&
        [a.position, a.rotation, a.scale].every((v, i) =>
            v.every((x, j) => x === [b.position, b.rotation, b.scale][i][j]),
        )
    );
}
export function unit(q: readonly number[]): readonly number[] {
    finite(q, 4);
    const norm = Math.hypot(...q);
    if (norm < 1e-12) throw new Error('Degenerate oracle quaternion');
    return Object.freeze(q.map((x) => x / norm));
}
export function multiplyQuaternion(a: readonly number[], b: readonly number[]): readonly number[] {
    finite(a, 4);
    finite(b, 4);
    return Object.freeze([
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]);
}
export function angularError(a: readonly number[], b: readonly number[]): number {
    const aa = unit(a),
        bb = unit(b);
    const relative = multiplyQuaternion([-aa[0], -aa[1], -aa[2], aa[3]], bb);
    return 2 * Math.atan2(Math.hypot(relative[0], relative[1], relative[2]), Math.abs(relative[3]));
}
export function trs(p: readonly number[], q: readonly number[], s: readonly number[]): readonly number[] {
    finite(p, 3);
    finite(s, 3);
    const [x, y, z, w] = unit(q);
    return Object.freeze([
        (1 - 2 * y * y - 2 * z * z) * s[0],
        (2 * x * y + 2 * z * w) * s[0],
        (2 * x * z - 2 * y * w) * s[0],
        0,
        (2 * x * y - 2 * z * w) * s[1],
        (1 - 2 * x * x - 2 * z * z) * s[1],
        (2 * y * z + 2 * x * w) * s[1],
        0,
        (2 * x * z + 2 * y * w) * s[2],
        (2 * y * z - 2 * x * w) * s[2],
        (1 - 2 * x * x - 2 * y * y) * s[2],
        0,
        p[0],
        p[1],
        p[2],
        1,
    ]);
}
export function multiplyMatrix(a: readonly number[], b: readonly number[]): readonly number[] {
    finite(a, 16);
    finite(b, 16);
    const out: number[] = [];
    for (let column = 0; column < 4; ++column)
        for (let row = 0; row < 4; ++row) {
            let value = 0;
            for (let k = 0; k < 4; ++k) value += a[k * 4 + row] * b[column * 4 + k];
            out[column * 4 + row] = value;
        }
    return Object.freeze(out);
}
export function inversePoint(matrix: readonly number[], p: readonly number[]): readonly number[] {
    finite(matrix, 16);
    finite(p, 3);
    const [a, b, c] = [matrix[0], matrix[4], matrix[8]],
        [d, e, f] = [matrix[1], matrix[5], matrix[9]],
        [g, h, i] = [matrix[2], matrix[6], matrix[10]],
        det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) throw new Error('Singular oracle parent basis');
    const [x, y, z] = [p[0] - matrix[12], p[1] - matrix[13], p[2] - matrix[14]];
    return Object.freeze([
        ((e * i - f * h) * x + (c * h - b * i) * y + (b * f - c * e) * z) / det,
        ((f * g - d * i) * x + (a * i - c * g) * y + (c * d - a * f) * z) / det,
        ((d * h - e * g) * x + (b * g - a * h) * y + (a * e - b * d) * z) / det,
    ]);
}
export function hierarchy(node: Node) {
    const chain: LocalSample[] = [],
        seen = new Set<Node>();
    let current: Node | null = node;
    while (current) {
        if (seen.has(current)) throw new Error('Cyclic oracle hierarchy');
        seen.add(current);
        chain.unshift(localSample(current));
        current = current.parent;
    }
    let matrix = trs([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]),
        rotation: readonly number[] = [0, 0, 0, 1];
    for (const item of chain) {
        matrix = multiplyMatrix(matrix, trs(item.position, item.rotation, item.scale));
        rotation = unit(multiplyQuaternion(rotation, item.rotation));
    }
    return Object.freeze({
        chain: Object.freeze(chain),
        matrix,
        rotation,
        position: Object.freeze(matrix.slice(12, 15)),
    });
}
export function expectedLocal(node: Node, worldPose: readonly number[]) {
    if (worldPose.length < 7) throw new Error('Missing oracle origin pose');
    const parent = node.parent ? hierarchy(node.parent) : null;
    const q = parent ? parent.rotation : [0, 0, 0, 1];
    return Object.freeze({
        position: parent ? inversePoint(parent.matrix, worldPose.slice(0, 3)) : Object.freeze(worldPose.slice(0, 3)),
        rotation: unit(multiplyQuaternion([-q[0], -q[1], -q[2], q[3]], worldPose.slice(3, 7))),
    });
}
export function distance(a: readonly number[], b: readonly number[]): number {
    finite(a, 3);
    finite(b, 3);
    return Math.hypot(...a.map((v, i) => v - b[i]));
}
export function inspectNode(node: Node, nativePose?: readonly number[]) {
    // Copy raw local first. Subsequent world getters are explicitly observations and may refresh Cocos caches.
    const raw = localSample(node),
        scratch = hierarchy(node),
        p = node.worldPosition,
        q = node.worldRotation;
    return {
        name: node.name,
        parent: node.parent?.name ?? null,
        local: { position: raw.position, rotation: raw.rotation, scale: raw.scale },
        scratch: { position: scratch.position, rotation: scratch.rotation, matrix: scratch.matrix },
        cached: { position: [p.x, p.y, p.z], rotation: [q.x, q.y, q.z, q.w] },
        flags: node.hasChangedFlags,
        errors: nativePose
            ? {
                  origin: distance(scratch.position, nativePose.slice(0, 3)),
                  angular: angularError(scratch.rotation, nativePose.slice(3, 7)),
                  cachedOrigin: distance([p.x, p.y, p.z], nativePose.slice(0, 3)),
                  local: distance(raw.position, expectedLocal(node, nativePose).position),
              }
            : null,
    };
}
