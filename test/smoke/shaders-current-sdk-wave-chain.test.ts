// NODE_CONTRACT: synthetic metadata fixtures and real temporary OS-receipt files.
// The production validateWaveGate obtains its own assessment; this reducer never collects browsers.
import type {} from 'jest';
const C = require('../../tools/verify/shaders-current-sdk-wave-chain.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const clone = (v: any): any =>
    Array.isArray(v)
        ? v.map(clone)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))
          : v;
const fp = (p: string) => ({ path: p, bytes: 20, sha256: 'a'.repeat(64) });
describe('leaf scopes preserve effect-specific interaction evidence', () => {
    test('E08 counts exactly match its independent production reducer', () => {
        const G = require('../../tools/verify/shaders-cursor-trail-gate.cjs');
        const functional = {
            engines: Array.from({ length: 3 }, () => ({
                captures: [{ png: {} }, { png: {} }],
                boundaries: [1, 2],
                invalids: [1],
                resources: { rows: [1, 2, 3] },
                normal: { pointerPNG: {} },
                touch: { png: {} },
                resize: { png: {} },
            })),
        };
        const performance = { engines: Array.from({ length: 3 }, () => ({ performance: [1, 2, 3] })) };
        const actual = C.leafScope(
            C.WAVE3_LEAVES.find((l: any) => l.id === 'E08'),
            functional,
            performance,
        );
        expect(actual).toEqual(G.scopeOf(functional, performance));
        expect(JSON.stringify(actual)).toBe(JSON.stringify(G.scopeOf(functional, performance)));
        expect(actual.trustedPointerCases).toBe(3);
        expect(actual.trustedTouchCases).toBe(3);
        expect(actual.screenshots).toBe(15);
        const incomplete = clone(actual);
        delete incomplete.trustedTouchCases;
        expect(incomplete).not.toEqual(G.scopeOf(functional, performance));
    });
});
function fixture(waveId = 'wave2') {
    const wave = C.WAVES[waveId];
    const metadata = {
        effects: wave.leaves.map((l: any) => fp(l.newGate)),
        previousWave: fp(C.previousPath(waveId)),
        verifier: fp('tools/verify/shaders-' + waveId + '-gate.cjs'),
        scope: { effectCount: 3, dimensionRows: 54, measuredDimensions: 54, skippedDimensions: 0, visualCases: 117 },
        sdk: ['module', 'declarations', 'npm'].map(fp),
        screenshots: waveId === 'wave2' ? 132 : [fp('render.png')],
        screenshotCount: 132,
        actualAuditBindings: [fp('audit.json')],
        closureInputs: [fp('validator.cjs')],
    };
    const report = {
        ...clone(metadata),
        schemaVersion: wave.schema,
        task: waveId === 'wave2' ? 'Wave2' : 'Wave3',
        evaluatedAt: '2026-10-11T09:00:00Z',
        status: 'PASS',
        waveCompleted: true,
        nextWaveEligible: true,
        projectCompleted: false,
        agentGate: 'NOT_RUN',
        independentGalleryGate: 'NOT_RUN',
        subset: true,
        completed: false,
    };
    const actual = {
        ...clone(metadata),
        validation: { ok: true },
        previousValidation: { ok: true },
        leafResults: [{ ok: true }, { ok: true }, { ok: true }],
        intervals: Array.from({ length: 6 }, (_, i) => ({ start: 100 + i * 20, end: 110 + i * 20 })),
    };
    return { report, actual };
}
describe('current-SDK wave metadata isolates genuine measured scope', () => {
    test.each(['wave2', 'wave3'])('accepts the complete %s NODE_CONTRACT metadata baseline', (waveId) => {
        const { report, actual } = fixture(waveId);
        expect(C.validateWaveMetadata(waveId, report, actual)).toEqual({ ok: true, errors: [] });
    });
    test.each([
        ['missing leaf', (r: any) => r.effects.pop()],
        ['duplicate leaf', (r: any) => (r.effects[0] = r.effects[1])],
        ['leaf SHA', (r: any) => (r.effects[0].sha256 = '0'.repeat(64))],
        ['predecessor SHA', (r: any) => (r.previousWave.sha256 = '0'.repeat(64))],
        [
            'historical predecessor',
            (r: any) => (r.previousWave.path = 'docs/evidence/shaders-absorption/wave1-r21-current-gate.json'),
        ],
        ['SDK drift', (r: any) => r.sdk.pop()],
        ['scope inflation', (r: any) => r.scope.visualCases++],
        ['unmeasured dimension', (r: any) => (r.scope.skippedDimensions = 1)],
        ['PNG scope', (r: any) => r.screenshotCount++],
        ['verifier drift', (r: any) => r.verifier.bytes++],
        ['audit drift', (r: any) => (r.actualAuditBindings = [])],
        ['closure drift', (r: any) => (r.closureInputs = [])],
        ['Agent PASS', (r: any) => (r.agentGate = 'PASS')],
        ['Gallery PASS', (r: any) => (r.independentGalleryGate = 'PASS')],
        ['project complete', (r: any) => (r.projectCompleted = true)],
        ['subset complete', (r: any) => (r.completed = true)],
        ['wave status forged', (r: any) => (r.status = 'FAIL')],
        ['eligibility forged', (r: any) => (r.nextWaveEligible = false)],
        ['invalid timestamp', (r: any) => (r.evaluatedAt = 'invalid')],
    ])('rejects %s starting from a passing metadata fixture', (_label, mutate) => {
        const { report, actual } = fixture();
        expect(C.validateWaveMetadata('wave2', report, actual).ok).toBe(true);
        mutate(report);
        expect(C.validateWaveMetadata('wave2', report, actual).ok).toBe(false);
    });
    test.each([
        ['prior failed', (a: any) => (a.previousValidation.ok = false)],
        ['leaf failed', (a: any) => (a.leafResults[1].ok = false)],
        ['production failed', (a: any) => (a.validation.ok = false)],
        ['missing OS window', (a: any) => a.intervals.pop()],
        ['overlapping OS windows', (a: any) => (a.intervals[1].start = a.intervals[0].start)],
        ['invalid OS time', (a: any) => (a.intervals[0].end = NaN)],
    ])('does not upgrade %s despite declared PASS', (_label, mutate) => {
        const { report, actual } = fixture();
        mutate(actual);
        expect(C.validateWaveMetadata('wave2', report, actual).ok).toBe(false);
    });
});
describe('leaf metadata never inherits historical statements', () => {
    const make = () => {
        const actual = {
            counts: { visualCases: 39 },
            sdk: [fp('sdk')],
            validatorInputs: { inputs: [fp('source')] },
            verifier: fp('gate.cjs'),
            audit: fp('audit.json'),
            screenshots: [fp('render.png')],
            validation: { ok: true },
        };
        const gate = {
            ...clone(actual),
            schemaVersion: C.WAVE2_LEAVES[0].gateSchema,
            task: 'Wave2/E03',
            status: 'PASS',
            agentGate: 'NOT_RUN',
            subset: true,
            completed: false,
            gates: Object.fromEntries(
                ['Build', 'Runtime', 'Visual', 'Boundary', 'Resource', 'Performance'].map((name) => [
                    name,
                    { status: 'PASS', ...(name === 'Visual' ? { screenshots: clone(actual.screenshots) } : {}) },
                ]),
            ),
        };
        return { gate, actual };
    };
    test('accepts a complete leaf NODE_CONTRACT fixture', () => {
        const { gate, actual } = make();
        expect(C.validateLeafMetadata(C.WAVE2_LEAVES[0], gate, actual)).toEqual({ ok: true, errors: [] });
    });
    test.each([
        ['wrong effect', (g: any) => (g.task = 'Wave2/E04')],
        ['missing Build', (g: any) => delete g.gates.Build],
        ['scope inflation', (g: any) => g.counts.visualCases++],
        ['wrong PNG', (g: any) => (g.gates.Visual.screenshots = [])],
        ['SDK drift', (g: any) => (g.sdk = [])],
        ['closure drift', (g: any) => (g.validatorInputs = {})],
        ['audit drift', (g: any) => (g.audit.sha256 = '0'.repeat(64))],
        ['Agent forged', (g: any) => (g.agentGate = 'PASS')],
    ])('rejects %s from an accepted leaf baseline', (_label, mutate) => {
        const { gate, actual } = make();
        expect(C.validateLeafMetadata(C.WAVE2_LEAVES[0], gate, actual).ok).toBe(true);
        mutate(gate);
        expect(C.validateLeafMetadata(C.WAVE2_LEAVES[0], gate, actual).ok).toBe(false);
    });
});
describe('natural OS receipts are read from actual temporary files', () => {
    let temp = '';
    beforeAll(() => {
        temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-wave-receipt-'));
    });
    afterAll(() => {
        if (path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep))
            fs.rmSync(temp, { recursive: true, force: true });
    });
    const good = () => ({
        command: [
            process.execPath,
            'tools/verify/test.cjs',
            '--phase=functional',
            '--browser=all',
            '--out=output/test.json',
        ],
        output: 'output/test.json',
        log: 'output/test.log',
        cwd: process.cwd(),
        startedAt: '2026-10-11T09:00:00Z',
        endedAt: '2026-10-11T09:01:00Z',
        exitCode: 0,
        signal: null,
        error: null,
        inputsUnchanged: true,
    });
    const check = (v: any) => {
        const p = path.join(temp, 'os.json');
        fs.writeFileSync(p, JSON.stringify(v));
        return C.validateOSReceipt(p, 'output/test.json');
    };
    test('accepts real file contents with natural exit and bound command', () => expect(check(good())).toEqual([]));
    test.each([
        ['nonzero exit', (r: any) => (r.exitCode = 1)],
        ['signal', (r: any) => (r.signal = 'SIGTERM')],
        ['missing signal', (r: any) => delete r.signal],
        ['error', (r: any) => (r.error = 'spawn failed')],
        ['missing error', (r: any) => delete r.error],
        ['drift', (r: any) => (r.inputsUnchanged = false)],
        ['wrong output', (r: any) => (r.output = 'other.json')],
        ['missing log', (r: any) => delete r.log],
        ['wrong cwd', (r: any) => (r.cwd = 'C:/elsewhere')],
        ['command malformed', (r: any) => (r.command = {})],
        ['wrong --out', (r: any) => r.command.pop()],
        ['reversed times', (r: any) => (r.endedAt = r.startedAt)],
    ])('rejects %s from a valid OS file', (_label, mutate) => {
        const data = good();
        expect(check(data)).toEqual([]);
        mutate(data);
        expect(check(data).length).toBeGreaterThan(0);
    });
    test.each([null, [], 'x', 3])('returns structured errors for malformed OS JSON %#', (v) =>
        expect(check(v).length).toBeGreaterThan(0),
    );
});
describe('public wave validation remains total without artifacts', () => {
    test.each([null, undefined, [], 'x', 3])('rejects malformed report %# without throwing', (v) => {
        expect(C.validateWaveGate('wave2', v).ok).toBe(false);
        expect(C.validateLeafGate(C.WAVE2_LEAVES[0], v).ok).toBe(false);
    });
    test('keeps exact leaves and avoids collector frozen-path collision', () => {
        expect(C.WAVE2_LEAVES.map((l: any) => l.id)).toEqual(['E03', 'E04', 'E05']);
        expect(C.WAVE3_LEAVES.map((l: any) => l.id)).toEqual(['E07', 'E08', 'E09']);
        expect(C.expectedArtifacts('prefix', 'E03', 'functional').frozen).toBe(
            'prefix-e03-functional-driver-frozen.json',
        );
    });
});
