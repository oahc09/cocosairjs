import { proveExactIdentityBoxSeparation } from './exact-box-separation.mjs';
import { proveNativePrimitiveEnclosure } from './native-rotation-enclosure.mjs';
const POLICY = 'CONSERVATIVE_LAYOUT_AABB_F32_ENCLOSURE_V2';
const SHALLOW_SUPPORT_M = 0.0005;
const finite3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const overlaps = (a, b) => a.min.every((v, i) => v < b.max[i] && a.max[i] > b.min[i]);
const key = (ref) => `${ref.itemId}:${ref.itemGeneration}`;

// Deliberately independent of the production compoundBounds/containment helpers.
// This enumerates all box corners, or both capsule segment endpoints plus radius.
export function recoveryShapeBounds(shapes, motion) {
    if (!Array.isArray(shapes) || !shapes.length || !motion) return null;
    const p = motion.position,
        q = motion.rotation;
    if (!p || !q || ![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite)) return null;
    const norm = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
    if (Math.abs(norm - 1) > 0.00001) return null;
    // Quaternion sandwich, divided by norm, rather than the production extent formula.
    const transform = ([x, y, z]) => {
        const ix = q.w * x + q.y * z - q.z * y,
            iy = q.w * y + q.z * x - q.x * z;
        const iz = q.w * z + q.x * y - q.y * x,
            iw = -q.x * x - q.y * y - q.z * z;
        return [
            p.x + (-iw * q.x + ix * q.w - iy * q.z + iz * q.y) / norm,
            p.y + (-iw * q.y + iy * q.w - iz * q.x + ix * q.z) / norm,
            p.z + (-iw * q.z + iz * q.w - ix * q.y + iy * q.x) / norm,
        ];
    };
    const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
    const include = (point, radius = 0) =>
        point.forEach((v, i) => {
            min[i] = Math.min(min[i], v - radius);
            max[i] = Math.max(max[i], v + radius);
        });
    for (const shape of shapes) {
        if (!finite3(shape.center)) return null;
        if (shape.type === 'box') {
            if (!finite3(shape.size) || shape.size.some((v) => v <= 0)) return null;
            for (const x of [-1, 1])
                for (const y of [-1, 1])
                    for (const z of [-1, 1])
                        include(transform(shape.center.map((v, i) => v + ([x, y, z][i] * shape.size[i]) / 2)));
        } else if (shape.type === 'capsule') {
            const axis = { X: 0, Y: 1, Z: 2 }[shape.axis];
            if (
                axis === undefined ||
                !Number.isFinite(shape.radius) ||
                shape.radius <= 0 ||
                !Number.isFinite(shape.cylinderHeight) ||
                shape.cylinderHeight < 0
            )
                return null;
            for (const sign of [-1, 1]) {
                const point = [...shape.center];
                point[axis] += (sign * shape.cylinderHeight) / 2;
                include(transform(point), shape.radius);
            }
        } else return null;
    }
    return { min, max };
}
function freeze(value) {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}
// Restricted scene-domain numerical enclosure, not a general native overlap oracle.
// Keep the original 0.1mm padding, but prove each actual F32 primitive
// geometry is inside it. Domain/norm validity alone never grants separation.
const NUMERICAL_PAD_M = 0.0001;
function bakedShapes(shapes) {
    if (!Array.isArray(shapes)) return null;
    return shapes.map((shape) => ({
        ...shape,
        center: shape.center?.map(Math.fround),
        ...(shape.type === 'box' ? { size: shape.size?.map((v) => 2 * Math.fround(v / 2)) } : {}),
        ...(shape.type === 'capsule'
            ? { radius: Math.fround(shape.radius), cylinderHeight: 2 * Math.fround(shape.cylinderHeight / 2) }
            : {}),
    }));
}
function enclosedBounds(shapes, motion) {
    if (!motion?.position || !motion.rotation || !Array.isArray(shapes)) return null;
    const q = motion.rotation,
        norm = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.00001) return null;
    const numbers = [
        ...Object.values(motion.position),
        ...shapes.flatMap((s) => [
            ...(s.center || []),
            ...(s.size || []),
            ...(s.type === 'capsule' ? [s.radius, s.cylinderHeight] : []),
        ]),
    ];
    if (numbers.some((v) => !Number.isFinite(v) || Math.abs(v) > 32)) return null;
    const unexpanded = recoveryShapeBounds(shapes, motion);
    if (!unexpanded) return null;
    const nativeEnclosure = proveNativePrimitiveEnclosure(shapes, motion, unexpanded, NUMERICAL_PAD_M);
    if (!nativeEnclosure) return null;
    return {
        nativeEnclosure,
        min: unexpanded.min.map((v) => v - NUMERICAL_PAD_M),
        max: unexpanded.max.map((v) => v + NUMERICAL_PAD_M),
        unexpanded,
        numericalPaddingM: NUMERICAL_PAD_M,
    };
}
function supportProof(target, obstacle) {
    // Explicit upward support on a known, axis-aligned single stock-table box.
    // Never ignore an entire table: penetration and full XZ support are checked.
    const { body, bounds } = obstacle,
        q = body.motion.rotation;
    if (
        body.role !== 'static' ||
        body.supportSurface !== 'stock-table' ||
        body.shapes.length !== 1 ||
        body.shapes[0].type !== 'box' ||
        q.x !== 0 ||
        q.y !== 0 ||
        q.z !== 0 ||
        Math.abs(q.w) !== 1
    )
        return null;
    const gap = target.min[1] - bounds.max[1];
    if (
        gap < -SHALLOW_SUPPORT_M ||
        target.max[1] <= bounds.max[1] ||
        ![0, 2].every((i) => target.min[i] >= bounds.unexpanded.min[i] && target.max[i] <= bounds.unexpanded.max[i])
    )
        return null;
    return {
        identity: body.identity,
        planeNormal: [0, 1, 0],
        planeOffset: bounds.max[1],
        startGap: gap,
        maxInitialPenetration: SHALLOW_SUPPORT_M,
    };
}
/**
 * Sufficient AABB-separation proof, NOT a native arbitrary-pose overlap query.
 * Caller must stop automatic simulation, copy every live solid body's committed
 * pose and baked shape descriptors in one idle read, and supply an independent
 * complete identity inventory. Epoch labels are consistency checks, not a claim
 * that this pure function can inspect native state or discover omitted bodies.
 * No pose mutation is performed. Unknown/partial/stale observations fail closed.
 */
