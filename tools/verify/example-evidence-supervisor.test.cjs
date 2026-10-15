'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { superviseAttempt, validateAttemptReceipt, limitsOf } = require('./example-evidence-supervisor.cjs');
const ROOT = path.resolve(__dirname, '../..');
const LIMITS = { startupMs: 800, closeMs: 300, innerMs: 1600, abortMs: 1900, forceMs: 2400, finalMs: 2800 };
const base = process.env.EXAMPLE_EVIDENCE_CPU_OUT
    ? path.resolve(process.env.EXAMPLE_EVIDENCE_CPU_OUT)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'example-evidence-supervisor-tests-'));
if (process.env.EXAMPLE_EVIDENCE_CPU_OUT) fs.mkdirSync(base);
console.log('CPU receipts: ' + base);
const summaries = [];
async function run(cpuCase, expectedModes = ['primary']) {
    const dir = path.join(base, cpuCase);
    const receipt = await superviseAttempt({
        repo: ROOT,
        id: 'cpu-example',
        cpuCase,
        expectedModes,
        out: path.join(dir, 'collector.json'),
        artifactDir: path.join(dir, 'artifacts'),
        limits: LIMITS,
    });
    assert.equal(receipt.cpuDummy, true);
    assert.equal(receipt.noOwnedProcesses, true, `${cpuCase}: owned processes must actually be absent`);
    assert.ok(receipt.worker.exit && receipt.worker.close, `${cpuCase}: genuine worker exit + stdio close`);
    assert.deepEqual(JSON.parse(fs.readFileSync(receipt.output.receipt, 'utf8')), receipt);
    summaries.push({
        cpuCase,
        ok: receipt.ok,
        forced: receipt.forced,
        timedOut: receipt.timedOut,
        noOwnedProcesses: receipt.noOwnedProcesses,
        receipt: receipt.output.receipt,
    });
    return receipt;
}

