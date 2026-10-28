/** EX02-only local collector. No builds, installs, SDK substitution or canonical publication. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const policy = require('./lifecycle-evidence.cjs');
const root = path.resolve(__dirname, '../../../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function options(argv) {
    const args = {};
    for (const item of argv) {
        const match = /^--(url|out|expect-runtime-sha256|expect-build|executable)=(.+)$/.exec(item);
        if (!match || args[match[1]])
            throw Error('Use unique --url= --out= --expect-runtime-sha256= --expect-build= [--executable=]');
        args[match[1]] = match[2];
    }
    const url = new URL(args.url);
    assert.ok(
        url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
        'loopback HTTP Gallery only',
    );
    assert.equal(url.pathname, '/gallery.html');
    assert.ok(!url.username && !url.password && !url.search && !url.hash);
    assert.match(args['expect-runtime-sha256'] || '', /^[a-f0-9]{64}$/);
    assert.match(args['expect-build'] || '', /^[1-9]\d*$/);
    assert.ok(args.out, 'new output directory required');
    if (args.executable) assert.ok(path.isAbsolute(args.executable) && fs.statSync(args.executable).isFile());
    return { ...args, url: url.href, build: Number(args['expect-build']), out: path.resolve(args.out) };
}
async function collect(args) {
    fs.mkdirSync(args.out); // Reject existing attempts, including partial failures.
    const save = (name, value) =>
        fs.writeFileSync(path.join(args.out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    const report = {
        schema: 'ex02-browser-lifecycle-attempt-v1',
        startedAt: new Date().toISOString(),
        status: 'FAIL',
        stage: 'preflight',
        complete: false,
        expectedBuild: args.build,
        expectedRuntimeSha256: args['expect-runtime-sha256'],
        checks: [],
        cycles: [],
        console: [],
        http: [],
        errors: [],
        boundaries: {
            perCycleNativeCounters: 'NOT_RUN: example exports no public native/GPU count snapshots',
            allRetiredNativeReads: 'NOT_RUN: frozen history and guards do not census every native access',
            screenshotReview: 'NOT_RUN: inspect retained PNGs manually',
            physicalShutdown: 'NOT_MEASURED: browser.close is not process-tree wait/ECHILD evidence',
            otherPhysicsMatrix: 'NOT_RUN: no mass/COM/contact/impulse-isolation qualification',
        },
    };
    const inputs = {};
    for (const relative of [
        'tools/verify/box3d/compound-bowling/browser-lifecycle.cjs',
        'tools/verify/box3d/compound-bowling/lifecycle-evidence.cjs',
        ...fs
            .readdirSync(path.join(root, 'examples/box3d-compound-bowling/src'))
            .map((f) => 'examples/box3d-compound-bowling/src/' + f),
        'examples/box3d-compound-bowling/index.html',
        'examples/box3d-compound-bowling/runtime-route.cjs',
        'tools/dev/dev-server.cjs',
    ])
        inputs[relative] = hash(fs.readFileSync(path.join(root, relative)));
    save('inputs.json', inputs);
    let browser,
        page,
        frame,
        sequence = 0;
    const check = (name, value = true) => {
        assert.ok(value, name);
        report.checks.push({ name, status: 'PASS' });
    };
    const screenshot = async (label) => {
        await page.screenshot({ path: path.join(args.out, label + '.png'), fullPage: true, timeout: 10000 });
    };
    const snapshot = async (label) => {
        const filename = `${String(++sequence).padStart(3, '0')}-${label}.json`;
        const pending = page.waitForEvent('download', { timeout: 5000 });
        await frame.locator('#export').click();
        const download = await pending;
        await download.saveAs(path.join(args.out, filename));
        const data = JSON.parse(fs.readFileSync(path.join(args.out, filename)));
        policy.exportShape(data, report.identity, args.build);
        return data;
    };
    const beginClock = () => frame.evaluate(() => globalThis.__ex02LifecycleClock.begin());
    const step = async (count) => {
        await beginClock();
        await frame.evaluate(async (count) => {
            for (let index = 0; index < count; index++) await globalThis.__ex02LifecycleClock.step(1 / 60);
        }, count);
    };
    const start = async () => {
        await frame.locator('#start').click();
        await frame.locator('#start').waitFor({ state: 'visible' });
        await frame.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 10000 });
        await step(6);
    };
    try {
        const { chromium } = require('playwright');
        browser = await chromium.launch({
            headless: true,
            ...(args.executable ? { executablePath: args.executable } : {}),
        });
        report.browser = browser.version();
        page = await browser.newPage({
            viewport: { width: 1440, height: 1000 },
            deviceScaleFactor: 1,
            acceptDownloads: true,
        });
        page.setDefaultTimeout(10000);
        page.on('console', (m) => report.console.push({ type: m.type(), text: m.text() }));
        page.on('pageerror', (e) => report.errors.push(String(e)));
        page.on('response', (r) => report.http.push({ url: r.url(), status: r.status() }));
        await page.goto(args.url);
        await page.locator('#link-box3d-compound-bowling').click();
        // Resolve the actual browsing context after the Gallery iframe's navigation.
        await page.frameLocator('#preview-frame').locator('#status').waitFor();
        frame = page.frames().find((f) => new URL(f.url()).pathname === '/box3d-compound-bowling/');
        assert.ok(frame, 'EX02 frame missing');
        await screenshot('01-gallery-entry');
        const identityResponse = await page.request.get(
            new URL('/box3d-compound-bowling/identity.json', args.url).href,
        );
        const identityBody = await identityResponse.body();
        fs.writeFileSync(path.join(args.out, 'identity-response.txt'), identityBody, { flag: 'wx' });
        assert.equal(identityResponse.status(), 200, 'qualified runtime identity unavailable');
        report.identity = JSON.parse(identityBody);
        assert.equal(report.identity.runtimeSha256, args['expect-runtime-sha256'], 'runtime identity mismatch');
        const runtime = await page.request.get(
            new URL('/box3d-compound-bowling/runtime/cocosair.module.js', args.url).href,
        );
        assert.equal(runtime.status(), 200);
        check(
            'served runtime bytes match selected identity',
            hash(await runtime.body()) === args['expect-runtime-sha256'],
        );
        await frame.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 15000 });
        await frame.evaluate(async () => {
            const sdk = await import(new URL('./runtime/cocosair.module.js', location.href).href);
            globalThis.__ex02LifecycleClock = sdk.createStepClock();
            globalThis.__ex02LifecycleClock.begin();
        });
        const initial = await snapshot('ready');
        check('initial generation empty', initial.runs.length === 0);
        report.stage = 'stop-start';
        await start();
        await frame.locator('#center').click();
        await step(8);
        const moving = await snapshot('moving');
        policy.observed(moving.runs.at(-1));
        const run = moving.runs.at(-1),
            request = run.requests.find((r) => r.kind === 'impulse-request');
        check(
            'real impulse followed by native ball motion',
            !!request &&
                run.frames.some(
                    (f) =>
                        f.tick > request.afterTick &&
                        f.actors.some((a) => a.id.endsWith(':ball') && Math.abs(a.motion.linearVelocity.z) > 0.1),
                ),
        );
        await screenshot('02-moving');
        await frame.locator('#reset').click();
        await frame.waitForFunction(() => document.querySelector('#status').textContent.includes('已释放'), null, {
            timeout: 10000,
        });
        const stopped = await snapshot('stopped');
        policy.unchanged(moving, stopped);
        policy.releasePair(moving, stopped, run.generation);
        await step(3);
        const quiet = await snapshot('stopped-after-steps');
        policy.unchanged(stopped, quiet);
        check('stopped generation history frozen through later engine frames');
        await screenshot('03-stopped');
        await start();
        let previous = await snapshot('restarted');
        policy.rebuilt(quiet, previous);
        check('Start creates observed new generation');
        report.stage = 'reset20';
        for (let cycle = 1; cycle <= 20; cycle++) {
            await start();
            const current = await snapshot(`reset-${cycle}`);
            report.cycles.push({ cycle, ...policy.rebuilt(previous, current) });
            previous = current;
            if ([1, 10, 20].includes(cycle)) await screenshot(`reset-${cycle}`);
        }
        check('20 actual two-phase release/rebuild pairs', report.cycles.length === 20);
        report.stage = 'close-race';
        report.race = await frame.evaluate(() => {
            const start = document.querySelector('#start'),
                close = document.querySelector('#close');
            // DOM controls execute synchronously against the real app; no cleanup interception/delay.
            start.click();
            const transitionPending = start.disabled;
            close.click();
            return {
                transitionPending,
                closeAdmitted: close.disabled,
                input: 'same-stack DOM click; reset queued, not trusted pointer or delayed-release injection',
            };
        });
        await frame.waitForFunction(() => document.querySelector('#status').textContent.includes('已关闭'), null, {
            timeout: 15000,
        });
        const closed = await snapshot('closed');
        report.closeReceipt = policy.terminal(previous, closed, report.race);
        check('queued reset prevented remount; terminal same-module baseline verified');
        await screenshot('04-closed');
        // Restore native pacing via the same public clock client; terminal SDK Close must remain sticky.
        await frame.evaluate(() => globalThis.__ex02LifecycleClock.end());
        check(
            'terminal history stable after clock release',
            policy.stable((await snapshot('closed-after-clock-end')).runs.at(-1)) === policy.stable(closed.runs.at(-1)),
        );
        await page.goto(new URL('/box3d-compound-bowling/', args.url).href);
        await page.goBack();
        check('returned to Gallery', await page.locator('#search').isVisible());
        assert.deepEqual(report.errors, [], 'browser page errors');
        check(
            'no HTTP failure',
            report.http.every((r) => r.status < 400),
        );
        check(
            'no console errors',
            report.console.every((m) => m.type !== 'error'),
        );
        report.complete = true;
        report.status = 'LIMITED_OBSERVED_LIFECYCLE'; // Count/access/presentation gaps forbid overall PASS.
    } catch (error) {
        report.failure = String(error.stack || error);
        if (page) {
            try {
                await screenshot('failure');
            } catch (e) {
                report.errors.push('failure screenshot: ' + e);
            }
        }
    } finally {
        if (frame && !report.closeReceipt) {
            try {
                await frame.locator('#close').click({ timeout: 1500 });
                await frame.waitForFunction(
                    () => document.querySelector('#status').textContent.includes('已关闭'),
                    null,
                    { timeout: 3000 },
                );
                await snapshot('failure-cleanup');
            } catch (error) {
                report.failureCleanup = String(error);
            }
        }
        if (browser) {
            try {
                let timer;
                try {
                    await Promise.race([
                        browser.close(),
                        new Promise((_, reject) => {
                            timer = setTimeout(
                                () => reject(Error('Browser close acknowledgement exceeded 4s; outcome uncertain')),
                                4000,
                            );
                        }),
                    ]);
                } finally {
                    clearTimeout(timer);
                }
                report.browserCloseResolved = true;
            } catch (error) {
                report.browserCloseResolved = false;
                report.shutdownError = String(error);
                report.status = 'FAIL';
            }
        }
        report.finishedAt = new Date().toISOString();
        save('report.json', report);
        const inventory = {};
        for (const file of fs.readdirSync(args.out))
            if (fs.statSync(path.join(args.out, file)).isFile())
                inventory[file] = hash(fs.readFileSync(path.join(args.out, file)));
        save('sha256.json', inventory);
    }
    return report;
}
if (require.main === module) {
    let args;
    try {
        args = options(process.argv.slice(2));
    } catch (error) {
        console.error(String(error));
        process.exitCode = 2;
    }
    if (args)
        collect(args)
            .then((r) => {
                console.log(JSON.stringify({ status: r.status, stage: r.stage, out: args.out }));
                process.exitCode = r.complete && r.status !== 'FAIL' ? 0 : 1;
            })
            .catch((error) => {
                console.error(error);
                process.exitCode = 1;
            });
}
module.exports = { options, collect };
