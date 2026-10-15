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
    assert.match(result.stderr, /Ran 8 tests/);
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
