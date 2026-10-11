'use strict';
// Focused real Gallery retire/reacquire proof with scoped WebKit launch fix,
// pure report validation, and complete input closure. Lead executes browsers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');

const ROOT = path.resolve(__dirname, '../..');
const EFFECTS = [
    ['shader-noise-dissolve', '__e01'],
    ['shader-thin-film', '__thinFilm'],
    ['shader-sparkle', '__sparkle'],
];
const INPUTS = [
    __filename,
    'tools/verify/shaders-browser-launch.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'examples/shared/shader-lifecycle.ts',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/asset-lifecycle.d.ts',
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'build/npm/cocosair.module.js',
    'build/cocosair.module.js.map',
    ...EFFECTS.flatMap(([id]) => [
        `examples/${id}/src/main.ts`,
        `examples/${id}/src/effect.generated.ts`,
        `examples/${id}/index.html`,
        `examples/${id}/example.json`,
    ]),
    // Per-effect local source dependencies (parameters, generator source, shaders)
    ...EFFECTS.flatMap(([id]) => {
        const extras = [];
        const dir = path.join(ROOT, 'examples', id, 'src');
        for (const entry of fs.readdirSync(dir)) {
            if (entry.endsWith('.ts') && entry !== 'main.ts' && entry !== 'effect.generated.ts') {
                extras.push(`examples/${id}/src/${entry}`);
            }
        }
        const params = path.join(ROOT, 'examples', id, 'parameters.json');
        if (fs.existsSync(params)) extras.push(`examples/${id}/parameters.json`);
        return extras;
    }),
];
function identity(file) {
    const absolute = path.resolve(ROOT, file);
    const bytes = fs.readFileSync(absolute);
    return {
        path: path.relative(ROOT, absolute).replaceAll('\\', '/'),
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
}
function comparePNG(before, after) {
    const { PNG } = require('pngjs');
    const a = PNG.sync.read(fs.readFileSync(before));
    const b = PNG.sync.read(fs.readFileSync(after));
    if (a.width !== b.width || a.height !== b.height) return { error: 'PNG dimensions changed' };
    let changedPixels = 0;
    let variedPixels = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        if ([0, 1, 2, 3].some((k) => a.data[i + k] !== b.data[i + k])) changedPixels++;
        if ([0, 1, 2].some((k) => a.data[i + k] !== a.data[k])) variedPixels++;
    }
    return { width: a.width, height: b.height, changedPixels, variedPixels };
}

// ── Total row checker: null/string/array/malformed → structured rejection, never throws ──
function checkRow(row) {
    try {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            return { ok: false, errors: ['row must be a non-null non-array object'] };
        }
        const errors = [];
        // Runtime error arrays must exist and be empty
        if (!Array.isArray(row.pageErrors)) errors.push('pageErrors missing/not array');
        if (!Array.isArray(row.consoleErrors)) errors.push('consoleErrors missing/not array');
        if (row.error || row.pageErrors?.length || row.consoleErrors?.length) errors.push('runtime errors');
        if (
            !row.lifecycle?.released ||
            !row.lifecycle?.reloaded ||
            row.lifecycle?.errors?.length ||
            row.lifecycle?.leaked?.length ||
            row.lifecycle?.held !== 3
        )
            errors.push('Gallery lifecycle');
        if (
            row.lifecycle?.retirement?.length !== 3 ||
            row.lifecycle.retirement.some(
                (asset) => asset.before !== 1 || asset.after !== 0 || asset.validAfterSettle !== false,
            )
        )
            errors.push('owned references not retired');
        if (row.samePromise !== true || row.after?.instance == null || row.before?.instance === row.after?.instance)
            errors.push('replacement identity');
        if (
            !Number.isSafeInteger(row.pixelComparison?.variedPixels) ||
            row.pixelComparison.variedPixels < 1000 ||
            row.pixelComparison?.changedPixels !== 0
        )
            errors.push('reloaded pixels');
        if (row.releaseSamePromise !== true || row.terminalHold !== 0 || row.pageClosed !== true)
            errors.push('terminal cleanup');
        return { ok: errors.length === 0, errors };
    } catch (e) {
        return { ok: false, errors: [`checkRow crash: ${String(e.message).split('\n')[0]}`] };
    }
}

