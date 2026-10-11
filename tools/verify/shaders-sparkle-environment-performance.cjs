'use strict';
// E06 Sparkle environment-aware performance collector (R6C).
// B = real shaders-sparkle-browser.cjs module; helpers = frozen shaders-browser-environment.cjs.
// buildObservation adapts stopPerformance raw data into the exact shape B.oracles().performance reads.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');

const B = require('./shaders-sparkle-browser.cjs');
const HELPER = require('./shaders-browser-environment.cjs');
const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
const HELPER_PATH = 'tools/verify/shaders-browser-environment.cjs';
const COLLECTOR_PATH = 'tools/verify/shaders-sparkle-environment-performance.cjs';
const C = require('./shaders-effect-contract.cjs');
const O = require('./shaders-sparkle-oracle.cjs');
const ENGINES = ['chromium', 'firefox', 'webkit'];
const PARAMETERS = Object.freeze({
    ...Object.fromEntries(Object.entries(O.definition.params).map(([key, d]) => [key, d.defaultValue])),
    size: 70,
    intensity: 0.45,
    colorize: 0.35,
});
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const safe = (value) => Number.isSafeInteger(value) && value >= 0;
const equal = (a, b) => C.canonical(a) === C.canonical(b);

function fileIdentity(relPath) {
    const abs = path.resolve(ROOT, relPath);
    const b = fs.readFileSync(abs);
    return {
        path: relPath.replace(/\\/g, '/'),
        bytes: b.length,
        sha256: crypto.createHash('sha256').update(b).digest('hex'),
    };
}

function collectorIdentity() {
    try {
        const base = B.currentIdentity();
        const extra = [
            COLLECTOR_PATH,
            HELPER_PATH,
            'tools/verify/shaders-browser-launch.cjs',
            'examples/shared/shader-lifecycle.ts',
            'examples/shared/asset-lifecycle.js',
            'examples/shared/asset-lifecycle.d.ts',
        ].map(fileIdentity);
        return { source: base.source, sdk: base.sdk, runner: [...base.runner, ...extra], reference: base.reference };
    } catch (e) {
        return {
            error: `identity read failure: ${String(e.message).split('\n')[0]}`,
            source: null,
            sdk: null,
            runner: null,
            reference: null,
        };
    }
}

/** Pure: adapt stopPerformance raw metrics + before-snapshot + clock into the observation
 *  shape that B.oracles().performance reads (o.raw.frames, o.cpuUpdateMs, etc.). */
function buildObservation(raw, before, clockPrecision, after = before) {
    const WARMUP = B.WARMUP,
        SAMPLES = B.SAMPLES;
    const steady = raw.frames.slice(WARMUP, WARMUP + SAMPLES);
    const sum = (xs, frame) => xs.filter((x) => x.frame === frame).reduce((n, x) => n + x.ms, 0);
    return {
        raw: JSON.parse(JSON.stringify(raw)),
        warmupFrames: WARMUP,
        frameCount: steady.length,
        steadyFrameIds: steady.map((f) => f.frame),
        durationSeconds: steady.reduce((total, f) => total + f.intervalMs, 0) / 1000,
        cpuUpdateMs: steady.map((f) => sum(raw.updateCalls, f.frame)),
        cpuEncodingMs: steady.map((f) => sum(raw.commands, f.frame)),
        cpuSubmissionMs: steady.map((f) => sum(raw.draws, f.frame)),
        frameMs: steady.map((f) => f.intervalMs),
        queueBookkeepingMs: steady.map((f) => sum(raw.queueBookkeeping, f.frame)),
        drawCalls: Math.max(...steady.map((f) => f.drawCalls)),
        passCount: Math.max(
            ...steady.map(
                (f) => raw.commands.filter((c) => c.frame === f.frame && c.operation === 'beginRenderPass').length,
            ),
        ),
        textureCount: after.counters.texture,
        bufferCount: after.counters.buffer,
        materialPassCount: after.shaderPasses.length,
        gpuTimestamp: raw.timerAvailable
            ? {
                  status: 'measured',
                  extension: 'EXT_disjoint_timer_query_webgl2',
                  milliseconds: steady.map((f) => raw.gpuSamples.find((q) => q.frame === f.frame)?.ms ?? null),
                  disjoint: steady.some(
                      (f) =>
                          !raw.gpuSamples.find((q) => q.frame === f.frame) ||
                          raw.gpuSamples.find((q) => q.frame === f.frame).disjoint,
                  ),
              }
            : {
                  status: 'unavailable',
                  reason: 'Actual getExtension returned null; no GPU time inferred from CPU dispatch.',
              },
        measurementMethod:
            'Original Component.update CPU wall time; native gfx method encoding envelope includes immediate GL dispatch; GL draw CPU submission wall time; Queue.submit bookkeeping separate. Native AFTER_DRAW intervals are not compositor present. 30 warmup then 60 steady frames; no capture during timed window.',
        vramEstimate: {
            bytes: 65676,
            formula: '128*128*RGBA8 + 4*(3+2)*float32 + 6*uint16 + 3*vec4 float32',
            method: 'analytical owned effect bytes; excludes swapchain, driver and shared caches',
        },
        gpuPhysicalMemory: {
            status: 'unavailable',
            reason: 'Browser logical counters do not expose physical resident GPU memory.',
        },
        ownedLogicalBytes: { before: before.memory, after: after.memory },
        clockPrecision,
        before,
        after,
    };
}

