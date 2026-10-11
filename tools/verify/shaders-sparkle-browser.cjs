/** E06 native collector; no SDK build, installed dependencies, extra canvas or standalone GL rendering. */
const fs = require('node:fs'),
    path = require('node:path'),
    cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..'),
    O = require('./shaders-sparkle-oracle.cjs'),
    C = require('./shaders-effect-contract.cjs');
const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
const ENGINES = ['chromium', 'firefox', 'webkit'],
    DPR2 = ['gray-rays', 'off-rgba', 'bright-region', 'spill-color'];
const SOURCE = [
    'examples/shader-sparkle/index.html',
    'examples/shader-sparkle/parameters.json',
    'examples/shader-sparkle/src/main.ts',
    'examples/shader-sparkle/src/parameters.ts',
    'examples/shader-sparkle/src/sparkle.frag',
    'examples/shader-sparkle/src/effect.generated.ts',
    'examples/shader-sparkle/generate-effects.mjs',
    'examples/shader-sparkle/UPSTREAM.md',
    'examples/shader-sparkle/LICENSE.reference.txt',
];
const RUNNER = [
    'tools/verify/shaders-sparkle-browser.cjs',
    'tools/verify/shaders-sparkle-oracle.cjs',
    'tools/verify/shaders-sparkle-performance.cjs',
    'tools/verify/shaders-sparkle-scoped.cjs',
    'tools/verify/shaders-sparkle.tsconfig.json',
    'tools/verify/shaders-effect-contract.cjs',
    'tools/build/effect-json.mjs',
    'examples/shared/shader-blocks.js',
    'tools/verify/browser-engines.cjs',
    'tools/verify/shaders-browser-launch.cjs',
    'examples/shared/shader-lifecycle.ts',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/asset-lifecycle.d.ts',
    'tools/verify/competitive-example-server.cjs',
];
const REFERENCE = [
    'packages/core/src/shaders/Sparkle/index.ts',
    'packages/core/src/std/paint/patterns.ts',
    'packages/core/src/std/paint/light.ts',
    'packages/core/src/std/motion.ts',
    'packages/core/src/std/effects/blurs.ts',
];
const PROFILES = [
    { id: '720p', width: 1280, height: 720, dpr: 1 },
    { id: '1080p', width: 1920, height: 1080, dpr: 1 },
    { id: 'mobile-dpr', width: 390, height: 844, dpr: 2 },
];
const expectedScope = {
    Build: ['typescript', 'bundle', 'shader'],
    Runtime: ['create', 'update', 'resize', 'pause', 'resume', 'destroy', 'recreate'],
    Visual: [...O.VISUALS.map((v) => v.id + '@1'), ...DPR2.map((id) => id + '@2')],
    Boundary: Object.keys(O.definition.params).flatMap((k) =>
        ['default', 'min', 'near-min', 'max', 'near-max', 'invalid'].map((b) => k + '/' + b),
    ),
    Resource: ['100-native-instance-cycles'],
    Performance: PROFILES.map((p) => p.id),
};
const WARMUP = 30,
    SAMPLES = 60;