// ── Pure report validator: exact 18 tuples, browserVersion, dates, command, cwd ──
function validateReport(report) {
    try {
        if (!report || typeof report !== 'object' || Array.isArray(report)) {
            return { ok: false, errors: ['report must be a non-null non-array object'] };
        }
        if (report.schemaVersion !== 'shaders-gallery-lifecycle/1') return { ok: false, errors: ['schema'] };
        const errors = [];
        // Exact 18 tuples: 3 engines × 3 effects × 2 modes
        if (!Array.isArray(report.rows))
            return { ok: false, errors: [`rows must be array, got ${typeof report.rows}`] };
        if (report.rows.length !== 18) errors.push(`expected 18 rows, got ${report.rows.length}`);
        const seen = new Set();
        for (const row of report.rows) {
            if (!row || typeof row !== 'object') {
                errors.push('null row');
                continue;
            }
            const key = `${row.engine}/${row.effect}/${row.mode}`;
            if (seen.has(key)) errors.push(`duplicate ${key}`);
            seen.add(key);
            if (typeof row.browserVersion !== 'string' || !row.browserVersion.trim())
                errors.push(`${key}:browserVersion empty`);
            const v = checkRow(row);
            if (!v.ok) errors.push(...v.errors.map((e) => `${key}:${e}`));
        }
        const expected = new Set(
            ['chromium', 'firefox', 'webkit'].flatMap((e) =>
                EFFECTS.flatMap(([id]) => ['step', 'native'].map((m) => `${e}/${id}/${m}`)),
            ),
        );
        for (const key of expected) if (!seen.has(key)) errors.push(`missing ${key}`);
        for (const key of seen) if (!expected.has(key)) errors.push(`extra ${key}`);
        // Metadata
        if (!report.startedAt || !Date.parse(report.startedAt)) errors.push('startedAt invalid');
        if (!report.endedAt || !Date.parse(report.endedAt)) errors.push('endedAt invalid');
        if (!Array.isArray(report.command) || report.command.length === 0) errors.push('command missing');
        if (typeof report.cwd !== 'string' || !report.cwd) errors.push('cwd missing');
        if (!Number.isInteger(report.exitCode)) errors.push('exitCode not integer');
        if (report.exitCode !== 0) errors.push('collection exit was not zero');
        if (Date.parse(report.endedAt) < Date.parse(report.startedAt)) errors.push('time order');
        if (report.inputsUnchanged !== true) errors.push('inputs changed during collection');
        if (
            report.cleanup?.pagesClosed !== 18 ||
            report.cleanup?.browsersClosed !== 3 ||
            report.cleanup?.serverClosed !== true
        )
            errors.push('owned browser/server cleanup');
        // Scope honesty
        if (report.subset !== true) errors.push('subset must be true');
        if (report.completed !== false) errors.push('completed must be false');
        if (report.waveGate !== 'NOT_RUN') errors.push('waveGate must be NOT_RUN');
        // Do not trust self-reported scopePassed
        if (report.scopePassed === true && errors.length > 0)
            errors.push('scopePassed=true but validation errors exist');
        return { ok: errors.length === 0, errors };
    } catch (e) {
        return { ok: false, errors: [`validateReport crash: ${String(e.message).split('\n')[0]}`] };
    }
}