// ── Pure clock stats: ANY non-finite or non-positive input rejects the whole array ──
function recomputeClockStats(positives) {
    if (!Array.isArray(positives) || positives.length === 0) return { ok: false, reason: 'missing or empty positives' };
    for (let i = 0; i < positives.length; i++) {
        if (typeof positives[i] !== 'number' || !Number.isFinite(positives[i]) || positives[i] <= 0) {
            return { ok: false, reason: `invalid increment at index ${i}: ${positives[i]}` };
        }
    }
    return {
        ok: true,
        min: Math.min(...positives),
        count: positives.length,
        total: positives.reduce((a, v) => a + v, 0),
    };
}

function validateEnvironmentReceiptRow(receipt, profile) {
    if (!profile || !B.PROFILES.some((p) => equal(p, profile)))
        return { ok: false, errors: ['unknown frozen profile'] };
    return HELPER.validateEnvironmentReceipt(receipt, {
        viewport: { width: profile.width, height: profile.height },
        dpr: profile.dpr,
        backing: { w: profile.width * profile.dpr, h: profile.height * profile.dpr },
        crossOriginIsolated: true,
        headers: { coop: 'same-origin', coep: 'require-corp' },
    });
}

function validateMeasurement(row, profile) {
    const errors = [],
        o = row.observation,
        raw = o?.raw;
    if (!raw) return ['missing raw measurement'];
    for (const name of [
        'frames',
        'updateCalls',
        'commands',
        'draws',
        'queueBookkeeping',
        'gpuSamples',
        'queryTerminal',
        'pageErrors',
        'consoleErrors',
    ]) {
        if (!Array.isArray(raw[name])) errors.push('raw array missing: ' + name);
    }
    if (errors.length) return errors;
    if (raw.frames.length < B.WARMUP + B.SAMPLES) errors.push('insufficient native frames');
    for (let i = 0; i < raw.frames.length; i++) {
        const f = raw.frames[i];
        if (
            !f ||
            !safe(f.frame) ||
            !finite(f.intervalMs) ||
            f.intervalMs <= 0 ||
            !safe(f.drawCalls) ||
            (i && f.frame <= raw.frames[i - 1].frame)
        )
            errors.push('invalid native frame');
    }
    for (const name of ['updateCalls', 'commands', 'draws', 'queueBookkeeping']) {
        if (raw[name].some((x) => !x || !safe(x.frame) || !finite(x.ms) || x.ms < 0))
            errors.push('invalid raw timing: ' + name);
    }
    if (typeof raw.timerAvailable !== 'boolean') errors.push('timer availability missing');
    if (
        raw.gpuSamples.some(
            (q) => !q || !safe(q.frame) || !finite(q.ms) || q.ms <= 0 || typeof q.disjoint !== 'boolean',
        )
    )
        errors.push('invalid GPU sample');
    if (raw.queryTerminal.some((q) => !q || !safe(q.frame) || q.aliveBefore !== true || q.deleted !== true))
        errors.push('invalid query retirement');
    if (raw.timerAvailable) {
        const terminalFrames = new Set(raw.queryTerminal.map((q) => q.frame));
        if (
            terminalFrames.size !== raw.queryTerminal.length ||
            raw.frames.some((f) => !terminalFrames.has(f.frame)) ||
            raw.gpuSamples.some((q) => !terminalFrames.has(q.frame))
        )
            errors.push('missing/duplicate GPU query retirement coverage');
        if (new Set(raw.gpuSamples.map((q) => q.frame)).size !== raw.gpuSamples.length)
            errors.push('duplicate GPU samples');
    } else if (raw.queryTerminal.length || raw.gpuSamples.length) errors.push('GPU samples despite unavailable timer');
    const f = raw.frames.slice(B.WARMUP, B.WARMUP + B.SAMPLES);
    if (
        !equal(
            o.steadyFrameIds,
            f.map((x) => x.frame),
        )
    )
        errors.push('steady frame identity mismatch');
    const seconds = f.reduce((n, x) => n + x.intervalMs, 0) / 1000;
    if (!finite(o.durationSeconds) || Math.abs(o.durationSeconds - seconds) > 1e-9)
        errors.push('steady duration mismatch');
    for (const key of ['cpuUpdateMs', 'cpuEncodingMs', 'cpuSubmissionMs', 'frameMs']) {
        if (!Array.isArray(o[key]) || o[key].length !== B.SAMPLES || o[key].some((n) => !finite(n) || n < 0))
            errors.push('invalid timing array: ' + key);
    }
    if (o.drawCalls !== Math.max(...f.map((x) => x.drawCalls))) errors.push('draw call aggregate mismatch');
    const viewport = {
        width: profile.width,
        height: profile.height,
        dpr: profile.dpr,
        backing: { width: profile.width * profile.dpr, height: profile.height * profile.dpr },
    };
    if (!equal(raw.viewport, viewport)) errors.push('actual measured viewport mismatch');
    for (const [name, snapshot] of [
        ['before', o.before],
        ['after', o.after],
    ]) {
        if (
            !snapshot ||
            !equal(snapshot.params, PARAMETERS) ||
            snapshot.inputKind !== 'bright-region' ||
            !safe(snapshot.frame)
        )
            errors.push(name + ' actual parameters/frame mismatch');
        if (
            !snapshot ||
            snapshot.canvas?.width !== viewport.backing.width ||
            snapshot.canvas?.height !== viewport.backing.height ||
            snapshot.canvas?.css?.width !== profile.width ||
            snapshot.canvas?.css?.height !== profile.height ||
            snapshot.oneCanvas !== 1
        )
            errors.push(name + ' actual canvas mismatch');
        if (
            !snapshot ||
            !Array.isArray(snapshot.shaderPasses) ||
            snapshot.shaderPasses.length !== 1 ||
            snapshot.shaderPasses.some((p) => p.shaderCompiled !== true)
        )
            errors.push(name + ' shader not compiled');
        if (snapshot?.counters?.texture !== 1 || !safe(snapshot?.counters?.buffer) || snapshot.counters.buffer < 3)
            errors.push(name + ' actual resource counts');
    }
    if (o.before?.time !== 0 || (safe(o.before?.frame) && safe(o.after?.frame) && o.after.frame <= o.before.frame))
        errors.push('simulation timing mismatch');
    if (o.textureCount !== o.after?.counters?.texture || o.bufferCount !== o.after?.counters?.buffer)
        errors.push('snapshot resource aggregate mismatch');
    if (!equal(raw.pageErrors, row.pageErrors) || !equal(raw.consoleErrors, row.consoleErrors))
        errors.push('raw error arrays mismatch');
    if (!equal(raw.release, row.release)) errors.push('raw release mismatch');
    if (!equal(o.clockPrecision, row.clockPrecision)) errors.push('clock copy mismatch');
    return errors;
}

