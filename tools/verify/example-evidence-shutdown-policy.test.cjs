'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
    superviseAttempt,
    validateAttemptReceipt,
    validateCustodyArtifacts,
} = require('./example-evidence-supervisor.cjs');
const { validateShutdownPolicy } = require('./example-evidence-shutdown-policy.cjs');
const { BrowserRuntime } = require('../benchmark/runner/browser-runtime.cjs');
const repo = path.resolve(__dirname, '../..');
const limits = { startupMs: 15000, closeMs: 4000, innerMs: 20000, abortMs: 25000, forceMs: 30000, finalMs: 35000 };
const directory = process.env.EXAMPLE_SHUTDOWN_CPU_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'shutdown-policy-'));
const clone = (value) => JSON.parse(JSON.stringify(value));
console.log('Shutdown-policy CPU receipts: ' + directory);
async function attempt(cpuCase) {
    const out = path.join(directory, cpuCase);
    const receipt = await superviseAttempt({
        repo,
        id: 'cpu-example',
        cpuCase,
        expectedModes: ['primary'],
        limits,
        out: path.join(out, 'collector.json'),
        artifactDir: path.join(out, 'artifacts'),
    });
    const contents = Object.fromEntries(
        Object.entries(receipt.custody.artifacts).map(([role, ref]) => {
            const bytes = fs.readFileSync(ref.path);
            return [role, ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(bytes) : bytes];
        }),
    );
    assert.equal(validateCustodyArtifacts(receipt, contents).ok, true);
    assert.equal(receipt.noOwnedProcesses, true);
    assert.equal(receipt.custody.observation.final.result, 'ECHILD');
    return receipt;
}
test('versioned browser close protocol retains raw statuses and distinguishes clean shutdown from failure', async (t) => {
    let positive;
    for (const [mode, expected] of [
        ['shutdown-double-term', true],
        ['shutdown-delayed-term', true],
        ['shutdown-application-fail', false],
        ['shutdown-kill', false],
        ['shutdown-wrong-image', false],
        ['shutdown-residual', false],
    ]) {
        await t.test(mode, async () => {
            const receipt = await attempt(mode);
            assert.equal(receipt.ok, expected, JSON.stringify(receipt.errors));
            if (expected) {
                assert.equal(receipt.forced, false);
                assert.ok(
                    receipt.custody.observation.adopted.every(
                        (row) => row.reap.rawStatus === 15 && row.reap.signal === 'SIGTERM',
                    ),
                );
                assert.ok(
                    receipt.custody.observation.adopted.every(
                        (row) => row.disposition.result === 'shutdown-compatible',
                    ),
                );
            }
            if (mode === 'shutdown-application-fail') {
                assert.equal(receipt.custody.observation.errors.length, 0);
                assert.equal(receipt.runtimes[0].stopComplete.type, 'stop-complete');
                assert.ok(
                    receipt.custody.observation.adopted.every(
                        (row) => row.disposition.result === 'shutdown-compatible',
                    ),
                );
            }
            if (mode === 'shutdown-double-term') {
                positive = receipt;
                assert.equal(receipt.custody.observation.adopted.length, 2);
            }
        });
    }
    assert.ok(positive);
    await t.test('closing budget is bound to its original owner and cannot renew at stop', () => {
        const shifted = clone(positive),
            raw = shifted.custody.observation;
        for (const proof of raw.barriers) {
            proof.elapsedMs += 12345;
            proof.deadlineMs += 12345;
        }
        assert.deepEqual(
            validateShutdownPolicy(shifted, raw),
            [],
            'another clock origin is not an extended Node budget',
        );
        for (const mutate of [
            (r) => {
                r.custody.observation.barriers.find((p) => p.phase === 'closing').closeBudget.deadlineMs++;
            },
            (r) => {
                r.custody.observation.barriers.find((p) => p.phase === 'stop').closeBudget.originEventId++;
            },
            (r) => {
                delete r.custody.observation.barriers.find((p) => p.phase === 'closing').closeBudget;
            },
            (r) => {
                r.custody.observation.barriers.find((p) => p.phase === 'stop').deadlineMs += 4000;
                r.custody.observation.barriers.find((p) => p.phase === 'stop').elapsedMs += 4000;
            },
        ]) {
            const bad = clone(positive);
            mutate(bad);
            assert.ok(validateShutdownPolicy(bad, bad.custody.observation).length);
        }
    });
    await t.test('complete synchronized proof mutations cannot forge shutdown compatibility', () => {
        for (const state of ['S', 'Z', 'X']) {
            const r = clone(positive),
                raw = r.custody.observation;
            const closing = raw.barriers.find((proof) => proof.phase === 'closing');
            const child = raw.adopted[0];
            const closingId = closing.eventId,
                observedId = child.observed.eventId;
            child.state = child.observed.identity.state = state;
            child.observed.eventId = closingId;
            child.observed.elapsedMs = closing.elapsedMs - 0.1;
            child.observed.utc = closing.utc;
            closing.eventId = observedId;
            closing.directChildren.push(child.pid);
            for (const row of raw.adopted) {
                if (row.disposition.closingEventId === closingId) row.disposition.closingEventId = observedId;
                raw.events[row.disposition.eventId - 1] = clone(row.disposition);
            }
            for (const ack of r.events.filter(
                (event) => event.type === 'custody-barrier-ack' && event.phase === 'closing',
            ))
                ack.custodyEventId = observedId;
            raw.events[closingId - 1] = clone(child.observed);
            raw.events[observedId - 1] = clone(closing);
            const originals = Object.fromEntries(
                Object.entries(r.custody.artifacts).map(([role, ref]) => {
                    const bytes = fs.readFileSync(ref.path);
                    return [role, ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(bytes) : bytes];
                }),
            );
            originals.raw = raw;
            originals.nodeReceipt.events = clone(r.events);
            originals.journal = Buffer.from(raw.events.map((event) => JSON.stringify(event)).join('\n') + '\n');
            for (const [role, value] of Object.entries(originals)) {
                const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + '\n');
                r.custody.artifacts[role].bytes = bytes.length;
                r.custody.artifacts[role].sha256 = require('node:crypto')
                    .createHash('sha256')
                    .update(bytes)
                    .digest('hex');
            }
            assert.equal(
                validateAttemptReceipt(r, { allowCpuDummy: true }).ok,
                false,
                `an exact child adopted in state ${state} before closing cannot rejoin the browser tree`,
            );
            assert.equal(
                validateCustodyArtifacts(r, originals).ok,
                true,
                'original integrity can hold while the independent shutdown policy rejects the contradiction',
            );
        }
        const cases = {
            'old receipt version': (r) => {
                r.schemaVersion = 'example-evidence-attempt/1';
            },
            'old kernel version': (r) => {
                r.custody.observation.schemaVersion = 'example-evidence-custody-observation/1';
            },
            'worker failure': (r) => {
                r.worker.exit.code = r.worker.close.code = 7;
            },
            aborted: (r) => {
                r.forced = true;
            },
            'no boundary': (r) => {
                r.custody.observation.barriers = r.custody.observation.barriers.filter((p) => p.phase !== 'closing');
            },
            'no acknowledged call': (r) => {
                r.runtimes[0].closeAuthorized = null;
            },
            'wrong close runtime': (r) => {
                r.runtimes[0].closeAuthorized.runtimeId = 'runtime-other';
            },
            'no final ECHILD': (r) => {
                r.custody.observation.final = null;
            },
        };
        for (const [name, mutate] of Object.entries(cases)) {
            const r = clone(positive);
            mutate(r);
            assert.equal(validateAttemptReceipt(r, { allowCpuDummy: true }).ok, false, name);
        }
        for (const [name, mutate] of Object.entries({
            'terminal before closing': (c) => {
                c.before.state = c.identity.state = 'Z';
            },
            'wrong image': (c) => {
                c.image.sha256 = '0'.repeat(64);
            },
            'missing image fields': (c) => {
                delete c.image.inode;
            },
            'wrong namespace': (c) => {
                c.before.namespace = c.identity.namespace = 'pid:[1]';
            },
            'parent not browser': (c) => {
                c.before.ppid = c.identity.ppid = 1;
            },
            'unstable group': (c) => {
                c.before.pgrp++;
            },
            'missing state': (c) => {
                delete c.before.state;
            },
            'missing PID': (c) => {
                delete c.identity.pid;
            },
        })) {
            const r = clone(positive),
                raw = r.custody.observation;
            const closing = raw.barriers.find((p) => p.phase === 'closing');
            const child = raw.adopted[0];
            const candidate = closing.snapshot.candidates.find((c) => c.identity.pid === child.pid);
            mutate(candidate);
            child.disposition.candidate = clone(candidate);
            for (const event of raw.events) {
                if (event.eventId === closing.eventId) Object.assign(event, clone(closing));
                if (event.eventId === child.disposition.eventId) Object.assign(event, clone(child.disposition));
            }
            assert.ok(validateShutdownPolicy(r, raw).length, name);
        }
    });
});

test('shared BrowserRuntime normal stop preserves non-supervised callers and errors remain latched', async () => {
    const { EventEmitter } = require('node:events');
    for (const supervised of [false, true]) {
        const runtime = new BrowserRuntime({ repo, esbuild: {} });
        runtime.evidenceRequiresClosingAck = supervised;
        runtime.normalStopRequested = false;
        runtime.evidenceClosingAcknowledged = false;
        const browser = new EventEmitter();
        browser.close = async () => browser.emit('disconnected');
        runtime.browser = browser;
        browser.on('disconnected', () => runtime.recordBrowserDisconnected());
        if (supervised) runtime.evidenceClosingAcknowledged = true;
        await runtime.stop();
        assert.deepEqual(runtime.pageErrors, []);
        runtime.normalStopRequested = runtime.evidenceClosingAcknowledged = false;
        runtime.recordBrowserDisconnected();
        assert.equal(runtime.pageErrors[0].category, 'unexpected-browser-disconnected');
        runtime.recordPageCrash();
        assert.equal(runtime.pageErrors[1].category, 'page-crash');
    }
});
