/* Real npm tarball browser acceptance. --tarball=<file> --out=<new-directory>.
 * Extracts into a private temporary directory, never edits the installed package.
 * Keeps observations, errors and exact browser exit/close status in --out.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const playwright = require('playwright');
const { launchOptions } = require('./browser-engines.cjs');
const tar =
    process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe') : 'tar';
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
assert.ok(option('tarball') && option('out'), 'Expected --tarball and --out');
const tarball = path.resolve(option('tarball')),
    output = path.resolve(option('out'));
assert.ok(!fs.existsSync(output), 'Output must be new');
fs.mkdirSync(output, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'air-box2d-package-'));
const installed = path.join(temporary, 'package');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = { pass: false, tarball: path.basename(tarball), sha256: hash(tarball), cases: [] };
const server = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end('<!doctype html><canvas id="GameCanvas" width="800" height="600"></canvas>');
    }
    if (route === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
    }
    const file = path.resolve(installed, '.' + decodeURIComponent(route));
    if (!file.startsWith(installed + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        return res.end();
    }
    res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    fs.createReadStream(file).pipe(res);
});
(async () => {
    let host,
        browser,
        child,
        exited = false,
        closed = false,
        exitStatus,
        closeStatus;
    try {
        execFileSync(tar, ['-mxzf', tarball, '-C', temporary]);
        const receipt = JSON.parse(fs.readFileSync(path.join(installed, 'build/npm/box2d3/receipt.json')));
        for (const [file, expected] of Object.entries(receipt.files))
            assert.equal(hash(path.join(installed, 'build/npm/box2d3', file)), expected, file);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        host = await playwright.chromium.launchServer({ headless: true, ...launchOptions('chromium') });
        child = host.process();
        child.once('exit', (code, signal) => {
            exited = true;
            exitStatus = { code, signal };
        });
        child.once('close', (code, signal) => {
            closed = true;
            closeStatus = { code, signal };
        });
        browser = await playwright.chromium.connect(host.wsEndpoint());
        report.browserVersion = browser.version();
        for (const bundle of ['cocosair.module.js', 'cocosair.module.min.js']) {
            const page = await browser.newPage();
            const errors = [],
                requests = [];
            page.on('pageerror', (error) => errors.push(String(error)));
            page.on('console', (message) => {
                if (message.type() === 'error') errors.push(message.text());
            });
            page.on('request', (request) => {
                if (request.url().includes('/box2d3/')) requests.push(new URL(request.url()).pathname);
            });
            await page.goto(base);
            const observation = await page.evaluate(async (bundle) => {
                const a = await import('/build/npm/' + bundle);
                const app = await a.createAirApp({ canvas: '#GameCanvas', physics2D: 'box2d-v3-wasm' });
                const scene = new a.Scene('Tarball');
                const camera = new a.Node('Camera');
                scene.addChild(camera);
                camera.setPosition(0, 0, 1000);
                camera.addComponent(a.Camera);
                const ground = new a.Node('Ground');
                ground.setPosition(0, -10);
                ground.addComponent(a.RigidBody2D).type = a.ERigidBody2DType.Static;
                ground.addComponent(a.BoxCollider2D).size.set(500, 20);
                scene.addChild(ground);
                const body = new a.Node('Body');
                body.setPosition(0, 80);
                body.addComponent(a.RigidBody2D);
                body.addComponent(a.BoxCollider2D).size.set(20, 20);
                scene.addChild(body);
                app.run(scene);
                const clock = a.createStepClock();
                clock.begin();
                for (let i = 0; i < 120; i++) await clock.step();
                const y = body.worldPosition.y,
                    stats = a.getBox2D3Stats();
                clock.end();
                await app.close();
                return { y, stats, released: a.getBox2D3Stats() };
            }, bundle);
            report.cases.push({ bundle, ...observation, errors, requests });
            assert.ok(observation.y > 8 && observation.y < 12, 'Actual ground collision');
            assert.equal(observation.stats.shapes, 2);
            assert.equal(observation.released.worlds, 0);
            assert.deepEqual(errors, []);
            for (const file of ['air-box2d.mjs', 'air-box2d.wasm'])
                assert.ok(
                    requests.some((route) => route.endsWith('/' + file)),
                    'Automatic asset location: ' + file,
                );
            await page.close();
        }
        report.pass = true;
    } catch (error) {
        report.error = error.stack;
    } finally {
        if (host) {
            const start = Date.now();
            let timer;
            const boundary = {
                acknowledged: report.cases.length === 2 && report.cases.every((row) => row.released.worlds === 0),
            };
            try {
                await Promise.race([
                    (async () => {
                        await browser?.close();
                        await host.close();
                    })(),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(Error('Original four-second close budget exceeded')), 4000);
                    }),
                ]);
                await new Promise((resolve) => setTimeout(resolve, 0));
            } catch (error) {
                report.closeError = String(error);
                report.pass = false;
            } finally {
                clearTimeout(timer);
            }
            let pidGone = false;
            try {
                process.kill(child.pid, 0);
            } catch (error) {
                pidGone = error.code === 'ESRCH';
            }
            report.shutdown = {
                boundary,
                exited,
                closed,
                exitStatus,
                closeStatus,
                pidGone,
                elapsedMs: Date.now() - start,
            };
            if (!boundary.acknowledged || !exited || !closed || !pidGone) report.pass = false;
        }
        server.close();
        assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
        fs.rmSync(temporary, { recursive: true });
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
        if (!report.pass) process.exitCode = 1;
    }
})();
