import { Color } from 'cocosair';

export function verifyColorInstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const near = (actual: number, expected: number) => Math.abs(actual - expected) <= 1;
    const check = (name: string, ok: boolean, detail = '') => probe.checks.push({ name, ok, detail });
    try {
        const original = new Color(12, 34, 56, 78);
        const clone = original.clone();
        check('clone', clone !== original && clone.equals(original));
        check('equals', new Color(12, 34, 56, 78).equals(original) && !new Color(12, 34, 56, 79).equals(original));
        const midpoint = new Color(0, 0, 0, 255).lerp(new Color(100, 120, 140, 255), 0.5);
        check(
            'lerp',
            near(midpoint.r, 50) && near(midpoint.g, 60) && near(midpoint.b, 70),
            `${midpoint.r},${midpoint.g},${midpoint.b}`,
        );
        const parsed = new Color().fromHEX('#336699');
        check(
            'fromHEX',
            parsed.r === 51 && parsed.g === 102 && parsed.b === 153,
            `${parsed.r},${parsed.g},${parsed.b}`,
        );
        const setTarget = new Color();
        check(
            'set',
            setTarget.set(12, 34, 56, 78) === setTarget &&
                setTarget.r === 12 &&
                setTarget.g === 34 &&
                setTarget.b === 56 &&
                setTarget.a === 78,
        );
        const multiplied = new Color(12, 34, 56, 78).multiply(Color.WHITE);
        check(
            'multiply',
            multiplied.r === 12 && multiplied.g === 34 && multiplied.b === 56,
            `${multiplied.r},${multiplied.g},${multiplied.b}`,
        );
        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
