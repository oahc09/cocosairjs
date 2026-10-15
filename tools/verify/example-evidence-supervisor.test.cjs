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