test('actual CPU subprocess/HTTP lifecycle controls, sequential and bounded', async (t) => {
    let positive;
    await t.test('two real CPU browser children and HTTP servers close before next runtime', async () => {
        positive = await run('positive', ['primary', 'variant:1']);
        assert.equal(positive.ok, true, JSON.stringify(positive.errors));
        assert.equal(positive.browsers.length, 2);
        assert.equal(positive.servers.length, 2);
        for (const browser of positive.browsers) {
            const owned = positive.ownedProcesses.find(
                (row) => row.pid === browser.pid && row.startTicks === browser.startTicks,
            );
            assert.equal(owned.firstObserved.processDiagnostic.status, 'observed');
            assert.equal(owned.firstObserved.processDiagnostic.purpose, 'diagnostic-only');
            assert.equal(owned.firstObserved.processDiagnostic.details.executable, 'node');
        }
        for (const runtime of positive.runtimes) {
            const diagnostics = positive.events.filter(
                (event) => event.type === 'owned-process-diagnostic' && event.runtimeId === runtime.runtimeId,
            );
            assert.ok(diagnostics.length > 0);
            assert.ok(
                diagnostics.every(
                    (event) =>
                        event.sourceEventId === runtime.stopBegin.eventId &&
                        event.phase === 'stop-begin-received' &&
                        event.processDiagnostic.purpose === 'diagnostic-only' &&
                        event.processDiagnostic.signalSender === 'unknown',
                ),
            );
        }
        const ready = fs
            .readFileSync(positive.output.stdout, 'utf8')
            .split('\n')
            .filter((line) => line.startsWith('{'))
            .map((line) => JSON.parse(line))
            .filter((row) => row.type === 'cpu-child-ready');
        assert.equal(ready.length, 2);
        assert.deepEqual(
            ready.map((row) => row.pid),
            positive.browsers.map((row) => row.pid),
        );
        assert.ok(ready.every((row) => row.cpuOnly === true && row.marker === 'CPU_CHILD_READY\n'));
        assert.equal(validateAttemptReceipt(positive).ok, false, 'CPU is never production evidence');
        assert.equal(validateAttemptReceipt(positive, { allowCpuDummy: true }).ok, true);
        await assert.rejects(
            superviseAttempt({
                repo: ROOT,
                id: 'cpu-example',
                cpuCase: 'positive',
                out: positive.output.report,
                artifactDir: positive.output.artifactDir,
            }),
            /already exists/,
        );
    });
    await t.test('UI shell fixture stays explicitly CPU/DOM, never native rendering', async () => {
        const receipt = await run('ui-shell');
        assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
        assert.equal(receipt.runtimes[0].kind, 'ui-shell');
        assert.equal(receipt.runtimes[0].ready.clock, 'CPU_DUMMY_NOT_RENDERING');
        assert.equal(receipt.runtimes[0].ready.nativeEngineFrames, null);
    });
    await t.test('real synchronous esbuild finishes before worker and browser closure', async () => {
        const receipt = await run('synchronous-compiler');
        assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
        assert.equal(receipt.forced, false);
        assert.equal(receipt.events.find((event) => event.type === 'observer-start').esbuildWorkerThreads, '0');
        for (const mode of [undefined, '1']) {
            const changed = structuredClone(receipt);
            changed.events.find((event) => event.type === 'observer-start').esbuildWorkerThreads = mode;
            assert.equal(validateAttemptReceipt(changed, { allowCpuDummy: true }).ok, false);
        }
    });
    for (const cpuCase of [
        'compiler-mode-missing',
        'compiler-mode-invalid',
        'missing-browser-close',
        'missing-server-close',
        'missing-ready',
        'missing-child-ready',
        'early-child-exit',
        'wrong-child-ready',
        'missing-browser',
        'missing-server',
        'hang',
        'forced',
        'overlap',
        'late-launch',
        'worker-startup',
        'browser-nonzero',
        'stop-error',
        'orphan-descendant',
        'detached-orphan',
        'double-fork-orphan',
        'custodian-no-ack',
        'custodian-duplicate-ack',
    ]) {
        await t.test(`${cpuCase} cannot become PASS after successful cleanup`, async () => {
            const receipt = await run(
                cpuCase,
                ['orphan-descendant', 'detached-orphan', 'double-fork-orphan'].includes(cpuCase)
                    ? ['primary', 'variant:1']
                    : ['primary'],
            );
            if (['orphan-descendant', 'detached-orphan', 'double-fork-orphan'].includes(cpuCase))
                assert.equal(receipt.runtimes.length, 1, 'no next runtime before group disappearance');
            assert.equal(receipt.ok, false);
            assert.ok(receipt.errors.length > 0);
            assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true }).ok, false);
            assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false }).ok, false);
            if (['forced', 'orphan-descendant', 'detached-orphan', 'double-fork-orphan'].includes(cpuCase))
                assert.equal(receipt.forced, true);
            const observation = receipt.custody.observation;
            assert.equal(observation.final.result, 'ECHILD');
            for (const row of observation.adopted) {
                assert.ok(row.reap && row.absent, 'every adopted descendant has real waitpid and absence');
                assert.equal(fs.existsSync(`/proc/${row.pid}`), false, 'adopted exact process actually absent');
            }
            if (['detached-orphan', 'double-fork-orphan'].includes(cpuCase)) assert.ok(observation.adopted.length >= 1);
            if (['hang', 'missing-ready', 'worker-startup', 'late-launch'].includes(cpuCase))
                assert.equal(receipt.timedOut, true);
        });
    }
    await t.test('in-flight stop ACK drains before the original failed worker receipt and pipe closure', async () => {
        const receipt = await run('custodian-delayed-stop-ack');
        assert.equal(receipt.ok, false, 'a signaled worker and incomplete barrier cannot become PASS');
        assert.equal(receipt.worker.exit.signal, 'SIGTERM');
        assert.ok(receipt.errors.includes('Custody barrier remained pending at worker closure'));
        assert.ok(receipt.errors.includes('Custody IPC: collector disconnected before response'));
        assert.equal(
            receipt.events.find((row) => row.type === 'custody-request-settled' && row.phase === 'stop')?.outcome,
            'response',
        );
        const raw = receipt.custody.observation;
        assert.deepEqual(raw.errors, []);
        assert.equal(raw.innerSupervisor.exit.code, 0);
        assert.equal(raw.innerSupervisor.exit.signal, null);
        assert.equal(raw.final.result, 'ECHILD');
        const absent = raw.events.find((row) => row.type === 'cpu-worker-absent-before-ack');
        assert.ok(absent && absent.cpuOnly && absent.pid === receipt.worker.pid);
        const pending = JSON.parse(
            fs.readFileSync(path.join(base, 'custodian-delayed-stop-ack', 'pending-node-receipt.json'), 'utf8'),
        );
        assert.equal(pending.pending, true);
        assert.equal(pending.ok, false);
        assert.deepEqual(pending.worker, receipt.worker);
        assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false }).ok, false);
    });
    for (const [cpuCase, outcome] of [
        ['custodian-stop-drain-cancel', 'SIGTERM'],
        ['custodian-stop-drain-deadline', 'deadline'],
    ]) {
        await t.test(`${cpuCase} interrupts the actual finalization waiter within the original budget`, async () => {
            const receipt = await run(cpuCase);
            assert.equal(receipt.ok, false);
            assert.equal(receipt.worker.exit.signal, 'SIGTERM');
            const settled = receipt.events.find(
                (row) => row.type === 'custody-request-settled' && row.phase === 'stop',
            );
            const marker = JSON.parse(fs.readFileSync(path.join(base, cpuCase, 'cpu-drain-ready.json'), 'utf8'));
            assert.deepEqual(
                marker,
                receipt.events.find((row) => row.type === 'cpu-custody-drain-ready'),
            );
            assert.equal(settled.outcome, outcome);
            assert.ok(marker.eventId < settled.eventId, 'the waiter was already active before cancellation/deadline');
            assert.ok(settled.supervisorElapsedMs < LIMITS.finalMs);
            const raw = receipt.custody.observation;
            assert.deepEqual(raw.errors, []);
            assert.equal(raw.innerSupervisor.exit.code, 0);
            assert.equal(raw.final.result, 'ECHILD');
            assert.ok(raw.events.some((row) => row.type === 'cpu-drain-ready-observed'));
            assert.equal(
                JSON.parse(fs.readFileSync(path.join(base, cpuCase, 'pending-node-receipt.json'), 'utf8')).pending,
                true,
            );
            assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false }).ok, false);
        });
    }
    await t.test('an exited adopted child is actually reaped without forcing', async () => {
        const receipt = await run('detached-zombie');
        assert.equal(receipt.ok, true, JSON.stringify(receipt.errors));
        assert.equal(receipt.forced, false);
        assert.equal(receipt.custody.observation.adopted.length, 1);
        assert.equal(receipt.custody.observation.adopted[0].reap.rawStatus, 0);
    });
    for (const cpuCase of [
        'custodian-disabled',
        'custodian-early-exit',
        'custodian-postspawn-error',
        'custodian-pipe-eof',
    ]) {
        await t.test(`${cpuCase} fails closed and retains kernel cleanup`, async () => {
            const dir = path.join(base, cpuCase);
            const receipt = await superviseAttempt({
                repo: ROOT,
                id: 'cpu-example',
                cpuCase,
                limits: LIMITS,
                out: path.join(dir, 'collector.json'),
                artifactDir: path.join(dir, 'artifacts'),
            });
            assert.equal(receipt.ok, false);
            assert.equal(receipt.custody.observation.final.result, 'ECHILD');
            assert.ok(receipt.custody.wrapper.exit && receipt.custody.wrapper.close);
            assert.ok(receipt.custody.observation.errors.length);
            assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false }).ok, false);
        });
    }
    await t.test('clean assertion failure is preserved and cannot pass, but its closure can be audited', async () => {
        const receipt = await run('worker-nonzero');
        assert.equal(receipt.ok, false);
        assert.equal(receipt.worker.exit.code, 3);
        assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true }).ok, false);
        assert.equal(
            validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false }).ok,
            true,
            JSON.stringify(receipt.lifecycleErrors),
        );
    });
    await t.test('a detached browser leader may first be observed in its inherited process group', () => {
        assert.equal(positive?.ok, true, 'Real positive control is required before this synthetic mutation');
        const copy = () => {
            const receipt = structuredClone(positive);
            const browser = receipt.browsers[0];
            browser.spawn = receipt.events.find((row) => row.eventId === browser.spawn.eventId);
            const leader = receipt.ownedProcesses.find((row) => row.pid === browser.pid);
            leader.firstObserved = receipt.events.find((row) => row.eventId === leader.firstObserved.eventId);
            if (leader.firstObserved.eventId > browser.spawn.eventId) {
                // Synthetic read ordering only: the original raw positive is never changed.
                const spawnIndex = browser.spawn.eventId - 1;
                const observedIndex = leader.firstObserved.eventId - 1;
                assert.equal(observedIndex, spawnIndex + 1);
                for (const key of ['eventId', 'supervisorElapsedMs', 'receivedUtc']) {
                    const previous = browser.spawn[key];
                    browser.spawn[key] = leader.firstObserved[key];
                    leader.firstObserved[key] = previous;
                }
                receipt.events[spawnIndex] = leader.firstObserved;
                receipt.events[observedIndex] = browser.spawn;
            }
            leader.firstObserved.pgrp = receipt.worker.pid;
            receipt.events.find((row) => row.eventId === leader.firstObserved.eventId).pgrp = receipt.worker.pid;
            return receipt;
        };
        const withInheritedObservation = copy();
        assert.equal(validateAttemptReceipt(withInheritedObservation, { allowCpuDummy: true }).ok, true);
        assert.equal(
            validateAttemptReceipt(withInheritedObservation).ok,
            false,
            'Synthetic CPU remains non-production',
        );
        const mutations = [
            (r) => {
                r.browsers[0].spawn = null;
            },
            (r) => {
                r.browsers[0].spawn.row.namespace = 'pid:[1]';
            },
            (r) => {
                r.browsers[0].spawn.row.startTicks = '999';
            },
            (r) => {
                r.browsers[0].spawn.row.initial.pid++;
            },
            (r) => {
                r.browsers[0].spawn.row.initial.startTicks = '999';
            },
            (r) => {
                r.browsers[0].spawn.row.initial.pgrp = r.worker.pid;
            },
            (r) => {
                r.browsers[0].spawn.row.initial.ppid = r.worker.pid + 1;
            },
            (r) => {
                r.ownedProcesses.find((row) => row.pid === r.browsers[0].pid).firstObserved.eventId =
                    r.browsers[0].spawn.eventId;
            },
            (r) => {
                r.browsers[0].spawn.row.detached = false;
            },
            (r) => {
                r.browsers[0].spawn.eventId = r.ownedGroups.find(
                    (g) => g.leaderPID === r.browsers[0].pid,
                ).firstObserved.eventId;
            },
            (r) => {
                r.ownedProcesses = r.ownedProcesses.filter((row) => row.pid !== r.browsers[0].pid);
            },
            (r) => {
                const leader = r.ownedProcesses.find((row) => row.pid === r.browsers[0].pid);
                const group = r.ownedGroups.find((row) => row.leaderPID === leader.pid);
                leader.disappearance.supervisorElapsedMs = group.empty.supervisorElapsedMs + 1;
            },
        ];
        for (const mutate of mutations) {
            const receipt = copy();
            mutate(receipt);
            const checked = validateAttemptReceipt(receipt, { allowCpuDummy: true });
            assert.equal(checked.ok, false);
            assert.ok(
                checked.errors.includes('owned process group leader proof missing'),
                JSON.stringify(checked.errors),
            );
        }
    });
    await t.test('tampered rows, dropped receipts, reset startup budget and modes are rejected independently', () => {
        assert.equal(positive?.ok, true, 'Positive control must close both runtimes before mutation testing');
        const mutations = [
            (r) => {
                r.custody.observation.events[0].utc = 'invalid';
            },
            (r) => {
                r.custody.observation.startedAt = 'invalid';
            },
            (r) => {
                r.custody.wrapper.close.utc = 'invalid';
            },
            (r) => {
                r.custody.observation.final = null;
            },
            (r) => {
                r.custody.observation.restored = null;
            },
            (r) => {
                r.custody.wrapper.close = null;
            },
            (r) => {
                r.custody.observation.barriers[0].phase = 'bogus';
            },
            (r) => {
                r.custody.observation.barriers.push(r.custody.observation.barriers[0]);
            },
            (r) => {
                r.custody.observation.innerSupervisor.stdoutEOF = null;
            },
            (r) => {
                r.custody.observation.innerSupervisor.stderrEOF = null;
            },
            (r) => {
                r.custody.observation.parentDeath.observed = 0;
            },
            (r) => {
                r.pending = true;
            },
            (r) => {
                r.browsers[0].close = null;
            },
            (r) => {
                r.servers[0].close = null;
            },
            (r) => {
                r.runtimes[0].ready = null;
            },
            (r) => {
                r.browsers[0].startTicks = '999';
            },
            (r) => {
                r.browsers[0].namespace = 'other';
            },
            (r) => {
                r.worker.exit = null;
            },
            (r) => {
                r.worker.close = null;
            },
            (r) => {
                r.forced = true;
            },
            (r) => {
                r.timedOut = true;
            },
            (r) => {
                r.noOwnedProcesses = false;
            },
            (r) => {
                r.runtimes[1].mode = 'primary';
            },
            (r) => {
                r.runtimes[0].ready.supervisorElapsedMs = r.limits.startupMs + 1;
            },
            (r) => {
                r.runtimes[0].ready.clock = 'NATIVE_PACER_EVENT_AFTER_DRAW';
            },
            (r) => {
                r.servers[0].ownerPID += 1;
            },
            (r) => {
                r.errors.push('prior failure retained');
            },
            (r) => {
                r.ownedProcesses[0].disappearance = null;
            },
            (r) => {
                r.ownedGroups[0].empty = null;
            },
            (r) => {
                r.command.args.push('--ids=second-case');
            },
            (r) => {
                r.ownedGroups = r.ownedGroups.filter((row) => row.leaderPID === r.worker.pid);
            },
            (r) => {
                r.ownedGroups = r.ownedGroups.filter((row) => row.leaderPID !== r.worker.pid);
            },
            (r) => {
                r.ownedProcesses.push(structuredClone(r.ownedProcesses[0]));
            },
            (r) => {
                r.startedAt = '2099-01-01T00:00:00.000Z';
                r.endedAt = '2099-01-01T00:01:00.000Z';
            },
        ];
        for (const mutate of mutations) {
            const candidate = structuredClone(positive);
            mutate(candidate);
            candidate.ok = true;
            assert.equal(validateAttemptReceipt(candidate, { allowCpuDummy: true }).ok, false);
        }
    });
    fs.writeFileSync(path.join(base, 'cpu-summary.json'), JSON.stringify(summaries, null, 2) + '\n', { flag: 'wx' });
    console.log(`CPU receipts: ${base}`);
});
test('limits cannot become an unbounded campaign worker', () => {
    assert.throws(() => limitsOf({ finalMs: 43200000 }), /1..139000/);
    assert.throws(() => limitsOf({ startupMs: 16000 }), /1..15000/);
    assert.throws(() => limitsOf({ abortMs: 119000 }), /Deadline order/);
});

