'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createParser,
    correlate: correlateRaw,
    knownCpuSender,
    buildCommand,
    traceArgs,
    createDiagnosticBudget,
    emptyTraceAllowed,
    SYSCALLS,
    TRACE_SYSCALLS,
    BOUNDS,
} = require('./example-evidence-shutdown-trace.cjs');

// Pure synthetic envelope/flow fixtures only. These never launch a browser or become evidence.
function targetDiagnosticFixture() {
    const fs = require('node:fs'),
        os = require('node:os'),
        path = require('node:path');
    const protocol = require('./example-evidence-campaign.cjs');
    const fixture = require('./example-evidence-campaign.cpu-fixture.cjs');
    const supervisor = require('./example-evidence-supervisor.cjs');
    const runner = require('./run-example-shutdown-target.cjs');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shutdown-target-synthetic-'));
    const browser = path.join(directory, 'synthetic-browser');
    fs.writeFileSync(browser, 'synthetic bytes, never executable');
    const runtimeIdentity = {
        ...structuredClone(fixture.identity),
        executablePath: browser,
        executableVersion: 'Chromium 151.0.7922.34',
        playwrightVersion: '1.62.1',
        executableSha256: protocol.fileDigest(browser).sha256,
        host: { executablePath: browser },
    };
    const inputs = [
        { path: 'tools/verify/example-evidence-custodian.py', bytes: 1, sha256: runtimeIdentity.custody.helper.sha256 },
        { path: runner.TOOL, ...protocol.fileDigest(path.join(__dirname, 'run-example-shutdown-target.cjs')) },
    ];
    const freeze = {
        schema: protocol.SCHEMAS.freeze,
        mode: protocol.MODE,
        createdAt: new Date().toISOString(),
        runtimeIdentity,
        limits: { ...supervisor.DEFAULT_LIMITS },
        inputs,
        inputDigest: protocol.objectDigest(inputs),
        scope: [
            { id: 'collector-dodge', shell: false, modes: [{ id: 'primary', viewport: { width: 480, height: 360 } }] },
        ],
    };
    const freezePath = path.join(directory, 'freeze.json');
    const writeFreeze = () => {
        delete freeze.freezeId;
        freeze.freezeId = protocol.objectDigest(freeze);
        fs.writeFileSync(freezePath, JSON.stringify(freeze));
    };
    writeFreeze();
    const options = { freezePath, out: path.join(directory, 'target-diagnostic'), executeAuthorized: true };
    const began = Date.now() - 10000;
    const state = { now: began + 10000, assertions: 0, spawns: 0, runtimeCalls: 0, postChange: null };
    const dependencies = {
        invocationStarted: began,
        now: () => state.now,
        collectRuntimeIdentity: () => {
            state.runtimeCalls++;
            const value = structuredClone(freeze.runtimeIdentity);
            if (state.postChange === 'runtime' && state.runtimeCalls > 1) value.launchArgs.push('--changed');
            return value;
        },
        assertFrozenInputs: (baseline, { runtimeIdentity: actual }) => {
            state.assertions++;
            assert.deepEqual(actual, baseline.runtimeIdentity);
            if (state.postChange === 'inputs' && state.assertions > 1) throw Error('synthetic changed input');
            if (state.postChange === 'preflight') state.now = began + 30000;
            return baseline.inputDigest;
        },
        superviseAttempt: async (call) => {
            state.spawns++;
            assert.equal(call.startedAt, began);
            assert.deepEqual(call.limits, supervisor.TARGET_DIAGNOSTIC_LIMITS);
            const receipt = fixture.makeReceipt(
                freeze.scope[0],
                { ...freeze, limits: call.limits },
                {
                    report: call.out,
                    artifactDir: call.artifactDir,
                    receipt: path.join(options.out, 'attempt-receipt.json'),
                    stdout: path.join(options.out, 'worker.stdout.log'),
                    stderr: path.join(options.out, 'worker.stderr.log'),
                },
                false,
                new Date(began).toISOString(),
            );
            receipt.cpuDummy = false;
            receipt.cpuCase = null;
            receipt.diagnosticProfile = call.diagnosticProfile;
            receipt.canonicalEligible = false;
            const observer = receipt.events.find((event) => event.type === 'observer-start');
            observer.diagnosticProfile = call.diagnosticProfile;
            observer.limits = call.limits;
            const raw = receipt.custody.observation;
            raw.diagnosticProfile = call.diagnosticProfile;
            raw.canonicalEligible = false;
            raw.events.unshift({
                type: 'diagnostic-profile',
                elapsedMs: 0,
                utc: receipt.startedAt,
                diagnosticProfile: call.diagnosticProfile,
                limits: call.limits,
            });
            raw.events.forEach((event, index) => {
                event.eventId = index + 1;
            });
            const pending = JSON.parse(fs.readFileSync(receipt.custody.artifacts.nodeReceipt.path));
            for (const key of ['cpuDummy', 'cpuCase', 'diagnosticProfile', 'canonicalEligible', 'events'])
                pending[key] = receipt[key];
            const bytes = {
                raw: Buffer.from(JSON.stringify(raw)),
                nodeReceipt: Buffer.from(JSON.stringify(pending)),
                journal: Buffer.from(raw.events.map((event) => JSON.stringify(event)).join('\n') + '\n'),
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
            };
            for (const [role, value] of Object.entries(bytes)) {
                const file = receipt.custody.artifacts[role].path;
                fs.writeFileSync(file, value);
                receipt.custody.artifacts[role] = { path: file, bytes: value.length, sha256: protocol.sha256(value) };
            }
            fs.writeFileSync(
                call.out,
                JSON.stringify({
                    completed: false,
                    partial: true,
                    results: [{ id: 'collector-dodge', result: 'PASS' }],
                }),
            );
            fs.writeFileSync(receipt.output.receipt, JSON.stringify(receipt));
            return receipt;
        },
    };
    return { fs, path, protocol, runner, supervisor, directory, freeze, writeFreeze, options, state, dependencies };
}

test('independent target on/off share only the fixed diagnostic startup profile', () => {
    const f = targetDiagnosticFixture();
    try {
        for (const trace of ['on', 'off']) {
            const command = buildCommand({ mode: 'target', trace, freeze: f.options.freezePath, out: f.directory });
            assert.equal(command.role, 'independent-shutdown-target');
            assert.ok(command.args[0].endsWith('/run-example-shutdown-target.cjs'));
            assert.deepEqual(command.limits, { ...f.supervisor.DEFAULT_LIMITS, startupMs: 30000 });
            assert.equal(command.diagnosticProfile.freezeId, f.freeze.freezeId);
            assert.equal(command.diagnosticProfile.inputDigest, f.freeze.inputDigest);
            assert.equal(command.diagnosticProfile.canonicalEligible, false);
            assert.equal(
                command.args.some((arg) => /--limits|--id|attempts|segments/.test(arg)),
                false,
            );
            assert.throws(
                () =>
                    buildCommand({
                        mode: 'target',
                        trace,
                        freeze: f.options.freezePath,
                        out: f.directory,
                        limits: f.supervisor.TARGET_DIAGNOSTIC_LIMITS,
                    }),
                /target-deadlines-cannot-be-overridden/,
            );
        }
        for (const trace of ['on', 'off'])
            assert.deepEqual(
                buildCommand({ mode: 'cpu', trace, cpuCase: 'positive', out: f.directory }).limits,
                f.supervisor.DEFAULT_LIMITS,
            );
        f.freeze.limits.startupMs = 30001;
        f.writeFreeze();
        assert.throws(() => f.runner.planTargetDiagnostic(f.options), /limits exceed contract/);
        for (const extra of ['--limits={}', '--id=alpha', '--startedAt=1', '--diagnosticProfile={}'])
            assert.throws(
                () => f.runner.parseArguments(['--freeze=x', '--out=y', '--execute-authorized', extra]),
                /unsupported-target-argument/,
            );
    } finally {
        f.fs.rmSync(f.directory, { recursive: true, force: true });
    }
});

test('synthetic target flow keeps one entry clock and preserves failed postflight originals', async () => {
    for (const change of [null, 'preflight', 'inputs', 'runtime']) {
        const f = targetDiagnosticFixture();
        try {
            f.state.postChange = change;
            if (change === 'preflight') {
                await assert.rejects(
                    f.runner.runTargetDiagnostic(f.options, f.dependencies),
                    /entry-startup-budget-exhausted/,
                );
                assert.equal(f.state.spawns, 0);
                assert.equal(f.fs.existsSync(f.options.out), false);
                continue;
            }
            const report = await f.runner.runTargetDiagnostic(f.options, f.dependencies);
            assert.equal(f.state.spawns, 1);
            assert.equal(report.status, change ? 'FAIL' : 'DIAGNOSTIC_RECORDED');
            assert.equal(report.startedAt, new Date(f.dependencies.invocationStarted).toISOString());
            assert.equal(report.canonicalEligible, false);
            assert.equal(f.fs.existsSync(f.path.join(f.options.out, 'attempt-receipt.json')), true);
            for (const name of Object.values(f.runner.FILES))
                assert.equal(f.fs.existsSync(f.path.join(f.options.out, name)), true);
            assert.equal(
                f.fs
                    .readdirSync(f.options.out)
                    .some((name) => /^(?:attempt\.json|admission\.json|segments|attempts)$/.test(name)),
                false,
            );
            assert.throws(() => f.runner.planTargetDiagnostic(f.options), /immutable-target-directory-exists/);
            const input = {
                directory: f.options.out,
                freeze: f.freeze,
                runnerSha256: f.protocol.fileDigest(f.path.join(__dirname, 'run-example-shutdown-target.cjs')).sha256,
            };
            if (change) assert.throws(() => f.runner.readTargetDiagnostic(input));
            else {
                const retained = f.runner.readTargetDiagnostic(input);
                assert.equal(retained.report.status, 'DIAGNOSTIC_RECORDED');
                assert.equal(f.supervisor.validateAttemptReceipt(retained.receipt).ok, false);
                assert.ok(
                    f.supervisor
                        .validateAttemptReceipt(retained.receipt)
                        .errors.includes('Diagnostic profile is not canonical evidence'),
                );
            }
        } finally {
            f.fs.rmSync(f.directory, { recursive: true, force: true });
        }
    }
    const f = targetDiagnosticFixture();
    try {
        await assert.rejects(
            f.runner.runTargetDiagnostic({ ...f.options, startedAt: Date.now() }, f.dependencies),
            /unsupported-target-option/,
        );
        assert.equal(f.state.spawns, 0);
    } finally {
        f.fs.rmSync(f.directory, { recursive: true, force: true });
    }
});

test('synthetic target envelope rejects grafted profiles, limits, sources, times and original paths', async () => {
    const f = targetDiagnosticFixture();
    try {
        await f.runner.runTargetDiagnostic(f.options, f.dependencies);
        const directory = f.options.out;
        const read = (name) => f.fs.readFileSync(f.path.join(directory, name));
        const receiptBytes = read('attempt-receipt.json'),
            collectorBytes = read('collector.json');
        const receipt = JSON.parse(receiptBytes),
            report = JSON.parse(read('diagnostic-target.json'));
        const artifactBytes = Object.fromEntries(
            Object.entries(f.runner.FILES).map(([role, name]) => [role, read(name)]),
        );
        const args = {
            freeze: f.freeze,
            receipt,
            receiptBytes,
            collectorBytes,
            artifactBytes,
            directory,
            runnerSha256: report.runnerSha256Before,
        };
        assert.equal(f.runner.validateTargetDiagnosticReport(report, args).ok, true);
        const plainArtifacts = Object.fromEntries(
            Object.entries(artifactBytes).map(([role, bytes]) => [
                role,
                ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(bytes) : bytes,
            ]),
        );
        assert.equal(f.supervisor.validateCustodyArtifacts(receipt, plainArtifacts).ok, false);
        const otherFreeze = structuredClone(f.freeze);
        delete otherFreeze.freezeId;
        otherFreeze.createdAt = new Date(Date.parse(otherFreeze.createdAt) + 1).toISOString();
        otherFreeze.freezeId = f.protocol.objectDigest(otherFreeze);
        assert.equal(f.runner.validateTargetDiagnosticReport(report, { ...args, freeze: otherFreeze }).ok, false);
        for (const mutate of [
            (r) => {
                delete r.diagnosticProfile;
            },
            (r) => {
                r.diagnosticProfile.freezeId = 'f'.repeat(64);
            },
            (r) => {
                r.diagnosticProfile.extra = true;
            },
            (r) => {
                r.freezeId = 'f'.repeat(64);
            },
            (r) => {
                r.inputDigestAfter = 'f'.repeat(64);
            },
            (r) => {
                r.limits.startupMs = 15000;
            },
            (r) => {
                r.limits.finalMs++;
            },
            (r) => {
                r.runnerSha256After = 'f'.repeat(64);
            },
            (r) => {
                r.runtimeIdentityAfter.launchArgs.push('--changed');
            },
            (r) => {
                r.startedAt = r.finishedAt;
            },
            (r) => {
                r.finishedAt = 'invalid';
            },
            (r) => {
                r.id = 'alpha';
            },
            (r) => {
                r.mode = 'cpu';
            },
            (r) => {
                r.originals.raw.file = '../custodian-observations.json';
            },
            (r) => {
                r.collectorResult = 'FAIL';
            },
        ]) {
            const changed = structuredClone(report);
            mutate(changed);
            assert.equal(f.runner.validateTargetDiagnosticReport(changed, args).ok, false);
        }
        for (const mutate of [
            (r) => {
                delete r.diagnosticProfile;
            },
            (r) => {
                r.limits.startupMs = 15000;
            },
            (r) => {
                r.startedAt = report.finishedAt;
            },
            (r) => {
                r.runtimes[0].kind = 'ui-shell';
            },
            (r) => {
                r.custody.artifacts.raw.path += '.elsewhere';
            },
        ]) {
            const changed = structuredClone(receipt);
            mutate(changed);
            const bytes = Buffer.from(JSON.stringify(changed));
            const bound = {
                ...report,
                receipt: { file: 'attempt-receipt.json', bytes: bytes.length, sha256: f.protocol.sha256(bytes) },
            };
            assert.equal(
                f.runner.validateTargetDiagnosticReport(bound, { ...args, receipt: changed, receiptBytes: bytes }).ok,
                false,
            );
        }
        const moved = f.path.join(f.directory, 'downloaded-target');
        f.fs.cpSync(directory, moved, { recursive: true });
        f.fs.rmSync(directory, { recursive: true });
        assert.equal(
            f.runner.readTargetDiagnostic({
                directory: moved,
                freeze: f.freeze,
                runnerSha256: report.runnerSha256Before,
            }).report.status,
            'DIAGNOSTIC_RECORDED',
        );
        const alias = f.path.join(f.directory, 'symlinked-parent');
        f.fs.symlinkSync(moved, alias);
        assert.throws(
            () =>
                f.runner.readTargetDiagnostic({
                    directory: alias,
                    freeze: f.freeze,
                    runnerSha256: report.runnerSha256Before,
                }),
            /nonregular-target-file/,
        );
        const raw = f.path.join(moved, f.runner.FILES.raw),
            copied = f.path.join(f.directory, 'copied-raw.json');
        f.fs.renameSync(raw, copied);
        f.fs.symlinkSync(copied, raw);
        assert.throws(
            () =>
                f.runner.readTargetDiagnostic({
                    directory: moved,
                    freeze: f.freeze,
                    runnerSha256: report.runnerSha256Before,
                }),
            /nonregular-target-file/,
        );
    } finally {
        f.fs.rmSync(f.directory, { recursive: true, force: true });
    }
});

test(
    'availability Node fixture stays alive until its real SIGTERM handler establishes exit 143',
    {
        skip: process.platform !== 'linux',
    },
    () => {
        const { spawnSync } = require('node:child_process');
        const command = buildCommand({ mode: 'availability', trace: 'on' });
        const oldFixture =
            'process.on("SIGTERM", () => setTimeout(() => process.exit(143), 100)); setTimeout(() => process.kill(process.pid, "SIGTERM"), 100)';
        for (const [args, expectedExit] of [
            [['-e', oldFixture], 0],
            [command.args, 143],
        ]) {
            const child = spawnSync(command.executable, args, {
                encoding: 'utf8',
                timeout: 4000,
                maxBuffer: 8192,
            });
            assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0);
            assert.equal(child.error, undefined);
            assert.equal(child.signal, null);
            assert.equal(child.status, expectedExit);
            assert.equal(child.stdout, '');
        }
    },
);

test('external deadlines count all preflight time from one monotonic entry without extending any budget', () => {
    for (const mode of ['cpu', 'target']) {
        let now = 123.25;
        const budget = createDiagnosticBudget(mode, () => now);
        assert.deepEqual(budget.limits, { termMs: 174000, killMs: 178000 });
        assert.equal(budget.startupTimeoutMs(), 2000);
        now += 1900; // version probe
        assert.equal(budget.startupTimeoutMs(), 2000);
        now += 1800; // mkfifo
        now += 400; // hashing and other setup, including work before the first probe
        budget.requireSpawnBudget();
        assert.equal(budget.elapsedMs(), 4100);
        assert.equal(budget.remainingMs('term'), 169900);
        now += 25; // registering KILL later must not extend its absolute deadline
        assert.equal(budget.remainingMs('kill'), 173875);
        now = 123.25 + 174000;
        let spawned = false;
        assert.throws(() => {
            budget.requireSpawnBudget();
            spawned = true;
        }, /diagnostic-preflight-budget-exhausted/);
        assert.equal(spawned, false);
        assert.throws(() => budget.startupTimeoutMs(), /diagnostic-preflight-budget-exhausted/);
        assert.equal(budget.remainingMs('term'), 0);
        assert.equal(budget.remainingMs('kill'), 4000);
        now += 4001;
        assert.equal(budget.remainingMs('kill'), 0);
    }
    let now = 100;
    const availability = createDiagnosticBudget('availability', () => now);
    assert.deepEqual(availability.limits, { termMs: 4000, killMs: 8000 });
    now += 2500;
    assert.equal(availability.startupTimeoutMs(), 1500);
    now += 1499.5;
    assert.equal(availability.remainingMs('term'), 0); // no rounding up beyond the entry deadline
    assert.throws(() => availability.requireSpawnBudget(), /diagnostic-preflight-budget-exhausted/);
    assert.equal(availability.remainingMs('kill'), 4000);
    now = 99;
    assert.throws(() => availability.remainingMs('kill'), /invalid-diagnostic-monotonic-clock/);
    assert.throws(() => createDiagnosticBudget('target', () => NaN), /invalid-diagnostic-monotonic-clock/);
    assert.throws(() => createDiagnosticBudget('target', () => Infinity), /invalid-diagnostic-monotonic-clock/);
    assert.throws(() => createDiagnosticBudget('unknown'), /invalid-diagnostic-budget-mode/);
});

const TEST_ROOT = { pid: 99, tgid: 99, ppid: 1, startTicks: '40', namespace: 'pid:[1]' };
const correlate = (records, identities) => correlateRaw(records, identities, TEST_ROOT);
function observation(process, thread = process) {
    const root = { pid: 99, tgid: 99, ppid: 1, startTicks: '40', namespace: 'pid:[1]' };
    process = { ...process, ppid: 99, tgid: process.pid };
    thread = { ...thread, tgid: process.pid, ppid: 99 };
    const image = { dev: 1, ino: 2, size: 3, mtimeMs: 4 };
    return {
        thread,
        process,
        threadBefore: thread,
        threadAfter: thread,
        processBefore: process,
        processAfter: process,
        root,
        doubleChecked: true,
        imageStable: true,
        imageBefore: image,
        imageAfter: image,
        frozenImage: image,
        frozenBrowserImageMatch: true,
        ownedLineage: [process, root],
        lineageAfter: [process, root],
    };
}

