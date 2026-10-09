/**
 * IER-04 geometry contract: pure, engine-free math and validation (review revision).
 * Every function is total: any invalid input produces a structured rejection —
 * null/undefined/malformed objects never throw, and bad geometry is rejected whole
 * before any SDK call.
 */

export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}
export interface RayLike {
    origin: Vec3Like;
    direction: Vec3Like;
}
export interface PlaneLike {
    point: Vec3Like;
    normal: Vec3Like;
}

export interface GeometryUpdate {
    positions: Float32Array | number[];
    normals?: Float32Array | number[];
    uvs?: Float32Array | number[];
    indices16?: Uint16Array | number[];
    indices32?: Uint32Array | number[];
}
export interface MeshCapacity {
    maxSubMeshVertices: number;
    maxSubMeshIndices: number;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}
/** Accepts plain arrays AND typed arrays (the SDK consumes Float32Array/Uint16Array). */
function numericArray(value: unknown): value is ArrayLike<number> {
    if (!value || typeof value !== 'object') return false;
    const length = (value as { length?: unknown }).length;
    if (!Number.isInteger(length) || (length as number) < 0) return false;
    const array = value as ArrayLike<unknown>;
    for (let i = 0; i < (length as number); i++) if (!isFiniteNumber(array[i])) return false;
    return true;
}

/** Preflight for dynamic mesh updates: reject before any SDK call (example-side guard,
 *  not a claim that the SDK itself is transactional). Total: never throws. */