test('original orchestrator startup budget cannot reset at worker spawn', async () => {
    const dir = path.join(base, 'expired-startup');
    await assert.rejects(
        superviseAttempt({
            repo: ROOT,
            id: 'cpu-example',
            cpuCase: 'positive',
            out: path.join(dir, 'collector.json'),
            artifactDir: path.join(dir, 'artifacts'),
            limits: LIMITS,
            startedAt: Date.now() - LIMITS.startupMs - 10,
        }),
        /startup budget exhausted/,
    );
    assert.equal(fs.existsSync(path.join(dir, 'worker.stdout.log')), false, 'worker was never spawned');
    const delayed = path.join(base, 'delayed-startup');
    const receipt = await superviseAttempt({
        repo: ROOT,
        id: 'cpu-example',
        cpuCase: 'worker-startup',
        out: path.join(delayed, 'collector.json'),
        artifactDir: path.join(delayed, 'artifacts'),
        limits: LIMITS,
        startedAt: new Date(Date.now() - 300).toISOString(),
    });
    assert.equal(receipt.ok, false);
    assert.equal(receipt.timedOut, true);
    assert.ok(receipt.elapsedBeforeSpawnMs >= 300);
    assert.ok(receipt.worker.close.supervisorElapsedMs < LIMITS.startupMs + 200);
});

