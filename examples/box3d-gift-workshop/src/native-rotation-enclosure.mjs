/** Outward intervals for the SDK220 Float32-ABI primitive geometry.
 * SDK220 FORCE BOX3D_DOUBLE_PRECISION OFF: world add and radius bounds also F32.
 * Never normalizes/replaces the native quaternion; only bounds its geometry.
 * Each float operation encloses the exact real operation as well as rounded
 * F32 output, so separated operations and a fused mul-add are both covered.
 */
const b = new ArrayBuffer(4),
    v = new DataView(b);
function next32(x, up) {
    x = Math.fround(x);
    if (!Number.isFinite(x)) throw Error('nonfinite F32 interval');
    if (x === 0) return up ? 2 ** -149 : -(2 ** -149);
    v.setFloat32(0, x);
    let bits = v.getUint32(0);
    bits += x > 0 === up ? 1 : -1;
    v.setUint32(0, bits);
    const y = v.getFloat32(0);
    if (!Number.isFinite(y)) throw Error('interval overflow');
    return y;
}
const outward = (lo, hi) => [next32(lo, false), next32(hi, true)];
const add = (a, b) => outward(a[0] + b[0], a[1] + b[1]);
const sub = (a, b) => outward(a[0] - b[1], a[1] - b[0]);
const mul = (a, b) => {
    const p = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
    return outward(Math.min(...p), Math.max(...p));
};
const cross = (a, b) => [
    sub(mul(a[1], b[2]), mul(a[2], b[1])),
    sub(mul(a[2], b[0]), mul(a[0], b[2])),
    sub(mul(a[0], b[1]), mul(a[1], b[0])),
];
function nativeRotate(q, point) {
    const a = cross(q.slice(0, 3), point),
        c = a.map((x, i) => add(x, mul(q[3], point[i]))),
        d = cross(q.slice(0, 3), c);
    return point.map((x, i) => add(x, mul([2, 2], d[i])));
}
const exact32 = (x) => Number.isFinite(x) && Math.fround(x) === x;
export function proveNativePrimitiveEnclosure(shapes, motion, ideal, padding = 0.0001) {
    try {
        if (padding !== 0.0001 || !shapes?.length || !ideal) return null;
        const pos = ['x', 'y', 'z'].map((k) => motion.position[k]),
            quat = ['x', 'y', 'z', 'w'].map((k) => motion.rotation[k]);
        if (
            !quat.every(exact32) ||
            pos.some((x) => !exact32(x) || Math.abs(x) > 32) ||
            Math.abs(quat.reduce((s, x) => s + x * x, 0) - 1) > 1e-5
        )
            return null;
        const q = quat.map((x) => [x, x]),
            min = [Infinity, Infinity, Infinity],
            max = [-Infinity, -Infinity, -Infinity];
        let points = 0;
        const include = (point, radius = 0) => {
            const rot = nativeRotate(q, point);
            for (let i = 0; i < 3; i++) {
                const world = add([pos[i], pos[i]], rot[i]);
                min[i] = Math.min(min[i], sub(world, [radius, radius])[0]);
                max[i] = Math.max(max[i], add(world, [radius, radius])[1]);
            }
            points++;
        };
        for (const s of shapes) {
            if (s.center?.length !== 3 || !s.center.every(exact32) || s.center.some((x) => Math.abs(x) > 32))
                return null;
            const center = s.center.map((x) => [x, x]);
            if (s.type === 'box') {
                if (
                    s.size?.length !== 3 ||
                    !s.size.every((x) => x / 2 >= Math.fround(0.001) && x <= 32 && exact32(x / 2))
                )
                    return null;
                for (const x of [-1, 1])
                    for (const y of [-1, 1])
                        for (const z of [-1, 1])
                            include(
                                center.map((c, i) =>
                                    add(c, [([x, y, z][i] * s.size[i]) / 2, ([x, y, z][i] * s.size[i]) / 2]),
                                ),
                            );
            } else if (s.type === 'capsule') {
                const axis = { X: 0, Y: 1, Z: 2 }[s.axis];
                if (
                    axis === undefined ||
                    !exact32(s.radius) ||
                    s.radius <= 0 ||
                    s.radius > 32 ||
                    !exact32(s.cylinderHeight / 2) ||
                    s.cylinderHeight < 0 ||
                    s.cylinderHeight > 32
                )
                    return null;
                for (const sign of [-1, 1])
                    include(
                        center.map((c, i) =>
                            i === axis ? add(c, [(sign * s.cylinderHeight) / 2, (sign * s.cylinderHeight) / 2]) : c,
                        ),
                        s.radius,
                    );
            } else return null;
        }
        const bboxRequiredPaddingM = Math.max(
            0,
            ...min.map((x, i) => ideal.min[i] - x),
            ...max.map((x, i) => x - ideal.max[i]),
        );
        if (!Number.isFinite(bboxRequiredPaddingM) || bboxRequiredPaddingM > padding) return null;
        return Object.freeze({
            policy: 'PINNED_CORE_OUTWARD_F32_PRIMITIVE_ENCLOSURE_V1',
            nativeBounds: { min, max },
            bboxRequiredPaddingM,
            paddingM: padding,
            points,
            usesOriginalNativeQuaternion: true,
        });
    } catch {
        return null;
    }
}