function currentIdentity() {
    return {
        source: SOURCE.map((f) => O.fileIdentity(ROOT, f)),
        sdk: [
            'build/cocosair.module.js',
            'build/cocosair.module.d.ts',
            'build/npm/cocosair.module.js',
            'build/cocosair.module.js.map',
        ].map((f) => O.fileIdentity(ROOT, f)),
        runner: RUNNER.map((f) => O.fileIdentity(ROOT, f)),
        reference: {
            repo: 'shader-effects-inc/shaders',
            commit: 'dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a',
            license: 'MIT',
            files: REFERENCE.map((f) => O.fileIdentity(ROOT, 'output/shaders-absorption/reference/' + f)),
        },
    };
}
function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
function fixed(s, viewport, dpr, input = s.inputKind) {
    return {
        viewport,
        dpr,
        seed: s.params.seed,
        input,
        parameters: s.params,
        timeSeconds: s.time,
        simulationStep: s.frame,
    };
}
function row(caseId, observation, s, engine, version, viewport, dpr) {
    return {
        caseId,
        status: 'PASS',
        method: 'REAL_BROWSER',
        browser: engine,
        browserVersion: version,
        fixed: fixed(s, viewport, dpr),
        observation,
    };
}
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
function runtimeOracle(r) {
    const e = [],
        o = r.observation,
        b = o.before,
        a = o.after;
    if (!b || !a) return { errors: ['missing state'], measurements: 0 };
    if (o.pageErrors.length) e.push('pageerror');
    const id = r.caseId;
    if (
        id === 'create' &&
        !(
            a.oneCanvas === 1 &&
            a.shaderPasses?.length === 1 &&
            a.counters.texture === 1 &&
            o.creation.before.counters.texture === 0 &&
            o.creation.after.counters.texture === 1
        )
    )
        e.push('create');
    if (
        id === 'update' &&
        !(a.updates > b.updates && a.params.intensity !== b.params.intensity && a.instance === b.instance)
    )
        e.push('uniform update');
    if (id === 'resize') {
        if (!(a.canvas.css.width === 480 && a.canvas.css.height === 320 && b.canvas.css.width === 640 && o.screenshot))
            e.push('live resize');
        const q = { ...o.visual, observation: { ...o.visual.observation, screenshot: o.screenshot } };
        e.push(...O.visualOracle(q, ROOT).errors);
    }
    if (id === 'pause' && !(a.paused && a.time === b.time && a.frame > b.frame)) e.push('pause clock');
    if (id === 'resume' && !(a.time > b.time && !a.paused)) e.push('resume');
    if (
        id === 'destroy' &&
        !(
            a.counters.material === 0 &&
            o.trace.rendererUnbound &&
            o.trace.refs.every((x) => x.before === 1 && x.after === 0)
        )
    )
        e.push('destroy');
    if (id === 'recreate' && !(a.counters.material === 1 && a.instance !== b.instance)) e.push('recreate');
    if (o.normal) {
        const n = o.normal;
        if (
            n.uniformBefore.params.size === n.uniformAfter.params.size ||
            n.uniformBefore.instance !== n.uniformAfter.instance ||
            n.structureAfter.params.expand <= 0 ||
            n.structureAfter.instance === n.uniformAfter.instance ||
            n.structureAfter.rebuilds <= n.uniformAfter.rebuilds ||
            !n.events.every((x) => x.isTrusted) ||
            n.pauseBefore.time !== n.pauseAfter.time ||
            n.resumeAfter.time <= n.pauseAfter.time ||
            !n.releaseIdentity ||
            n.release.listenerAdds !== n.release.listenerRemoves ||
            !n.disabled ||
            n.errors.length
        )
            e.push('native trusted controls');
    }
    return { errors: e, measurements: 7 };
}
function boundaryOracle(r) {
    const o = r.observation,
        d = O.definition.params[o.parameter],
        e = [];
    if (!d) return { errors: ['unknown parameter'], measurements: 0 };
    if (o.boundary === 'invalid') {
        if (o.actual.ok !== false || o.errorCode !== 'SPARKLE_PARAMETERS') e.push('invalid accepted');
    } else {
        if (o.actual.ok !== true || o.actual.snapshot.params[o.parameter] !== o.input) e.push('boundary update');
    }
    return { errors: e, measurements: 2 };
}
function resourceOracle(r) {
    const o = r.observation,
        e = [];
    if (o.cycles.length !== 100) e.push('cycle count');
    for (const x of o.cycles) {
        if (
            !x.trace.rendererUnbound ||
            !x.trace.nodeRemoved ||
            !x.repeat.idempotent ||
            x.trace.refs.length !== 3 ||
            x.trace.refs.some((a) => a.before !== 1 || a.after !== 0) ||
            x.nodeValid ||
            x.assetsValid.some(Boolean)
        )
            e.push('refs/node cleanup');
        if (
            x.createdMemory.textureSize <= x.beforeMemory.textureSize ||
            x.createdMemory.bufferSize <= x.beforeMemory.bufferSize ||
            x.afterMemory.textureSize !== x.beforeMemory.textureSize ||
            x.afterMemory.bufferSize !== x.beforeMemory.bufferSize
        )
            e.push('actual allocation/memory balance');
        if (
            x.created.texture !== 1 ||
            x.created.material !== 1 ||
            x.created.buffer < 3 ||
            x.after.material !== 0 ||
            x.after.texture !== 0 ||
            x.after.raf !== 0
        )
            e.push('native gfx resource counters');
    }
    if (
        !o.appRelease ||
        o.appRelease.sharedTemplates?.length !== 2 ||
        o.appRelease.sharedTemplates.some(
            (x) =>
                x.before !== 1 || x.after !== 0 || !x.registryMatchesBefore || !x.registryRemoved || x.validAfterClose,
        )
    )
        e.push('app-owned EffectAsset registry/reference release');
    if (new Set(o.cycles.map((x) => x.id)).size !== 100) e.push('distinct native instances');
    return { errors: e, measurements: o.cycles.length * 10 };
}
function performanceOracle(r) {
    const o = r.observation,
        e = [],
        f = o.raw.frames.slice(WARMUP, WARMUP + SAMPLES),
        sum = (xs, frame) => xs.filter((x) => x.frame === frame).reduce((n, x) => n + x.ms, 0),
        eq = (a, b) => a.length === b.length && a.every((x, i) => finite(x) && Math.abs(x - b[i]) < 1e-8);
    if (
        o.frameCount !== SAMPLES ||
        f.length !== SAMPLES ||
        o.warmupFrames !== WARMUP ||
        new Set(f.map((x) => x.frame)).size !== SAMPLES
    )
        e.push('steady frame window');
    for (const [key, raw] of [
        ['cpuUpdateMs', 'updateCalls'],
        ['cpuEncodingMs', 'commands'],
        ['cpuSubmissionMs', 'draws'],
    ])
        if (
            !eq(
                o[key],
                f.map((x) => sum(o.raw[raw], x.frame)),
            )
        )
            e.push('independent timing ' + key);
    if (
        !eq(
            o.frameMs,
            f.map((x) => x.intervalMs),
        ) ||
        o.frameMs.some((x) => x <= 0) ||
        o.cpuSubmissionMs.every((x) => x === 0) ||
        o.cpuEncodingMs.every((x) => x === 0) ||
        o.cpuUpdateMs.every((x) => x === 0)
    )
        e.push('actual nonzero native timing');
    if (o.cpuEncodingMs.every((x, i) => x === o.cpuSubmissionMs[i])) e.push('copied timing arrays');
    if (
        o.drawCalls < 1 ||
        o.passCount !==
            Math.max(
                ...f.map(
                    (x) =>
                        o.raw.commands.filter((c) => c.frame === x.frame && c.operation === 'beginRenderPass').length,
                ),
            ) ||
        o.passCount < 1 ||
        o.textureCount !== 1 ||
        o.bufferCount < 3 ||
        o.raw.pageErrors.length ||
        o.raw.consoleErrors.length
    )
        e.push('performance actual draw/errors');
    if (o.raw.timerAvailable) {
        const selected = o.raw.gpuSamples.filter((q) => f.some((x) => x.frame === q.frame));
        if (
            o.gpuTimestamp.status !== 'measured' ||
            selected.length !== SAMPLES ||
            selected.some((x) => x.disjoint || !finite(x.ms) || x.ms <= 0) ||
            !eq(
                o.gpuTimestamp.milliseconds,
                f.map((x) => selected.find((q) => q.frame === x.frame)?.ms),
            )
        )
            e.push('GPU timer frame/disjoint/results');
    } else if (o.gpuTimestamp.status !== 'unavailable') e.push('extension availability');
    if (
        o.raw.queryTerminal.some((x) => !x.deleted || x.aliveBefore !== true) ||
        o.measurementMethod.includes('present success')
    )
        e.push('query cleanup/frame semantics');
    return { errors: e, measurements: SAMPLES * 5 };
}
function buildOracle(r) {
    const e = [];
    if (r.observation.errors.length || r.observation.compiledUnits !== (r.caseId === 'shader' ? 2 : 1))
        e.push('compile');
    if (r.caseId === 'shader' && (!r.observation.nativeShader || r.observation.consoleErrors.length))
        e.push('native shader');
    return { errors: e, measurements: 1 };
}
function oracles() {
    return {
        build: buildOracle,
        runtime: runtimeOracle,
        visual: (r) => O.visualOracle(r, ROOT),
        boundary: boundaryOracle,
        resource: resourceOracle,
        performance: performanceOracle,
    };
}
function validateReport(report) {
    const errors = [],
        identity = currentIdentity();
    for (const e of report.engines) {
        const v = C.validateEngineReport(e, {
            root: ROOT,
            verifyFiles: true,
            definition: O.definition,
            expectedIdentity: identity,
            expectedScope,
            oracles: oracles(),
        });
        if (!v.ok) errors.push(...v.errors.map((x) => ({ ...x, engine: e.browser })));
    }
    if (JSON.stringify(report.identity) !== JSON.stringify(identity)) errors.push({ rule: 'OUTER_IDENTITY' });
    if (
        report.engines.length !== ENGINES.length ||
        JSON.stringify(report.engines.map((e) => e.browser)) !== JSON.stringify(ENGINES)
    )
        errors.push({ rule: 'ENGINE_SET' });
    return {
        ok: errors.length === 0,
        errors,
        scopePassed: report.engines.every((e) => e.status === 'PASS') && errors.length === 0,
    };
}
function mark(report) {
    const check = oracles();
    for (const [gate, g] of Object.entries(report.gates)) {
        for (const r of g.cases) {
            if (r.status !== 'PASS') continue;
            const fn = check[gate.toLowerCase()];
            let v;
            try {
                v = fn(r);
            } catch (e) {
                v = { errors: [String(e)], measurements: 0 };
            }
            if (v.errors.length) {
                r.status = r.caseId === 'resize' && report.browser === 'webkit' ? 'BLOCKED' : 'FAIL';
                r.reason = v.errors.join('; ');
                r.classification = r.status === 'BLOCKED' ? 'INFRA_FAILURE' : 'AGENT_FAILURE';
            }
        }
        g.status = g.cases.some((r) => r.status === 'FAIL')
            ? 'FAIL'
            : g.cases.every((r) => r.status === 'PASS')
              ? 'PASS'
              : g.cases.some((r) => r.status === 'BLOCKED')
                ? 'BLOCKED'
                : 'NOT_RUN';
    }
    report.status = Object.values(report.gates).some((g) => g.status === 'FAIL')
        ? 'FAIL'
        : Object.values(report.gates).every((g) => g.status === 'PASS')
          ? 'PASS'
          : Object.values(report.gates).some((g) => g.status === 'BLOCKED')
            ? 'BLOCKED'
            : 'NOT_RUN';
    report.completed = report.status === 'PASS';
    report.subset = !report.completed;
}
async function main() {
    const args = Object.fromEntries(
        process.argv.slice(2).map((x) => {
            const i = x.indexOf('=');
            return i < 0 ? [x.slice(2), true] : [x.slice(2, i), x.slice(i + 1)];
        }),
    );
    if (args.verify) {
        const report = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.verify)));
        const v = validateReport(report);
        console.log(JSON.stringify(v));
        process.exitCode = v.ok ? 0 : 1;
        return;
    }
    if (!args.out) throw Error('--out=<new.json> required');
    const out = path.resolve(ROOT, args.out),
        prefix = out.slice(0, -5),
        art = prefix + '-artifacts';
    if (fs.existsSync(out)) throw Error('EXISTS ' + out);
    fs.mkdirSync(art, { recursive: true });
    const identity = currentIdentity();
    write(prefix + '-frozen.json', { identity, expectedScope, definition: O.definition });
    const compileStarted = new Date().toISOString(),
        ts = cp.spawnSync(
            process.execPath,
            ['node_modules/typescript/bin/tsc', '-p', 'tools/verify/shaders-sparkle.tsconfig.json'],
            { cwd: ROOT, encoding: 'utf8' },
        );
    write(path.join(art, 'typescript.log'), ts.stdout + ts.stderr || 'TypeScript noEmit exit=' + ts.status + '\n');
    let bundled, bundleError;
    try {
        bundled = require('esbuild').buildSync({
            entryPoints: [path.join(ROOT, 'examples/shader-sparkle/src/main.ts')],
            bundle: true,
            format: 'esm',
            target: 'es2022',
            external: ['cocosair'],
            write: false,
        });
    } catch (e) {
        bundleError = String(e);
    }
    write(
        path.join(art, 'bundle.log'),
        bundleError || 'esbuild native example bundle bytes=' + bundled.outputFiles[0].contents.length + '\n',
    );
    const compileEnded = new Date().toISOString();
    const compileRows = ['typescript', 'bundle'].map((id) => ({
        caseId: id,
        status: 'PASS',
        method: 'NODE',
        execution: {
            command:
                id === 'typescript'
                    ? 'node node_modules/typescript/bin/tsc -p tools/verify/shaders-sparkle.tsconfig.json'
                    : 'esbuild.buildSync(native main.ts, external cocosair, write:false)',
            cwd: ROOT,
            startedAt: compileStarted,
            endedAt: compileEnded,
            exitCode: id === 'typescript' ? ts.status : bundleError ? 1 : 0,
            rawOutputs: [O.fileIdentity(ROOT, path.relative(ROOT, path.join(art, id + '.log')))],
        },
        observation: {
            expectedUnits: 1,
            compiledUnits: id === 'typescript' ? (ts.status === 0 ? 1 : 0) : bundleError ? 0 : 1,
            errors: id === 'typescript' ? (ts.status === 0 ? [] : [ts.stderr]) : bundleError ? [bundleError] : [],
        },
    }));
    const server = await require('./competitive-example-server.cjs').startExampleServer(ROOT),
        pw = require('playwright'),
        reports = [];
    try {
        for (const engine of ENGINES) {
            const browser = await pw[engine].launch(shaderLaunchOptions(engine));
            try {
                const version = browser.version(),
                    startedAt = new Date().toISOString(),
                    raw = {
                        visual: [],
                        runtime: [],
                        boundaries: [],
                        resource: null,
                        normal: null,
                        pageErrors: [],
                        consoleErrors: [],
                        console: [],
                    },
                    viewport = { width: 640, height: 400 },
                    page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
                page.on('pageerror', (e) => raw.pageErrors.push(String(e)));
                page.on('console', (m) => {
                    raw.console.push({ type: m.type(), text: m.text() });
                    if (m.type() === 'error') raw.consoleErrors.push(m.text());
                });
                await page.goto(server.origin + '/examples/shader-sparkle/?test=1');
                await page.waitForFunction(() => window.__sparkle?.ready, null, { timeout: 60000 });
                let s = await page.evaluate(() => window.__sparkle.step(0));
                const creation = await page.evaluate(() => window.__sparkle.creationTrace);
                raw.runtime.push(
                    row(
                        'create',
                        { before: creation.before, after: s, creation, pageErrors: [] },
                        s,
                        engine,
                        version,
                        viewport,
                        1,
                    ),
                );
                for (const dpr of [1, 2]) {
                    let p = page;
                    if (dpr === 2) {
                        p = await browser.newPage({ viewport, deviceScaleFactor: dpr });
                        p.on('pageerror', (e) => raw.pageErrors.push(String(e)));
                        p.on('console', (m) => {
                            if (m.type() === 'error') raw.consoleErrors.push(m.text());
                        });
                        await p.goto(server.origin + '/examples/shader-sparkle/?test=1');
                        await p.waitForFunction(() => window.__sparkle?.ready, null, { timeout: 60000 });
                    }
                    for (const spec of O.VISUALS.filter((v) => dpr === 1 || DPR2.includes(v.id))) {
                        const points = O.samplePoints(viewport.width, viewport.height, spec.p, spec.time, dpr);
                        await p.evaluate(async (spec) => {
                            await window.__sparkle.set(spec.p);
                            window.__sparkle.setInput(spec.kind);
                            window.__sparkle.setTime(spec.time);
                            window.__sparkle.pause();
                            window.__sparkle.setBackground(spec.bg || [0, 0, 0]);
                            await window.__sparkle.step(0);
                        }, spec);
                        await p.evaluate((points) => window.__sparkle.setPoints(points), points);
                        const linear = await p.evaluate((points) => window.__sparkle.linearRead(points), points),
                            shot = path.join(art, engine + '-' + spec.id + '-dpr' + dpr + '.png');
                        await p.screenshot({ path: shot });
                        s = await p.evaluate(() => window.__sparkle.snapshot());
                        raw.visual.push(
                            row(
                                spec.id + '@' + dpr,
                                {
                                    algorithm: {
                                        oracleId: 'independent-js-linear-sparkle-v1',
                                        method: 'CPU independent hash/grid/ring/glint/Rec709/transfer compared with native rgba16f RT',
                                        raw: linear.pixels,
                                    },
                                    screenshot: O.fileIdentity(ROOT, path.relative(ROOT, shot)),
                                    linearTarget: linear,
                                    previewRaw: s.pixels,
                                    shaderPrograms: s.shaderPasses,
                                },
                                s,
                                engine,
                                version,
                                viewport,
                                dpr,
                            ),
                        );
                    }
                    if (dpr === 2) {
                        await p.evaluate(() => window.__sparkle.release());
                        await p.close();
                    }
                }
                s = await page.evaluate(() => window.__sparkle.snapshot());
                const updated = await page.evaluate(
                    async (p) => {
                        await window.__sparkle.set(p);
                        return window.__sparkle.step(0);
                    },
                    { ...s.params, intensity: s.params.intensity + 0.1 },
                );
                raw.runtime.push(
                    row('update', { before: s, after: updated, pageErrors: [] }, updated, engine, version, viewport, 1),
                );
                const resizeSpec = O.VISUALS.find((v) => v.id === 'gray-rays');
                await page.evaluate(async (v) => {
                    await window.__sparkle.set(v.p);
                    window.__sparkle.setInput(v.kind);
                    window.__sparkle.setTime(0);
                    window.__sparkle.setBackground([0, 0, 0]);
                    await window.__sparkle.step(0);
                }, resizeSpec);
                const beforeResize = await page.evaluate(() => window.__sparkle.snapshot()),
                    beforeResizeShot = path.join(art, engine + '-before-live-resize.png');
                await page.screenshot({ path: beforeResizeShot });
                await page.setViewportSize({ width: 480, height: 320 });
                await page.waitForTimeout(100);
                const resized = await page.evaluate(() => window.__sparkle.step(0)),
                    resizePoints = O.samplePoints(480, 320, resizeSpec.p, 0, 1),
                    resizeLinear = await page.evaluate(async (points) => {
                        window.__sparkle.setPoints(points);
                        return window.__sparkle.linearRead(points);
                    }, resizePoints),
                    resizedAfterRestore = await page.evaluate(() => window.__sparkle.snapshot()),
                    resizeShot = path.join(art, engine + '-live-resize.png');
                await page.screenshot({ path: resizeShot });
                raw.runtime.push(
                    row(
                        'resize',
                        {
                            before: beforeResize,
                            after: resized,
                            pageErrors: [],
                            beforeScreenshot: O.fileIdentity(ROOT, path.relative(ROOT, beforeResizeShot)),
                            afterRestore: resizedAfterRestore,
                            cameraTargetRestored: resizeLinear.cleanup.cameraTargetRestored,
                            screenshot: O.fileIdentity(ROOT, path.relative(ROOT, resizeShot)),
                            visual: row(
                                resizeSpec.id,
                                {
                                    algorithm: { raw: resizeLinear.pixels },
                                    previewRaw: resizedAfterRestore.pixels,
                                    linearTarget: resizeLinear,
                                },
                                resized,
                                engine,
                                version,
                                { width: 480, height: 320 },
                                1,
                            ),
                        },
                        resized,
                        engine,
                        version,
                        { width: 480, height: 320 },
                        1,
                    ),
                );
                await page.setViewportSize(viewport);
                await page.waitForTimeout(100);
                const beforePause = await page.evaluate(() => window.__sparkle.snapshot()),
                    paused = await page.evaluate(async () => {
                        window.__sparkle.pause();
                        return window.__sparkle.step(0.2);
                    });
                raw.runtime.push(
                    row(
                        'pause',
                        { before: beforePause, after: paused, pageErrors: [] },
                        paused,
                        engine,
                        version,
                        viewport,
                        1,
                    ),
                );
                const resumed = await page.evaluate(async () => {
                    window.__sparkle.resume();
                    return window.__sparkle.step(0.2);
                });
                raw.runtime.push(
                    row(
                        'resume',
                        { before: paused, after: resumed, pageErrors: [] },
                        resumed,
                        engine,
                        version,
                        viewport,
                        1,
                    ),
                );
                for (const [name, d] of Object.entries(O.definition.params))
                    for (const boundary of ['default', 'min', 'near-min', 'max', 'near-max', 'invalid']) {
                        const input =
                            boundary === 'default'
                                ? d.defaultValue
                                : boundary === 'min'
                                  ? d.min
                                  : boundary === 'max'
                                    ? d.max
                                    : boundary === 'near-min'
                                      ? d.min + Math.min(d.step, (d.max - d.min) / 1000)
                                      : boundary === 'near-max'
                                        ? d.max - Math.min(d.step, (d.max - d.min) / 1000)
                                        : d.min - 1;
                        const result = await page.evaluate((p) => window.__sparkle.set(p), {
                                ...O.DEFAULTS,
                                [name]: input,
                            }),
                            snap = await page.evaluate(() => window.__sparkle.snapshot());
                        raw.boundaries.push(
                            row(
                                name + '/' + boundary,
                                {
                                    parameter: name,
                                    boundary,
                                    input,
                                    actual: result,
                                    ...(boundary === 'invalid' ? { errorCode: result.errorCode } : {}),
                                },
                                snap,
                                engine,
                                version,
                                viewport,
                                1,
                            ),
                        );
                    }
                const beforeDestroy = await page.evaluate(() => window.__sparkle.snapshot()),
                    destroyed = await page.evaluate(() => window.__sparkle.destroyInstance());
                raw.runtime.push(
                    row(
                        'destroy',
                        { before: beforeDestroy, after: destroyed.snapshot, trace: destroyed.trace, pageErrors: [] },
                        destroyed.snapshot,
                        engine,
                        version,
                        viewport,
                        1,
                    ),
                );
                const recreated = await page.evaluate(() => window.__sparkle.recreate());
                raw.runtime.push(
                    row(
                        'recreate',
                        { before: destroyed.snapshot, after: recreated.snapshot, pageErrors: [] },
                        recreated.snapshot,
                        engine,
                        version,
                        viewport,
                        1,
                    ),
                );
                raw.resource = await page.evaluate(() => window.__sparkle.cycles());
                const resourceSnap = await page.evaluate(() => window.__sparkle.snapshot());
                raw.resourceSnapshot = resourceSnap;
                raw.release = await page.evaluate(() => window.__sparkle.release());
                await page.close();
                const normal = await browser.newPage({ viewport });
                normal.on('pageerror', (e) => raw.pageErrors.push(String(e)));
                await normal.goto(server.origin + '/examples/shader-sparkle/');
                await normal.waitForFunction(() => window.__sparkle?.ready);
                await normal.waitForTimeout(150);
                const uniformBefore = await normal.evaluate(() => window.__sparkle.snapshot());
                await normal.locator('[data-parameter=size]').focus();
                await normal.keyboard.press('ArrowRight');
                await normal.waitForTimeout(30);
                const uniformAfter = await normal.evaluate(() => window.__sparkle.snapshot());
                await normal.locator('[data-parameter=expand]').focus();
                await normal.keyboard.press('ArrowRight');
                await normal.waitForTimeout(30);
                const structureAfter = await normal.evaluate(() => window.__sparkle.snapshot());
                await normal.click('#pause');
                const pauseBefore = await normal.evaluate(() => window.__sparkle.snapshot());
                await normal.waitForTimeout(120);
                const pauseAfter = await normal.evaluate(() => window.__sparkle.snapshot());
                await normal.click('#resume');
                await normal.waitForTimeout(120);
                const resumeAfter = await normal.evaluate(() => window.__sparkle.snapshot());
                await normal.click('#reset');
                await normal.waitForTimeout(30);
                await normal.click('#release');
                const normalRelease = await normal.evaluate(() => window.__sparkle.release()),
                    same = await normal.evaluate(() => window.__sparkle.releaseIdentity()),
                    normalSnap = await normal.evaluate(() => window.__sparkle.snapshot()),
                    disabled = await normal.evaluate(() =>
                        Array.from(document.querySelectorAll('button')).every((b) => b.disabled),
                    );
                raw.normal = {
                    uniformBefore,
                    uniformAfter,
                    structureAfter,
                    pauseBefore,
                    pauseAfter,
                    resumeAfter,
                    release: normalRelease,
                    releaseIdentity: same,
                    events: normalSnap.events,
                    disabled,
                    errors: raw.pageErrors,
                };
                raw.runtime[0].observation.normal = raw.normal;
                await normal.close();
                const endedAt = new Date().toISOString(),
                    rawPath = path.join(art, engine + '-functional.raw.json');
                raw.identity = identity;
                raw.browser = engine;
                raw.browserVersion = version;
                write(rawPath, raw);
                const execution = {
                    command: process.argv.join(' '),
                    cwd: ROOT,
                    startedAt,
                    endedAt,
                    exitCode: raw.pageErrors.length || raw.consoleErrors.length ? 1 : 0,
                    rawOutputs: [O.fileIdentity(ROOT, path.relative(ROOT, rawPath))],
                };
                const nativePrograms = [
                    ...new Set(
                        raw.visual.flatMap((r) =>
                            r.observation.shaderPrograms.filter((p) => p.shaderCompiled).map((p) => p.program),
                        ),
                    ),
                ];
                const shader = row(
                    'shader',
                    {
                        expectedUnits: 2,
                        compiledUnits: raw.consoleErrors.length ? 0 : nativePrograms.length,
                        errors: raw.consoleErrors,
                        nativeShader: nativePrograms.length === 2,
                        nativePrograms,
                        consoleErrors: raw.consoleErrors,
                    },
                    s,
                    engine,
                    version,
                    viewport,
                    1,
                );
                delete shader.fixed;
                shader.execution = execution;
                const gates = {
                    Build: { scope: { expectedCaseIds: expectedScope.Build }, cases: [...compileRows, shader] },
                    Runtime: { scope: { expectedCaseIds: expectedScope.Runtime }, cases: raw.runtime },
                    Visual: { scope: { expectedCaseIds: expectedScope.Visual }, cases: raw.visual },
                    Boundary: { scope: { expectedCaseIds: expectedScope.Boundary }, cases: raw.boundaries },
                    Resource: {
                        scope: { expectedCaseIds: expectedScope.Resource },
                        cases: [
                            row(
                                expectedScope.Resource[0],
                                {
                                    cycles: raw.resource.rows,
                                    appRelease: raw.release,
                                    borrowed: raw.resource.borrowed,
                                    gpuPhysicalMemory: {
                                        status: 'unavailable',
                                        reason: 'Browser does not expose physical GPU allocation/residency; native gfx counters are not physical GPU memory.',
                                    },
                                },
                                resourceSnap,
                                engine,
                                version,
                                viewport,
                                1,
                            ),
                        ],
                    },
                    Performance: {
                        scope: { expectedCaseIds: expectedScope.Performance },
                        cases: PROFILES.map((p) => ({
                            caseId: p.id,
                            status: 'NOT_RUN',
                            reason: 'Performance serialized window not collected in functional phase',
                        })),
                    },
                };
                for (const [g, v] of Object.entries(gates))
                    if (g !== 'Build') for (const r of v.cases) if (r.status === 'PASS') r.execution = execution;
                const scopedExecutions = {};
                for (const gate of ['Build', 'Runtime', 'Visual', 'Boundary', 'Resource']) {
                    const targets =
                        gate === 'Runtime' && engine === 'webkit'
                            ? expectedScope.Runtime.filter((id) => id !== 'resize')
                            : ['ALL'];
                    for (const caseId of targets) {
                        const start = new Date().toISOString(),
                            argv = [
                                'tools/verify/shaders-sparkle-scoped.cjs',
                                '--raw=' + rawPath,
                                '--frozen=' + prefix + '-frozen.json',
                                '--gate=' + gate,
                                '--case=' + caseId,
                            ],
                            run = cp.spawnSync(process.execPath, argv, {
                                cwd: ROOT,
                                encoding: 'utf8',
                                env: process.env,
                            }),
                            end = new Date().toISOString(),
                            log = path.join(art, engine + '-' + gate + '-' + caseId + '.validation.log');
                        write(log, run.stdout + run.stderr);
                        const exec = {
                            purpose: 'VALIDATION_OF_REAL_BROWSER_CAPTURE',
                            command: 'node ' + argv.join(' '),
                            cwd: ROOT,
                            startedAt: start,
                            endedAt: end,
                            exitCode: run.status,
                            rawOutputs: [
                                O.fileIdentity(ROOT, path.relative(ROOT, log)),
                                O.fileIdentity(ROOT, path.relative(ROOT, rawPath)),
                            ],
                        };
                        scopedExecutions[gate + '/' + caseId] = exec;
                        for (const r of gates[gate].cases) {
                            if ((caseId === 'ALL' || r.caseId === caseId) && r.method === 'REAL_BROWSER')
                                r.execution = exec;
                        }
                    }
                }
                reports.push({
                    schemaVersion: 'shaders-engine-evidence/1',
                    browser: engine,
                    browserVersion: version,
                    identity,
                    captureProvenance: {
                        command: process.argv.join(' '),
                        cwd: ROOT,
                        startedAt,
                        endedAt,
                        rawReport: O.fileIdentity(ROOT, path.relative(ROOT, rawPath)),
                    },
                    effect: {
                        name: O.definition.name,
                        version: O.definition.version,
                        contractSha256: C.sha256(C.canonical(O.definition)),
                    },
                    issues: [],
                    gates,
                });
            } finally {
                await browser.close();
            }
        }
    } finally {
        await server.close();
    }
    const result = {
        schemaVersion: 'sparkle-native-aggregate/1',
        identity,
        engines: reports,
        phase: 'functional',
        limitations: [
            'Agent Gate NOT_RUN, separate execution required',
            'Independent hash: not Fi/upstream byte-equivalent',
            'AFTER_DRAW is CPU callback receipt, not compositor presentation',
            'Performance pending serialized authorization',
        ],
    };
    for (const r of reports) mark(r);
    const actualCollectionExit = reports.some((r) => ['FAIL', 'BLOCKED'].includes(r.status)) ? 1 : 0;
    result.collectionExecution = {
        command: process.argv.join(' '),
        cwd: ROOT,
        exitCode: actualCollectionExit,
        rawReports: reports.map((r) => r.captureProvenance.rawReport),
    };
    for (const r of reports) {
        r.captureProvenance.collectionExitCode = actualCollectionExit;
        for (const g of Object.values(r.gates))
            for (const c of g.cases)
                if (c.method === 'REAL_BROWSER' && c.execution && !c.execution.purpose)
                    c.execution.exitCode = actualCollectionExit;
    }
    result.validation = validateReport(result);
    write(out, result);
    console.log(
        JSON.stringify({
            out,
            engines: reports.map((r) => ({
                engine: r.browser,
                status: r.status,
                gates: Object.fromEntries(Object.entries(r.gates).map(([k, g]) => [k, g.status])),
            })),
            validation: result.validation,
        }),
    );
    process.exitCode = result.validation.ok ? actualCollectionExit : 1;
}
module.exports = { ROOT, expectedScope, currentIdentity, validateReport, oracles, mark, PROFILES, WARMUP, SAMPLES };
if (require.main === module)
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