test('malformed untrusted receipts fail closed without throwing', () => {
    for (const value of [null, {}, { command: { args: [null] } }, { events: [null] }]) {
        assert.equal(validateAttemptReceipt(value).ok, false);
    }
});

test('concurrent callers cannot launch a second worker before actual closure', async () => {
    const options = (name) => ({
        repo: ROOT,
        id: 'cpu-example',
        cpuCase: 'positive',
        limits: LIMITS,
        out: path.join(base, name, 'collector.json'),
        artifactDir: path.join(base, name, 'artifacts'),
    });
    const first = superviseAttempt(options('concurrent-first'));
    await assert.rejects(superviseAttempt(options('concurrent-second')), /not physically closed/);
    const receipt = await first;
    assert.equal(receipt.ok, true);
    assert.equal(
        validateAttemptReceipt(receipt, {
            allowCpuDummy: true,
            expectedViewports: { primary: { width: 480, height: 360 } },
        }).ok,
        true,
    );
    assert.equal(
        validateAttemptReceipt(receipt, {
            allowCpuDummy: true,
            expectedViewports: { primary: { width: 999, height: 360 } },
        }).ok,
        false,
    );
});

test('outer cancellation and parent death retain subreaper cleanup', async (t) => {
    const { spawn } = require('node:child_process');
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    async function until(check, ms = 4500) {
        const deadline = Date.now() + ms;
        while (!check()) {
            if (Date.now() >= deadline) throw Error('CPU parent-death control deadline');
            await pause(10);
        }
    }
    for (const control of ['SIGTERM', 'SIGKILL', 'late-SIGTERM']) {
        const signal = control === 'late-SIGTERM' ? 'SIGTERM' : control;
        await t.test(`${control} of the original outer caller cannot orphan descendants`, async () => {
            const directory = path.join(base, `outer-${control}`);
            const options = {
                repo: ROOT,
                id: 'cpu-example',
                cpuCase: 'hang',
                limits: {
                    startupMs: 1200,
                    closeMs: 500,
                    innerMs: 3000,
                    abortMs: 3500,
                    forceMs: 4000,
                    finalMs: 4500,
                },
                out: path.join(directory, 'collector.json'),
                artifactDir: path.join(directory, 'artifacts'),
            };
            const outer = spawn(
                process.execPath,
                [
                    '-e',
                    `require(${JSON.stringify(require.resolve('./example-evidence-supervisor.cjs'))})
                .superviseAttempt(${JSON.stringify(options)}).then(r => console.log(r.ok)).catch(e => { console.error(e); process.exitCode = 2; });`,
                ],
                { stdio: ['ignore', 'pipe', 'pipe'] },
            );
            outer.stdout.resume();
            outer.stderr.resume();
            const closed = new Promise((resolve) => outer.once('close', resolve));
            const journal = path.join(directory, 'custodian.events.jsonl');
            await until(
                () => fs.existsSync(journal) && fs.readFileSync(journal, 'utf8').includes('runtime-custody-barrier'),
            );
            await pause(75);
            if (control === 'late-SIGTERM') {
                const events = fs.readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
                const inner = events.find((event) => event.type === 'inner-supervisor-spawn').identity;
                const barrier = events.find((event) => event.type === 'runtime-custody-barrier');
                const exactSignal = (pid, startTicks) => {
                    const rawStat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
                    assert.equal(rawStat.slice(rawStat.lastIndexOf(')') + 2).split(' ')[19], startTicks);
                    process.kill(pid, 'SIGSTOP');
                };
                exactSignal(inner.pid, inner.startTicks);
                exactSignal(barrier.workerPID, barrier.workerStartTicks);
                const config = JSON.parse(fs.readFileSync(path.join(directory, 'custodian-request.json')));
                await pause(Math.max(1, Date.parse(config.startedAt) + options.limits.forceMs - 75 - Date.now()));
            }
            outer.kill(signal);
            await closed;
            const rawPath = path.join(directory, 'custodian-observations.json');
            await until(() => fs.existsSync(rawPath));
            const raw = JSON.parse(fs.readFileSync(rawPath));
            assert.equal(raw.final.result, 'ECHILD');
            assert.ok(raw.errors.length > 0);
            assert.equal(raw.forced, true);
            assert.ok(raw.innerSupervisor.exit && raw.innerSupervisor.stdoutEOF && raw.innerSupervisor.stderrEOF);
            for (const row of [raw.innerSupervisor, ...raw.adopted]) {
                assert.equal(fs.existsSync(`/proc/${row.pid}`), false, 'original exact descendant is absent');
            }
            if (signal === 'SIGTERM') {
                const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'attempt-receipt.json')));
                assert.equal(receipt.ok, false);
                assert.ok(receipt.custody.wrapper.exit && receipt.custody.wrapper.close);
            } else {
                assert.equal(
                    fs.existsSync(path.join(directory, 'attempt-receipt.json')),
                    false,
                    'dead caller cannot seal PASS',
                );
            }
        });
    }
});

