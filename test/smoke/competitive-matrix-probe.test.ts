const { readBrowserProbe } = require('../../tools/verify/browser-probe.cjs');

describe('browser matrix explicit existing probe contracts', () => {
    afterEach(() => {
        delete (window as any).__probe;
        delete (window as any).__bench;
    });
    test('calls an existing nested method with its actual receiver', () => {
        (window as any).__bench = {
            value: 60000,
            getState() {
                return { count: this.value };
            },
        };
        expect(readBrowserProbe('__bench.getState')).toEqual({ count: 60000 });
    });
    test('preserves the absent default probe but rejects absent explicit probes', () => {
        expect(readBrowserProbe()).toBeNull();
        (window as any).__probe = () => ({ fake: true });
        expect(() => readBrowserProbe('__bench.getState')).toThrow('missing');
    });
    test('fails when an explicit probe is a value rather than a method', () => {
        (window as any).__bench = { getState: { ready: true } };
        expect(() => readBrowserProbe('__bench.getState')).toThrow('not callable');
    });
    test.each(['__bench.getState()', '__proto__.x', '__bench.constructor', '__bench.prototype.x'])(
        'rejects executable or prototype paths: %s',
        (probePath) => {
            expect(() => readBrowserProbe(probePath)).toThrow();
        },
    );
});