function parse(lines, options = {}) {
    const records = [],
        failures = [];
    const parser = createParser({
        ...options,
        onRecord: (row) => records.push(row),
        onFailure: (reason) => failures.push(reason),
    });
    const bytes = Buffer.from(lines);
    for (let i = 0; i < bytes.length; i += 7) parser.push(bytes.subarray(i, i + 7));
    return { records, failures, result: parser.finish() };
}

test('live trace selects only four signal syscalls; wait parsing is offline compatibility only', () => {
    const command = buildCommand({ mode: 'cpu', trace: 'on', cpuCase: 'positive', out: '/tmp/diagnostic' });
    const args = traceArgs('/tmp/private.fifo', command);
    assert.deepEqual(TRACE_SYSCALLS, ['kill', 'tkill', 'tgkill', 'pidfd_send_signal']);
    assert.deepEqual(
        args.filter((arg) => arg.startsWith('trace=')),
        ['trace=kill,tkill,tgkill,pidfd_send_signal'],
    );
    assert.ok(SYSCALLS.includes('wait4') && SYSCALLS.includes('waitid'));
    assert.equal(
        args.some((arg) => /wait4|waitid|execve|trace=process/.test(arg)),
        false,
    );
    assert.ok(args.includes('signal=SIGTERM,SIGKILL'));
    assert.equal(args.includes('-ff'), false);
    assert.ok(command.args[0].endsWith('/example-evidence-supervisor.cjs'));
    assert.equal(
        command.args.some((arg) => /execve|trace=process|--executable/.test(arg)),
        false,
    );
    assert.throws(() => buildCommand({ mode: 'cpu', trace: 'on', cpuCase: 'invented', out: '/tmp/x' }));
});

test('legacy manual diagnostic CPU pairs inherit shared deadlines separately from unit limits', () => {
    const fs = require('node:fs'),
        path = require('node:path');
    const { DEFAULT_LIMITS } = require('./example-evidence-supervisor.cjs');
    const expected = {
        startupMs: 30000,
        closeMs: 4000,
        innerMs: 120000,
        abortMs: 125000,
        forceMs: 133000,
        finalMs: 139000,
    };
    assert.deepEqual(DEFAULT_LIMITS, expected);
    for (const cpuCase of ['positive', 'browser-nonzero', 'custodian-delayed-stop-ack']) {
        for (const trace of ['off', 'on']) {
            const command = buildCommand({ mode: 'cpu', cpuCase, trace, out: '/tmp/default-diagnostic-pair' });
            assert.deepEqual(command.limits, expected);
            const limits = command.args.filter((arg) => arg.startsWith('--limits='));
            assert.equal(limits.length, 1);
            assert.deepEqual(JSON.parse(limits[0].slice('--limits='.length)), expected);
        }
    }
    const workflow = fs.readFileSync(
        path.join(__dirname, '../../.github/workflows/example-shutdown-diagnostic.yml'),
        'utf8',
    );
    const pair = workflow.match(
        /for control in positive browser-nonzero custodian-delayed-stop-ack; do([\s\S]*?)\n\s*matched=false/,
    );
    assert.ok(pair, 'exact required CPU pair loop must be present');
    assert.match(pair[1], /for trace in off on; do/);
    assert.doesNotMatch(pair[1], /--limits(?:=|\s)/, 'diagnostic pairs may not select the short unit deadlines');
    const commands = pair[1]
        .split('\n')
        .filter((line) => line.includes('example-evidence-shutdown-trace.cjs') && line.includes('--mode=cpu'));
    assert.equal(commands.length, 1);
    assert.match(commands[0], /--case="\$control" --trace="\$trace"/);
    const unit = fs.readFileSync(path.join(__dirname, 'example-evidence-supervisor.test.cjs'), 'utf8');
    const unitMatch = unit.match(/const LIMITS = (\{[^;]+\});/);
    assert.ok(unitMatch, 'unit tests retain their explicit bounded configuration');
    const unitLimits = require('node:vm').runInNewContext('(' + unitMatch[1] + ')');
    assert.ok(unitLimits.startupMs > 0 && unitLimits.startupMs <= DEFAULT_LIMITS.startupMs);
    assert.ok(unitLimits.startupMs < unitLimits.innerMs && unitLimits.innerMs < unitLimits.finalMs);
    assert.ok(unitLimits.finalMs <= DEFAULT_LIMITS.finalMs);
});

test('signal source and wait outcome preserve only fixed numeric/enum fields', () => {
    const data = parse(
        '101 1700000000.000001 kill(202, SIGTERM) = 0\n' +
            '202 1700000000.000002 --- SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=101, si_uid=1001} ---\n' +
            '101 1700000000.000003 wait4(202, [{WIFSIGNALED(s) && WTERMSIG(s) == SIGTERM}], WNOHANG, {ru_utime={tv_sec=0, tv_usec=123}, ru_stime={tv_sec=0, tv_usec=456}}) = 202\n' +
            '101 1700000000.000004 waitid(P_ALL, 0, 0x7ffddeadbeef, WNOHANG|WEXITED|WNOWAIT, NULL) = -1 ECHILD (No child processes)\n',
    );
    assert.equal(data.result.ok, true, JSON.stringify(data.failures));
    assert.equal(data.records[0].target, 202);
    assert.equal(data.records[1].siPid, 101);
    assert.equal(data.records[2].waitSignal, 'SIGTERM');
    assert.equal(data.records[3].errno, 'ECHILD');
    assert.doesNotMatch(JSON.stringify(data.records), /1001|deadbeef|tv_usec|ru_utime|si_uid/);
    assert.equal(data.result.rawStraceRetained, false);
});

test('official waitid clock annotations are accepted only in their unique siginfo fields and never retained', () => {
    // strace v6.8 src/util.c print_ticks and tests/clock_t_str.c, not a recovered CI raw line.
    const body =
        'waitid(P_ALL, 0, {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=202, si_uid=1001, si_status=0, si_utime=1 /* 0.01 s */, si_stime=200 /* 2.00 s */}, WNOHANG|WEXITED|WNOWAIT, NULL) = 0';
    const data = parse(`101 1700000000.000001 ${body}\n`);
    assert.equal(data.result.ok, true);
    assert.equal(data.records[0].syscall, 'waitid');
    assert.doesNotMatch(JSON.stringify(data.records), /si_utime|si_stime|1001|0\.01|2\.00|\/\*/);
    assert.equal(
        parse(
            `101 1700000000.000001 waitid(P_ALL, 0, <unfinished ...>\n101 1700000000.000002 <... waitid resumed>${body.slice('waitid(P_ALL, 0, '.length)}\n`,
        ).result.ok,
        true,
    );
    for (const mutation of [
        body.replace('0.01 s', 'PRIVATE_TOKEN'),
        body.replace('0.01 s', '-0.01 s'),
        body.replace('0.01 s', '1e3 s'),
        body.replace('0.01 s', '0.0000000001 s'),
        body.replace('si_utime=1', 'si_utime=18446744073709551616'),
        body.replace('si_utime=1', 'si_utime=0'),
        body.replace('si_utime=1', 'si_utime=1, si_utime=1'),
        body.replace('si_pid=202', 'si_pid=202 /* 0.01 s */'),
        body.replace('si_signo=SIGCHLD', 'si_signo=SIGTERM'),
        body.replace('si_code=CLD_EXITED', 'si_code=SI_USER'),
        body.replace('si_stime=200 /* 2.00 s */', 'si_stime=200 /* 201.00 s */'),
        body.replace('NULL)', 'NULL /* 0.01 s */)'),
        'kill(202, SIGTERM) = 0 /* 0.01 s */',
        'wait4(202, NULL, 0, {si_utime=1 /* 0.01 s */}) = 202',
    ]) {
        const rejected = parse(`101 1700000000.000001 ${mutation}\n`);
        assert.equal(rejected.result.ok, false);
        assert.equal(rejected.records.length, 0);
        assert.doesNotMatch(JSON.stringify(rejected), /PRIVATE_TOKEN|18446744073709551616/);
    }
    const rejected = parse('101 1700000000.000001 waitid(P_ALL, 0, {PRIVATE_TOKEN=0}, 0, NULL) = 0\n');
    assert.deepEqual(rejected.result.rejectedLine, {
        lineSequence: 1,
        shape: 'syscall',
        syscall: 'waitid',
        hasCommentDelimiter: false,
    });
    assert.doesNotMatch(JSON.stringify(rejected), /PRIVATE_TOKEN/);
});

test('syscall success, errno, restart and wait exit statuses cannot contradict each other', () => {
    const restart = {
        ERESTARTSYS: 'To be restarted if SA_RESTART is set',
        ERESTARTNOINTR: 'To be restarted',
        ERESTARTNOHAND: 'To be restarted if no handler',
        ERESTART_RESTARTBLOCK: 'Interrupted by signal',
    };
    for (const [code, description] of Object.entries(restart)) {
        for (const call of ['wait4(202, 0x1234, 0, NULL)', 'waitid(P_ALL, 0, 0x1234, WEXITED, NULL)']) {
            const data = parse(`101 1700000000.000001 ${call} = ? ${code} (${description})\n`);
            assert.equal(data.result.ok, true);
            assert.equal(data.records[0].result, null);
            assert.equal(data.records[0].errno, code);
            for (const suffix of [
                `0 ${code} (${description})`,
                `-1 ${code} (${description})`,
                `? ${code} (SIGTERM)`,
                `? ${code}`,
            ])
                assert.equal(parse(`101 1700000000.000001 ${call} = ${suffix}\n`).result.ok, false);
        }
    }
    for (const body of [
        'kill(202, SIGTERM) = 0 EPERM (Operation not permitted)',
        'kill(202, SIGTERM) = 1',
        'kill(202, SIGTERM) = -1',
        'kill(202, SIGTERM) = -1 EPERM (SIGTERM)',
        'kill(202, SIGTERM) = ? ERESTARTSYS (To be restarted if SA_RESTART is set)',
        'waitid(P_ALL, 0, {}, WEXITED, NULL) = 1',
        'wait4(202, NULL, 0, NULL) = -2',
        'wait4(202, NULL, 0, NULL) = ?',
        'wait4(202, [{WIFEXITED(s) && WEXITSTATUS(s) == 1000000000000000000000}], 0, NULL) = 202',
        'wait4(202, [{WIFEXITED(s) && WEXITSTATUS(s) == 256}], 0, NULL) = 202',
        'wait4(202, [{WIFEXITED(s) && WEXITSTATUS(s) == -1}], 0, NULL) = 202',
        'wait4(202, [{WIFEXITED(s) && WEXITSTATUS(s) == 1.0}], 0, NULL) = 202',
    ])
        assert.equal(parse(`101 1700000000.000001 ${body}\n`).result.ok, false, body);
    assert.equal(
        parse('101 1700000000.000001 kill(202, SIGTERM) = -1 EPERM (Operation not permitted)\n').result.ok,
        true,
    );
    assert.equal(
        parse('101 1700000000.000001 wait4(202, [{WIFEXITED(s) && WEXITSTATUS(s) == 255}], 0, NULL) = 202\n').result.ok,
        true,
    );
});

test('unfinished and resumed calls join only the same exact TID and syscall', () => {
    const data = parse(
        '101 1700000000.000001 wait4(-1, <unfinished ...>\n' +
            '102 1700000000.000002 tgkill(202, 203, SIGTERM) = 0\n' +
            '101 1700000000.000003 <... wait4 resumed>0x7ffd1234, WNOHANG, NULL) = -1 ECHILD (No child processes)\n',
    );
    assert.equal(data.result.ok, true);
    assert.equal(data.records[1].beganAt, '1700000000.000001');
    for (const lines of [
        '101 1700000000.000001 <... wait4 resumed>NULL, WNOHANG, NULL) = 0\n',
        '101 1700000000.000001 wait4(-1, <unfinished ...>\n',
        '101 1700000000.000001 wait4(-1, <unfinished ...>\n101 1700000000.000002 kill(1, <unfinished ...>\n',
        '101 1700000000.000001 wait4(-1, <unfinished ...>\n102 1700000000.000002 <... wait4 resumed>NULL, WNOHANG, NULL) = 0\n',
    ])
        assert.equal(parse(lines).result.ok, false);
});

test('fixed signal terminals and source-defined exit-stop calls never become syscall returns or sender evidence', () => {
    const terminal = parse('202 1700000000.000002 +++ killed by SIGTERM +++\n');
    assert.equal(terminal.result.ok, true);
    assert.equal(terminal.records[0].kind, 'terminal');
    assert.equal(terminal.records[0].signal, 'SIGTERM');
    assert.deepEqual(correlate(terminal.records, []), []);
    assert.equal(Object.hasOwn(terminal.records[0], 'result'), false);
    const inflight = parse(
        '202 1700000000.000001 kill(303, SIGTERM <unfinished ...>\n202 1700000000.000002 +++ killed by SIGKILL +++\n',
    );
    assert.equal(inflight.result.ok, true);
    assert.deepEqual(
        inflight.records.map((row) => row.kind),
        ['terminated-inflight', 'terminal'],
    );
    assert.equal(inflight.records[0].beganLineSequence, 1);
    assert.equal(inflight.records[0].endedLineSequence, 2);
    assert.equal(inflight.records[0].beganAt, '1700000000.000001');
    assert.doesNotMatch(JSON.stringify(inflight.records), /303|"result"|"errno"/);
    for (const call of [
        'kill(303, SIGTERM)',
        'tkill(303, SIGTERM)',
        'tgkill(303, 304, SIGKILL)',
        'pidfd_send_signal(7, SIGTERM, NULL, 0)',
    ]) {
        const direct = parse(`202 1700000000.000001 ${call} = ?\n`);
        assert.equal(direct.result.ok, true);
        assert.equal(direct.records[0].kind, 'syscall-incomplete');
        assert.equal(Object.hasOwn(direct.records[0], 'result'), false);
        assert.equal(Object.hasOwn(direct.records[0], 'errno'), false);
        const syscall = call.slice(0, call.indexOf('('));
        const resumed = parse(
            `202 1700000000.000001 ${call.slice(0, -1)} <unfinished ...>\n202 1700000000.000002 <... ${syscall} resumed>) = ?\n202 1700000000.000003 +++ killed by SIGKILL +++\n`,
        );
        assert.equal(resumed.result.ok, true);
        assert.deepEqual(
            resumed.records.map((row) => row.kind),
            ['syscall-incomplete', 'terminal'],
        );
        assert.equal(resumed.records[0].beganLineSequence, 1);
        assert.equal(resumed.records[0].endedLineSequence, 2);
    }
    for (const lines of [
        '202 1700000000.000001 kill(303, SIGTERM <unfinished ...>\n',
        '202 1700000000.000001 kill(303, SIGTERM <unfinished ...>\n203 1700000000.000002 +++ killed by SIGKILL +++\n',
        '202 1700000000.000001 kill(303, SIGTERM <unfinished ...>\n203 1700000000.000002 <... kill resumed>) = ?\n',
        '202 1700000000.000001 kill(303, SIGTERM <unfinished ...>\n202 1699999999.000002 +++ killed by SIGKILL +++\n',
        '202 1700000000.000001 +++ killed by SIGKILL +++\n202 1700000000.000002 +++ killed by SIGKILL +++\n',
        '202 1700000000.000001 +++ killed by SIGKILL +++\n202 1700000000.000002 kill(303, SIGTERM) = 0\n',
        '202 1700000000.000001 +++ killed by SIGSEGV +++\n',
        '202 1700000000.000001 +++ killed by SIGTERM (core dumped) +++\n',
        '202 1700000000.000001 +++ killed by SIGKILL PRIVATE_TOKEN +++\n',
        '202 1700000000.000001 +++ exited with 0 +++\n',
        '202 1700000000.000001 kill(303, SIGTERM, 9) = ?\n',
        '202 1700000000.000001 kill(303, PRIVATE_TOKEN) = ?\n',
        '202 1700000000.000001 wait4(303, <unfinished ...>) = ?\n',
    ]) {
        const rejected = parse(lines);
        assert.equal(rejected.result.ok, false, lines);
        assert.doesNotMatch(JSON.stringify(rejected), /PRIVATE_TOKEN/);
    }
});

test('pending and exit-stop state cannot hide malformed parameters or synthesize a later success', () => {
    const terminal = '202 1700000000.000003 +++ killed by SIGKILL +++\n';
    for (const prefix of [
        'kill(303,',
        'kill(303, SIGTERM, 9',
        'tgkill(303, SIGTERM',
        'wait4(-1,',
        'waitid(P_ALL, 0,',
    ]) {
        assert.equal(parse(`202 1700000000.000001 ${prefix} <unfinished ...>\n` + terminal).result.ok, false);
    }
    for (const extra of ['kill(303, SIGTERM) = 0', 'tkill(303, SIGTERM) = ?', 'kill(303, SIGTERM <unfinished ...>']) {
        for (const first of ['kill(303, SIGTERM <unfinished ...>', 'kill(303, SIGTERM) = ?']) {
            assert.equal(
                parse(`202 1700000000.000001 ${first}\n202 1700000000.000002 ${extra}\n` + terminal).result.ok,
                false,
            );
        }
    }
    assert.equal(
        parse(
            '202 1700000000.000001 kill(303, SIGTERM <unfinished ...>\n202 1700000000.000002 --- SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=303, si_uid=1} ---\n' +
                terminal,
        ).result.ok,
        true,
    );
});

test('source-defined no-siginfo stops retain only a fixed observation, never a delivery or terminal', () => {
    // strace v6.8 src/strace.c print_stopped(NULL), not a recovered CI raw line.
    // TE_GROUP_STOP also follows GETSIGINFO failure, so this does not prove a kernel group-stop.
    for (const signal of ['SIGTERM', 'SIGKILL']) {
        const data = parse(`202 1700000000.000001 --- stopped by ${signal} ---\n`);
        assert.equal(data.result.ok, true);
        assert.deepEqual(data.records, [
            {
                kind: 'stop-without-siginfo',
                tid: 202,
                timestamp: '1700000000.000001',
                signal,
                lineSequence: 1,
            },
        ]);
        assert.deepEqual(correlate(data.records, []), []);
        assert.equal(data.result.rawStraceRetained, false);
        const continued = parse(
            `202 1700000000.000001 --- stopped by ${signal} ---\n` + '202 1700000000.000002 kill(303, SIGTERM) = 0\n',
        );
        assert.equal(continued.result.ok, true);
        assert.deepEqual(
            continued.records.map((row) => row.kind),
            ['stop-without-siginfo', 'syscall'],
        );
    }
});