function provePlacement({ plan, config, layout, snapshot, qualified = false, closedDoor }) {
    if (
        !qualified ||
        !plan ||
        !Number.isSafeInteger(plan.roundGeneration) ||
        !Array.isArray(plan.refs) ||
        !snapshot ||
        snapshot.complete !== true ||
        snapshot.simulationStopped !== true ||
        snapshot.roundGeneration !== plan.roundGeneration ||
        !Number.isSafeInteger(snapshot.nativeTick) ||
        snapshot.nativeTick < 0 ||
        !Array.isArray(snapshot.bodies) ||
        !Array.isArray(snapshot.expectedIdentities)
    )
        return null;
    const ids = snapshot.expectedIdentities;
    if (
        ids.some((id) => typeof id !== 'string' || !id) ||
        new Set(ids).size !== ids.length ||
        snapshot.bodies.length !== ids.length
    )
        return null;
    const seen = new Set(),
        bodies = [];
    for (const body of snapshot.bodies) {
        if (
            !ids.includes(body.identity) ||
            seen.has(body.identity) ||
            body.roundGeneration !== snapshot.roundGeneration ||
            body.nativeTick !== snapshot.nativeTick ||
            !['item', 'head', 'door', 'static'].includes(body.role) ||
            body.motion?.enabled !== true ||
            body.motion.massPending === true
        )
            return null;
        const bounds = enclosedBounds(body.shapes, body.motion);
        if (!bounds) return null;
        if (
            body.role === 'item' &&
            (typeof body.itemId !== 'string' ||
                !Number.isSafeInteger(body.itemGeneration) ||
                typeof body.skuId !== 'string')
        )
            return null;
        seen.add(body.identity);
        bodies.push({ body, bounds });
    }
    if (
        bodies.filter((o) => o.body.role === 'head').length !== 1 ||
        bodies.filter((o) => o.body.role === 'door').length !== 1
    )
        return null;
    const selected = new Set();
    for (const ref of plan.refs) {
        if (selected.has(key(ref))) return null;
        const matches = bodies.filter(
            (o) => o.body.role === 'item' && key(o.body) === key(ref) && o.body.skuId === ref.skuId,
        );
        if (matches.length !== 1) return null;
        selected.add(key(ref));
    }
    const targets = [];
    for (const ref of plan.refs) {
        const entries = layout?.items?.filter((e) => e.itemId === ref.itemId && e.skuId === ref.skuId);
        if (entries?.length !== 1 || !finite3(entries[0].position) || !Number.isFinite(entries[0].yawDegrees))
            return null;
        const entry = entries[0],
            angle = (entry.yawDegrees * Math.PI) / 360;
        const bounds = enclosedBounds(bakedShapes(config?.skus?.[ref.skuId]?.shapes), {
            position: {
                x: Math.fround(entry.position[0]),
                y: Math.fround(entry.position[1]),
                z: Math.fround(entry.position[2]),
            },
            rotation: { x: 0, y: Math.fround(Math.sin(angle)), z: 0, w: Math.fround(Math.cos(angle)) },
        });
        if (!bounds) return null;
        targets.push({ ref, bounds });
    }
    const obstacles = bodies.filter((o) => o.body.role !== 'item' || !selected.has(key(o.body)));
    const placementChecks = targets.map(({ ref, bounds }, index) => {
        const blockers = [],
            supports = [];
        for (const obstacle of obstacles)
            if (overlaps(bounds, obstacle.bounds)) {
                const support = supportProof(bounds, obstacle);
                if (support) supports.push(support);
                else blockers.push(obstacle.body.identity);
            }
        targets.forEach((other, j) => {
            if (j !== index && overlaps(bounds, other.bounds)) blockers.push(`restored:${other.ref.itemId}`);
        });
        return {
            itemId: ref.itemId,
            itemGeneration: ref.itemGeneration,
            complete: true,
            clear: blockers.length === 0,
            target: 'original-layout',
            bounds,
            blockers,
            supports,
        };
    });
    let mechanismClear = true,
        mechanismBounds = null;
    const mechanismSeparationProofs = [];
    if (plan.resetMechanism) {
        const targetDoor = {
            shapes: bakedShapes(closedDoor?.shapes),
            motion: closedDoor?.motion && {
                ...closedDoor.motion,
                position: Object.fromEntries(
                    Object.entries(closedDoor.motion.position).map(([k, v]) => [k, Math.fround(v)]),
                ),
                rotation: Object.fromEntries(
                    Object.entries(closedDoor.motion.rotation).map(([k, v]) => [k, Math.fround(v)]),
                ),
            },
        };
        mechanismBounds = enclosedBounds(targetDoor.shapes, targetDoor.motion);
        if (!mechanismBounds) return null;
        // Only a registered actual STATIC identity Box may replace an ambiguous
        // padded AABB result with an exact non-penetrating face separation proof.
        // Other bodies, rotations, missing provenance, or any exact negative gap deny.
        mechanismClear =
            obstacles
                .filter((o) => o.body.role !== 'door')
                .every((o) => {
                    if (!overlaps(mechanismBounds, o.bounds)) return true;
                    if (o.body.role !== 'static' || o.body.motion.type !== 0) return false;
                    const exact = proveExactIdentityBoxSeparation(targetDoor, o.body);
                    if (!exact || !exact.nativeGeometryEligible) return false;
                    mechanismSeparationProofs.push({
                        identity: o.body.identity,
                        nativeTick: snapshot.nativeTick,
                        roundGeneration: snapshot.roundGeneration,
                        proof: exact,
                    });
                    return true;
                }) && !targets.some((t) => overlaps(mechanismBounds, t.bounds));
    }
    if (!mechanismClear || placementChecks.some((check) => !check.clear)) return null;
    return freeze({
        recoveryId: plan.recoveryId,
        roundGeneration: plan.roundGeneration,
        nativeTick: snapshot.nativeTick,
        checkedIdentities: [...ids],
        placementChecks,
        mechanismClear,
        mechanismBounds,
        mechanismSeparationProofs,
        policy: POLICY,
        notNativeOverlapQuery: true,
    });
}

/** Invalid or incomplete caller data can only produce a denied preflight. */
export function proveRecoveryPlacement(input) {
    try {
        return provePlacement(input);
    } catch {
        return null;
    }
}
