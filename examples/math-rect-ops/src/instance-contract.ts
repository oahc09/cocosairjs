import { Rect } from 'cocosair';

export function verifyRectInstanceContract(): void {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    try {
        const rect = new Rect(1, 2, 3, 4);
        probe.checks.push({
            name: 'equals',
            ok: rect.equals(new Rect(1, 2, 3, 4)) && !rect.equals(new Rect(1, 2, 3, 5)),
            detail: '',
        });
        const midpoint = new Rect(0, 0, 0, 0).lerp(new Rect(10, 20, 30, 40), 0.5);
        probe.checks.push({
            name: 'lerp',
            ok: midpoint.x === 5 && midpoint.y === 10 && midpoint.width === 15 && midpoint.height === 20,
            detail: `${midpoint.x},${midpoint.y},${midpoint.width},${midpoint.height}`,
        });
        probe.ok = probe.checks.every((entry) => entry.ok);
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
}
