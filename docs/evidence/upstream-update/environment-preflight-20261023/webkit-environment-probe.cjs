/* Environment-only probe. Not a Cocos, browser-matrix or device acceptance run.
 * Uses installed Playwright's matching WebKit with default security/GPU settings.
 * No download, executable override, browser flags, proxy alteration or retry.
 * Usage: NODE_PATH=<installed tooling> PLAYWRIGHT_BROWSERS_PATH=<installed cache>
 *        node webkit-environment-probe.cjs <new output directory>
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const output = path.resolve(process.argv[2] || '');
if (!process.argv[2] || fs.existsSync(output)) throw new Error('Supply a new, non-existing output directory');
fs.mkdirSync(output, { recursive: true });
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const html = `<!doctype html><meta charset="utf-8"><title>WebKit local fixture environment probe</title>
<body style="margin:0;background:white"><canvas width="128" height="128"></canvas><pre id="result"></pre>
<script>
const canvas = document.querySelector('canvas');
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
window.fixture = { webgl2: !!gl };
if (gl) {
  gl.clearColor(0.25, 0.5, 0.75, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  const pixel = new Uint8Array(4); gl.readPixels(64,64,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  Object.assign(window.fixture, { pixel: Array.from(pixel), error: gl.getError(),
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) });
}
document.querySelector('#result').textContent = JSON.stringify(window.fixture);
</script>`;
fs.writeFileSync(path.join(output, 'fixture.html'), html);
const report = {
    schema: 'upstream-webkit-environment-probe/1',
    recordedAt: new Date().toISOString(),
    scope: 'environment-only; no Cocos runtime, full matrix, physical-device or engine acceptance claim',
    node: process.version,
    platform: process.platform,
    fixtureSha256: sha256(html),
    probeSha256: sha256(fs.readFileSync(__filename)),
    launchOptions: { headless: true, timeout: 15000 },
    status: 'NOT_RUN',
    launched: false,
    pageLoaded: false,
    browserCloseAcknowledged: false,
    serverClosed: false,
    pageErrors: [],
};
let browser;
const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
});
async function main() {
    try {
        const { webkit } = require('playwright');
        report.playwright = require('playwright/package.json').version;
        report.selectedExecutable = webkit.executablePath();
        report.executableExists = fs.existsSync(report.selectedExecutable);
        if (report.executableExists) report.executableSha256 = sha256(fs.readFileSync(report.selectedExecutable));
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const url = `http://127.0.0.1:${server.address().port}/`;
        const response = await fetch(url);
        const served = await response.text();
        report.sameProcessHttp = {
            status: response.status,
            sha256: sha256(served),
            matchesFixture: served === html,
        };
        if (!response.ok || served !== html) throw new Error('Same-process local fixture HTTP failed');
        browser = await webkit.launch(report.launchOptions);
        report.launched = true;
        report.browserVersion = browser.version();
        const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
        page.on('pageerror', (error) => report.pageErrors.push(String(error)));
        await page.goto(url, { waitUntil: 'load', timeout: 10000 });
        report.pageLoaded = true;
        report.fixture = await page.evaluate(() => window.fixture);
        await page.screenshot({ path: path.join(output, 'fixture.png') });
        report.screenshotSha256 = sha256(fs.readFileSync(path.join(output, 'fixture.png')));
        const f = report.fixture;
        report.status =
            f?.webgl2 &&
            f.error === 0 &&
            [64, 128, 191, 255].every((expected, index) => Math.abs(f.pixel[index] - expected) <= 1) &&
            report.pageErrors.length === 0
                ? 'ENVIRONMENT_FIXTURE_PASS'
                : 'ENVIRONMENT_WEBGL2_NOT_CONFIRMED';
    } catch (error) {
        report.status = report.launched ? 'ENVIRONMENT_FIXTURE_ERROR' : 'BROWSER_STARTUP_BLOCKED';
        report.error = String(error.stack || error);
    } finally {
        if (browser) {
            try {
                await browser.close();
                report.browserCloseAcknowledged = true;
            } catch (error) {
                report.closeError = String(error);
            }
        }
        if (server.listening) {
            await new Promise((resolve) => server.close(resolve));
        }
        report.serverClosed = !server.listening;
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.status === 'ENVIRONMENT_FIXTURE_PASS' ? 0 : 1;
    }
}
main();
