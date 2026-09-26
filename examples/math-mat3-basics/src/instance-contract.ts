import { Mat3, Quat, Vec3 } from 'cocosair';

export function verifyMat3InstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-5;
    const check = (name: string, ok: boolean, detail = '') => probe.checks.push({ name, ok, detail });
    const diagonal = (x: number, y: number, z: number) => new Mat3(x, 0, 0, 0, y, 0, 0, 0, z);
    try {
        const base = diagonal(2, 3, 4);
        const clone = base.clone();
        check('clone', clone !== base && clone.equals(base));
        const setTarget = new Mat3();
        check('set', setTarget.set(base) === setTarget && setTarget.equals(base));
        check('equals', diagonal(2, 3, 4).equals(base));
        check('strictEquals', diagonal(2, 3, 4).strictEquals(base) && !diagonal(2, 3, 5).strictEquals(base));

        const identity = diagonal(2, 3, 4).identity();
        check('identity', near(identity.m00, 1) && near(identity.m04, 1) && near(identity.m08, 1));
        const nonsymmetric = new Mat3(1, 2, 3, 4, 5, 6, 7, 8, 10);
        const transposed = nonsymmetric.clone().transpose();
        check('transpose', !transposed.strictEquals(nonsymmetric) && transposed.transpose().strictEquals(nonsymmetric));
        const inverse = base.clone().invert();
        check('invert', near(inverse.m00, 0.5) && near(inverse.m04, 1 / 3) && near(inverse.m08, 0.25));
        check('determinant', near(base.determinant(), 24));

        const sum = new Mat3().add(new Mat3());
        check('add', near(sum.m00, 2) && near(sum.m04, 2) && near(sum.m08, 2));
        const difference = sum.subtract(new Mat3());
        check('subtract', near(difference.m00, 1) && near(difference.m04, 1) && near(difference.m08, 1));
        const product = new Mat3().multiply(base);
        check('multiply', product.equals(base));
        const scalarProduct = new Mat3().multiplyScalar(3);
        check('multiplyScalar', near(scalarProduct.m00, 3) && near(scalarProduct.m04, 3));
        const scaled = new Mat3().scale(new Vec3(2, 3, 4));
        check(
            'scale',
            near(scaled.m00, 2) && near(scaled.m04, 3) && near(scaled.m08, 1),
            `${scaled.m00},${scaled.m04},${scaled.m08}`,
        );

        const rotated = new Mat3().rotate(Math.PI / 2);
        check('rotate', near(rotated.determinant(), 1) && near(Math.abs(rotated.m01), 1));
        const fromQuaternion = new Mat3().fromQuat(new Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2));
        check('fromQuat', near(Math.abs(fromQuaternion.m01), 1) && near(fromQuaternion.determinant(), 1));

        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
