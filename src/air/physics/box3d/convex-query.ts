/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import type { Box3DQueryProxy } from './binding/facade.mjs';
import type { Box3DCopiedRay } from './query';
import { copyBox3DRay } from './query';
import type { Ray } from '../../../cocos/core/geometry/ray';
import { finiteFloat32, worldError } from './world-binding';
type V = { readonly x: number; readonly y: number; readonly z: number };
type Q = V & { readonly w: number };
const invalid = (message: string): never => {
    throw worldError('AIR_E_BOX3D_CONFIG', 'convex query', message);
};
export function copyQueryRotation(value: Q): readonly number[] {
    if (!value) return invalid('Missing orientation.');
    const q = [value.x, value.y, value.z, value.w];
    if (q.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return invalid('Expected finite quaternion.');
    const scale = Math.max(...q.map(Math.abs));
    if (scale === 0) return invalid('Zero quaternion has no orientation.');
    const scaled = q.map((v) => v / scale),
        length = Math.hypot(...scaled);
    return Object.freeze(scaled.map((v) => v / length));
}
export function rotateQueryVector(p: readonly number[], q: readonly number[]): readonly number[] {
    const [x, y, z] = p,
        [qx, qy, qz, qw] = q;
    const tx = 2 * (qy * z - qz * y),
        ty = 2 * (qz * x - qx * z),
        tz = 2 * (qx * y - qy * x);
    return Object.freeze(
        [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx].map((v) =>
            finiteFloat32(v, 'query rotated point'),
        ),
    );
}
/** dimensions are native-scale box half extents, radius, or capsule radius/half-segment/axis. */
export function primitiveQueryProxy(
    kind: 'box' | 'sphere' | 'capsule',
    dimensions: readonly number[],
    rotation: readonly number[],
): Box3DQueryProxy {
    const d = dimensions.map((v) => finiteFloat32(v, 'query dimensions'));
    let points: readonly number[][] | readonly (readonly number[])[],
        radius = 0;
    if (kind === 'sphere') {
        if (d.length !== 1 || d[0] <= 0) return invalid('Sphere requires positive radius.');
        radius = d[0];
        points = [[0, 0, 0]];
    } else if (kind === 'box') {
        if (d.length !== 3 || d.some((v) => v <= 0)) return invalid('Box requires positive half extents.');
        points = [];
        const corners: number[][] = [];
        for (const x of [-1, 1])
            for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([d[0] * x, d[1] * y, d[2] * z]);
        points = corners;
    } else {
        if (d.length !== 3 || d[0] <= 0 || d[1] < 0 || ![0, 1, 2].includes(d[2]))
            return invalid('Invalid capsule radius, half segment or axis.');
        radius = d[0];
        const a = [0, 0, 0],
            b = [0, 0, 0];
        a[d[2]] = -d[1];
        b[d[2]] = d[1];
        points = d[1] === 0 ? [[0, 0, 0]] : [a, b];
    }
    return Object.freeze({ points: Object.freeze(points.map((p) => rotateQueryVector(p, rotation))), radius });
}
export function copyTranslationQuery(
    origin: V,
    translation: V,
    options: { group: number; mask: number; queryTrigger: boolean },
): Box3DCopiedRay {
    if (!translation) return invalid('Missing translation.');
    const delta = [translation.x, translation.y, translation.z].map((v) => finiteFloat32(v, 'query translation'));
    const distance = Math.hypot(...delta);
    const checked = copyBox3DRay({ o: origin, d: { x: delta[0], y: delta[1], z: delta[2] } } as Ray, {
        ...options,
        maxDistance: distance,
    });
    // This API already accepts a translation, not an arbitrary direction. Preserve
    // its exact float32 vector instead of round-tripping normalize * length.
    for (let i=0;i<3;++i) finiteFloat32(checked.origin[i]+delta[i],'query endpoint');
    return Object.freeze({...checked,translation:Object.freeze(delta),
        empty:delta.every(v=>v===0)||checked.options.group===0||checked.options.mask===0});
}
export function queryVector(value: readonly number[]): Readonly<V> {
    return Object.freeze({ x: value[0], y: value[1], z: value[2] });
}

/** Match the pinned core's noncontracting float32 b3RotateVector operation order.
 * This is construction of observed geometry, not an independent correctness oracle. */
function nativeRotate(p: readonly number[], q: readonly number[]): readonly number[] {
    const f = Math.fround;
    const cross = (a: readonly number[], b: readonly number[]) => [
        f(f(a[1] * b[2]) - f(a[2] * b[1])),
        f(f(a[2] * b[0]) - f(a[0] * b[2])),
        f(f(a[0] * b[1]) - f(a[1] * b[0])),
    ];
    const t1 = cross(q, p),
        t2 = t1.map((v, i) => f(v + f(q[3] * p[i]))),
        t3 = cross(q, t2);
    return Object.freeze(p.map((v, i) => finiteFloat32(f(v + f(2 * t3[i])), 'committed query point')));
}
/** Reconstruct the actual admitted primitive points, including F32 center+extent
 * rounding at creation. Keep the BODY origin as the native query origin to avoid
 * recombining a rounded large child center with its nominal unrounded dimensions. */
export function committedPrimitiveQuery(
    kind: 'box' | 'sphere' | 'capsule',
    center: readonly number[],
    dimensions: readonly number[],
    pose: readonly number[],
) {
    const c = center.map((v) => finiteFloat32(v, 'committed center')),
        d = [...dimensions],
        q = pose.slice(3, 7);
    if (q.length !== 4 || q.some((v) => !Number.isFinite(v)) || Math.abs(Math.hypot(...q) - 1) > 0.00001)
        return invalid('Invalid native committed quaternion.');
    let local: number[][] = [],
        radius = 0;
    if (kind === 'box') {
        for (const x of [-1, 1])
            for (const y of [-1, 1])
                for (const z of [-1, 1])
                    local.push([
                        Math.fround(c[0] + x * d[0]),
                        Math.fround(c[1] + y * d[1]),
                        Math.fround(c[2] + z * d[2]),
                    ]);
        for (let a = 0; a < 3; ++a) d[a] = (Math.fround(c[a] + d[a]) - Math.fround(c[a] - d[a])) / 2;
    } else if (kind === 'capsule') {
        radius = d[0];
        const a = [...c],
            b = [...c];
        a[d[2]] = Math.fround(c[d[2]] - d[1]);
        b[d[2]] = Math.fround(c[d[2]] + d[1]);
        local = d[1] === 0 ? [c] : [a, b];
        d[1] = (b[d[2]] - a[d[2]]) / 2;
    } else {
        radius = d[0];
        local = [c];
    }
    const points = Object.freeze(local.map((p) => nativeRotate(p, q))),
        origin = Object.freeze(pose.slice(0, 3));
    const actualCenter = [0, 1, 2].map((a) => origin[a] + points.reduce((s, p) => s + p[a] / points.length, 0));
    const proxy = Object.freeze({ points, radius });
    return Object.freeze({
        origin,
        center: Object.freeze(actualCenter),
        rotation: Object.freeze(q),
        dimensions: Object.freeze(d),
        proxy,
    });
}
export function capsuleQueryHalfHeight(height: number): number {
    if (typeof height !== 'number' || !Number.isFinite(height) || height < 0)
        return invalid('Capsule height must be finite and nonnegative.');
    return finiteFloat32(height, 'capsule height') / 2;
}
