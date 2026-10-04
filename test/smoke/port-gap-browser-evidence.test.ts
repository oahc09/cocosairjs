const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { normalizeBrowserEvidence } = require('../../tools/verify/port-gap-browser-evidence.cjs');

describe('Browser evidence normalization preserves execution limits', () => {
    let root: string;
    const options = () => ({ root, input: 'native.json', log: 'raw.log', gate: 'EG3', evidenceType: 'BROWSER_RENDER_PASS', exitCode: 0 });
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-browser-evidence-'));
        fs.writeFileSync(path.join(root, 'cocosair.module.js'), 'runtime');
        const digest = crypto.createHash('sha256').update('runtime').digest('hex');
        fs.writeFileSync(path.join(root, 'raw.log'), 'Actual fixture output');
        fs.writeFileSync(path.join(root, 'native.json'), JSON.stringify({
            command: ['node', 'fixture.cjs'], cwd: root, startedAt: '2026-10-04T00:00:00Z', endedAt: '2026-10-04T00:00:01Z',
            scopePassed: true, completed: true, fingerprints: { 'cocosair.module.js': digest },
            results: [{ engine: 'chromium', status: 'PASS', version: '149' }],
        }));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
    test('does not promote native completed marker to a full gate', () => {
        const result = normalizeBrowserEvidence(options());
        expect(result.scope).toMatchObject({ subset: true, completed: false, totalCases: 1, measuredCases: 1 });
        expect(result.execution.command).toBe('node fixture.cjs');
        expect(result.measurements.gpuMemory.available).toBe(false);
        expect(result.fingerprints.source.status).toBe('NOT_RUN');
    });
    test('rejects same-name candidate with different bytes', () => {
        fs.writeFileSync(path.join(root, 'cocosair.module.js'), 'changed');
        expect(() => normalizeBrowserEvidence(options())).toThrow('Evidence drift');
    });
    test('rejects an unobserved or contradictory exit code', () => {
        expect(() => normalizeBrowserEvidence({ ...options(), exitCode: undefined })).toThrow('exitCode');
        expect(() => normalizeBrowserEvidence({ ...options(), exitCode: 1 })).toThrow('verdict disagree');
    });
    test('rejects missing original logs rather than creating substitute output', () => {
        fs.unlinkSync(path.join(root, 'raw.log'));
        expect(() => normalizeBrowserEvidence(options())).toThrow('log is missing');
    });
    test('retains FAIL and NOT_RUN browser rows without dropping scope', () => {
        const nativePath = path.join(root, 'native.json');
        const input = JSON.parse(fs.readFileSync(nativePath, 'utf8'));
        input.scopePassed = false;
        input.results[0].status = 'FAIL';
        input.results.push({ engine: 'webkit', status: 'NOT_RUN', reason: 'Launch unavailable' });
        fs.writeFileSync(nativePath, JSON.stringify(input));
        const report = normalizeBrowserEvidence({ ...options(), exitCode: 1, failureStage: 'environment' });
        expect(report.execution.status).toBe('FAIL');
        expect(report.failureStage).toBe('environment');
        expect(report.scope).toMatchObject({ totalCases: 2, measuredCases: 1, skippedCases: 1, completed: false });
    });
});
