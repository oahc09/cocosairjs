import { Mat3, Mat4, Quat, Vec3 } from 'cocosair';

type ProbeCheck = { name: string; ok: boolean; detail: string };

/** Exercise the remaining Vec3 constants, static operations, and component accessors. */
export function installVec3CoreProbe(): void {
    const probe = { ready: false, ok: false, checks: [] as ProbeCheck[] };
    (window as any).__trialProbe = probe;
    const check = (name: string, ok: boolean, detail = '') => {
        probe.checks.push({ name, ok, detail });
        if (!ok) throw new Error(`${name}: ${detail}`);
    };
    const near = (actual: number, expected: number, epsilon = 0.0001) =>
        Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon;
    const checkVec = (name: string, actual: Readonly<Vec3>, x: number, y: number, z: number) => {
        check(name, near(actual.x, x) && near(actual.y, y) && near(actual.z, z), `${actual.x},${actual.y},${actual.z}`);
    };

    checkVec('Vec3.UNIT_X', Vec3.UNIT_X, 1, 0, 0);
    checkVec('Vec3.UNIT_Y', Vec3.UNIT_Y, 0, 1, 0);
    checkVec('Vec3.UNIT_Z', Vec3.UNIT_Z, 0, 0, 1);
    checkVec('Vec3.RIGHT', Vec3.RIGHT, 1, 0, 0);
    checkVec('Vec3.UP', Vec3.UP, 0, 1, 0);
    checkVec('Vec3.FORWARD', Vec3.FORWARD, 0, 0, -1);
    checkVec('Vec3.ZERO', Vec3.ZERO, 0, 0, 0);
    checkVec('Vec3.ONE', Vec3.ONE, 1, 1, 1);
    checkVec('Vec3.NEG_ONE', Vec3.NEG_ONE, -1, -1, -1);

    const a = new Vec3(1.2, -2.3, 3.4);
    const b = new Vec3(-4.4, 5.5, -6.6);
    const out = new Vec3();
    checkVec('Vec3.zero', Vec3.zero(out), 0, 0, 0);
    checkVec('Vec3.clone', Vec3.clone(a), a.x, a.y, a.z);
    checkVec('Vec3.copy', Vec3.copy(out, a), a.x, a.y, a.z);
    checkVec('Vec3.ceil', Vec3.ceil(out, a), 2, -2, 4);
    checkVec('Vec3.floor', Vec3.floor(out, a), 1, -3, 3);
    checkVec('Vec3.min', Vec3.min(out, a, b), -4.4, -2.3, -6.6);
    checkVec('Vec3.max', Vec3.max(out, a, b), 1.2, 5.5, 3.4);
    checkVec('Vec3.round', Vec3.round(out, a), 1, -2, 3);
    checkVec('Vec3.scaleAndAdd', Vec3.scaleAndAdd(out, a, b, 0.5), -1, 0.45, 0.1);
    checkVec('Vec3.negate', Vec3.negate(out, a), -1.2, 2.3, -3.4);
    checkVec('Vec3.invert', Vec3.invert(out, new Vec3(2, 4, -8)), 0.5, 0.25, -0.125);
    checkVec('Vec3.invertSafe', Vec3.invertSafe(out, new Vec3(2, 0, -4)), 0.5, 0, -0.25);

    const xAxis = new Vec3(1, 0, 0);
    const yAxis = new Vec3(0, 1, 0);
    checkVec('Vec3.slerp', Vec3.slerp(out, xAxis, yAxis, 0.5), Math.SQRT1_2, Math.SQRT1_2, 0);
    check('Vec3.random', near(Vec3.len(Vec3.random(out, 2)), 2), `${out.x},${out.y},${out.z}`);

    const identity3 = Mat3.identity(new Mat3());
    const identity4 = Mat4.identity(new Mat4());
    checkVec('Vec3.transformMat4Normal', Vec3.transformMat4Normal(out, a, identity4), a.x, a.y, a.z);
    checkVec('Vec3.transformMat3', Vec3.transformMat3(out, a, identity3), a.x, a.y, a.z);
    checkVec('Vec3.transformAffine', Vec3.transformAffine(out, a, identity4), a.x, a.y, a.z);
    checkVec('Vec3.transformQuat', Vec3.transformQuat(out, a, new Quat()), a.x, a.y, a.z);

    const translation = new Vec3(1, 2, 3);
    const scale = new Vec3(2, 2, 2);
    checkVec('Vec3.transformRTS', Vec3.transformRTS(out, xAxis, new Quat(), translation, scale), 3, 2, 3);
    checkVec(
        'Vec3.transformInverseRTS',
        Vec3.transformInverseRTS(out, new Vec3(3, 2, 3), new Quat(), translation, scale),
        1,
        0,
        0,
    );
    checkVec('Vec3.rotateX', Vec3.rotateX(out, yAxis, Vec3.ZERO, Math.PI / 2), 0, 0, 1);
    check('Vec3.rotateY', near(Vec3.len(Vec3.rotateY(out, Vec3.FORWARD, Vec3.ZERO, Math.PI / 2)), 1));
    checkVec('Vec3.rotateZ', Vec3.rotateZ(out, xAxis, Vec3.ZERO, Math.PI / 2), 0, 1, 0);
    checkVec('Vec3.rotateN', Vec3.rotateN(out, xAxis, Vec3.ZERO, Vec3.UNIT_Z, Math.PI / 2), 0, 1, 0);

    const array = [0, 0, 0];
    Vec3.toArray(array, a);
    check(
        'Vec3.toArray',
        array.every(Number.isFinite) && array[0] === a.x && array[1] === a.y && array[2] === a.z,
        array.join(','),
    );
    checkVec('Vec3.fromArray', Vec3.fromArray(out, array), a.x, a.y, a.z);
    check('Vec3.signedAngle', near(Vec3.signedAngle(xAxis, yAxis, Vec3.UNIT_Z), Math.PI / 2));
    checkVec('Vec3.projectOnPlane', Vec3.projectOnPlane(out, new Vec3(1, 2, 3), Vec3.UNIT_Y), 1, 0, 3);
    checkVec('Vec3.project', Vec3.project(out, new Vec3(1, 2, 3), Vec3.UNIT_Y), 0, 2, 0);
    checkVec('Vec3.moveTowards', Vec3.moveTowards(out, Vec3.ZERO, new Vec3(3, 0, 0), 1), 1, 0, 0);
    const orthogonal = Vec3.generateOrthogonal(out, new Vec3(1, 2, 3));
    check(
        'Vec3.generateOrthogonal',
        Math.abs(Vec3.dot(orthogonal, new Vec3(1, 2, 3))) < 0.0001 && near(Vec3.len(orthogonal), 1),
    );

    const components = new Vec3(4, 5, 6);
    check('Vec3.x', components.x === 4, String(components.x));
    check('Vec3.y', components.y === 5, String(components.y));
    check('Vec3.z', components.z === 6, String(components.z));
    probe.ok = true;
    probe.ready = true;
}
