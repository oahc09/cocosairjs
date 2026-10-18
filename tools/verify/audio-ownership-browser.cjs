/* Bounded local SDK regression; never publishes canonical example evidence. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert/strict');
const esbuild = require('esbuild');
const { PNG } = require('pngjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { resolveScript } = require('../dev/resolve-script.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');
const root = path.resolve(__dirname, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
if (!args.out) throw Error('--out=<new-directory> is required');
const out = path.resolve(args.out);
fs.mkdirSync(out); // immutable attempt; fail rather than overwrite
const bundle = path.resolve(args.bundle || 'build/cocosair.module.js');
const engine = args.browser || 'chromium';
const mediaOnly = args['media-only'] === '1';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw Error('Unsupported browser');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = [
    bundle,
    'src/cocos/audio/audio-source.ts',
    'src/cocos/audio/audio-downloader.ts',
    'tools/build/audio-readiness-patch.cjs',
    'tools/build/audio-playback-patch.cjs',
    'src/pal/audio/web/player-dom.js',
    'src/pal/audio/web/player-web.js',
    'src/pal/audio/web/player.js',
    'examples/shared/owned-sprite-frame.ts',
    'tools/debug/resource-ownership.ts',
    'docs/manual/examples/dynamic-atlas-ownership/main.ts',
    'docs/manual/examples/dynamic-atlas-ownership/index.html',
    'tools/verify/static-file-response.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/loopback-browser-env.cjs',
    'tools/dev/resolve-script.cjs',
    'examples/audio-basic/assets/tone.wav',
    'docs/manual/examples/manual-port-recipes/optional-assets/tone4s.wav',
    __filename,
];
const fingerprints = () =>
    Object.fromEntries(files.map((file) => [path.relative(root, file).replace(/\\/g, '/'), hash(file)]));
const report = {
    startedAt: new Date().toISOString(),
    completed: false,
    scope: mediaOnly
        ? 'partial native media readiness/recovery/replay and atlas regression; strict network cancellation NOT_TESTED'
        : 'local SDK regression, not product 12 or full campaign',
    partial: mediaOnly,
    timingScope: {
        audio: 'real native media clock; no frame-rate, GPU-time or presentation-performance claim',
        atlas: 'single createStepClock; native pacer paused for actions and screenshots, then restored',
    },
    product12: { status: 'SKIPPED', reason: 'missing identical product source/audio/old SDK; user confirmed skip' },
    engine,
    fingerprints: fingerprints(),
    inputSnapshots: {},
    cases: [],
    requests: [],
    errors: [],
    physicalShutdown: 'NOT_MEASURED: no custody/ECHILD proof',
};
// Retain the consumed candidate and tooling bytes as well as hashes, including failed attempts.
fs.mkdirSync(path.join(out, 'inputs'));
for (const file of files) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    const snapshot = `inputs/${report.fingerprints[relative]}${path.extname(file)}`;
    if (!fs.existsSync(path.join(out, snapshot))) fs.copyFileSync(file, path.join(out, snapshot));
    report.inputSnapshots[relative] = snapshot;
}
const save = (name, value) => {
    const target = path.join(out, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value, null, 2));
};
const tone = fs.readFileSync(path.join(root, 'examples/audio-basic/assets/tone.wav'));
const longTone = path.join(root, 'docs/manual/examples/manual-port-recipes/optional-assets/tone4s.wav');
const recoveredServices = new Set();
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/qa-recover') {
        recoveredServices.add(url.searchParams.get('case'));
        res.writeHead(204);
        res.end();
        return;
    }
    if (url.pathname.startsWith('/qa-audio/')) {
        const row = {
            url: url.pathname + url.search,
            range: req.headers.range ?? null,
            closedBeforeEnd: false,
            ended: false,
        };
        report.requests.push(row);
        let timer;
        res.on('finish', () => {
            row.ended = true;
        });
        res.on('close', () => {
            clearTimeout(timer);
            row.closedBeforeEnd = !row.ended;
        });
        const respond = () => {
            const failure =
                url.pathname.includes('503') ||
                (url.pathname.includes('retry') && !recoveredServices.has(url.searchParams.get('case')));
            const data = url.pathname.includes('corrupt') ? Buffer.from('invalid audio') : tone;
            row.statusCode = failure ? 503 : 200;
            if (!failure && !url.pathname.includes('corrupt')) {
                serveStaticFile(
                    req,
                    res,
                    url.pathname.includes('long') ? longTone : path.join(root, 'examples/audio-basic/assets/tone.wav'),
                    'audio/wav',
                );
                return;
            }
            res.writeHead(failure ? 503 : 200, {
                'Content-Type': 'audio/wav',
                'Content-Length': failure ? 0 : data.length,
                'Cache-Control': 'no-store',
            });
            res.end(failure ? undefined : data);
        };
        timer = setTimeout(respond, url.pathname.includes('slow') ? 1800 : url.pathname.includes('delay') ? 250 : 0);
        return;
    }
    if (url.pathname === '/qa.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<canvas id="GameCanvas" width="640" height="480" style="width:640px;height:480px"></canvas>');
        return;
    }
    if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    try {
        const file =
            url.pathname === '/build/cocosair.module.js'
                ? bundle
                : resolveScript(
                      path.resolve(
                          root,
                          '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''),
                      ),
                  );
        const rel = path.relative(root, file);
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Outside workspace');
        const ext = path.extname(file);
        const bytes =
            ext === '.ts'
                ? esbuild.transformSync(fs.readFileSync(file, 'utf8'), {
                      loader: 'ts',
                      format: 'esm',
                      target: 'es2022',
                  }).code
                : fs.readFileSync(file);
        res.writeHead(200, {
            'Content-Type': ['.ts', '.js'].includes(ext)
                ? 'text/javascript'
                : ext === '.html'
                  ? 'text/html'
                  : 'application/octet-stream',
        });
        res.end(bytes);
    } catch (error) {
        res.writeHead(404);
        res.end(String(error));
    }
});
let browser;
async function run() {
    const pw = require('playwright');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const options = launchOptions(engine);
    report.browserExecutable = path.basename(options.executablePath || pw[engine].executablePath());
    report.browserExecutableSha256 = hash(options.executablePath || pw[engine].executablePath());
    report.playwrightVersion = require('playwright/package.json').version;
    if (engine === 'chromium') options.args.push('--autoplay-policy=no-user-gesture-required');
    if (engine === 'firefox') options.firefoxUserPrefs = { ...options.firefoxUserPrefs, 'media.autoplay.default': 0 };
    browser = await pw[engine].launch({ ...options, env: loopbackBrowserEnv() });
    report.browserVersion = browser.version();
    for (const mode of [0, 1]) {
        const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
        page.setDefaultTimeout(12000);
        const errors = [];
        await page.addInitScript(() => {
            const owned = new Set();
            const create = URL.createObjectURL.bind(URL),
                revoke = URL.revokeObjectURL.bind(URL);
            URL.createObjectURL = (blob) => {
                const url = create(blob);
                owned.add(url);
                return url;
            };
            URL.revokeObjectURL = (url) => {
                revoke(url);
                owned.delete(url);
            };
            window.__audioOwnedBlobCount = () => owned.size;
        });
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(base + '/qa.html');
        await page.evaluate(async () => {
            const air = await import('/build/cocosair.module.js');
            const app = await air.createAirApp({ canvas: '#GameCanvas' });
            const scene = new air.Scene('Audio readiness QA');
            app.run(scene);
            window.audioQA = { air, app, scene };
        });
        await page.click('canvas');
        const scenarios = mediaOnly
            ? ['media-ready', '503', 'corrupt', 'retry', 'replay', 'play-cancel', 'stale-end', 'replace-playing']
            : [
                  'media-ready',
                  'delay',
                  '503',
                  'timeout',
                  'cancel',
                  'destroy',
                  'replace',
                  'corrupt',
                  'retry',
                  'replay',
                  'play-cancel',
                  'stale-end',
                  'replace-playing',
              ];
        for (const scenario of scenarios) {
            const row = { mode, scenario, status: 'FAIL' };
            report.cases.push(row);
            const requestKey = `${mode}-${scenario}`;
            try {
                row.result = await page.evaluate(
                    async ({ mode, scenario, requestKey, mediaOnly }) => {
                        const { air, scene } = window.audioQA;
                        const node = new air.Node('Audio request');
                        scene.addChild(node);
                        const source = node.addComponent(air.AudioSource);
                        source.playOnAwake = false;
                        const clip = (name) => {
                            const value = new air.AudioClip(name);
                            value._nativeAsset = {
                                player: null,
                                url: `/qa-audio/${name}.wav?case=${requestKey}`,
                                duration: name === 'long' ? 4 : 1.6,
                                type: mode,
                            };
                            return value;
                        };
                        const clips = [];
                        const setClip = (name) => {
                            const value = clip(name);
                            clips.push(value);
                            if (!source.clip && scenario !== 'media-ready') {
                                source
                                    .loadAsync({ clip: value, transport: mediaOnly ? 'media' : 'buffered' })
                                    .catch(() => {});
                            } else source.clip = value;
                        };
                        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                        const bounded = async (promise) => {
                            let timer;
                            try {
                                return await Promise.race([
                                    promise,
                                    new Promise((_, reject) => {
                                        timer = setTimeout(() => reject(Error('QA wait exceeded 8s')), 8000);
                                    }),
                                ]);
                            } finally {
                                clearTimeout(timer);
                            }
                        };
                        const outcome = (promise) =>
                            promise.then(
                                (value) => ({ status: 'ready', value }),
                                (error) => ({ status: 'error', name: error.name, message: error.message }),
                            );
                        const observePlayback = async (request) => {
                            const clocks = [];
                            const backend = source._player._player;
                            const context = backend._gainNode?.context ?? null;
                            const nativeBegan = context?.currentTime ?? null;
                            const expectedRemaining = Math.max(0, source.duration - source.currentTime);
                            let nativeFinished = null;
                            const deadline = performance.now() + 7000;
                            let terminal;
                            request.result.then((value) => {
                                terminal = value;
                                nativeFinished = context?.currentTime ?? null;
                            });
                            while (!terminal && performance.now() < deadline) {
                                clocks.push({
                                    elapsedMs: 7000 - (deadline - performance.now()),
                                    currentTime: source.currentTime,
                                    nativeMediaTime: backend._domAudio?.currentTime ?? null,
                                    nativeContextTime: context?.currentTime ?? null,
                                    sourceNodePresent: context ? !!backend._sourceNode : null,
                                });
                                await sleep(40);
                            }
                            if (!terminal) throw Error('Playback did not terminate in 7s');
                            if (context && terminal.status === 'ended') {
                                if (nativeFinished - nativeBegan < expectedRemaining - 0.15)
                                    throw Error('native AudioContext clock did not cover playback duration');
                                if (!clocks.some((sample) => sample.sourceNodePresent))
                                    throw Error('no real AudioBufferSourceNode observed');
                            }
                            if (
                                !context &&
                                terminal.status === 'ended' &&
                                !clocks.some((sample) => sample.nativeMediaTime > 0.02)
                            )
                                throw Error('native media clock did not advance');
                            return {
                                id: request.id,
                                startup: await bounded(request.started),
                                clocks,
                                maximumTime: Math.max(0, ...clocks.map((value) => value.currentTime)),
                                nativeClock: context
                                    ? { began: nativeBegan, finished: nativeFinished, expectedRemaining }
                                    : 'HTMLAudioElement.currentTime',
                                result: terminal,
                            };
                        };
                        try {
                            if (scenario === 'stale-end') {
                                setClip('tone');
                                await bounded(source.loadAsync());
                                const previous = source.playRequest();
                                const oldGeneration = source._playGeneration;
                                await bounded(previous.started);
                                const latest = source.playRequest();
                                let terminal = false;
                                latest.result.then(() => {
                                    terminal = true;
                                });
                                source._player._player._eventTarget.emit('ended', oldGeneration);
                                await sleep(60);
                                if (terminal) throw Error('old end metadata finished the new request');
                                return {
                                    injectedOldEndMetadata: true,
                                    oldGeneration,
                                    previous: await previous.result,
                                    latest: await observePlayback(latest),
                                };
                            }
                            if (scenario === 'replace-playing') {
                                setClip('long');
                                await bounded(source.loadAsync());
                                const previous = source.playRequest();
                                await sleep(100);
                                const oldPlayer = source._player;
                                const backend = oldPlayer._player;
                                const native = backend._domAudio ?? null;
                                const bufferSource = backend._sourceNode ?? null;
                                const calls = { stop: 0, disconnect: 0, gainDisconnect: 0 };
                                const restores = [];
                                const track = (object, method, name) => {
                                    if (!object) return;
                                    const original = object[method];
                                    object[method] = function (...args) {
                                        calls[name]++;
                                        return original.apply(this, args);
                                    };
                                    restores.push(() => {
                                        object[method] = original;
                                    });
                                };
                                track(bufferSource, 'stop', 'stop');
                                track(bufferSource, 'disconnect', 'disconnect');
                                track(backend._gainNode, 'disconnect', 'gainDisconnect');
                                try {
                                    setClip('tone-new');
                                    oldPlayer.destroy(); // repeated native disposal must not release another cache reference
                                    const retired = {
                                        backend: oldPlayer.type,
                                        calls,
                                        bufferCleared: bufferSource ? bufferSource.buffer === null : null,
                                        nativePaused: native?.paused ?? null,
                                        nativeSource: native?.getAttribute('src') ?? null,
                                    };
                                    if (oldPlayer.type === 1 && !bufferSource)
                                        throw Error('Web Audio voice was not active before replacement');
                                    await bounded(source.loadAsync());
                                    return {
                                        previous: await previous.result,
                                        retired,
                                        current: await observePlayback(source.playRequest()),
                                    };
                                } finally {
                                    restores.forEach((restore) => restore());
                                }
                            }
                            if (scenario === 'play-cancel') {
                                setClip('tone');
                                await bounded(source.loadAsync());
                                const starts = [];
                                node.on(air.AudioSource.EventType.STARTED, () => starts.push(source.currentTime));
                                const native = source._player._player._domAudio ?? null;
                                const durationBefore = source.duration;
                                const urlBefore = source._player.src;
                                const request = source.playRequest();
                                const began = performance.now();
                                let unsupported = null;
                                let startsAtLegacyStop = 0;
                                try {
                                    await bounded(source.stopAsync());
                                } catch (error) {
                                    if (error.code !== 'AUDIO_STOP_ASYNC_UNSUPPORTED') throw error;
                                    unsupported = error.code;
                                    startsAtLegacyStop = starts.length;
                                    source.stop();
                                }
                                const stopMs = performance.now() - began;
                                const result = await bounded(request.result);
                                const samples = [];
                                for (let i = 0; i < 45; i++) {
                                    samples.push({
                                        time: source.currentTime,
                                        nativeTime: native?.currentTime ?? null,
                                        paused: native?.paused ?? null,
                                    });
                                    await sleep(40); // observe through the original EOS, not just a final field
                                }
                                const stopped = {
                                    backend: source._player.type,
                                    result,
                                    startup: await request.started,
                                    unsupported,
                                    startsAtLegacyStop,
                                    stopMs,
                                    starts: [...starts],
                                    samples,
                                    time: source.currentTime,
                                    playing: source.playing,
                                    nativePaused: native?.paused ?? null,
                                    sameNative: source._player._player._domAudio === native,
                                    durationBefore,
                                    durationAfterStop: source.duration,
                                    urlBefore,
                                    urlAfterStop: source._player.src,
                                };
                                return { ...stopped, recovery: await observePlayback(source.playRequest()) };
                            }
                            if (scenario === 'replay') {
                                setClip('tone');
                                await bounded(source.loadAsync());
                                const cycles = [];
                                for (let i = 0; i < 3; i++) {
                                    cycles.push(await observePlayback(source.playRequest()));
                                }
                                return { backend: source._player.type, cycles };
                            }
                            setClip(
                                ['timeout', 'cancel', 'destroy', 'replace'].includes(scenario)
                                    ? 'slow'
                                    : scenario === 'media-ready'
                                      ? 'tone'
                                      : scenario,
                            );
                            const controller = new AbortController();
                            const ready = outcome(
                                source.loadAsync({
                                    timeoutMs: scenario === 'timeout' ? 120 : 8000,
                                    signal: controller.signal,
                                }),
                            );
                            const metadata = outcome(source.getSampleRate());
                            const pcm = outcome(source.getPCMData(0));
                            if (['cancel', 'destroy', 'replace'].includes(scenario)) {
                                await sleep(120);
                                if (scenario === 'cancel') controller.abort();
                                if (scenario === 'destroy') source.onDestroy();
                                if (scenario === 'replace') setClip('tone');
                            }
                            const results = await bounded(Promise.all([ready, metadata, pcm]));
                            let recovered = null;
                            let recoveryPlayback = null;
                            if (scenario === 'retry') {
                                await fetch(`/qa-recover?case=${requestKey}`, { method: 'POST' });
                                await bounded(source.loadAsync({ retry: true }));
                                recovered = source.loadState;
                                recoveryPlayback = await observePlayback(source.playRequest());
                            }
                            if (scenario === 'replace') {
                                await bounded(source.loadAsync());
                                recovered = source.loadState;
                            }
                            return {
                                results,
                                state: source.loadState,
                                recovered,
                                recoveryPlayback,
                                backend: source._player?.type ?? null,
                            };
                        } finally {
                            source.onDestroy();
                            node.destroy();
                            clips.forEach((value) => value.destroy());
                        }
                    },
                    { mode, scenario, requestKey, mediaOnly },
                );
                const result = row.result;
                if (scenario === 'stale-end') {
                    assert.ok(['cancelled', 'ended'].includes(result.previous.status));
                    assert.equal(result.latest.result.status, 'ended');
                } else if (scenario === 'replace-playing') {
                    assert.equal(result.previous.status, 'cancelled');
                    assert.equal(result.current.result.status, 'ended');
                    if (result.retired.backend === 1) {
                        assert.equal(result.retired.bufferCleared, true);
                        assert.equal(result.retired.calls.stop, 1);
                        assert.equal(result.retired.calls.disconnect, 1);
                        assert.equal(result.retired.calls.gainDisconnect, 1);
                    } else {
                        assert.equal(result.retired.nativePaused, true);
                        assert.equal(result.retired.nativeSource, null);
                    }
                } else if (scenario === 'play-cancel') {
                    assert.equal(result.result.status, 'cancelled');
                    assert.equal(result.playing, false);
                    assert.equal(result.time, 0);
                    if (result.backend === 0) {
                        assert.equal(result.startup.status, 'cancelled');
                        assert.deepEqual(result.starts, []);
                        assert.equal(result.nativePaused, true);
                        assert.equal(result.sameNative, true);
                        assert.ok(
                            result.samples.every(
                                (sample) => sample.time === 0 && sample.nativeTime === 0 && sample.paused,
                            ),
                        );
                        assert.ok(result.stopMs <= 250);
                    } else {
                        assert.equal(result.unsupported, 'AUDIO_STOP_ASYNC_UNSUPPORTED');
                        assert.ok(['started', 'cancelled'].includes(result.startup.status));
                        assert.equal(result.starts.length, result.startsAtLegacyStop);
                    }
                    assert.equal(result.durationAfterStop, result.durationBefore);
                    assert.equal(result.urlAfterStop, result.urlBefore);
                    assert.equal(result.recovery.result.status, 'ended');
                    assert.ok(result.recovery.maximumTime > 0.02);
                } else if (scenario === 'replay') {
                    for (const cycle of result.cycles) {
                        assert.ok(['started', 'ended'].includes(cycle.startup.status));
                        assert.ok(cycle.maximumTime > 0.02);
                        assert.equal(cycle.result.status, 'ended');
                    }
                    assert.equal(new Set(result.cycles.map((cycle) => cycle.id)).size, 3);
                } else if (scenario === 'delay' || scenario === 'media-ready')
                    assert.ok(result.results.every((entry) => entry.status === 'ready'));
                else {
                    assert.ok(result.results.every((entry) => entry.status === 'error'));
                    if (['cancel', 'destroy', 'replace'].includes(scenario))
                        assert.ok(result.results.every((entry) => entry.name === 'AbortError'));
                    if (scenario === 'timeout') assert.equal(result.results[0].name, 'TimeoutError');
                    if (['retry', 'replace'].includes(scenario)) assert.equal(result.recovered, 'ready');
                    if (scenario === 'retry') {
                        assert.ok(['started', 'ended'].includes(result.recoveryPlayback.startup.status));
                        assert.ok(result.recoveryPlayback.maximumTime > 0.02);
                        assert.equal(result.recoveryPlayback.result.status, 'ended');
                    }
                }
                if (['timeout', 'cancel', 'destroy', 'replace'].includes(scenario)) {
                    await page.waitForTimeout(1000);
                    const requests = report.requests.filter(
                        (entry) => entry.url.includes(`case=${requestKey}`) && entry.url.includes('slow'),
                    );
                    row.requestRelease = {
                        started: requests.length,
                        allClosed: requests.every((entry) => entry.closedBeforeEnd),
                    };
                    assert.ok(row.requestRelease.allClosed, 'pending native requests must close before response');
                }
                assert.deepEqual(errors, []);
                row.ownedBlobUrlsAfterDispose = await page.evaluate(() => window.__audioOwnedBlobCount());
                assert.equal(row.ownedBlobUrlsAfterDispose, 0);
                row.status = 'PASS';
            } catch (error) {
                row.error = String(error);
                report.errors.push(`${mode}/${scenario}: ${error}`);
            }
            save(`audio-${mode}/${scenario}.json`, row);
        }
        await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    await page.goto(base + '/docs/manual/examples/dynamic-atlas-ownership/');
    await page.waitForFunction(() => window.__atlasOwnership?.snapshot().entered);
    const row = { scenario: 'atlas-return-reenter', status: 'FAIL', visits: [] };
    report.cases.push(row);
    await page.evaluate(async () => {
        const { createStepClock } = await import('/build/cocosair.module.js');
        window.__ownershipClock = createStepClock();
        window.__ownershipSteps = [];
        window.__ownershipClock.begin();
        for (let i = 0; i < 3; i++) window.__ownershipSteps.push(await window.__ownershipClock.step());
    });
    const pixels = async (name) => {
        const bytes = await page.locator('canvas').screenshot({ path: path.join(out, name) });
        const png = PNG.sync.read(bytes);
        const counts = { blue: 0, green: 0 };
        for (let i = 0; i < png.data.length; i += 4) {
            const [r, g, b] = png.data.subarray(i, i + 3);
            if (b > 170 && b > r * 1.3 && b > g * 1.1) counts.blue++;
            if (g > 150 && g > r * 1.3 && g > b * 1.1) counts.green++;
        }
        return counts;
    };
    try {
        assert.equal(await page.evaluate(() => window.__atlasOwnership.snapshot().galleryPacked), true);
        row.initialPixels = await pixels('atlas-enter.png');
        assert.ok(row.initialPixels.blue > 1000 && row.initialPixels.green > 1000);
        for (let visit = 0; visit < 2; visit++) {
            const released = await page.evaluate(async () => {
                let done = false,
                    result,
                    error;
                window.__atlasOwnership.leave().then(
                    (value) => {
                        done = true;
                        result = value;
                    },
                    (failure) => {
                        done = true;
                        error = failure;
                    },
                );
                for (let i = 0; i < 16 && !done; i++)
                    window.__ownershipSteps.push(await window.__ownershipClock.step());
                if (error) throw error;
                if (!done) throw Error('ownership release did not settle within 16 controlled frames');
                return result;
            });
            row.visits.push(released);
            assert.equal(released.receipt.status, 'released');
            assert.equal(released.rows[0].gfxReleased, true);
            assert.equal(released.rows[2].gfxReleased, false);
            released.pixels = await pixels(`atlas-release-${visit}.png`);
            assert.ok(released.pixels.blue < 50 && released.pixels.green > 1000);
            await page.click('#enter');
            await page.evaluate(async () => {
                for (let i = 0; i < 3; i++) window.__ownershipSteps.push(await window.__ownershipClock.step());
            });
            assert.equal(await page.evaluate(() => window.__atlasOwnership.snapshot().entered), true);
        }
        row.reenteredPixels = await pixels('atlas-reentered.png');
        assert.ok(row.reenteredPixels.blue > 1000 && row.reenteredPixels.green > 1000);
        row.status = 'PASS';
    } catch (error) {
        row.error = String(error);
        report.errors.push(String(error));
    }
    row.controlledFrames = await page.evaluate(() => window.__ownershipSteps);
    await page.evaluate(() => window.__ownershipClock.end());
    save('atlas/result.json', row);
    await page.close();
    report.inputsUnchanged = JSON.stringify(fingerprints()) === JSON.stringify(report.fingerprints);
    assert.ok(report.inputsUnchanged, 'inputs changed during collection');
    report.completed = true;
    if (report.errors.length) process.exitCode = 1;
}
const watchdog = setTimeout(() => {
    save('timeout.json', { error: 'outer 120s budget expired', report });
    process.exit(1);
}, 120000);
run()
    .catch((error) => {
        report.errors.push(String(error));
        process.exitCode = 1;
    })
    .finally(async () => {
        let timer;
        try {
            if (browser)
                await Promise.race([
                    browser.close(),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(Error('browser close exceeded 4s')), 4000);
                    }),
                ]);
            report.browserCloseAcknowledged = !!browser;
        } catch (error) {
            report.errors.push(String(error));
            process.exitCode = 1;
        }
        clearTimeout(timer);
        clearTimeout(watchdog);
        server.close();
        save('report.json', report);
        console.log(
            JSON.stringify({
                out,
                completed: report.completed,
                passed: report.cases.filter((row) => row.status === 'PASS').length,
                total: report.cases.length,
                errors: report.errors,
            }),
        );
    });
