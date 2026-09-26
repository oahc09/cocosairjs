import { Quat } from 'cocosair';

export function verifyQuatInstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-5;
    const check = (name: string, ok: boolean, detail = '') => probe.checks.push({ name, ok, detail });
    try {
        const original = new Quat(0, 0, 0.6, 0.8);
        const clone = original.clone();
        check('clone', clone !== original && near(clone.z, 0.6) && near(clone.w, 0.8));
        const setTarget = new Quat();
        check('set', setTarget.set(0, 0, 0.6, 0.8) === setTarget && near(setTarget.z, 0.6) && near(setTarget.w, 0.8));
        check('equals', new Quat(0, 0, 0.6, 0.8).equals(new Quat(0, 0, 0.6, 0.8)));
        check(
            'strictEquals',
            new Quat(0, 0, 0.6, 0.8).strictEquals(new Quat(0, 0, 0.6, 0.8)) &&
                !new Quat(0, 0, 0.6, 0.8).strictEquals(new Quat(0, 0, 0.8, 0.6)),
        );

        const destination = new Quat(0, 0, 1, 0);
        const linear = new Quat(0, 0, 0, 1).lerp(destination, 0.5);
        check('lerp', linear.z > 0 && linear.z < 1 && linear.w > 0 && linear.w < 1, `${linear.z},${linear.w}`);
        const spherical = new Quat(0, 0, 0, 1).slerp(destination, 0.5);
        check(
            'slerp',
            near(spherical.z, spherical.w) && near(spherical.z ** 2 + spherical.w ** 2, 1),
            `${spherical.z},${spherical.w}`,
        );
        check('lengthSqr', near(new Quat(0, 0, 0.6, 0.8).lengthSqr(), 1));

        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