test('no-siginfo stops preserve unfinished calls and cannot bypass terminal or exit-stop guards', () => {
    const pending = '202 1700000000.000001 kill(303, SIGTERM <unfinished ...>\n';
    const stop = '202 1700000000.000002 --- stopped by SIGTERM ---\n';
    const resumed = parse(pending + stop + '202 1700000000.000003 <... kill resumed>) = 0\n');
    assert.equal(resumed.result.ok, true);
    assert.deepEqual(
        resumed.records.map((row) => row.kind),
        ['stop-without-siginfo', 'syscall'],
    );
    assert.equal(resumed.records[1].beganAt, '1700000000.000001');
    const terminated = parse(pending + stop + '202 1700000000.000003 +++ killed by SIGKILL +++\n');
    assert.equal(terminated.result.ok, true);
    assert.deepEqual(
        terminated.records.map((row) => row.kind),
        ['stop-without-siginfo', 'terminated-inflight', 'terminal'],
    );
    assert.equal(terminated.records[1].beganLineSequence, 1);
    assert.equal(terminated.records[1].endedLineSequence, 3);
    for (const lines of [
        pending + stop,
        pending + stop + '203 1700000000.000003 <... kill resumed>) = 0\n',
        pending + stop + '202 1700000000.000003 kill(303, SIGTERM) = 0\n',
        '202 1700000000.000001 +++ killed by SIGKILL +++\n' + stop,
        '202 1700000000.000001 kill(303, SIGTERM, 9 <unfinished ...>\n' +
            stop +
            '202 1700000000.000003 +++ killed by SIGKILL +++\n',
    ])
        assert.equal(parse(lines).result.ok, false);
});

test('no-siginfo observations after exit-stop never reopen calls or establish terminal closure', () => {
    for (const began of [
        '202 1700000000.000001 kill(303, SIGTERM) = ?\n',
        '202 1700000000.000001 kill(303, SIGTERM <unfinished ...>\n' +
            '202 1700000000.000002 <... kill resumed>) = ?\n',
    ]) {
        const stopped =
            began +
            '202 1700000000.000003 --- stopped by SIGTERM ---\n' +
            '202 1700000000.000004 --- stopped by SIGKILL ---\n';
        const data = parse(stopped);
        assert.equal(data.result.ok, true);
        assert.deepEqual(
            data.records.map((row) => row.kind),
            ['syscall-incomplete', 'stop-without-siginfo', 'stop-without-siginfo'],
        );
        assert.deepEqual(correlate(data.records, []), []);
        assert.doesNotMatch(JSON.stringify(data.records), /"(?:result|errno|target|siPid|siCode|physicalClosure)"/);
        assert.equal(Object.hasOwn(data.result, 'physicalClosure'), false);
        for (const next of [
            'kill(303, SIGTERM) = 0',
            'kill(303, SIGTERM <unfinished ...>',
            '<... kill resumed>) = 0',
            '<... kill resumed>) = ?',
            '--- SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=303, si_uid=1} ---',
            '--- stopped by SIGSTOP ---',
            '--- stopped by SIGTERM PRIVATE_TOKEN ---',
        ]) {
            const rejected = parse(stopped + `202 1700000000.000005 ${next}\n`);
            assert.equal(rejected.result.ok, false);
            assert.equal(rejected.result.reason, 'trace-record-after-exit-stop');
            assert.deepEqual(rejected.records, data.records);
            assert.doesNotMatch(JSON.stringify(rejected), /PRIVATE_TOKEN/);
        }
        const ended = stopped + '202 1700000000.000005 +++ killed by SIGKILL +++\n';
        const terminal = parse(ended);
        assert.equal(terminal.result.ok, true);
        assert.deepEqual(
            terminal.records.map((row) => row.kind),
            ['syscall-incomplete', 'stop-without-siginfo', 'stop-without-siginfo', 'terminal'],
        );
        const after = parse(ended + '202 1700000000.000006 --- stopped by SIGTERM ---\n');
        assert.equal(after.result.ok, false);
        assert.equal(after.result.reason, 'trace-record-after-terminal');
    }
});

test('rejected no-siginfo stop variants retain only a fixed family, never their raw tokens', () => {
    for (const body of [
        '--- stopped by SIGSTOP ---',
        '--- stopped by SIGUSR1 ---',
        '--- stopped by PRIVATE_TOKEN ---',
        '--- stopped by SIGTERM PRIVATE_TOKEN ---',
        '--- stopped by SIGTERM {si_pid=101} ---',
        '--- stopped by SIGTERM (core dumped) ---',
        '--- stopped by SIGTERM --',
        '--- stopped by SIGTERM --- PRIVATE_TOKEN',
        '--- stopped by SIGTERM /* PRIVATE_TOKEN */ ---',
    ]) {
        const data = parse(`202 1700000000.000001 ${body}\n`);
        assert.equal(data.result.ok, false);
        assert.equal(data.records.length, 0);
        assert.deepEqual(data.result.rejectedLine, {
            lineSequence: 1,
            shape: 'group-stop',
            syscall: null,
            hasCommentDelimiter: body.includes('/*'),
        });
        assert.doesNotMatch(JSON.stringify(data), /PRIVATE_TOKEN|si_pid|core dumped/);
    }
    assert.equal(parse('202 1700000000.000001 --- stopped by SIGTERM ---').result.ok, false);
    const unknown = parse('202 1700000000.000001 --- PRIVATE_TOKEN SIGTERM ---\n');
    assert.equal(unknown.result.ok, false);
    assert.equal(unknown.result.rejectedLine.shape, 'unknown');
    assert.doesNotMatch(JSON.stringify(unknown), /PRIVATE_TOKEN/);
});

test('empty selected traces permit only independently closed ordinary UNKNOWN outcomes', () => {
    const report = {
        trace: { ...parse('').result, empty: true },
        physicalClosure: true,
        original: { ok: true },
        errors: [],
        attribution: { status: 'UNKNOWN' },
    };
    for (const options of [
        { mode: 'cpu', cpuCase: 'positive' },
        { mode: 'cpu', cpuCase: 'browser-nonzero' },
        { mode: 'target' },
    ]) {
        assert.equal(emptyTraceAllowed(options, report, TEST_ROOT), true);
        for (const changed of [
            { ...report, physicalClosure: false },
            { ...report, errors: ['original-closure-incomplete'] },
            { ...report, original: null },
            { ...report, trace: { ok: false, empty: true } },
            { ...report, attribution: { status: 'MATCHED' } },
        ]) {
            assert.equal(emptyTraceAllowed(options, changed, TEST_ROOT), false);
        }
        assert.equal(emptyTraceAllowed(options, report, null), false);
        assert.equal(emptyTraceAllowed(options, report, {}), false);
    }
    for (const options of [
        { mode: 'availability' },
        { mode: 'cpu', cpuCase: 'custodian-delayed-stop-ack' },
        { mode: 'cpu', cpuCase: 'hang', control: 'wrapper-term' },
    ]) {
        assert.equal(emptyTraceAllowed(options, report, TEST_ROOT), false);
    }
});

test('input-bound controls require real new bytes after the recorded arm point', () => {
    const parser = createParser();
    parser.push(Buffer.from('101 1700000000.000001 kill(202, SIGTERM) = 0\n'));
    const arm = parser.restrictToCurrentInput();
    assert.equal(arm.inputBytes, arm.inputLimit);
    const untouched = parser.finish();
    assert.equal(untouched.ok, true);
    assert.equal(untouched.inputBoundTriggeredAtBytes, null);
    parser.push(Buffer.from('202 1700000000.000002 +++ killed by SIGTERM +++\n'));
    const triggered = parser.finish();
    assert.equal(triggered.reason, 'trace-input-bound');
    assert.equal(triggered.inputBoundArmedAtBytes, arm.inputBytes);
    assert.ok(triggered.inputBoundTriggeredAtBytes > arm.inputBytes);
    assert.equal(triggered.inputBytes, triggered.inputBoundTriggeredAtBytes);
});

test('unknown trace, secrets, comments, unexpected signals, and truncated lines fail without retaining text', () => {
    for (const line of [
        '101 1700000000.000001 execve("PRIVATE_TOKEN", [], []) = 0\n',
        '101 1700000000.000001 kill(202, SIGTERM) = -1 EPERM (PRIVATE_TOKEN)\n',
        '101 1700000000.000001 kill(202, SIGTERM) = 0 /* PRIVATE_TOKEN */\n',
        '101 1700000000.000001 --- SIGUSR1 {si_signo=SIGUSR1, si_code=SI_USER, si_pid=202, si_uid=0} ---\n',
        '101 1700000000.000001 kill(202, SIGTERM) = 0',
        '101 1700000000.000001 kill(202, SIGTERM) = 0\0\n',
    ]) {
        const data = parse(line);
        assert.equal(data.result.ok, false);
        assert.equal(data.records.length, 0);
        assert.doesNotMatch(JSON.stringify(data), /PRIVATE_TOKEN/);
    }
});

test('input, line, event and partial-line bounds fail closed', () => {
    const line = '101 1700000000.000001 kill(202, SIGTERM) = 0\n';
    for (const bounds of [
        { ...BOUNDS, inputBytes: 10 },
        { ...BOUNDS, lineBytes: 10 },
        { ...BOUNDS, events: 1 },
    ])
        assert.equal(parse(line + line, { bounds }).result.ok, false);
});

test('PIDFD is opaque, group kill/unknown TID/ambiguous sender never establish attribution', () => {
    const sender = { pid: 101, tgid: 101, ppid: 99, startTicks: '42', namespace: 'pid:[1]' };
    const target = { pid: 202, tgid: 202, ppid: 99, startTicks: '52', namespace: 'pid:[1]' };
    const syscall = {
        eventId: 1,
        kind: 'syscall',
        syscall: 'kill',
        tid: 102,
        timestamp: '1700000000.000001',
        beganAt: '1700000000.000001',
        result: 0,
        errno: null,
        signal: 'SIGTERM',
        target: 202,
        targetKind: 'pid-or-group',
        callerProcessIdentity: sender,
        threadIdentity: { pid: 102, tgid: 101, ppid: 99, startTicks: '43', namespace: 'pid:[1]' },
        identityObservation: observation(sender, { pid: 102, tgid: 101, startTicks: '43', namespace: 'pid:[1]' }),
        targetObservation: observation(target),
    };
    const delivery = {
        eventId: 2,
        kind: 'delivery',
        tid: 202,
        timestamp: '1700000000.000002',
        signal: 'SIGTERM',
        siPid: 101,
        siCode: 'SI_USER',
        threadIdentity: target,
        processIdentity: target,
        identityObservation: observation(target),
    };
    assert.equal(correlate([syscall, delivery], [sender, target])[0].status, 'CORRELATED_DIAGNOSTIC_ONLY');
    const spawn = {
        ...target,
        type: 'worker-spawn',
        source: 'supervisor',
        eventId: 1,
        receivedUtc: '2023-11-14T22:13:20.000Z',
    };
    const exit = {
        type: 'worker-exit',
        source: 'supervisor',
        eventId: 2,
        code: null,
        signal: 'SIGTERM',
        receivedUtc: '2023-11-14T22:13:20.010Z',
    };
    const close = { ...exit, type: 'worker-stdio-close', eventId: 3 };
    const receipt = {
        worker: { ...target, spawn, exit, close },
        events: [spawn, exit, close],
        custody: {
            observation: {
                custodian: sender,
                events: [
                    {
                        ...target,
                        type: 'cpu-worker-signal',
                        eventId: 1,
                        cpuOnly: true,
                        signal: 'SIGTERM',
                        utc: '2023-11-14T22:13:20.001Z',
                    },
                    {
                        ...target,
                        type: 'cpu-worker-absent-before-ack',
                        eventId: 2,
                        cpuOnly: true,
                        utc: '2023-11-14T22:13:20.020Z',
                    },
                ],
            },
        },
    };
    assert.equal(knownCpuSender(receipt, [syscall, delivery], TEST_ROOT), true);
    // Pure synthetic timing controls, not new trace evidence. Millisecond endpoints
    // are half-open precision intervals; delivery is not bounded by Python's send log.
    const time = (fraction) => `1700000000.${fraction}`;
    for (const [returned, delivered] of [
        ['000001', '005000'], // after proof, before actual exit
        ['001999', '000002'], // remote delivery before observed syscall return
        ['000001', '010999'], // last microsecond in the recorded exit millisecond
    ]) {
        const rows = structuredClone([syscall, delivery]);
        rows[0].timestamp = time(returned);
        rows[1].timestamp = time(delivered);
        assert.equal(knownCpuSender(receipt, rows, TEST_ROOT), true);
    }
    const delayedProof = structuredClone(receipt),
        returnedAfterExit = structuredClone([syscall, delivery]);
    delayedProof.custody.observation.events[0].utc = '2023-11-14T22:13:20.015Z';
    returnedAfterExit[0].timestamp = time('014999');
    assert.equal(
        knownCpuSender(delayedProof, returnedAfterExit, TEST_ROOT),
        true,
        'Python may resume from kill and log proof after Node has recorded worker exit/close',
    );
    for (const mutate of [
        (r) => {
            r.custody.observation.events.pop();
        },
        (r) => {
            r.custody.observation.events[1].cpuOnly = false;
        },
        (r) => {
            r.custody.observation.events[1].startTicks = '999';
        },
        (r) => {
            r.custody.observation.events[1].eventId = 0;
        },
        (r) => {
            r.custody.observation.events[1].utc = '2023-11-14T22:13:20.000Z';
        },
        (r) => {
            r.custody.observation.events.push(structuredClone(r.custody.observation.events[1]));
        },
        (r) => {
            r.custody.observation.events.push({ type: 'unrelated', eventId: 1 });
        },
    ]) {
        const changed = structuredClone(receipt);
        mutate(changed);
        assert.equal(knownCpuSender(changed, [syscall, delivery], TEST_ROOT), false);
    }
    const setEventTime = (r, key, fraction) => {
        r.worker[key].receivedUtc = `2023-11-14T22:13:20.${fraction}Z`;
        r.events.find((event) => event.eventId === r.worker[key].eventId).receivedUtc = r.worker[key].receivedUtc;
    };
    const mutations = [
        [
            'missing exit',
            (r) => {
                delete r.worker.exit;
            },
        ],
        [
            'missing close',
            (r) => {
                delete r.worker.close;
            },
        ],
        [
            'unreferenced exit',
            (r) => {
                r.worker.exit = { ...r.worker.exit, eventId: 99 };
            },
        ],
        [
            'duplicate exit',
            (r) => {
                r.events.push(structuredClone(r.worker.exit));
            },
        ],
        [
            'wrong exit signal',
            (r) => {
                r.worker.exit.signal = 'SIGKILL';
            },
        ],
        [
            'wrong close code',
            (r) => {
                r.worker.close.code = 0;
            },
        ],
        [
            'wrong spawn identity',
            (r) => {
                r.worker.spawn.startTicks = '999';
            },
        ],
        [
            'wrong proof identity',
            (r) => {
                r.custody.observation.events[0].startTicks = '999';
            },
        ],
        [
            'wrong proof signal',
            (r) => {
                r.custody.observation.events[0].signal = 'SIGKILL';
            },
        ],
        [
            'proof not CPU-only',
            (r) => {
                r.custody.observation.events[0].cpuOnly = false;
            },
        ],
        [
            'duplicate proof',
            (r) => {
                r.custody.observation.events.push(structuredClone(r.custody.observation.events[0]));
            },
        ],
        [
            'proof after same-source absence',
            (r) => {
                r.custody.observation.events[0].utc = '2023-11-14T22:13:20.021Z';
            },
        ],
        [
            'send before spawn',
            (r) => {
                setEventTime(r, 'spawn', '001');
            },
        ],
        [
            'exit before worker spawn',
            (r) => {
                setEventTime(r, 'spawn', '009');
                setEventTime(r, 'exit', '008');
            },
        ],
        [
            'close before exit',
            (r) => {
                setEventTime(r, 'close', '009');
            },
        ],
        [
            'send at proof upper endpoint',
            (r, rows) => {
                rows[0].timestamp = time('002000');
            },
        ],
        [
            'delivery at exit upper endpoint',
            (r, rows) => {
                rows[1].timestamp = time('011000');
            },
        ],
        [
            'delivery before send',
            (r, rows) => {
                rows[1].timestamp = time('000000');
            },
        ],
        [
            'send return before entry',
            (r, rows) => {
                rows[0].timestamp = time('000000');
            },
        ],
        [
            'invalid send timestamp',
            (r, rows) => {
                rows[0].timestamp = 'NaN';
            },
        ],
        [
            'duplicate send',
            (r, rows) => {
                rows.push(structuredClone(rows[0]));
            },
        ],
        [
            'duplicate delivery',
            (r, rows) => {
                rows.push(structuredClone(rows[1]));
            },
        ],
        [
            'unfinished send',
            (r, rows) => {
                rows[0].kind = 'syscall-incomplete';
            },
        ],
        [
            'failed send',
            (r, rows) => {
                rows[0].result = -1;
                rows[0].errno = 'ESRCH';
            },
        ],
        [
            'wrong caller',
            (r, rows) => {
                rows[0].callerProcessIdentity.startTicks = '999';
            },
        ],
        [
            'wrong send target',
            (r, rows) => {
                rows[0].target = 999;
            },
        ],
        [
            'wrong send signal',
            (r, rows) => {
                rows[0].signal = 'SIGKILL';
            },
        ],
        [
            'wrong delivery sender',
            (r, rows) => {
                rows[1].siPid = 999;
            },
        ],
        [
            'wrong delivery target',
            (r, rows) => {
                rows[1].tid = 999;
            },
        ],
        [
            'wrong delivery signal',
            (r, rows) => {
                rows[1].signal = 'SIGKILL';
            },
        ],
        [
            'wrong delivery code',
            (r, rows) => {
                rows[1].siCode = 'SI_TKILL';
            },
        ],
    ];
    for (const [name, mutate] of mutations) {
        const changed = structuredClone(receipt),
            rows = structuredClone([syscall, delivery]);
        mutate(changed, rows);
        assert.equal(knownCpuSender(changed, rows, TEST_ROOT), false, name);
    }
    const stop = parse('202 1700000000.000002 --- stopped by SIGTERM ---\n').records[0];
    for (const replacement of [stop, { ...delivery, kind: stop.kind }]) {
        assert.deepEqual(correlate([syscall, replacement], [sender, target]), []);
        assert.equal(knownCpuSender(receipt, [syscall, replacement], TEST_ROOT), false);
    }
    const forgedDelivery = { ...stop, kind: 'delivery' };
    assert.equal(correlate([syscall, forgedDelivery], [sender, target])[0].status, 'UNKNOWN');
    assert.equal(knownCpuSender(receipt, [syscall, forgedDelivery], TEST_ROOT), false);
    assert.equal(knownCpuSender(receipt, [{ ...syscall, kind: stop.kind }, delivery], TEST_ROOT), false);
    for (const changed of [
        { ...syscall, targetKind: 'pidfd-unknown' },
        { ...syscall, target: -202 },
        { ...syscall, callerProcessIdentity: null },
        { ...syscall, result: -1 },
        { ...syscall, errno: 'EPERM' },
        { ...syscall, errno: undefined },
        { ...syscall, result: null, errno: 'ERESTARTSYS' },
        { ...syscall, kind: 'terminal' },
        { ...syscall, kind: 'syscall-incomplete' },
        { ...syscall, kind: 'terminated-inflight' },
        { ...syscall, callerProcessIdentity: { ...sender, startTicks: '99' } },
        { ...syscall, beganAt: '1700000000.900000' },
        { ...syscall, threadIdentity: { ...syscall.threadIdentity, tgid: 999 } },
        { ...syscall, targetObservation: null },
        { ...syscall, identityObservation: null },
        { ...syscall, identityObservation: observation(target) },
        { ...syscall, threadIdentity: { ...syscall.threadIdentity, pid: 999, startTicks: '999' } },
    ])
        assert.equal(correlate([changed, delivery], [sender, target])[0].status, 'UNKNOWN');
    assert.equal(correlate([syscall, { ...delivery, siCode: 'SI_KERNEL' }], [sender, target])[0].status, 'UNKNOWN');
    assert.equal(
        correlate([syscall, { ...delivery, identityObservation: observation(sender) }], [sender, target])[0].status,
        'UNKNOWN',
    );
    const grafted = structuredClone(syscall);
    for (const field of ['process', 'thread', 'threadBefore', 'threadAfter', 'processBefore', 'processAfter'])
        grafted.identityObservation[field].ppid = 888;
    assert.equal(correlate([grafted, delivery], [sender, target])[0].status, 'UNKNOWN');
    assert.equal(
        correlateRaw([syscall, delivery], [sender, target], { ...TEST_ROOT, startTicks: '999' })[0].status,
        'UNKNOWN',
    );
    assert.equal(
        correlate([{ ...syscall, timestamp: '1700000000.000003' }, delivery], [sender, target])[0].status,
        'CORRELATED_DIAGNOSTIC_ONLY',
    );
    assert.equal(correlate([syscall, { ...syscall, eventId: 3 }, delivery], [sender, target])[0].status, 'UNKNOWN');
    const pidfd = parse('101 1700000000.000001 pidfd_send_signal(7, SIGTERM, NULL, 0) = 0\n');
    assert.equal(pidfd.result.ok, true);
    assert.equal(pidfd.records[0].targetKind, 'pidfd-unknown');
    const fs = require('node:fs'),
        path = require('node:path');
    const root = process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT;
    const availability = root && path.join(root, 'shutdown-diagnostics-38776059963', 'availability');
    if (availability && fs.existsSync(path.join(availability, 'diagnostic.json'))) {
        const original = JSON.parse(fs.readFileSync(path.join(availability, 'diagnostic.json')));
        const records = fs
            .readFileSync(path.join(availability, 'filtered-trace.jsonl'), 'utf8')
            .trim()
            .split('\n')
            .map(JSON.parse);
        const knownRoot = original.events.find((row) => row.type === 'original-outer-observed').identity;
        const identities = records.flatMap((row) => [row.processIdentity, row.threadIdentity]).filter(Boolean);
        assert.equal(correlateRaw(records, identities, knownRoot)[0].status, 'CORRELATED_DIAGNOSTIC_ONLY');
        const changed = structuredClone(records);
        changed.find((row) => row.kind === 'syscall' && row.syscall === 'kill').errno = 'EPERM';
        assert.equal(correlateRaw(changed, identities, knownRoot)[0].status, 'UNKNOWN');
    }
});

