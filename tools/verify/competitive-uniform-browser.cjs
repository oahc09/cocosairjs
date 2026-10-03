/** Read-only runtime verification. Writes only the explicitly selected output file.
 * NODE_PATH=<existing playwright node_modules> node tools/verify/competitive-uniform-browser.cjs
 * Options: --probe=uniform|texture --browser=chromium|firefox|webkit --executable=<existing-browser> --out=output/playwright/<probe>-<browser>.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const playwright = require('playwright');
const root = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const option = (key, fallback) =>
    args.find((value) => value.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
const engine = option('browser', 'chromium');
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error(`invalid browser: ${engine}`);
const probeName = option('probe', 'uniform');
if (!['uniform', 'texture'].includes(probeName)) throw new Error(`invalid probe: ${probeName}`);
const output = path.resolve(root, option('out', `output/playwright/competitive-${probeName}-${engine}.json`));
const digest = (file) =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex');
const bundlePath = 'build/cocosair.module.js';
const bundleHash = digest(bundlePath);
const sourcePaths =
    probeName === 'uniform'
        ? [
              'src/cocos/asset/assets/material.ts',
              'src/cocos/render-scene/core/pass.ts',
              'src/cocos/render-scene/core/pass-utils.ts',
              'src/cocos/core/platform/property-validation.ts',
              'src/cocos/3d/lights/light-component.ts',
              'src/cocos/render-scene/scene/light.ts',
              'tools/debug/probes/competitive-uniform-probe/main.js',
          ]
        : [
              'src/cocos/asset/assets/asset-enum.ts',
              'src/cocos/asset/assets/texture-base.ts',
              'src/cocos/asset/assets/texture-2d.ts',
              'src/cocos/asset/assets/simple-texture.ts',
              'src/cocos/gfx/webgl2/webgl2-commands.ts',
              'tools/debug/probes/competitive-texture-probe/main.js',
          ];
const sourceHashes = Object.fromEntries(sourcePaths.map((file) => [file, digest(file)]));
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
    }
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404);
        response.end();
        return;
    }
    const type = file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
          ? 'text/javascript'
          : 'application/octet-stream';
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
});
let browser;
(async () => {
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const launch = { headless: true };
        const executable = option('executable', '');
        if (executable) {
            if (!fs.existsSync(executable)) throw new Error(`browser executable missing: ${executable}`);
            launch.executablePath = executable;
        } else if (engine === 'chromium' && !fs.existsSync(playwright.chromium.executablePath())) {
            const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
            if (fs.existsSync(chrome)) launch.executablePath = chrome;
        }
        browser = await playwright[engine].launch(launch);
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const consoleErrors = [];
        page.on('pageerror', (error) => consoleErrors.push(String(error)));
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        await page.goto(
            `http://127.0.0.1:${server.address().port}/tools/debug/probes/competitive-${probeName}-probe/index.html`,
        );
        await page.waitForFunction(
            (name) => window[name]?.done,
            probeName === 'uniform' ? '__competitiveUniformProbe' : '__competitiveTextureProbe',
            { timeout: 30000 },
        );
        const result = await page.evaluate(
            (name) => window[name],
            probeName === 'uniform' ? '__competitiveUniformProbe' : '__competitiveTextureProbe',
        );
        const runtime = await page.evaluate(() => ({
            userAgent: navigator.userAgent,
            dpr: devicePixelRatio,
            width: document.querySelector('canvas').width,
            height: document.querySelector('canvas').height,
        }));
        const changed =
            digest(bundlePath) !== bundleHash || sourcePaths.some((file) => digest(file) !== sourceHashes[file]);
        const report = {
            recordedAt: new Date().toISOString(),
            browser: engine,
            browserVersion: browser.version(),
            browserExecutable: launch.executablePath || playwright[engine].executablePath(),
            runtime,
            bundle: { path: bundlePath, sha256: bundleHash },
            sourceHashes,
            consoleErrors,
            changedDuringRun: changed,
            scope:
                probeName === 'uniform'
                    ? 'raw WebGL2 control; engine vertex/fragment FLOAT4 xyzw updates; CCGlobal vertex-stage spatial consistency; invalid-array rejection without pixel mutation'
                    : 'explicit Texture2D sRGB/linear equivalent inputs; one output encoding; alpha/UV agreement; normal/data textures remain linear',
            result,
        };
        report.ok =
            result.ok === true &&
            result.checks.length === (probeName === 'uniform' ? 30 : 44) &&
            consoleErrors.length === 0 &&
            !changed;
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
        console.log(
            JSON.stringify(
                {
                    ok: report.ok,
                    checks: result.checks.length,
                    failed: result.checks.filter((item) => !item.ok),
                    consoleErrors,
                    changedDuringRun: changed,
                    output: path.relative(root, output),
                },
                null,
                2,
            ),
        );
        if (!report.ok) process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
