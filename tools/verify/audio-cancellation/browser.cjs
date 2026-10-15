'use strict';
const tracker = require('./owned-process-tracker.cjs');
if (process.env.REVIEW_SUPERVISED !== '1') throw Error('Use supervise.cjs');
const { webkit } = require('playwright');
const browserExecutable = process.env.AUDIO_QA_WEBKIT || webkit.executablePath();
tracker.configureBrowserExecutable(browserExecutable);
const { spawn } = require('node:child_process');
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..'),
    outDir = path.resolve(process.env.AUDIO_QA_OUT || 'output/audio-cancellation');
const tag = process.env.REVIEW_TAG,
    base = 'http://127.0.0.1:' + (process.env.AUDIO_QA_PORT || 8876);
const out = path.join(outDir, 'report-' + tag + '.json');
if (fs.existsSync(out)) throw Error('Immutable report exists');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser, server, context, page, startupTimer, closing;
const report = {
    started: new Date().toISOString(),
    scope: 'Isolated DOM cancellation SDK regression. Not original product acceptance.',
    bundleSha256: sha(fs.readFileSync(path.join(root, 'build/cocosair.module.js'))),
    browserExecutable,
    audioInputs: Object.fromEntries(
        ['a', 'b'].map((k) => {
            const file = path.resolve(
                process.env['AUDIO_QA_' + k.toUpperCase()] || path.join(root, 'examples/audio-basic/assets/tone.wav'),
            );
            return [k, { file, sha256: sha(fs.readFileSync(file)), bytes: fs.statSync(file).size }];
        }),
    ),
    completed: false,
    checks: [],
    contexts: [],
    errors: [],
};
async function bounded(promise, ms, label) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => (timer = setTimeout(() => reject(Error(label)), ms))),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
function check(name, pass, detail) {
    report.checks.push({ name, pass: !!pass, detail });
    if (!pass) throw Error(name);
}
function save() {
    fs.writeFileSync(out + '.partial', JSON.stringify(report, null, 2));
}
function startup(label) {
    clearTimeout(startupTimer);
    startupTimer = setTimeout(() => {
        report.startupFailure = label;
        void finish(124);
    }, 15000);
}
async function finish(code) {
    if (closing) return closing;
    closing = (async () => {
        clearTimeout(startupTimer);
        clearTimeout(cap);
        try {
            if (context) await bounded(context.close(), 4000, 'context.close 4s');
        } catch (e) {
            report.contextCloseError = String(e);
        }
        try {
            if (browser) await bounded(browser.close(), 4000, 'browser.close 4s');
        } catch (e) {
            report.browserCloseError = String(e);
        }
        for (const row of tracker.rows.filter((r) => r.role === 'browser'))
            if (!row.exit && tracker.stat(row.pid)) tracker.signal(row, 'SIGKILL');
        if (server && server.exitCode === null) server.kill('SIGTERM');
        const until = Date.now() + 2000;
        while (tracker.rows.some((r) => !r.exit || !r.close) && Date.now() < until) await sleep(20);
        report.processes = tracker.snapshot();
        report.closed = ['browser', 'server'].every(
            (role) =>
                tracker.rows.some((r) => r.role === role) &&
                tracker.rows
                    .filter((r) => r.role === role)
                    .every((r) => r.exit && r.close && !tracker.groupMembers(r).some((p) => p.state !== 'Z')),
        );
        report.ended = new Date().toISOString();
        report.exitCode = code || (report.closed ? 0 : 2);
        fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' });
        console.log(
            'AUDIO_QA_CLOSED',
            JSON.stringify({ completed: report.completed, closed: report.closed, exitCode: report.exitCode }),
        );
        process.exitCode = report.exitCode;
        if (process.connected) process.disconnect();
    })();
    return closing;
}
process.on('message', (message) => {
    if (message?.reviewAbort) {
        report.externalAbort = message.reviewAbort;
        void finish(124);
    }
});
const cap = setTimeout(() => {
    report.deadline = '155 second inner cap';
    void finish(124);
}, 155000);
function observe({ denyCount = 0 }) {
    const elements = [],
        plays = [],
        events = [],
        samples = [],
        inputs = [];
    const snapshot = (element) => ({
        id: elements.indexOf(element),
        src: element.currentSrc || element.src,
        paused: element.paused,
        ended: element.ended,
        time: element.currentTime,
        duration: Number.isFinite(element.duration) ? element.duration : null,
        readyState: element.readyState,
    });
    function register(element) {
        if (elements.includes(element)) return;
        elements.push(element);
        for (const type of [
            'loadedmetadata',
            'canplay',
            'play',
            'playing',
            'pause',
            'seeking',
            'seeked',
            'ended',
            'error',
            'emptied',
        ])
            element.addEventListener(type, (e) =>
                events.push({ type, at: performance.now(), trusted: e.isTrusted, state: snapshot(element) }),
            );
    }
    const create = document.createElement;
    document.createElement = function (...args) {
        const element = create.apply(this, args);
        if (String(args[0]).toLowerCase() === 'audio') register(element);
        return element;
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
        register(this);
        const row = {
            index: plays.length,
            id: elements.indexOf(this),
            at: performance.now(),
            initial: snapshot(this),
            injected: denyCount > 0,
        };
        plays.push(row);
        const result = row.injected
            ? (--denyCount,
              Promise.reject(new DOMException('Explicit test-only autoplay fault injection', 'NotAllowedError')))
            : play.apply(this, args);
        result?.then(
            () => {
                row.fulfilled = performance.now();
                row.final = snapshot(this);
            },
            (error) => {
                row.rejected = performance.now();
                row.error = { name: error.name, message: error.message };
            },
        );
        return result;
    };
    for (const type of ['mousedown', 'mouseup', 'click'])
        window.addEventListener(
            type,
            (e) => inputs.push({ type, at: performance.now(), trusted: e.isTrusted, target: e.target.id }),
            true,
        );
    setInterval(() => {
        if (plays.length) samples.push({ at: performance.now(), states: elements.map(snapshot) });
    }, 10);
    window.__nativeQA = () => ({
        at: performance.now(),
        plays,
        events,
        samples,
        inputs,
        states: elements.map(snapshot),
    });
}
async function setup(name, denyCount = 0, first = false) {
    if (!first) startup(name);
    context = await browser.newContext({ viewport: { width: 1000, height: 740 } });
    await context.addInitScript(observe, { denyCount });
    page = await context.newPage();
    page.setDefaultTimeout(3000);
    page.setDefaultNavigationTimeout(10000);
    page.on('pageerror', (e) => report.errors.push({ name, message: e.message }));
    const bodyPromises = [];
    const bodies = [];
    page.on('response', (r) => {
        if (!r.url().includes('cocosair.module.js') && !/qa-[ab]\.wav/.test(r.url())) return;
        bodyPromises.push(
            (async () => {
                try {
                    const bytes = await r.body();
                    bodies.push({ url: r.url(), status: r.status(), bytes: bytes.length, sha256: sha(bytes) });
                } catch (e) {
                    bodies.push({ url: r.url(), error: String(e) });
                }
            })(),
        );
    });
    await page.goto(base + '/test/fixtures/audio-cancellation/index.html');
    await page.waitForFunction(
        () => __audioQA.snapshot().fault || (__audioQA.snapshot().ready && __audioQA.snapshot().frames > 4),
    );
    clearTimeout(startupTimer);
    if (process.connected) process.send({ audioReady: true });
    check(
        name + ' startup and frames',
        await page.evaluate(() => {
            const s = __audioQA.snapshot();
            return s.ready && !s.fault && s.frames > 4;
        }),
    );
    return { name, denyCount, bodies, bodyPromises };
}
const snap = () => page.evaluate(() => ({ source: __audioQA.snapshot(), native: __nativeQA() }));
async function click(id) {
    await page.locator('#' + id).click({ delay: 60 });
}
async function progress() {
    await page.waitForFunction(() => {
        const n = __nativeQA(),
            p = n.plays.at(-1);
        return p && !p.injected && n.states[p.id].time > 0.09 && !n.states[p.id].paused;
    });
}
async function observeBeyondOriginalEOS(original, label) {
    const now = (await snap()).native.at;
    const duration = original.initial.duration;
    check(label + ' bounded media duration', Number.isFinite(duration) && duration > 0 && duration <= 5, duration);
    const until = original.at + duration * 1000 + 100;
    // This is a post-stop ghost observation, never an extension of the 250 ms stop fence.
    const wait = Math.max(750, until - now);
    await page.waitForTimeout(wait);
    return { originalPlayAt: original.at, originalDuration: duration, observeUntil: until, waited: wait };
}
async function stopProof(label) {
    const before = await snap(),
        original = before.native.plays.at(-1);
    await click('stop');
    await page.waitForFunction(
        (epoch) => __audioQA.snapshot().records.some((r) => r.type === 'stop-complete' && r.requestedEpoch === epoch),
        before.source.epoch,
        { timeout: 250 },
    );
    const after = await snap(),
        completed = after.source.records.filter((r) => r.type === 'stop-complete').at(-1),
        media = after.native.states[original.id];
    const stopRequest = after.source.records.filter((r) => r.type === 'stop-request').at(-1);
    const originalEOSDeadline = original.at + (original.initial.duration - original.initial.time) * 1000;
    const firstStoppedSample = after.native.samples.find(
        (s) => s.at >= stopRequest.at && s.states[original.id]?.paused && s.states[original.id]?.time === 0,
    ) || { at: after.native.at, states: after.native.states };
    check(
        label + ' original native stop sample within fence and before EOS',
        firstStoppedSample.at - stopRequest.at <= 250 && firstStoppedSample.at < originalEOSDeadline,
        { original, originalEOSDeadline, stopRequest, firstStoppedSample },
    );
    check(
        label + ' current operation completes within 250ms',
        completed.matchingEpoch &&
            completed.elapsed <= 250 &&
            completed.time === 0 &&
            !completed.playing &&
            completed.state === 3,
        completed,
    );
    check(
        label + ' original native paused/zero before original EOS',
        media.paused &&
            media.time === 0 &&
            !media.ended &&
            before.native.states[original.id].time < before.native.states[original.id].duration,
        { before: before.native.states[original.id], after: media },
    );
    const observation = await observeBeyondOriginalEOS(original, label);
    const later = await snap(),
        old = later.native.states[original.id];
    check(
        label + ' no ghost playback or stale STARTED after stop',
        old.paused &&
            old.time === 0 &&
            later.native.plays.length === after.native.plays.length &&
            later.source.source.state === 3 &&
            !later.source.records.some(
                (r) => r.type === 'ENDED' && r.epoch === before.source.epoch && r.at > stopRequest.at,
            ) &&
            !later.source.records.some(
                (r) => r.type === 'STARTED' && r.epoch === before.source.epoch && r.at > completed.at,
            ),
        { old, records: later.source.records, observation },
    );
}
async function journal(run) {
    await Promise.allSettled(run.bodyPromises);
    const data = await snap();
    for (const [key, expected] of Object.entries(report.audioInputs))
        check(
            run.name + ' exact original audio ' + key,
            run.bodies.some(
                (b) =>
                    b.url.endsWith('/qa-' + key + '.wav') && b.sha256 === expected.sha256 && b.bytes === expected.bytes,
            ),
            { expected, bodies: run.bodies },
        );
    check(
        run.name + ' served exact isolated SDK bytes',
        run.bodies.some(
            (b) => b.url.endsWith('/build/cocosair.module.js') && b.status === 200 && b.sha256 === report.bundleSha256,
        ),
        run.bodies,
    );
    const file = path.join(outDir, tag + '-' + run.name + '.json');
    fs.writeFileSync(file, JSON.stringify({ ...run, bodyPromises: undefined, ...data }, null, 2), { flag: 'wx' });
    const screenshot = path.join(outDir, tag + '-' + run.name + '.png');
    await page.screenshot({ path: screenshot });
    report.contexts.push({
        name: run.name,
        injectedNotAllowedCount: run.denyCount,
        file,
        sha256: sha(fs.readFileSync(file)),
        screenshot,
    });
    save();
}
(async () => {
    startup('launch through first ready frame');
    server = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
    });
    await bounded(
        new Promise((resolve, reject) => {
            server.once('error', reject);
            server.stdout.on('data', (bytes) => {
                if (String(bytes).includes('AUDIO_QA_SERVER_READY')) resolve();
            });
        }),
        3000,
        'server readiness',
    );
    browser = await webkit.launch({
        headless: true,
        timeout: 10000,
        executablePath: browserExecutable,
    });
    let run = await setup('native', 0, true);
    let repeatedMediaId;
    for (let i = 0; i < 3; i++) {
        await click('play');
        await progress();
        const currentMediaId = (await snap()).native.plays.at(-1).id;
        if (i === 0) repeatedMediaId = currentMediaId;
        check('repeat ' + i + ' retains original native element', currentMediaId === repeatedMediaId, {
            currentMediaId,
            repeatedMediaId,
        });
        await stopProof('repeat ' + i);
    }
    await click('play');
    await progress();
    await click('pause');
    const paused = await snap(),
        id = paused.native.plays.at(-1).id,
        time = paused.native.states[id].time;
    await page.waitForTimeout(100);
    const still = await snap();
    check(
        'pause preserves stopped media position',
        still.native.states[id].paused && Math.abs(still.native.states[id].time - time) < 0.015,
        { time, state: still.native.states[id] },
    );
    await click('play');
    await progress();
    await stopProof('pause resume');
    for (let i = 0; i < 6; i++) {
        await click('play');
        await progress();
        const epoch = (await snap()).source.epoch;
        await page.waitForFunction(
            (e) => __audioQA.snapshot().records.some((r) => r.type === 'ENDED' && r.epoch === e),
            epoch,
            { timeout: 3500 },
        );
        await page.waitForTimeout(40);
        const ended = await snap();
        (report.naturalCycles ||= []).push({
            iteration: i,
            epoch,
            publicEvents: ended.source.records.filter((r) => r.epoch === epoch),
            nativePlay: ended.native.plays.at(-1),
            nativeState: ended.native.states[ended.native.plays.at(-1).id],
        });
        check(
            'natural EOS replay ' + i,
            ended.source.source.state === 0 && ended.source.source.time === 0 && !ended.source.source.playing,
            ended.source,
        );
    }
    await click('play');
    await progress();
    const replacing = await snap(),
        originalId = replacing.native.plays.at(-1).id;
    await click('aba');
    await page.waitForFunction(() => __audioQA.snapshot().ready);
    const replaced = await snap();
    check(
        'rapid B/A replacement releases original media',
        replaced.native.states[originalId].paused && replaced.native.states[originalId].time === 0,
        replaced.native.states[originalId],
    );
    await click('play');
    await progress();
    await stopProof('replacement');
    await click('clipB');
    await page.waitForFunction(() => __audioQA.snapshot().ready);
    await click('play');
    await progress();
    await stopProof('original draw cue');
    await click('play');
    await progress();
    const destroying = await snap(),
        destroyedId = destroying.native.plays.at(-1).id;
    await click('destroy');
    await page.waitForTimeout(100);
    await page.locator('#GameCanvas').click({ delay: 60 });
    const destroyObservation = await observeBeyondOriginalEOS(destroying.native.plays.at(-1), 'destroy');
    const destroyed = await snap();
    check(
        'destroy silences original media and invalidates Source/Node',
        destroyed.native.states[destroyedId].paused &&
            destroyed.native.states[destroyedId].time === 0 &&
            destroyed.native.plays.length === destroying.native.plays.length &&
            destroyed.source.sources.every((s) => !s.valid && !s.strict),
        { ...destroyed, observation: destroyObservation },
    );
    await click('release');
    await page.waitForFunction(() => __audioQA.snapshot().disposed);
    const released = await snap();
    check(
        'public scene release invalidates original clips',
        released.source.clips.every((c) => !c.valid && !c.strict),
        released.source,
    );
    await journal(run);
    await bounded(context.close(), 4000, 'native context.close');
    context = null;
    for (const cancel of [true, false]) {
        run = await setup(cancel ? 'injected-gesture-cancel' : 'injected-gesture-recover', 1);
        await page.evaluate(() => __audioQA.programmaticPlay());
        await page.waitForFunction(() => __nativeQA().plays.some((p) => p.injected && p.rejected));
        if (cancel) await click('stop');
        await page.locator('#GameCanvas').click({ delay: 60 });
        if (cancel) {
            await page.waitForTimeout(150);
            check('canceled denied play never retries on later gesture', (await snap()).native.plays.length === 1);
        } else {
            await progress();
            await stopProof('gesture recovery');
        }
        await click('release');
        await page.waitForFunction(() => __audioQA.snapshot().disposed);
        await journal(run);
        await bounded(context.close(), 4000, 'gesture context.close');
        context = null;
    }
    check('no page errors', report.errors.length === 0, report.errors);
    report.completed = true;
})()
    .catch(async (error) => {
        if (closing) return;
        report.fatal = error.stack;
        try {
            if (page) {
                report.failure = await snap();
                await page.screenshot({ path: path.join(outDir, tag + '-failure.png') });
            }
        } catch (capture) {
            report.captureError = String(capture);
        }
        process.exitCode = 1;
    })
    .finally(() => finish(process.exitCode || 0));