// ── Report validation: total, strict, full measurement contract ──
function validateReport(report) {
    const errors = [];
    try {
        if (!report || typeof report !== 'object' || Array.isArray(report)) {
            return { ok: false, errors: ['report must be a non-null non-array object'] };
        }
        if (report.schemaVersion !== 'sparkle-env-performance/1') return { ok: false, errors: ['schema'] };
        const current = collectorIdentity();
        if (current.error) return { ok: false, errors: [`identity: ${current.error}`] };
        if (JSON.stringify(report.identity) !== JSON.stringify(current)) errors.push('identity drift');
        if (!Array.isArray(report.rows))
            return { ok: false, errors: [`rows must be an array, got ${typeof report.rows}`] };
        if (report.rows.length !== 9) errors.push(`expected 9 rows, got ${report.rows.length}`);
        const seen = new Set();
        for (const row of report.rows) {
            if (!row || typeof row !== 'object') {
                errors.push('null/invalid row');
                continue;
            }
            const tag = `${row.browser}/${row.profile?.id}`;
            if (seen.has(tag)) errors.push(`duplicate tuple ${tag}`);
            seen.add(tag);
            const frozen = B.PROFILES.find((p) => p.id === row.profile?.id);
            if (!frozen) {
                errors.push(`${tag}:unknown profile`);
                continue;
            }
            if (
                row.profile.width !== frozen.width ||
                row.profile.height !== frozen.height ||
                row.profile.dpr !== frozen.dpr
            ) {
                errors.push(`${tag}:profile dimensions mismatch`);
            }
            // Status must be exactly 'PASS' for scope pass; FAIL/undefined/other all reject
            if (row.status !== 'PASS') errors.push(`${tag}:status=${row.status} (must be PASS)`);
            if (
                !ENGINES.includes(row.browser) ||
                typeof row.browserVersion !== 'string' ||
                !row.browserVersion.trim() ||
                row.method !== 'REAL_BROWSER' ||
                row.caseId !== frozen.id
            )
                errors.push(`${tag}:execution identity/method mismatch`);

            // Environment
            if (!row.environmentReceipt) errors.push(`${tag}:missing environmentReceipt`);
            else {
                const env = validateEnvironmentReceiptRow(row.environmentReceipt, frozen);
                if (!env.ok) errors.push(...env.errors.map((e) => `${tag}:env:${e}`));
            }

            // Clock: strict, no filtering, count must match, COI must be true
            const clock = row.clockPrecision;
            if (!clock || !Array.isArray(clock.allRaw)) errors.push(`${tag}:missing clock allRaw`);
            else {
                if (clock.allRaw.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
                    errors.push(`${tag}:clock non-finite`);
                const stats = recomputeClockStats(clock.allRaw);
                if (!stats.ok) errors.push(`${tag}:clock:${stats.reason}`);
                else {
                    if (
                        !Number.isFinite(clock.minimumPositiveIncrementMs) ||
                        Math.abs(clock.minimumPositiveIncrementMs - stats.min) > 1e-9
                    ) {
                        errors.push(`${tag}:clock min mismatch`);
                    }
                    if (clock.calibrationPositiveIncrements !== stats.count) {
                        errors.push(
                            `${tag}:clock count reported=${clock.calibrationPositiveIncrements} actual=${stats.count}`,
                        );
                    }
                }
                if (clock.crossOriginIsolated !== true) errors.push(`${tag}:clock COI not true`);
            }

            // Page/console errors: must exist as empty arrays
            if (!Array.isArray(row.pageErrors) || row.pageErrors.length > 0) errors.push(`${tag}:pageErrors`);
            if (!Array.isArray(row.consoleErrors) || row.consoleErrors.length > 0) errors.push(`${tag}:consoleErrors`);

            // Measured performance: observation required, oracle invoked
            const obs = row.observation;
            if (!obs || typeof obs !== 'object') errors.push(`${tag}:missing observation`);
            else {
                try {
                    errors.push(...validateMeasurement(row, frozen).map((e) => `${tag}:${e}`));
                    const oracleResult = B.oracles().performance(row);
                    if (oracleResult.errors.length > 0) errors.push(`${tag}:oracle:${oracleResult.errors.join(';')}`);
                } catch (oracleError) {
                    errors.push(`${tag}:oracle threw:${String(oracleError).slice(0, 100)}`);
                }
            }

            // Release: nested retirement + sharedTemplates + receipt + listeners
            const rel = row.release;
            if (!rel || typeof rel !== 'object') errors.push(`${tag}:missing release`);
            else {
                // Refs: before must be exactly 1, after must be 0
                const refs = rel.retirement?.refs;
                if (!Array.isArray(refs) || refs.length !== 3)
                    errors.push(`${tag}:release refs must cover three owned assets`);
                else
                    for (const ref of refs) {
                        if (!ref || ref.before !== 1 || ref.after !== 0)
                            errors.push(`${tag}:release ref before=${ref?.before} after=${ref?.after}`);
                    }
                if (rel.refs && !equal(rel.refs, refs)) errors.push(`${tag}:contradictory release refs`);
                // Renderer/node
                const retired = rel.retirement?.rendererUnbound;
                if (retired !== true) errors.push(`${tag}:renderer not retired`);
                const nodeRemoved = rel.retirement?.nodeRemoved;
                if (nodeRemoved !== true) errors.push(`${tag}:node not removed`);
                // Listeners: adds must equal removes
                if (!safe(rel.listenerAdds) || rel.listenerAdds < 3 || rel.listenerAdds !== rel.listenerRemoves)
                    errors.push(`${tag}:listener adds=${rel.listenerAdds} removes=${rel.listenerRemoves}`);
                // Shared templates
                if (
                    Array.isArray(rel.sharedTemplates) &&
                    rel.sharedTemplates.length === 2 &&
                    new Set(rel.sharedTemplates.map((t) => t?.name)).size === 2
                ) {
                    for (const tmpl of rel.sharedTemplates) {
                        if (
                            !tmpl ||
                            !['air-e06-sparkle-zero', 'air-e06-sparkle-expanded'].includes(tmpl.name) ||
                            tmpl.before !== 1 ||
                            tmpl.after !== 0 ||
                            tmpl.registryRemoved !== true ||
                            tmpl.validAfterClose !== false
                        )
                            errors.push(`${tag}:template ${tmpl?.name} retained`);
                    }
                } else errors.push(`${tag}:shared template observations missing`);
                // Receipt
                if (!rel.receipt || rel.receipt.status !== 'released')
                    errors.push(`${tag}:receipt status=${rel.receipt?.status}`);
                if (!Array.isArray(rel.receipt?.pending) || rel.receipt.pending.length > 0)
                    errors.push(`${tag}:receipt pending missing/non-empty`);
                if (!Array.isArray(rel.receipt?.failures) || rel.receipt.failures.length > 0)
                    errors.push(`${tag}:receipt failures missing/non-empty`);
                // Scene cleared
                if (rel.sceneCleared !== true) errors.push(`${tag}:scene not cleared`);
                if (rel.releaseIdentity !== true) errors.push(`${tag}:release promise identity mismatch`);
            }

            // Page closure
            if (row.pageClosed !== true) errors.push(`${tag}:page not closed`);
            if (Array.isArray(row.failures) && row.failures.length) errors.push(`${tag}:collection failures`);
        }
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            for (const p of B.PROFILES) if (!seen.has(`${engine}/${p.id}`)) errors.push(`missing ${engine}/${p.id}`);
        }
        if (report.cleanup?.proxyClosed !== true) errors.push('proxy not closed');
        if (report.cleanup?.serverClosed !== true) errors.push('server not closed');
        if (report.cleanup?.browsersClosed !== true) errors.push('browsers not closed');
        if (Array.isArray(report.errors) && report.errors.length) errors.push('collection errors');
        if (report.identityAfter && !equal(report.identityAfter, report.identity))
            errors.push('input drift after collection');
        return { ok: errors.length === 0, errors };
    } catch (e) {
        return { ok: false, errors: [`validator crash: ${String(e.message).split('\n')[0]}`] };
    }
}