test(
    'retained CPU known-sender proof allows delivery after send logging within the real worker lifetime',
    { skip: !process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT },
    () => {
        const fs = require('node:fs'),
            path = require('node:path'),
            crypto = require('node:crypto');
        const { expectedOutcome } = require('./example-evidence-shutdown-trace.cjs');
        const { validateCustodyArtifacts } = require('./example-evidence-supervisor.cjs');
        const root = process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT;
        let checked = 0;
        for (const run of ['38803365977', '38806513208', '38814058706']) {
            const directory = path.join(root, `shutdown-diagnostics-${run}`, 'cpu-custodian-delayed-stop-ack-on');
            if (!fs.existsSync(directory)) continue;
            checked++;
            const reportBytes = fs.readFileSync(path.join(directory, 'diagnostic.json'));
            const report = JSON.parse(reportBytes);
            const receiptBytes = fs.readFileSync(path.join(directory, 'attempt/attempt-receipt.json'));
            const receipt = JSON.parse(receiptBytes);
            const records = fs
                .readFileSync(path.join(directory, 'filtered-trace.jsonl'), 'utf8')
                .trim()
                .split('\n')
                .map(JSON.parse);
            const knownRoot = report.events.find((event) => event.type === 'original-outer-observed').identity;
            const artifacts = {};
            for (const [role, reference] of Object.entries(receipt.custody.artifacts)) {
                const bytes = fs.readFileSync(path.join(directory, 'attempt', path.basename(reference.path)));
                assert.equal(bytes.length, reference.bytes);
                assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), reference.sha256);
                artifacts[role] = ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(bytes) : bytes;
            }
            assert.equal(validateCustodyArtifacts(receipt, artifacts).ok, true, run);
            assert.equal(expectedOutcome(receipt, { mode: 'cpu', cpuCase: 'custodian-delayed-stop-ack' }), true, run);
            assert.equal(receipt.ok, false, 'known negative remains a failed production receipt');
            assert.equal(knownCpuSender(receipt, records, knownRoot), true, run);
            if (run === '38814058706') {
                assert.equal(report.status, 'FAIL');
                assert.deepEqual(report.errors, ['cpu-known-sender-not-established']);
                assert.equal(report.cpuKnownSender.established, false);
                const delivery = records.find((row) => row.kind === 'delivery' && row.siCode === 'SI_USER');
                const proof = receipt.custody.observation.events.find((row) => row.type === 'cpu-worker-signal');
                assert.equal(delivery.timestamp, '1792101800.430266');
                assert.ok(
                    Number(delivery.timestamp) > Date.parse(proof.utc) / 1000 + 0.001,
                    'the old proof-plus-1ms bound rejected this actual delivery',
                );
                for (const key of ['exit', 'close']) {
                    const changed = structuredClone(receipt);
                    delete changed.worker[key];
                    assert.equal(knownCpuSender(changed, records, knownRoot), false);
                }
            }
            assert.deepEqual(fs.readFileSync(path.join(directory, 'diagnostic.json')), reportBytes);
            assert.deepEqual(fs.readFileSync(path.join(directory, 'attempt/attempt-receipt.json')), receiptBytes);
        }
        assert.ok(checked > 0, 'at least one original traced CPU known-sender fixture is required');
    },
);

test('reviewer mutation cases reject duplicate siginfo, conflicting signo, extra args and unsafe numbers', () => {
    for (const line of [
        '101 1700000000.000001 --- SIGTERM {si_signo=SIGTERM, si_code=SI_USER, si_pid=101, si_pid=999, si_uid=0} ---\n',
        '101 1700000000.000001 --- SIGTERM {si_signo=SIGKILL, si_code=SI_USER, si_pid=101, si_uid=0} ---\n',
        '101 1700000000.000001 kill(202, SIGTERM, 999) = 0\n',
        '101 1700000000.000001 tgkill(202, 203, SIGTERM, 999) = 0\n',
        '9999999999999999999999999999999999999 1700000000.000001 kill(202, SIGTERM) = 0\n',
        '101 1700000000.000001 kill(9999999999999999999999999999999999999, SIGTERM) = 0\n',
        '101 9999999999999999999999999999999.000001 kill(202, SIGTERM) = 0\n',
        '101 1700000000.000001 wait4(-1, {)], WNOHANG, NULL) = 0\n',
    ])
        assert.equal(parse(line).result.ok, false, line);
});

test('cached live identities require unique exact lifetime and reject PID reuse or image change', () => {
    const { cachedObservation } = require('./example-evidence-shutdown-trace.cjs');
    const process = { pid: 202, startTicks: '52', namespace: 'pid:[1]', tgid: 202 };
    const observed = observation(process);
    const entry = {
        observation: observed,
        firstObservedAt: 1700000000000,
        lastObservedAt: 1700000000010,
        firstAbsentAt: 1700000000030,
        imageChanged: false,
    };
    const receipt = {
        ownedProcesses: [process],
        browsers: [],
        custody: { observation: { adopted: [{ ...process, reap: { utc: '2023-11-14T22:13:20.025Z' } }] } },
    };
    assert.ok(cachedObservation(202, '1700000000.020000', [entry], receipt));
    for (const cache of [
        [{ ...entry, imageChanged: true }],
        [{ ...entry, firstAbsentAt: 1700000000015 }],
        [entry, { ...entry, observation: { ...observed, process: { ...process, startTicks: '99' } } }],
        [{ ...entry, observation: { ...observed, process: { ...process, startTicks: '99' } } }],
        [{ ...entry, observation: { ...observed, doubleChecked: false } }],
    ])
        assert.equal(cachedObservation(202, '1700000000.020000', cache, receipt), null);
    assert.equal(cachedObservation(202, '1700000000.030000', [entry], receipt), null);
    assert.equal(cachedObservation(202, '1699999999.990000', [entry], receipt), null);
});

function ownedThreadFixture() {
    const root = { ...TEST_ROOT };
    const thread = { pid: 100, tgid: root.pid, ppid: root.ppid, startTicks: '41', namespace: root.namespace };
    const child = { pid: 202, tgid: 202, ppid: root.pid, startTicks: '52', namespace: root.namespace };
    const make = (process, task = process) => {
        const image = { dev: 1, ino: 2, size: 3, mtimeMs: 4 };
        const lineage = process.pid === root.pid ? [root] : [process, root];
        return {
            root,
            thread: task,
            process,
            threadBefore: task,
            threadAfter: task,
            processBefore: process,
            processAfter: process,
            ownedLineage: lineage,
            lineageAfter: lineage,
            doubleChecked: true,
            imageStable: true,
            imageBefore: image,
            imageAfter: image,
            frozenImage: image,
            frozenBrowserImageMatch: true,
            observedAt: 1700000000010,
        };
    };
    const observations = new Map([
        [root.pid, make(root)],
        [thread.pid, make(root, thread)],
        [child.pid, make(child)],
    ]);
    const cache = new Map(),
        failures = [],
        listed = [],
        presenceCalls = [];
    const options = {
        root,
        cache,
        now: () => 1700000000020,
        onFailure: (reason) => failures.push(reason),
        observe: (pid) => structuredClone(observations.get(pid)),
        listTasks: (pid) => {
            listed.push(pid);
            return pid === root.pid ? [root.pid, thread.pid] : [pid];
        },
        readChildren: (_pid, tid) => (tid === thread.pid ? String(child.pid) : ''),
        presence: (row) => {
            presenceCalls.push(row.pid);
            return 'PRESENT';
        },
    };
    return { root, thread, child, observations, cache, failures, listed, presenceCalls, options };
}

test('owned task enumeration reaches nonleader children and keeps thread identity windows separate', () => {
    const { sampleOwnedIdentities, cachedObservation } = require('./example-evidence-shutdown-trace.cjs');
    const f = ownedThreadFixture();
    assert.equal(sampleOwnedIdentities(f.options).ok, true);
    assert.deepEqual(f.listed, [99, 202]);
    assert.equal(f.cache.size, 3);
    assert.ok(f.cache.has('100:41:pid:[1]'));
    assert.equal(f.cache.has('100:40:pid:[1]'), false);
    assert.ok(f.presenceCalls.includes(100));
    const receipt = {
        ownedProcesses: [f.root, f.child],
        browsers: [],
        worker: f.root,
        custody: {
            observation: {
                adopted: [
                    { ...f.root, reap: { utc: '2023-11-14T22:13:20.100Z' } },
                    { ...f.child, reap: { utc: '2023-11-14T22:13:20.100Z' } },
                ],
            },
        },
    };
    const rows = [...f.cache.values()];
    assert.equal(cachedObservation(100, '1700000000.015000', rows, receipt).thread.startTicks, '41');
    const reused = structuredClone(rows.find((row) => row.observation.thread.pid === 100));
    for (const key of ['thread', 'threadBefore', 'threadAfter']) reused.observation[key].startTicks = '99';
    assert.equal(cachedObservation(100, '1700000000.015000', [...rows, reused], receipt), null);
    sampleOwnedIdentities({ ...f.options, presence: (row) => (row.pid === 100 ? 'ABSENT' : 'PRESENT') });
    assert.equal(f.cache.get('100:41:pid:[1]').firstAbsentAt, 1700000000020);
    assert.equal(cachedObservation(100, '1700000000.021000', [...f.cache.values()], receipt), null);
    assert.ok(cachedObservation(99, '1700000000.021000', [...f.cache.values()], receipt));
    sampleOwnedIdentities({ ...f.options, presence: (row) => (row.pid === 100 ? 'UNKNOWN' : 'PRESENT') });
    sampleOwnedIdentities(f.options);
    assert.equal(cachedObservation(100, '1700000000.015000', [...f.cache.values()], receipt), null);
});

test('owned task sampling rejects wrong TGID, namespace, parents, reuse, reads and shared bounds', () => {
    const { sampleOwnedIdentities } = require('./example-evidence-shutdown-trace.cjs');
    for (const mutation of ['tgid', 'namespace', 'ppid', 'reuse', 'read', 'ancestor']) {
        const f = ownedThreadFixture();
        let seen = 0;
        const observe = (pid) => {
            const row = f.options.observe(pid);
            if (pid === 100) {
                seen++;
                if (mutation === 'tgid')
                    for (const key of ['thread', 'threadBefore', 'threadAfter']) row[key].tgid = 777;
                if (mutation === 'namespace')
                    for (const key of ['thread', 'threadBefore', 'threadAfter']) row[key].namespace = 'pid:[2]';
                if (mutation === 'ppid')
                    for (const key of ['thread', 'threadBefore', 'threadAfter']) row[key].ppid = 777;
                if (mutation === 'reuse' && seen > 1)
                    for (const key of ['thread', 'threadBefore', 'threadAfter']) row[key].startTicks = '99';
                if (mutation === 'ancestor' && seen > 1) row.ownedLineage.at(-1).ppid = 777;
            }
            return row;
        };
        sampleOwnedIdentities({
            ...f.options,
            observe,
            readChildren: (pid, tid, limit) => {
                if (mutation === 'read' && tid === 100) throw Object.assign(Error('denied'), { code: 'EACCES' });
                return f.options.readChildren(pid, tid, limit);
            },
        });
        assert.equal(f.listed.includes(202), false, mutation);
        assert.equal(f.cache.has('100:41:pid:[1]'), false, mutation);
    }
    for (const [bounds, read, expected] of [
        [{ ...BOUNDS, identities: 2 }, null, 'identity-count-bound'],
        [{ ...BOUNDS, identityBytes: 65536 }, () => '1'.repeat(65537), 'identity-input-bound'],
        [{ ...BOUNDS, identityBytes: 1 }, () => '', 'identity-output-bound'],
    ]) {
        const f = ownedThreadFixture();
        assert.equal(
            sampleOwnedIdentities({ ...f.options, bounds, readChildren: read || f.options.readChildren }).ok,
            false,
        );
        assert.ok(f.failures.includes(expected));
        assert.ok(f.cache.size <= bounds.identities);
    }
    const f = ownedThreadFixture();
    sampleOwnedIdentities(f.options);
    sampleOwnedIdentities({
        ...f.options,
        readChildren: () => {
            throw Object.assign(Error('denied'), { code: 'EACCES' });
        },
    });
    assert.equal(f.cache.get('100:41:pid:[1]').metadataUnknown, true);
    assert.equal(f.cache.get('100:41:pid:[1]').firstAbsentAt, null);
});

test('cross-read exec and later ownership changes permanently disqualify cached thread observations', () => {
    const { sampleOwnedIdentities, cachedObservation } = require('./example-evidence-shutdown-trace.cjs');
    const receiptFor = (f) => ({
        ownedProcesses: [f.root, f.child],
        browsers: [],
        custody: {
            observation: {
                adopted: [f.root, f.child].map((row) => ({ ...row, reap: { utc: '2023-11-14T22:13:20.100Z' } })),
            },
        },
    });
    for (const [pid, change] of [
        [99, 'image'],
        [100, 'image'],
        [100, 'frozen'],
    ]) {
        const f = ownedThreadFixture();
        let count = 0;
        sampleOwnedIdentities({
            ...f.options,
            observe: (tid) => {
                const row = f.options.observe(tid);
                if (tid === pid && ++count >= (pid === 99 ? 3 : 2)) {
                    if (change === 'image') {
                        row.imageBefore = { ...row.imageBefore, ino: 999 };
                        row.imageAfter = { ...row.imageAfter, ino: 999 };
                    } else row.frozenImage = { ...row.frozenImage, ino: 999 };
                }
                return row;
            },
        });
        const rows = [...f.cache.values()],
            row = rows.find((item) => item.observation.thread.pid === pid);
        assert.equal(row.imageChanged, true);
        assert.equal(cachedObservation(pid, '1700000000.015000', rows, receiptFor(f)), null);
    }
    for (const change of ['parent', 'ancestor']) {
        const f = ownedThreadFixture();
        const modify = (ticks) => {
            const row = f.observations.get(202),
                leader = { ...f.child, ppid: 150 };
            for (const key of ['process', 'processBefore', 'processAfter', 'thread', 'threadBefore', 'threadAfter'])
                row[key] = leader;
            row.ownedLineage = [
                leader,
                { pid: 150, tgid: 150, ppid: 99, startTicks: ticks, namespace: 'pid:[1]' },
                f.root,
            ];
            row.lineageAfter = row.ownedLineage;
        };
        if (change === 'ancestor') modify('73');
        sampleOwnedIdentities(f.options);
        assert.equal(f.cache.get('202:52:pid:[1]').metadataUnknown, false);
        modify('74');
        sampleOwnedIdentities(f.options);
        assert.equal(f.cache.get('202:52:pid:[1]').metadataUnknown, true);
        assert.equal(cachedObservation(202, '1700000000.015000', [...f.cache.values()], receiptFor(f)), null);
    }
});

test('image read unavailability records a fixed first witness without restoring invalid cache trust', () => {
    const { sampleOwnedIdentities, cachedObservation } = require('./example-evidence-shutdown-trace.cjs');
    const receiptFor = (f) => ({
        ownedProcesses: [f.root, f.child],
        browsers: [],
        custody: {
            observation: {
                adopted: [f.root, f.child].map((row) => ({ ...row, reap: { utc: '2023-11-14T22:13:20.100Z' } })),
            },
        },
    });
    for (const kind of ['within-read', 'across-read', 'across-samples', 'changed', 'baseline', 'legacy']) {
        const f = ownedThreadFixture();
        if (['across-samples', 'changed', 'legacy'].includes(kind)) sampleOwnedIdentities(f.options);
        if (kind === 'legacy') {
            const old = f.cache.get('100:41:pid:[1]');
            old.imageChanged = true;
            for (const key of ['imageInvalid', 'firstImageFailureAt', 'firstImageFailure']) delete old[key];
        }
        let reads = 0;
        sampleOwnedIdentities({
            ...f.options,
            observe: (pid) => {
                const row = f.options.observe(pid);
                if (pid !== 100) return row;
                reads++;
                row.observedAt += reads;
                if (kind === 'within-read' && reads === 1) {
                    row.imageAfter = null;
                    row.imageStable = false;
                }
                if ((kind === 'across-read' && reads === 2) || kind === 'across-samples') {
                    row.imageBefore = null;
                    row.imageAfter = null;
                    row.imageStable = false;
                }
                if (kind === 'changed') {
                    row.imageBefore.ino = 999;
                    row.imageAfter.ino = 999;
                }
                if (kind === 'baseline') row.imageStable = false;
                return row;
            },
        });
        const entry = f.cache.get('100:41:pid:[1]'),
            witness = structuredClone(entry.firstImageFailure);
        assert.equal(entry.imageChanged, true);
        assert.equal(entry.imageInvalid, true);
        assert.equal(
            witness.reason,
            kind === 'changed' ? 'changed' : ['baseline', 'legacy'].includes(kind) ? 'unknown' : 'unavailable',
            kind,
        );
        assert.deepEqual(witness.thread, entry.observation.thread);
        assert.deepEqual(witness.process, entry.observation.process);
        assert.deepEqual(witness.root, f.root);
        assert.equal(entry.firstImageFailureAt, witness.after.observedAt);
        assert.equal(witness.previousInvalid, kind === 'legacy');
        if (kind === 'changed') {
            assert.equal(witness.previousImage.ino, 2);
            assert.equal(witness.before.imageBefore.ino, 999);
        }
        if (kind === 'across-samples') {
            assert.equal(witness.previousImage.ino, 2);
            assert.equal(witness.before.imageBefore, null);
            assert.equal(entry.firstAbsentAt, null, 'unavailable exe does not establish thread absence');
        }
        assert.equal(cachedObservation(100, '1700000000.015000', [...f.cache.values()], receiptFor(f)), null);
        sampleOwnedIdentities(f.options);
        const final = f.cache.get('100:41:pid:[1]');
        assert.deepEqual(final.firstImageFailure, witness, 'later valid reads never replace the first issue');
        assert.equal(final.imageInvalid, true);
        const altered = structuredClone(final);
        altered.imageChanged = false;
        assert.equal(cachedObservation(100, '1700000000.015000', [altered], receiptFor(f)), null);
        altered.imageInvalid = false;
        assert.equal(cachedObservation(100, '1700000000.015000', [altered], receiptFor(f)), null);
        assert.doesNotMatch(JSON.stringify(witness), /\/proc\/|EACCES|ENOENT|PRIVATE_TOKEN/);
    }
    const f = ownedThreadFixture();
    sampleOwnedIdentities(f.options);
    const good = f.cache.get('100:41:pid:[1]');
    assert.equal(good.imageInvalid, false);
    assert.equal(good.firstImageFailure, null);
    assert.ok(cachedObservation(100, '1700000000.015000', [good], receiptFor(f)));
    for (const key of ['imageInvalid', 'firstImageFailureAt', 'firstImageFailure']) {
        const incomplete = structuredClone(good);
        delete incomplete[key];
        assert.equal(cachedObservation(100, '1700000000.015000', [incomplete], receiptFor(f)), null);
    }
});