// ── validateFiles: data gate + raw input/PNG identity verification (always checks both) ──
function validateFiles(report) {
    const dataErrors = [];
    const fileErrors = [];
    try {
        dataErrors.push(...validateReport(report).errors);
    } catch (e) {
        dataErrors.push(`data crash: ${String(e)}`);
    }
    try {
        if (report && typeof report === 'object' && report.schemaVersion === 'shaders-gallery-lifecycle/1') {
            // Recompute current inputs SHA/bytes
            if (!Array.isArray(report.inputs)) {
                fileErrors.push('inputs missing');
            } else {
                const expected = INPUTS.map((file) => identity(file).path);
                if (
                    report.inputs.length !== expected.length ||
                    new Set(report.inputs.map((i) => i?.path)).size !== expected.length ||
                    expected.some((p) => !report.inputs.some((i) => i?.path === p))
                )
                    fileErrors.push('input closure incomplete');
                for (const input of report.inputs) {
                    if (!input?.path || !input?.sha256) {
                        fileErrors.push('input missing path/sha');
                        continue;
                    }
                    try {
                        const actual = identity(input.path);
                        if (actual.sha256 !== input.sha256 || actual.bytes !== input.bytes)
                            fileErrors.push(`input drift: ${input.path}`);
                    } catch (e) {
                        fileErrors.push(`input unreadable: ${input.path}`);
                    }
                }
            }
            // Verify PNG screenshots: SHA/bytes/decodable/640×400 size
            for (const row of report.rows ?? []) {
                if (!Array.isArray(row?.screenshots) || row.screenshots.length !== 2) {
                    fileErrors.push('two lifecycle screenshots required');
                    continue;
                }
                for (const shot of row.screenshots) {
                    if (!shot?.path || !shot?.sha256) {
                        fileErrors.push('screenshot missing identity');
                        continue;
                    }
                    try {
                        const abs = path.resolve(ROOT, shot.path);
                        const bytes = fs.readFileSync(abs);
                        if (crypto.createHash('sha256').update(bytes).digest('hex') !== shot.sha256) {
                            fileErrors.push(`PNG SHA drift: ${shot.path}`);
                        }
                        if (bytes.length !== shot.bytes) fileErrors.push(`PNG bytes drift: ${shot.path}`);
                        const { PNG } = require('pngjs');
                        const png = PNG.sync.read(bytes);
                        if (png.width !== 640 || png.height !== 400)
                            fileErrors.push(`PNG size ${png.width}x${png.height} != 640x400`);
                    } catch (e) {
                        fileErrors.push(`PNG unreadable: ${shot.path}`);
                    }
                }
                try {
                    const actual = comparePNG(
                        path.resolve(ROOT, row.screenshots[0].path),
                        path.resolve(ROOT, row.screenshots[1].path),
                    );
                    if (
                        actual.error ||
                        actual.variedPixels < 1000 ||
                        actual.changedPixels !== 0 ||
                        Object.keys(actual).some((key) => actual[key] !== row.pixelComparison?.[key])
                    )
                        fileErrors.push('independent lifecycle PNG comparison');
                } catch (e) {
                    fileErrors.push('lifecycle PNG comparison unreadable');
                }
            }
        }
    } catch (e) {
        fileErrors.push(`files crash: ${String(e)}`);
    }
    const errors = [...dataErrors, ...fileErrors];
    return { ok: errors.length === 0, errors };
}

