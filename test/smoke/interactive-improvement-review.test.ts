/** Lead regressions for actual false-positive paths found during IER-S0 review. */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
const { buildBaseline, verifyBaseline } = require('../../tools/verify/interactive-improvement-baseline.cjs');
const { validateEvidence, makeSyntheticRecord } = require('../../tools/verify/interactive-improvement-evidence.cjs');

describe('IER baseline must distinguish file presence from executed evidence', () => {
    test('existing suite names cannot establish a tested-passed capability without execution evidence', () => {
        const baseline = buildBaseline();
        expect(baseline.capabilities.filter((c: any) => c.status === 'tested-passed')).toEqual([]);
    });
    test('historical module identity is the exact user-provided 64 digit SHA', () => {
        expect(buildBaseline().historicalDedup.taskDocModuleSha256)
            .toBe('f6836f6060ed00e4bd67f71056e1d15a9c9522fcfdd5ed67292387fad4085372');
    });
    test('prefilter and session release capabilities from section 1.2 are inventoried', () => {
        const text = JSON.stringify(buildBaseline().capabilities);
        for (const name of ['validateAirPrefilteredEnvironment', 'bindAirPrefilteredEnvironment', 'releaseScene'])
            expect(text).toContain(name);
    });
    test('flat SDK identity cannot contradict the correctly hashed artifact table', () => {
        const report = buildBaseline();
        report.sdkModuleSha256 = 'a'.repeat(64);
        expect(verifyBaseline(report).ok).toBe(false);
        const harnessReport = buildBaseline();
        const file = 'tools/verify/interactive-improvement-baseline.cjs';
        harnessReport.harnessIdentity[file].sha256 = 'b'.repeat(64);
        expect(verifyBaseline(harnessReport).ok).toBe(false);
    });
    test('changing an existing capability label cannot invent a passing execution', () => {
        const report = buildBaseline();
        report.capabilities[0].status = 'tested-passed';
        expect(verifyBaseline(report).ok).toBe(false);
    });
});

describe('IER evidence rejects the reviewed false PASS cases', () => {
    test('observed does not turn unknown fingerprints and missing PNG into PASS', () => {
        const record = makeSyntheticRecord({ sourceStatus: 'observed', result: 'PASS' });
        expect(validateEvidence(record).ok).toBe(false);
    });
    test('known app commit drift is rejected independently of SDK drift', () => {
        const record = makeSyntheticRecord({ appFingerprint: { commit: 'a'.repeat(40) } });
        expect(validateEvidence(record, { appCommit: 'b'.repeat(40) }).ok).toBe(false);
    });
    test('known harness SHA drift is rejected', () => {
        const record = makeSyntheticRecord({ harnessFingerprint: { sha256: 'a'.repeat(64) } });
        expect(validateEvidence(record, { harnessSha256: 'b'.repeat(64) }).ok).toBe(false);
    });
    test('arbitrary result cannot pass a contract validator', () => {
        expect(validateEvidence(makeSyntheticRecord({ result: 'BANANA' })).ok).toBe(false);
    });
    test.each([NaN, Infinity, -1])('invalid DPR %s is rejected rather than treated as an observation', (dpr) => {
        expect(validateEvidence(makeSyntheticRecord({ dpr })).ok).toBe(false);
    });
    test('known NULL observation is rejected; UNKNOWN must be explicit', () => {
        expect(validateEvidence(makeSyntheticRecord({ modelState: null })).ok).toBe(false);
    });
    test('hashing a PNG prefix does not prove it is a decodable screenshot', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ier-review-'));
        const pngPath = path.join(directory, 'truncated.png');
        const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        try {
            fs.writeFileSync(pngPath, bytes);
            const record = makeSyntheticRecord({
                pngPath, pngSha256: crypto.createHash('sha256').update(bytes).digest('hex'), pngBytes: bytes.length,
            });
            expect(validateEvidence(record).ok).toBe(false);
        } finally {
            fs.unlinkSync(pngPath);
            fs.rmdirSync(directory);
        }
    });
    test('unknown viewport/clock/events cannot establish visible PASS even if a screenshot path exists', () => {
        const record = makeSyntheticRecord({
            sourceStatus: 'recreated', result: 'PASS', pngPath: 'MISSING',
            viewport: 'UNKNOWN', observationTimestamp: 'UNKNOWN', receivedEvent: 'UNKNOWN',
        });
        expect(validateEvidence(record).ok).toBe(false);
    });
});
