import { Mat4, Vec4 } from 'cocosair';

export function verifyVec4InstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-5;
    const check = (name: string, ok: boolean, detail = '') => probe.checks.push({ name, ok, detail });
    try {
        const original = new Vec4(2, 3, 4, 5);
        const clone = original.clone();
        check(
            'clone',
            clone !== original && near(clone.x, 2) && near(clone.y, 3) && near(clone.z, 4) && near(clone.w, 5),
        );

        const setTarget = new Vec4();
        check(
            'set',
            setTarget.set(2, 3, 4, 5) === setTarget &&
                near(setTarget.x, 2) &&
                near(setTarget.y, 3) &&
                near(setTarget.z, 4) &&
                near(setTarget.w, 5),
        );
        check('equals', new Vec4(1, 2, 3, 4).equals(new Vec4(1, 2, 3, 4)));
        check(
            'strictEquals',
            new Vec4(1, 2, 3, 4).strictEquals(new Vec4(1, 2, 3, 4)) &&
                !new Vec4(1, 2, 3, 4).strictEquals(new Vec4(1, 2, 3, 5)),
        );

        const lerped = new Vec4(0, 0, 0, 0).lerp(new Vec4(10, 20, 30, 40), 0.5);
        check('lerp', near(lerped.x, 5) && near(lerped.y, 10) && near(lerped.z, 15) && near(lerped.w, 20));
        const added = new Vec4(1, 2, 3, 4).add(new Vec4(5, 6, 7, 8));
        check('add', near(added.x, 6) && near(added.y, 8) && near(added.z, 10) && near(added.w, 12));
        const subtracted = new Vec4(6, 8, 10, 12).subtract(new Vec4(5, 6, 7, 8));
        check(
            'subtract',
            near(subtracted.x, 1) && near(subtracted.y, 2) && near(subtracted.z, 3) && near(subtracted.w, 4),
        );
        const scaled = new Vec4(2, 3, 4, 5).multiplyScalar(2);
        check('multiplyScalar', near(scaled.x, 4) && near(scaled.y, 6) && near(scaled.z, 8) && near(scaled.w, 10));
        const multiplied = new Vec4(2, 3, 4, 5).multiply(new Vec4(6, 7, 8, 9));
        check(
            'multiply',
            near(multiplied.x, 12) && near(multiplied.y, 21) && near(multiplied.z, 32) && near(multiplied.w, 45),
        );
        const divided = new Vec4(12, 21, 32, 45).divide(new Vec4(6, 7, 8, 9));
        check('divide', near(divided.x, 2) && near(divided.y, 3) && near(divided.z, 4) && near(divided.w, 5));

        check('dot', near(new Vec4(1, 2, 3, 4).dot(new Vec4(5, 6, 7, 8)), 70));
        check('lengthSqr', near(new Vec4(1, 2, 2, 4).lengthSqr(), 25));
        const normalized = new Vec4(0, 0, 3, 4).normalize();
        check(
            'normalize',
            near(normalized.x, 0) && near(normalized.y, 0) && near(normalized.z, 0.6) && near(normalized.w, 0.8),
        );
        const scaledAgain = new Vec4(2, 3, 4, 5).scale(3);
        check(
            'scale',
            near(scaledAgain.x, 6) && near(scaledAgain.y, 9) && near(scaledAgain.z, 12) && near(scaledAgain.w, 15),
        );

        const matrix = new Mat4();
        matrix.m12 = 5;
        matrix.m13 = 6;
        matrix.m14 = 7;
        const transformed = new Vec4(1, 2, 3, 1).transformMat4(matrix);
        check(
            'transformMat4',
            near(transformed.x, 6) && near(transformed.y, 8) && near(transformed.z, 10) && near(transformed.w, 1),
            `${transformed.x},${transformed.y},${transformed.z},${transformed.w}`,
        );

        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
