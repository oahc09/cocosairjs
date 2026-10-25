import assert from 'node:assert/strict';
import test from 'node:test';
import { DROP, reviewDropTrace } from './drop-oracle.mjs';
import { surfaceDistance } from './oracle.mjs';
for (const hz of [60, 120])
    test(`unimpeded ${hz}Hz gravity counterexample cannot pass on first surface crossing`, () => {
        const trace = Array.from({ length: 90 }, (_, i) => ({
            step: i + 1,
            position: [0.5, 2 - (5 * (i + 1) * (i + 2)) / (hz * hz), 0.75],
        }));
        const first = trace.findIndex((r) => surfaceDistance(r.position) - 0.1 <= 0.01);
        assert.ok(first >= 0, 'counterexample really reaches old pass threshold');
        assert.ok(
            surfaceDistance(trace[first].position) - 0.1 >= -0.01,
            'old one-frame proximity test would accept this freefall',
        );
        assert.throws(
            () => reviewDropTrace(trace.slice(0, first + 1), { ...DROP, dt: 1 / hz }),
            /NOT contact-response proof/,
        );
        assert.throws(
            () => reviewDropTrace(trace.slice(0, first + 1 + 12), { ...DROP, dt: 1 / hz }),
            /penetration|tunneling/,
        );
    });
test('observation reviewer accepts a constructed full-duration nonpenetrating response trace (CPU only)', () => {
    const trace = Array.from({ length: 42 }, (_, i) => ({
        step: i + 1,
        position: [
            0.5,
            Math.max(0.75 + 0.1 * Math.sqrt(1 + 0.5 ** 2 + (2 / 3) ** 2), 2 - (5 * (i + 1) * (i + 2)) / 3600),
            0.75,
        ],
    }));
    const result = reviewDropTrace(trace);
    assert.equal(result.responseSteps, 12);
    assert.ok(result.responseThroughStep > result.firstContactStep);
});
