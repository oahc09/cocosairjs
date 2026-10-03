/* Read-only browser regression for CB-03/CB-09. Uses the current bundle, never builds it. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require('playwright');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');

const root = path.resolve(__dirname, '../..');
const fingerprint = () =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'build/cocosair.module.js')))
        .digest('hex');
const bundleSha256 = fingerprint();
const engine = process.argv.find((arg) => arg.startsWith('--engine='))?.split('=')[1] || 'chromium';
const engines = engine === 'all' ? ['chromium', 'firefox', 'webkit'] : [engine];
const screenshotDir = process.argv.find((arg) => arg.startsWith('--screenshots='))?.slice('--screenshots='.length);

(async () => {
    const server = await startExampleServer(root);
    const origin = server.origin;
    const results = [];
    try {
        for (const name of engines) {
            assert(playwright[name], `Unknown browser ${name}`);
            const browser = await playwright[name].launch({ headless: true });
            try {
                const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
                const pageErrors = [];
                const listenerErrors = [];
                const diagnosticReads = [];
                page.on('pageerror', (error) => pageErrors.push(error.message));
                page.on('console', (message) => {
                    if (message.type() !== 'error') return;
                    diagnosticReads.push(
                        (async () => {
                            const values = await Promise.all(
                                message
                                    .args()
                                    .map((arg) =>
                                        arg.evaluate((value) => ({ code: value?.code, message: value?.message })),
                                    ),
                            );
                            if (
                                message.text().includes('AIR_E_INPUT_LISTENER') ||
                                values.some(
                                    (value) =>
                                        value.code === 'AIR_E_INPUT_LISTENER' ||
                                        value.message?.includes('AIR_E_INPUT_LISTENER'),
                                )
                            )
                                listenerErrors.push(message.text());
                        })(),
                    );
                });
                await page.goto(`${origin}/examples/orbit-controls/`);
                await page.waitForFunction(() => window.__orbitProbe?.().ready && window.__orbitProbe().updates >= 2);
                await page.waitForTimeout(300);
                const initial = await page.evaluate(() => window.__orbitProbe());
                const before = await page.locator('canvas').screenshot();
                await page.mouse.move(450, 350);
                await page.mouse.down();
                for (let step = 1; step <= 8; step++) {
                    await page.mouse.move(450 + step * 12, 350 + step * 2);
                    await page.waitForTimeout(16);
                }
                await page.mouse.up();
                const released = await page.evaluate(() => window.__orbitProbe());
                assert(
                    released.drags >= 8 && released.theta !== initial.theta && !released.dragging,
                    'drag and release must update camera',
                );
                assert(Math.abs(released.thetaVelocity) > 0, 'release must retain measured drag velocity');
                await page.waitForTimeout(200);
                await page.waitForFunction(
                    (elapsed) => window.__orbitProbe().elapsed >= elapsed + 0.2,
                    released.elapsed,
                );
                const coasting = await page.evaluate(() => window.__orbitProbe());
                assert(
                    coasting.theta !== released.theta,
                    `camera must coast after release: ${JSON.stringify({ released, coasting, pageErrors })}`,
                );
                assert(Math.abs(coasting.thetaVelocity) < Math.abs(released.thetaVelocity), 'velocity must decay');
                const sampleElapsedSeconds = coasting.elapsed - released.elapsed;
                const expectedVelocity = released.thetaVelocity * Math.exp(-released.damping * sampleElapsedSeconds);
                assert(
                    Math.abs(coasting.thetaVelocity - expectedVelocity) < 1e-8,
                    'native elapsed time must match exponential decay',
                );
                const after = await page.locator('canvas').screenshot();
                assert(!before.equals(after), 'canvas pixels must change when orbiting');
                if (screenshotDir) {
                    fs.mkdirSync(path.resolve(screenshotDir), { recursive: true });
                    fs.writeFileSync(path.resolve(screenshotDir, `orbit-${name}.png`), after);
                }

                const recovery = await page.evaluate(async () => {
                    const { input, Input } = await import('/build/cocosair.module.js');
                    const canvas = document.querySelector('canvas');
                    const counts = { wheel: 0, down: 0, touch: 0 };
                    const wheel = () => counts.wheel++;
                    const down = () => counts.down++;
                    const touch = () => counts.touch++;
                    const invalidOut = (event) => event.getLocation({ x: 0, y: 0 });
                    const broken = () => {
                        throw new Error('intentional browser listener');
                    };
                    input.once(Input.EventType.MOUSE_WHEEL, invalidOut);
                    input.once(Input.EventType.TOUCH_START, invalidOut);
                    input.once(Input.EventType.MOUSE_DOWN, broken);
                    input.on(Input.EventType.MOUSE_WHEEL, wheel);
                    input.on(Input.EventType.MOUSE_DOWN, down);
                    input.on(Input.EventType.TOUCH_START, touch);
                    const before = window.__orbitProbe();
                    for (let i = 0; i < 2; i++) {
                        canvas.dispatchEvent(
                            new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
                        );
                        canvas.dispatchEvent(
                            new MouseEvent('mousedown', {
                                clientX: 420,
                                clientY: 320,
                                button: 0,
                                buttons: 1,
                                bubbles: true,
                            }),
                        );
                        window.dispatchEvent(
                            new MouseEvent('mouseup', { clientX: 420, clientY: 320, button: 0, bubbles: true }),
                        );
                    }
                    input.off(Input.EventType.MOUSE_WHEEL, wheel);
                    input.off(Input.EventType.MOUSE_DOWN, down);
                    input.off(Input.EventType.TOUCH_START, touch);
                    const after = window.__orbitProbe();
                    return {
                        counts,
                        radiusBefore: before.radius,
                        radiusAfter: after.radius,
                        engineWheels: after.wheels - before.wheels,
                        captureWheels: after.capturedDOMWheels - before.capturedDOMWheels,
                        bubbleWheels: after.bubbledDOMWheels - before.bubbledDOMWheels,
                    };
                });
                assert.deepEqual(
                    recovery.counts,
                    { wheel: 2, down: 2, touch: 2 },
                    'bad listeners must not block tails or later events',
                );
                assert.equal(recovery.engineWheels, 2, 'engine wheel must run once per DOM wheel');
                assert.equal(recovery.captureWheels, 2, 'DOM capture remains observable');
                assert.equal(recovery.bubbleWheels, 0, 'PAL stops DOM bubble propagation');
                assert(recovery.radiusAfter < recovery.radiusBefore, 'positive engine scroll must zoom in');
                await Promise.all(diagnosticReads);
                assert.equal(listenerErrors.length, 3, 'report each intentionally failed listener exactly once');
                assert.deepEqual(pageErrors, [], 'handled listener failures must not become page errors');
                results.push({
                    engine: name,
                    status: 'PASS',
                    recovery,
                    drags: released.drags,
                    velocityAtRelease: released.thetaVelocity,
                    velocityAfter200ms: coasting.thetaVelocity,
                    sampleElapsedSeconds,
                    pixelChange: true,
                    listenerDiagnostics: listenerErrors.length,
                });
            } finally {
                await browser.close();
            }
        }
        assert.equal(fingerprint(), bundleSha256, 'bundle changed during browser verification');
        console.log(
            JSON.stringify(
                {
                    scope: 'CB-03/CB-09',
                    bundleSha256,
                    playwrightVersion: require('playwright/package.json').version,
                    results,
                },
                null,
                2,
            ),
        );
    } finally {
        await server.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
