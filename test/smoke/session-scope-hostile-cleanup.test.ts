import { createSessionScope } from '../../src/air/session-scope';

describe('session cleanup diagnostics are non-throwing', () => {
    test.each(['sync', 'async', 'revoked-proxy', 'async-revoked-proxy'])(
        '%s failures preserve the shared receipt',
        async (kind) => {
            const hostile = {
                toString() {
                    throw new Error('diagnostic conversion failed');
                },
            };
            const revoked = Proxy.revocable({}, {});
            revoked.revoke();
            const error = kind.includes('revoked-proxy') ? revoked.proxy : hostile;
            const scope = createSessionScope();
            let calls = 0;
            scope.own(() => {
                calls++;
                if (kind.startsWith('async')) return Promise.reject(error);
                throw error;
            }, 'hostile');
            scope.own(() => {
                calls++;
            }, 'healthy');
            const first = scope.dispose({ timeoutMs: 50 });
            expect(scope.dispose()).toBe(first);
            const receipt = await first;
            expect(receipt).toEqual({
                status: 'failed',
                completed: ['healthy#2'],
                pending: [],
                failures: [{ label: 'hostile#1', message: '[unprintable error]' }],
            });
            expect(await scope.dispose()).toBe(receipt);
            expect(calls).toBe(2);
            expect(Object.isFrozen(receipt)).toBe(true);
            expect(Object.isFrozen(receipt.failures[0])).toBe(true);
        },
    );
    test('late hostile rejection leaves a timed-out receipt immutable', async () => {
        const scope = createSessionScope();
        let reject!: (error: unknown) => void;
        scope.own(
            () =>
                new Promise<void>((_, fail) => {
                    reject = fail;
                }),
            'late',
        );
        const result = await scope.dispose({ timeoutMs: 1 });
        expect(result).toEqual({ status: 'failed', completed: [], pending: ['late#1'], failures: [] });
        reject({
            toString() {
                throw new Error('late diagnostic conversion');
            },
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(await scope.dispose()).toBe(result);
        expect(result.pending).toEqual(['late#1']);
        expect(result.failures).toEqual([]);
    });
});