export function validateGeometryUpdate(geometry: unknown, capacity: unknown): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) {
        return { ok: false, errors: ['geometry must be a non-null object'] };
    }
    if (!capacity || typeof capacity !== 'object') {
        return { ok: false, errors: ['capacity must be an object'] };
    }
    const cap = capacity as Record<string, unknown>;
    for (const key of ['maxSubMeshVertices', 'maxSubMeshIndices'] as const) {
        const value = cap[key];
        if (!isFiniteNumber(value) || !Number.isSafeInteger(value) || value <= 0) {
            errors.push(`capacity.${key} must be a positive safe integer (got ${String(value)})`);
        }
    }
    if (errors.length) return { ok: false, errors }; // capacity is meaningless otherwise

    const data = geometry as Record<string, unknown>;
    const positions = data.positions;
    if (!numericArray(positions) || positions.length === 0) {
        errors.push('positions must be a non-empty finite array');
        return { ok: false, errors };
    }
    if (positions.length % 3 !== 0) errors.push(`positions length ${positions.length} not a multiple of 3`);
    if (positions.length / 3 > (cap.maxSubMeshVertices as number)) {
        errors.push(`vertices ${positions.length / 3} exceed capacity ${String(cap.maxSubMeshVertices)}`);
    }
    const vertexCount = positions.length / 3;
    if (data.normals !== undefined) {
        if (!numericArray(data.normals)) errors.push('normals must be finite');
        else if (data.normals.length !== positions.length) errors.push('normals length != positions length');
    }
    if (data.uvs !== undefined) {
        if (!numericArray(data.uvs)) errors.push('uvs must be finite');
        else if (data.uvs.length !== vertexCount * 2)
            errors.push(`uvs length ${data.uvs.length} != 2 per vertex (${vertexCount * 2})`);
    }
    if (data.indices16 !== undefined && data.indices32 !== undefined) {
        errors.push('indices16 and indices32 are mutually exclusive (one index stream per update)');
    }
    const indices = (data.indices16 ?? data.indices32) as number[] | undefined;
    if (indices !== undefined) {
        if (!numericArray(indices)) {
            errors.push('indices must be finite');
        } else {
            const is16 = data.indices16 !== undefined;
            for (let i = 0; i < indices.length; i++) {
                if (!Number.isSafeInteger(indices[i]) || indices[i] < 0) {
                    errors.push(`indices[${i}]=${indices[i]} must be a non-negative safe integer`);
                    break;
                }
                if (indices[i] >= vertexCount) {
                    errors.push(`indices[${i}]=${indices[i]} >= vertex count ${vertexCount}`);
                    break;
                }
                if (is16 && indices[i] > 0xffff) {
                    errors.push(`indices[${i}]=${indices[i]} exceeds the 16-bit range`);
                    break;
                }
            }
            if (indices.length > (cap.maxSubMeshIndices as number)) {
                errors.push(`indices ${indices.length} exceed capacity ${String(cap.maxSubMeshIndices)}`);
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

/** client (browser event) → canvas-relative CSS px; the live rect is provided by the caller. */
export function clientToCanvasCss(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number },
): { x: number; y: number } {
    return { x: clientX - rect.left, y: clientY - rect.top };
}

/** CSS px → camera screen px. The camera viewport rect is expressed in backing pixels;
 *  a full-canvas viewport makes camera screen px == canvas backing px. */
export function cssToScreen(
    css: { x: number; y: number },
    backing: { width: number; height: number },
    cssSize: { width: number; height: number },
    viewportPx: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
    const scaleX = viewportPx.width / cssSize.width;
    const scaleY = viewportPx.height / cssSize.height;
    return { x: viewportPx.x + css.x * scaleX, y: viewportPx.y + css.y * scaleY };
}

/** Cut plane from two received rays. Perspective rays share the camera origin; orthographic
 *  rays are parallel. Both cases produce the plane that contains both rays — never a
 *  fixed-height plane with vertical extrapolation. Collinear/skew/degenerate rays are
 *  rejected explicitly (no arbitrary fallback plane). */
export function planeFromRays(ray1: RayLike, ray2: RayLike): PlaneLike | { error: string } {
    for (const [name, ray] of [
        ['ray1', ray1],
        ['ray2', ray2],
    ] as const) {
        if (!ray || typeof ray !== 'object') return { error: `${name} missing` };
        for (const part of ['origin', 'direction'] as const) {
            const v = (ray as unknown as Record<string, unknown>)[part] as Vec3Like | undefined;
            if (!v || ![v.x, v.y, v.z].every(isFiniteNumber)) return { error: `${name}.${part} must be finite` };
        }
        if (length(ray.direction) < 1e-9) return { error: `${name}.direction is a zero vector` };
    }
    const d1 = normalize(ray1.direction);
    const d2 = normalize(ray2.direction);
    const delta = sub(ray2.origin, ray1.origin);
    // Coplanarity of two lines: the triple product (d1 × d2) · (o2 - o1) must vanish;
    // skew lines admit NO plane containing both — reject instead of picking a fallback.
    const normalCandidate = cross(d1, d2);
    const coplanarity = dot(normalCandidate, delta);
    if (Math.abs(coplanarity) > 1e-7) return { error: 'skew rays admit no common plane (triple product non-zero)' };
    if (length(normalCandidate) < 1e-9) {
        if (length(delta) < 1e-9) return { error: 'degenerate: rays are collinear through the same point' };
        if (length(cross(d1, delta)) < 1e-9)
            return { error: 'degenerate: rays are collinear (infinitely many planes contain the line)' };
        // Parallel distinct rays: the plane contains BOTH lines, so its normal is
        // perpendicular to the direction AND to the offset between the origins.
        const normal = cross(d1, delta);
        if (length(normal) < 1e-9) return { error: 'degenerate: cannot build a plane from parallel rays' };
        return { point: { ...ray1.origin }, normal: normalize(normal) };
    }
    return { point: { ...ray1.origin }, normal: normalize(normalCandidate) };
}

/** Plane ∩ segment: exact intersection point or null (used for the real cut-surface edges). */
export function planeSegmentIntersection(
    planePoint: Vec3Like,
    planeNormal: Vec3Like,
    a: Vec3Like,
    b: Vec3Like,
): Vec3Like | null {
    const ab = sub(b, a);
    const denom = dot(planeNormal, ab);
    if (Math.abs(denom) < 1e-9) return null;
    const t = dot(sub(planePoint, a), planeNormal) / denom;
    if (t < 0 || t > 1) return null;
    return add(a, scale(ab, t));
}

/** Ray ∩ plane, null when parallel or behind the ray. */
export function rayPlaneIntersect(ray: RayLike, plane: PlaneLike): Vec3Like | null {
    const denom = dot(plane.normal, ray.direction);
    if (Math.abs(denom) < 1e-9) return null;
    const t = dot(sub(plane.point, ray.origin), plane.normal) / denom;
    if (t < 0) return null;
    return add(ray.origin, scale(ray.direction, t));
}

/** Frozen design target: cut geometry vertices must project back onto the received
 *  input line within 0.15 CSS px (new-example design goal, not a historical replay claim). */
export const CUT_VERTEX_ERROR_BUDGET_CSS_PX = 0.15;

/** Projected error of a world point against the raw received CSS input, in CSS px. */
export function projectionErrorCssPx(
    worldPoint: Vec3Like,
    inputCss: { x: number; y: number },
    projectWorldToCss: (world: Vec3Like) => { x: number; y: number },
): number {
    const projected = projectWorldToCss(worldPoint);
    return Math.hypot(projected.x - inputCss.x, projected.y - inputCss.y);
}

/** Point-in-quad containment for the "same gesture hits the target" check. */
export function pointInQuad(
    point: Vec3Like,
    quadCenter: Vec3Like,
    quadNormal: Vec3Like,
    quadUp: Vec3Like,
    halfWidth: number,
    halfHeight: number,
): boolean {
    const local = sub(point, quadCenter);
    const u = dot(local, quadUp);
    const right = normalize(cross(quadUp, quadNormal));
    const v = dot(local, right);
    return Math.abs(u) <= halfHeight && Math.abs(v) <= halfWidth;
}

/** Blade phase expectation: the blade center at phase p sits at lerp(w1, w2, p). */
export function bladeExpectedCenter(w1: Vec3Like, w2: Vec3Like, phase: number): Vec3Like {
    return add(scale(w1, 1 - phase), scale(w2, phase));
}

/** Perpendicular distance to the infinite LINE through a-b: cut-plane boundary vertices lie
 *  ON the extended knife line (the plane cuts the whole slab), so the honest metric is the
 *  line distance, not the clamped segment distance. */
export function pointToLineDistanceCssPx(
    point: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
): number {
    const abx = b.x - a.x,
        aby = b.y - a.y;
    const len = Math.hypot(abx, aby);
    if (len === 0) return Math.hypot(point.x - a.x, point.y - a.y);
    return Math.abs((point.x - a.x) * aby - (point.y - a.y) * abx) / len;
}

/** Perpendicular distance from a point to a 2D segment: parameterization-free. */
export function pointToSegmentDistanceCssPx(
    point: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
): number {
    const abx = b.x - a.x,
        aby = b.y - a.y;
    const apx = point.x - a.x,
        apy = point.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) return Math.hypot(apx, apy);
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
    return Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t));
}

