/** NODE_CONTRACT only: deterministic shapes, not browser evidence. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const P = require('../../tools/verify/shaders-sparkle-environment-performance.cjs');
const { makeReport } = require('../fixtures/shaders-sparkle-performance-contract.cjs');
const crypto = require('node:crypto');
let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkle-env-contract-')); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
function withFiles() {
    const report = makeReport(P);
    Object.assign(report, { authorization: 'NODE_CONTRACT', command: 'node collector --authorization=NODE_CONTRACT',
        cwd: P.B.ROOT, startedAt: '2026-10-09T00:00:00.000Z', endedAt: '2026-10-09T00:00:01.000Z',
        subset: true, completed: false, agentGate: 'NOT_RUN', waveGate: 'BLOCKED',
        browsers: ['chromium', 'firefox', 'webkit'].map(engine => ({ engine, launched: true, connectedAfterClose: false })) });
    report.cleanup.serverCloseAcknowledged = true;
    report.rawOutputs = report.rows.map((row: any) => {
        const file = path.join(tmp, `${row.browser}-${row.caseId}.json`);
        const bytes = Buffer.from(JSON.stringify(P.rawPayload(row)));
        fs.writeFileSync(file, bytes);
        return { path: file, browser: row.browser, profileId: row.caseId, bytes: bytes.length,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    });
    return report;
}
it('accepts the complete deterministic baseline and original performance oracle', () => {
    const report = makeReport(P);
    for (const row of report.rows) expect(P.B.oracles().performance(row).errors).toEqual([]);
    expect(P.validateReport(report)).toEqual({ ok: true, errors: [] });
});
const mutations: [string, (r: any) => void, RegExp][] = [
    ['missing environment', r => { delete r.rows[0].environmentReceipt; }, /environmentReceipt/],
    ['wrong mobile DPR', r => { r.rows[2].environmentReceipt.phases[1].dpr = 1; }, /DPR/],
    ['wrong backing', r => { r.rows[2].environmentReceipt.phases[1].backing.h = 844; }, /backing/],
    ['wrong CSS', r => { r.rows[0].environmentReceipt.phases[1].css.w = 1; }, /css/],
    ['missing COEP', r => { delete r.rows[0].environmentReceipt.deliveredHeaders.coep; }, /COEP/],
    ['false environment flag', r => { r.rows[0].environmentReceipt.ok = false; }, /ok=false/],
    ['missing clock raw', r => { delete r.rows[0].clockPrecision.allRaw; }, /clock/],
    ['NaN clock', r => { r.rows[0].clockPrecision.allRaw[0] = NaN; }, /clock/],
    ['wrong clock count', r => { r.rows[0].clockPrecision.calibrationPositiveIncrements = 999; }, /clock count/],
    ['wrong clock min', r => { r.rows[0].clockPrecision.minimumPositiveIncrementMs = 999; }, /clock min/],
    ['wrong raw timing', r => { r.rows[0].observation.raw.draws[35].ms += 1; }, /timing/],
    ['all-zero dispatch', r => { const o = r.rows[0].observation; o.raw.draws.forEach((x: any) => { x.ms = 0; }); o.cpuSubmissionMs.fill(0); }, /nonzero/],
    ['NaN event timing', r => { r.rows[0].observation.raw.commands[40].ms = NaN; }, /timing/],
    ['wrong frame interval', r => { r.rows[0].observation.raw.frames[40].intervalMs = -1; }, /frame|duration|timing/],
    ['wrong measured viewport', r => { r.rows[0].observation.raw.viewport.dpr = 2; }, /viewport/],
    ['wrong actual parameters', r => { r.rows[0].observation.before.params.size = 100; }, /parameters/],
    ['shader failed', r => { r.rows[0].observation.before.shaderPasses[0].shaderCompiled = false; }, /shader/],
    ['missing release', r => { delete r.rows[0].release; }, /release/],
    ['refs retained', r => { r.rows[0].release.retirement.refs[0].after = 1; }, /release ref/],
    ['template retained', r => { r.rows[0].release.sharedTemplates[0].after = 1; }, /template/],
    ['listener retained', r => { r.rows[0].release.listenerRemoves = 0; }, /listener/],
    ['GPU query retained', r => { r.rows[0].observation.raw.queryTerminal.push({ frame: 1, deleted: false, aliveBefore: true }); }, /query/],
    ['missing page close', r => { delete r.rows[0].pageClosed; }, /page not closed/],
    ['missing proxy close', r => { r.cleanup.proxyClosed = false; }, /proxy/],
    ['missing browser close', r => { r.cleanup.browsersClosed = false; }, /browsers/],
    ['page error', r => { r.rows[0].pageErrors.push('failure'); }, /pageErrors/],
    ['duplicate tuple', r => { r.rows[1] = JSON.parse(JSON.stringify(r.rows[0])); }, /duplicate/],
    ['missing tuple', r => { r.rows.pop(); }, /rows|missing/],
    ['source drift', r => { r.identity.source[0].sha256 = '0'.repeat(64); }, /identity drift/],
    ['post collection drift', r => { r.identityAfter.runner[0].sha256 = '0'.repeat(64); }, /input drift/],
    ['LIMITED scope', r => { r.rows[0].status = 'LIMITED'; }, /status/],
];
it.each(mutations)('rejects %s from an accepted baseline', (_label, mutate, message) => {
    const report = makeReport(P);
    expect(P.validateReport(report).ok).toBe(true);
    mutate(report);
    const result = P.validateReport(report);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(message);
});
it('file validation accepts nine real temporary JSON files', () => {
    expect(P.validateFiles(withFiles())).toEqual({ ok: true, errors: [] });
});
it('file validation rejects missing raw paths', () => {
    expect(P.validateFiles(makeReport(P)).ok).toBe(false);
});
it('file validation rejects raw bytes/SHA tampering', () => {
    const report = withFiles(); expect(P.validateFiles(report).ok).toBe(true);
    fs.appendFileSync(report.rawOutputs[0].path, ' ');
    expect(P.validateFiles(report).errors.join('\n')).toMatch(/raw drift/);
});
it('matching SHA of unrelated JSON cannot prove row content', () => {
    const report = withFiles(); expect(P.validateFiles(report).ok).toBe(true);
    const artifact = report.rawOutputs[0], bytes = Buffer.from(JSON.stringify({ unrelated: true }));
    fs.writeFileSync(artifact.path, bytes); artifact.bytes = bytes.length;
    artifact.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    expect(P.validateFiles(report).errors.join('\n')).toMatch(/raw row content mismatch/);
});
it('file checks propagate data errors even if all files match', () => {
    const report = withFiles(); report.rows[0].status = 'FAIL';
    const result = P.validateFiles(report);
    expect(result.ok).toBe(false); expect(result.errors.join('\n')).toMatch(/status/);
});
it('rejects duplicate raw outputs', () => {
    const report = withFiles(); report.rawOutputs[1] = { ...report.rawOutputs[0] };
    expect(P.validateFiles(report).errors.join('\n')).toMatch(/duplicate raw/);
});
it('adaptation supports real measured GPU samples in steady frame order', () => {
    const row = makeReport(P).rows[0], raw = row.observation.raw;
    raw.timerAvailable = true;
    raw.gpuSamples = raw.frames.map((f: any) => ({ frame: f.frame, ms: .2, disjoint: false }));
    raw.queryTerminal = raw.frames.map((f: any) => ({ frame: f.frame, aliveBefore: true, deleted: true }));
    row.observation = P.buildObservation(raw, row.observation.before, row.clockPrecision, row.observation.after);
    expect(P.B.oracles().performance(row).errors).toEqual([]);
    expect(row.observation.gpuTimestamp.milliseconds).toEqual(Array(60).fill(.2));
    expect(row.observation.durationSeconds).toBe(.96);
    row.observation.raw.queryTerminal = [];
    expect(P.validateMeasurement(row, row.profile).join('\n')).toMatch(/GPU query retirement coverage/);
});
it.each([
    [], ['phase=performance'], ['--phase=performance', '--phase=performance'],
    ['--unknown=x'], ['--authorization='], ['--verify=a', '--out=b'],
    ['--phase=performance', '--browser=chromium', '--out=x', '--authorization=t'],
].map(args => [args]))('rejects malformed CLI arguments without starting a browser (%p)', args => {
    expect(() => P.parseArgs(args)).toThrow();
});
it('parses explicit collection and read-only verification modes', () => {
    expect(P.parseArgs(['--phase=performance', '--browser=all', '--authorization=t', '--out=x']).browser).toBe('all');
    expect(P.parseArgs(['--verify=x'])).toEqual({ verify: 'x' });
});
