/** NODE_CONTRACT fixtures; no browser execution or visual claims. */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const P = require('../../tools/verify/shaders-noise-dissolve-environment-performance.cjs');
const crypto = require('node:crypto');
function makeReport(): any {
    const id = P.collectorIdentity();
    const rows = ['chromium', 'firefox', 'webkit'].flatMap(browser => P.PROFILES.map((p: any) => {
        const refs = ['mesh', 'material', 'texture'].map(kind => ({ kind, before: 1, after: 0 }));
        const release = { samePromise: true, terminalError: 'E01_DISPOSED', result: {
            own: { refs, detached: true, nodeValid: false }, ownedBackgroundRefs: JSON.parse(JSON.stringify(refs)),
            effect: { before: 1, after: 0, registryDetached: true, validAfterClose: false },
            listeners: 0, controlsDisabled: true, instrumentsRestored: true, closed: true,
        } };
        const inventory = { passCount: 2, textureCount: 2, bufferCount: 2,
            textures: [{ id: 1, size: 1024 }, { id: 2, size: 1024 }], textureBytes: 2048,
            buffers: [{ id: 3, size: 80 }, { id: 4, size: 80 }], bufferBytes: 160 };
        const snapshot = { parameters: { ...P.PARAMETERS }, dpr: p.dpr,
            rect: { width: p.width, height: p.height }, backing: { width: p.width * p.dpr, height: p.height * p.dpr },
            canvasCount: 1, inventory, shaderCompiles: [{ status: true }], programLinks: [{ status: true }] };
        const run = { snapshot, samples: { cpuUpdateMs: Array(60).fill(.04), cpuEncodingMs: Array(60).fill(.05),
            cpuSubmissionMs: Array(60).fill(.01), cpuDrawDispatchMs: Array(60).fill(.02), frameMs: Array(60).fill(16),
            drawCalls: Array(60).fill(2), frameNumbers: Array.from({ length: 60 }, (_, i) => i + 30) } };
        const timestamp = { status: 'unavailable', reason: 'EXT_disjoint_timer_query_webgl2 absent in engine context' };
        const observation = P.buildObservation(run, timestamp, release.result); observation.profile = p.id;
        return { browser, browserVersion: 'NODE_CONTRACT', profile: { ...p }, caseId: p.id,
            status: 'PASS', method: 'REAL_BROWSER', pageErrors: [], consoleErrors: [], pageClosed: true,
            before: JSON.parse(JSON.stringify(snapshot)), observation, release,
            clockPrecision: { allRaw: [.02,.04], calibrationPositiveIncrements: 2, minimumPositiveIncrementMs: .02, crossOriginIsolated: true },
            environmentReceipt: { responseStatus: 200, deliveredHeaders: { coop: 'same-origin', coep: 'require-corp' },
                phases: ['after-navigation','after-viewport-repair'].map(id => ({ id, dpr: p.dpr, coi: true,
                    css: { w: p.width, h: p.height }, backing: { w: p.width * p.dpr, h: p.height * p.dpr } })), ok: true, errors: [] } };
    }));
    return { schemaVersion: 'noise-env-performance/1', identity: id, identityAfter: JSON.parse(JSON.stringify(id)), rows,
        cleanup: { proxyClosed: true, serverClosed: true, browsersClosed: true }, errors: [] };
}
test('accepts a complete deterministic baseline using the original E01 oracle', () => {
    const report = makeReport();
    for (const row of report.rows) expect(P.B.oracles().performance(row).errors).toEqual([]);
    expect(P.validateReport(report)).toEqual({ ok: true, errors: [] });
});
const mutations: [string, (r: any) => void][] = [
    ['scope missing', r => { r.rows.pop(); }], ['duplicate tuple', r => { r.rows[1] = r.rows[0]; }],
    ['DPR mismatch', r => { r.rows[2].environmentReceipt.phases[1].dpr = 1; }],
    ['missing headers', r => { delete r.rows[0].environmentReceipt.deliveredHeaders.coep; }],
    ['clock count', r => { r.rows[0].clockPrecision.calibrationPositiveIncrements++; }],
    ['clock NaN', r => { r.rows[0].clockPrecision.allRaw[0] = NaN; }],
    ['all zero CPU', r => { r.rows[0].observation.raw.run.samples.cpuDrawDispatchMs.fill(0); }],
    ['CPU array mismatch', r => { r.rows[0].observation.cpuEncodingMs = Array(60).fill(999); }],
    ['negative frame', r => { r.rows[0].observation.raw.run.samples.frameMs[0] = -1; }],
    ['unordered frame', r => { r.rows[0].observation.raw.run.samples.frameNumbers[1] = 1; }],
    ['actual backing', r => { r.rows[0].before.backing.height = 1; }],
    ['shader compile', r => { r.rows[0].before.shaderCompiles[0].status = false; }],
    ['unrestored instrumentation', r => { r.rows[0].release.result.instrumentsRestored = false; }],
    ['background ref', r => { r.rows[0].release.result.ownedBackgroundRefs[0].after = 1; }],
    ['effect registry', r => { r.rows[0].release.result.effect.registryDetached = false; }],
    ['live node', r => { r.rows[0].release.result.own.nodeValid = true; }],
    ['live listeners', r => { r.rows[0].release.result.listeners = 1; }],
    ['page close', r => { r.rows[0].pageClosed = false; }],
    ['proxy close', r => { r.cleanup.proxyClosed = false; }],
    ['page error', r => { r.rows[0].pageErrors.push('failure'); }],
    ['source drift', r => { r.identity.collector.sha256 = '0'.repeat(64); }],
    ['LIMITED', r => { r.rows[0].status = 'LIMITED'; }],
    ['GPU incomplete', r => { r.rows[0].observation.gpuTimestamp.status = 'measured'; }],
    ['VRAM mismatch', r => { r.rows[0].observation.vramEstimate.bytes = 1; }],
];
test.each(mutations)('rejects %s from an accepted baseline', (_name, mutate) => {
    const r = makeReport(); expect(P.validateReport(r).ok).toBe(true); mutate(r); expect(P.validateReport(r).ok).toBe(false);
});
test.each([null, undefined, [], 'x', {}, { schemaVersion: 'noise-env-performance/1', rows: {} }])('total malformed input (%p)', value => {
    expect(() => P.validateReport(value)).not.toThrow(); expect(P.validateReport(value).ok).toBe(false);
});
test('actual JSON/SHA checks reject unrelated files and preserve data failures', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noise-env-contract-'));
    try {
        const report = makeReport(); Object.assign(report, { authorization: 'CONTRACT', command: 'node tool --authorization=CONTRACT', cwd: path.resolve(__dirname, '../..'),
            startedAt: '2026-10-09T00:00:00.000Z', endedAt: '2026-10-09T00:00:01.000Z', subset: true, completed: false, waveGate: 'BLOCKED', agentGate: 'NOT_RUN',
            browsers: ['chromium','firefox','webkit'].map(engine => ({ engine, launched: true, connectedAfterClose: false })) });
        report.rawOutputs = report.rows.map((row: any) => {
            const file = path.join(tmp, `${row.browser}-${row.caseId}.json`), bytes = Buffer.from(JSON.stringify(P.rawPayload(row)));
            fs.writeFileSync(file, bytes); return { path: file.replace(/\\/g, '/'), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), browser: row.browser, caseId: row.caseId };
        });
        expect(P.validateFiles(report)).toEqual({ ok: true, errors: [] });
        const first = report.rawOutputs[0], bytes = Buffer.from('{}'); fs.writeFileSync(first.path, bytes);
        first.bytes = bytes.length; first.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        expect(P.validateFiles(report).errors.join('\n')).toMatch(/raw row binding/);
        report.rows[0].status = 'FAIL'; expect(P.validateFiles(report).ok).toBe(false);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
