import { Mat4, Vec3 } from 'cocosair';

export function verifyVec3InstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-5;
    const check = (name: string, ok: boolean, detail = '') => probe.checks.push({ name, ok, detail });
    try {
        const original = new Vec3(2, 3, 4);
        const clone = original.clone();
        check('clone', clone !== original && near(clone.x, 2) && near(clone.y, 3) && near(clone.z, 4));

        const setTarget = new Vec3();
        check(
            'set',
            setTarget.set(2, 3, 4) === setTarget &&
                near(setTarget.x, 2) &&
                near(setTarget.y, 3) &&
                near(setTarget.z, 4),
        );
        check('equals', new Vec3(1, 2, 3).equals(new Vec3(1, 2, 3)));
        check(
            'strictEquals',
            new Vec3(1, 2, 3).strictEquals(new Vec3(1, 2, 3)) && !new Vec3(1, 2, 3).strictEquals(new Vec3(1, 2, 4)),
        );

        const lerped = new Vec3(0, 0, 0).lerp(new Vec3(10, 20, 30), 0.5);
        check('lerp', near(lerped.x, 5) && near(lerped.y, 10) && near(lerped.z, 15));
        const added = new Vec3(1, 2, 3).add(new Vec3(4, 5, 6));
        check('add', near(added.x, 5) && near(added.y, 7) && near(added.z, 9));
        const subtracted = new Vec3(5, 7, 9).subtract(new Vec3(4, 5, 6));
        check('subtract', near(subtracted.x, 1) && near(subtracted.y, 2) && near(subtracted.z, 3));
        const scaled = new Vec3(2, 3, 4).multiplyScalar(2);
        check('multiplyScalar', near(scaled.x, 4) && near(scaled.y, 6) && near(scaled.z, 8));
        const multiplied = new Vec3(2, 3, 4).multiply(new Vec3(5, 6, 7));
        check('multiply', near(multiplied.x, 10) && near(multiplied.y, 18) && near(multiplied.z, 28));
        const divided = new Vec3(10, 18, 28).divide(new Vec3(5, 6, 7));
        check('divide', near(divided.x, 2) && near(divided.y, 3) && near(divided.z, 4));

        check('dot', near(new Vec3(1, 2, 3).dot(new Vec3(4, 5, 6)), 32));
        const crossed = new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0));
        check('cross', near(crossed.x, 0) && near(crossed.y, 0) && near(crossed.z, 1));
        check('lengthSqr', near(new Vec3(1, 2, 2).lengthSqr(), 9));
        const normalized = new Vec3(0, 3, 4).normalize();
        check('normalize', near(normalized.x, 0) && near(normalized.y, 0.6) && near(normalized.z, 0.8));

        const matrix = new Mat4();
        matrix.m12 = 5;
        matrix.m13 = 6;
        matrix.m14 = 7;
        const transformed = new Vec3(1, 2, 3).transformMat4(matrix);
        check(
            'transformMat4',
            near(transformed.x, 6) && near(transformed.y, 8) && near(transformed.z, 10),
            `${transformed.x},${transformed.y},${transformed.z}`,
        );

        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