// ── validateFiles: data gate + raw path/SHA verification (always checks both) ──
function validateFiles(report) {
    const dataErrors = [];
    let rawErrors = [];
    try {
        const base = validateReport(report);
        dataErrors.push(...base.errors);
    } catch (e) {
        dataErrors.push(`data validation crash: ${String(e)}`);
    }
    try {
        if (report && typeof report === 'object' && Array.isArray(report.rawOutputs)) {
            if (
                typeof report.authorization !== 'string' ||
                !report.authorization.trim() ||
                typeof report.command !== 'string' ||
                !report.command.includes('--authorization=' + report.authorization) ||
                report.cwd !== ROOT
            )
                rawErrors.push('collection authorization/command/cwd missing');
            const start = Date.parse(report.startedAt),
                end = Date.parse(report.endedAt);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
                rawErrors.push('collection timestamps invalid');
            if (
                report.subset !== true ||
                report.completed !== false ||
                report.agentGate !== 'NOT_RUN' ||
                report.waveGate !== 'BLOCKED'
            )
                rawErrors.push('scope markers invalid');
            if (!report.identityAfter || !equal(report.identityAfter, report.identity))
                rawErrors.push('post collection identity missing/drift');
            if (
                !Array.isArray(report.browsers) ||
                report.browsers.length !== 3 ||
                new Set(report.browsers.map((b) => b?.engine)).size !== 3 ||
                report.browsers.some(
                    (b) => !ENGINES.includes(b?.engine) || b.launched !== true || b.connectedAfterClose !== false,
                )
            )
                rawErrors.push('browser terminal observations invalid');
            if (report.cleanup?.serverCloseAcknowledged !== true)
                rawErrors.push('server close acknowledgement missing');
            if (report.scopePassed !== undefined && report.scopePassed !== (dataErrors.length === 0))
                rawErrors.push('scopePassed contradicts data validation');
            if (report.rawOutputs.length !== 9)
                rawErrors.push(`rawOutputs must be exactly 9, got ${report.rawOutputs.length}`);
            const tuples = new Set(),
                paths = new Set();
            for (const raw of report.rawOutputs) {
                if (!raw?.path || !raw?.sha256) {
                    rawErrors.push('raw output missing path/sha');
                    continue;
                }
                try {
                    const tuple = `${raw.browser}/${raw.profileId}`;
                    const abs = path.resolve(ROOT, raw.path);
                    if (tuples.has(tuple) || paths.has(abs)) rawErrors.push('duplicate raw tuple/path: ' + tuple);
                    tuples.add(tuple);
                    paths.add(abs);
                    const actual = fileIdentity(raw.path);
                    if (actual.sha256 !== raw.sha256 || actual.bytes !== raw.bytes)
                        rawErrors.push(`raw drift: ${raw.path}`);
                    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
                    const row = report.rows?.find((r) => r.browser === raw.browser && r.profile?.id === raw.profileId);
                    if (!row || !equal(parsed, rawPayload(row))) rawErrors.push('raw row content mismatch: ' + tuple);
                } catch (e) {
                    rawErrors.push(`raw unreadable: ${raw.path}`);
                }
            }
        } else if (report && typeof report === 'object' && report.schemaVersion === 'sparkle-env-performance/1') {
            rawErrors.push('rawOutputs missing');
        }
    } catch (e) {
        rawErrors.push(`raw validation crash: ${String(e)}`);
    }
    const errors = [...dataErrors, ...rawErrors];
    return { ok: errors.length === 0, errors };
}

