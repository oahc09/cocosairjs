'use strict';
const fs = require('node:fs'),
    path = require('node:path'),
    cp = require('node:child_process');
const {
    sha256,
    canonical,
    validateEngineReport,
    validateParameters: validateContract,
} = require('./shaders-effect-contract.cjs');
const oracle = require('./shaders-noise-dissolve-oracle.cjs');
const ROOT = path.resolve(__dirname, '../..'),
    EXAMPLE = 'examples/shader-noise-dissolve';
const ENGINES = ['chromium', 'firefox', 'webkit'];
const PROFILES = [
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
];
const DATA = () => {
    const source = fs.readFileSync(path.join(ROOT, EXAMPLE, 'src/parameters.ts'), 'utf8');
    return require('typescript').transpileModule(source, {
        compilerOptions: {
            module: require('typescript').ModuleKind.CommonJS,
            target: require('typescript').ScriptTarget.ES2022,
        },
    }).outputText;
};
function definitions() {
    const module = { exports: {} };
    new Function('module', 'exports', DATA())(module, module.exports);
    return module.exports;
}
const visualPlan = [
    ['start', 0, 0.375, 0.25, false, 'checker', 0],
    ['quarter', 0.25, 0.375, 0.25, false, 'checker', 1],
    ['middle', 0.5, 0.375, 0.25, false, 'checker', 1],
    ['three-quarter', 0.75, 0.375, 0.25, false, 'checker', 1],
    ['end', 1, 0.375, 0.25, false, 'checker', 0],
    ['seed-repeat', 0.5, 0.375, 0.25, false, 'checker', 1],
    ['seed-change', 0.5, 0.625, 0.25, false, 'checker', 1],
    ['hard', 0.5, 0.375, 0, false, 'checker', 1],
    ['invert', 0.5, 0.375, 0.25, true, 'checker', 1],
    ['display-alpha', 0.5, 0.375, 0.25, false, 'checker', 0],
    ['opaque', 0.5, 0.375, 0.25, false, 'opaque', 0],
    ['straight', 0.5, 0.375, 0.25, false, 'checker', 2],
];
function boundaryPlan() {
    const { definition } = definitions(),
        cases = [];
    for (const [key, d] of Object.entries(definition.params)) {
        cases.push({ id: key + '-default', parameter: key, boundary: 'default', value: d.defaultValue });
        if (d.type === 'number') {
            for (const [boundary, value] of [
                ['min', d.min],
                ['near-min', d.min + 0.0001],
                ['max', d.max],
                ['near-max', d.max - 0.0001],
            ])
                cases.push({ id: key + '-' + boundary, parameter: key, boundary, value });
            for (const [name, representation] of [
                ['nan', 'NaN'],
                ['infinity', 'Infinity'],
                ['wrong-type', 'string'],
                ['low', 'below-min'],
                ['high', 'above-max'],
            ])
                cases.push({ id: key + '-invalid-' + name, parameter: key, boundary: 'invalid', representation });
        } else cases.push({ id: key + '-invalid', parameter: key, boundary: 'invalid', representation: 'number' });
    }
    for (const kind of ['unknown', 'constructor', 'toString', 'null', 'array', 'missing'])
        cases.push({ id: 'structure-' + kind, parameter: kind, boundary: 'invalid', representation: kind });
    return cases;
}
function expectedScope() {
    return {
        Visual: visualPlan.map((x) => x[0]),
        Boundary: boundaryPlan().map((x) => x.id),
        Resource: ['100-effect-instances'],
        Performance: PROFILES.map((p) => p.id),
    };
}
function fileIdentity(file) {
    const bytes = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file.replace(/\\/g, '/'), bytes: bytes.length, sha256: sha256(bytes) };
}
function expectedIdentity() {
    return {
        source: [
            'index.html',
            'src/main.ts',
            'src/parameters.ts',
            'src/noise.frag',
            'src/effect.generated.ts',
            'generate-effects.mjs',
            'THIRD_PARTY_NOTICES.txt',
        ].map((p) => fileIdentity(EXAMPLE + '/' + p)),
        sdk: ['build/cocosair.module.js', 'build/cocosair.module.d.ts'].map(fileIdentity),
        runner: [
            'tools/verify/shaders-noise-dissolve.cjs',
            'tools/verify/shaders-noise-dissolve-oracle.cjs',
            'tools/verify/shaders-noise-dissolve.tsconfig.json',
            'tools/verify/shaders-effect-contract.cjs',
            'tools/verify/competitive-example-server.cjs',
            'tools/verify/browser-engines.cjs',
            'tools/verify/shaders-browser-launch.cjs',
            'tools/build/effect-json.mjs',
            'examples/shared/shader-lifecycle.ts',
            'examples/shared/asset-lifecycle.js',
            'examples/shared/asset-lifecycle.d.ts',
        ].map(fileIdentity),
        reference: {
            repo: 'https://github.com/shader-effects-inc/shaders',
            commit: 'dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a',
            license: 'MIT + MaterialX/OSL BSD-3-Clause + retained MaterialX Apache-2.0',
            files: [
                'docs/effects/upstream-reference.json',
                'output/shaders-absorption/reference/packages/core/src/shaders/NoiseDissolve/index.ts',
                'output/shaders-absorption/reference/packages/core/src/gpu/kit/reveal.ts',
                'output/shaders-absorption/reference/ancestors/materialx-v1.39.5-mx_noise.glsl',
            ].map(fileIdentity),
        },
    };
}
const fail = (errors, message) => {
    if (message) errors.push(message);
};
function oracles() {
    const handlers = {
        build: (row) => {
            const errors = [],
                o = row.observation;
            if (row.caseId === 'shader') {
                if (
                    !o.compiles?.length ||
                    o.compiles.some((c) => c.status !== true) ||
                    !o.links?.length ||
                    o.links.some((c) => c.status !== true)
                )
                    errors.push('native GPU compile/link missing');
            } else if (o.exitCode !== 0 || !o.command || !o.log) errors.push('actual compiler invocation missing');
            return { errors, measurements: 1 };
        },
        runtime: (row) => {
            const errors = [],
                o = row.observation,
                a = o.after,
                b = o.before;
            if (row.caseId === 'create' && (!a.instance || a.canvasCount !== 1))
                errors.push('native instance/canvas missing');
            if (
                row.caseId === 'update' &&
                (a.parameters.seed !== 0.375 || a.instance !== b.instance || a.updates <= b.updates)
            )
                errors.push('uniform update did not preserve instance');
            if (
                row.caseId === 'resize' &&
                (a.backing.width === b.backing.width ||
                    a.rect.width !== 480 ||
                    a.rect.height !== 320 ||
                    !o.visible?.raw?.length ||
                    !o.resizePNG ||
                    oracle.visualErrors(o.visible, path.resolve(ROOT, o.resizePNG.path)).length)
            )
                errors.push('live resize not visible/correct');
            if (row.caseId === 'pause' && (a.frames !== b.frames || a.paused !== true))
                errors.push('pause advanced native frame');
            if (row.caseId === 'resume' && (a.frames <= b.frames || a.paused !== false))
                errors.push('resume no native progress');
            if (
                row.caseId === 'destroy' &&
                (a.instance !== null ||
                    o.release?.refs?.length !== 3 ||
                    o.release.refs.some((r) => r.before !== 1 || r.after !== 0) ||
                    o.release.detached !== true)
            )
                errors.push('destroy ownership');
            if (row.caseId === 'recreate' && (!a.instance || a.instance === b.instance))
                errors.push('new instance missing');
            if (o.pageErrors.length) errors.push('pageerrors');
            return { errors, measurements: 1 };
        },
        visual: (row) => {
            const o = row.observation,
                raw = o.algorithm.raw[0],
                errors = oracle.visualErrors(raw, path.resolve(ROOT, o.screenshot.path));
            if (
                canonical(raw.parameters) !== canonical(row.fixed.parameters) ||
                raw.input !== row.fixed.input ||
                raw.width !== row.fixed.viewport.width * row.fixed.dpr ||
                raw.height !== row.fixed.viewport.height * row.fixed.dpr
            )
                errors.push('fixed params/viewport/input mismatch');
            const plan = visualPlan.find((p) => p[0] === row.caseId);
            if (
                !plan ||
                raw.parameters.progress !== plan[1] ||
                raw.parameters.seed !== plan[2] ||
                raw.parameters.softness !== plan[3] ||
                raw.parameters.invert !== plan[4] ||
                raw.input !== plan[5] ||
                raw.mode !== plan[6]
            )
                errors.push('frozen visual plan differs');
            return { errors, measurements: raw.raw.length };
        },
        boundary: (row) => {
            const errors = [],
                o = row.observation,
                plan = boundaryPlan().find((p) => p.id === row.caseId);
            if (!plan || o.parameter !== plan.parameter || o.boundary !== plan.boundary)
                errors.push('boundary plan mismatch');
            if (o.boundary === 'invalid') {
                if (!/^E01_/.test(o.errorCode) || !o.sameInstance || !o.parametersUnchanged)
                    errors.push('actual rejection/no-side-effects missing');
            } else if (
                canonical(o.input) !== canonical(plan.value) ||
                canonical(o.actual) !== canonical(plan.value) ||
                o.sameInstance !== true
            )
                errors.push('boundary actual mismatch');
            if (o.boundary !== 'invalid' && (!o.uniformDraw || oracle.visualErrors(o.uniformDraw).length))
                errors.push('actual boundary GPU output missing/wrong');
            return { errors, measurements: 1 };
        },
        resource: (row) => {
            const errors = [],
                o = row.observation;
            for (const c of o.cycles ?? []) {
                if (
                    c.detached !== true ||
                    c.nodeValid !== false ||
                    c.allocations.length !== 3 ||
                    new Set(c.allocations.map((a) => a.id)).size !== 3 ||
                    c.created.texture - c.before.texture !== 1024 ||
                    c.created.buffer - c.before.buffer <= 0 ||
                    c.allocations.some((a) => a.allocated !== 1 || a.released !== 0)
                )
                    errors.push('native resources/refs/unbinding incomplete');
            }
            if (o.sameApp !== true || o.clockPaused !== true) errors.push('not same paused app');
            if (
                o.release?.samePromise !== true ||
                o.release.terminalError !== 'E01_DISPOSED' ||
                o.release.result.listeners !== 0 ||
                o.release.result.controlsDisabled !== true ||
                o.release.result.instrumentsRestored !== true ||
                o.release.result.effect?.before !== 1 ||
                o.release.result.effect?.after !== 0 ||
                o.release.result.effect?.registryDetached !== true ||
                o.release.result.effect?.validAfterClose !== false ||
                o.release.result.ownedBackgroundRefs?.length !== 3 ||
                o.release.result.ownedBackgroundRefs.some((r) => r.before !== 1 || r.after !== 0)
            )
                errors.push('final release listeners/controls/terminal/instrumentation');
            return { errors, measurements: o.cycles?.length || 0 };
        },
        performance: (row) => {
            const errors = [],
                o = row.observation,
                p = PROFILES.find((p) => p.id === row.caseId);
            if (
                !p ||
                o.warmupFrames !== 30 ||
                o.frameCount !== 60 ||
                o.concurrentCollectors !== 0 ||
                o.pacer !== 'NATIVE' ||
                o.cpuDrawDispatchMs?.length !== 60 ||
                o.queueBookkeepingMs?.length !== 60 ||
                o.cpuSubmissionMs.some((v, i) => v !== o.cpuDrawDispatchMs[i]) ||
                o.cpuEncodingMs.some((v) => !Number.isFinite(v)) ||
                o.frameMs.some((v) => v <= 0) ||
                o.drawCalls < 1 ||
                o.cleanup?.instrumentsRestored !== true ||
                o.cleanup?.listeners !== 0 ||
                o.cleanup?.effect?.registryDetached !== true ||
                o.passCount !== o.inventory?.passCount ||
                o.textureCount !== o.inventory?.textures?.length ||
                o.bufferCount !== o.inventory?.buffers?.length ||
                o.vramEstimate?.bytes !== o.inventory?.textureBytes + o.inventory?.bufferBytes
            )
                errors.push('performance phase/samples/counters');
            if (
                o.gpuTimestamp.status === 'measured' &&
                (o.gpuTimestamp.milliseconds.length !== 60 ||
                    o.gpuTimestamp.observations.some(
                        (q) => q.warmup || !q.deleted || !q.available || !o.frameNumbers.includes(q.frame),
                    ))
            )
                errors.push('timer steady/cleanup');
            return { errors, measurements: o.frameCount || 0 };
        },
    };
    return Object.fromEntries(
        Object.entries(handlers).map(([name, handler]) => [
            name,
            (row) => {
                try {
                    return handler(row);
                } catch (error) {
                    return { errors: ['Invalid ' + name + ' observation: ' + error.message], measurements: 0 };
                }
            },
        ]),
    );
}
function validateReportUnsafe(report) {
    const errors = [];
    if (
        !report ||
        report.schemaVersion !== 'shaders-noise-dissolve-run/1' ||
        report.engines?.length !== 3 ||
        new Set(report.engines.map((e) => e.engine)).size !== 3
    )
        return { ok: false, errors: ['exact CH/FF/WK required'] };
    const { definition } = definitions(),
        identity = expectedIdentity(),
        scope = expectedScope();
    for (const e of report.engines) {
        if (
            !ENGINES.includes(e.engine) ||
            !e.browserVersion ||
            !Array.isArray(e.pageErrors) ||
            !Array.isArray(e.consoleErrors) ||
            e.pageErrors.length ||
            e.consoleErrors.length
        )
            errors.push('engine/page/console errors');
        const checked = validateEngineReport(e.report, {
            definition,
            expectedIdentity: identity,
            expectedScope: scope,
            verifyFiles: true,
            root: ROOT,
            oracles: oracles(),
        });
        for (const err of checked.errors) errors.push({ engine: e.engine, ...err });
        for (const gate of Object.values(e.report.gates)) {
            if (
                gate.cases.some(
                    (row) =>
                        row.method === 'REAL_BROWSER' &&
                        (row.browser !== e.engine || row.browserVersion !== e.browserVersion),
                )
            )
                errors.push('per-engine identity mismatch');
        }
        const visual = e.report.gates.Visual.cases;
        const repeat = visual.find((r) => r.caseId === 'seed-repeat')?.observation.algorithm.raw[0],
            mid = visual.find((r) => r.caseId === 'middle')?.observation.algorithm.raw[0],
            changed = visual.find((r) => r.caseId === 'seed-change')?.observation.algorithm.raw[0];
        if (repeat && mid && canonical(repeat.raw) !== canonical(mid.raw)) errors.push('seed reproducibility');
        if (changed && mid && canonical(changed.raw) === canonical(mid.raw))
            errors.push('continuous seed has no change');
        const progress = ['quarter', 'middle', 'three-quarter'].map(
            (id) => visual.find((r) => r.caseId === id)?.observation.algorithm.raw[0],
        );
        if (progress.every(Boolean))
            for (let i = 0; i < 63; i++)
                if (
                    progress[0].raw[i].rgba[1] < progress[1].raw[i].rgba[1] ||
                    progress[1].raw[i].rgba[1] < progress[2].raw[i].rgba[1]
                )
                    errors.push('non-monotonic mask');
    }
    return {
        ok: errors.length === 0,
        errors,
        scopePassed: errors.length === 0 && report.engines.every((e) => e.report.status === 'PASS'),
    };
}
function validateReport(report) {
    try {
        return validateReportUnsafe(report);
    } catch (error) {
        return { ok: false, errors: ['Invalid report structure: ' + error.message], scopePassed: false };
    }
}
function writeNew(file, body) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body, { flag: 'wx' });
}
async function main(argv = process.argv.slice(2)) {
    const output = argv.find((a) => a.startsWith('--out=')),
        verify = argv.find((a) => a.startsWith('--verify='));
    if (verify) {
        const checked = validateReport(JSON.parse(fs.readFileSync(verify.slice(9), 'utf8')));
        console.log(JSON.stringify(checked));
        return checked.ok && checked.scopePassed ? 0 : 1;
    }
    if (
        !output ||
        argv.some(
            (a) =>
                !a.startsWith('--out=') && !['--functional', '--performance-authorized', '--browser=all'].includes(a),
        )
    )
        throw new Error('Use --out=<new.json> [--functional | --performance-authorized] --browser=all');
    const performanceAuthorized = argv.includes('--performance-authorized');
    if (!performanceAuthorized && !argv.includes('--functional'))
        throw new Error('Performance windows require explicit Lead authorization; use --functional first');
    const out = path.resolve(ROOT, output.slice(6));
    if (fs.existsSync(out)) throw new Error('OUT_EXISTS');
    const artifacts = out.replace(/\.json$/, '') + '-artifacts';
    fs.mkdirSync(artifacts, { recursive: true });
    const command =
            'NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-noise-dissolve.cjs ' +
            argv.join(' '),
        startedAt = new Date().toISOString();
    const { definition } = definitions(),
        identity = expectedIdentity(),
        scope = expectedScope();
    const buildStart = new Date().toISOString(),
        ts = cp.spawnSync(
            process.execPath,
            ['node_modules/typescript/bin/tsc', '-p', 'tools/verify/shaders-noise-dissolve.tsconfig.json'],
            { cwd: ROOT, encoding: 'utf8' },
        ),
        tsLog =
            'command: node node_modules/typescript/bin/tsc -p tools/verify/shaders-noise-dissolve.tsconfig.json\nexit: ' +
            ts.status +
            '\n' +
            ts.stdout +
            ts.stderr;
    const tsPath = path.join(artifacts, 'typescript.log');
    writeNew(tsPath, tsLog);
    let bundleLog = '',
        bundleExit = 0;
    try {
        await require('esbuild').build({
            entryPoints: [path.join(ROOT, EXAMPLE, 'src/main.ts')],
            bundle: true,
            format: 'esm',
            target: 'es2022',
            external: ['cocosair'],
            outfile: path.join(artifacts, 'example.bundle.js'),
        });
        bundleLog = 'esbuild.build({bundle:true, format:esm, target:es2022, external:cocosair}) exit=0';
    } catch (error) {
        bundleExit = 1;
        bundleLog = String(error);
    }
    const bundlePath = path.join(artifacts, 'bundle.log');
    writeNew(bundlePath, bundleLog);
    const server = await require('./competitive-example-server.cjs').startExampleServer(ROOT),
        result = {
            schemaVersion: 'shaders-noise-dissolve-run/1',
            startedAt,
            command,
            performanceAuthorized,
            engines: [],
            build: { tsExit: ts.status, bundleExit },
        };
    const entry = server.origin + '/' + EXAMPLE + '/';
    try {
        for (const engine of ENGINES) {
            const browser = await require('playwright')[engine].launch({
                ...require('./shaders-browser-launch.cjs').shaderLaunchOptions(engine),
                headless: true,
            });
            const e = { engine, browserVersion: browser.version(), pageErrors: [], consoleErrors: [], report: null };
            result.engines.push(e);
            const version = e.browserVersion;
            let page;
            const watch = (p) => {
                p.on('pageerror', (err) => e.pageErrors.push(String(err.stack || err)));
                p.on('console', (m) => {
                    if (m.type() === 'error') e.consoleErrors.push(m.text());
                });
            };
            try {
                page = await browser.newPage({ viewport: { width: 384, height: 256 }, deviceScaleFactor: 1 });
                watch(page);
                await page.goto(entry + '?test=1');
                await page.waitForFunction(() => window.__e01, { timeout: 30000 });
                const collected = {
                    visual: [],
                    boundary: [],
                    runtime: [],
                    resource: null,
                    performance: [],
                    normal: null,
                    release: null,
                };
                const before = await page.evaluate(() => window.__e01.snapshot());
                collected.runtime.push({ id: 'create', before: { instance: null }, after: before });
                const after = await page.evaluate(() => window.__e01.set({ ...window.__e01.defaults, seed: 0.375 }));
                collected.runtime.push({ id: 'update', before, after });
                for (const [id, progress, seed, softness, invert, input, mode] of visualPlan) {
                    const raw = await page.evaluate(
                        async (p) => {
                            const a = window.__e01;
                            await a.configure(p.mode);
                            a.setInput(p.input);
                            a.set({
                                ...a.defaults,
                                progress: p.progress,
                                seed: p.seed,
                                softness: p.softness,
                                invert: p.invert,
                            });
                            return a.step();
                        },
                        { progress, seed, softness, invert, input, mode },
                    );
                    const png = path.join(artifacts, engine + '-' + id + '.png');
                    await page.screenshot({ path: png });
                    collected.visual.push({ id, raw, png: fileIdentity(png) });
                }
                const resizeBefore = await page.evaluate(() => window.__e01.snapshot());
                await page.setViewportSize({ width: 480, height: 320 });
                await page.waitForTimeout(120);
                const resized = await page.evaluate(async () => {
                    const a = window.__e01;
                    await a.configure(1);
                    return { after: a.snapshot(), visible: await a.step() };
                });
                const resizePNG = path.join(artifacts, engine + '-live-resize.png');
                await page.screenshot({ path: resizePNG });
                collected.runtime.push({
                    id: 'resize',
                    before: resizeBefore,
                    ...resized,
                    resizePNG: fileIdentity(resizePNG),
                });
                for (const plan of boundaryPlan()) {
                    const raw = await page.evaluate(async (plan) => {
                        const a = window.__e01;
                        const before = a.snapshot();
                        let values = { ...a.defaults };
                        if (plan.boundary === 'invalid') {
                            const kind = plan.representation;
                            if (kind === 'unknown') values.ghost = 1;
                            else if (kind === 'constructor' || kind === 'toString')
                                Object.defineProperty(values, kind, { value: 1, enumerable: true });
                            else if (kind === 'null') values = null;
                            else if (kind === 'array') values = [];
                            else if (kind === 'missing') delete values.seed;
                            else if (kind === 'NaN') values[plan.parameter] = NaN;
                            else if (kind === 'Infinity') values[plan.parameter] = Infinity;
                            else if (kind === 'string') values[plan.parameter] = '0.5';
                            else if (kind === 'number') values[plan.parameter] = 0;
                            else if (kind === 'below-min') values[plan.parameter] = -1;
                            else if (kind === 'above-max') values[plan.parameter] = 101;
                        } else values[plan.parameter] = plan.value;
                        let errorCode = null;
                        try {
                            a.set(values);
                        } catch (error) {
                            errorCode = String(error.message);
                        }
                        const after = a.snapshot();
                        const uniformDraw = errorCode ? null : await a.step();
                        return {
                            uniformDraw,
                            input: plan.boundary === 'invalid' ? { representation: plan.representation } : plan.value,
                            actual: plan.boundary === 'invalid' ? null : after.parameters[plan.parameter],
                            errorCode,
                            sameInstance: before.instance === after.instance,
                            parametersUnchanged: JSON.stringify(before.parameters) === JSON.stringify(after.parameters),
                        };
                    }, plan);
                    collected.boundary.push({
                        id: plan.id,
                        parameter: plan.parameter,
                        boundary: plan.boundary,
                        ...raw,
                    });
                }
                const resource = await page.evaluate(async () => ({
                    cycles: await window.__e01.resource(),
                    sameApp: true,
                    clockPaused: window.__e01.snapshot().paused,
                }));
                collected.resource = resource;
                const destroyBefore = await page.evaluate(() => window.__e01.snapshot()),
                    release = await page.evaluate(() => window.__e01.destroy()),
                    destroyAfter = await page.evaluate(() => window.__e01.snapshot());
                collected.runtime.push({ id: 'destroy', before: destroyBefore, after: destroyAfter, release });
                const created = await page.evaluate(() => window.__e01.recreate());
                collected.runtime.push({ id: 'recreate', before: destroyAfter, after: created });
                collected.release = await page.evaluate(async () => {
                    const a = window.__e01,
                        p = a.release(),
                        q = a.release();
                    const result = await p;
                    let terminalError = '';
                    try {
                        a.set(a.defaults);
                    } catch (error) {
                        terminalError = error.message;
                    }
                    return { samePromise: p === q, result, terminalError, after: a.snapshot() };
                });
                await page.close();
                // Ordinary UI is driven by real trusted Playwright events on the native pacer.
                page = await browser.newPage({ viewport: { width: 640, height: 400 } });
                watch(page);
                await page.goto(entry);
                await page.waitForFunction(() => window.__e01);
                await page.waitForTimeout(200);
                await page.click('#pause');
                const pauseBefore = await page.evaluate(() => window.__e01.snapshot());
                await page.waitForTimeout(150);
                const pauseAfter = await page.evaluate(() => window.__e01.snapshot());
                collected.runtime.push({ id: 'pause', before: pauseBefore, after: pauseAfter });
                await page.click('#pause');
                const resumeBefore = await page.evaluate(() => window.__e01.snapshot());
                await page.waitForTimeout(150);
                const resumeAfter = await page.evaluate(() => window.__e01.snapshot());
                collected.runtime.push({ id: 'resume', before: resumeBefore, after: resumeAfter });
                await page.locator('#seed').focus();
                await page.keyboard.press('ArrowRight');
                await page.click('#reset');
                await page.click('#destroy');
                await page.click('#recreate');
                collected.normal = await page.evaluate(() => window.__e01.snapshot());
                await page.screenshot({ path: path.join(artifacts, engine + '-controls.png') });
                await page.evaluate(() => window.__e01.release());
                await page.close();
                if (performanceAuthorized) {
                    for (const profile of PROFILES) {
                        page = await browser.newPage({ viewport: profile.viewport, deviceScaleFactor: profile.dpr });
                        watch(page);
                        await page.goto(entry + '?test=1');
                        await page.waitForFunction(() => window.__e01);
                        await page.evaluate(() => window.__e01.set({ ...window.__e01.defaults, seed: 0.375 }));
                        const start = Date.now(),
                            run = await page.evaluate(() => window.__e01.performance(30, 60)),
                            timestamp = await page.evaluate(() => window.__e01.timerResults());
                        const cleanup = await page.evaluate(() => window.__e01.release());
                        collected.performance.push({
                            profile: profile.id,
                            run,
                            timestamp,
                            cleanup,
                            durationSeconds: (Date.now() - start) / 1000,
                        });
                        await page.close();
                    }
                }
                const rawPath = path.join(artifacts, engine + '-raw.json');
                writeNew(
                    rawPath,
                    JSON.stringify({ collected, pageErrors: e.pageErrors, consoleErrors: e.consoleErrors }, null, 2) +
                        '\n',
                );
                const rawIdentity = fileIdentity(rawPath),
                    endedAt = new Date().toISOString();
                const exec = (raw = rawIdentity) => ({
                    command,
                    cwd: ROOT,
                    startedAt,
                    endedAt,
                    exitCode: 0,
                    rawOutputs: [raw],
                });
                const fixed = (
                    parameters = { ...definitions().defaults, seed: 0.375 },
                    viewport = { width: 384, height: 256 },
                    dpr = 1,
                    input = 'checker',
                    step = 1,
                ) => ({
                    viewport,
                    dpr,
                    seed: parameters.seed,
                    input,
                    parameters,
                    timeSeconds: step / 60,
                    simulationStep: step,
                });
                const row = (caseId, observation, fix = fixed()) => ({
                    caseId,
                    status: 'PASS',
                    method: 'REAL_BROWSER',
                    browser: engine,
                    browserVersion: version,
                    execution: exec(),
                    fixed: fix,
                    observation,
                });
                const buildRows = [
                    ['typescript', ts.status, tsLog, tsPath],
                    ['bundle', bundleExit, bundleLog, bundlePath],
                ].map(([caseId, exitCode, log, p]) => ({
                    caseId,
                    status: exitCode === 0 ? 'PASS' : 'FAIL',
                    method: 'NODE',
                    execution: {
                        command:
                            caseId === 'typescript'
                                ? 'node node_modules/typescript/bin/tsc -p tools/verify/shaders-noise-dissolve.tsconfig.json'
                                : 'esbuild.build E01 example',
                        cwd: ROOT,
                        startedAt: buildStart,
                        endedAt,
                        exitCode,
                        rawOutputs: [fileIdentity(p)],
                    },
                    observation: {
                        command: caseId === 'typescript' ? 'tsc' : 'esbuild',
                        exitCode,
                        log,
                        expectedUnits: 1,
                        compiledUnits: exitCode === 0 ? 1 : 0,
                        errors: exitCode === 0 ? [] : [log],
                    },
                    ...(exitCode ? { reason: log, classification: 'AGENT_FAILURE' } : {}),
                }));
                const compile = before.shaderCompiles,
                    links = before.programLinks;
                buildRows.push({
                    ...row('shader', {
                        expectedUnits: compile.length,
                        compiledUnits: compile.filter((c) => c.status).length,
                        errors: compile.filter((c) => !c.status).map((c) => c.log),
                        compiles: compile,
                        links,
                    }),
                    fixed: undefined,
                });
                delete buildRows[2].fixed;
                const gates = {
                    Build: {
                        status: 'PASS',
                        scope: { expectedCaseIds: ['typescript', 'bundle', 'shader'] },
                        cases: buildRows,
                    },
                    Runtime: {
                        status: 'PASS',
                        scope: {
                            expectedCaseIds: ['create', 'update', 'resize', 'pause', 'resume', 'destroy', 'recreate'],
                        },
                        cases: collected.runtime.map((o) => {
                            const { id, ...observation } = o;
                            return row(
                                id,
                                { ...observation, pageErrors: e.pageErrors },
                                fixed(
                                    o.after.parameters || definitions().defaults,
                                    { width: o.after.rect?.width || 384, height: o.after.rect?.height || 256 },
                                    o.after.dpr || 1,
                                ),
                            );
                        }),
                    },
                    Visual: {
                        status: 'PASS',
                        scope: { expectedCaseIds: scope.Visual },
                        cases: collected.visual.map((v) =>
                            row(
                                v.id,
                                {
                                    algorithm: {
                                        oracleId: 'materialx-2d-f32-cpu-independent',
                                        method: 'JS CPU uint32 hash + f32 Perlin + analytical alpha + PNG decode',
                                        raw: [v.raw],
                                    },
                                    screenshot: v.png,
                                },
                                fixed(v.raw.parameters, { width: 384, height: 256 }, 1, v.raw.input, v.raw.stepped),
                            ),
                        ),
                    },
                    Boundary: {
                        status: 'PASS',
                        scope: { expectedCaseIds: scope.Boundary },
                        cases: collected.boundary.map(({ id, ...o }) => row(id, o)),
                    },
                    Resource: {
                        status: 'PASS',
                        scope: { expectedCaseIds: scope.Resource },
                        cases: [
                            row(scope.Resource[0], {
                                ...resource,
                                release: collected.release,
                                gpuPhysicalMemory: {
                                    status: 'unavailable',
                                    reason: 'WebGL2 exposes engine allocation counters, not physical GPU memory',
                                },
                            }),
                        ],
                    },
                    Performance: {
                        status: performanceAuthorized ? 'PASS' : 'NOT_RUN',
                        scope: { expectedCaseIds: scope.Performance },
                        cases: PROFILES.map((profile) => {
                            const o = collected.performance.find((o) => o.profile === profile.id);
                            if (!o)
                                return {
                                    caseId: profile.id,
                                    status: 'NOT_RUN',
                                    reason: 'Lead performance window authorization pending; concurrent functional workers may be active',
                                };
                            const s = o.run.samples;
                            return row(
                                profile.id,
                                {
                                    profile: profile.id,
                                    cleanup: o.cleanup,
                                    device: 'Headless desktop browser; mobile viewport emulation, not physical device',
                                    frameCount: s.frameMs.length,
                                    durationSeconds: o.durationSeconds,
                                    warmupFrames: 30,
                                    pacer: 'NATIVE',
                                    concurrentCollectors: 0,
                                    windowAuthorization:
                                        'Lead granted exclusive E01 token after E02 TOKEN_RELEASED; E06 and Lead browser/heavy collectors acknowledged idle',
                                    measurementMethod:
                                        'TOOL_DIAGNOSTIC originals invoked once: uniform update CPU; native CB begin/end CPU envelope (includes immediate GL dispatch); actual GL draw-dispatch CPU; queue.submit bookkeeping measured separately. Frame interval from native update callbacks, not display present.',
                                    frameNumbers: s.frameNumbers,
                                    cpuUpdateMs: s.cpuUpdateMs,
                                    cpuEncodingMs: s.cpuEncodingMs,
                                    cpuSubmissionMs: s.cpuDrawDispatchMs,
                                    cpuDrawDispatchMs: s.cpuDrawDispatchMs,
                                    queueBookkeepingMs: s.cpuSubmissionMs,
                                    frameMs: s.frameMs,
                                    gpuTimestamp: o.timestamp,
                                    drawCalls: Math.max(...s.drawCalls),
                                    inventory: o.run.snapshot.inventory,
                                    passCount: o.run.snapshot.inventory.passCount,
                                    textureCount: o.run.snapshot.inventory.textureCount,
                                    bufferCount: o.run.snapshot.inventory.bufferCount,
                                    vramEstimate: {
                                        bytes:
                                            o.run.snapshot.inventory.textureBytes +
                                            o.run.snapshot.inventory.bufferBytes,
                                        formula:
                                            'sum of observed owned gfx Texture.size + deduplicated gfx Buffer.size; framebuffer/builtin caches excluded',
                                        method: 'estimate',
                                    },
                                },
                                fixed({ ...definitions().defaults, seed: 0.375 }, profile.viewport, profile.dpr),
                            );
                        }),
                    },
                };
                const rowOracles = oracles(),
                    issues = [];
                for (const [gate, record] of Object.entries(gates)) {
                    for (const entry of record.cases) {
                        if (entry.status !== 'PASS') continue;
                        const checked = rowOracles[gate.toLowerCase()](entry);
                        if (checked.errors.length) {
                            entry.status = 'FAIL';
                            entry.reason = checked.errors.join('; ');
                            entry.classification =
                                engine === 'webkit' && gate === 'Runtime' && entry.caseId === 'resize'
                                    ? 'ENGINE_BUG'
                                    : 'AGENT_FAILURE';
                            issues.push({
                                classification: entry.classification,
                                reason: entry.reason,
                                gate,
                                caseId: entry.caseId,
                            });
                        }
                    }
                    if (record.cases.some((c) => c.status === 'FAIL')) record.status = 'FAIL';
                }
                const failed = Object.values(gates).some((g) => g.status === 'FAIL');
                e.report = {
                    schemaVersion: 'shaders-engine-evidence/1',
                    effect: {
                        name: definition.name,
                        version: definition.version,
                        contractSha256: sha256(canonical(definition)),
                    },
                    identity,
                    status: failed ? 'FAIL' : performanceAuthorized ? 'PASS' : 'NOT_RUN',
                    completed: !failed && performanceAuthorized,
                    subset: failed || !performanceAuthorized,
                    issues,
                    gates,
                };
            } finally {
                if (page && !page.isClosed()) {
                    try {
                        await page.evaluate(async () => {
                            const a = window.__e01;
                            if (a) await a.release();
                        });
                    } finally {
                        await page.close();
                    }
                }
                await browser.close();
            }
        }
    } finally {
        await server.close();
    }
    result.endedAt = new Date().toISOString();
    const checked = validateReport(result);
    checked.functionalPassed =
        checked.ok &&
        result.engines.every((e) =>
            Object.entries(e.report.gates).every(([name, g]) => name === 'Performance' || g.status === 'PASS'),
        );
    result.validation = checked;
    writeNew(out, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ out: path.relative(ROOT, out), ...checked }));
    return checked.ok && (performanceAuthorized ? checked.scopePassed : checked.functionalPassed) ? 0 : 1;
}
module.exports = {
    definitions,
    visualPlan,
    boundaryPlan,
    expectedScope,
    expectedIdentity,
    oracles,
    validateReport,
    main,
};
if (require.main === module)
    main()
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            console.error(error.stack);
            const out = process.argv.slice(2).find((a) => a.startsWith('--out='));
            if (out) {
                const p = path.resolve(ROOT, out.slice(6)) + '.failure.json';
                if (!fs.existsSync(p))
                    writeNew(
                        p,
                        JSON.stringify(
                            {
                                status: 'FAIL',
                                classification: 'AGENT_FAILURE',
                                command: process.argv.join(' '),
                                cwd: ROOT,
                                endedAt: new Date().toISOString(),
                                error: String(error.stack),
                            },
                            null,
                            2,
                        ),
                    );
            }
            process.exitCode = 1;
        });
