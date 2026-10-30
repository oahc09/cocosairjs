const test = require('node:test'),
    assert = require('node:assert/strict'),
    { EventEmitter } = require('node:events');
const { bounded, launchOwnedBrowser } = require('./upstream-browser-lifecycle.cjs');
function fixture({ exit = true, disconnect = false } = {}) {
    const child = new EventEmitter();
    child.pid = 123;
    const calls = [];
    return {
        calls,
        engine: {
            async launchServer(options) {
                calls.push(['launch', options]);
                return {
                    process: () => child,
                    wsEndpoint: () => 'synthetic-owned-endpoint',
                    async close() {
                        calls.push(['server-close']);
                        if (exit) child.emit('close', 0, null);
                    },
                };
            },
            async connect(endpoint) {
                calls.push(['connect', endpoint]);
                if (disconnect) throw Error('synthetic connect failure');
                return {
                    async close() {
                        calls.push(['transport-close']);
                    },
                };
            },
        },
    };
}
test('owned browser records physical child close, not transport alone', async () => {
    const f = fixture(),
        report = {},
        options = { headless: true };
    const owned = await launchOwnedBrowser(f.engine, options, report, 30);
    await owned.close();
    assert.equal(report.browserProcess.closeObserved, true);
    assert.deepEqual(report.browserProcess.closeErrors, []);
    assert.deepEqual(
        f.calls.map((row) => row[0]),
        ['launch', 'connect', 'transport-close', 'server-close'],
    );
    assert.strictEqual(f.calls[0][1], options);
});
test('transport/server acknowledgment without physical child close fails', async () => {
    const f = fixture({ exit: false }),
        report = {};
    const owned = await launchOwnedBrowser(f.engine, {}, report, 10);
    await assert.rejects(owned.close(), /physical child close deadline/);
    assert.equal(report.browserProcess.closeObserved, false);
});
test('failed connect still closes the created server and child', async () => {
    const f = fixture({ disconnect: true }),
        report = {};
    await assert.rejects(launchOwnedBrowser(f.engine, {}, report, 30), /connect failure/);
    assert.equal(report.browserProcess.closeObserved, true);
});
test('bounded operations retain failure and do not wait forever', async () => {
    await assert.rejects(
        bounded(() => new Promise(() => {}), 10, 'fixture'),
        /fixture deadline/,
    );
    await assert.rejects(
        bounded(
            () => {
                throw Error('original');
            },
            10,
            'fixture',
        ),
        /original/,
    );
    assert.equal(await bounded(() => 42, 10, 'fixture'), 42);
});
