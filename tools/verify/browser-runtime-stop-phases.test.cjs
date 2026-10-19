const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BrowserRuntime } = require('../benchmark/runner/browser-runtime.cjs');

test('stop diagnostics preserve sequential cleanup, error propagation and unsupervised silence', async () => {
    const prior = process.env.EXAMPLE_EVIDENCE_SUPERVISED;
    const originalError = console.error;
    const records = [];
    console.error = (line) => records.push(JSON.parse(line));
    const runtime = () => new BrowserRuntime({ esbuild: {}, repo: __dirname });
    try {
        process.env.EXAMPLE_EVIDENCE_SUPERVISED = '1';
        const first = runtime();
        let release;
        const calls = [];
        first.context = {
            close: () =>
                new Promise((resolve) => {
                    calls.push('context');
                    release = resolve;
                }),
        };
        first.browser = {
            close: async () => {
                calls.push('browser');
            },
        };
        first.server = {
            close: (done) => {
                calls.push('server');
                done();
            },
            closeAllConnections: () => {},
        };
        const pending = first.stop();
        await Promise.resolve();
        assert.deepEqual(calls, ['context']);
        assert.deepEqual(
            records.map((r) => [r.phase, r.state]),
            [['context', 'begin']],
        );
        release();
        await pending;
        assert.deepEqual(calls, ['context', 'browser', 'server']);
        assert.deepEqual(
            records.map((r) => [r.phase, r.state]),
            [
                ['context', 'begin'],
                ['context', 'end'],
                ['browser', 'begin'],
                ['browser', 'end'],
                ['server', 'begin'],
                ['server', 'end'],
            ],
        );
        assert.ok(records.every((r) => r.instanceId === first.stopDiagnosticId && Number.isFinite(r.monotonicMs)));
        assert.ok(records.every((r, i) => i === 0 || r.monotonicMs >= records[i - 1].monotonicMs));
        assert.equal(first.context, null);
        assert.equal(first.browser, null);
        assert.equal(first.server, null);

        records.length = 0;
        const second = runtime();
        assert.notEqual(second.stopDiagnosticId, first.stopDiagnosticId);
        const failure = new Error('private URL must not enter diagnostics');
        second.context = {
            close: async () => {
                throw failure;
            },
        };
        let browserClosed = false;
        second.browser = {
            close: async () => {
                browserClosed = true;
            },
        };
        await assert.rejects(second.stop(), (e) => e instanceof AggregateError && e.errors[0] === failure);
        assert.equal(browserClosed, true);
        assert.equal(records.find((r) => r.state === 'error').errorName, 'Error');
        assert.ok(!JSON.stringify(records).includes('private URL'));

        delete process.env.EXAMPLE_EVIDENCE_SUPERVISED;
        records.length = 0;
        await runtime().stop();
        assert.deepEqual(records, []);
    } finally {
        console.error = originalError;
        if (prior === undefined) delete process.env.EXAMPLE_EVIDENCE_SUPERVISED;
        else process.env.EXAMPLE_EVIDENCE_SUPERVISED = prior;
    }
});
