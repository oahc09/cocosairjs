'use strict';
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
const ENV = require('./shaders-browser-environment.cjs');
const ORACLES = { emboss: require('./shaders-emboss-oracle.cjs'), glass: require('./shaders-glass-oracle.cjs') };
const ENGINES = ['chromium', 'firefox', 'webkit'];
const MODES = ['reference', 'fused'];
const PROFILES = [
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
];
const CASES = {
    emboss: [
        { id: 'default', values: {} },
        { id: 'box', values: { shape: 'rounded-box' } },
        { id: 'identity', values: { depth: 0 } },
        { id: 'raised', values: { depth: 0.5 } },
        { id: 'rotated', values: { rotation: 30, scale: 1.5 } },
        { id: 'blank', values: { sourceKind: 'blank' } },
    ],
    glass: [
        { id: 'default', values: {} },
        { id: 'box', values: { shape: 'rounded-box' } },
        { id: 'refraction-zero', values: { refraction: 0, aberration: 0 } },
        { id: 'blur', values: { blur: 8, aberration: 0.5 } },
        { id: 'cutout', values: { cutout: 'shape' } },
        { id: 'blank', values: { sourceKind: 'blank' } },
    ],
};
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
function fileIdentity(file) {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file.replace(/\\/g, '/'), bytes: b.length, sha256: sha(b) };
}
function currentIdentity() {
    const files = [
        'examples/shader-uv-fusion-pilot/index.html',
        'examples/shader-uv-fusion-pilot/generate-effect.cjs',
        ...fs
            .readdirSync(path.join(ROOT, 'examples/shader-uv-fusion-pilot/src'))
            .map((f) => 'examples/shader-uv-fusion-pilot/src/' + f),
        'examples/shared/shader-blocks.js',
        'tools/verify/shaders-uv-fusion-browser.cjs',
        'tools/verify/shaders-uv-fusion.tsconfig.json',
        'tools/verify/shaders-browser-launch.cjs',
        'tools/verify/shaders-browser-environment.cjs',
        'tools/verify/browser-engines.cjs',
        'tools/verify/competitive-example-server.cjs',
        'examples/shader-uv-fusion-pilot/LICENSE.reference.txt',
        ...Object.keys(ORACLES).flatMap((e) => [
            `tools/verify/shaders-${e}-oracle.cjs`,
            `examples/shader-${e}/src/main.ts`,
            `examples/shader-${e}/src/${e}.frag`,
            `examples/shader-${e}/src/pattern.frag`,
            `examples/shader-${e}/parameters.json`,
            `examples/shader-${e}/UPSTREAM.md`,
        ]),
    ];
    return {
        files: files.sort().map(fileIdentity),
        sdk: ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js'].map(
            fileIdentity,
        ),
    };
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v) => Number.isSafeInteger(v) && v >= 0;
function expectedEnv(p) {
    return {
        viewport: p.viewport,
        dpr: p.dpr,
        backing: { w: p.viewport.width * p.dpr, h: p.viewport.height * p.dpr },
        crossOriginIsolated: true,
        coop: 'same-origin',
        coep: 'require-corp',
    };
}
function checkState(s, plan, params, errors) {
    if (
        !s ||
        s.effect !== plan.effect ||
        s.mode !== plan.mode ||
        !equal(s.params, params) ||
        !equal(s.viewport, plan.viewport) ||
        s.dpr !== plan.dpr ||
        s.canvas?.width !== plan.viewport.width * plan.dpr ||
        s.canvas?.height !== plan.viewport.height * plan.dpr ||
        s.oneCanvas !== 1 ||
        s.drawCalls !== (plan.mode === 'reference' ? 2 : 1) ||
        !int(s.frame) ||
        !finite(s.time) ||
        !int(s.instance) ||
        s.instance < 1 ||
        s.released !== false ||
        !Array.isArray(s.shaders) ||
        s.shaders.length !== (plan.mode === 'reference' ? 2 : 1) ||
        s.shaders.some((x) => x?.compiled !== true)
    )
        errors.push('state/frozen-plan');
    if (
        plan.mode === 'reference'
            ? s?.childTarget?.attached !== true || s.childTarget.width !== 256 || s.childTarget.height !== 256
            : s?.childTarget !== null
    )
        errors.push('child-target/route');
}
function checkRetirement(trace, mode, errors) {
    const kinds = [
        'mesh',
        'material',
        'effect',
        ...(mode === 'reference' ? ['childEffect', 'childMaterial'] : []),
    ].sort();
    if (
        !trace ||
        !Array.isArray(trace.refs) ||
        !equal(trace.refs.map((x) => x?.kind).sort(), kinds) ||
        trace.refs.some((x) => x.before !== 1 || x.after !== 0) ||
        trace.renderersUnbound !== true ||
        trace.nodesRemoved !== true ||
        trace.detached !== true ||
        (mode === 'reference' ? trace.targetDisposed !== true : trace.targetDisposed !== null)
    )
        errors.push('retirement');
}
function validateData(report) {
    const errors = [];
    try {
        if (!report || !['functional', 'performance'].includes(report.phase) || report.schema !== 'shaders-uv-fusion/1')
            return { ok: false, errors: ['schema'] };
        if (report.collectionError) errors.push('collection-error:' + report.collectionError);
        if (!equal(report.inputs, currentIdentity())) errors.push('identity-drift');
        if (!Array.isArray(report.engines) || !equal(report.engines, ENGINES) || !Array.isArray(report.rows))
            errors.push('engine-set');
        if (report.agentGate !== 'NOT_RUN' || report.galleryGate !== 'NOT_RUN' || report.projectCompleted !== false)
            errors.push('claim-boundary');
        if (report.build?.exitCode !== 0 || !int(report.build?.bundleBytes) || report.build.bundleBytes < 1)
            errors.push('build');
        const seen = new Set();
        for (const row of report.rows || []) {
            if (
                !row ||
                !ENGINES.includes(row.engine) ||
                !ORACLES[row.effect] ||
                !MODES.includes(row.mode) ||
                !row.browserVersion ||
                !Array.isArray(row.pageErrors) ||
                row.pageErrors.length ||
                !Array.isArray(row.consoleErrors) ||
                row.consoleErrors.length
            ) {
                errors.push('row-identity/errors');
                continue;
            }
            const oracle = ORACLES[row.effect];
            const key = [
                row.engine,
                row.effect,
                row.mode,
                report.phase === 'functional' ? row.dpr : row.profile?.id,
            ].join('/');
            if (seen.has(key)) errors.push('duplicate-row');
            seen.add(key);
            if (report.phase === 'functional') {
                if (![1, 2].includes(row.dpr) || !equal(row.viewport, { width: 640, height: 400 }))
                    errors.push('functional-profile');
                if (
                    !Array.isArray(row.captures) ||
                    !equal(
                        row.captures.map((x) => x?.id),
                        CASES[row.effect].map((x) => x.id),
                    )
                )
                    errors.push('capture-set');
                for (const [i, c] of (row.captures || []).entries()) {
                    const p = { ...oracle.defaults(), ...CASES[row.effect][i]?.values };
                    checkState(c.state, row, p, errors);
                    if (!c.setBefore || !c.setReceipt || c.setReceipt.ok !== true || !equal(c.setReceipt.values, p))
                        errors.push('set-receipt');
                    else {
                        const old = c.setBefore.params;
                        const rebuild =
                            old.shape !== p.shape ||
                            old.blur > 0 !== p.blur > 0 ||
                            old.aberration > 0 !== p.aberration > 0;
                        if (
                            c.setReceipt.rebuild !== rebuild ||
                            (rebuild
                                ? c.setReceipt.snapshot.instance === c.setBefore.instance
                                : c.setReceipt.snapshot.instance !== c.setBefore.instance)
                        )
                            errors.push('set-rebuild');
                        if (rebuild) checkRetirement(c.setReceipt.retirement, row.mode, errors);
                        else if (c.setReceipt.retirement !== null) errors.push('uniform-retired');
                    }
                    if (
                        !c.probe?.disposed ||
                        !c.probe.detached ||
                        c.probe.state?.diagnostic !== true ||
                        !equal(c.probe.state.params, p)
                    )
                        errors.push('probe/cleanup');
                    const points = oracle.auditPoints(row.viewport.width * row.dpr, row.viewport.height * row.dpr);
                    if (!Array.isArray(c.probe?.pixels) || c.probe.pixels.length !== points.length)
                        errors.push('probe-scope');
                    for (const [j, px] of (c.probe?.pixels || []).entries()) {
                        if (px.x !== points[j]?.x || px.y !== points[j]?.y || !oracle.byteChannels(px.rgba)) {
                            errors.push('probe-bytes');
                            continue;
                        }
                        const expected = oracle
                            .model(px.x, px.y, c.state.canvas.width, c.state.canvas.height, p, 0)
                            .straightLinear.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
                        if (px.rgba.some((v, k) => Math.abs(v - expected[k]) > 2)) errors.push('probe-oracle');
                    }
                }
                const plan = oracle.boundaryPlan();
                if (!Array.isArray(row.boundaries) || row.boundaries.length !== plan.length)
                    errors.push('boundary-set');
                for (const [i, b] of (row.boundaries || []).entries()) {
                    const p = plan[i];
                    if (!p || b.id !== p.caseId || b.receipt?.ok !== (p.boundary !== 'invalid'))
                        errors.push('boundary-result');
                    if (
                        p?.boundary === 'invalid'
                            ? !equal(b.before, b.after)
                            : !equal(b.after, { ...oracle.defaults(), [p.parameter]: p.value })
                    )
                        errors.push('boundary-atomicity');
                }
                if (row.dpr === 1) {
                    if (!Array.isArray(row.resources) || row.resources.length !== 100) errors.push('resource-scope');
                    for (const [i, r] of (row.resources || []).entries()) {
                        checkRetirement(r.trace, row.mode, errors);
                        if (
                            r.index !== i ||
                            r.repeat?.idempotent !== true ||
                            !Array.isArray(r.valid) ||
                            r.valid.some((x) => x !== false) ||
                            !Array.isArray(r.nodesValid) ||
                            r.nodesValid.some((x) => x !== false)
                        )
                            errors.push('resource-state');
                        for (const k of ['textureSize', 'bufferSize'])
                            if (!int(r.before?.[k]) || !int(r.created?.[k]) || r.after?.[k] !== r.before[k])
                                errors.push('resource-memory');
                        if (
                            r.created?.bufferSize <= r.before?.bufferSize ||
                            (row.mode === 'reference'
                                ? r.created.textureSize <= r.before.textureSize
                                : r.created.textureSize !== r.before.textureSize)
                        )
                            errors.push('resource-allocation');
                    }
                    checkState(
                        row.resize?.after,
                        { ...row, viewport: { width: 480, height: 320 } },
                        oracle.defaults(),
                        errors,
                    );
                }
                if (
                    !row.controls ||
                    !equal(
                        row.controls.events?.map((x) => x.type),
                        ['pause', 'resume', 'reset', 'release'],
                    ) ||
                    row.controls.events.some((x) => x.isTrusted !== true) ||
                    row.controls.pause.after !== row.controls.pause.before ||
                    !(row.controls.resume.after > row.controls.resume.before) ||
                    row.controls.reset.time !== 0 ||
                    !equal(row.controls.reset.params, oracle.defaults()) ||
                    row.controls.disabled !== true
                )
                    errors.push('trusted-controls');
            } else {
                const p = PROFILES.find((p) => p.id === row.profile?.id);
                if (!p || !equal(row.profile, p)) {
                    errors.push('performance-profile');
                    continue;
                }
                const env = ENV.validateEnvironmentReceipt(row.environment, expectedEnv(p));
                if (!env.ok) errors.push(...env.errors.map((x) => 'env:' + x));
                const raw = row.observation;
                const plan = { ...row, ...p },
                    defaults = oracle.defaults();
                checkState(raw?.fixedStart, plan, defaults, errors);
                checkState(raw?.fixedEnd, plan, defaults, errors);
                if (
                    raw?.fixedEnd?.instance !== raw?.fixedStart?.instance ||
                    !(raw.fixedEnd.time > raw.fixedStart.time) ||
                    raw.fixedEnd.frame <= raw.fixedStart.frame ||
                    raw.readPixelsDuringWindow !== 0
                )
                    errors.push('performance/fixed-window');
                if (
                    !Array.isArray(row.precision) ||
                    row.precision.length < 2 ||
                    row.precision.some((x) => !finite(x) || x <= 0)
                )
                    errors.push('clock-precision');
                if (
                    !Array.isArray(raw?.frames) ||
                    raw.frames.length < 90 ||
                    !Array.isArray(raw.commands) ||
                    !Array.isArray(raw.draws) ||
                    !Array.isArray(raw.updateCalls)
                )
                    errors.push('performance/raw');
                let previous = -1;
                for (const f of (raw?.frames || []).slice(30)) {
                    const passes = row.mode === 'reference' ? 2 : 1;
                    if (
                        !int(f.frame) ||
                        f.frame <= previous ||
                        !finite(f.intervalMs) ||
                        f.intervalMs <= 0 ||
                        !finite(f.renderEnvelopeMs) ||
                        f.renderEnvelopeMs < 0
                    )
                        errors.push('frame-time');
                    previous = f.frame;
                    if (
                        raw.commands.filter((x) => x.frame === f.frame && x.operation === 'beginRenderPass').length !==
                            passes ||
                        raw.draws.filter(
                            (x) => x.frame === f.frame && /^draw(Elements|Arrays)(Instanced)?$/.test(x.operation),
                        ).length !== passes ||
                        raw.updateCalls.filter((x) => x.frame === f.frame).length !== 1
                    )
                        errors.push('native-pass/draw/update');
                }
                for (const a of [raw.commands, raw.draws, raw.updateCalls])
                    if (a.some((x) => !int(x.frame) || !finite(x.ms) || x.ms < 0)) errors.push('cpu-timing');
                if (
                    typeof raw.timerAvailable !== 'boolean' ||
                    !Array.isArray(raw.gpuSamples) ||
                    !Array.isArray(raw.queryEvents) ||
                    (!raw.timerAvailable && (raw.gpuSamples.length || raw.queryEvents.length))
                )
                    errors.push('gpu-structure');
                for (const g of raw.gpuSamples || [])
                    if (
                        !finite(g.ms) ||
                        g.ms < 0 ||
                        !int(g.frame) ||
                        !raw.queryEvents.some((x) => x.frame === g.frame && x.event === 'begin') ||
                        !raw.queryEvents.some((x) => x.frame === g.frame && x.event === 'end') ||
                        !raw.queryEvents.some(
                            (x) => x.frame === g.frame && x.event === 'resolved' && x.disjoint === false,
                        )
                    )
                        errors.push('gpu-query-pair');
            }
            checkRetirement(row.release?.trace, row.mode, errors);
            if (
                row.releaseIdentity !== true ||
                row.release?.sceneCleared !== true ||
                row.release.listenerAdds !== row.release.listenerRemoves ||
                row.pageClosed !== true ||
                row.browserClosed !== true
            )
                errors.push('release/cleanup');
        }
        const expected = report.phase === 'functional' ? 24 : 36;
        if (seen.size !== expected || report.rows.length !== expected) errors.push('exact-tuples');
        if (
            report.cleanup?.serverClosed !== true ||
            (report.phase === 'performance' && report.cleanup.proxyClosed !== true)
        )
            errors.push('server-cleanup');
    } catch (e) {
        errors.push('malformed:' + String(e.message));
    }
    return { ok: errors.length === 0, errors };
}
function validateFiles(report) {
    const validation = validateData(report),
        errors = [...validation.errors];
    try {
        if (report.build?.log) {
            if (!equal(fileIdentity(report.build.log.path), report.build.log)) errors.push('build-log');
            if (!fs.readFileSync(path.resolve(ROOT, report.build.log.path), 'utf8').startsWith('exitCode=0\n'))
                errors.push('actual-build-exit');
        } else errors.push('build-log-missing');
        if (report.phase === 'functional')
            for (const row of report.rows || [])
                for (const c of [...(row.captures || []), ...(row.resize ? [row.resize] : [])]) {
                    if (!equal(fileIdentity(c.png?.path), c.png)) {
                        errors.push('PNG-identity');
                        continue;
                    }
                    const state = c.state || c.after;
                    const audit = ORACLES[row.effect].pngAudit(path.resolve(ROOT, c.png.path), state.params, 0, {
                        background: [10, 12, 16],
                    });
                    if (audit.errors.length) errors.push(...audit.errors.map((x) => 'PNG-oracle:' + JSON.stringify(x)));
                    if (audit.width !== state.canvas.width || audit.height !== state.canvas.height)
                        errors.push('PNG-size');
                }
        if (report.scopePassed !== (errors.length === 0) || report.exitCode !== (errors.length === 0 ? 0 : 1))
            errors.push('selfreport-contradiction');
    } catch (e) {
        errors.push('file:' + String(e.message));
    }
    return { ok: errors.length === 0, errors };
}
async function main() {
    const args = Object.fromEntries(
        process.argv.slice(2).map((x) => {
            const i = x.indexOf('=');
            return [x.slice(2, i), x.slice(i + 1)];
        }),
    );
    if (args.verify) {
        const result = validateFiles(JSON.parse(fs.readFileSync(path.resolve(ROOT, args.verify), 'utf8')));
        console.log(JSON.stringify(result));
        process.exitCode = result.ok ? 0 : 1;
        return;
    }
    const phase = args.phase || 'functional';
    if (!args.out || !['functional', 'performance'].includes(phase) || (phase === 'performance' && !args.authorization))
        throw new Error('Explicit --out and performance authorization required');
    const out = path.resolve(ROOT, args.out);
    if (fs.existsSync(out)) throw new Error('Output already exists');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const artifacts = out.replace(/\.json$/, '-artifacts');
    fs.mkdirSync(artifacts);
    const before = currentIdentity();
    const build = spawnSync(
        process.execPath,
        ['node_modules/typescript/bin/tsc', '-p', 'tools/verify/shaders-uv-fusion.tsconfig.json'],
        { cwd: ROOT, encoding: 'utf8', windowsHide: true },
    );
    const log = out.replace(/\.json$/, '-build.log');
    fs.writeFileSync(log, `exitCode=${build.status}\n${build.stdout}${build.stderr}`, { flag: 'wx' });
    const bundleBytes = require('esbuild').buildSync({
        entryPoints: [path.join(ROOT, 'examples/shader-uv-fusion-pilot/src/main.ts')],
        bundle: true,
        write: false,
        format: 'esm',
        external: ['cocosair'],
    }).outputFiles[0].contents.length;
    const report = {
        schema: 'shaders-uv-fusion/1',
        phase,
        inputs: before,
        engines: ENGINES,
        rows: [],
        startedAt: new Date().toISOString(),
        command: process.argv,
        cwd: ROOT,
        agentGate: 'NOT_RUN',
        galleryGate: 'NOT_RUN',
        projectCompleted: false,
        build: { exitCode: build.status, bundleBytes, log: fileIdentity(path.relative(ROOT, log)) },
        cleanup: {},
    };
    const server = await require('./competitive-example-server.cjs').startExampleServer(ROOT);
    let proxy;
    try {
        if (phase === 'performance') proxy = await ENV.startIsolationProxy(server);
        const pw = require('playwright');
        for (const engine of ENGINES) {
            const browser = await pw[engine].launch({ headless: true, ...shaderLaunchOptions(engine) });
            const engineRows = [];
            try {
                for (const effect of Object.keys(ORACLES))
                    for (const mode of MODES)
                        for (const profile of phase === 'functional'
                            ? [
                                  { viewport: { width: 640, height: 400 }, dpr: 1 },
                                  { viewport: { width: 640, height: 400 }, dpr: 2 },
                              ]
                            : PROFILES) {
                            const row = {
                                engine,
                                browserVersion: browser.version(),
                                effect,
                                mode,
                                viewport: profile.viewport,
                                dpr: profile.dpr,
                                profile: phase === 'performance' ? profile : undefined,
                                pageErrors: [],
                                consoleErrors: [],
                            };
                            report.rows.push(row);
                            engineRows.push(row);
                            const page = await browser.newPage({
                                viewport: profile.viewport,
                                deviceScaleFactor: profile.dpr,
                            });
                            page.on('pageerror', (e) => row.pageErrors.push(String(e)));
                            page.on('console', (m) => {
                                if (m.type() === 'error') row.consoleErrors.push(m.text());
                            });
                            const url = `${(proxy || server).origin}/examples/shader-uv-fusion-pilot/?test=1&effect=${effect}&mode=${mode}${proxy ? '&_isolate=1' : ''}`;
                            try {
                                if (proxy)
                                    row.environment = await ENV.navigateWithDPRRepair(page, url, expectedEnv(profile));
                                else await page.goto(url);
                                await page.waitForFunction(() => window.__fusion?.ready, null, { timeout: 60000 });
                                const oracle = ORACLES[effect];
                                if (phase === 'functional') {
                                    row.captures = [];
                                    for (const c of CASES[effect]) {
                                        const values = { ...oracle.defaults(), ...c.values };
                                        const captureSet = await page.evaluate(async (p) => {
                                            const setBefore = window.__fusion.snapshot();
                                            const setReceipt = await window.__fusion.set(p);
                                            await window.__fusion.step();
                                            return { setBefore, setReceipt, state: await window.__fusion.step() };
                                        }, values);
                                        const state = captureSet.state;
                                        const pngPath = path.join(
                                            artifacts,
                                            `${engine}-${effect}-${mode}-${profile.dpr}-${c.id}.png`,
                                        );
                                        await page.evaluate(
                                            () =>
                                                new Promise((resolve) =>
                                                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                                                ),
                                        );
                                        await page.waitForTimeout(80);
                                        await page.screenshot({ path: pngPath });
                                        const probe = await page.evaluate(
                                            (p) => window.__fusion.probe(p),
                                            oracle.auditPoints(state.canvas.width, state.canvas.height),
                                        );
                                        row.captures.push({
                                            id: c.id,
                                            setBefore: captureSet.setBefore,
                                            setReceipt: captureSet.setReceipt,
                                            state,
                                            probe,
                                            png: fileIdentity(path.relative(ROOT, pngPath)),
                                        });
                                    }
                                    row.boundaries = [];
                                    for (const p of oracle.boundaryPlan()) {
                                        row.boundaries.push(
                                            await page.evaluate(
                                                async (p) => {
                                                    const before = window.__fusion.snapshot().params;
                                                    const receipt = await window.__fusion.set(p.values);
                                                    const after = window.__fusion.snapshot().params;
                                                    return { id: p.id, before, receipt, after };
                                                },
                                                {
                                                    id: p.caseId,
                                                    values: { ...oracle.defaults(), [p.parameter]: p.value },
                                                },
                                            ),
                                        );
                                    }
                                    await page.evaluate((p) => window.__fusion.set(p), oracle.defaults());
                                    if (profile.dpr === 1) {
                                        row.resources = await page.evaluate(() => window.__fusion.cycles());
                                        const before = await page.evaluate(() => window.__fusion.snapshot());
                                        await page.setViewportSize({ width: 480, height: 320 });
                                        await page.waitForFunction(
                                            () =>
                                                document.querySelector('canvas').width === 480 &&
                                                document.querySelector('canvas').height === 320,
                                        );
                                        await page.waitForTimeout(250);
                                        await page.evaluate(async () => {
                                            for (let i = 0; i < 5; i++) await window.__fusion.step();
                                            await new Promise((resolve) =>
                                                requestAnimationFrame(() => requestAnimationFrame(resolve)),
                                            );
                                        });
                                        const after = await page.evaluate(() => window.__fusion.snapshot());
                                        const pngPath = path.join(artifacts, `${engine}-${effect}-${mode}-resize.png`);
                                        await page.waitForTimeout(80);
                                        await page.screenshot({ path: pngPath });
                                        row.resize = { before, after, png: fileIdentity(path.relative(ROOT, pngPath)) };
                                    }
                                } else {
                                    row.precision = await page.evaluate(() => {
                                        const a = [];
                                        let last = performance.now();
                                        for (let i = 0; i < 25000; i++) {
                                            const now = performance.now();
                                            if (now > last) a.push(now - last);
                                            last = now;
                                        }
                                        return a;
                                    });
                                    await page.evaluate(() => window.__fusion.startPerformance());
                                    await page.waitForTimeout(6000);
                                    row.observation = await page.evaluate(() => window.__fusion.stopPerformance());
                                }
                                if (phase === 'functional') {
                                    await page.evaluate(() => document.documentElement.classList.remove('test'));
                                    const start = await page.evaluate(() => window.__fusion.snapshot());
                                    await page.locator('#pause').click();
                                    const frozen = await page.evaluate(() => window.__fusion.step(1 / 60));
                                    await page.locator('#resume').click();
                                    const advanced = await page.evaluate(() => window.__fusion.step(1 / 60));
                                    await page.evaluate(() =>
                                        document.querySelector('#reset').addEventListener(
                                            'click',
                                            () => {
                                                window.__fusionReset = window.__fusion.snapshot();
                                            },
                                            { once: true },
                                        ),
                                    );
                                    await page.locator('#reset').click();
                                    const reset = await page.evaluate(() => window.__fusionReset);
                                    await page.locator('#release').click();
                                    await page.evaluate(() => window.__fusion.release());
                                    row.controls = await page.evaluate(
                                        ({ start, frozen, advanced, reset }) => ({
                                            pause: { before: start.time, after: frozen.time },
                                            resume: { before: frozen.time, after: advanced.time },
                                            reset,
                                            events: window.__fusion.snapshot().events,
                                            disabled: [...document.querySelectorAll('button')].every((b) => b.disabled),
                                        }),
                                        { start, frozen, advanced, reset },
                                    );
                                }
                                row.releaseIdentity = await page.evaluate(() => window.__fusion.releaseIdentity());
                                row.release = await page.evaluate(() => window.__fusion.release());
                            } finally {
                                await page.close();
                                row.pageClosed = page.isClosed();
                            }
                            console.log(
                                JSON.stringify({
                                    engine,
                                    effect,
                                    mode,
                                    profile: profile.id || profile.dpr,
                                    captured: true,
                                }),
                            );
                        }
            } finally {
                await browser.close();
                for (const r of engineRows) r.browserClosed = !browser.isConnected();
            }
        }
    } catch (error) {
        report.collectionError = String(error.stack || error);
    } finally {
        if (proxy) {
            await proxy.close();
            report.cleanup.proxyClosed = true;
        }
        await server.close();
        report.cleanup.serverClosed = true;
    }
    if (!equal(before, currentIdentity())) throw new Error('Inputs changed during collection');
    report.endedAt = new Date().toISOString();
    report.scopePassed = true;
    report.exitCode = 0;
    const validation = validateFiles(report);
    report.scopePassed = validation.ok;
    report.exitCode = validation.ok ? 0 : 1;
    report.validation = validation;
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ out, ...validation }));
    process.exitCode = report.exitCode;
}
module.exports = {
    currentIdentity,
    validateData,
    validateFiles,
    checkRetirement,
    checkState,
    CASES,
    PROFILES,
    ORACLES,
    main,
};
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
