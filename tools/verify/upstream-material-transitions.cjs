const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { validate } = require('./upstream-material-transitions-observations.cjs');
const root = path.resolve(__dirname, '../..');
const option = (name) => process.argv.find((arg) => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
const outArg = option('out'),
    engine = option('browser') || 'chromium';
if (!outArg || !['chromium', 'firefox', 'webkit'].includes(engine))
    throw Error('--out=<new directory> and a supported --browser are required');
const out = path.resolve(outArg);
if (fs.existsSync(out)) throw Error('Keep previous attempts; output must be new');
fs.mkdirSync(out, { recursive: true });
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const files = [
    'build/cocosair.module.js',
    'tools/verify/upstream-material-transitions.cjs',
    'tools/verify/upstream-material-transitions-observations.cjs',
    'tools/verify/competitive-example-server.cjs',
    'tools/verify/browser-engines.cjs',
    'test/fixtures/upstream-material-transitions/index.html',
    'test/fixtures/upstream-material-transitions/main.js',
    'examples/material-inspection-showroom/assets/inspection-rig.gltf',
    'examples/material-inspection-showroom/assets/crystal.gltf',
    'examples/material-inspection-showroom/assets/checker.png',
];
const report = {
    status: 'NOT_RUN',
    scope: 'U02/U04 mutation/rebuild and transmission lifecycle subset only',
    startedAt: new Date().toISOString(),
    engine,
    inputHashes: {},
    errors: [],
    responses: [],
    screenshots: [],
};
(async () => {
    let server, browser, context, browserServer, closeObserved;
    const pending = [];
    try {
        report.inputHashes = Object.fromEntries(
            files.map((file) => [file, sha(fs.readFileSync(path.join(root, file)))]),
        );
        fs.writeFileSync(path.join(out, 'inputs.json'), JSON.stringify(report.inputHashes, null, 2) + '\n');
        server = await startExampleServer(root);
        try {
            const options = { headless: true, ...launchOptions(engine) };
            report.launchOptions = options;
            browserServer = await require('playwright')[engine].launchServer(options);
            const process = browserServer.process();
            report.browserProcess = { pid: process.pid, closeObserved: false };
            closeObserved = new Promise((resolve) =>
                process.once('close', (code, signal) => {
                    Object.assign(report.browserProcess, { code, signal, closeObserved: true });
                    resolve();
                }),
            );
            browser = await require('playwright')[engine].connect(browserServer.wsEndpoint());
        } catch (error) {
            report.status = 'INFRA_BLOCKED';
            throw error;
        }
        report.browserVersion = browser.version();
        context = await browser.newContext({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', (error) =>
            report.errors.push({ type: 'pageerror', message: String(error.stack || error) }),
        );
        page.on('console', (message) => {
            if (message.type() === 'error') report.errors.push({ type: 'console', message: message.text() });
        });
        page.on('response', (response) => {
            if (!response.url().startsWith(server.origin)) return;
            pending.push(
                response
                    .body()
                    .then((body) =>
                        report.responses.push({
                            url: response.url(),
                            status: response.status(),
                            sha256: sha(body),
                            bytes: body.length,
                        }),
                    )
                    .catch((error) => report.errors.push({ type: 'response', message: String(error) })),
            );
        });
        await page.goto(server.origin + '/test/fixtures/upstream-material-transitions/index.html', {
            waitUntil: 'load',
            timeout: 30000,
        });
        await page.waitForFunction(() => window.__upstreamMaterialTransitions?.ready, undefined, { timeout: 30000 });
        await page.evaluate(() => {
            window.__materialOutcome = { status: 'RUNNING' };
            window.__upstreamMaterialTransitions.run().then(
                (value) => (window.__materialOutcome = { status: 'RETURNED', value }),
                (error) => (window.__materialOutcome = { status: 'ERROR', message: String(error.stack || error) }),
            );
        });
        await page.waitForFunction(() => window.__materialOutcome.status !== 'RUNNING', undefined, { timeout: 90000 });
        const outcome = await page.evaluate(() => window.__materialOutcome);
        fs.writeFileSync(path.join(out, 'raw-outcome.json'), JSON.stringify(outcome, null, 2) + '\n');
        if (outcome.status !== 'RETURNED') throw Error(outcome.message);
        report.validation = validate(outcome.value);
        const { PNG } = require('pngjs');
        const save = (name, pixels) => {
            const png = new PNG({ width: outcome.value.width, height: outcome.value.height });
            // Native readPixels is bottom-up. Preserve raw JSON above; display PNG is top-down.
            const stride = outcome.value.width * 4;
            for (let y = 0; y < outcome.value.height; y++)
                Buffer.from(pixels.slice(y * stride, (y + 1) * stride)).copy(
                    png.data,
                    (outcome.value.height - y - 1) * stride,
                );
            const bytes = PNG.sync.write(png);
            fs.writeFileSync(path.join(out, name), bytes);
            report.screenshots.push({
                path: name,
                sha256: sha(bytes),
                kind: 'native-framebuffer-readback-not-compositor',
            });
        };
        for (const [index, row] of outcome.value.rows.entries())
            for (const field of ['initialPixels', 'mutatedPixels', 'freshPixels'])
                save(`pair-${index}-${field}.png`, row[field]);
        for (const row of outcome.value.semantics)
            for (const field of ['leftPixels', 'rightPixels']) save(`${row.id}-${field}.png`, row[field]);
        for (const field of [
            'baselinePixels',
            'activePixels',
            'disabledPixels',
            'reenabledPixels',
            'destroyedPixels',
            'recreatedPixels',
        ])
            save(`capture-${field}.png`, outcome.value.restoration[field]);
        await page.evaluate(() => window.__upstreamMaterialTransitions.present());
        const compositor = await page.screenshot({ path: path.join(out, 'compositor.png') });
        report.screenshots.push({ path: 'compositor.png', sha256: sha(compositor), kind: 'browser-compositor' });
        report.runtimeClose = await page.evaluate(() => window.__upstreamMaterialTransitions.close());
        for (const receipt of Object.values(report.runtimeClose))
            if (receipt.status !== 'released' || receipt.pending.length || receipt.failures.length)
                throw Error('Runtime cleanup did not complete');
        await Promise.all(pending);
        for (const [file, hash] of Object.entries(report.inputHashes))
            if (sha(fs.readFileSync(path.join(root, file))) !== hash)
                throw Error('Inputs changed during collection: ' + file);
        for (const file of files.filter(
            (file) => file.startsWith('build/') || file.startsWith('test/fixtures/') || file.includes('/assets/'),
        )) {
            const hits = report.responses.filter((row) => new URL(row.url).pathname === '/' + file);
            if (!hits.some((row) => row.status === 200 && row.sha256 === report.inputHashes[file]))
                throw Error('Missing exact served input: ' + file);
        }
        if (report.errors.length) throw Error('Unexpected page/response errors');
        report.status = 'PASS';
    } catch (error) {
        if (report.status !== 'INFRA_BLOCKED') report.status = 'FAIL';
        report.error = String(error.stack || error);
    } finally {
        for (const [name, resource] of [
            ['context', context],
            ['browser', browser],
            ['browserServer', browserServer],
            ['server', server],
        ])
            try {
                if (resource) await resource.close();
                report[name + 'Closed'] = !!resource;
            } catch (error) {
                report.status = 'FAIL';
                report[name + 'CloseError'] = String(error);
            }
        if (closeObserved) {
            let timer;
            try {
                await Promise.race([
                    closeObserved,
                    new Promise(
                        (_, reject) =>
                            (timer = setTimeout(() => reject(Error('Physical browser close not observed')), 4000)),
                    ),
                ]);
            } catch (error) {
                report.status = 'FAIL';
                report.physicalCloseError = String(error);
            } finally {
                clearTimeout(timer);
            }
        }
        await Promise.allSettled(pending);
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(
            JSON.stringify({ status: report.status, out, engine, error: report.error, scope: report.scope }, null, 2),
        );
        if (report.status !== 'PASS') process.exitCode = 1;
    }
})();