test('a killed custodian cannot issue a final closure or release the same caller for another worker', async () => {
    const { spawn } = require('node:child_process');
    const directory = path.join(base, 'custodian-killed');
    const options = {
        repo: ROOT,
        id: 'cpu-example',
        cpuCase: 'custodian-killed',
        limits: LIMITS,
        out: path.join(directory, 'collector.json'),
        artifactDir: path.join(directory, 'artifacts'),
    };
    const script = `const {superviseAttempt}=require(${JSON.stringify(require.resolve('./example-evidence-supervisor.cjs'))});
        (async () => { const r=await superviseAttempt(${JSON.stringify(options)});
        let blocked=false; try { await superviseAttempt(${JSON.stringify(options)}); } catch(e) { blocked=/not physically closed/.test(e.message); }
        if(r.ok || !blocked) process.exitCode=3; })().catch(e=>{console.error(e);process.exitCode=2;});`;
    const outer = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    outer.stdout.resume();
    outer.stderr.resume();
    const code = await new Promise((resolve) => outer.once('close', resolve));
    assert.equal(code, 0);
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'attempt-receipt.json')));
    assert.equal(receipt.ok, false);
    assert.equal(receipt.noOwnedProcesses, false);
    assert.equal(receipt.custody.wrapper.exit.signal, 'SIGKILL');
    assert.equal(receipt.custody.wrapper.close.signal, 'SIGKILL');
    assert.equal(receipt.custody.observation, null);
    assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false }).ok, false);
});

test('late-stop request identity controls run the Python protocol negatives before evidence collection', () => {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync('python3', ['-B', path.join(__dirname, 'example-evidence-custodian.test.py')], {
        encoding: 'utf8',
        timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Ran 11 tests/);
    console.log(result.stderr.trim());
});

test('late-stop responses bind rejection to the active request and cannot reopen a settled drain', () => {
    const { validCustodyResponse } = require('./example-evidence-supervisor.cjs');
    const pending = {
        requestId: 2,
        runtimeId: 'runtime-1',
        phase: 'stop',
        workerPID: 101,
        workerStartTicks: '100',
        namespace: 'pid:[1]',
    };
    const start = { ...pending, requestId: 1, phase: 'start', eventId: 5 };
    const response = {
        ...pending,
        token: 'private-token',
        custodianPID: 99,
        eventId: 9,
        ok: false,
        rejection: 'worker-absent',
        startEventId: 5,
    };
    const valid = (value, wait = pending, accepted = start) =>
        validCustodyResponse(value, wait, 'private-token', 99, accepted);
    assert.equal(valid(response), true);
    assert.equal(valid({ ...response, rejection: 'worker-identity-mismatch' }), true);
    assert.equal(valid({ ...response, rejection: 'worker-exited' }), true);
    for (const change of [
        { token: 'wrong' },
        { requestId: 3 },
        { runtimeId: 'runtime-2' },
        { phase: 'start' },
        { custodianPID: 88 },
        { eventId: 5 },
        { eventId: 0 },
        { ok: true },
        { rejection: 'unknown' },
        { startEventId: 4 },
        { workerPID: 102 },
        { workerStartTicks: '101' },
        { namespace: 'pid:[2]' },
    ])
        assert.equal(valid({ ...response, ...change }), false, JSON.stringify(change));
    for (const malformed of [null, [], 1, 'response', false]) assert.equal(valid(malformed), false);
    assert.equal(valid(response, null), false, 'late/duplicate/cancelled responses never reopen the pending wait');
    assert.equal(valid(response, pending, null), false);
    assert.equal(valid(response, pending, { ...start, requestId: 0 }), false);
    assert.equal(valid(response, pending, { ...start, runtimeId: 'runtime-0' }), false);
});

test('late-stop rejection keeps failed originals and cancellation bounded by the original deadline', async (t) => {
    for (const [cpuCase, outcome] of [
        ['custodian-late-stop', 'rejected-response'],
        ['custodian-late-stop-cancel', 'SIGTERM'],
        ['custodian-late-stop-deadline', 'deadline'],
    ]) {
        await t.test(cpuCase, async () => {
            const receipt = await run(cpuCase);
            const raw = receipt.custody.observation;
            assert.equal(receipt.ok, false);
            assert.equal(receipt.forced, false);
            assert.equal(receipt.worker.exit.signal, 'SIGTERM');
            assert.deepEqual(raw.errors, ['Barrier stop rejected: collector worker is not the exact current process']);
            assert.equal(raw.innerSupervisor.exit.code, 0);
            assert.equal(raw.innerSupervisor.exit.signal, null);
            assert.equal(raw.final.result, 'ECHILD');
            assert.equal(receipt.custody.wrapper.exit.code, 1);
            assert.equal(receipt.custody.wrapper.close.code, 1);
            assert.equal(raw.barriers.length, 1, 'the rejected stop is never a successful barrier');
            const proof = raw.events.find((row) => row.type === 'runtime-custody-rejection');
            assert.ok(proof);
            assert.equal(proof.ok, false);
            assert.equal(proof.reason, 'worker-absent');
            assert.equal(proof.currentState, 'ABSENT');
            assert.equal(proof.currentPeer, null);
            assert.equal(proof.startEventId, raw.barriers[0].eventId);
            assert.equal(proof.requestId, raw.barriers[0].requestId + 1);
            assert.equal(proof.workerPID, receipt.worker.pid);
            assert.equal(proof.workerStartTicks, receipt.worker.startTicks);
            assert.equal(proof.namespace, receipt.worker.namespace);
            assert.equal(proof.runtimeId, raw.barriers[0].runtimeId);
            assert.ok(raw.barriers[0].elapsedMs < proof.elapsedMs);
            const settled = receipt.events.find(
                (row) => row.type === 'custody-request-settled' && row.phase === 'stop',
            );
            assert.equal(settled.outcome, outcome);
            assert.ok(receipt.worker.close.eventId < settled.eventId);
            assert.ok(settled.supervisorElapsedMs < LIMITS.finalMs);
            assert.ok(receipt.custody.wrapper.close.elapsedMs < LIMITS.finalMs);
            assert.equal(
                receipt.events.some((row) => row.type === 'custody-barrier-ack' && row.phase === 'stop'),
                false,
            );
            const rejection = receipt.events.filter((row) => row.type === 'custody-barrier-rejected');
            assert.equal(rejection.length, outcome === 'rejected-response' ? 1 : 0);
            if (rejection.length) {
                assert.equal(rejection[0].custodyEventId, proof.eventId);
                assert.equal(rejection[0].startEventId, proof.startEventId);
                assert.ok(rejection[0].eventId < settled.eventId);
                assert.ok(receipt.errors.includes('Custody IPC: kernel barrier rejected'));
            }
            const { validateCustodyArtifacts } = require('./example-evidence-supervisor.cjs');
            const artifacts = Object.fromEntries(
                Object.entries(receipt.custody.artifacts).map(([role, ref]) => {
                    const bytes = fs.readFileSync(ref.path);
                    return [role, ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(bytes) : bytes];
                }),
            );
            assert.equal(artifacts.nodeReceipt.pending, true);
            assert.equal(artifacts.nodeReceipt.ok, false);
            assert.equal(validateCustodyArtifacts(receipt, artifacts).ok, true);
            assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false }).ok, false);
        });
    }
});