function realThreadControlSkip({
    read = require('node:fs').readFileSync,
    ci = !!(process.env.CI || process.env.GITHUB_ACTIONS),
    platform = process.platform,
} = {}) {
    if (platform !== 'linux') return 'Linux required';
    try {
        const children = read(`/proc/self/task/${process.pid}/children`, 'utf8');
        assert.equal(typeof children, 'string');
        assert.ok(
            Buffer.byteLength(children) <= 8192 && /^\s*(?:\d+\s*)*$/.test(children),
            'invalid task children interface',
        );
        return false;
    } catch (error) {
        if (error.code === 'ENOENT' && !ci)
            return 'task children interface unavailable locally; required on the official runner';
        throw error;
    }
}

test('official task capability checks fail on missing, denied or malformed children interfaces', () => {
    const missing = () => {
        throw Object.assign(Error('missing'), { code: 'ENOENT' });
    };
    assert.equal(typeof realThreadControlSkip({ read: missing, ci: false, platform: 'linux' }), 'string');
    assert.throws(() => realThreadControlSkip({ read: missing, ci: true, platform: 'linux' }), /missing/);
    for (const ci of [false, true]) {
        assert.throws(
            () =>
                realThreadControlSkip({
                    read: () => {
                        throw Object.assign(Error('denied'), { code: 'EACCES' });
                    },
                    ci,
                    platform: 'linux',
                }),
            /denied/,
        );
        assert.throws(
            () => realThreadControlSkip({ read: () => 'bad metadata', ci, platform: 'linux' }),
            /invalid task children interface/,
        );
    }
    assert.equal(realThreadControlSkip({ read: () => '12 34\n', ci: true, platform: 'linux' }), false);
});

test(
    'thread fixture initialization failure waits for its actual child close before exiting',
    { timeout: 10000 },
    async () => {
        const { Worker } = require('node:worker_threads');
        const source = require('node:fs').readFileSync(__filename, 'utf8');
        const section = source.slice(source.lastIndexOf("    'real CPU worker-thread child is found"));
        const begin = section.indexOf('        const workerCode = `') + '        const workerCode = `'.length;
        const end = section.indexOf('    `;', begin);
        assert.ok(begin > 0 && end > begin);
        const original = section.slice(begin, end);
        const marker = "const tid = Number(fs.readlinkSync('/proc/thread-self').split('/').at(-1));";
        assert.equal(original.split(marker).length, 2);
        const code = original.replace(marker, "throw Error('injected initialization failure');");
        const worker = new Worker(code, { eval: true });
        const messages = [];
        const closed = new Promise((resolve) => worker.once('exit', resolve));
        worker.on('message', (message) => messages.push(message));
        worker.on('error', () => {});
        try {
            assert.equal(await closed, 1);
            assert.deepEqual(
                messages.map((row) => row.type),
                ['child-closed', 'initialization-error'],
            );
            const child = messages[0];
            assert.ok(child.pid && child.exit && child.close);
            assert.deepEqual(child.exit, child.close);
            assert.equal(require('node:fs').existsSync('/proc/' + child.pid), false);
        } finally {
            await closed;
        }
    },
);

test(
    'real CPU worker-thread child is found through its nonleader task and physically closes',
    {
        skip: realThreadControlSkip(),
        timeout: 10000,
    },
    async () => {
        const { spawn } = require('node:child_process');
        const fs = require('node:fs');
        const { identity, sampleOwnedIdentities, exactPresence } = require('./example-evidence-shutdown-trace.cjs');
        const workerCode = `
        const { parentPort } = require('node:worker_threads');
        const fs = require('node:fs');
        const { spawn } = require('node:child_process');
        const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let exit, initializationError;
        child.once('exit', (code, signal) => { exit = { code, signal }; });
        child.once('error', () => { initializationError = true; });
        child.once('close', (code, signal) => {
            parentPort.postMessage({ type: 'child-closed', pid: child.pid, exit, close: { code, signal } });
            if (initializationError) {
                parentPort.postMessage({ type: 'initialization-error' });
                process.exitCode = 1;
            }
            parentPort.close();
        });
        parentPort.on('message', () => child.kill('SIGTERM'));
        let initialized = false;
        try {
            const tid = Number(fs.readlinkSync('/proc/thread-self').split('/').at(-1));
            parentPort.postMessage({ type: 'ready', tid, processPID: process.pid, childPID: child.pid });
            initialized = true;
        } catch {
            initializationError = true;
        } finally {
            // Do not let the Worker exit while its subprocess still owns resources.
            // The existing close listener reports the failure only after true close.
            if (!initialized) child.kill('SIGTERM');
        }
    `;
        const rootCode = `
        const { Worker } = require('node:worker_threads');
        const worker = new Worker(${JSON.stringify(workerCode)}, { eval: true });
        worker.on('message', message => process.send(message));
        worker.on('error', () => { process.exitCode = 1; });
        worker.once('exit', code => { process.send({ type: 'worker-exit', code }, () => process.disconnect()); });
        process.on('message', () => worker.postMessage('stop'));
    `;
        const child = spawn(process.execPath, ['-e', rootCode], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        child.stdout.resume();
        child.stderr.resume();
        const messages = [];
        let exit;
        child.on('message', (message) => messages.push(message));
        child.once('exit', (code, signal) => {
            exit = { code, signal };
        });
        const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
        let root, target, task, result;
        try {
            const ready = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => settle(Error('fixture readiness deadline')), 6000);
                const onMessage = (message) => {
                    if (message.type === 'ready') settle(null, message);
                    else if (message.type === 'initialization-error') settle(Error('fixture initialization failed'));
                };
                const onError = (error) => settle(error);
                const onExit = () => settle(Error('fixture exited before ready'));
                function settle(error, value) {
                    clearTimeout(timer);
                    child.removeListener('message', onMessage);
                    child.removeListener('error', onError);
                    child.removeListener('exit', onExit);
                    if (error) reject(error);
                    else resolve(value);
                }
                child.on('message', onMessage);
                child.once('error', onError);
                child.once('exit', onExit);
            });
            root = identity(child.pid);
            target = identity(ready.childPID);
            task = identity(ready.tid);
            assert.equal(ready.processPID, child.pid);
            assert.notEqual(ready.tid, child.pid);
            assert.ok(
                fs
                    .readFileSync(`/proc/${child.pid}/task/${ready.tid}/children`, 'utf8')
                    .split(/\s+/)
                    .includes(String(ready.childPID)),
            );
            assert.equal(
                fs
                    .readFileSync(`/proc/${child.pid}/task/${child.pid}/children`, 'utf8')
                    .split(/\s+/)
                    .includes(String(ready.childPID)),
                false,
            );
            const cache = new Map(),
                failures = [];
            result = sampleOwnedIdentities({ root, cache, onFailure: (reason) => failures.push(reason) });
            assert.equal(result.ok, true, JSON.stringify(failures));
            assert.ok(
                [...cache.values()].some(
                    (row) => row.observation.thread.pid === ready.tid && row.observation.process.pid === child.pid,
                ),
            );
            assert.ok([...cache.values()].some((row) => row.observation.process.pid === ready.childPID));
        } finally {
            if (child.connected) child.send('stop', () => {});
            const close = await closed;
            assert.deepEqual(exit, { code: 0, signal: null });
            assert.deepEqual(close, exit);
            const childClose = messages.find((message) => message.type === 'child-closed');
            assert.ok(childClose?.exit && childClose.close);
            assert.deepEqual(childClose.exit, childClose.close);
            assert.ok(
                (childClose.exit.code === null && childClose.exit.signal === 'SIGTERM') ||
                    (childClose.exit.code === 0 && childClose.exit.signal === null),
            );
            assert.equal(messages.find((message) => message.type === 'worker-exit')?.code, 0);
            for (const captured of [root, task, target]) if (captured) assert.equal(exactPresence(captured), 'ABSENT');
        }
    },
);

test('control-only bounds cannot be applied to a target or ordinary positive', () => {
    assert.throws(
        () => buildCommand({ mode: 'target', trace: 'on', control: 'trace-input-bound' }),
        /control-requires/,
    );
    assert.throws(
        () => buildCommand({ mode: 'cpu', cpuCase: 'positive', trace: 'on', control: 'wrapper-term' }),
        /control-requires/,
    );
    const command = buildCommand({
        mode: 'cpu',
        cpuCase: 'hang',
        trace: 'on',
        control: 'wrapper-term',
        out: '/tmp/controlled',
    });
    assert.ok(command.args.includes('--cpu=hang'));
    assert.equal(command.limits.startupMs, 30000);
    assert.equal(command.limits.closeMs, 4000);
    const bound = buildCommand({
        mode: 'cpu',
        cpuCase: 'custodian-delayed-stop-ack',
        trace: 'on',
        control: 'trace-input-bound',
        out: '/tmp/controlled-bound',
    });
    assert.ok(bound.args.includes('--cpu=custodian-delayed-stop-ack'));
    for (const [control, cpuCase] of [
        ['trace-input-bound', 'hang'],
        ['wrapper-term', 'custodian-delayed-stop-ack'],
    ])
        assert.throws(
            () => buildCommand({ mode: 'cpu', cpuCase, trace: 'on', control, out: '/tmp/invalid' }),
            /control-requires/,
        );
});

// Synthetic identity/correlation fixtures only, never trace or production evidence.
function multiTargetAttributionFixture(count = 2) {
    const sender = { pid: 101, tgid: 101, ppid: 99, startTicks: '42', namespace: 'pid:[1]' };
    const stop = { type: 'stop-begin', runtimeId: 'r1', eventId: 1, utc: '2023-11-14T22:13:20.001Z' };
    const exit = { type: 'browser-exit', eventId: 2, code: 0, signal: null, utc: '2023-11-14T22:13:20.003Z' };
    const close = { ...exit, type: 'browser-close', eventId: 3, utc: '2023-11-14T22:13:20.004Z' };
    const raw = { adopted: [], events: [] },
        records = [],
        identities = [sender],
        ownedProcesses = [];
    for (let index = 0; index < count; index++) {
        const target = {
            pid: 202 + index,
            tgid: 202 + index,
            ppid: 99,
            startTicks: String(52 + index),
            namespace: 'pid:[1]',
        };
        const observed = { type: 'adopted-child', eventId: 1 + index * 3, elapsedMs: 1, identity: target };
        const reap = {
            ...target,
            type: 'adopted-waitpid',
            eventId: 2 + index * 3,
            elapsedMs: 10,
            utc: '2023-11-14T22:13:20.010Z',
            rawStatus: 15,
            code: null,
            signal: 'SIGTERM',
        };
        const absent = {
            ...target,
            type: 'adopted-absent',
            eventId: 3 + index * 3,
            elapsedMs: 11,
            utc: '2023-11-14T22:13:20.011Z',
        };
        raw.adopted.push({ ...target, observed, reap, absent });
        raw.events.push(observed, reap, absent);
        identities.push(target);
        ownedProcesses.push({
            ...target,
            firstObserved: { processDiagnostic: { details: { processType: index === 0 ? 'gpu-process' : 'utility' } } },
        });
        records.push({
            kind: 'syscall',
            syscall: 'kill',
            eventId: 1 + index * 2,
            tid: sender.pid,
            timestamp: '1700000000.002200',
            beganAt: '1700000000.002200',
            signal: 'SIGTERM',
            result: 0,
            errno: null,
            target: target.pid,
            targetKind: 'pid-or-group',
            callerProcessIdentity: sender,
            threadIdentity: sender,
            identityObservation: observation(sender),
            targetObservation: observation(target),
        });
        records.push({
            kind: 'delivery',
            eventId: 2 + index * 2,
            tid: target.pid,
            timestamp: '1700000000.005000',
            signal: 'SIGTERM',
            siPid: sender.pid,
            siCode: 'SI_USER',
            processIdentity: target,
            threadIdentity: target,
            identityObservation: observation(target),
        });
    }
    raw.final = { type: 'kernel-final-echild', eventId: count * 3 + 1, elapsedMs: 12, result: 'ECHILD' };
    raw.events.push(raw.final);
    const receipt = {
        custody: { observation: raw },
        ownedProcesses,
        browsers: [{ ...sender, runtimeId: 'r1', exit, close }],
        events: [stop, exit, close],
    };
    return { receipt, records, correlations: correlate(records, identities), identities };
}

test('target attribution reports every signaled descendant and never promotes a partial match', () => {
    const { targetAttribution } = require('./example-evidence-shutdown-trace.cjs');
    for (const count of [0, 1, 2, 3]) {
        const f = multiTargetAttributionFixture(count);
        const result = targetAttribution(f.receipt, f.records, f.correlations);
        assert.equal(result.status, count ? 'MATCHED' : 'UNKNOWN');
        assert.equal(result.targets.length, count);
        assert.equal(
            result.targets.every((row) => row.status === 'MATCHED'),
            true,
        );
    }
    const partial = multiTargetAttributionFixture(3);
    partial.correlations.pop();
    const result = targetAttribution(partial.receipt, partial.records, partial.correlations);
    assert.equal(result.status, 'UNKNOWN');
    assert.deepEqual(
        result.targets.map((row) => row.status),
        ['MATCHED', 'MATCHED', 'UNKNOWN'],
    );
    assert.deepEqual(
        result.targets.map((row) => row.target.pid),
        [202, 203, 204],
    );
    for (const mutate of [
        (f) => {
            f.correlations.pop();
        },
        (f) => {
            f.correlations.push(structuredClone(f.correlations[1]));
        },
        (f) => {
            f.records.push(structuredClone(f.records[3]));
        },
        (f) => {
            f.records.push(structuredClone(f.records[2]));
        },
        (f) => {
            f.correlations[1].deliveryEvent = f.correlations[0].deliveryEvent;
        },
        (f) => {
            f.correlations.push({ ...f.correlations[1], target: { ...f.correlations[1].target, startTicks: '999' } });
        },
        (f) => {
            f.receipt.ownedProcesses.push({ ...f.receipt.ownedProcesses[1], startTicks: '999' });
        },

        (f) => {
            f.correlations[1].target = { ...f.correlations[1].target, startTicks: '999' };
        },
        (f) => {
            f.correlations[1].target = { ...f.correlations[1].target, namespace: 'pid:[9]' };
        },
        (f) => {
            f.correlations[1].sender = { ...f.correlations[1].sender, startTicks: '999' };
        },
        (f) => {
            f.records[3].siPid = 999;
        },
        (f) => {
            f.records[3].identityObservation.imageAfter = null;
        },
        (f) => {
            f.records[2].targetObservation.imageStable = false;
            f.records[2].targetObservation.imageAfter = null;
        },
        (f) => {
            f.records[2].kind = 'syscall-incomplete';
        },
        (f) => {
            f.records[2].result = -1;
            f.records[2].errno = 'ESRCH';
        },
        (f) => {
            f.receipt.ownedProcesses.pop();
        },
        (f) => {
            f.receipt.browsers.push(structuredClone(f.receipt.browsers[0]));
        },
        (f) => {
            f.receipt.events.push(structuredClone(f.receipt.events[0]));
        },
        (f) => {
            f.receipt.browsers[0].close = { ...f.receipt.browsers[0].close, eventId: 99 };
        },
    ]) {
        const f = multiTargetAttributionFixture();
        mutate(f);
        assert.equal(targetAttribution(f.receipt, f.records, f.correlations).status, 'UNKNOWN');
    }
    const foreignRole = multiTargetAttributionFixture();
    foreignRole.receipt.ownedProcesses[1].firstObserved.processDiagnostic.details.processType = 'PRIVATE_TOKEN';
    const neutral = targetAttribution(foreignRole.receipt, foreignRole.records, foreignRole.correlations);
    assert.equal(neutral.status, 'MATCHED');
    assert.equal(neutral.targets[1].targetRoleHint, 'unknown');
    assert.doesNotMatch(JSON.stringify(neutral), /PRIVATE_TOKEN/);
    const unsupported = multiTargetAttributionFixture();
    unsupported.receipt.custody.observation.adopted[1].reap.signal = 'SIGKILL';
    unsupported.receipt.custody.observation.adopted[1].reap.rawStatus = 9;
    const all = targetAttribution(unsupported.receipt, unsupported.records, unsupported.correlations);
    assert.equal(all.status, 'UNKNOWN');
    assert.equal(all.targets.length, 2);
    assert.equal(all.targets[1].signal, 'SIGKILL');
    assert.equal(all.targets[1].reason, 'unsupported-signal-outcome');
    for (const mutate of [
        (f) => {
            f.receipt.custody.observation.adopted.push(structuredClone(f.receipt.custody.observation.adopted[0]));
        },
        (f) => {
            f.receipt.custody.observation.adopted[1].pid = 202;
        },
        (f) => {
            delete f.receipt.custody.observation.adopted[1].absent;
        },
        (f) => {
            f.receipt.custody.observation.adopted[1].absent.startTicks = '999';
        },
    ]) {
        const f = multiTargetAttributionFixture();
        mutate(f);
        assert.throws(() => targetAttribution(f.receipt, f.records, f.correlations), /target-adopted-closure-invalid/);
    }
    const excessive = multiTargetAttributionFixture(BOUNDS.identities + 1);
    assert.throws(
        () => targetAttribution(excessive.receipt, excessive.records, excessive.correlations),
        /target-adopted-closure-invalid/,
    );
});

test('target signal times use exact microseconds and do not require delivery before sender close', () => {
    const { targetAttribution } = require('./example-evidence-shutdown-trace.cjs');
    for (const [send, delivery, expected] of [
        ['002200', '005000', 'MATCHED'], // sender close .004 precedes target delivery
        ['003999', '010999', 'MATCHED'], // last microseconds inside exit/reap receipt precision
        ['004000', '005000', 'UNKNOWN'], // send is outside sender exit interval
        ['002200', '011000', 'UNKNOWN'], // delivery is outside target reap interval
        ['000999', '005000', 'UNKNOWN'], // before sender stop
        ['002200', '002199', 'UNKNOWN'], // before send
    ]) {
        const f = multiTargetAttributionFixture(1);
        f.records[0].beganAt = f.records[0].timestamp = `1700000000.${send}`;
        f.records[1].timestamp = `1700000000.${delivery}`;
        assert.equal(targetAttribution(f.receipt, f.records, f.correlations).status, expected, `${send}/${delivery}`);
    }
});

