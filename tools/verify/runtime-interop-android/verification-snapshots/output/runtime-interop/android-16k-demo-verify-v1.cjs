const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { PNG } = require('pngjs');
const { cropScreen } = require(path.resolve('tools/verify/runtime-interop-android.cjs'));
const [apkArg, outArg] = process.argv.slice(2);
if (!apkArg || !outArg) throw Error('apk and new output required');
const pkg = 'com.mystral.engine.interop',
    component = pkg + '/com.mystral.engine.MystralActivity';
const adb = (a, binary = false) =>
    execFileSync('adb', ['-s', 'emulator-5554', ...a], {
        encoding: binary ? undefined : 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
    });
const shell = (...a) => adb(['shell', ...a]).trim();
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (v, m) => {
    if (!v) throw Error(m);
};
const out = path.resolve(outArg);
fs.mkdirSync(out);
const save = (name, v) =>
    fs.writeFileSync(
        path.join(out, name),
        typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 2) + '\n',
    );
const report = {
    schema: 'air-android-demo-interaction-v1',
    subset: true,
    releaseReady: false,
    physicalAcceptance: false,
    pass: false,
    apkSha256: hash(fs.readFileSync(apkArg)),
    toolSha256: hash(fs.readFileSync(__filename)),
    runId: 'android-demo-' + Date.now(),
};
let port, logcat, session, request;
const colors = (bytes) => {
    const p = PNG.sync.read(bytes);
    let orange = 0,
        green = 0,
        blue = 0;
    for (let i = 0; i < p.data.length; i += 4) {
        const [r, g, b] = p.data.subarray(i, i + 3);
        if (r > g + 50 && r > b + 50) orange++;
        if (g > r + 50 && g > b + 50) green++;
        if (b > r + 20 && b > g + 10) blue++;
    }
    return { width: p.width, height: p.height, orange, green, blue, sha256: hash(bytes) };
};
async function poll(operation, timeout = 10000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
        try {
            const v = await operation();
            if (v) return v;
        } catch (e) {
            last = e;
        }
        await sleep(100);
    }
    throw last || Error('Original diagnostic wait budget exceeded');
}
(async () => {
    try {
        check(shell('getprop', 'ro.kernel.qemu') === '1', 'Expected the authorized emulator');
        report.memoryPageBytes = Number(shell('getconf', 'PAGE_SIZE'));
        check(report.memoryPageBytes === 16384, 'Expected real 16 KB environment');
        report.compat = {
            linker: shell('getprop', 'bionic.linker.16kb.app_compat.enabled'),
            pmDisabled: shell('getprop', 'pm.16kb.app_compat.disabled'),
        };
        check(
            report.compat.linker === 'fatal' && report.compat.pmDisabled === 'true',
            'Page-size compatibility fallback not disabled',
        );
        const installed = shell('pm', 'path', pkg)
            .split(/\r?\n/)
            .find((v) => v.startsWith('package:'))
            .slice(8);
        check(shell('sha256sum', installed).split(/\s/)[0] === report.apkSha256, 'Installed APK differs');
        const fd = fs.openSync(path.join(out, 'logcat.txt'), 'wx');
        logcat = spawn(
            'adb',
            [
                '-s',
                'emulator-5554',
                'logcat',
                '-v',
                'threadtime',
                '-T',
                '1',
                'MystralInterop:V',
                'MystralJS:V',
                'AndroidRuntime:E',
                'ActivityManager:I',
                '*:S',
            ],
            { windowsHide: true, stdio: ['ignore', fd, fd] },
        );
        fs.closeSync(fd);
        shell('am', 'force-stop', pkg);
        report.launch = shell('am', 'start', '-W', '-n', component, '--es', 'run_id', report.runId);
        const privateDir = 'files/interop/' + report.runId + '/';
        session = await poll(() => JSON.parse(shell('run-as', pkg, 'cat', privateDir + 'session.json')), 20000);
        save('session.json', session);
        check(session.caseId === 'demo', 'Plain icon launch did not choose demo');
        port = adb(['forward', 'tcp:0', 'tcp:' + new URL(session.origin).port]).trim();
        request = async (route, body, binary = false) => {
            const r = await fetch('http://127.0.0.1:' + port + route, {
                method: body === undefined ? 'GET' : 'POST',
                headers: {
                    'X-Interop-Token': session.token,
                    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: AbortSignal.timeout(18000),
            });
            check(r.ok, route + ' HTTP ' + r.status);
            return binary ? Buffer.from(await r.arrayBuffer()) : r.json();
        };
        await poll(async () => {
            const s = await request('/state');
            save('state-ready.json', s);
            return s.reportSaved;
        }, 30000);
        report.application = JSON.parse(await request('/artifact/report.json', undefined, true));
        check(
            report.application.schema === 'air-android-demo-v1' &&
                report.application.ready === true &&
                report.application.scope === 'interactive-startup-only',
            'Demo startup failed',
        );
        const events = async () => {
            const b = await request('/artifact/events.jsonl', undefined, true);
            save('events.jsonl', b);
            return b
                .toString()
                .trim()
                .split(/\r?\n/)
                .map((v) => JSON.parse(v));
        };
        let bounds;
        report.captures = [];
        async function capture(phase, wanted) {
            const pending = request('/capture', { kind: 'scene-demo', phase });
            pending.catch(() => {});
            const c = await poll(async () => {
                const s = await request('/state');
                return s.captures.find((c) => c.phase === phase && c.metadata);
            });
            const m = c.metadata;
            check(
                m.pid === session.pid && m.runId === session.runId && m.resultCode === 0,
                'PixelCopy identity mismatch',
            );
            bounds = m.bounds;
            const surface = await request('/artifact/' + m.file, undefined, true);
            check(hash(surface) === m.sha256, 'Surface SHA differs');
            save(m.file, surface);
            const screen = adb(['exec-out', 'screencap', '-p'], true);
            save(phase + '.screen.png', screen);
            const crop = cropScreen(screen, bounds);
            save(phase + '.screen-crop.png', crop);
            const one = colors(surface),
                two = colors(crop);
            const pass = [one, two].every(
                (v) => v.width === 320 && v.height === 240 && v[wanted] > 1000 && v.blue > 30000,
            );
            const evidence = { metadata: m, surface: one, compositor: two, pass };
            report.captures.push(evidence);
            save(phase + '.verification.json', evidence);
            await request('/ack', {
                captureId: c.captureId,
                sha256: m.sha256,
                result: { pass, status: pass ? 'PASS' : 'FAIL' },
            });
            await pending;
            check(pass, phase + ' actual material color failed');
        }
        await capture('before', 'orange');
        report.tap1 = shell('input', 'tap', String(bounds.x + 160), String(bounds.y + 120));
        const first = await poll(async () => {
            const e = await events();
            return e.find((e) => e.stage === 'demo-input' && e.taps === 1);
        });
        check(
            first.isTrusted === true &&
                first.type === 'mousedown' &&
                first.color === 'green' &&
                Math.abs(first.clientX - 160) <= 1 &&
                Math.abs(first.clientY - 120) <= 1,
            'Native SDL/DOM input contract failed',
        );
        report.input1 = first;
        const paintSamples = [];
        await poll(() => {
            const raw = adb(['exec-out', 'screencap', '-p'], true);
            const crop = cropScreen(raw, bounds);
            const value = colors(crop);
            const index = paintSamples.length;
            save('paint-wait-' + index + '.screen.png', raw);
            save('paint-wait-' + index + '.crop.png', crop);
            paintSamples.push({ index, ...value });
            return value.green > 1000 && value.blue > 30000;
        }, 2000);
        report.materialPaintBoundary = {
            method: 'Wait for actual compositor material frame before requesting the separately verified PixelCopy after frame',
            samples: paintSamples,
        };
        save('material-paint-boundary.json', report.materialPaintBoundary);
        await capture('after', 'green');
        report.background = shell('input', 'keyevent', 'KEYCODE_HOME');
        const lifecycle = async () => {
            const b = await request('/artifact/lifecycle.jsonl', undefined, true);
            save('lifecycle.jsonl', b);
            return b
                .toString()
                .trim()
                .split(/\r?\n/)
                .map((v) => JSON.parse(v));
        };
        const paused = await poll(async () => (await lifecycle()).find((e) => e.event === 'pause'));
        report.resume = shell(
            'am',
            'start',
            '-W',
            '-n',
            component,
            '--activity-reorder-to-front',
            '--activity-single-top',
        );
        report.resumedLifecycle = await poll(async () => {
            const e = await lifecycle();
            return e.some((x) => x.event === 'resume' && x.elapsedRealtime > paused.elapsedRealtime) ? e : null;
        });
        const resumed = await request('/state');
        check(
            resumed.session.runId === session.runId && resumed.session.pid === session.pid,
            'Resume replaced the native session',
        );
        await sleep(700);
        shell('input', 'tap', String(bounds.x + 160), String(bounds.y + 120));
        const second = await poll(async () => {
            const e = await events();
            return e.find((x) => x.stage === 'demo-input' && x.taps === 2);
        });
        report.input2 = second;
        check(
            second.isTrusted === true &&
                second.color === 'orange' &&
                second.frames > first.frames &&
                second.gpuErrors.length === 0,
            'Native frame/input did not resume',
        );
        await sleep(200);
        const resumeScreen = adb(['exec-out', 'screencap', '-p'], true);
        save('resume.screen.png', resumeScreen);
        const resumeCrop = cropScreen(resumeScreen, bounds);
        save('resume.screen-crop.png', resumeCrop);
        report.resumePixels = colors(resumeCrop);
        check(
            report.resumePixels.orange > 1000 && report.resumePixels.blue > 30000,
            'Compositor did not show the resumed AIR scene',
        );
        await request('/finish', {});
        report.nativeExit = await poll(
            () => JSON.parse(shell('run-as', pkg, 'cat', privateDir + 'native-exit.json')),
            10000,
        );
        check(
            report.nativeExit.pid === session.pid && report.nativeExit.code === 0 && !report.nativeExit.error,
            'Native exit failed',
        );
        check(
            shell('getprop', 'bionic.linker.16kb.app_compat.enabled') === 'fatal' &&
                shell('getprop', 'pm.16kb.app_compat.disabled') === 'true',
            'Compatibility policy changed',
        );
        report.pass = true;
    } catch (error) {
        report.error = String(error.stack || error);
    } finally {
        try {
            shell('am', 'force-stop', pkg);
            const table = adb(['shell', 'ps', '-A', '-o', 'PID,NAME']);
            save('process-table-after-stop.txt', table);
            check(
                /^\s*PID\s+NAME/m.test(table) &&
                    !table
                        .split(/\r?\n/)
                        .some((l) => new RegExp('\\s' + pkg.replaceAll('.', '\\.') + '(?::[^ ]+)?\\s*$').test(l)),
                'Dedicated process remains',
            );
            check(adb(['get-state']).trim() === 'device', 'ADB disconnected');
        } catch (error) {
            report.pass = false;
            report.cleanupError = String(error);
        }
        if (port)
            try {
                adb(['forward', '--remove', 'tcp:' + port]);
            } catch {}
        if (logcat) logcat.kill();
        report.status = report.pass ? 'PASS' : 'FAIL';
        report.finishedAt = new Date().toISOString();
        save('report.json', report);
        console.log(
            JSON.stringify({
                status: report.status,
                error: report.error,
                report: path.relative(process.cwd(), path.join(out, 'report.json')),
            }),
        );
        process.exitCode = report.pass ? 0 : 1;
    }
})();
