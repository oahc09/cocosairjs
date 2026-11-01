/** Example-only spring math. SI units; does not integrate or mutate a rigid body. */
export type Triple = Readonly<{ x: number; y: number; z: number }>;
export interface SpringParameters {
    readonly stiffness: number;
    readonly dampingRatio: number;
    readonly maxForce: number;
    readonly maxStretch: number;
}
const finite = (v: Triple) => !!v && [v.x, v.y, v.z].every(Number.isFinite);
export function copyPoint(value: Triple): Triple {
    if (!finite(value)) throw new Error('Spring point must contain finite coordinates.');
    return Object.freeze({ x: value.x, y: value.y, z: value.z });
}
export function springForce(input: {
    target: Triple;
    point: Triple;
    worldCOM: Triple;
    linearVelocity: Triple;
    angularVelocity: Triple;
    mass: number;
    parameters: SpringParameters;
}): Readonly<{ force: Triple; relativePoint: Triple }> {
    const { target, point, worldCOM, linearVelocity: v, angularVelocity: w, mass, parameters: p } = input;
    if (
        ![target, point, worldCOM, v, w].every(finite) ||
        !Number.isFinite(mass) ||
        mass <= 0 ||
        ![p.stiffness, p.dampingRatio, p.maxForce, p.maxStretch].every(Number.isFinite) ||
        p.stiffness <= 0 ||
        p.dampingRatio < 0 ||
        p.maxForce <= 0 ||
        p.maxStretch <= 0
    )
        throw new Error('Invalid spring input.');
    const r = { x: point.x - worldCOM.x, y: point.y - worldCOM.y, z: point.z - worldCOM.z };
    const delta = { x: target.x - point.x, y: target.y - point.y, z: target.z - point.z };
    const stretch = Math.hypot(delta.x, delta.y, delta.z);
    const scale = stretch > p.maxStretch ? p.maxStretch / stretch : 1;
    const damping = 2 * p.dampingRatio * Math.sqrt(p.stiffness * mass);
    // RigidBody linear velocity is COM velocity; damping must use v + omega cross r.
    const force = {
        x: p.stiffness * delta.x * scale - damping * (v.x + w.y * r.z - w.z * r.y),
        y: p.stiffness * delta.y * scale - damping * (v.y + w.z * r.x - w.x * r.z),
        z: p.stiffness * delta.z * scale - damping * (v.z + w.x * r.y - w.y * r.x),
    };
    if (!finite(r) || !finite(force)) throw new Error('Non-finite derived spring force.');
    const magnitude = Math.hypot(force.x, force.y, force.z);
    if (magnitude > p.maxForce) {
        const limit = p.maxForce / magnitude;
        force.x *= limit;
        force.y *= limit;
        force.z *= limit;
    }
    return Object.freeze({ force: copyPoint(force), relativePoint: copyPoint(r) });
}
