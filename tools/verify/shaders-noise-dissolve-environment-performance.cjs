'use strict';
// Supplemental E01 diagnostic performance only. Existing six-gate reports stay immutable.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const B = require('./shaders-noise-dissolve.cjs'),
    C = require('./shaders-effect-contract.cjs');
const ENV = require('./shaders-browser-environment.cjs');
const COMMON = require('./shaders-sparkle-environment-performance.cjs');
const ROOT = path.resolve(__dirname, '../..');
const TOOL = 'tools/verify/shaders-noise-dissolve-environment-performance.cjs';
const ENGINES = ['chromium', 'firefox', 'webkit'];
const PROFILES = COMMON.PROFILES;
const PARAMETERS = Object.freeze({ ...B.definitions().defaults, seed: 0.375 });
const equal = (a, b) => C.canonical(a) === C.canonical(b);
const safe = (n) => Number.isSafeInteger(n) && n >= 0;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
function identity(file) {
    const bytes = fs.readFileSync(path.resolve(ROOT, file));
    return {
        path: file.replace(/\\/g, '/'),
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
}
function collectorIdentity() {
    // COMMON is a Node tool dependency only. Its complete closure is pinned too.
    return {
        effect: B.expectedIdentity(),
        environmentTools: COMMON.collectorIdentity(),
        collector: identity(TOOL),
        npm: identity('build/npm/cocosair.module.js'),
        map: identity('build/cocosair.module.js.map'),
    };
}
function buildObservation(run, timestamp, cleanup) {
    const s = run.samples,
        inv = run.snapshot.inventory;
    return {
        raw: { run, timestamp, cleanup },
        profile: null,
        warmupFrames: 30,
        frameCount: s.frameMs.length,
        concurrentCollectors: 0,
        pacer: 'NATIVE',
        frameNumbers: s.frameNumbers,
        cpuUpdateMs: s.cpuUpdateMs,
        cpuEncodingMs: s.cpuEncodingMs,
        cpuSubmissionMs: s.cpuDrawDispatchMs,
        cpuDrawDispatchMs: s.cpuDrawDispatchMs,
        queueBookkeepingMs: s.cpuSubmissionMs,
        frameMs: s.frameMs,
        durationSeconds: s.frameMs.reduce((n, x) => n + x, 0) / 1000,
        gpuTimestamp: timestamp,
        drawCalls: Math.max(...s.drawCalls),
        inventory: inv,
        passCount: inv.passCount,
        textureCount: inv.textureCount,
        bufferCount: inv.bufferCount,
        vramEstimate: {
            bytes: inv.textureBytes + inv.bufferBytes,
            formula:
                'Sum of deduplicated owned native gfx Texture.size + Buffer.size; excludes driver, swapchain, shared caches',
            method: 'estimate',
        },
        gpuPhysicalMemory: { status: 'unavailable', reason: 'Physical resident GPU memory is not exposed.' },
        measurementMethod:
            'Existing example instrumentation: uniform update CPU; commandBuffer begin/end envelope including native GL dispatch; GL draw CPU dispatch; Queue.submit bookkeeping separately. Raw arrays are aggregated by the existing example, not an independent per-call trace. Native update frame interval is not compositor presentation.',
        cleanup,
    };
}
function validateReport(report) {
    const errors = [];
    try {
        if (!report || Array.isArray(report) || report.schemaVersion !== 'noise-env-performance/1')
            return { ok: false, errors: ['schema'] };
        if (!equal(report.identity, collectorIdentity()) || !equal(report.identityAfter, report.identity))
            errors.push('input identity drift/missing');
        if (!Array.isArray(report.rows)) return { ok: false, errors: ['rows missing'] };
        if (report.rows.length !== 9) errors.push('scope must have nine rows');
        const seen = new Set();
        for (const row of report.rows) {
            if (!row) {
                errors.push('invalid row');
                continue;
            }
            const tag = `${row.browser}/${row.caseId}`,
                p = PROFILES.find((p) => p.id === row.caseId);
            if (seen.has(tag)) errors.push('duplicate tuple: ' + tag);
            seen.add(tag);
            const fail = (message) => errors.push(tag + ': ' + message);
            if (!p || !ENGINES.includes(row.browser) || !equal(row.profile, p)) {
                fail('profile identity');
                continue;
            }
            if (row.status !== 'PASS' || row.method !== 'REAL_BROWSER' || !row.browserVersion)
                fail('status/method/version');
            const env = COMMON.validateEnvironmentReceiptRow(row.environmentReceipt, p);
            if (!env.ok) fail('environment: ' + env.errors.join('; '));
            const clock = row.clockPrecision,
                stats = COMMON.recomputeClockStats(clock?.allRaw);
            if (
                !stats.ok ||
                clock?.crossOriginIsolated !== true ||
                clock?.calibrationPositiveIncrements !== stats.count ||
                !finite(clock?.minimumPositiveIncrementMs) ||
                Math.abs(clock.minimumPositiveIncrementMs - stats.min) > 1e-9
            )
                fail('clock precision');
            if (
                !Array.isArray(row.pageErrors) ||
                row.pageErrors.length ||
                !Array.isArray(row.consoleErrors) ||
                row.consoleErrors.length
            )
                fail('page/console errors');
            if (row.pageClosed !== true || row.failures?.length) fail('page close/collection failure');
            const o = row.observation,
                run = o?.raw?.run,
                samples = run?.samples,
                release = row.release;
            if (!o || !samples) {
                fail('raw samples missing');
                continue;
            }
            for (const key of [
                'cpuUpdateMs',
                'cpuEncodingMs',
                'cpuSubmissionMs',
                'cpuDrawDispatchMs',
                'frameMs',
                'drawCalls',
                'frameNumbers',
            ]) {
                if (
                    !Array.isArray(samples[key]) ||
                    samples[key].length !== 60 ||
                    samples[key].some((n) => !finite(n) || n < 0)
                )
                    fail('raw sample array: ' + key);
            }
            if (
                !Array.isArray(samples.frameNumbers) ||
                samples.frameNumbers.some((f, i) => !safe(f) || (i && f <= samples.frameNumbers[i - 1]))
            )
                fail('frame order');
            if (
                samples.frameMs.some((x) => x <= 0) ||
                ['cpuUpdateMs', 'cpuEncodingMs', 'cpuDrawDispatchMs'].some((k) => samples[k].every((x) => x === 0))
            )
                fail('below clock precision/native frame');
            for (const [reported, source] of [
                ['cpuUpdateMs', 'cpuUpdateMs'],
                ['cpuEncodingMs', 'cpuEncodingMs'],
                ['cpuSubmissionMs', 'cpuDrawDispatchMs'],
                ['cpuDrawDispatchMs', 'cpuDrawDispatchMs'],
                ['queueBookkeepingMs', 'cpuSubmissionMs'],
                ['frameMs', 'frameMs'],
                ['frameNumbers', 'frameNumbers'],
            ]) {
                if (!equal(o[reported], samples[source])) fail('raw aggregate mismatch: ' + reported);
            }
            const seconds = samples.frameMs.reduce((n, x) => n + x, 0) / 1000;
            if (
                !finite(o.durationSeconds) ||
                Math.abs(o.durationSeconds - seconds) > 1e-9 ||
                o.drawCalls !== Math.max(...samples.drawCalls)
            )
                fail('duration/draw aggregate');
            for (const snap of [row.before, run.snapshot]) {
                if (
                    !snap ||
                    !equal(snap.parameters, PARAMETERS) ||
                    snap.dpr !== p.dpr ||
                    snap.rect?.width !== p.width ||
                    snap.rect?.height !== p.height ||
                    snap.backing?.width !== p.width * p.dpr ||
                    snap.backing?.height !== p.height * p.dpr ||
                    snap.canvasCount !== 1
                )
                    fail('actual snapshot/parameters/backing');
                if (
                    !Array.isArray(snap?.shaderCompiles) ||
                    !snap.shaderCompiles.length ||
                    snap.shaderCompiles.some((s) => s.status !== true) ||
                    !Array.isArray(snap?.programLinks) ||
                    !snap.programLinks.length ||
                    snap.programLinks.some((s) => s.status !== true)
                )
                    fail('shader compile/link');
            }
            const inv = o.inventory;
            if (
                !equal(inv, run.snapshot.inventory) ||
                !Array.isArray(inv?.textures) ||
                !Array.isArray(inv?.buffers) ||
                inv.textureCount !== inv.textures.length ||
                inv.bufferCount !== inv.buffers.length ||
                inv.textureBytes !== inv.textures.reduce((n, t) => n + t.size, 0) ||
                inv.bufferBytes !== inv.buffers.reduce((n, t) => n + t.size, 0)
            )
                fail('inventory bytes/count');
            if (
                !equal(o.gpuTimestamp, o.raw.timestamp) ||
                !equal(o.cleanup, release?.result) ||
                !equal(o.raw.cleanup, release?.result)
            )
                fail('timestamp/cleanup copy');
            const gpu = o.gpuTimestamp;
            if (gpu?.status === 'measured') {
                if (
                    !Array.isArray(gpu.observations) ||
                    gpu.observations.length !== 60 ||
                    gpu.disjoint !== false ||
                    gpu.observations.some(
                        (q, i) =>
                            q.frame !== samples.frameNumbers[i] ||
                            q.warmup !== false ||
                            q.available !== true ||
                            q.wasQuery !== true ||
                            q.deleted !== true ||
                            !finite(q.milliseconds) ||
                            q.milliseconds <= 0 ||
                            q.milliseconds !== gpu.milliseconds[i],
                    )
                )
                    fail('GPU query identity/retirement');
            } else if (
                gpu?.status !== 'unavailable' ||
                typeof gpu.reason !== 'string' ||
                !gpu.reason.includes('absent') ||
                gpu.observations?.length
            )
                fail('GPU measurement failed, not unsupported');
            if (!release || release.samePromise !== true || release.terminalError !== 'E01_DISPOSED')
                fail('terminal release');
            const result = release?.result;
            for (const refs of [result?.own?.refs, result?.ownedBackgroundRefs]) {
                if (!Array.isArray(refs) || refs.length !== 3 || refs.some((r) => r.before !== 1 || r.after !== 0))
                    fail('owned references');
            }
            if (
                result?.own?.detached !== true ||
                result?.own?.nodeValid !== false ||
                result?.effect?.before !== 1 ||
                result.effect.after !== 0 ||
                result.effect.registryDetached !== true ||
                result.effect.validAfterClose !== false ||
                result?.listeners !== 0 ||
                result?.controlsDisabled !== true ||
                result?.instrumentsRestored !== true ||
                result?.closed !== true
            )
                fail('cleanup/registry/instrumentation');
            try {
                const checked = B.oracles().performance(row);
                if (checked.errors.length) fail('original oracle: ' + checked.errors.join('; '));
            } catch (e) {
                fail('original oracle malformed: ' + e.message);
            }
        }
        for (const engine of ENGINES)
            for (const p of PROFILES)
                if (!seen.has(`${engine}/${p.id}`)) errors.push('missing tuple: ' + engine + '/' + p.id);
        if (
            report.cleanup?.proxyClosed !== true ||
            report.cleanup?.serverClosed !== true ||
            report.cleanup?.browsersClosed !== true ||
            report.errors?.length
        )
            errors.push('collection cleanup/errors');
    } catch (e) {
        errors.push('malformed report: ' + e.message);
    }
    return { ok: errors.length === 0, errors };
}
function rawPayload(row) {
    return {
        browser: row.browser,
        caseId: row.caseId,
        before: row.before,
        run: row.observation?.raw?.run,
        timestamp: row.observation?.raw?.timestamp,
        release: row.release,
        environmentReceipt: row.environmentReceipt,
        clockPrecision: row.clockPrecision,
        pageErrors: row.pageErrors,
        consoleErrors: row.consoleErrors,
    };
}
function validateFiles(report) {
    const errors = [...validateReport(report).errors];
    try {
        if (!Array.isArray(report?.rawOutputs) || report.rawOutputs.length !== 9)
            errors.push('nine raw outputs required');
        const paths = new Set(),
            tuples = new Set();
        for (const raw of report?.rawOutputs || []) {
            const tag = `${raw.browser}/${raw.caseId}`,
                abs = path.resolve(ROOT, raw.path);
            if (paths.has(abs) || tuples.has(tag)) errors.push('duplicate raw output');
            paths.add(abs);
            tuples.add(tag);
            if (!equal(identity(raw.path), { path: raw.path, bytes: raw.bytes, sha256: raw.sha256 }))
                errors.push('raw SHA drift');
            const row = report.rows.find((r) => r.browser === raw.browser && r.caseId === raw.caseId);
            if (!row || !equal(rawPayload(row), JSON.parse(fs.readFileSync(abs, 'utf8'))))
                errors.push('raw row binding mismatch');
        }
        if (
            typeof report?.authorization !== 'string' ||
            !report.authorization.trim() ||
            !report.command?.includes('--authorization=' + report.authorization) ||
            report.cwd !== ROOT ||
            !finite(Date.parse(report.startedAt)) ||
            !finite(Date.parse(report.endedAt)) ||
            Date.parse(report.endedAt) < Date.parse(report.startedAt)
        )
            errors.push('execution metadata');
        if (
            report.subset !== true ||
            report.completed !== false ||
            report.waveGate !== 'BLOCKED' ||
            report.agentGate !== 'NOT_RUN'
        )
            errors.push('scope markers');
        if (
            !Array.isArray(report.browsers) ||
            report.browsers.length !== 3 ||
            new Set(report.browsers.map((b) => b.engine)).size !== 3 ||
            report.browsers.some((b) => !ENGINES.includes(b.engine) || b.connectedAfterClose !== false || !b.launched)
        )
            errors.push('browser terminal');
        if (report.scopePassed !== undefined && report.scopePassed !== (errors.length === 0))
            errors.push('scopePassed contradiction');
    } catch (e) {
        errors.push('raw validation failure: ' + e.message);
    }
    return { ok: errors.length === 0, errors };
}
const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
};
async function main(args = process.argv.slice(2)) {
    const parsed = COMMON.parseArgs(args);
    if (parsed.verify) {
        const result = validateFiles(JSON.parse(fs.readFileSync(path.resolve(ROOT, parsed.verify))));
        console.log(JSON.stringify(result));
        process.exitCode = result.ok ? 0 : 1;
        return result;
    }
    const out = path.resolve(ROOT, parsed.out),
        artifacts = out.replace(/\.json$/i, '') + '-artifacts';
    if (fs.existsSync(out) || fs.existsSync(artifacts)) throw Error('Output exists');
    const report = {
        schemaVersion: 'noise-env-performance/1',
        identity: collectorIdentity(),
        authorization: parsed.authorization,
        startedAt: new Date().toISOString(),
        command: [process.execPath, TOOL, ...args].join(' '),
        cwd: ROOT,
        rows: [],
        rawOutputs: [],
        browsers: [],
        errors: [],
        cleanup: {},
        subset: true,
        completed: false,
        waveGate: 'BLOCKED',
        agentGate: 'NOT_RUN',
    };
    let server, proxy;
    try {
        server = await require('./competitive-example-server.cjs').startExampleServer(ROOT);
        proxy = await ENV.startIsolationProxy(server);
        const pw = require('playwright'),
            { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
        for (const engine of ENGINES) {
            let browser;
            const terminal = { engine, launched: false, connectedAfterClose: null };
            report.browsers.push(terminal);
            try {
                browser = await pw[engine].launch(shaderLaunchOptions(engine));
                terminal.launched = true;
                for (const profile of PROFILES) {
                    let page;
                    const row = {
                        browser: engine,
                        browserVersion: browser.version(),
                        caseId: profile.id,
                        profile: { ...profile },
                        method: 'REAL_BROWSER',
                        status: 'FAIL',
                        pageErrors: [],
                        consoleErrors: [],
                        consoleMessages: [],
                        failures: [],
                        pageClosed: false,
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
                        row.environmentReceipt = await ENV.navigateWithDPRRepair(
                            page,
                            `${proxy.origin}/examples/shader-noise-dissolve/?test=1&_isolate=1`,
                            {
                                viewport: { width: profile.width, height: profile.height },
                                dpr: profile.dpr,
                                backing: { w: profile.width * profile.dpr, h: profile.height * profile.dpr },
                                crossOriginIsolated: true,
                                headers: { coop: 'same-origin', coep: 'require-corp' },
                            },
                        );
                        const checked = COMMON.validateEnvironmentReceiptRow(row.environmentReceipt, profile);
                        if (!checked.ok) throw Error('Environment: ' + checked.errors.join('; '));
                        await page.waitForFunction(() => window.__e01, null, { polling: 50, timeout: 60000 });
                        row.before = await page.evaluate((params) => window.__e01.set(params), PARAMETERS);
                        row.clockPrecision = await page.evaluate(() => {
                            const allRaw = [];
                            let previous = performance.now();
                            const start = previous;
                            while (allRaw.length < 1000 && performance.now() - start < 50) {
                                const n = performance.now();
                                if (n > previous) {
                                    allRaw.push(n - previous);
                                    previous = n;
                                }
                            }
                            return {
                                allRaw,
                                minimumPositiveIncrementMs: allRaw.length ? Math.min(...allRaw) : null,
                                calibrationPositiveIncrements: allRaw.length,
                                crossOriginIsolated,
                            };
                        });
                        // Observe completion with protocol polling; the example supplies the only native simulation clock.
                        await page.evaluate(() => {
                            window.__e01Window = { done: false };
                            window.__e01.performance(30, 60).then((run) => {
                                window.__e01Window.run = run;
                                window.__e01Window.done = true;
                            });
                        });
                        await page.waitForFunction(() => window.__e01Window.done, null, {
                            polling: 50,
                            timeout: 120000,
                        });
                        const run = await page.evaluate(() => window.__e01Window.run),
                            timestamp = await page.evaluate(() => window.__e01.timerResults());
                        row.observation = buildObservation(run, timestamp, null);
                        row.observation.profile = profile.id;
                    } catch (e) {
                        row.failures.push({ phase: 'capture', error: String(e), stack: e.stack });
                    } finally {
                        if (page) {
                            try {
                                row.release = await page.evaluate(async () => {
                                    if (!window.__e01) return null;
                                    const first = window.__e01.release(),
                                        second = window.__e01.release(),
                                        result = await first;
                                    let terminalError = null;
                                    try {
                                        window.__e01.set(window.__e01.defaults);
                                    } catch (e) {
                                        terminalError = e.message;
                                    }
                                    return { samePromise: first === second, result, terminalError };
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
                    }
                    if (row.observation) {
                        row.observation.cleanup = row.release?.result;
                        row.observation.raw.cleanup = row.release?.result;
                    }
                    if (!row.failures.length) row.status = 'PASS';
                    report.rows.push(row);
                    const rawFile = path.join(artifacts, `${engine}-${profile.id}.raw.json`);
                    write(rawFile, rawPayload(row));
                    report.rawOutputs.push({
                        ...identity(path.relative(ROOT, rawFile)),
                        browser: engine,
                        caseId: profile.id,
                    });
                }
            } catch (e) {
                report.errors.push({ phase: engine, error: String(e) });
            } finally {
                if (browser) {
                    try {
                        await browser.close();
                    } catch (e) {
                        report.errors.push({ phase: 'browser-close', error: String(e) });
                    }
                    terminal.connectedAfterClose = browser.isConnected();
                }
            }
        }
    } catch (e) {
        report.errors.push({ phase: 'setup', error: String(e) });
    } finally {
        if (proxy)
            try {
                await proxy.close();
                report.cleanup.proxyClosed = proxy.closed;
            } catch (e) {
                report.errors.push({ phase: 'proxy-close', error: String(e) });
            }
        if (server)
            try {
                await server.close();
                report.cleanup.serverClosed = true;
            } catch (e) {
                report.errors.push({ phase: 'server-close', error: String(e) });
            }
        report.cleanup.browsersClosed =
            report.browsers.length === 3 && report.browsers.every((b) => b.launched && b.connectedAfterClose === false);
    }
    report.identityAfter = collectorIdentity();
    report.endedAt = new Date().toISOString();
    const validation = validateFiles(report);
    report.validation = validation;
    report.scopePassed = validation.ok;
    report.exitCode = validation.ok ? 0 : 1;
    write(out, report);
    console.log(JSON.stringify({ out, scopePassed: report.scopePassed, errors: validation.errors }));
    process.exitCode = report.exitCode;
    return report;
}
module.exports = {
    main,
    collectorIdentity,
    buildObservation,
    validateReport,
    validateFiles,
    rawPayload,
    PROFILES,
    PARAMETERS,
    B,
};
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