/** Center-line endpoints of an uploaded thin quad (v0..v3, two edges): the measurement
 *  source for stroke/cut/blade is the ACTUAL uploaded Float32 data, not theory. */
export function thinQuadCenterLine(
    positions: ArrayLike<number>,
): [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] {
    const at = (i: number) => ({ x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] });
    const a = at(0),
        b = at(1),
        c = at(2),
        d = at(3);
    return [
        { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 },
        { x: (b.x + d.x) / 2, y: (b.y + d.y) / 2, z: (b.z + d.z) / 2 },
    ];
}

/** Ribbon vertex strip in screen space: a moving band across the canvas. */
export function ribbonVertices(time: number, width: number, count: number): number[] {
    const out: number[] = [];
    const x0 = -1 + ((time * 0.12) % 2.4) - 0.2;
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        out.push(x0 + t * 1.6, 0.55 + Math.sin(t * 6 + time * 2) * 0.08, 0);
    }
    for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        out.push(x0 + t * 1.6, 0.3 + Math.sin(t * 6 + time * 2 + 0.6) * 0.08, 0);
    }
    return out;
}

// ── minimal vector helpers (no engine dependency) ──
export function sub(a: Vec3Like, b: Vec3Like): Vec3Like {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function add(a: Vec3Like, b: Vec3Like): Vec3Like {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function scale(a: Vec3Like, s: number): Vec3Like {
    return { x: a.x * s, y: a.y * s, z: a.z * s };
}
export function dot(a: Vec3Like, b: Vec3Like): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function length(a: Vec3Like): number {
    return Math.hypot(a.x, a.y, a.z);
}
export function normalize(a: Vec3Like): Vec3Like {
    const l = length(a) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
}
export function cross(a: Vec3Like, b: Vec3Like): Vec3Like {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
