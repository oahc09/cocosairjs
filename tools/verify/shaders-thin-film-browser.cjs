'use strict';
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    cp = require('node:child_process');
const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
const { startIsolationProxy, navigateWithDPRRepair } = require('./shaders-browser-environment.cjs');
const contract = require('./shaders-effect-contract.cjs'),
    oracle = require('./shaders-thin-film-oracle.cjs'),
    performanceOracle = require('./shaders-thin-film-performance.cjs');
const ROOT = path.resolve(__dirname, '../..'),
    EXAMPLE = 'examples/shader-thin-film';
const INPUTS = [
    `${EXAMPLE}/src/main.ts`,
    `${EXAMPLE}/src/parameters.ts`,
    `${EXAMPLE}/src/film.frag`,
    `${EXAMPLE}/src/effect.generated.ts`,
    `${EXAMPLE}/parameters.json`,
    `${EXAMPLE}/index.html`,
    `${EXAMPLE}/generate-effect.cjs`,
    'examples/shared/shader-blocks.js',
    'tools/verify/shaders-thin-film-oracle.cjs',
    'tools/verify/shaders-thin-film-browser.cjs',
    'tools/verify/shaders-thin-film.tsconfig.json',
    'tools/verify/shaders-thin-film-performance.cjs',
    'tools/verify/shaders-browser-environment.cjs',
    'tools/verify/shaders-browser-launch.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'tools/verify/shaders-effect-contract.cjs',
    'examples/shared/shader-lifecycle.ts',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/asset-lifecycle.d.ts',
];
const profiles = [
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
];
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fileIdentity = (file) => {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return {
        path: path.relative(ROOT, path.resolve(ROOT, file)).replace(/\\/g, '/'),
        bytes: b.length,
        sha256: hash(b),
    };
};
function validateFiles(report) {
    const errors = [];
    if (!report || report.schemaVersion !== 'e02-thin-film/1') return { ok: false, errors: ['schema'] };
    if (
        !Array.isArray(report.inputs) ||
        !Array.isArray(report.engines) ||
        !Array.isArray(report.requestedEngines) ||
        report.requestedEngines.length === 0
    )
        return { ok: false, errors: ['report structure'] };
    for (const f of report.inputs || []) {
        try {
            const now = fileIdentity(f.path);
            if (now.sha256 !== f.sha256 || now.bytes !== f.bytes) errors.push(`drift:${f.path}`);
        } catch {
            errors.push(`missing:${f.path}`);
        }
    }
    if (
        report.inputs?.length !== INPUTS.length + 2 ||
        new Set(report.inputs?.map((f) => f.path)).size !== INPUTS.length + 2 ||
        [...INPUTS, 'build/cocosair.module.js', 'build/cocosair.module.d.ts'].some(
            (p) => !report.inputs?.some((f) => f.path === p),
        )
    )
        errors.push('input closure');
    const engines = report.requestedEngines;
    if (
        !Array.isArray(engines) ||
        new Set(engines).size !== engines.length ||
        engines.some((e) => !['chromium', 'firefox', 'webkit'].includes(e))
    )
        errors.push('engine set');
    if (!['functional', 'performance'].includes(report.phase)) errors.push('phase');
    if (
        new Set(report.engines?.map((e) => e.engine)).size !== engines?.length ||
        report.engines?.some((e) => !engines.includes(e.engine) || !e.browserVersion)
    )
        errors.push('actual engine set');
    for (const e of report.engines || []) {
        if (e.error || e.pageErrors.length || e.consoleErrors.length) errors.push(`${e.engine}: runtime errors`);
        if (!e.shaderCompile?.length || e.shaderCompile.some((s) => !s.compiled))
            errors.push(`${e.engine}: shader compile`);
        for (const capture of e.captures || []) {
            try {
                const now = fileIdentity(capture.png.path);
                if (now.sha256 !== capture.png.sha256 || now.bytes !== capture.png.bytes) errors.push('PNG identity');
                const checked = oracle.pngAudit(
                    path.resolve(ROOT, capture.png.path),
                    capture.params,
                    capture.time,
                    capture.presentation,
                );
                if (checked.errors.length) errors.push({ capture: capture.id, errors: checked.errors });
            } catch (error) {
                errors.push(String(error));
            }
        }
        if (report.phase === 'performance') {
            if (e.performance?.length !== 3 || new Set(e.performance.map((p) => p.profile.id)).size !== 3)
                errors.push('performance exact profiles');
            for (const p of e.performance || [])
                errors.push(
                    ...performanceOracle
                        .validatePerformance(p, p.profile)
                        .errors.map((x) => `${e.engine}:${p.profile.id}:${x}`),
                );
        } else {
            const expected = [
                'circle',
                'box',
                'phase-one',
                'light-zero',
                'light-half',
                'opacity-zero',
                'opacity-half',
                'background-light',
            ];
            if (e.captures?.length !== expected.length || expected.some((id) => !e.captures.some((c) => c.id === id)))
                errors.push(`${e.engine}: visual set`);
            const core = oracle.gpuAudit(e.core, true);
            errors.push(...core.errors.map((x) => ({ engine: e.engine, stage: 'linear-straight-core', error: x })));
            const r = oracle.resourceAudit(e.resources);
            errors.push(...r.errors.map((x) => `${e.engine}:${x}`));
            if (!e.resize?.png || !e.resize?.after) errors.push(`${e.engine}: missing live resize`);
            else {
                const gpu = oracle.gpuAudit(e.resize.after);
                errors.push(...gpu.errors.map((x) => ({ engine: e.engine, stage: 'resize-gpu', error: x })));
                const checked = oracle.pngAudit(
                    path.resolve(ROOT, e.resize.png.path),
                    e.resize.after.params,
                    e.resize.after.time,
                );
                if (checked.errors.length)
                    errors.push({ engine: e.engine, stage: 'live-resize-presentation', errors: checked.errors });
            }
            const plan = oracle.boundaryPlan();
            if (
                e.boundaries?.length !== plan.length ||
                new Set(e.boundaries?.map((b) => b.caseId)).size !== plan.length ||
                plan.some(
                    (b) =>
                        !e.boundaries?.some(
                            (r) =>
                                r.caseId === b.caseId &&
                                r.parameter === b.parameter &&
                                r.boundary === b.boundary &&
                                r.value === b.value,
                        ),
                )
            )
                errors.push('boundary exact set');
            for (const b of e.boundaries || []) {
                if (
                    (b.boundary === 'invalid' && b.receipt.ok !== false) ||
                    (b.boundary !== 'invalid' && b.receipt.ok !== true)
                )
                    errors.push(`boundary:${b.caseId}`);
            }
            if (e.invalids?.length !== 4 || e.invalids.some((r) => r.ok !== false))
                errors.push('nonfinite/unknown boundary');
            if (
                !e.normal ||
                !e.normal.pause ||
                e.normal.pause.before.time !== e.normal.pause.after.time ||
                e.normal.resume.after.time <= e.normal.resume.before.time ||
                !e.normal.events?.some((r) => r.type === 'pause' && r.isTrusted) ||
                !e.normal.events?.some((r) => r.type === 'resume' && r.isTrusted)
            )
                errors.push(`${e.engine}: native controls`);
            if (
                !e.lifecycle?.release?.sceneCleared ||
                e.lifecycle.release.listenerAdds !== e.lifecycle.release.listenerRemoves ||
                !e.lifecycle.samePromise ||
                e.lifecycle.terminalCode !== 'FILM_DISPOSED'
            )
                errors.push(`${e.engine}: terminal cleanup`);
        }
    }
    if (report.engines?.length !== engines?.length) errors.push('missing engine');
    if (report.phase === 'performance') errors.push(...validatePerformanceEnvironment(report));
    return { ok: errors.length === 0, errors };
}
function validatePerformanceEnvironment(report) {
    const errors = [],
        environment = require('./shaders-browser-environment.cjs');
    if (!report.cleanup?.proxyClosed || !report.cleanup?.serverClosed || report.cleanup.errors?.length)
        errors.push('owned HTTP servers not closed');
    if (!report.authorization || !report.command?.includes('--authorization=' + report.authorization))
        errors.push('exclusive performance authorization missing');
    for (const e of report.engines) {
        const rows = e.performance || [],
            ids = rows.map((r) => r.profile?.id);
        if (ids.length !== 3 || new Set(ids).size !== 3 || profiles.some((p) => !ids.includes(p.id)))
            errors.push(e.engine + ': frozen profile set');
        for (const row of rows) {
            const p = profiles.find((p) => p.id === row.profile?.id);
            if (!p) {
                errors.push('unknown profile');
                continue;
            }
            if (contract.canonical(row.profile) !== contract.canonical(p)) errors.push('profile tuple mismatch');
            const expected = {
                viewport: p.viewport,
                dpr: p.dpr,
                backing: { w: p.viewport.width * p.dpr, h: p.viewport.height * p.dpr },
                crossOriginIsolated: true,
                headers: { coop: 'same-origin', coep: 'require-corp' },
            };
            const check = environment.validateEnvironmentReceipt(row.environmentReceipt, expected);
            errors.push(...check.errors.map((x) => e.engine + ':' + p.id + ':' + x));
            const precision = row.precision,
                raw = precision?.allRaw;
            if (
                !Array.isArray(raw) ||
                !raw.length ||
                raw.some((v) => !Number.isFinite(v) || v <= 0) ||
                precision.positiveCount !== raw.length ||
                !Number.isFinite(precision.minimumPositiveDeltaMs) ||
                Math.abs(Math.min(...raw) - precision.minimumPositiveDeltaMs) > 1e-9 ||
                precision.crossOriginIsolated !== true ||
                precision.calls !== 25000
            )
                errors.push('complete clock calibration invalid');
            if (
                !row.release?.sceneCleared ||
                row.release.listenerAdds !== row.release.listenerRemoves ||
                row.release.retirement?.refs?.length !== 3 ||
                row.release.retirement.refs.some((r) => r.before !== 1 || r.after !== 0) ||
                !row.release.retirement.rendererUnbound ||
                !row.release.retirement.nodeRemoved ||
                row.pageClosed !== true
            )
                errors.push('performance owned release not observed');
            for (const [label, rs] of [
                ['update', row.updateCalls],
                ['command', row.commands],
                ['dispatch', row.draws],
            ])
                if (!Array.isArray(rs) || !rs.some((r) => r.ms > 0))
                    errors.push(label + ' below observable resolution');
            if (
                row.httpDocument?.status !== row.environmentReceipt?.responseStatus ||
                row.httpDocument?.url !== row.environmentReceipt?.url
            )
                errors.push('HTTP receipt mismatch');
        }
    }
    return errors;
}
async function main(args = process.argv.slice(2)) {
    const value = (key) =>
        args
            .find((x) => x.startsWith(`--${key}=`))
            ?.split('=')
            .slice(1)
            .join('=');
    if (value('verify')) {
        const r = JSON.parse(fs.readFileSync(value('verify'), 'utf8'));
        const result = validateFiles(r);
        console.log(JSON.stringify(result));
        return result.ok ? 0 : 1;
    }
    const out = value('out');
    if (!out || fs.existsSync(out)) throw new Error('Explicit new --out required');
    const phase = value('phase') || 'functional',
        selected = value('browser') || 'all';
    if (
        !['functional', 'performance'].includes(phase) ||
        !['all', 'chromium', 'firefox', 'webkit'].includes(selected) ||
        args.some((a) => !a.startsWith('--'))
    )
        throw new Error('Invalid phase/browser/argument');
    if (phase === 'performance' && !value('authorization')) throw new Error('Exclusive --authorization required');
    const requestedEngines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : [selected],
        startedAt = new Date().toISOString();
    const report = {
        schemaVersion: 'e02-thin-film/1',
        phase,
        requestedEngines,
        startedAt,
        authorization: value('authorization') || null,
        command: [process.execPath, ...process.argv.slice(1)].join(' '),
        cwd: ROOT,
        inputs: [...INPUTS, 'build/cocosair.module.js', 'build/cocosair.module.d.ts'].map(fileIdentity),
        engines: [],
        agentGate: 'NOT_RUN',
        subset: true,
        completed: false,
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const artifacts = `${out.replace(/\.json$/, '')}-artifacts`;
    fs.mkdirSync(artifacts, { recursive: true });
    const buildLog = path.join(artifacts, 'build.log');
    const build = cp.spawnSync(
        process.execPath,
        ['node_modules/typescript/bin/tsc', '-p', 'tools/verify/shaders-thin-film.tsconfig.json'],
        { cwd: ROOT, encoding: 'utf8' },
    );
    fs.writeFileSync(
        buildLog,
        `command=node node_modules/typescript/bin/tsc -p tools/verify/shaders-thin-film.tsconfig.json\nexitCode=${build.status}\n${build.stdout}${build.stderr}`,
        { flag: 'wx' },
    );
    report.build = {
        command: 'node node_modules/typescript/bin/tsc -p tools/verify/shaders-thin-film.tsconfig.json',
        exitCode: build.status,
        raw: fileIdentity(buildLog),
    };
    const esbuild = require('esbuild'),
        { startExampleServer } = require('./competitive-example-server.cjs');
    const bundled = esbuild.buildSync({
        entryPoints: [path.join(ROOT, EXAMPLE, 'src/main.ts')],
        bundle: true,
        format: 'esm',
        target: 'es2022',
        external: ['cocosair'],
        write: false,
    });
    report.build.bundleBytes = bundled.outputFiles[0].contents.length;
    if (build.status !== 0) throw new Error('Strict TS failed');
    const server = await startExampleServer(ROOT);
    let isolationProxy = null;
    async function installProbe(page) {
        await page.addInitScript(() => {
            window.__filmCompile = [];
            const proto = WebGL2RenderingContext.prototype,
                original = proto.compileShader;
            proto.compileShader = function (shader) {
                original.call(this, shader);
                window.__filmCompile.push({
                    compiled: this.getShaderParameter(shader, this.COMPILE_STATUS),
                    log: this.getShaderInfoLog(shader) || '',
                    source: this.getShaderSource(shader),
                });
            };
            const live = { buffer: new Set(), texture: new Set() },
                identities = new WeakMap(),
                events = [];
            let id = 0;
            for (const [kind, create, destroy] of [
                ['buffer', 'createBuffer', 'deleteBuffer'],
                ['texture', 'createTexture', 'deleteTexture'],
            ]) {
                const oldCreate = proto[create],
                    oldDestroy = proto[destroy];
                proto[create] = function (...args) {
                    const object = oldCreate.apply(this, args);
                    if (object) {
                        const ownID = ++id;
                        identities.set(object, ownID);
                        live[kind].add(ownID);
                        events.push({ kind, operation: create, id: ownID });
                    }
                    return object;
                };
                proto[destroy] = function (object) {
                    const ownID = object && identities.get(object);
                    const result = oldDestroy.call(this, object);
                    if (ownID) {
                        live[kind].delete(ownID);
                        events.push({
                            kind,
                            operation: destroy,
                            id: ownID,
                            nativeAliveAfter: kind === 'buffer' ? this.isBuffer(object) : this.isTexture(object),
                        });
                    }
                    return result;
                };
            }
            window.__filmGfx = () => ({
                bufferCount: live.buffer.size,
                textureCount: live.texture.size,
                events: [...events],
                scope: 'all native GL objects in the single Cocos context since pre-import prototype instrumentation',
            });
        });
    }
    try {
        if (phase === 'performance') isolationProxy = await startIsolationProxy(server);
        for (const engine of requestedEngines) {
            const browser = await require('playwright')[engine].launch({
                ...shaderLaunchOptions(engine),
                headless: true,
            });
            const e = {
                engine,
                browserVersion: browser.version(),
                pageErrors: [],
                consoleErrors: [],
                captures: [],
                boundaries: [],
                performance: [],
            };
            report.engines.push(e);
            const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
            page.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
            page.on('console', (x) => {
                if (x.type() === 'error') e.consoleErrors.push(x.text());
            });
            await installProbe(page);
            try {
                if (phase === 'performance') {
                    await page.close();
                    for (const profile of profiles) {
                        const perfPage = await browser.newPage({
                            viewport: profile.viewport,
                            deviceScaleFactor: profile.dpr,
                        });
                        const perfEntry = { profile };
                        e.performance.push(perfEntry);
                        let ready = false,
                            timingStarted = false,
                            timingStopped = false;
                        perfPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                        perfPage.on('console', (x) => {
                            if (x.type() === 'error') e.consoleErrors.push(x.text());
                        });
                        try {
                            await installProbe(perfPage);
                            const expected = {
                                viewport: profile.viewport,
                                dpr: profile.dpr,
                                backing: {
                                    w: profile.viewport.width * profile.dpr,
                                    h: profile.viewport.height * profile.dpr,
                                },
                                crossOriginIsolated: true,
                                headers: { coop: 'same-origin', coep: 'require-corp' },
                            };
                            const envReceipt = await navigateWithDPRRepair(
                                perfPage,
                                isolationProxy.origin + '/' + EXAMPLE + '/?test=1&_isolate=1',
                                expected,
                            );
                            perfEntry.environmentReceipt = envReceipt;
                            if (!envReceipt.ok) throw Error('Environment: ' + envReceipt.errors.join('; '));
                            await perfPage.waitForFunction(() => window.__thinFilm?.ready, null, { timeout: 60000 });
                            ready = true;
                            const precision = await perfPage.evaluate(() => {
                                const start = performance.now();
                                let previous = start,
                                    minimum = Infinity;
                                const positives = [];
                                for (let i = 0; i < 25000; i++) {
                                    const now = performance.now(),
                                        delta = now - previous;
                                    if (delta > 0) {
                                        positives.push(delta);
                                        minimum = Math.min(minimum, delta);
                                    }
                                    previous = now;
                                }
                                return {
                                    crossOriginIsolated,
                                    calls: 25000,
                                    startedAtMs: start,
                                    endedAtMs: performance.now(),
                                    minimumPositiveDeltaMs: Number.isFinite(minimum) ? minimum : null,
                                    positiveCount: positives.length,
                                    allRaw: positives,
                                    clock: 'performance.now wall-clock quantization',
                                    zeroMeaning:
                                        'Zero observed durations are below observable timer precision, not zero cost',
                                };
                            });
                            await perfPage.evaluate(() => window.__thinFilm.startPerformance());
                            timingStarted = true;
                            await perfPage.waitForTimeout(6000);
                            const metrics = await perfPage.evaluate(() => window.__thinFilm.stopPerformance());
                            timingStopped = true;
                            const gfxObjects = await perfPage.evaluate(() => window.__filmGfx());
                            Object.assign(perfEntry, {
                                ...metrics,
                                gfxObjects,
                                precision,
                                httpDocument: {
                                    url: envReceipt.url,
                                    status: envReceipt.responseStatus,
                                    deliveredHeaders: envReceipt.deliveredHeaders,
                                    method: 'Real HTTP isolation proxy; exact source bytes; no route.fulfill',
                                },
                            });
                            e.shaderCompile = [
                                ...(e.shaderCompile || []),
                                ...(await perfPage.evaluate(() => window.__filmCompile)),
                            ];
                        } catch (error) {
                            perfEntry.error = String(error.stack || error);
                            e.error = perfEntry.error;
                        } finally {
                            try {
                                if (timingStarted && !timingStopped)
                                    perfEntry.failureStop = await perfPage.evaluate(() =>
                                        window.__thinFilm.stopPerformance(),
                                    );
                            } catch (error) {
                                e.pageErrors.push('failure stop: ' + String(error.stack || error));
                            }
                            try {
                                const constructed =
                                    ready || (await perfPage.evaluate(() => !!window.__thinFilm?.ready));
                                if (constructed)
                                    perfEntry.release = await perfPage.evaluate(() => window.__thinFilm.release());
                            } catch (error) {
                                e.pageErrors.push('release: ' + String(error.stack || error));
                            }
                            await perfPage.close();
                            perfEntry.pageClosed = perfPage.isClosed();
                        }
                    }
                } else {
                    const normalPage = await browser.newPage({
                        viewport: { width: 640, height: 400 },
                        deviceScaleFactor: 1,
                    });
                    normalPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                    normalPage.on('console', (x) => {
                        if (x.type() === 'error') e.consoleErrors.push(x.text());
                    });
                    await normalPage.goto(`${server.origin}/${EXAMPLE}/`);
                    await normalPage.waitForFunction(() => window.__thinFilm?.ready);
                    await normalPage.waitForTimeout(250);
                    const parameterBefore = await normalPage.evaluate(() => window.__thinFilm.snapshot());
                    await normalPage.locator('[data-parameter=phase]').focus();
                    await normalPage.keyboard.press('ArrowRight');
                    const parameterAfter = await normalPage.evaluate(() => window.__thinFilm.snapshot());
                    await normalPage.keyboard.press('Home');
                    await normalPage.locator('#pause').click();
                    const pauseBefore = await normalPage.evaluate(() => window.__thinFilm.snapshot());
                    await normalPage.waitForTimeout(160);
                    const pauseAfter = await normalPage.evaluate(() => window.__thinFilm.snapshot());
                    await normalPage.locator('#resume').click();
                    const resumeBefore = await normalPage.evaluate(() => window.__thinFilm.snapshot());
                    await normalPage.waitForTimeout(200);
                    const resumeAfter = await normalPage.evaluate(() => window.__thinFilm.snapshot());
                    await normalPage.locator('#reset').click();
                    const reset = await normalPage.evaluate(() => window.__thinFilm.snapshot());
                    const nativeRelease = await normalPage.evaluate(() => window.__thinFilm.release());
                    e.normal = {
                        parameter: { before: parameterBefore, after: parameterAfter },
                        pause: { before: pauseBefore, after: pauseAfter },
                        resume: { before: resumeBefore, after: resumeAfter },
                        reset,
                        events: reset.events,
                        release: nativeRelease,
                    };
                    await normalPage.close();
                    await page.goto(`${server.origin}/${EXAMPLE}/?test=1`);
                    await page.waitForFunction(() => window.__thinFilm?.ready);
                    const captures = [
                        ['circle', {}],
                        ['box', { shape: 'rounded-box' }],
                        ['phase-one', { phase: 1 }],
                        ['light-zero', { lightAngle: 0 }],
                        ['light-half', { lightAngle: 180 }],
                        ['opacity-zero', { opacity: 0 }],
                        ['opacity-half', { opacity: 0.5 }],
                        ['background-light', { opacity: 0.5 }],
                    ];
                    for (const [id, patch] of captures) {
                        const params = { ...oracle.defaults(), ...patch };
                        const presentation = {
                            background: id === 'background-light' ? [180, 160, 140] : [16, 32, 48],
                            linearDiagnostic: id === 'linear-core',
                        };
                        await page.evaluate((p) => window.__thinFilm.setPresentation(p), presentation);
                        await page.evaluate((p) => window.__thinFilm.set(p), params);
                        await page.evaluate(() => window.__thinFilm.setTime(0.125));
                        const snapshot = await page.evaluate(() => window.__thinFilm.step(0));
                        await page.waitForTimeout(30);
                        const png = path.join(artifacts, `${engine}-${id}.png`);
                        await page.screenshot({ path: png });
                        const audit = oracle.pngAudit(png, params, 0.125, presentation);
                        e.captures.push({
                            id,
                            params,
                            time: 0.125,
                            presentation,
                            snapshot,
                            png: fileIdentity(png),
                            audit,
                        });
                        console.log(JSON.stringify({ engine, capture: id, errors: audit.errors }));
                    }
                    for (const b of oracle.boundaryPlan()) {
                        const params = { ...oracle.defaults(), [b.parameter]: b.value };
                        const before = await page.evaluate(() => window.__thinFilm.snapshot());
                        const receipt = await page.evaluate((p) => window.__thinFilm.set(p), params);
                        if (receipt.ok) await page.evaluate(() => window.__thinFilm.step(0));
                        const after = await page.evaluate(() => window.__thinFilm.snapshot());
                        e.boundaries.push({ ...b, params, before, receipt, after });
                    }
                    const invalids = await page.evaluate(async () => {
                        const base = window.__thinFilm.snapshot().params;
                        return Promise.all(
                            [null, { ...base, unknown: 1 }, { ...base, phase: NaN }, { ...base, phase: Infinity }].map(
                                (p) => window.__thinFilm.set(p),
                            ),
                        );
                    });
                    e.invalids = invalids;
                    await page.evaluate(() =>
                        window.__thinFilm.setPresentation({ background: [16, 32, 48], linearDiagnostic: false }),
                    );
                    await page.evaluate((p) => window.__thinFilm.set(p), oracle.defaults());
                    await page.evaluate(() => window.__thinFilm.step(0));
                    await page.evaluate((p) => window.__thinFilm.set({ ...p, opacity: 0.5 }), oracle.defaults());
                    e.core = await page.evaluate(() => window.__thinFilm.coreProbe());
                    await page.evaluate((p) => window.__thinFilm.set(p), oracle.defaults());
                    e.resources = await page.evaluate(() => window.__thinFilm.cycles());
                    const before = await page.evaluate(() => window.__thinFilm.snapshot());
                    await page.setViewportSize({ width: 480, height: 320 });
                    await page.waitForTimeout(250);
                    const resizeFrames = await page.evaluate(async () => {
                        const rows = [];
                        for (let i = 0; i < 5; i++) rows.push(await window.__thinFilm.step(0));
                        return rows;
                    });
                    const after = resizeFrames.at(-1);
                    await page.evaluate(
                        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    );
                    const resizePng = path.join(artifacts, `${engine}-live-resize.png`);
                    await page.waitForTimeout(80);
                    await page.screenshot({ path: resizePng });
                    const resizeAudit = oracle.pngAudit(resizePng, oracle.defaults(), before.time);
                    e.resize = {
                        before,
                        after,
                        resizeFrames,
                        png: fileIdentity(resizePng),
                        audit: resizeAudit,
                        presentationWaitMs: 80,
                    };
                    const recreated = await page.evaluate(() => window.__thinFilm.recreate());
                    const terminal = await page.evaluate(async () => {
                        const x = window.__thinFilm.release(),
                            y = window.__thinFilm.release();
                        const release = await x;
                        let terminalCode;
                        try {
                            await window.__thinFilm.step(0);
                        } catch (error) {
                            terminalCode = error.code;
                        }
                        return { release, samePromise: x === y, terminalCode };
                    });
                    e.lifecycle = { recreated, ...terminal };
                    e.shaderCompile = await page.evaluate(() => window.__filmCompile);
                }
            } catch (error) {
                e.error = String(error.stack || error);
            } finally {
                await page.close().catch(() => {});
                await browser.close();
            }
        }
    } finally {
        report.cleanup = { proxyClosed: phase !== 'performance', serverClosed: false, errors: [] };
        try {
            if (isolationProxy) {
                await isolationProxy.close();
                report.cleanup.proxyClosed = isolationProxy.closed;
            }
        } catch (error) {
            report.cleanup.errors.push(String(error.stack || error));
        }
        try {
            await server.close();
            report.cleanup.serverClosed = true;
        } catch (error) {
            report.cleanup.errors.push(String(error.stack || error));
        }
        report.endedAt = new Date().toISOString();
        report.validation = validateFiles(report);
        report.scopePassed = report.validation.ok;
        report.exitCode = report.scopePassed ? 0 : 1;
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ out, scopePassed: report.scopePassed, errors: report.validation.errors }));
    }
    return report.exitCode;
}
module.exports = { main, validateFiles, validatePerformanceEnvironment, INPUTS, profiles };
if (require.main === module)
    main()
        .then((code) => (process.exitCode = code))
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