async function main() {
    const args = process.argv.slice(2);
    const verifyArg = args.find((v) => v.startsWith('--verify='));
    if (verifyArg) {
        const report = JSON.parse(fs.readFileSync(verifyArg.slice(9), 'utf8'));
        const v = validateFiles(report);
        console.log(JSON.stringify(v));
        process.exitCode = v.ok ? 0 : 1;
        return;
    }
    const out = args.find((v) => v.startsWith('--out='))?.slice(6);
    if (!out || fs.existsSync(out)) throw new Error('Explicit new --out required');
    const { startExampleServer } = require('./competitive-example-server.cjs');
    const { chromium, firefox, webkit } = require('playwright');
    const report = {
        schemaVersion: 'shaders-gallery-lifecycle/1',
        executionChannel: 'Lead',
        startedAt: new Date().toISOString(),
        command: [process.execPath, ...process.argv.slice(1)],
        cwd: ROOT,
        inputs: INPUTS.map(identity),
        subset: true,
        completed: false,
        waveGate: 'NOT_RUN',
        rows: [],
    };
    const artifacts = out.replace(/\.json$/, '') + '-artifacts';
    fs.mkdirSync(artifacts, { recursive: true });
    const server = await startExampleServer(ROOT);
    const cleanup = { pagesClosed: 0, browsersClosed: 0, serverClosed: false };
    try {
        for (const [engine, type] of [
            ['chromium', chromium],
            ['firefox', firefox],
            ['webkit', webkit],
        ]) {
            const launch = shaderLaunchOptions(engine, { recordStrategy: true });
            report.launch ??= {};
            report.launch[engine] = launch.strategy;
            const { strategy, ...options } = launch;
            const browser = await type.launch({ ...options, headless: true });
            try {
                for (const [effect, apiName] of EFFECTS)
                    for (const mode of ['step', 'native']) {
                        const page = await browser.newPage({
                            viewport: { width: 640, height: 400 },
                            deviceScaleFactor: 1,
                        });
                        const row = {
                            engine,
                            browserVersion: browser.version(),
                            effect,
                            mode,
                            pageErrors: [],
                            consoleErrors: [],
                        };
                        report.rows.push(row);
                        page.setDefaultTimeout(10000);
                        page.on('pageerror', (e) => row.pageErrors.push(String(e.stack || e)));
                        page.on('console', (m) => {
                            if (m.type() === 'error') row.consoleErrors.push(m.text());
                        });
                        try {
                            await page.goto(`${server.origin}/examples/${effect}/${mode === 'step' ? '?test=1' : ''}`, {
                                timeout: 30000,
                                waitUntil: 'domcontentloaded',
                            });
                            await page.waitForFunction(
                                (name) =>
                                    typeof window[name]?.snapshot === 'function' && window.__lifecycleHold?.() === 3,
                                apiName,
                                { polling: 100, timeout: 10000 },
                            );
                            async function drawAndSnapshot() {
                                const snapshot = await page.evaluate(
                                    async ({ name, mode }) => {
                                        const api = window[name];
                                        if (name !== '__e01') api.pause?.();
                                        api.setTime?.(0);
                                        if (mode === 'step') await api.step(0);
                                        return api.snapshot();
                                    },
                                    { name: apiName, mode },
                                );
                                if (mode === 'native') await page.waitForTimeout(100);
                                return snapshot;
                            }
                            row.before = await drawAndSnapshot();
                            const beforePath = path.join(artifacts, `${engine}-${effect}-${mode}-before.png`);
                            await page.screenshot({ path: beforePath });
                            row.lifecycle = await page.evaluate(async () => {
                                const first = window.__lifecycle(),
                                    second = window.__lifecycle();
                                window.__galleryPromiseSame = first === second;
                                return await first;
                            });
                            row.samePromise = await page.evaluate(() => window.__galleryPromiseSame);
                            row.after = await drawAndSnapshot();
                            const afterPath = path.join(artifacts, `${engine}-${effect}-${mode}-reloaded.png`);
                            await page.screenshot({ path: afterPath });
                            row.pixelComparison = comparePNG(beforePath, afterPath);
                            row.screenshots = [identity(beforePath), identity(afterPath)];
                            row.release = await page.evaluate(async (name) => {
                                const api = window[name],
                                    first = api.release(),
                                    second = api.release();
                                const result = await first;
                                return {
                                    samePromise: first === second,
                                    result,
                                    snapshot: api.snapshot(),
                                    terminalHold: window.__lifecycleHold(),
                                };
                            }, apiName);
                            row.releaseSamePromise = row.release.samePromise;
                            row.terminalHold = row.release.terminalHold;
                        } catch (error) {
                            row.error = String(error.stack || error);
                        } finally {
                            await page
                                .evaluate(async (name) => {
                                    await window[name]?.release();
                                }, apiName)
                                .catch(() => {});
                            await page.close();
                            row.pageClosed = page.isClosed();
                            if (row.pageClosed) cleanup.pagesClosed++;
                        }
                        row.validation = checkRow(row);
                    }
            } finally {
                await browser.close();
                cleanup.browsersClosed++;
            }
        }
    } finally {
        await server.close();
        cleanup.serverClosed = true;
        report.cleanup = cleanup;
        report.inputsUnchanged = JSON.stringify(report.inputs) === JSON.stringify(INPUTS.map(identity));
        report.endedAt = new Date().toISOString();
        report.exitCode = 0;
        const validation = validateFiles(report);
        report.scopePassed = validation.ok && report.inputsUnchanged;
        report.exitCode = report.scopePassed ? 0 : 1;
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = report.exitCode;
    }
}
module.exports = { main, checkRow, comparePNG, validateReport, validateFiles, INPUTS };
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
