/** NODE_CONTRACT only: workflow decisions from independently measured leaf state. */
const G = require('../../tools/verify/shaders-wave4-gate.cjs');
const actual = {
    effects: ['C01', 'C02', 'C03', 'C04'].map((id) => ({ id, validation: { ok: true, errors: [] } })),
    counts: { combinations: 4, dimensionRows: 72, performanceProfiles: 54 },
    currentSdk: [{ path: 'build/cocosair.module.js', sha256: 'known-current-sdk' }],
    combinationGate: 'PASS',
    priorWave: { validation: { ok: false, errors: ['prior SDK identity drift'] } },
    status: 'BLOCKED',
    nextWaveEligible: false,
};
function fixture() {
    return {
        ...JSON.parse(JSON.stringify(actual)),
        schemaVersion: 'shaders-wave4-current-gate/1',
        wave: 4,
        createdAt: '2026-10-11T08:00:00.000Z',
        subset: true,
        projectCompleted: false,
        agentGate: 'NOT_RUN',
        independentGalleryGate: 'NOT_RUN',
        verifier: G.fingerprint('tools/verify/shaders-wave4-gate.cjs'),
    };
}
describe('Wave4 current candidate status isolation', () => {
    test('four measured combinations do not override a stale prerequisite', () => {
        const result = G.validateMeasuredReport(fixture(), actual);
        expect(result).toEqual({ ok: true, errors: [], status: 'BLOCKED', nextWaveEligible: false });
    });
    test.each([null, undefined, [], 'invalid', 1])('malformed report rejected without throwing: %p', (value) => {
        const result = G.validateMeasuredReport(value, actual);
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
    const mutations: [string, (report: any) => void][] = [
        ['wave prematurely PASS', (r) => (r.status = 'PASS')],
        ['Wave5 eligible', (r) => (r.nextWaveEligible = true)],
        ['Agent marked PASS', (r) => (r.agentGate = 'PASS')],
        ['Gallery marked PASS', (r) => (r.independentGalleryGate = 'PASS')],
        ['project complete', (r) => (r.projectCompleted = true)],
        ['full scope false claim', (r) => (r.subset = false)],
        ['missing C04', (r) => r.effects.pop()],
        ['inflated dimension count', (r) => r.counts.dimensionRows++],
        ['SDK replaced', (r) => (r.currentSdk[0].sha256 = 'unknown')],
        ['prerequisite forged', (r) => (r.priorWave.validation.ok = true)],
        ['verifier drift', (r) => (r.verifier.sha256 = '0'.repeat(64))],
        ['invalid date', (r) => (r.createdAt = 'unknown')],
    ];
    test.each(mutations)('rejects %s', (_name, mutate) => {
        const report = fixture();
        mutate(report);
        const result = G.validateMeasuredReport(report, actual);
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
    test('malformed measured state is rejected without throwing', () => {
        expect(G.validateMeasuredReport(fixture(), null).ok).toBe(false);
    });
});