function rawPayload(row) {
    return {
        browser: row.browser,
        profileId: row.profile.id,
        raw: row.observation?.raw,
        before: row.observation?.before,
        after: row.observation?.after,
        release: row.release,
        environmentReceipt: row.environmentReceipt,
        clockPrecision: row.clockPrecision,
        pageErrors: row.pageErrors,
        consoleErrors: row.consoleErrors,
    };
}

// CLI accepts explicit collection scope or a read-only verification path.
function parseArgs(args) {
    const parsed = {};
    for (const arg of args) {
        const match = /^--(out|authorization|phase|browser|verify)=(.+)$/.exec(arg);
        if (!match || Object.hasOwn(parsed, match[1])) throw Error('Invalid/duplicate argument: ' + arg);
        parsed[match[1]] = match[2];
    }
    if (parsed.verify) {
        if (Object.keys(parsed).length !== 1) throw Error('--verify is a separate read-only mode');
        return parsed;
    }
    if (!parsed.out || !parsed.authorization?.trim() || parsed.phase !== 'performance' || parsed.browser !== 'all') {
        throw Error('--phase=performance --browser=all --authorization=<quiet-window token> --out=<new.json> required');
    }
    return parsed;
}
function writeNew(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
async function collectRow(browser, engine, profile, origin, command, artifactDir) {
    let page,
        performanceActive = false;
    const row = {
        browser: engine,
        browserVersion: browser.version(),
        caseId: profile.id,
        profile: { ...profile },
        status: 'FAIL',
        method: 'REAL_BROWSER',
        pageErrors: [],
        consoleErrors: [],
        consoleMessages: [],
        pageClosed: false,
        failures: [],
        execution: {
            command,
            cwd: ROOT,
            startedAt: new Date().toISOString(),
            exitCode: 1,
            exitCodeMeaning: 'Logical row validation; OS process exit is recorded separately by the caller.',
        },
    };
    try {
        page = await browser.newPage({
            viewport: { width: profile.width, height: profile.height },
            deviceScaleFactor: profile.dpr,
        });
        page.on('pageerror', (e) => row.pageErrors.push(String(e)));
        page.on('console', (m) => {
            row.consoleMessages.push({ type: m.type(), text: m.text() });
            if (m.type() === 'error') row.consoleErrors.push(m.text());
        });
        row.environmentReceipt = await HELPER.navigateWithDPRRepair(
            page,
            `${origin}/examples/shader-sparkle/?test=1&_isolate=1`,
            {
                viewport: { width: profile.width, height: profile.height },
                dpr: profile.dpr,
                backing: { w: profile.width * profile.dpr, h: profile.height * profile.dpr },
                crossOriginIsolated: true,
                headers: { coop: 'same-origin', coep: 'require-corp' },
            },
        );
        const env = validateEnvironmentReceiptRow(row.environmentReceipt, profile);
        if (!env.ok) throw Error('Environment precondition: ' + env.errors.join('; '));
        await page.waitForFunction(() => window.__sparkle?.ready, null, { polling: 50, timeout: 60000 });
        const before = await page.evaluate(async (params) => {
            const result = await window.__sparkle.set(params);
            if (!result.ok) throw Error('Parameter rejection: ' + JSON.stringify(result));
            window.__sparkle.setInput('bright-region');
            window.__sparkle.setTime(0);
            return window.__sparkle.step(0);
        }, PARAMETERS);
        row.clockPrecision = await page.evaluate(() => {
            const allRaw = [];
            let previous = performance.now();
            const start = previous;
            while (allRaw.length < 1000 && performance.now() - start < 50) {
                const value = performance.now();
                if (value > previous) {
                    allRaw.push(value - previous);
                    previous = value;
                }
            }
            return {
                allRaw,
                minimumPositiveIncrementMs: allRaw.length ? Math.min(...allRaw) : null,
                calibrationPositiveIncrements: allRaw.length,
                crossOriginIsolated,
                method: 'All observed positive performance.now transitions, bounded by 1000 increments or 50ms, before warmup',
            };
        });
        await page.evaluate(() => window.__sparkle.startPerformance());
        performanceActive = true;
        await page.waitForFunction(
            (target) => window.__sparkle.performanceProgress() >= target,
            B.WARMUP + B.SAMPLES + 2,
            { polling: 50, timeout: 120000 },
        );
        const raw = await page.evaluate(() => window.__sparkle.stopPerformance());
        performanceActive = false;
        // Step/capture are outside the native timed window; resource counts come from a real snapshot.
        const after = await page.evaluate(() => window.__sparkle.step(0));
        raw.pageErrors = row.pageErrors;
        raw.consoleErrors = row.consoleErrors;
        row.observation = buildObservation(raw, before, row.clockPrecision, after);
        row.fixed = {
            viewport: { width: profile.width, height: profile.height },
            dpr: profile.dpr,
            parameters: before.params,
            seed: before.params.seed,
            input: before.inputKind,
            timeSeconds: before.time,
            simulationStep: before.frame,
        };
    } catch (e) {
        row.failures.push({ phase: 'collection', error: String(e), stack: e?.stack ?? null });
    } finally {
        if (page) {
            if (performanceActive) {
                try {
                    row.failedWindow = await page.evaluate(() => window.__sparkle.stopPerformance());
                } catch (e) {
                    row.failures.push({ phase: 'stop-failed-window', error: String(e) });
                }
            }
            try {
                row.release = await page.evaluate(async () => {
                    if (!window.__sparkle?.ready) return null;
                    const first = window.__sparkle.release(),
                        second = window.__sparkle.release();
                    return { ...(await first), releaseIdentity: first === second };
                });
            } catch (e) {
                row.failures.push({ phase: 'release', error: String(e) });
            }
            try {
                await page.close();
            } catch (e) {
                row.failures.push({ phase: 'page-close', error: String(e) });
            }
            row.pageClosed = page.isClosed();
        }
        if (row.observation?.raw) row.observation.raw.release = row.release;
        row.execution.endedAt = new Date().toISOString();
    }
    if (row.failures.length === 0 && row.observation) {
        const result = B.oracles().performance(row);
        if (result.errors.length === 0) {
            row.status = 'PASS';
            row.execution.exitCode = 0;
        } else row.failures.push({ phase: 'original-oracle', errors: result.errors });
    }
    const rawFile = path.join(artifactDir, `${engine}-${profile.id}.raw.json`);
    writeNew(rawFile, rawPayload(row));
    return {
        row,
        rawOutput: { ...fileIdentity(path.relative(ROOT, rawFile)), browser: engine, profileId: profile.id },
    };
}
async function main(args = process.argv.slice(2)) {
    const parsed = parseArgs(args);
    if (parsed.verify) {
        const result = validateFiles(JSON.parse(fs.readFileSync(path.resolve(ROOT, parsed.verify), 'utf8')));
        console.log(JSON.stringify(result));
        process.exitCode = result.ok ? 0 : 1;
        return result;
    }
    const out = path.resolve(ROOT, parsed.out),
        artifactDir = out.replace(/\.json$/i, '') + '-artifacts';
    if (fs.existsSync(out) || fs.existsSync(artifactDir)) throw Error('Output/report artifacts already exist: ' + out);
    const identity = collectorIdentity();
    if (identity.error) throw Error(identity.error);
    const command = [process.execPath, path.join(ROOT, COLLECTOR_PATH), ...args].join(' ');
    const report = {
        schemaVersion: 'sparkle-env-performance/1',
        identity,
        authorization: parsed.authorization,
        startedAt: new Date().toISOString(),
        command,
        cwd: ROOT,
        rows: [],
        rawOutputs: [],
        errors: [],
        browsers: [],
        cleanup: { proxyClosed: false, serverClosed: false, browsersClosed: false },
        subset: true,
        completed: false,
        agentGate: 'NOT_RUN',
        waveGate: 'BLOCKED',
        limitations: [
            'Isolated diagnostic performance only; WebKit live-resize Runtime remains BLOCKED',
            'Viewport simulation, not a physical mobile device; GPU physical memory unavailable',
            '60 native steady-frame intervals are not compositor presentation or a universal FPS budget',
        ],
    };
    let server, proxy;
    try {
        server = await require('./competitive-example-server.cjs').startExampleServer(ROOT);
        proxy = await HELPER.startIsolationProxy(server);
        const pw = require('playwright');
        for (const engine of ENGINES) {
            let browser;
            const terminal = { engine, launched: false, connectedAfterClose: null };
            report.browsers.push(terminal);
            try {
                browser = await pw[engine].launch(shaderLaunchOptions(engine));
                terminal.launched = true;
                for (const profile of B.PROFILES) {
                    const result = await collectRow(browser, engine, profile, proxy.origin, command, artifactDir);
                    report.rows.push(result.row);
                    report.rawOutputs.push(result.rawOutput);
                }
            } catch (e) {
                report.errors.push({ phase: engine, error: String(e), stack: e?.stack ?? null });
            } finally {
                if (browser) {
                    try {
                        await browser.close();
                    } catch (e) {
                        report.errors.push({ phase: 'browser-close', engine, error: String(e) });
                    }
                    terminal.connectedAfterClose = browser.isConnected();
                }
            }
        }
    } catch (e) {
        report.errors.push({ phase: 'setup', error: String(e), stack: e?.stack ?? null });
    } finally {
        if (proxy) {
            try {
                await proxy.close();
                report.cleanup.proxyClosed = proxy.closed;
            } catch (e) {
                report.errors.push({ phase: 'proxy-close', error: String(e) });
            }
        }
        if (server) {
            try {
                await server.close();
                report.cleanup.serverClosed = true;
                report.cleanup.serverCloseAcknowledged = true;
            } catch (e) {
                report.errors.push({ phase: 'server-close', error: String(e) });
            }
        }
        report.cleanup.browsersClosed =
            report.browsers.length === ENGINES.length &&
            report.browsers.every((b) => b.launched && b.connectedAfterClose === false);
    }
    report.identityAfter = collectorIdentity();
    report.endedAt = new Date().toISOString();
    const result = validateFiles(report);
    report.validation = result;
    report.scopePassed = result.ok;
    report.exitCode = result.ok ? 0 : 1;
    writeNew(out, report);
    console.log(JSON.stringify({ out, scopePassed: report.scopePassed, errors: result.errors }));
    process.exitCode = report.exitCode;
    return report;
}
module.exports = {
    main,
    parseArgs,
    buildObservation,
    rawPayload,
    validateReport,
    validateData: validateReport,
    validateFiles,
    validateEnvironmentReceiptRow,
    recomputeClockStats,
    collectorIdentity,
    validateMeasurement,
    PARAMETERS,
    B,
    PROFILES: B.PROFILES,
    WARMUP: B.WARMUP,
    SAMPLES: B.SAMPLES,
};
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