function abortFixtureIO(rows) {
    let index = 0;
    return {
        readFileSync() {
            const row = rows[index];
            if (row instanceof Error) throw row;
            return `${row.pid} (node) ${[row.state, row.ppid, row.pgrp, ...Array(16).fill('0'), row.startTicks].join(' ')}\n`;
        },
        readlinkSync() {
            return rows[index++].namespace;
        },
    };
}
const abortWorkerTuple = { pid: 321, startTicks: '123', namespace: 'pid:[1]', ppid: 123, pgrp: 321 };
function abortObservation(state = 'R') {
    const row = { ...abortWorkerTuple, state };
    return { status: ['Z', 'X'].includes(state) ? 'TERMINAL' : 'LIVE', before: { ...row }, after: { ...row } };
}

test('abort IPC terminal observations require two exact reads and never turn UNKNOWN into exit', () => {
    const { observeAbortWorker } = require('./example-evidence-supervisor.cjs');
    const read = (a, b) => observeAbortWorker(abortWorkerTuple, abortFixtureIO([a, b]));
    const inheritedGroup = { ...abortWorkerTuple, pgrp: 88 };
    assert.equal(
        observeAbortWorker(
            inheritedGroup,
            abortFixtureIO([
                { ...abortWorkerTuple, state: 'R' },
                { ...abortWorkerTuple, state: 'Z' },
            ]),
        ).status,
        'TERMINAL',
        'initial inherited group does not replace two exact current group observations',
    );
    for (const [a, b, status] of [
        ['R', 'R', 'LIVE'],
        ['R', 'Z', 'TERMINAL'],
        ['Z', 'X', 'TERMINAL'],
        ['Z', 'R', 'UNKNOWN'],
    ]) {
        const value = read({ ...abortWorkerTuple, state: a }, { ...abortWorkerTuple, state: b });
        assert.equal(value.status, status);
        assert.equal(value.before.state, a);
        assert.equal(value.after.state, b);
    }
    for (const key of ['pid', 'startTicks', 'namespace', 'ppid', 'pgrp', 'state']) {
        const changed = {
            ...abortWorkerTuple,
            state: 'Z',
            [key]: key === 'state' ? '?' : key === 'startTicks' ? '999' : key === 'namespace' ? 'pid:[2]' : 999,
        };
        assert.equal(read({ ...abortWorkerTuple, state: 'R' }, changed).status, 'UNKNOWN', key);
    }
    for (const code of ['ENOENT', 'ESRCH', 'EPERM', 'EACCES', 'EIO']) {
        const error = Object.assign(Error(code), { code });
        assert.equal(read(error, error).status, 'UNKNOWN');
        assert.equal(read({ ...abortWorkerTuple, state: 'R' }, error).status, 'UNKNOWN');
    }
    for (const value of [null, '', 'broken stat', '321 (node) Z -1 oops']) {
        const io = { readFileSync: () => value, readlinkSync: () => 'pid:[1]' };
        assert.equal(observeAbortWorker(abortWorkerTuple, io).status, 'UNKNOWN');
    }
});

function abortDeliveryHarness({
    state = 'R',
    closed = false,
    connected = true,
    throwing = null,
    synchronousReply = false,
    observeTime = null,
    startTime = 10,
} = {}) {
    const { deliverWorkerAbort } = require('./example-evidence-supervisor.cjs');
    const events = [],
        errors = [];
    let callback,
        scheduled,
        time = startTime,
        reads = 0,
        sends = 0;
    const child = {
        pid: 321,
        connected,
        send(message, done) {
            sends++;
            callback = done;
            if (synchronousReply) done(null);
            if (throwing) throw throwing;
        },
    };
    const worker = {
        ...abortWorkerTuple,
        initial: { ...abortWorkerTuple },
        exit: closed ? { eventId: 1 } : null,
        close: null,
    };
    const event = (type, data) => {
        const row = { type, ...data, eventId: events.length + 1, supervisorElapsedMs: time };
        events.push(row);
        return row;
    };
    const abort = event('abort-request', { reason: 'root failure' });
    const delivery = deliverWorkerAbort({
        child,
        worker,
        abort,
        event,
        fail: (reason) => errors.push(reason),
        closure: () => worker,
        observe: () => {
            reads++;
            if (observeTime !== null) time = observeTime;
            return state === 'UNKNOWN' ? { status: 'UNKNOWN', before: null, after: null } : abortObservation(state);
        },
        now: () => time,
        deadline: 30,
        schedule: (fn, delay) => {
            scheduled = { fn, delay };
            return 1;
        },
        unschedule() {},
    });
    return {
        child,
        worker,
        events,
        errors,
        delivery,
        get sends() {
            return sends;
        },
        get reads() {
            return reads;
        },
        reply: (error) => callback(error),
        expire: () => scheduled.fn(),
        setTime: (value) => {
            time = value;
        },
        setState: (value) => {
            state = value;
        },
        get delay() {
            return scheduled?.delay;
        },
    };
}

