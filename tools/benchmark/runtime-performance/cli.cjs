#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { gzipSync } = require('node:zlib');
const { audit, digest, identity, writeNew } = require('./evidence.cjs');
const root = path.resolve(__dirname, '../../..');
const catalog = require('./catalog.json');
const arms = ['air', 'air-min-input', 'three-frozen', 'three-current'];
const help = `Runtime performance (startup diagnostics, not a leaderboard)
  plan --campaign ID --out NEW_JSON
  build --manifest FILE --inputs DIR --out NEW_DIR
  doctor --browser webkit|chromium|firefox [--executable PATH] --out NEW_JSON
  run --manifest FILE --artifacts DIR --browser TYPE [--executable PATH] [--arm ARM]
      [--case S01|S02] [--samples 1..20] [--mode diagnostic|correctness] --out NEW_DIR
Inputs must contain air/, three-frozen/, three-current/ installation roots with local
node_modules (see README). Does not install, publish, overwrite, or rank.
Exit 1: failed contract; 2: missing capability. Existing outputs are never overwritten.`;

function failure(message, code = 1) {
    return Object.assign(new Error(message), { exitCode: code });
}

const read = (name) => JSON.parse(fs.readFileSync(name, 'utf8'));
const shaFile = (name) => digest(fs.readFileSync(name));
const validHash = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const catalogSha256 = shaFile(path.join(__dirname, 'catalog.json'));
const toolSha256 = digest(
    Buffer.concat(
        ['cli.cjs', 'evidence.cjs', 'page.mjs', 'entry-air.mjs', 'entry-three.mjs'].map((name) =>
            fs.readFileSync(path.join(__dirname, name)),
        ),
    ),
);

function manifestAt(file) {
    const manifest = read(file);
    if (
        manifest.schemaVersion !== 1 ||
        manifest.scope !== 'diagnostic' ||
        !validHash(manifest.airBaseline) ||
        manifest.catalogSha256 !== catalogSha256 ||
        manifest.toolSha256 !== toolSha256
    )
        throw failure('Manifest identity mismatch');
    return { manifest, manifestSha256: shaFile(file) };
}

function plan(args) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(args.campaign || '')) throw failure('Invalid campaign identifier');
    const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8' }).trim();
    const base = git('rev-parse', 'HEAD');
    if (git('diff', 'HEAD', '--name-only', '--', 'src', 'tools/build', 'package.json', 'package-lock.json')) {
        throw failure('Runtime, build, or package sources are modified relative to HEAD');
    }
    writeNew(args.out, {
        schemaVersion: 1,
        campaignId: args.campaign,
        scope: 'diagnostic',
        airBaseline: base,
        catalogSha256,
        toolSha256,
        viewport: catalog.desktop,
        cases: catalog.cases.map(([id]) => id),
        references: catalog.references,
    });
}

async function build(args) {
    const { manifestSha256 } = manifestAt(args.manifest);
    const inputs = path.resolve(args.inputs);
    const esbuild = require('esbuild');
    const out = path.resolve(args.out);
    fs.mkdirSync(out);
    const artifacts = {};
    for (const arm of arms) {
        const air = arm.startsWith('air');
        const installation = path.join(inputs, air ? 'air' : arm);
        const moduleDir = path.join(installation, 'node_modules', air ? 'cocosair.js' : 'three');
        const pkg = read(path.join(moduleDir, 'package.json'));
        if (!air && pkg.version !== catalog.references[arm]) throw failure(`Wrong Three.js version for ${arm}`);
        const resolved = path.resolve(moduleDir, pkg.exports['.'].import);
        const selected =
            arm === 'air-min-input' ? path.join(path.dirname(resolved), 'cocosair.module.min.js') : resolved;
        const input = path.join(__dirname, air ? 'entry-air.mjs' : 'entry-three.mjs');
        const alias = air && arm === 'air-min-input' ? { 'cocosair.js': selected } : undefined;
        const result = await esbuild.build({
            stdin: {
                contents: fs.readFileSync(input, 'utf8'),
                resolveDir: installation,
                sourcefile: path.basename(input),
            },
            alias,
            bundle: true,
            minify: true,
            format: 'esm',
            platform: 'browser',
            target: 'es2022',
            legalComments: 'inline',
            logLevel: 'warning',
            metafile: true,
            write: false,
        });
        const file = `${arm}.mjs`;
        const bytes = result.outputFiles[0].contents;
        fs.writeFileSync(path.join(out, file), bytes, { flag: 'wx' });
        const lockHash = shaFile(path.join(installation, 'package-lock.json'));
        artifacts[arm] = {
            file,
            package: pkg.name,
            version: pkg.version,
            lockSha256: lockHash,
            selectedPackageEntry: path.relative(moduleDir, selected).split(path.sep).join('/'),
            entry: identity(fs.readFileSync(selected)),
            app: identity(bytes),
            filesBundled: Object.keys(result.metafile.inputs).length,
        };
    }
    writeNew(path.join(out, 'artifacts.json'), {
        manifestSha256,
        node: process.version,
        esbuild: esbuild.version,
        artifacts,
    });
}