test(
    'retained dual-descendant target keeps the original failure and requires every exact custody error',
    { skip: !process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT },
    () => {
        const fs = require('node:fs'),
            path = require('node:path');
        const { readTargetDiagnostic } = require('./run-example-shutdown-target.cjs');
        const { expectedOutcome, targetAttribution } = require('./example-evidence-shutdown-trace.cjs');
        const { validateAttemptReceipt } = require('./example-evidence-supervisor.cjs');
        const root = path.join(
            process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT,
            'shutdown-diagnostics-38816671345/target-0',
        );
        if (!fs.existsSync(root)) return;
        const directory = path.join(root, 'diagnostic/target-diagnostic'),
            freeze = JSON.parse(fs.readFileSync(path.join(root, 'freeze.json')));
        const originalReport = fs.readFileSync(path.join(root, 'diagnostic/diagnostic.json'));
        const originalReceipt = fs.readFileSync(path.join(directory, 'attempt-receipt.json'));
        const retained = readTargetDiagnostic({
            directory,
            freeze,
            runnerSha256: freeze.inputs.find((row) => row.path === 'tools/verify/run-example-shutdown-target.cjs')
                .sha256,
        });
        const { receipt } = retained;
        const options = {
            mode: 'target',
            diagnosticProfile: receipt.diagnosticProfile,
            artifactBytes: retained.artifactBytes,
        };
        assert.equal(expectedOutcome(receipt, options), true);
        assert.equal(receipt.ok, false);
        assert.equal(validateAttemptReceipt(receipt).ok, false);
        assert.equal(expectedOutcome(receipt, { mode: 'target' }), false);
        const off = targetAttribution(receipt, [], []);
        assert.equal(off.status, 'UNKNOWN');
        assert.deepEqual(
            off.targets.map((row) => [row.target.pid, row.target.startTicks, row.status]),
            [
                [6548, '21493', 'UNKNOWN'],
                [6610, '21678', 'UNKNOWN'],
            ],
        );
        assert.deepEqual(
            off.targets.map((row) => row.targetRoleHint),
            ['gpu-process', 'utility'],
        );
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'diagnostic/process-identities.json'))), []);
        for (const mutate of [
            (r) => {
                r.custody.observation.errors.pop();
            },
            (r) => {
                r.custody.observation.errors.shift();
            },
            (r) => {
                r.custody.observation.errors.push('unrelated failure');
            },
            (r) => {
                r.custody.observation.errors.push(r.custody.observation.errors[0]);
            },
            (r) => {
                r.custody.observation.adopted.pop();
            },
            (r) => {
                r.custody.observation.adopted.push(structuredClone(r.custody.observation.adopted.at(-1)));
            },
            (r) => {
                delete r.custody.observation.adopted.at(-1).absent;
            },
            (r) => {
                r.custody.observation.adopted.at(-1).reap.rawStatus = 9;
            },
            (r) => {
                r.custody.observation.adopted.at(-1).reap.signal = 'SIGKILL';
            },
            (r) => {
                r.custody.observation.adopted[0].reap.code = 7;
            },
            (r) => {
                r.forced = true;
            },
            (r) => {
                r.timedOut = true;
            },
        ]) {
            const changed = structuredClone(receipt);
            mutate(changed);
            assert.equal(expectedOutcome(changed, options), false);
        }
        assert.deepEqual(fs.readFileSync(path.join(root, 'diagnostic/diagnostic.json')), originalReport);
        assert.deepEqual(fs.readFileSync(path.join(directory, 'attempt-receipt.json')), originalReceipt);
        assert.equal(JSON.parse(originalReport).status, 'FAIL');
    },
);

test(
    'retained real receipt classifications and fail-closed mutations',
    { skip: !process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT },
    () => {
        const fs = require('node:fs'),
            path = require('node:path');
        const { expectedOutcome } = require('./example-evidence-shutdown-trace.cjs');
        const root = process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT;
        for (const cpuCase of ['positive', 'browser-nonzero', 'custodian-delayed-stop-ack']) {
            const receipt = JSON.parse(
                fs.readFileSync(path.join(root, 'quality-cpu-38764015813', cpuCase, 'attempt-receipt.json')),
            );
            assert.equal(expectedOutcome(receipt, { mode: 'cpu', cpuCase }), true);
        }
        const original = JSON.parse(
            fs.readFileSync(path.join(root, 'capture-38764015727/attempts/collector-dodge/1/attempt-receipt.json')),
        );
        assert.equal(original.ok, false);
        assert.equal(expectedOutcome(original, { mode: 'target' }), true);
        const mutations = [
            (row) => {
                row.worker.close = { ...row.worker.close, eventId: 99999 };
            },
            (row) => {
                row.ownedProcesses = [];
                row.ownedGroups = [];
            },
            (row) => {
                row.custody.observation.innerSupervisor.exit.code = 17;
            },
            (row) => {
                row.events.forEach((event) => {
                    event.eventId = 1;
                });
            },
            (row) => {
                row.custody.observation.final.result = 'FAKE';
            },
            (row) => {
                row.errors.push('unrelated collector assertion failed');
            },
        ];
        for (const mutate of mutations) {
            const changed = structuredClone(original);
            mutate(changed);
            assert.equal(expectedOutcome(changed, { mode: 'target' }), false);
        }
    },
);

test(
    'browser-nonzero pending stop ACK requires the exact retained drain and physical closure',
    { skip: !process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT },
    () => {
        const fs = require('node:fs'),
            path = require('node:path');
        const { expectedOutcome } = require('./example-evidence-shutdown-trace.cjs');
        const root = process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT;
        const names = [
            'cpu-capture-38774702281/browser-nonzero/attempt-receipt.json',
            'cpu-capture-38784147029/browser-nonzero/attempt-receipt.json',
            'quality-cpu-38784147193/browser-nonzero/attempt-receipt.json',
            'shutdown-diagnostics-38784147029/cpu-browser-nonzero-off/attempt/attempt-receipt.json',
        ];
        const options = { mode: 'cpu', cpuCase: 'browser-nonzero' };
        const editProof = (r, changes) => {
            for (const rows of [r.custody.observation.barriers, r.custody.observation.events])
                for (const row of rows)
                    if (row.type === 'runtime-custody-barrier' && row.phase === 'stop') Object.assign(row, changes);
        };
        const response = (r) => r.events.find((row) => row.type === 'custody-request-settled' && row.phase === 'stop');
        const changeEveryEventAlias = (value, type, field, replacement) => {
            if (!value || typeof value !== 'object') return;
            if (value.type === type) value[field] = replacement;
            for (const item of Object.values(value)) changeEveryEventAlias(item, type, field, replacement);
        };
        let retained = 0;
        for (const name of names) {
            const file = path.join(root, name);
            if (!fs.existsSync(file)) continue;
            retained++;
            const original = JSON.parse(fs.readFileSync(file));
            assert.equal(original.ok, false);
            assert.equal(expectedOutcome(original, options), true, name);
            const mutations = [
                (r) => editProof(r, { requestId: 999 }),
                (r) => editProof(r, { phase: 'start' }),
                (r) => editProof(r, { runtimeId: 'runtime-wrong' }),
                (r) => editProof(r, { workerPID: r.worker.pid + 1 }),
                (r) => editProof(r, { workerStartTicks: '1' }),
                (r) => editProof(r, { directChildren: [] }),
                (r) => editProof(r, { ok: false }),
                (r) => editProof(r, { utc: new Date(Date.parse(response(r).receivedUtc) + 1).toISOString() }),
                (r) => {
                    response(r).requestId = 999;
                },
                (r) => {
                    response(r).phase = 'start';
                },
                (r) => {
                    response(r).outcome = 'deadline';
                },
                (r) => {
                    response(r).supervisorElapsedMs = r.worker.close.supervisorElapsedMs - 1;
                },
                (r) => {
                    response(r).supervisorElapsedMs =
                        r.runtimes[0].stopBegin.supervisorElapsedMs + r.limits.closeMs + 1;
                },
                (r) => {
                    response(r).receivedUtc = r.custody.observation.innerSupervisor.exit.utc;
                },
                (r) => {
                    r.events = r.events.filter((row) => row !== response(r));
                },
                (r) => {
                    r.events.push({ ...response(r), eventId: 999 });
                },
                (r) => {
                    r.custody.observation.barriers.find((row) => row.phase === 'stop').elapsedMs += 1;
                },
                (r) => {
                    r.servers[0].close = null;
                },
                (r) => {
                    r.runtimes[0].stopBegin.workerPID += 1;
                },
                (r) => {
                    r.custody.observation.innerSupervisor.exit.code = 7;
                },
                (r) => {
                    r.custody.observation.final.result = 'UNKNOWN';
                },
                (r) => {
                    delete r.custody.artifacts.nodeReceipt;
                },
                (r) => {
                    r.forced = true;
                },
                (r) => {
                    r.timedOut = true;
                },
                (r) => {
                    r.custody.observation.errors.push('unrelated failure');
                },
                (r) => {
                    r.errors.push('unrelated collector assertion');
                },
            ];
            for (const [type, fields] of [
                [
                    'browser-exit',
                    ['pid', 'runtimeId', 'launchId', 'workerPID', 'namespace', 'source', 'cpuDummy', 'type'],
                ],
                [
                    'browser-close',
                    ['pid', 'runtimeId', 'launchId', 'workerPID', 'namespace', 'source', 'cpuDummy', 'type'],
                ],
                [
                    'server-close',
                    [
                        'serverId',
                        'runtimeId',
                        'ownerPID',
                        'workerPID',
                        'namespace',
                        'physicalProcess',
                        'source',
                        'cpuDummy',
                        'type',
                    ],
                ],
                ['stop-begin', ['runtimeId', 'launchId', 'workerPID', 'namespace', 'source', 'cpuDummy', 'type']],
            ]) {
                for (const field of fields)
                    mutations.push((r) =>
                        changeEveryEventAlias(
                            r,
                            type,
                            field,
                            field.endsWith('PID') || field === 'pid' ? 999999 : 'wrong-binding',
                        ),
                    );
            }
            for (const [index, mutate] of mutations.entries()) {
                const changed = structuredClone(original);
                mutate(changed);
                assert.equal(expectedOutcome(changed, options), false, `${name} mutation ${index}`);
                assert.equal(changed.ok, false);
            }
        }
        assert.ok(retained > 0, 'at least one genuine pending stop-ACK fixture is required');
        const prior = JSON.parse(
            fs.readFileSync(path.join(root, 'quality-cpu-38764015813/browser-nonzero/attempt-receipt.json')),
        );
        assert.equal(expectedOutcome(prior, options), true);
        prior.errors.push('Custody barrier remained pending at worker closure');
        assert.equal(
            expectedOutcome(prior, options),
            false,
            'an earlier response cannot prove a pending-at-closure failure',
        );
    },
);

test(
    'all browser-nonzero variants reject event grafts even with synchronized aliases and rehashed node receipts',
    { skip: !process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT },
    () => {
        const fs = require('node:fs'),
            path = require('node:path'),
            crypto = require('node:crypto');
        const { expectedOutcome } = require('./example-evidence-shutdown-trace.cjs');
        const { validateCustodyArtifacts } = require('./example-evidence-supervisor.cjs');
        const root = process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT;
        const walk = (value, type, field, replacement) => {
            if (!value || typeof value !== 'object') return;
            if (value.type === type) value[field] = replacement;
            for (const item of Object.values(value)) walk(item, type, field, replacement);
        };
        const names = [
            'quality-cpu-38764015813/browser-nonzero/attempt-receipt.json',
            'cpu-capture-38772137122/browser-nonzero/attempt-receipt.json',
            'cpu-capture-38774702281/browser-nonzero/attempt-receipt.json',
            'cpu-capture-38784147029/browser-nonzero/attempt-receipt.json',
            'quality-cpu-38784147193/browser-nonzero/attempt-receipt.json',
            'shutdown-diagnostics-38784147029/cpu-browser-nonzero-off/attempt/attempt-receipt.json',
        ];
        let retained = 0;
        for (const name of names) {
            const file = path.join(root, name);
            if (!fs.existsSync(file)) continue;
            retained++;
            const original = JSON.parse(fs.readFileSync(file)),
                options = { mode: 'cpu', cpuCase: 'browser-nonzero' };
            assert.equal(expectedOutcome(original, options), true);
            for (const [type, fields] of [
                [
                    'browser-exit',
                    ['pid', 'runtimeId', 'launchId', 'workerPID', 'namespace', 'source', 'cpuDummy', 'type'],
                ],
                [
                    'browser-close',
                    ['pid', 'runtimeId', 'launchId', 'workerPID', 'namespace', 'source', 'cpuDummy', 'type'],
                ],
                [
                    'server-close',
                    [
                        'serverId',
                        'runtimeId',
                        'ownerPID',
                        'workerPID',
                        'namespace',
                        'physicalProcess',
                        'source',
                        'cpuDummy',
                        'type',
                    ],
                ],
                ['stop-begin', ['runtimeId', 'launchId', 'workerPID', 'namespace', 'source', 'cpuDummy', 'type']],
            ])
                for (const field of fields) {
                    const changed = structuredClone(original);
                    walk(changed, type, field, field.endsWith('PID') || field === 'pid' ? 999999 : 'wrong-binding');
                    assert.equal(expectedOutcome(changed, options), false, `${name} ${type}.${field}`);
                }
            for (const [type, field, replacement] of [
                ['browser-exit', 'pid', 999999],
                ['browser-close', 'pid', 999999],
                ['browser-exit', 'runtimeId', 'foreign'],
                ['server-close', 'runtimeId', 'foreign'],
                ['server-close', 'serverId', 'foreign'],
            ]) {
                const changed = structuredClone(original),
                    artifacts = {};
                for (const [role, reference] of Object.entries(original.custody.artifacts)) {
                    const bytes = fs.readFileSync(path.join(path.dirname(file), path.basename(reference.path)));
                    assert.equal(bytes.length, reference.bytes);
                    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), reference.sha256);
                    artifacts[role] = ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(bytes) : bytes;
                }
                walk(changed, type, field, replacement);
                walk(artifacts.nodeReceipt, type, field, replacement);
                const syntheticBytes = Buffer.from(JSON.stringify(artifacts.nodeReceipt, null, 2) + '\n');
                changed.custody.artifacts.nodeReceipt.bytes = syntheticBytes.length;
                changed.custody.artifacts.nodeReceipt.sha256 = crypto
                    .createHash('sha256')
                    .update(syntheticBytes)
                    .digest('hex');
                assert.equal(
                    validateCustodyArtifacts(changed, artifacts).ok,
                    true,
                    'artifact consistency alone cannot prove ownership',
                );
                assert.equal(expectedOutcome(changed, options), false, `${name} rehashed ${type}.${field}`);
                assert.equal(changed.ok, false);
            }
        }
        assert.ok(retained >= 2, 'genuine ACK-before-close and pending-ACK fixtures are required');
    },
);

async function closeGuardedControl(action, lifetime) {
    try {
        return await action();
    } finally {
        if (!lifetime.isClosed()) lifetime.cancelExact();
        await lifetime.closed;
    }
}
function requireControlBudget(epoch, now = Date.now()) {
    const deadline = Number(epoch);
    assert.ok(Number.isSafeInteger(deadline) && deadline > 0, 'explicit global control deadline required');
    assert.ok(deadline * 1000 - now >= 180000, 'insufficient original global budget; no control spawned');
}

function assertExpectedControlErrors(report, control) {
    assert.ok(['wrapper-term', 'trace-input-bound'].includes(control));
    const expected = control === 'wrapper-term' ? 'diagnostic-wrapper-interrupted' : 'trace-input-bound';
    assert.deepEqual([...report.errors].sort(), [expected, 'intentional-wrapper-negative-control'].sort());
    assert.equal(report.trace.ok, control === 'wrapper-term');
    assert.equal(report.trace.reason, control === 'wrapper-term' ? null : 'trace-input-bound');
    if (control === 'trace-input-bound') {
        const trace = report.trace;
        assert.ok(Number.isSafeInteger(trace.inputBoundArmedAtBytes) && trace.inputBoundArmedAtBytes >= 0);
        assert.equal(trace.inputLimit, trace.inputBoundArmedAtBytes);
        assert.ok(
            Number.isSafeInteger(trace.inputBoundTriggeredAtBytes) &&
                trace.inputBoundTriggeredAtBytes > trace.inputLimit,
        );
        assert.ok(trace.inputBytes >= trace.inputBoundTriggeredAtBytes);
    }
}

test('live controls reject every unrelated parser or identity failure before another case can start', () => {
    for (const control of ['wrapper-term', 'trace-input-bound']) {
        const expected = control === 'wrapper-term' ? 'diagnostic-wrapper-interrupted' : 'trace-input-bound';
        const report = {
            errors: [expected, 'intentional-wrapper-negative-control'],
            trace: {
                ok: control === 'wrapper-term',
                reason: control === 'wrapper-term' ? null : 'trace-input-bound',
                inputBoundArmedAtBytes: 10,
                inputLimit: 10,
                inputBoundTriggeredAtBytes: 20,
                inputBytes: 20,
            },
        };
        assertExpectedControlErrors(report, control);
        if (control === 'trace-input-bound') {
            for (const value of [null, 0, 10, NaN])
                assert.throws(() =>
                    assertExpectedControlErrors(
                        { ...report, trace: { ...report.trace, inputBoundTriggeredAtBytes: value } },
                        control,
                    ),
                );
        }
        for (const error of [
            'trace-enum-rejected',
            'trace-grammar-rejected',
            'trace-clock-annotation-rejected',
            'original-outer-identity-unavailable',
            'control-original-closure-unavailable',
            expected,
        ]) {
            let nextStarted = false;
            assert.throws(() => {
                assertExpectedControlErrors({ ...report, errors: [...report.errors, error] }, control);
                nextStarted = true;
            });
            assert.equal(nextStarted, false);
        }
        assert.throws(() => assertExpectedControlErrors({ ...report, errors: [expected] }, control));
        assert.throws(() =>
            assertExpectedControlErrors({ ...report, trace: { ok: false, reason: 'trace-enum-rejected' } }, control),
        );
    }
    const fs = require('node:fs'),
        path = require('node:path');
    const root = process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT;
    const oldReport =
        root && path.join(root, 'shutdown-diagnostics-38776059963', 'live-controls', 'wrapper-term', 'diagnostic.json');
    if (oldReport && fs.existsSync(oldReport)) {
        const report = JSON.parse(fs.readFileSync(oldReport));
        assert.equal(report.physicalClosure, true);
        assert.throws(() => assertExpectedControlErrors(report, 'wrapper-term'));
    }
});

test('missing ready and malformed marker always cancel and await close before returning failure', async () => {
    for (const error of [Error('missing-ready'), SyntaxError('bad-marker')]) {
        const order = [];
        let closed = false,
            resolve;
        const lifetime = {
            isClosed: () => closed,
            closed: new Promise((done) => {
                resolve = done;
            }),
            cancelExact: () => {
                order.push('cancel');
                setTimeout(() => {
                    closed = true;
                    order.push('close');
                    resolve();
                }, 5);
            },
        };
        let nextStarted = false;
        await assert.rejects(async () => {
            await closeGuardedControl(async () => {
                throw error;
            }, lifetime);
            nextStarted = true;
        }, error);
        assert.deepEqual(order, ['cancel', 'close']);
        assert.equal(nextStarted, false);
    }
    let spawned = false;
    assert.throws(() => {
        requireControlBudget(100, 99000);
        spawned = true;
    });
    assert.equal(spawned, false);
    assert.throws(() => requireControlBudget(undefined));
});

