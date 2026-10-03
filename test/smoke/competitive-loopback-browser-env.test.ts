const { loopbackBrowserEnv } = require('../../tools/verify/loopback-browser-env.cjs');

describe('local browser verification proxy environment', () => {
    test('adds loopback bypass in both forms and leaves proxy values and input untouched', () => {
        const env = {
            HTTP_PROXY: 'http://127.0.0.1:9',
            https_proxy: 'http://127.0.0.1:9',
            ALL_PROXY: 'http://127.0.0.1:9',
            OTHER: 'keep',
        };
        const fixed = loopbackBrowserEnv(env);
        expect(fixed.NO_PROXY).toBe('127.0.0.1,localhost,::1');
        expect(fixed.no_proxy).toBe(fixed.NO_PROXY);
        expect(fixed.HTTP_PROXY).toBe(env.HTTP_PROXY);
        expect(fixed.https_proxy).toBe(env.https_proxy);
        expect(fixed.ALL_PROXY).toBe(env.ALL_PROXY);
        expect(fixed.OTHER).toBe('keep');
        expect((env as any).NO_PROXY).toBeUndefined();
    });
    test('preserves distinct existing bypass targets, including wildcard and port syntax', () => {
        const fixed = loopbackBrowserEnv({
            NO_PROXY: 'example.test,127.0.0.1, host.test:80 ',
            no_proxy: 'other.test,*',
        });
        expect(new Set(fixed.NO_PROXY.split(','))).toEqual(
            new Set(['example.test', '127.0.0.1', 'host.test:80', 'other.test', '*', 'localhost', '::1']),
        );
        expect(fixed.no_proxy).toBe(fixed.NO_PROXY);
    });
    test('empty ambient bypass still produces finite explicit local targets', () => {
        expect(loopbackBrowserEnv({ NO_PROXY: '', no_proxy: '' }).NO_PROXY).toBe('127.0.0.1,localhost,::1');
    });
});
