const G = require('../../tools/verify/shaders-uv-fusion-gate.cjs');
describe('W5 fusion aggregation contracts (NODE_CONTRACT)', () => {
    test('empty GPU evidence stays unavailable, never zero milliseconds', () => {
        expect(G.stats([])).toEqual({ count: 0, median: null, p95: null, min: null, max: null });
    });
    test('metric statistics independently reduced in declared nearest-rank order', () => {
        expect(G.stats([9, 1, 3, 2, 4])).toEqual({ count: 5, median: 3, p95: 9, min: 1, max: 9 });
    });
    test.each([[[NaN]], [[Infinity]], [[-1]]])('malformed timing rejected %p', (values) =>
        expect(() => G.stats(values)).toThrow('Invalid metric'),
    );
    test.each([null, [], {}, { schema: 'shaders-uv-fusion-gate/1', status: 'PASS', agentGate: 'PASS' }])(
        'malformed or false Agent claim rejected %p',
        (gate) => {
            expect(() => G.validateGate(gate)).not.toThrow();
            expect(G.validateGate(gate).ok).toBe(false);
        },
    );
    test('omitting validator closure cannot create a PASS gate', () => {
        const gate = {
            schema: 'shaders-uv-fusion-gate/1',
            status: 'PASS',
            agentGate: 'NOT_RUN',
            galleryGate: 'NOT_RUN',
            wave5Gate: 'NOT_RUN',
            projectCompleted: false,
            validatorInputs: [],
        };
        expect(G.validateGate(gate).ok).toBe(false);
    });
});