function assertOriginalControlClosure(out, ready, report) {
    const fs = require('node:fs'),
        path = require('node:path'),
        crypto = require('node:crypto');
    const { validObservation, receiptIdentities } = require('./example-evidence-shutdown-trace.cjs');
    const same = (a, b) => a && b && a.pid === b.pid && a.startTicks === b.startTicks && a.namespace === b.namespace;
    assert.equal(validObservation(ready.innerObservation), true);
    assert.equal(validObservation(ready.custodianObservation), true);
    assert.ok(same(ready.innerObservation.root, ready.originalOuter));
    assert.ok(same(ready.custodianObservation.root, ready.originalOuter));
    const receipt = JSON.parse(fs.readFileSync(path.join(out, 'attempt', 'attempt-receipt.json')));
    const raw = receipt.custody.observation;
    for (const reference of Object.values(receipt.custody.artifacts)) {
        const bytes = fs.readFileSync(reference.path);
        assert.equal(bytes.length, reference.bytes);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), reference.sha256);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(receipt.custody.artifacts.raw.path)), raw);
    const journal = fs
        .readFileSync(receipt.custody.artifacts.journal.path, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse);
    assert.deepEqual(journal, raw.events);
    assert.ok(same(raw.custodian, ready.custodianObservation.process));
    assert.ok(same(raw.innerSupervisor, ready.innerObservation.process));
    assert.equal(raw.custodian.ppid, ready.originalOuter.pid);
    let previous = -1;
    raw.events.forEach((row, index) => {
        assert.equal(row.eventId, index + 1);
        assert.ok(row.elapsedMs >= previous);
        previous = row.elapsedMs;
    });
    const exact = (row) => {
        assert.ok(row);
        assert.deepEqual(raw.events[row.eventId - 1], row);
    };
    exact(raw.final);
    assert.equal(raw.final.result, 'ECHILD');
    for (const row of [raw.innerSupervisor.exit, raw.innerSupervisor.stdoutEOF, raw.innerSupervisor.stderrEOF]) {
        exact(row);
        assert.ok(row.eventId < raw.final.eventId);
    }
    for (const row of raw.adopted) {
        exact(row.reap);
        exact(row.absent);
        assert.ok(same(row, row.reap) && same(row, row.absent));
        assert.ok(row.reap.eventId < row.absent.eventId && row.absent.eventId < raw.final.eventId);
        assert.ok(Number.isInteger(row.reap.rawStatus));
    }
    const wrapper = receipt.custody.wrapper;
    assert.ok(
        wrapper.exit &&
            wrapper.close &&
            wrapper.exit.elapsedMs >= raw.final.elapsedMs &&
            wrapper.close.elapsedMs >= wrapper.exit.elapsedMs,
    );
    assert.equal(wrapper.exit.code, wrapper.close.code);
    assert.equal(wrapper.exit.signal, wrapper.close.signal);
    const tracerExit = report.events.find((row) => row.type === 'tracer-exit');
    const tracerClose = report.events.find((row) => row.type === 'tracer-stdio-close');
    assert.ok(tracerExit && tracerClose && tracerExit.elapsedMs <= tracerClose.elapsedMs);
    assert.equal(tracerExit.code, tracerClose.code);
    assert.equal(tracerExit.signal, tracerClose.signal);
    for (const name of ['tracer-stdout-eof', 'tracer-stderr-eof', 'trace-fifo-eof'])
        assert.ok(report.events.some((row) => row.type === name));
    const identities = [
        ...receiptIdentities(receipt),
        ready.originalOuter,
        report.events.find((row) => row.type === 'tracer-spawn').identity,
    ];
    for (const row of identities) {
        let current = null;
        try {
            const text = fs.readFileSync(`/proc/${row.pid}/stat`, 'utf8');
            current = {
                pid: row.pid,
                startTicks: text.slice(text.lastIndexOf(')') + 2).split(' ')[19],
                namespace: fs.readlinkSync(`/proc/${row.pid}/ns/pid`),
            };
            assert.ok(
                /^\d+$/.test(current.startTicks) && /^pid:\[\d+\]$/.test(current.namespace),
                'malformed process metadata is unknown',
            );
        } catch (error) {
            if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
        }
        assert.equal(!!same(row, current), false, 'exact recorded identity remains after control');
    }
}

test(
    'live strace wrapper cancellation and hard-input-bound controls',
    {
        skip: process.env.EXAMPLE_EVIDENCE_LIVE_STRACE_CONTROLS !== '1',
        timeout: 370000,
    },
    async (t) => {
        const fs = require('node:fs'),
            path = require('node:path'),
            { spawn } = require('node:child_process');
        const root = process.env.EXAMPLE_EVIDENCE_TRACE_CONTROL_OUT;
        assert.ok(root && path.isAbsolute(root), 'explicit retained control directory required');
        assert.equal(fs.existsSync(root), false, 'never overwrite controls');
        fs.mkdirSync(root, { recursive: true });
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const ticks = (pid) => {
            try {
                const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
                return raw.slice(raw.lastIndexOf(')') + 2).split(' ')[19];
            } catch {
                return null;
            }
        };
        for (const control of ['wrapper-term', 'trace-input-bound']) {
            requireControlBudget(process.env.EXAMPLE_EVIDENCE_TRACE_DEADLINE_EPOCH);
            let succeeded = false;
            await t.test(control, { timeout: 182000 }, async (t) => {
                const out = path.join(root, control);
                const args = [
                    path.join(__dirname, 'example-evidence-shutdown-trace.cjs'),
                    '--mode=cpu',
                    `--case=${control === 'wrapper-term' ? 'hang' : 'custodian-delayed-stop-ack'}`,
                    '--trace=on',
                    `--control=${control}`,
                    `--out=${out}`,
                    `--strace=${process.env.STRACE_PATH}`,
                    `--strace-sha256=${process.env.STRACE_SHA256}`,
                    `--strace-version=${process.env.STRACE_VERSION}`,
                ];
                const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
                const initial = ticks(child.pid);
                child.stdout.resume();
                child.stderr.resume();
                let closed = false;
                const result = new Promise((resolve) =>
                    child.once('close', (code, signal) => {
                        closed = true;
                        resolve({ code, signal });
                    }),
                );
                const cancelExact = () => {
                    if (!closed && initial && ticks(child.pid) === initial) child.kill('SIGTERM');
                };
                const onAbort = () => cancelExact();
                t.signal.addEventListener('abort', onAbort, { once: true });
                try {
                    await closeGuardedControl(
                        async () => {
                            const readyFile = path.join(out, 'control-ready.json');
                            const deadline = Date.now() + 17000;
                            while (!fs.existsSync(readyFile) && !closed && !t.signal.aborted && Date.now() < deadline)
                                await delay(10);
                            assert.equal(
                                fs.existsSync(readyFile),
                                true,
                                'real original start custody barrier required before cancellation',
                            );
                            const ready = JSON.parse(fs.readFileSync(readyFile));
                            assert.equal(ready.wrapperPID, child.pid);
                            assert.ok(ready.originalOuter?.startTicks && ready.originalOuter?.namespace);
                            if (control === 'wrapper-term') {
                                assert.equal(ticks(child.pid), initial);
                                child.kill('SIGTERM');
                            }
                            const exit = await result;
                            assert.equal(exit.code, 1);
                            assert.equal(exit.signal, null);
                            const report = JSON.parse(fs.readFileSync(path.join(out, 'diagnostic.json')));
                            assert.equal(report.diagnosticComplete, false);
                            assert.equal(report.canonicalEligible, false);
                            assert.equal(report.physicalClosure, true, JSON.stringify(report.errors));
                            assertOriginalControlClosure(out, ready, report);
                            assertExpectedControlErrors(report, control);
                            if (control === 'trace-input-bound') {
                                assert.deepEqual(ready.inputBoundArm, {
                                    inputBytes: report.trace.inputBoundArmedAtBytes,
                                    inputLimit: report.trace.inputLimit,
                                });
                                assert.ok(
                                    report.events.some(
                                        (event) =>
                                            event.type === 'control-input-bound-armed' &&
                                            event.inputBytes === ready.inputBoundArm.inputBytes,
                                    ),
                                );
                            }
                            assert.ok(
                                report.events.some(
                                    (event) =>
                                        event.type === 'original-outer-signal' &&
                                        event.signal === 'SIGTERM' &&
                                        event.identity.pid === ready.originalOuter.pid &&
                                        event.identity.startTicks === ready.originalOuter.startTicks,
                                ),
                            );
                            assert.ok(
                                report.errors.includes(
                                    control === 'wrapper-term' ? 'diagnostic-wrapper-interrupted' : 'trace-input-bound',
                                ),
                            );
                            assert.ok(Date.now() <= Number(process.env.EXAMPLE_EVIDENCE_TRACE_DEADLINE_EPOCH) * 1000);
                            succeeded = true;
                        },
                        { isClosed: () => closed, cancelExact, closed: result },
                    );
                } finally {
                    t.signal.removeEventListener('abort', onAbort);
                }
            });
            assert.equal(succeeded, true, 'stop the entire live suite after any failure; never overlap another tree');
        }
    },
);

test('record callback errors and unavailable children interfaces retain only fixed reasons', () => {
    let failure;
    const parser = createParser({
        onRecord: () => {
            throw Error('PRIVATE_TOKEN arbitrary path');
        },
        onFailure: (reason) => {
            failure = reason;
        },
    });
    parser.push(Buffer.from('101 1700000000.000001 kill(202, SIGTERM) = 0\n'));
    assert.equal(failure, 'trace-record-processing-failed');
    assert.doesNotMatch(JSON.stringify(parser.finish()), /PRIVATE_TOKEN|arbitrary path/);
    const { checkChildrenInterface } = require('./example-evidence-shutdown-trace.cjs');
    assert.equal(
        checkChildrenInterface(() => '1 2 3 '),
        true,
    );
    assert.equal(
        checkChildrenInterface(() => ''),
        true,
    );
    for (const read of [
        () => {
            throw Error('PRIVATE_TOKEN');
        },
        () => 'x',
        () => '999999999999999999999999999',
        () => '1 '.repeat(5000),
    ])
        assert.throws(() => checkChildrenInterface(read), { message: 'owned-children-interface-unavailable' });
});

test('exact absence distinguishes missing, denied, corrupt, live and reused identities', () => {
    const { exactPresence, validImage } = require('./example-evidence-shutdown-trace.cjs');
    const expected = { pid: 202, startTicks: '52', namespace: 'pid:[1]' };
    for (const code of ['ENOENT', 'ESRCH', 'EACCES', 'EPERM', 'EIO']) {
        const io = {
            readFileSync: () => {
                throw Object.assign(Error('PRIVATE_TOKEN'), { code });
            },
        };
        assert.equal(exactPresence(expected, io), ['ENOENT', 'ESRCH'].includes(code) ? 'ABSENT' : 'UNKNOWN');
    }
    const stat = (ticks) => '202 (node) ' + ['S', '99', ...Array(17).fill('0'), ticks].join(' ');
    assert.equal(exactPresence(expected, { readFileSync: () => stat('52'), readlinkSync: () => 'pid:[1]' }), 'PRESENT');
    assert.equal(exactPresence(expected, { readFileSync: () => stat('99'), readlinkSync: () => 'pid:[1]' }), 'ABSENT');
    assert.equal(exactPresence(expected, { readFileSync: () => 'bad-stat', readlinkSync: () => 'pid:[1]' }), 'UNKNOWN');
    assert.equal(
        exactPresence(expected, { readFileSync: () => stat('52'), readlinkSync: () => 'bad-namespace' }),
        'UNKNOWN',
    );
    let reads = 0;
    assert.equal(
        exactPresence(expected, { readFileSync: () => stat(String(++reads)), readlinkSync: () => 'pid:[1]' }),
        'UNKNOWN',
    );
    for (const image of [
        {},
        null,
        { dev: 1, ino: 2, size: 3, mtimeMs: NaN },
        { dev: 1, ino: 2, size: -1, mtimeMs: 4 },
        { dev: 1, ino: 2, size: 3 },
    ])
        assert.equal(validImage(image), false);
    assert.equal(validImage({ dev: 1, ino: 2, size: 3, mtimeMs: 4 }), true);
});

// Synthetic schema-only originals are rebuilt in memory. They are never browser evidence or published artifacts.
function rejectedStopSchemaFixture() {
    const fs = require('node:fs'),
        os = require('node:os'),
        path = require('node:path');
    const fixture = require('./example-evidence-campaign.cpu-fixture.cjs');
    const { DEFAULT_LIMITS, validateAttemptReceipt } = require('./example-evidence-supervisor.cjs');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'late-stop-schema-only-'));
    const startedAt = new Date(Date.now() - 10000).toISOString();
    const receipt = fixture.makeReceipt(
        { id: 'cpu-example', shell: false, modes: [{ id: 'primary', viewport: { width: 480, height: 360 } }] },
        { createdAt: startedAt, runtimeIdentity: fixture.identity, limits: DEFAULT_LIMITS },
        {
            report: path.join(directory, 'collector.json'),
            artifactDir: path.join(directory, 'artifacts'),
            receipt: path.join(directory, 'attempt-receipt.json'),
            stdout: path.join(directory, 'worker.stdout.log'),
            stderr: path.join(directory, 'worker.stderr.log'),
        },
        true,
    );
    const seen = new Set();
    const normalize = (value) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        for (const [key, item] of Object.entries(value)) {
            if (item === 'synthetic-pid-namespace') value[key] = 'pid:[1]';
            else if (item === 'synthetic-runtime-0') value[key] = 'runtime-1';
            else normalize(item);
        }
    };
    normalize(receipt);
    receipt.cpuCase = 'browser-nonzero';
    receipt.ok = false;
    const raw = receipt.custody.observation,
        inner = raw.innerSupervisor,
        wrapper = receipt.custody.wrapper;
    const runtime = receipt.runtimes[0],
        browser = receipt.browsers[0],
        server = receipt.servers[0];
    receipt.events = receipt.events.filter(
        (row) =>
            !['stop-complete', 'observer-complete'].includes(row.type) &&
            !(row.type === 'custody-barrier-ack' && row.phase === 'stop'),
    );
    runtime.stopComplete = null;
    runtime.stopBegin.launchId = browser.launchId;
    for (const row of [browser.exit, browser.close]) {
        row.code = 7;
        row.runtimeId = runtime.runtimeId;
    }
    server.close.physicalProcess = 'collector-worker';
    receipt.worker.exit.code = receipt.worker.close.code = 124;
    let sequence = 0;
    receipt.events.forEach((row, index) => {
        row.eventId = index + 1;
        row.supervisorElapsedMs = (index + 1) * 10;
        row.receivedUtc = new Date(Date.parse(startedAt) + row.supervisorElapsedMs).toISOString();
        if (row.source === 'observer') row.sequence = ++sequence;
    });
    const last = receipt.events.at(-1).supervisorElapsedMs;
    const closing = raw.barriers.find((row) => row.phase === 'closing');
    raw.events = raw.events.filter((row) => row.eventId <= closing.eventId);
    raw.barriers = raw.events.filter((row) => row.type === 'runtime-custody-barrier');
    const start = raw.barriers[0],
        ack = receipt.events.find((row) => row.type === 'custody-barrier-ack');
    start.namespace = receipt.worker.namespace;
    start.nodeSupervisorPID = inner.pid;
    start.elapsedMs = ack.supervisorElapsedMs - 1;
    start.utc = new Date(Date.parse(startedAt) + start.elapsedMs).toISOString();
    const closingAck = receipt.events.find((row) => row.type === 'custody-barrier-ack' && row.phase === 'closing');
    closing.namespace = receipt.worker.namespace;
    closing.nodeSupervisorPID = inner.pid;
    closing.elapsedMs = closingAck.supervisorElapsedMs - 1;
    closing.utc = new Date(Date.parse(startedAt) + closing.elapsedMs).toISOString();
    closing.closeBudget = {
        originEventId: runtime.stopBegin.eventId,
        originElapsedMs: runtime.stopBegin.supervisorElapsedMs,
        deadlineMs: runtime.stopBegin.supervisorElapsedMs + receipt.limits.closeMs,
    };
    closing.deadlineMs = closing.closeBudget.deadlineMs;
    const rawEvent = (type, elapsedMs, values = {}) => {
        const row = {
            type,
            eventId: raw.events.length + 1,
            elapsedMs,
            utc: new Date(Date.parse(startedAt) + elapsedMs).toISOString(),
            ...values,
        };
        raw.events.push(row);
        return row;
    };
    const failure = 'Barrier stop rejected: collector worker is not the exact current process';
    raw.errors = [failure];
    rawEvent('custody-error', last + 1, { message: failure });
    const proof = rawEvent('runtime-custody-rejection', last + 2, {
        requestId: 3,
        workerPID: receipt.worker.pid,
        workerStartTicks: receipt.worker.startTicks,
        namespace: receipt.worker.namespace,
        nodeSupervisorPID: inner.pid,
        runtimeId: runtime.runtimeId,
        phase: 'stop',
        startEventId: start.eventId,
        reason: 'worker-absent',
        currentState: 'ABSENT',
        currentPeer: null,
        ok: false,
        transport: 'inherited-anonymous-pipes/v1',
    });
    const nodeEvent = (type, elapsedMs, values = {}) => {
        const row = {
            type,
            source: 'supervisor',
            eventId: receipt.events.length + 1,
            supervisorElapsedMs: elapsedMs,
            receivedUtc: new Date(Date.parse(startedAt) + elapsedMs).toISOString(),
            ...values,
        };
        receipt.events.push(row);
        return row;
    };
    nodeEvent('custody-barrier-rejected', last + 3, {
        requestId: 3,
        runtimeId: runtime.runtimeId,
        phase: 'stop',
        custodianPID: wrapper.pid,
        custodyEventId: proof.eventId,
        startEventId: start.eventId,
        workerPID: receipt.worker.pid,
        workerStartTicks: receipt.worker.startTicks,
        namespace: receipt.worker.namespace,
        reason: proof.reason,
        ok: false,
    });
    nodeEvent('custody-request-settled', last + 4, {
        requestId: 3,
        runtimeId: runtime.runtimeId,
        phase: 'stop',
        outcome: 'rejected-response',
    });
    inner.exit = rawEvent('inner-supervisor-waitpid', last + 5, { code: 0, signal: null });
    inner.stdoutEOF = rawEvent('inner-supervisor-stdout-eof', last + 6);
    inner.stderrEOF = rawEvent('inner-supervisor-stderr-eof', last + 7);
    raw.final = rawEvent('kernel-final-echild', last + 8, { result: 'ECHILD' });
    raw.restored = rawEvent('kernel-subreaper-restored', last + 9, { expected: 0, observed: 0 });
    raw.endedAt = raw.restored.utc;
    wrapper.exit = {
        type: 'custodian-exit',
        code: 1,
        signal: null,
        elapsedMs: last + 10,
        utc: new Date(Date.parse(startedAt) + last + 10).toISOString(),
    };
    wrapper.close = {
        type: 'custodian-stdio-close',
        code: 1,
        signal: null,
        elapsedMs: last + 11,
        utc: new Date(Date.parse(startedAt) + last + 11).toISOString(),
    };
    receipt.endedAt = new Date(Date.parse(startedAt) + last + 12).toISOString();
    receipt.errors = [
        failure,
        'Custody barrier remained pending at worker closure',
        'Custody IPC: kernel barrier rejected',
        'Custody IPC: collector disconnected before response',
        'unclean browser exit: 7/null',
        'unclean browser close: 7/null',
        'worker exited 124',
        'Custodian did not exit/close cleanly',
    ];
    receipt.lifecycleErrors = receipt.errors.filter((value) => value !== 'worker exited 124');
    const structural = validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false });
    receipt.errors.push(...structural.errors);
    receipt.lifecycleErrors.push(...structural.errors);
    return { receipt, artifactBytes: rebuildSchemaOriginals(receipt) };
}

