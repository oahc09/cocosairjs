/** NODE_CONTRACT: status reduction only; actual browser proof is independently recollected. */
const G = require('../../tools/verify/shaders-current-sdk-wave4-gate.cjs');
const base = require('../../tools/verify/shaders-wave4-gate.cjs');
const measured = () => ({
    effects: G.PLAN.map(([id]: [string]) => ({ id, validation: { ok: true, errors: [] } })),
    counts: { engines: 3, combinations: 4, dimensionRows: 72, performanceProfiles: 54 },
    currentSdk: [{ path: 'build/cocosair.module.js', sha256: 'NODE_CONTRACT' }],
    combinationGate: 'PASS',
    priorWave: { gate: { path: G.PRIOR }, validation: { ok: true, errors: [] } },
    status: 'PASS',
    nextWaveEligible: true,
    closureInputs: G.closureInputs(),
});
function fixture(actual: any) {
    return {
        ...JSON.parse(JSON.stringify(actual)),
        schemaVersion: 'shaders-wave4-current-gate/1',
        wave: 4,
        createdAt: '2026-10-11T10:00:00.000Z',
        subset: true,
        projectCompleted: false,
        agentGate: 'NOT_RUN',
        independentGalleryGate: 'NOT_RUN',
        verifier: base.fingerprint('tools/verify/shaders-wave4-gate.cjs'),
    };
}
describe('Wave4 current SDK predecessor and status isolation', () => {
    test('accepts measured current predecessor and four combinations', () => {
        const actual = measured();
        expect(G.validateMeasuredReport(fixture(actual), actual)).toEqual({ ok: true, errors: [] });
    });
    const mutations: [string, (r: any) => void][] = [
        [
            'historical predecessor',
            (r) => (r.priorWave.gate.path = 'docs/evidence/shaders-absorption/wave3-current-gate.json'),
        ],
        ['unverified predecessor', (r) => (r.priorWave.validation.ok = false)],
        ['predecessor errors', (r) => r.priorWave.validation.errors.push('SDK drift')],
        ['missing C04', (r) => r.effects.pop()],
        ['duplicate C03', (r) => (r.effects[3].id = 'C03')],
        ['leaf rejected', (r) => (r.effects[0].validation.ok = false)],
        ['leaf errors', (r) => r.effects[0].validation.errors.push('PNG mismatch')],
        ['blocked state', (r) => (r.status = 'BLOCKED')],
        ['ineligible', (r) => (r.nextWaveEligible = false)],
        ['scope inflated', (r) => r.counts.dimensionRows++],
        ['performance skipped', (r) => r.counts.performanceProfiles--],
        ['closure removed', (r) => r.closureInputs.pop()],
    ];
    test.each(mutations)('rejects measured %s even if report repeats it', (_name, mutate) => {
        const actual = measured();
        mutate(actual);
        const result = G.validateMeasuredReport(fixture(actual), actual);
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
    test.each([
        ['Agent PASS', (r: any) => (r.agentGate = 'PASS')],
        ['Gallery PASS', (r: any) => (r.independentGalleryGate = 'PASS')],
        ['project complete', (r: any) => (r.projectCompleted = true)],
        ['closure drift', (r: any) => (r.closureInputs[0].sha256 = '0'.repeat(64))],
        ['prior forge', (r: any) => (r.priorWave.validation.ok = false)],
    ])('rejects report %s', (_name, mutate) => {
        const actual = measured();
        const report = fixture(actual);
        (mutate as (r: any) => void)(report);
        expect(G.validateMeasuredReport(report, actual).ok).toBe(false);
    });
    test.each([null, undefined, [], 'invalid', 1])('malformed input is total: %p', (v) => {
        expect(G.validateMeasuredReport(v, measured()).ok).toBe(false);
        expect(G.validateMeasuredReport(fixture(measured()), v).ok).toBe(false);
    });
});
