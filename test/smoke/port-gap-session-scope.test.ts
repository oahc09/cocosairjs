import { createSessionScope } from '../../src/air/session-scope';

describe('PG-30 production session ownership', () => {
    test('generation retires stale continuations and notifies subscribed gates', async () => {
        const scope = createSessionScope(), changes: string[] = [];
        scope.onChange(() => changes.push(`${scope.generation}:${scope.active}`));
        scope.activate(); const old = scope.token(); expect(old.isCurrent()).toBe(true);
        scope.deactivate('pause'); expect(old.isCurrent()).toBe(false);
        scope.activate(); expect(old.isCurrent()).toBe(false);
        const current = scope.token(); expect(current.isCurrent()).toBe(true);
        await scope.dispose(); expect(current.isCurrent()).toBe(false);
        expect(changes).toEqual(['1:true', '1:false', '2:true', '2:false']);
        expect(() => scope.activate()).toThrow('AIR_E_SESSION_CLOSED');
    });
    test('cleanup is exactly once and shared even when a notification reenters disposal', async () => {
        const scope = createSessionScope(); scope.activate();
        const calls: string[] = [];
        scope.own(() => { calls.push('one'); });
        const unown = scope.own(() => { calls.push('transferred'); }); unown();
        let reentrant: Promise<unknown>;
        scope.onChange(() => { reentrant = scope.dispose(); });
        const first = scope.dispose(), second = scope.dispose();
        expect(first).toBe(second); expect(reentrant!).toBe(first);
        expect((await first).status).toBe('released'); expect(calls).toEqual(['one']);
        expect(() => scope.own(() => {})).toThrow('AIR_E_SESSION_CLOSED');
    });
    test('throwing cleanup and timed-out async ownership are explicit failures, never success', async () => {
        const scope = createSessionScope(); let finish!: () => void;
        scope.own(() => new Promise<void>((resolve) => { finish = resolve; }), 'slow');
        scope.own(() => { throw new Error('owner failed'); }, 'throw');
        const result = await scope.dispose({ timeoutMs: 20 });
        expect(result.status).toBe('failed'); expect(result.pending).toEqual(['slow#1']);
        expect(result.failures[0].message).toContain('owner failed');
        finish(); await Promise.resolve(); expect(result.pending).toEqual(['slow#1']);
    });
});