function rebuildSchemaOriginals(receipt) {
    const crypto = require('node:crypto');
    const nodeReceipt = structuredClone(receipt);
    delete nodeReceipt.custody;
    nodeReceipt.pending = true;
    nodeReceipt.coreOk = false;
    nodeReceipt.ok = false;
    nodeReceipt.output.receipt = receipt.custody.artifacts.nodeReceipt.path;
    const raw = receipt.custody.observation;
    const bytes = {
        raw: Buffer.from(JSON.stringify(raw)),
        nodeReceipt: Buffer.from(JSON.stringify(nodeReceipt)),
        journal: Buffer.from(raw.events.map((row) => JSON.stringify(row)).join('\n') + '\n'),
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
    };
    for (const [role, value] of Object.entries(bytes)) {
        receipt.custody.artifacts[role].bytes = value.length;
        receipt.custody.artifacts[role].sha256 = crypto.createHash('sha256').update(value).digest('hex');
    }
    return bytes;
}

test('late-stop browser-7 diagnostic accepts only a complete rejected failure chain, never production PASS', () => {
    const { expectedOutcome } = require('./example-evidence-shutdown-trace.cjs');
    const { validateAttemptReceipt } = require('./example-evidence-supervisor.cjs');
    const { receipt, artifactBytes } = rejectedStopSchemaFixture();
    const options = { mode: 'cpu', cpuCase: 'browser-nonzero', artifactBytes };
    assert.equal(expectedOutcome(receipt, options), true, JSON.stringify(receipt.errors));
    assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true, requireSuccess: false }).ok, false);
    assert.equal(expectedOutcome(receipt, { ...options, mode: 'target' }), false);
    for (const role of ['raw', 'nodeReceipt', 'journal', 'stdout', 'stderr']) {
        const absent = { ...artifactBytes };
        delete absent[role];
        assert.equal(expectedOutcome(receipt, { ...options, artifactBytes: absent }), false, `${role} absent`);
        assert.equal(
            expectedOutcome(receipt, {
                ...options,
                artifactBytes: {
                    ...artifactBytes,
                    [role]: Buffer.concat([artifactBytes[role], Buffer.from('tampered')]),
                },
            }),
            false,
            `${role} tampered`,
        );
    }
    assert.equal(expectedOutcome(receipt, { mode: 'cpu', cpuCase: 'browser-nonzero' }), false);
    const proof = (r) => r.custody.observation.events.find((row) => row.type === 'runtime-custody-rejection');
    const rejected = (r) => r.events.find((row) => row.type === 'custody-barrier-rejected');
    const settled = (r) => r.events.find((row) => row.type === 'custody-request-settled' && row.phase === 'stop');
    for (const change of [{ startTicks: 'reused' }, { namespace: 'pid:[2]' }, { ppid: 999 }]) {
        const changed = structuredClone(receipt);
        const peer = {
            pid: changed.worker.pid,
            startTicks: changed.worker.startTicks,
            namespace: changed.worker.namespace,
            ppid: changed.custody.observation.innerSupervisor.pid,
            state: 'S',
            pgrp: changed.worker.pid,
            ...change,
        };
        if (change.startTicks) peer.startTicks = '9999';
        Object.assign(proof(changed), {
            reason: 'worker-identity-mismatch',
            currentState: 'IDENTITY_MISMATCH',
            currentPeer: peer,
        });
        rejected(changed).reason = 'worker-identity-mismatch';
        assert.equal(expectedOutcome(changed, { ...options, artifactBytes: rebuildSchemaOriginals(changed) }), true);
        assert.equal(validateAttemptReceipt(changed, { allowCpuDummy: true, requireSuccess: false }).ok, false);
    }
    for (const state of ['Z', 'X', 'S', '?']) {
        const changed = structuredClone(receipt);
        Object.assign(proof(changed), {
            reason: 'worker-exited',
            currentState: 'EXITED',
            currentPeer: {
                pid: changed.worker.pid,
                startTicks: changed.worker.startTicks,
                namespace: changed.worker.namespace,
                ppid: changed.custody.observation.innerSupervisor.pid,
                state,
                pgrp: changed.worker.pid,
            },
        });
        rejected(changed).reason = 'worker-exited';
        assert.equal(
            expectedOutcome(changed, { ...options, artifactBytes: rebuildSchemaOriginals(changed) }),
            ['Z', 'X'].includes(state),
        );
    }
    for (const reason of ['worker-exited', 'worker-identity-mismatch']) {
        const observed = structuredClone(receipt);
        Object.assign(proof(observed), {
            reason,
            currentState: reason === 'worker-exited' ? 'EXITED' : 'IDENTITY_MISMATCH',
            currentPeer: {
                pid: observed.worker.pid,
                startTicks: reason === 'worker-exited' ? observed.worker.startTicks : '9999',
                namespace: observed.worker.namespace,
                ppid: observed.custody.observation.innerSupervisor.pid,
                state: reason === 'worker-exited' ? 'Z' : 'S',
                pgrp: observed.worker.pid,
            },
        });
        rejected(observed).reason = reason;
        for (const pgrp of [0, 2147483647]) {
            const changed = structuredClone(observed);
            proof(changed).currentPeer.pgrp = pgrp;
            assert.equal(
                expectedOutcome(changed, { ...options, artifactBytes: rebuildSchemaOriginals(changed) }),
                true,
                `${reason}: valid pgrp boundary ${pgrp}`,
            );
        }
        for (const pgrp of [undefined, -1, 'oops', 2147483648, 1.5, null]) {
            const changed = structuredClone(observed);
            if (pgrp === undefined) delete proof(changed).currentPeer.pgrp;
            else proof(changed).currentPeer.pgrp = pgrp;
            assert.equal(
                expectedOutcome(changed, { ...options, artifactBytes: rebuildSchemaOriginals(changed) }),
                false,
                `${reason}: rehashed missing or malformed pgrp ${String(pgrp)}`,
            );
        }
        for (const field of ['state', 'ppid']) {
            const changed = structuredClone(observed);
            delete proof(changed).currentPeer[field];
            assert.equal(
                expectedOutcome(changed, { ...options, artifactBytes: rebuildSchemaOriginals(changed) }),
                false,
                `${reason}: incomplete currentPeer ${field}`,
            );
        }
        const extra = structuredClone(observed);
        proof(extra).currentPeer.unexpected = true;
        assert.equal(
            expectedOutcome(extra, { ...options, artifactBytes: rebuildSchemaOriginals(extra) }),
            false,
            `${reason}: only the fixed identity observation fields are accepted`,
        );
    }
    const closing = (r) => r.custody.observation.barriers.find((row) => row.phase === 'closing');
    const mutations = [
        (r) => {
            const row = closing(r);
            r.custody.observation.barriers = r.custody.observation.barriers.filter((event) => event !== row);
            r.custody.observation.events = r.custody.observation.events.filter((event) => event !== row);
        },
        (r) => {
            r.custody.observation.barriers.push(closing(r));
        },
        (r) => {
            closing(r).requestId = 3;
        },
        (r) => {
            closing(r).policy = 'browser-shutdown/1';
        },
        (r) => {
            closing(r).snapshot.browser.startTicks = '99999';
        },
        (r) => {
            closing(r).snapshot.browser.state = 'Z';
        },
        (r) => {
            closing(r).snapshot.image = { ...closing(r).snapshot.image, sha256: '0'.repeat(64) };
        },
        (r) => {
            closing(r).snapshot.functionalResult = { ...closing(r).snapshot.functionalResult, sha256: '0'.repeat(64) };
        },
        (r) => {
            closing(r).closeBudget.deadlineMs++;
        },
        (r) => {
            closing(r).deadlineMs = closing(r).elapsedMs;
        },
        (r) => {
            r.events.find((row) => row.type === 'custody-barrier-ack' && row.phase === 'closing').custodyEventId++;
        },
        (r) => {
            r.runtimes[0].closeAuthorized.healthy = false;
        },
        (r) => {
            proof(r).ok = true;
        },
        (r) => {
            proof(r).reason = 'unknown';
        },
        (r) => {
            proof(r).currentState = 'UNKNOWN';
        },
        (r) => {
            proof(r).currentPeer = { ...r.worker, ppid: r.custody.observation.innerSupervisor.pid };
        },
        (r) => {
            proof(r).startEventId = 4;
        },
        (r) => {
            proof(r).requestId = 2;
        },
        (r) => {
            proof(r).workerPID++;
        },
        (r) => {
            proof(r).workerStartTicks = '1';
        },
        (r) => {
            proof(r).namespace = 'pid:[2]';
        },
        (r) => {
            proof(r).runtimeId = 'runtime-2';
        },
        (r) => {
            proof(r).nodeSupervisorPID++;
        },
        (r) => {
            proof(r).phase = 'start';
        },
        (r) => {
            proof(r).transport = 'untrusted';
        },
        (r) => {
            r.custody.observation.barriers[0].ok = false;
        },
        (r) => {
            r.custody.observation.barriers[0].workerStartTicks = 'old';
        },
        (r) => {
            rejected(r).custodyEventId++;
        },
        (r) => {
            rejected(r).startEventId--;
        },
        (r) => {
            rejected(r).workerStartTicks = 'old';
        },
        (r) => {
            rejected(r).reason = 'unknown';
        },
        (r) => {
            settled(r).outcome = 'response';
        },
        (r) => {
            settled(r).requestId++;
        },
        (r) => {
            settled(r).runtimeId = 'runtime-2';
        },
        (r) => {
            settled(r).supervisorElapsedMs = r.runtimes[0].stopBegin.supervisorElapsedMs + r.limits.closeMs + 1;
        },
        (r) => {
            r.custody.observation.innerSupervisor.exit.code = 1;
        },
        (r) => {
            r.custody.observation.innerSupervisor.stdoutEOF = null;
        },
        (r) => {
            r.custody.wrapper.exit.code = r.custody.wrapper.close.code = 0;
        },
        (r) => {
            r.custody.observation.final.result = 'UNKNOWN';
        },
        (r) => {
            r.custody.observation.errors.push('extra failure');
        },
        (r) => {
            r.errors.push('unrelated assertion');
        },
        (r) => {
            r.errors = r.errors.filter((value) => value !== 'Custody IPC: kernel barrier rejected');
        },
        (r) => {
            r.lifecycleErrors = r.lifecycleErrors.filter((value) => value !== 'Kernel custody retained failures');
        },
        (r) => {
            r.forced = true;
        },
        (r) => {
            r.timedOut = true;
        },
        (r) => {
            r.custody.observation.events = r.custody.observation.events.filter((row) => row !== proof(r));
        },
        (r) => {
            r.events = r.events.filter((row) => row !== rejected(r));
        },
        (r) => {
            r.custody.observation.events.push({ ...proof(r), eventId: 999 });
        },
    ];
    for (const [index, mutate] of mutations.entries()) {
        const changed = structuredClone(receipt);
        mutate(changed);
        assert.equal(
            expectedOutcome(changed, { ...options, artifactBytes: rebuildSchemaOriginals(changed) }),
            false,
            `even rehashed synthetic original mutation ${index} must be rejected`,
        );
    }
});

function abortEpipeSchemaFixture(terminal = false) {
    const { receipt } = rejectedStopSchemaFixture();
    const worker = receipt.worker;
    worker.initial.pgrp = worker.pid;
    const tuple = {
        pid: worker.pid,
        startTicks: worker.startTicks,
        namespace: worker.namespace,
        ppid: receipt.custody.observation.innerSupervisor.pid,
        pgrp: worker.initial.pgrp,
    };
    const observation = (state) => ({
        status: state === 'Z' ? 'TERMINAL' : 'LIVE',
        before: { ...tuple, state: 'R' },
        after: { ...tuple, state },
    });
    const add = (type, elapsed, values) => {
        const row = {
            type,
            source: 'supervisor',
            supervisorElapsedMs: elapsed,
            receivedUtc: new Date(Date.parse(receipt.startedAt) + elapsed).toISOString(),
            ...values,
        };
        receipt.events.push(row);
        return row;
    };
    const elapsed = receipt.browsers[0].exit.supervisorElapsedMs;
    const abort = add('abort-request', elapsed + 1, { reason: 'unclean browser exit: 7/null' });
    const binding = {
        workerPID: worker.pid,
        childPID: worker.pid,
        workerStartTicks: worker.startTicks,
        namespace: worker.namespace,
        deadlineMs: Math.min(abort.supervisorElapsedMs + receipt.limits.closeMs, receipt.limits.finalMs),
    };
    const send = add('abort-ipc-send', elapsed + 2, {
        ...binding,
        workerExitEventId: null,
        workerCloseEventId: null,
        observation: observation('R'),
    });
    const result = add(
        'abort-ipc-result',
        terminal ? worker.exit.supervisorElapsedMs - 1 : worker.close.supervisorElapsedMs + 1,
        {
            ...binding,
            outcome: 'callback',
            errorCode: 'EPIPE',
            failed: true,
            observation: observation(terminal ? 'Z' : 'R'),
        },
    );
    receipt.events.sort((a, b) => a.supervisorElapsedMs - b.supervisorElapsedMs);
    receipt.events.forEach((row, index) => {
        row.eventId = index + 1;
    });
    send.abortRequestEventId = result.abortRequestEventId = abort.eventId;
    result.sendEventId = send.eventId;
    result.workerExitEventId = terminal ? null : worker.exit.eventId;
    result.workerCloseEventId = terminal ? null : worker.close.eventId;
    for (const errors of [receipt.errors, receipt.lifecycleErrors])
        errors.push('abort IPC send failed: Error: write EPIPE', 'failure event retained: abort-request');
    return receipt;
}

test('browser-7 abort EPIPE classification requires an exact asynchronous exit proof and all originals', () => {
    const { expectedOutcome } = require('./example-evidence-shutdown-trace.cjs');
    const { validateAttemptReceipt } = require('./example-evidence-supervisor.cjs');
    const options = { mode: 'cpu', cpuCase: 'browser-nonzero' };
    const check = (r) => expectedOutcome(r, { ...options, artifactBytes: rebuildSchemaOriginals(r) });
    for (const terminal of [false, true]) {
        const receipt = abortEpipeSchemaFixture(terminal);
        assert.equal(check(receipt), true, JSON.stringify(receipt.errors));
        const inheritedGroup = structuredClone(receipt);
        inheritedGroup.worker.initial.pgrp = 88;
        assert.equal(check(inheritedGroup), true, 'fork-time inherited group is not current group authority');
        assert.equal(validateAttemptReceipt(receipt, { allowCpuDummy: true }).ok, false);
        assert.equal(
            expectedOutcome(receipt, { ...options, mode: 'target', artifactBytes: rebuildSchemaOriginals(receipt) }),
            false,
        );
        const send = (r) => r.events.find((e) => e.type === 'abort-ipc-send');
        const result = (r) => r.events.find((e) => e.type === 'abort-ipc-result');
        const mutations = [
            (r) => {
                send(r).workerPID++;
            },
            (r) => {
                result(r).childPID++;
            },
            (r) => {
                result(r).workerStartTicks = '999';
            },
            (r) => {
                result(r).namespace = 'pid:[2]';
            },
            (r) => {
                result(r).abortRequestEventId++;
            },
            (r) => {
                result(r).sendEventId++;
            },
            (r) => {
                result(r).outcome = 'throw';
            },
            (r) => {
                result(r).outcome = 'deadline';
            },
            (r) => {
                result(r).errorCode = 'EIO';
            },
            (r) => {
                result(r).failed = false;
            },
            (r) => {
                send(r).deadlineMs++;
                result(r).deadlineMs++;
            },
            (r) => {
                send(r).observation.status = 'UNKNOWN';
            },
            (r) => {
                send(r).observation.before.startTicks = '999';
            },
            (r) => {
                result(r).workerExitEventId = 99999;
            },
            (r) => {
                result(r).workerCloseEventId = 99999;
            },
            (r) => {
                result(r).workerExitEventId = null;
                result(r).workerCloseEventId = null;
                result(r).observation.status = 'UNKNOWN';
            },
            (r) => {
                result(r).workerExitEventId = null;
                result(r).workerCloseEventId = null;
                result(r).observation.status = 'LIVE';
                result(r).observation.after.state = 'R';
            },
            (r) => {
                r.events.find((e) => e.type === 'abort-request').reason = 'unrelated failure';
            },
            (r) => {
                r.events.push({ ...result(r), type: 'abort-ipc-extra-callback' });
            },
            (r) => {
                r.events.push({ ...send(r) });
            },
            (r) => {
                r.errors.push('unrelated error');
            },
            (r) => {
                r.events = r.events.filter((e) => e !== send(r));
            },
            (r) => {
                r.events = r.events.filter((e) => e !== result(r));
            },
        ];
        if (terminal) {
            for (const field of ['pid', 'ppid', 'pgrp', 'startTicks', 'namespace', 'state'])
                mutations.push((r) => {
                    result(r).observation.after[field] = field === 'state' ? '?' : 'changed';
                });
            mutations.push((r) => {
                result(r).observation.before.state = 'Z';
                result(r).observation.after.state = 'R';
            });
        }
        for (const [index, mutate] of mutations.entries()) {
            const changed = structuredClone(receipt);
            mutate(changed);
            assert.equal(check(changed), false, `terminal=${terminal} rehashed mutation ${index}`);
        }
        const bytes = rebuildSchemaOriginals(receipt);
        for (const role of Object.keys(bytes)) {
            const missing = { ...bytes };
            delete missing[role];
            assert.equal(expectedOutcome(receipt, { ...options, artifactBytes: missing }), false, role);
        }
    }
    const old = rejectedStopSchemaFixture().receipt;
    old.errors.push('abort IPC send failed: Error: write EPIPE');
    old.lifecycleErrors.push('abort IPC send failed: Error: write EPIPE');
    assert.equal(check(old), false, 'old EPIPE without contemporaneous send/callback proof stays rejected');
    const root = process.env.EXAMPLE_EVIDENCE_TRACE_FIXTURE_ROOT;
    if (root) {
        const fs = require('node:fs'),
            path = require('node:path');
        const directory = path.join(root, 'shutdown-diagnostics-38799219346/cpu-browser-nonzero-on/attempt');
        const file = path.join(directory, 'attempt-receipt.json');
        if (fs.existsSync(file)) {
            const r = JSON.parse(fs.readFileSync(file));
            const bytes = Object.fromEntries(
                Object.entries(r.custody.artifacts).map(([role, ref]) => [
                    role,
                    fs.readFileSync(path.join(directory, path.basename(ref.path))),
                ]),
            );
            assert.equal(
                expectedOutcome(r, { ...options, artifactBytes: bytes }),
                false,
                'official old failure is immutable and unproven',
            );
        }
    }
});
