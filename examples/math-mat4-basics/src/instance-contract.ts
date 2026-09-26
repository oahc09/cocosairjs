import { Mat4, Quat, Vec3 } from 'cocosair';

export function verifyMat4InstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-5;
    const check = (name: string, ok: boolean, detail = '') => probe.checks.push({ name, ok, detail });
    const scaledMatrix = () => new Mat4().scale(new Vec3(2, 3, 4));
    try {
        const base = scaledMatrix();
        const clone = base.clone();
        check('clone', clone !== base && clone.equals(base));
        const setTarget = new Mat4();
        check('set', setTarget.set(base) === setTarget && setTarget.equals(base));
        check('equals', scaledMatrix().equals(base));
        check('strictEquals', scaledMatrix().strictEquals(base) && !new Mat4().strictEquals(base));

        const identity = scaledMatrix().identity();
        check(
            'identity',
            near(identity.m00, 1) && near(identity.m05, 1) && near(identity.m10, 1) && near(identity.m15, 1),
        );
        const zero = new Mat4().zero();
        check('zero', near(zero.m00, 0) && near(zero.m05, 0) && near(zero.m15, 0));
        const nonsymmetric = new Mat4().transform(new Vec3(5, 6, 7));
        const transposed = nonsymmetric.clone().transpose();
        check('transpose', !transposed.strictEquals(nonsymmetric) && transposed.transpose().strictEquals(nonsymmetric));
        const inverse = base.clone().invert();
        check('invert', near(inverse.m00, 0.5) && near(inverse.m05, 1 / 3) && near(inverse.m10, 0.25));
        check('determinant', near(base.determinant(), 24));

        const sum = new Mat4().add(new Mat4());
        check('add', near(sum.m00, 2) && near(sum.m05, 2) && near(sum.m15, 2));
        const difference = sum.subtract(new Mat4());
        check('subtract', near(difference.m00, 1) && near(difference.m05, 1) && near(difference.m15, 1));
        const product = new Mat4().multiply(base);
        check('multiply', product.equals(base));
        const scalarProduct = new Mat4().multiplyScalar(3);
        check('multiplyScalar', near(scalarProduct.m00, 3) && near(scalarProduct.m05, 3));

        const translated = new Mat4().transform(new Vec3(5, 6, 7));
        check('transform', near(translated.m12, 5) && near(translated.m13, 6) && near(translated.m14, 7));
        check('scale', near(base.m00, 2) && near(base.m05, 3) && near(base.m10, 4));
        const rotated = new Mat4().rotate(Math.PI / 2, new Vec3(0, 0, 1));
        check('rotate', !!rotated && near(Math.abs(rotated.m01), 1) && near(rotated.determinant(), 1));

        const translation = new Vec3();
        translated.getTranslation(translation);
        check('getTranslation', near(translation.x, 5) && near(translation.y, 6) && near(translation.z, 7));
        const rotation = new Quat();
        rotated?.getRotation(rotation);
        check(
            'getRotation',
            near(Math.abs(rotation.z), Math.SQRT1_2) && near(Math.abs(rotation.w), Math.SQRT1_2),
            `${rotation.z},${rotation.w}`,
        );
        const composed = new Mat4().fromSRT(new Quat(), new Vec3(5, 6, 7), new Vec3(2, 3, 4));
        check(
            'fromSRT',
            near(composed.m12, 5) && near(composed.m13, 6) && near(composed.m14, 7) && near(composed.m00, 2),
        );
        const fromQuaternion = new Mat4().fromQuat(new Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2));
        check('fromQuat', near(Math.abs(fromQuaternion.m01), 1) && near(fromQuaternion.determinant(), 1));

        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
