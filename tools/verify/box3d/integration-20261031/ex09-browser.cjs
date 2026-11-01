/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Real browser, public observation + ordinary UI command queue only. No body writes or synthetic success.
const fs = require('node:fs'),
    path = require('node:path'),
    assert = require('node:assert/strict');
const [url, outArg, playwrightModule, executable, browserName = 'chromium'] = process.argv.slice(2),
    out = path.resolve(outArg || '');
assert(
    url && outArg && playwrightModule && executable,
    'Usage: node ex09-browser.cjs LOOPBACK_URL NEW_OUTPUT_DIR PLAYWRIGHT_MODULE BROWSER_EXECUTABLE [chromium|webkit]',
);
assert(['chromium', 'webkit'].includes(browserName));
const u = new URL(url);
assert(['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol === 'http:');
assert.equal(u.searchParams.get('candidate'), 'integration-20261031');
fs.mkdirSync(out);
(async () => {
    const playwright = require(playwrightModule);
    const browser = await playwright[browserName].launch({
        executablePath: executable,
        headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
    let errors = [],
        lastProgress = null;
    const bounded = async (promise, label, timeoutMs) => {
        let timer;
        try {
            return await Promise.race([
                promise,
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(Error(`${label} wall deadline exceeded`)), timeoutMs);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    };
    await page.exposeFunction('__ex09Progress', (value) => {
        lastProgress = value;
        fs.appendFileSync(path.join(out, 'progress.ndjson'), JSON.stringify(value) + '\n');
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
    });
    try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__BOX3D_GIFT_WORKSHOP__, null, { timeout: 60000 });
        const startup = await bounded(
            page.evaluate(async () => {
                const sdk = await import('/runtime/cocosair.module.js');
                globalThis.__ex09Sdk = sdk;
                globalThis.__ex09Clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 3000 });
                const observePassive = () => ({
                    gamePaused: sdk.game.isPaused(),
                    visibility: document.visibilityState,
                    frame: sdk.director?.getTotalFrames?.() ?? null,
                    nativeTick: globalThis.__BOX3D_GIFT_WORKSHOP__.observe().observation?.nativeTick ?? null,
                    canvas: [document.getElementById('GameCanvas').width, document.getElementById('GameCanvas').height],
                });
                const before = observePassive();
                await globalThis.__ex09Progress({ stage: 'native-pacer-before', ...before });
                await new Promise((resolve) => setTimeout(resolve, 500));
                const afterPassive = observePassive();
                await globalThis.__ex09Progress({ stage: 'native-pacer-after', ...afterPassive });
                await globalThis.__ex09Progress({ stage: 'clock-begin', ...before });
                globalThis.__ex09Clock.begin();
                globalThis.__ex09ClockEnded = false;
                for (let i = 0; i < 6; i++) await globalThis.__ex09Clock.step(1 / 60);
                return {
                    before,
                    afterPassive,
                    clockStepped: globalThis.__ex09Clock.stepped,
                    observation: globalThis.__BOX3D_GIFT_WORKSHOP__.observe().observation,
                };
            }),
            'startup-clock',
            20000,
        );
        fs.writeFileSync(path.join(out, 'startup.json'), JSON.stringify(startup, null, 2));
        await page.screenshot({ path: path.join(out, 'initial.png'), fullPage: true, timeout: 10000 });
        const result = await bounded(
            page.evaluate(async () => {
                const api = window.__BOX3D_GIFT_WORKSHOP__,
                    metadata = api.observe(),
                    actions = [],
                    waypoints = [];
                let seq = Math.max(
                        0,
                        ...metadata.events.map((e) => e.data?.packet?.seq ?? 0),
                        ...metadata.transport.trace.map((e) => e.packet?.seq ?? 0),
                    ),
                    controlledFrames = 0;
                const clock = globalThis.__ex09Clock,
                    sdk = globalThis.__ex09Sdk;
                const advance = async (frames = 5) => {
                    for (let i = 0; i < frames; i++) {
                        const frame = await clock.step(1 / 60);
                        if (frame.afterDraw !== true) throw Error('Missing completed real frame');
                        controlledFrames++;
                    }
                    if (controlledFrames % 60 === 0) await progress('advancing');
                };
                const progress = async (stage, detail = {}) => {
                    const s = read();
                    await globalThis.__ex09Progress({
                        stage,
                        ...detail,
                        tick: s.d.tick,
                        publicTick: s.d.tick,
                        head: s.head,
                        state: s.state,
                        gamePaused: sdk.game.isPaused(),
                        controlledFrames,
                    });
                };
                const read = () => {
                    let cachedReport;
                    const d = JSON.parse(document.getElementById('debug').textContent);
                    const text = document
                        .getElementById('alignment')
                        .textContent.match(/磁头 ([-.\d]+), ([-.\d]+), ([-.\d]+)/);
                    return {
                        get r() {
                            return (cachedReport ??= api.observe());
                        },
                        d,
                        state: document.getElementById('order-state').textContent.split(' · ')[0],
                        head: text ? text.slice(1).map(Number) : null,
                    };
                };
                const send = (command, payload = {}) => {
                    const { d } = read(),
                        r = metadata;
                    seq++;
                    const packet = {
                        protocolVersion: r.inputProtocolVersion,
                        configVersion: r.config.configVersion,
                        layoutId: r.layout.id,
                        roundGeneration: d.generation,
                        inputGeneration: d.transport.inputGeneration,
                        seq,
                        tick: d.tick + 1,
                        source: 'runner',
                        command,
                        payload,
                    };
                    const ack = api.command(packet);
                    actions.push({ packet, ack });
                    if (!ack.accepted) throw Error(`${command}: ${JSON.stringify(ack)}`);
                    return ack;
                };
                const wait = async (predicate, label, maxTicks = 900) => {
                    const start = read().d.tick;
                    const deadline = Date.now() + 120000;
                    for (;;) {
                        const s = read();
                        if (s.d.transport.fault) throw Error(s.d.transport.fault);
                        if (predicate(s)) return s;
                        if (s.d.tick - start > maxTicks || Date.now() > deadline || s.state === 'RESULT')
                            throw Error(
                                `Timeout ${label}: ${JSON.stringify({ tick: s.d.tick, state: s.state, reason: s.r.orderFlow.reason })}`,
                            );
                        await advance(5);
                    }
                };
                const axes = (v) => send('set-axes', { x: v[0], y: v[1], z: v[2] });
                const move = async (target, label, gain = 8) => {
                    await progress('move-start', { target, label });
                    waypoints.push({ target, label, start: read().d.tick });
                    const start = read().d.tick,
                        deadline = Date.now() + 120000;
                    let stable = 0;
                    for (;;) {
                        const s = read();
                        if (s.d.transport.fault) throw Error(s.d.transport.fault);
                        if (!s.head) throw Error('Missing public alignment');
                        const delta = target.map((x, i) => x - s.head[i]);
                        if (delta.every((x) => Math.abs(x) < 0.004)) {
                            axes([0, 0, 0]);
                            if (++stable >= 3) break;
                        } else {
                            stable = 0;
                            axes(delta.map((x, i) => Math.max(-1, Math.min(1, (x * gain) / (i === 1 ? 0.6 : 1.2)))));
                        }
                        if (s.d.tick - start > 900 || Date.now() > deadline || s.state === 'RESULT')
                            throw Error(
                                `Move failed ${label}: ${JSON.stringify({ head: s.head, target, state: s.state, last: s.r.transport.trace.slice(-2) })}`,
                            );
                        await advance(5);
                    }
                    waypoints.at(-1).end = read().d.tick;
                    await progress('move-end', { target, label });
                };
                const item = (id) => read().r.observation.observed.find((i) => i.itemId === id);
                const rotate = (v, q) => {
                    const [x, y, z] = v,
                        tx = 2 * (q.y * z - q.z * y),
                        ty = 2 * (q.z * x - q.x * z),
                        tz = 2 * (q.x * y - q.y * x);
                    return [
                        x + q.w * tx + q.y * tz - q.z * ty,
                        y + q.w * ty + q.z * tx - q.x * tz,
                        z + q.w * tz + q.x * ty - q.y * tx,
                    ];
                };
                const pickup = async (id, nearby = false) => {
                    const i = item(id),
                        r = read().r,
                        lug = rotate(r.config.skus[i.skuId].attachmentPoint, i.motion.rotation).map(
                            (v, k) => v + [i.motion.position.x, i.motion.position.y, i.motion.position.z][k],
                        );
                    if (nearby) {
                        const current = read().head;
                        if (
                            Math.hypot(current[0] - lug[0], current[2] - lug[2]) > 0.03 ||
                            current[1] - 0.06 <= i.bounds.max[1]
                        )
                            throw Error('Unsafe nearby pickup clearance');
                    } else await move([lug[0], 2.6, lug[2]], `${id} above`);
                    await move([lug[0], lug[1] + 0.078, lug[2]], `${id} align`);
                    send('attach-release');
                    await wait(
                        (s) => s.r.observation.observed.some((i) => i.itemId === id && i.held),
                        `${id} held`,
                        90,
                    );
                    await move([lug[0], 2.6, lug[2]], `${id} lift`);
                };
                const place = async (id, x, z, surface, nearby = false) => {
                    // Aim the real item's body origin, accounting for its rotated offset lug.
                    const before = read(),
                        held = item(id);
                    x += before.head[0] - held.motion.position.x;
                    z += before.head[2] - held.motion.position.z;
                    await move([x, 2.6, z], `${id} travel`);
                    const i = item(id),
                        s = read(),
                        clearance = s.head[1] - i.bounds.min[1];
                    await move([x, surface + clearance + 0.06, z], `${id} lower`, 3);
                    send('attach-release');
                    await wait(
                        (s) => !s.r.observation.observed.some((i) => i.itemId === id && i.held),
                        `${id} released`,
                        90,
                    );
                    const released = item(id),
                        current = read().head;
                    const clearY = nearby ? Math.max(current[1], released.bounds.max[1] + 0.06 + 0.1) : 2.6;
                    if (nearby && clearY - 0.06 <= released.bounds.max[1]) throw Error('Unsafe scale hover clearance');
                    await move([x, clearY, z], `${id} clear`);
                };
                try {
                    await progress('start-round');
                    send('start-round');
                    await wait((s) => s.r.orderFlow.state === 'PACKING', 'round start', 60);
                    const choices = [
                        ['A1', 'B4'],
                        ['A4', 'C4'],
                        ['B2', 'C2'],
                    ];
                    for (let order = 0; order < 3; order++) {
                        for (let n = 0; n < 2; n++) {
                            const id = choices[order][n];
                            await pickup(id);
                            await place(id, 0, -0.75, 1.52, true);
                            await wait(
                                (s) => s.r.observation.receipts.some((r) => r.itemId === id),
                                `${id} actual weigh`,
                                180,
                            );
                            await pickup(id, true);
                            await place(id, n === 0 ? 1.42 : 1.88, 0, 1.5);
                        }
                        await wait((s) => s.r.orderFlow.stableTicks >= 45, 'packing stable', 240);
                        send('submit-order');
                        await wait(
                            (s) => s.r.orderFlow.ledger.length === order + 1,
                            `order ${order + 1} delivery`,
                            600,
                        );
                        if (order < 2) await wait((s) => s.r.orderFlow.state === 'PACKING', `next order`, 600);
                    }
                    await advance(3);
                    clock.end();
                    globalThis.__ex09ClockEnded = true;
                    const stoppedDeadline = Date.now() + 10000;
                    while (!api.observe().stoppedPhysicsEvidence.length) {
                        if (Date.now() > stoppedDeadline) throw Error('Terminal RAF evidence did not arrive');
                        await new Promise((resolve, reject) => {
                            const timer = setTimeout(
                                () => reject(Error('Terminal real RAF deadline exceeded')),
                                Math.max(1, stoppedDeadline - Date.now()),
                            );
                            requestAnimationFrame(() => {
                                clearTimeout(timer);
                                resolve();
                            });
                        });
                    }
                    const final = api.observe();
                    const stop = final.stoppedPhysicsEvidence.at(-1);
                    if (
                        final.orderFlow.state !== 'RESULT' ||
                        final.orderFlow.ledger.length !== 3 ||
                        final.orderFlow.score < 300
                    )
                        throw Error('Missing terminal three-order result');
                    if (
                        !stop?.first ||
                        !stop?.second ||
                        stop.error ||
                        stop.first.autoSimulation !== false ||
                        stop.second.autoSimulation !== false ||
                        stop.first.lastNativeObserved !== stop.second.lastNativeObserved ||
                        JSON.stringify(stop.first.items) !== JSON.stringify(stop.second.items) ||
                        JSON.stringify(stop.first.head) !== JSON.stringify(stop.second.head) ||
                        JSON.stringify(stop.first.door) !== JSON.stringify(stop.second.door) ||
                        stop.second.items.length !== 6
                    )
                        throw Error('Missing stable stopped physics and consumed-body retirement evidence');
                    return { status: 'PASS_THREE_ORDER_BROWSER', controlledFrames, actions, waypoints, report: final };
                } catch (error) {
                    return {
                        status: 'FAIL',
                        controlledFrames,
                        error: `${String(error)}\n${error.stack ?? ''}`,
                        actions,
                        waypoints,
                        report: api.observe(),
                    };
                }
            }),
            'three-order-run',
            1800000,
        );
        fs.writeFileSync(path.join(out, 'scenario-result.json'), JSON.stringify(result, null, 2));
        await bounded(
            page.evaluate(() => {
                if (!globalThis.__ex09ClockEnded) {
                    globalThis.__ex09Clock.end();
                    globalThis.__ex09ClockEnded = true;
                }
            }),
            'restore-native-pacer',
            10000,
        );
        fs.writeFileSync(
            path.join(out, 'result.json'),
            JSON.stringify(
                {
                    ...result,
                    browserName,
                    viewport: page.viewportSize(),
                    browser: await browser.version(),
                    userAgent: await page.evaluate(() => navigator.userAgent),
                    interactionBoundary: 'public-input browser scenario, not human UI acceptance',
                    errors,
                },
                null,
                2,
            ),
        );
        await page.screenshot({ path: path.join(out, 'final.png'), fullPage: true });
        console.log(
            JSON.stringify({
                status: result.status,
                error: result.error,
                orders: result.report.orderFlow.ledger.length,
                errors,
            }),
        );
        if (result.status !== 'PASS_THREE_ORDER_BROWSER' || errors.length) process.exitCode = 1;
    } catch (error) {
        fs.writeFileSync(
            path.join(out, 'attempt-error.json'),
            JSON.stringify(
                { status: 'FAIL', error: `${String(error)}\n${error.stack ?? ''}`, browserName, lastProgress, errors },
                null,
                2,
            ),
        );
        try {
            await bounded(
                page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true, timeout: 5000 }),
                'failure-screenshot',
                6000,
            );
        } catch {}
        throw error;
    } finally {
        await bounded(browser.close(), 'browser-close', 15000);
        fs.writeFileSync(path.join(out, 'browser-closed.json'), JSON.stringify({ closed: true, browserName }));
    }
})().catch((e) => {
    fs.writeFileSync(path.join(out, 'fatal.txt'), String(e.stack ?? e));
    console.error(e);
    process.exitCode = 1;
});
