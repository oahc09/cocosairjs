const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const esbuild = require('esbuild');
const {
    ROOT,
    SCOPE,
    RECIPES,
    CASES,
    fingerprints,
    validateEvidence,
    fullHash,
} = require('../../verify/competitive-batching-evidence.cjs');
const { launchOptions } = require('../../verify/browser-engines.cjs');
const { loopbackBrowserEnv } = require('../../verify/loopback-browser-env.cjs');
const { resolveScript } = require('../../dev/resolve-script.cjs');

async function run() {
    const pw = require('playwright');
    const outDir = path.join(ROOT, 'docs', 'evidence', 'recipes', SCOPE);
    fs.mkdirSync(outDir, { recursive: true });
    const before = fingerprints();
    const report = {
        schema: 'competitive-batching-evidence-v1',
        scope: SCOPE,
        runId: crypto.randomUUID(),
        measuredAt: new Date().toISOString(),
        completed: false,
        recipes: RECIPES.map((r) => r.id),
        fingerprints: before,
        records: [],
        environment: {
            os: `${os.platform()} ${os.release()}`,
            cpu: os.cpus()[0]?.model,
            viewport: [1280, 720],
            dpr: 1,
            browser: 'chromium',
            independentRuns: 1,
            gpuTimeMs: null,
            presentTiming: null,
        },
    };
    const server = http.createServer((req, res) => {
        const url = decodeURIComponent(req.url.split('?')[0]);
        if (url === '/favicon.ico') {
            res.writeHead(204);
            res.end();
            return;
        }
        const abs = resolveScript(path.resolve(ROOT, '.' + (url.endsWith('/') ? url + 'index.html' : url)));
        const rel = path.relative(ROOT, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            res.writeHead(404);
            res.end();
            return;
        }
        try {
            const ext = path.extname(abs);
            const bytes =
                ext === '.ts'
                    ? esbuild.transformSync(fs.readFileSync(abs, 'utf8'), {
                          loader: 'ts',
                          format: 'esm',
                          target: 'es2022',
                      }).code
                    : fs.readFileSync(abs);
            res.writeHead(200, {
                'Content-Type':
                    ext === '.ts' || ext === '.js'
                        ? 'text/javascript'
                        : ext === '.html'
                          ? 'text/html'
                          : ext === '.json'
                            ? 'application/json'
                            : 'application/octet-stream',
            });
            res.end(bytes);
        } catch {
            res.writeHead(500);
            res.end();
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    let browser;
    try {
        browser = await pw.chromium.launch({ ...launchOptions('chromium'), env: loopbackBrowserEnv() });
        report.environment.browserVersion = await browser.version();
        for (const c of CASES) {
            const recipe = RECIPES.find((r) => r.route === c.route);
            const row = {
                ...c,
                recipeId: recipe.id,
                recipeVersion: recipe.version,
                compositeBenchmarkId: recipe.compositeBenchmarkId,
                errors: [],
            };
            const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
            page.on('pageerror', (error) => row.errors.push(error.message));
            page.on('console', (message) => {
                if (message.type() === 'error') row.errors.push(message.text());
            });
            page.on('response', (response) => {
                if (response.status() >= 400)
                    row.errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
            });
            try {
                const target = `http://127.0.0.1:${server.address().port}/examples/batching-${c.route}/?count=${c.count}${c.instancing ? '&instancing=1' : ''}`;
                await page.goto(target);
                await page.waitForFunction(() => window.__trialProbe?.ready === true, undefined, { timeout: 15000 });
                row.geometry = await page.evaluate(async () => {
                    const cc = await import('cocosair');
                    const scene = window.__airApp.getScene();
                    const renderers = scene.getComponentsInChildren(cc.MeshRenderer);
                    const meshes = [...new Set(renderers.map((r) => r.mesh))];
                    const materials = [...new Set(renderers.map((r) => r.sharedMaterial))];
                    return {
                        rendererCount: renderers.length,
                        meshCount: meshes.length,
                        materialCount: materials.length,
                        cameraCount: scene.getComponentsInChildren(cc.Camera).length,
                        materials: materials.map((m) => ({
                            effect: m.effectName,
                            passCount: m.passes.length,
                            blend: m.passes[0].blendState.targets[0].blend,
                            batchingScheme: m.passes[0].batchingScheme,
                        })),
                        meshes: meshes.map((m) => ({
                            primitiveCount: m.struct.primitives.length,
                            vertices: m.struct.vertexBundles[0].view.count,
                            indices: m.struct.primitives[0].indexView?.count || 0,
                        })),
                    };
                });
                row.pixels = await page.evaluate(async () => {
                    const cc = await import('cocosair');
                    const capture = () =>
                        new Promise((resolve) =>
                            cc.director.once(cc.Director.EVENT_AFTER_DRAW, () => {
                                const canvas = document.querySelector('canvas');
                                const copy = document.createElement('canvas');
                                copy.width = canvas.width;
                                copy.height = canvas.height;
                                const ctx = copy.getContext('2d');
                                ctx.drawImage(canvas, 0, 0);
                                const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
                                let lit = 0;
                                for (let i = 0; i < data.length; i += 4)
                                    if (data[i + 1] > 140 && data[i + 1] > data[i] + 40) lit++;
                                resolve({ data, lit, width: copy.width, height: copy.height });
                            }),
                        );
                    const a = await capture();
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    const b = await capture();
                    let changed = 0;
                    for (let i = 0; i < a.data.length; i += 4)
                        if (
                            Math.max(
                                Math.abs(a.data[i] - b.data[i]),
                                Math.abs(a.data[i + 1] - b.data[i + 1]),
                                Math.abs(a.data[i + 2] - b.data[i + 2]),
                            ) > 8
                        )
                            changed++;
                    return { lit: a.lit, changed, width: a.width, height: a.height, dpr: devicePixelRatio };
                });
                const samples = await page.evaluate(async () => {
                    const cc = await import('cocosair');
                    const raw = [];
                    let beforeDraw = 0;
                    let previous = 0;
                    const before = () => {
                        beforeDraw = performance.now();
                    };
                    const after = () => {
                        const now = performance.now();
                        if (previous)
                            raw.push({
                                intervalMs: now - previous,
                                submissionMs: now - beforeDraw,
                                draws: cc.director.root.device.numDrawCalls,
                            });
                        previous = now;
                    };
                    cc.director.on(cc.Director.EVENT_BEFORE_DRAW, before);
                    cc.director.on(cc.Director.EVENT_AFTER_DRAW, after);
                    try {
                        return { measurement: await window.__batchProbe.measure(120), raw: raw.slice(-120) };
                    } finally {
                        cc.director.off(cc.Director.EVENT_BEFORE_DRAW, before);
                        cc.director.off(cc.Director.EVENT_AFTER_DRAW, after);
                    }
                });
                row.measurement = samples.measurement;
                row.rawSamples = samples.raw;
                const png = path.join(outDir, `${c.id}.png`);
                await page.screenshot({ path: png });
                row.screenshot = {
                    path: path.relative(ROOT, png).replace(/\\/g, '/'),
                    bytes: fs.statSync(png).size,
                    sha256: fullHash(png),
                };
                row.lifecycle = await page.evaluate(() => window.__lifecycle());
                row.restoredPixels = await page.evaluate(() => window.__batchProbe.pixels());
                if (!report.environment.renderer)
                    report.environment.renderer = await page.evaluate(() => {
                        const gl = document.querySelector('canvas').getContext('webgl2');
                        const ext = gl.getExtension('WEBGL_debug_renderer_info');
                        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
                    });
            } catch (error) {
                row.errors.push(error.message);
            } finally {
                await page.close();
            }
            report.records.push(row);
            console.log(`${SCOPE}: captured ${c.id}${row.errors.length ? ' ERRORS' : ''}`);
        }
        report.completed = true;
        if (JSON.stringify(fingerprints()) !== JSON.stringify(before))
            report.captureErrors = ['source/candidate changed during capture'];
    } finally {
        if (browser) await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
    report.errors = [...(report.captureErrors || []), ...validateEvidence(report)];
    report.result = report.errors.length ? 'FAIL' : 'PASS';
    fs.writeFileSync(path.join(outDir, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(
        JSON.stringify(
            {
                scope: SCOPE,
                completed: report.completed,
                result: report.result,
                records: report.records.length,
                errors: report.errors,
            },
            null,
            2,
        ),
    );
    process.exitCode = report.errors.length ? 1 : 0;
}
if (require.main === module)
    run().catch((error) => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
module.exports = { run };
