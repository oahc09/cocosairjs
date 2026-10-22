/* U06 real installed-package browser matrix. Optional Vite tooling is external,
 * frozen to 7.1.12, and never installed by this runner. No repository dependencies change.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromiumOptions } = require('./upstream-sdk-browser-options.cjs');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const PINNED_VITE = '7.1.12';

function vitePackage(input) {
    const root = path.resolve(input);
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(metadata.name, 'vite', '--vite must point to an installed Vite package directory');
    assert.equal(metadata.version, PINNED_VITE, 'Vite version is not the frozen consumer version');
    return { root, entry: path.join(root, 'dist/node/index.js'), version: metadata.version };
}

function html(importMap, strictCSP) {
    return `<!doctype html><html><head><meta charset="utf-8">${strictCSP ? "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self' 'nonce-w14-test'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'\">" : ''}${importMap ? `<script nonce="w14-test" type="importmap">${JSON.stringify({ imports: { 'cocosair.js': importMap } })}</script>` : ''}</head><body style="margin:0"><canvas id="GameCanvas" width="480" height="320" style="width:480px;height:320px"></canvas><script type="module" src="/browser-main.js"></script></body></html>`;
}

async function serveInstalled(pkgDir, source) {
    const contentTypes = { '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' };
    const server = http.createServer((request, response) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch {
            response.writeHead(400);
            response.end();
            return;
        }
        if (pathname === '/favicon.ico') {
            response.writeHead(204);
            response.end();
            return;
        }
        if (['/', '/nested/', '/min/'].includes(pathname)) {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end(html(`/installed/build/npm/cocosair.module${pathname === '/min/' ? '.min' : ''}.js`, true));
            return;
        }
        if (pathname === '/browser-main.js') {
            response.writeHead(200, { 'Content-Type': 'text/javascript' });
            response.end(source);
            return;
        }
        const file = path.resolve(pkgDir, pathname.replace(/^\/installed\//, ''));
        if (
            !pathname.startsWith('/installed/') ||
            !file.startsWith(path.resolve(pkgDir) + path.sep) ||
            !fs.existsSync(file) ||
            !fs.statSync(file).isFile()
        ) {
            response.writeHead(404);
            response.end('missing fixture asset');
            return;
        }
        response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(response);
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
}

async function probe(browser, url, id, artifacts) {
    const context = await browser.newContext({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 });
    const result = { id, url, status: 'FAIL', pageErrors: [], cspErrors: [], requests: [], failedRequests: [] };
    try {
        const page = await context.newPage();
        page.on('pageerror', (error) => result.pageErrors.push(String(error.stack || error)));
        page.on('console', (message) => {
            if (/Content Security Policy|Refused to/.test(message.text())) result.cspErrors.push(message.text());
        });
        page.on('request', (request) => result.requests.push(new URL(request.url()).pathname));
        page.on('requestfailed', (request) =>
            result.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }),
        );
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.__consumer, undefined, { timeout: 45000 });
        result.booted = true;
        result.probe = await page.evaluate(() => window.__consumer.probe());
        if (id === 'importmap-unminified' || id === 'importmap-nested-csp') {
            assert.equal(
                result.probe.apiRoundtrip,
                'function,Scene,Node,Camera,MeshRenderer,Material,Color',
                'native API roundtrip',
            );
        }
        assert.deepEqual(
            result.probe.apiTypes,
            Object.fromEntries(
                ['createAirApp', 'Scene', 'Node', 'Camera', 'MeshRenderer', 'Material', 'Color'].map((name) => [
                    name,
                    'function',
                ]),
            ),
            'native exported constructors',
        );
        assert(result.probe.nonZeroAlphaPixels > 0, 'canvas has no nonzero-alpha pixel frame');
        assert.equal(result.probe.firstFrame.afterDraw, true);
        assert.equal(result.probe.firstFrame.step, 1);
        assert.equal(result.probe.firstFrame.dt, 0);
        assert(Object.values(result.probe.nativeInstances).every(Boolean), 'public native instance paths');
        // Browser presentation is measured independently of the GL readback.
        await page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const screenshotPath = path.join(artifacts, id + '.png');
        const screenshot = await page.screenshot({ path: screenshotPath });
        const png = require('pngjs').PNG.sync.read(screenshot);
        let redPixels = 0;
        for (let index = 0; index < png.data.length; index += 4) {
            if (png.data[index] > 100 && png.data[index + 1] < 80 && png.data[index + 2] < 80) redPixels++;
        }
        result.presentation = {
            screenshot: path.basename(screenshotPath),
            sha256: sha256(screenshot),
            redPixels,
            width: png.width,
            height: png.height,
        };
        assert(redPixels > 100, 'compositor screenshot does not present the fixture geometry');
        result.lifecycle = await page.evaluate(() => window.__consumer.close());
        assert.equal(result.lifecycle.released.status, 'released');
        assert.equal(result.lifecycle.closed.status, 'released');
        assert.equal(result.lifecycle.scene, null);
        for (const name of ['sceneValid', 'meshValid', 'materialValid'])
            assert.equal(result.lifecycle[name], false, name);
        assert.equal(result.lifecycle.terminalCode, 'AIR_E_APP_CLOSED');
        result.optionalRequests = result.requests.filter((request) =>
            /\.wasm(?:$|\?)|\/webgpu\/|gltf-decoders|spark\.module/.test(request),
        );
        assert.deepEqual(result.optionalRequests, [], 'default WebGL2 requested optional engine assets');
        assert.deepEqual(result.pageErrors, []);
        assert.deepEqual(result.cspErrors, []);
        assert.deepEqual(result.failedRequests, []);
        result.status = 'PASS';
    } catch (error) {
        result.error = String(error.stack || error);
    } finally {
        await context.close();
        result.contextClosed = true;
    }
    return result;
}

async function verifyInstalledBrowser({ root, pkgDir, consumerDir, artifacts, viteRoot }) {
    fs.mkdirSync(artifacts, { recursive: true });
    const source = fs.readFileSync(path.join(root, 'test/fixtures/upstream-sdk/browser-main.js'), 'utf8');
    const before = Object.fromEntries(
        ['cocosair.module.js', 'cocosair.module.min.js'].map((name) => [
            name,
            sha256(fs.readFileSync(path.join(pkgDir, 'build/npm', name))),
        ]),
    );
    const report = {
        fixtureSha256: sha256(source),
        installedBundles: before,
        shutdownScope:
            'Playwright close acknowledgment and disconnected transport; not an ECHILD process-reaping proof',
        results: [],
        vite: viteRoot ? PINNED_VITE : 'NOT_RUN (supply --vite=<Vite 7.1.12 package directory>)',
    };
    const { chromium } = require('playwright');
    let browser;
    let staticServer;
    try {
        const options = chromiumOptions();
        browser = await chromium.launch(options);
        report.browser = {
            version: browser.version(),
            executable: options.executablePath || chromium.executablePath(),
            args: options.args,
        };
        staticServer = await serveInstalled(pkgDir, source);
        for (const [id, suffix] of [
            ['importmap-unminified', '/'],
            ['importmap-nested-csp', '/nested/'],
            ['importmap-minified', '/min/'],
        ]) {
            report.results.push(await probe(browser, staticServer.origin + suffix, id, artifacts));
        }
        if (viteRoot) {
            const configured = vitePackage(viteRoot);
            const vite = await import(pathToFileURL(configured.entry).href);
            for (const variant of ['unminified', 'minified']) {
                const project = path.join(consumerDir, 'vite-' + variant);
                fs.mkdirSync(project);
                fs.writeFileSync(path.join(project, 'index.html'), html(null, false));
                fs.writeFileSync(path.join(project, 'browser-main.js'), source);
                const bundlePath = path.join(
                    pkgDir,
                    'build/npm',
                    `cocosair.module${variant === 'minified' ? '.min' : ''}.js`,
                );
                const config = {
                    root: project,
                    configFile: false,
                    logLevel: 'warn',
                    // The canonical package resolves normally; only the second variant selects its shipped minified file.
                    resolve: {
                        alias: variant === 'minified' ? [{ find: /^cocosair\.js$/, replacement: bundlePath }] : [],
                    },
                    cacheDir: path.join(project, '.vite'),
                    optimizeDeps: { include: ['cocosair.js'] },
                    server: { host: '127.0.0.1', port: 0, fs: { allow: [consumerDir] } },
                    preview: { host: '127.0.0.1', port: 0 },
                    build: {
                        target: 'esnext',
                        outDir: path.join(project, 'dist'),
                        emptyOutDir: true,
                        minify: true,
                        sourcemap: false,
                    },
                };
                let dev;
                let preview;
                try {
                    dev = await vite.createServer(config);
                    await dev.listen();
                    report.results.push(
                        await probe(
                            browser,
                            `http://127.0.0.1:${dev.httpServer.address().port}/`,
                            'vite-dev-' + variant,
                            artifacts,
                        ),
                    );
                    await dev.close();
                    dev = undefined;
                    const built = await vite.build(config);
                    const outputs = (Array.isArray(built) ? built : [built]).flatMap((entry) => entry.output || []);
                    const modules = outputs
                        .filter((entry) => entry.type === 'chunk')
                        .flatMap((entry) => Object.keys(entry.modules));
                    assert(
                        modules.some((file) => path.resolve(file) === path.resolve(bundlePath)),
                        'Vite production did not consume installed SDK',
                    );
                    assert(
                        !modules.some((file) => path.resolve(file).startsWith(path.join(root, 'src') + path.sep)),
                        'Vite source-import bypass',
                    );
                    preview = await vite.preview(config);
                    const production = await probe(
                        browser,
                        `http://127.0.0.1:${preview.httpServer.address().port}/`,
                        'vite-production-' + variant,
                        artifacts,
                    );
                    production.installedModule = path.relative(pkgDir, bundlePath).split(path.sep).join('/');
                    production.outputChunks = outputs
                        .filter((entry) => entry.type === 'chunk')
                        .map((entry) => ({ file: entry.fileName, sha256: sha256(entry.code) }));
                    report.results.push(production);
                } catch (error) {
                    report.results.push({
                        id: 'vite-tooling-' + variant,
                        status: 'FAIL',
                        error: String(error.stack || error),
                    });
                } finally {
                    if (dev) await dev.close();
                    if (preview)
                        await new Promise((resolve, reject) =>
                            preview.httpServer.close((error) => (error ? reject(error) : resolve())),
                        );
                }
            }
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
                report.browserClosed = !browser.isConnected();
                assert(report.browserClosed, 'browser remains connected after close');
            } catch (error) {
                report.browserClosed = false;
                report.results.push({ id: 'browser-shutdown', status: 'FAIL', error: String(error.stack || error) });
            }
        }
        if (staticServer) await staticServer.close();
    }
    for (const [name, digest] of Object.entries(before))
        assert.equal(
            sha256(fs.readFileSync(path.join(pkgDir, 'build/npm', name))),
            digest,
            'installed SDK was modified',
        );
    report.passed =
        report.results.length === (viteRoot ? 7 : 3) &&
        report.results.every((result) => result.status === 'PASS') &&
        report.browserClosed;
    return report;
}
module.exports = { PINNED_VITE, vitePackage, html, serveInstalled, verifyInstalledBrowser };
