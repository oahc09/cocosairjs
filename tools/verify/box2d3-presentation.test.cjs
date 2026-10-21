const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { waitForPresentation, capturePresentedFrame } = require('./box2d3-presentation.cjs');

function browserClock() {
    const frames = new Map();
    const timers = new Map();
    const lab = {
        clock: { stepping: true, stepped: 12 },
        physics: { debugDrawFlags: 1 },
        drag: { node: { worldPosition: { x: 880, y: 470, z: 0 } } },
    };
    let sequence = 0;
    const context = {
        window: { box2d3Lab: lab },
        requestAnimationFrame: (fn) => {
            const id = ++sequence;
            frames.set(id, fn);
            return id;
        },
        cancelAnimationFrame: (id) => frames.delete(id),
        setTimeout: (fn) => {
            const id = ++sequence;
            timers.set(id, fn);
            return id;
        },
        clearTimeout: (id) => timers.delete(id),
    };
    return {
        lab,
        frames,
        timers,
        wait: () => vm.runInNewContext(`(${waitForPresentation.toString()})(2000)`, context),
        frame() {
            const pending = [...frames.values()];
            frames.clear();
            for (const fn of pending) fn();
        },
        timeout() {
            for (const fn of [...timers.values()]) fn();
        },
    };
}

test('two presentation frames preserve the paused simulation, without extra steps', async () => {
    const clock = browserClock();
    let resolved = false;
    const pending = clock.wait().then((result) => {
        resolved = true;
        return result;
    });
    clock.frame();
    await Promise.resolve();
    assert.equal(resolved, false);
    assert.equal(clock.frames.size, 1);
    clock.frame();
    const result = await pending;
    assert.equal(result.presentationFrames, 2);
    assert.equal(result.before.stepped, 12);
    assert.equal(JSON.stringify(result.before), JSON.stringify(result.after));
    assert.equal(clock.lab.clock.stepped, 12);
    assert.equal(clock.frames.size, 0);
    assert.equal(clock.timers.size, 0);
});

test('a missing presentation frame fails within the original budget', async () => {
    const clock = browserClock();
    const pending = assert.rejects(clock.wait(), /frame budget exceeded/);
    clock.frame();
    clock.timeout();
    await pending;
    assert.equal(clock.frames.size, 0);
    assert.equal(clock.timers.size, 0);
});

test('a running real clock is rejected rather than silently paused', async () => {
    const clock = browserClock();
    clock.lab.clock.stepping = false;
    await assert.rejects(clock.wait(), /paused manual clock/);
    assert.equal(clock.frames.size, 0);
    assert.equal(clock.timers.size, 0);
});

for (const change of ['step', 'flags', 'body', 'resume']) {
    test(`rejects ${change} changes during presentation`, async () => {
        const clock = browserClock();
        const pending = assert.rejects(clock.wait(), /state changed/);
        clock.frame();
        if (change === 'step') clock.lab.clock.stepped++;
        if (change === 'flags') clock.lab.physics.debugDrawFlags = 0;
        if (change === 'body') clock.lab.drag.node.worldPosition.x++;
        if (change === 'resume') clock.lab.clock.stepping = false;
        clock.frame();
        await pending;
        assert.equal(clock.frames.size, 0);
        assert.equal(clock.timers.size, 0);
    });
}

test('capture waits for presentation and takes exactly one requested screenshot', async () => {
    const events = [];
    const options = { path: 'enabled.png' };
    const observation = { presentationFrames: 2 };
    const page = {
        async evaluate(fn, budget) {
            assert.equal(fn, waitForPresentation);
            assert.equal(budget, 2000);
            events.push('presentation');
            return observation;
        },
        async screenshot(actual) {
            assert.equal(actual, options);
            events.push('screenshot');
        },
    };
    assert.equal(await capturePresentedFrame(page, options), observation);
    assert.deepEqual(events, ['presentation', 'screenshot']);
});

test('a failed presentation does not capture or retry', async () => {
    let screenshots = 0;
    const page = {
        async evaluate() {
            throw Error('frame budget exceeded');
        },
        async screenshot() {
            screenshots++;
        },
    };
    await assert.rejects(capturePresentedFrame(page, {}), /frame budget exceeded/);
    assert.equal(screenshots, 0);
});
