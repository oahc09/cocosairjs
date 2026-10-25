/**
 * Exact dyadic geometry for a deliberately narrow primitive subset.
 * The caller must establish provenance: these are the current committed body
 * origins and admitted baked box half-extents, or an explicitly proposed birth
 * pose. This pure proof neither discovers native objects nor creates any body.
 */
const POLICY = 'EXACT_IDENTITY_BOX_DYADIC_SEPARATION_V1';
const buffer = new ArrayBuffer(4);
const bits = new DataView(buffer);
const exactF32 = (n) => typeof n === 'number' && Number.isFinite(n) && Math.fround(n) === n;

// Every finite binary32 value is an integer multiple of 2^-149, including
// subnormals. These are exact, unrounded p±half endpoints, NOT native gaps.
// SDK220 uses Float32 world coordinates. RN32 is monotone, so aMax<=bMin
// implies RN32(aMax)<=RN32(bMin): a positive gap can collapse to touching,
// never reverse into overlap. This does not predict contact/slop algorithms.
function units(n) {
    bits.setFloat32(0, n, false);
    const word = bits.getUint32(0, false);
    const exponent = (word >>> 23) & 255;
    const fraction = word & 0x7fffff;
    const magnitude = exponent === 0 ? BigInt(fraction) : BigInt(fraction + 0x800000) << BigInt(exponent - 1);
    return word >>> 31 ? -magnitude : magnitude;
}
function intervals(value) {
    if (!value || !Array.isArray(value.shapes) || value.shapes.length !== 1) return null;
    const shape = value.shapes[0],
        motion = value.motion;
    if (
        !shape ||
        shape.type !== 'box' ||
        !Array.isArray(shape.center) ||
        shape.center.length !== 3 ||
        shape.center.some((v) => v !== 0)
    )
        return null;
    if (
        !Array.isArray(shape.size) ||
        shape.size.length !== 3 ||
        shape.size.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
        !motion ||
        motion.enabled !== true ||
        ![0, 1, 2].includes(motion.type) ||
        motion.massPending !== false
    )
        return null;
    const p = motion.position,
        q = motion.rotation;
    if (!p || !q || q.x !== 0 || q.y !== 0 || q.z !== 0 || (q.w !== 1 && q.w !== -1)) return null;
    const origin = [p.x, p.y, p.z],
        half = shape.size.map((v) => v / 2);
    if (!origin.every(exactF32) || half.some((v) => !exactF32(v) || v <= 0)) return null;
    return origin.map((v, i) => ({ min: units(v) - units(half[i]), max: units(v) + units(half[i]) }));
}
function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
/**
 * Return a frozen sufficient proof that box interiors are disjoint, including
 * exact face/edge/corner touching. Negative gaps never pass, however small.
 * No tolerance, contact slop, quaternion normalization, or geometry mutation.
 */
export function proveExactIdentityBoxSeparation(a, b) {
    try {
        const aa = intervals(a),
            bb = intervals(b);
        if (!aa || !bb) return null;
        const axisChecks = aa.map((v, i) => {
            const forward = bb[i].min - v.max,
                backward = v.min - bb[i].max;
            const aBeforeB = forward >= backward;
            return {
                axis: i,
                axisName: ['x', 'y', 'z'][i],
                a: { minUnits: v.min.toString(), maxUnits: v.max.toString() },
                b: { minUnits: bb[i].min.toString(), maxUnits: bb[i].max.toString() },
                gapUnits: (aBeforeB ? forward : backward).toString(),
                direction: aBeforeB ? 'A_BEFORE_B' : 'B_BEFORE_A',
            };
        });
        const separated = axisChecks.find((row) => BigInt(row.gapUnits) >= 0n);
        if (!separated) return null;
        return freeze({
            policy: POLICY,
            unitExponent: -149,
            axis: separated.axis,
            axisName: separated.axisName,
            direction: separated.direction,
            gapUnits: separated.gapUnits,
            touching: separated.gapUnits === '0',
            axisChecks,
            gapSemantics: 'EXACT_UNROUNDED_DYADIC_NOT_NATIVE_GAP',
            nativeSeparationBasis: 'MONOTONE_FLOAT32_ROUNDING_AFTER_MIN_HALF_ADMISSION',
            nativeGeometryEligible: [a, b].every((value) =>
                value.shapes[0].size.every((size) => size / 2 >= Math.fround(0.001)),
            ),
            pureGeometryOnly: true,
            notNativeOverlapQuery: true,
        });
    } catch {
        return null;
    }
}