async function browserFor(args) {
    if (!['webkit', 'chromium', 'firefox'].includes(args.browser)) throw failure('Select an explicit browser');
    try {
        return await require('playwright')[args.browser].launch(
            args.executable ? { executablePath: path.resolve(args.executable) } : {},
        );
    } catch (error) {
        throw failure(`Browser unavailable: ${error.message}`, 2);
    }
}

async function doctor(args) {
    const browser = await browserFor(args);
    try {
        const page = await browser.newPage();
        const device = await page.evaluate(() => {
            const gl = document.createElement('canvas').getContext('webgl2');
            if (!gl) return { webgl2: false };
            const debug = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                webgl2: true,
                renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
                timerQuery: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),
                resourceTiming: typeof PerformanceResourceTiming === 'function',
            };
        });
        writeNew(args.out, {
            scope: 'diagnostic',
            node: process.version,
            platform: process.platform,
            browser: args.browser,
            browserVersion: browser.version(),
            ...device,
            hardwareRanking: 'BLOCKED',
            reason: 'This command does not attest a physical GPU',
        });
        if (!device.webgl2) throw failure('WebGL2 unavailable', 2);
    } finally {
        await browser.close();
    }
}

function pageHtml(arm) {
    const { width, height } = catalog.desktop;
    const engine = arm.startsWith('air') ? 'air' : 'three';
    return `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,">
<script>window.startup = { bootstrapEntry: performance.now(), dpr: devicePixelRatio };</script>
<style>html,body{margin:0;background:#fff}canvas{display:block;width:${width}px;height:${height}px}</style>
</head><body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" width="${width}" height="${height}"></canvas></div></div>
<script type="module">
window.startup.moduleImportStart = performance.now();
const { sdk } = await import('/bundle.mjs');
window.startup.moduleImportEnd = performance.now();
const { start } = await import('/page.mjs');
await start('${engine}', sdk);
</script></body></html>`;
}

