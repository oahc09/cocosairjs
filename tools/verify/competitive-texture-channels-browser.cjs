/** Independent real GPU channel assertions. Writes only output/, never SDK/canonical evidence. */
const fs = require('fs'),
    path = require('path'),
    http = require('http'),
    crypto = require('crypto');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sources = [
    'src/air/assets/gltf/material/physical-effect.ts',
    'src/air/assets/gltf/material.ts',
    'src/air/assets/gltf/material/texture-slots.ts',
    'tools/debug/probes/transmission-texture-channels/index.html',
    'tools/debug/probes/transmission-texture-channels/main.js',
    path.relative(root, __filename).replace(/\\/g, '/'),
];
const fingerprints = Object.fromEntries(
    sources.map((source) => [source, hash(fs.readFileSync(path.join(root, source)))]),
);
const bundle = hash(fs.readFileSync(path.join(root, 'build/cocosair.module.js')));
const engines = process.argv
    .find((value) => value.startsWith('--engines='))
    ?.slice(10)
    .split(',') || ['chromium', 'firefox', 'webkit'];
const output = path.resolve(
    root,
    process.argv.find((value) => value.startsWith('--out='))?.slice(6) ||
        'output/competitive-benchmark/texture-channel-pixels.json',
);
if (!output.startsWith(path.join(root, 'output') + path.sep)) throw new Error('report must stay in output/');
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
    }
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
        response.writeHead(404);
        response.end();
        return;
    }
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    response.writeHead(200, {
        'content-type': file.endsWith('.html')
            ? 'text/html'
            : file.endsWith('.js')
              ? 'text/javascript'
              : 'application/octet-stream',
        'cache-control': 'no-store',
    });
    fs.createReadStream(file).pipe(response);
});
(async () => {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const records = [];
    try {
        for (const engine of engines) {
            if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error('invalid engine');
            const launch = { headless: true };
            if (engine === 'chromium' && !fs.existsSync(playwright.chromium.executablePath()))
                launch.executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
            if (engine === 'firefox' && !fs.existsSync(playwright.firefox.executablePath()))
                launch.executablePath = path.join(
                    process.env.LOCALAPPDATA,
                    'ms-playwright/firefox-1543/firefox/firefox.exe',
                );
            const browser = await playwright[engine].launch(launch);
            try {
                const page = await browser.newPage({ viewport: { width: 960, height: 720 } }),
                    errors = [];
                page.on('pageerror', (error) => errors.push(String(error)));
                page.on('console', (message) => {
                    if (message.type() === 'error') errors.push(message.text());
                });
                await page.goto(
                    `http://127.0.0.1:${server.address().port}/tools/debug/probes/transmission-texture-channels/`,
                );
                await page.waitForFunction(() => window.__transmissionChannelProbe?.done, null, { timeout: 30000 });
                const result = await page.evaluate(() => window.__transmissionChannelProbe);
                const fixtureSha256 = hash(JSON.stringify(result.fixture));
                delete result.fixture;
                fs.mkdirSync(path.dirname(output), { recursive: true });
                const screenshot = path.join(path.dirname(output), `texture-channel-${engine}.png`);
                await page.locator('canvas').screenshot({ path: screenshot });
                records.push({
                    engine,
                    browserVersion: browser.version(),
                    fixtureSha256,
                    screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                    errors,
                    result,
                    ok: result.ok === true && result.checks.length === 13 && errors.length === 0,
                });
            } finally {
                await browser.close();
            }
        }
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
    const drift =
        hash(fs.readFileSync(path.join(root, 'build/cocosair.module.js'))) !== bundle ||
        sources.some((source) => hash(fs.readFileSync(path.join(root, source))) !== fingerprints[source]);
    const report = {
        measuredAt: new Date().toISOString(),
        scope: 'Native material 1x1 texture RG orthogonal pairs; transmission R and volume thickness G; wrong-channel/R*G counterexamples; frozen native renderer pixels',
        bundleSha256: bundle,
        sourceSha256: fingerprints,
        candidateDrift: drift,
        records,
        ok: records.every((record) => record.ok) && !drift,
    };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
