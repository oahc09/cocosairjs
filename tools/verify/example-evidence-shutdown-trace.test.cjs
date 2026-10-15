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

test('diagnostic CPU pairs inherit production deadlines without changing the short unit suite', () => {
    const fs = require('node:fs'),
        path = require('node:path');
    const { DEFAULT_LIMITS } = require('./example-evidence-supervisor.cjs');
    const expected = {
        startupMs: 15000,
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
    const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/example-evidence.yml'), 'utf8');
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
    assert.match(
        unit,
        /const LIMITS = \{ startupMs: 800, closeMs: 300, innerMs: 1600, abortMs: 1900, forceMs: 2400, finalMs: 2800 \};/,
    );
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
    const receipt = {
        worker: target,
        custody: {
            observation: {
                custodian: sender,
                events: [{ ...target, type: 'cpu-worker-signal', signal: 'SIGTERM', utc: '2023-11-14T22:13:20.001Z' }],
            },
        },
    };
    assert.equal(knownCpuSender(receipt, [syscall, delivery], TEST_ROOT), true);
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
    assert.equal(command.limits.startupMs, 15000);
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
    raw.events = raw.events.filter((row) => row.eventId <= 5);
    raw.barriers = [raw.events[4]];
    const start = raw.barriers[0],
        ack = receipt.events.find((row) => row.type === 'custody-barrier-ack');
    start.namespace = receipt.worker.namespace;
    start.nodeSupervisorPID = inner.pid;
    start.elapsedMs = ack.supervisorElapsedMs - 1;
    start.utc = new Date(Date.parse(startedAt) + start.elapsedMs).toISOString();
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
        requestId: 2,
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
        requestId: 2,
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
        requestId: 2,
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
    const mutations = [
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
            proof(r).requestId = 3;
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
