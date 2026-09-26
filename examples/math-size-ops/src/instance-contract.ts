import { Size } from 'cocosair';

export function verifySizeInstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    try {
        const size = new Size(10, 20);
        probe.checks.push({
            name: 'equals',
            ok: size.equals(new Size(10, 20)) && !size.equals(new Size(10, 21)),
            detail: '',
        });
        const midpoint = new Size(0, 0).lerp(new Size(10, 20), 0.5);
        probe.checks.push({
            name: 'lerp',
            ok: midpoint.width === 5 && midpoint.height === 10,
            detail: `${midpoint.width},${midpoint.height}`,
        });
        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
