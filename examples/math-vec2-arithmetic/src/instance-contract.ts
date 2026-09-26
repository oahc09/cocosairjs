import { Mat4, Vec2 } from 'cocosair';

export function verifyVec2InstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-5;
    const check = (name: string, ok: boolean, detail = '') => probe.checks.push({ name, ok, detail });
    try {
        const original = new Vec2(2, 3);
        const clone = original.clone();
        check('clone', clone !== original && near(clone.x, 2) && near(clone.y, 3));

        const setTarget = new Vec2();
        check('set', setTarget.set(2, 3) === setTarget && near(setTarget.x, 2) && near(setTarget.y, 3));
        check('equals', new Vec2(1, 2).equals(new Vec2(1, 2)));
        check(
            'strictEquals',
            new Vec2(1, 2).strictEquals(new Vec2(1, 2)) && !new Vec2(1, 2).strictEquals(new Vec2(1, 3)),
        );

        const lerped = new Vec2(0, 0).lerp(new Vec2(10, 20), 0.5);
        check('lerp', near(lerped.x, 5) && near(lerped.y, 10), `${lerped.x},${lerped.y}`);
        const added = new Vec2(1, 2).add(new Vec2(3, 4));
        check('add', near(added.x, 4) && near(added.y, 6));
        const subtracted = new Vec2(4, 6).subtract(new Vec2(3, 4));
        check('subtract', near(subtracted.x, 1) && near(subtracted.y, 2));
        const scaled = new Vec2(2, 3).multiplyScalar(2);
        check('multiplyScalar', near(scaled.x, 4) && near(scaled.y, 6));
        const multiplied = new Vec2(2, 3).multiply(new Vec2(4, 5));
        check('multiply', near(multiplied.x, 8) && near(multiplied.y, 15));
        const divided = new Vec2(8, 15).divide(new Vec2(4, 5));
        check('divide', near(divided.x, 2) && near(divided.y, 3));

        check('dot', near(new Vec2(1, 2).dot(new Vec2(3, 4)), 11));
        check('cross', near(new Vec2(1, 2).cross(new Vec2(3, 4)), -2));
        check('lengthSqr', near(new Vec2(3, 4).lengthSqr(), 25));
        const normalized = new Vec2(3, 4).normalize();
        check('normalize', near(normalized.x, 0.6) && near(normalized.y, 0.8));
        check('angle', near(new Vec2(1, 0).angle(new Vec2(0, 1)), Math.PI / 2));

        const matrix = new Mat4();
        matrix.m12 = 5;
        matrix.m13 = 6;
        const transformed = new Vec2(1, 2).transformMat4(matrix);
        check('transformMat4', near(transformed.x, 6) && near(transformed.y, 8), `${transformed.x},${transformed.y}`);

        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