async function serve(arm, bytes) {
    const zipped = gzipSync(bytes, { level: 9 });
    const shared = fs.readFileSync(path.join(__dirname, 'page.mjs'));
    const server = http.createServer((req, res) => {
        const route = (req.url || '').split('?')[0];
        res.setHeader('Cache-Control', 'no-store');
        if (route === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(pageHtml(arm));
        } else if (route === '/bundle.mjs') {
            res.writeHead(200, {
                'Content-Type': 'text/javascript',
                'Content-Encoding': 'gzip',
                'Content-Length': zipped.length,
            });
            res.end(zipped);
        } else if (route === '/page.mjs') {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(shared);
        } else {
            res.writeHead(404).end();
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return server;
}

async function run(args) {
    const { manifestSha256 } = manifestAt(args.manifest);
    const index = read(path.join(args.artifacts, 'artifacts.json'));
    if (index.manifestSha256 !== manifestSha256) throw failure('Artifact manifest mismatch');
    const selected = args.arm === undefined ? arms : [args.arm];
    const cases = args.case === undefined ? ['S01', 'S02'] : [args.case];
    const samples = Number(args.samples ?? 1);
    const mode = args.mode ?? 'diagnostic';
    if (!['diagnostic', 'correctness'].includes(mode)) throw failure('Invalid mode');
    const PNG = mode === 'correctness' ? require('pngjs').PNG : null;
    if (
        !selected.every((arm) => arms.includes(arm)) ||
        !cases.every((id) => ['S01', 'S02'].includes(id)) ||
        !Number.isSafeInteger(samples) ||
        samples < 1 ||
        samples > 20
    )
        throw failure('Invalid arm, case, or sample count');
    const out = path.resolve(args.out);
    fs.mkdirSync(out);
    let bad = 0;
    const attempts = [];
    for (let sample = 0; sample < samples; sample += 1) {
        const ordered = sample % 2 === 0 ? selected : [...selected].reverse();
        for (const arm of ordered) {
            const artifact = index.artifacts[arm];
            const bytes = fs.readFileSync(path.join(args.artifacts, `${arm}.mjs`));
            if (!artifact || artifact.app.sha256 !== digest(bytes)) throw failure(`Artifact bytes changed: ${arm}`);
            const server = await serve(arm, bytes);
            try {
                for (const caseId of cases) {
                    const slot = `${sample + 1}-${arm}-${caseId}`;
                    const attempt = {
                        manifestSha256,
                        arm,
                        caseId,
                        sample: sample + 1,
                        bundleBytes: bytes.length,
                        errors: [],
                    };
                    let browser;
                    try {
                        browser = await browserFor(args);
                        attempt.browserVersion = browser.version();
                        const { width, height, dpr } = catalog.desktop;
                        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
                        page.setDefaultTimeout(20000);
                        page.on('pageerror', (e) => attempt.errors.push(e.message));
                        page.on('console', (event) => {
                            if (event.type() === 'error') attempt.errors.push(event.text());
                        });
                        page.on('response', (res) => {
                            if (res.status() >= 400)
                                attempt.errors.push(`HTTP ${res.status()} ${new URL(res.url()).pathname}`);
                        });
                        page.on('requestfailed', (req) =>
                            attempt.errors.push(`Request failed: ${new URL(req.url()).pathname}`),
                        );
                        await page.goto(`http://127.0.0.1:${server.address().port}/?case=${caseId}`, {
                            waitUntil: 'commit',
                        });
                        await page.waitForFunction(() => Number.isFinite(window.startup?.firstDrawEvent));
                        const take = async (tag) => {
                            await page.evaluate(
                                () =>
                                    new Promise((resolve) =>
                                        requestAnimationFrame(() => requestAnimationFrame(resolve)),
                                    ),
                            );
                            const bytes = await page.screenshot({ type: 'png', timeout: 10000 });
                            fs.writeFileSync(path.join(out, `${slot}-${tag}.png`), bytes, { flag: 'wx' });
                            return PNG.sync.read(bytes);
                        };
                        const before = PNG ? await take('initial') : null;
                        let after = null;
                        if (caseId === 'S02') {
                            await page.mouse.click(width / 2, height / 2);
                            await page.waitForFunction(() => Number.isFinite(window.startup?.inputDrawEvent));
                            if (PNG) after = await take('after-input');
                        }
                        const observed = await page.evaluate(() => ({
                            marks: window.startup,
                            bundleTiming: performance
                                .getEntriesByName(new URL('/bundle.mjs', location.href).href)[0]
                                ?.toJSON(),
                        }));
                        Object.assign(attempt, observed);
                        if (before) attempt.visual = require('./evidence.cjs').visualProbe(caseId, before, after);
                    } catch (error) {
                        attempt.errors.push(error.message);
                    } finally {
                        if (browser) {
                            try {
                                await browser.close();
                            } catch (error) {
                                attempt.errors.push(error.message);
                            }
                        }
                    }
                    attempt.rejection =
                        audit(attempt, catalog.desktop) ??
                        (PNG && attempt.visual?.ok !== true ? 'VISUAL_PROBE_FAILED' : null);
                    bad += Number(attempt.rejection !== null);
                    writeNew(path.join(out, `${slot}.json`), attempt);
                    attempts.push({ slot, rejection: attempt.rejection });
                }
            } finally {
                await new Promise((resolve) => server.close(resolve));
            }
        }
    }
    writeNew(path.join(out, 'summary.json'), {
        manifestSha256,
        scope: 'diagnostic',
        mode,
        ranking: 'BLOCKED',
        firstContentProxyMs: null,
        displayPresentMs: null,
        attempts,
    });
    if (bad) throw failure(`${bad} diagnostics failed; see attempt receipts`);
}

async function main() {
    const [verb, ...argv] = process.argv.slice(2);
    if (!verb || verb === '--help' || argv.includes('--help')) {
        console.log(help);
        return;
    }
    const commands = { plan, build, doctor, run };
    if (!Object.hasOwn(commands, verb)) throw failure('Unknown command');
    const opts = {
        plan: ['campaign', 'out'],
        build: ['manifest', 'inputs', 'out'],
        doctor: ['browser', 'executable', 'out'],
        run: ['manifest', 'artifacts', 'browser', 'executable', 'arm', 'case', 'samples', 'mode', 'out'],
    };
    const { values } = parseArgs({
        args: argv,
        options: Object.fromEntries(opts[verb].map((name) => [name, { type: 'string' }])),
    });
    for (const key of opts[verb].filter((name) => !['executable', 'arm', 'case', 'samples', 'mode'].includes(name))) {
        if (!values[key]) throw failure(`--${key} is required`);
    }
    if (fs.existsSync(values.out)) throw failure('Output already exists');
    await commands[verb](values);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
});