test('abort IPC delivery binds the target, drains callbacks and keeps every error fail-closed', async () => {
    const epipe = () => Object.assign(Error('write EPIPE'), { code: 'EPIPE' });
    for (const startTime of [30, 31]) {
        const h = abortDeliveryHarness({ startTime });
        await h.delivery.drained;
        assert.equal(h.sends, 0);
        assert.equal(h.reads, 0);
        assert.equal(h.delay, undefined);
        assert.equal(h.events.at(-1).reason, 'deadline-expired');
        assert.deepEqual(h.errors, ['abort IPC did not settle: deadline']);
    }
    const observedLate = abortDeliveryHarness({ observeTime: 30 });
    await observedLate.delivery.drained;
    assert.equal(observedLate.sends, 0);
    assert.equal(observedLate.events.at(-1).reason, 'deadline-expired');
    const callbackThenThrow = abortDeliveryHarness({ synchronousReply: true, throwing: epipe() });
    await callbackThenThrow.delivery.drained;
    assert.ok(callbackThenThrow.errors.includes('abort IPC result after settlement'));
    assert.ok(callbackThenThrow.errors.includes('abort IPC send failed: Error: write EPIPE'));
    for (const options of [{ closed: true }, { state: 'Z' }, { state: 'X' }, { connected: false }]) {
        const h = abortDeliveryHarness(options);
        await h.delivery.drained;
        assert.equal(h.sends, 0);
        assert.equal(h.events.at(-1).type, 'abort-ipc-skipped');
    }
    for (const state of ['R', 'UNKNOWN']) {
        const h = abortDeliveryHarness({ state });
        assert.equal(h.sends, 1);
        assert.equal(h.delay, 20);
        h.reply(epipe());
        await h.delivery.drained;
        assert.deepEqual(h.errors, ['abort IPC send failed: Error: write EPIPE']);
        assert.equal(h.events.at(-1).observation.status, state === 'R' ? 'LIVE' : state);
        assert.equal(h.events.at(-1).outcome, 'callback');
        assert.equal(h.events.at(-1).sendEventId, h.events[1].eventId);
        h.reply(epipe());
        assert.ok(h.errors.includes('abort IPC result after settlement'));
        h.delivery.seal();
        const saved = JSON.stringify(h.events);
        h.reply(epipe());
        assert.equal(JSON.stringify(h.events), saved);
    }
    for (const outcome of ['deadline', 'SIGTERM', 'SIGINT', 'final-deadline']) {
        const h = abortDeliveryHarness();
        let drained = false;
        h.delivery.drained.then(() => {
            drained = true;
        });
        await Promise.resolve();
        assert.equal(drained, false);
        if (outcome === 'deadline') h.expire();
        else h.delivery.cancel(outcome);
        await h.delivery.drained;
        assert.equal(h.events.at(-1).outcome, outcome);
        assert.ok(h.errors.includes(`abort IPC did not settle: ${outcome}`));
        h.delivery.seal();
        const saved = JSON.stringify(h.events);
        h.reply(epipe());
        assert.equal(JSON.stringify(h.events), saved);
    }
    const late = abortDeliveryHarness();
    late.setTime(30);
    late.reply(epipe());
    await late.delivery.drained;
    assert.equal(late.events.at(-1).outcome, 'deadline');
    for (const code of ['EPIPE', 'EIO', 'ERR_IPC_CHANNEL_CLOSED']) {
        const error = Object.assign(Error(code === 'EPIPE' ? 'write EPIPE' : code), { code });
        const h = abortDeliveryHarness({ throwing: error });
        await h.delivery.drained;
        assert.equal(h.events.at(-1).outcome, 'throw');
        assert.ok(h.errors.length >= 2);
    }
    const exited = abortDeliveryHarness();
    exited.worker.exit = { eventId: 50 };
    exited.reply(epipe());
    await exited.delivery.drained;
    assert.equal(exited.events.at(-1).workerExitEventId, 50);
    const terminal = abortDeliveryHarness();
    terminal.setState('Z');
    terminal.reply(epipe());
    await terminal.delivery.drained;
    assert.equal(terminal.events.at(-1).observation.status, 'TERMINAL');
    const drift = abortDeliveryHarness();
    drift.child.pid++;
    drift.reply(epipe());
    await drift.delivery.drained;
    assert.notEqual(drift.events.at(-1).childPID, drift.events.at(-1).workerPID);
});

test(
    'abort IPC real Node exit race skips terminal children before their exit event is consumed',
    { timeout: 10000 },
    async () => {
        const { spawn } = require('node:child_process');
        const { once } = require('node:events');
        const { observeAbortWorker, deliverWorkerAbort } = require('./example-evidence-supervisor.cjs');
        const child = spawn(process.execPath, ['-e', 'process.send("ready"); setTimeout(() => process.exit(7), 50)'], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        const closed = once(child, 'close');
        let exit = null,
            close = null,
            sends = 0;
        child.once('exit', (code, signal) => {
            exit = { eventId: 100, code, signal };
        });
        child.once('close', (code, signal) => {
            close = { eventId: 101, code, signal };
        });
        const raw = fs.readFileSync(`/proc/${child.pid}/stat`, 'utf8');
        const fields = raw
            .slice(raw.lastIndexOf(')') + 2)
            .trim()
            .split(' ');
        const tuple = {
            pid: child.pid,
            startTicks: fields[19],
            namespace: fs.readlinkSync(`/proc/${child.pid}/ns/pid`),
            ppid: Number(fields[1]),
            pgrp: Number(fields[2]),
        };
        const worker = { ...tuple, initial: { ...tuple } };
        const originalSend = child.send.bind(child);
        child.send = (...args) => {
            sends++;
            return originalSend(...args);
        };
        const events = [],
            errors = [];
        try {
            await once(child, 'message');
            const deadline = performance.now() + 2000;
            while (observeAbortWorker(tuple).status !== 'TERMINAL' && performance.now() < deadline)
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
            assert.equal(exit, null, 'same ChildProcess exit callback has deliberately not been consumed yet');
            assert.equal(observeAbortWorker(tuple).status, 'TERMINAL');
            const delivery = deliverWorkerAbort({
                child,
                worker,
                abort: { eventId: 1, reason: 'CPU root failure' },
                event: (type, data) => {
                    const row = { type, ...data, eventId: events.length + 2 };
                    events.push(row);
                    return row;
                },
                fail: (reason) => errors.push(reason),
                closure: () => ({ exit, close }),
                now: () => performance.now(),
                deadline,
            });
            await delivery.drained;
            assert.equal(sends, 0);
            assert.equal(events[0].reason, 'worker-exited');
            assert.deepEqual(errors, []);
            assert.deepEqual(await closed, [7, null]);
            assert.equal(exit.code, 7);
            assert.equal(close.code, 7);
            assert.equal(fs.existsSync(`/proc/${child.pid}`), false);
        } finally {
            if (!close) child.kill('SIGKILL');
            await closed;
        }
    },
);

test(
    'abort IPC real closed peer reports asynchronous EPIPE while its worker is still alive',
    { timeout: 10000 },
    async () => {
        const { spawn } = require('node:child_process');
        const { once } = require('node:events');
        const { observeAbortWorker, deliverWorkerAbort } = require('./example-evidence-supervisor.cjs');
        const directory = fs.mkdtempSync(path.join(base, 'abort-peer-'));
        const disconnected = path.join(directory, 'disconnected'),
            release = path.join(directory, 'release');
        const child = spawn(
            process.execPath,
            [
                '-e',
                'const fs = require("fs"); process.send("ready", () => { process.disconnect(); fs.writeFileSync(process.argv[1], "closed"); setInterval(() => { if(fs.existsSync(process.argv[2])) process.exit(7); }, 5); setTimeout(() => process.exit(99), 4000); });',
                disconnected,
                release,
            ],
            { detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
        );
        const closed = once(child, 'close');
        let exit = null,
            close = null;
        child.once('exit', (code, signal) => {
            exit = { eventId: 100, code, signal };
        });
        child.once('close', (code, signal) => {
            close = { eventId: 101, code, signal };
        });
        const raw = fs.readFileSync(`/proc/${child.pid}/stat`, 'utf8');
        const fields = raw
            .slice(raw.lastIndexOf(')') + 2)
            .trim()
            .split(' ');
        const tuple = {
            pid: child.pid,
            startTicks: fields[19],
            namespace: fs.readlinkSync(`/proc/${child.pid}/ns/pid`),
            ppid: Number(fields[1]),
            pgrp: Number(fields[2]),
        };
        const events = [],
            errors = [];
        try {
            await once(child, 'message');
            // The peer confirms its disconnect but remains alive until the result is inspected.
            const deadline = performance.now() + 2000;
            while (!fs.existsSync(disconnected) && performance.now() < deadline)
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
            assert.equal(fs.existsSync(disconnected), true);
            assert.equal(child.connected, true);
            assert.equal(observeAbortWorker(tuple).status, 'LIVE');
            const delivery = deliverWorkerAbort({
                child,
                worker: { ...tuple, initial: { ...tuple } },
                abort: { eventId: 1, reason: 'CPU root failure' },
                event: (type, data) => {
                    const row = { type, ...data, eventId: events.length + 2 };
                    events.push(row);
                    return row;
                },
                fail: (reason) => errors.push(reason),
                closure: () => ({ exit, close }),
                now: () => performance.now(),
                deadline: performance.now() + 2000,
            });
            await delivery.drained;
            assert.deepEqual(
                events.map((e) => e.type),
                ['abort-ipc-send', 'abort-ipc-result'],
            );
            assert.equal(events[1].outcome, 'callback');
            assert.equal(events[1].errorCode, 'EPIPE');
            assert.equal(events[1].workerExitEventId, null);
            assert.equal(events[1].observation.status, 'LIVE');
            assert.deepEqual(errors, ['abort IPC send failed: Error: write EPIPE']);
            fs.writeFileSync(release, 'release', { flag: 'wx' });
            assert.deepEqual(await closed, [7, null]);
            assert.equal(fs.existsSync(`/proc/${child.pid}`), false);
        } finally {
            if (!close) child.kill('SIGKILL');
            await closed;
        }
    },
);

test('abort IPC finish keeps custody and delivery drains interruptible at the original final deadline', async () => {
    const vm = require('node:vm');
    const source = fs.readFileSync(path.join(__dirname, 'example-evidence-supervisor.cjs'), 'utf8');
    const finishSource = source.slice(
        source.indexOf('    async function finish(atDeadline'),
        source.indexOf('    const interrupted ='),
    );
    const interruptSource = source.slice(
        source.indexOf('    const interrupted ='),
        source.indexOf('    const onInterrupt ='),
    );
    for (const outcome of ['final-deadline', 'SIGTERM', 'SIGINT']) {
        const order = [];
        let resolveCustody, resolveAbort;
        const context = {
            finished: false,
            finishing: false,
            cpuCase: null,
            receipt: {},
            fail: (reason) => order.push(reason),
            requestAbort: (reason) => order.push(reason),
            custodyPending: {
                drained: new Promise((done) => {
                    resolveCustody = done;
                }),
            },
            abortDelivery: {
                drained: new Promise((done) => {
                    resolveAbort = done;
                }),
                cancel: (value) => {
                    order.push(`abort:${value}`);
                    resolveAbort();
                },
            },
            scanOwned: () => {
                order.push('finalizing');
                throw Error('controlled finalization boundary');
            },
        };
        context.settleCustody = (pending, value) => {
            assert.ok(pending);
            order.push(`custody:${value}`);
            context.custodyPending = null;
            resolveCustody();
        };
        vm.createContext(context);
        vm.runInContext(
            finishSource + interruptSource + '\nthis.finish = finish; this.interrupted = interrupted;',
            context,
        );
        const finishing = context.finish();
        const checked = assert.rejects(finishing, /controlled finalization boundary/);
        await Promise.resolve();
        assert.deepEqual(order, ['Custody barrier remained pending at worker closure']);
        if (outcome === 'final-deadline') await context.finish(true);
        else context.interrupted(outcome);
        await checked;
        assert.ok(order.includes(`custody:${outcome}`));
        assert.ok(order.includes(`abort:${outcome}`));
        assert.equal(order.at(-1), 'finalizing');
        assert.ok(order.indexOf(`abort:${outcome}`) < order.indexOf('finalizing'));
    }
});
