'use strict';
/**
 * Opt-in, Linux-only shutdown diagnosis. Never changes admission, lifecycle, or publication.
 * strace is outside the ORIGINAL outer Node command. Its private FIFO is consumed in memory;
 * only fixed numeric/enum fields are retained. Raw strace text is deliberately NOT retained.
 * Original collector, Python custody, and campaign artifacts remain untouched.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const {
    DEFAULT_LIMITS,
    limitsOf,
    validateAttemptReceipt,
    validateCustodyArtifacts,
} = require('./example-evidence-supervisor.cjs');

const REPO = path.resolve(__dirname, '../..');
const SCHEMA = 'example-evidence-shutdown-diagnostic/1';
const SYSCALLS = Object.freeze(['kill', 'tkill', 'tgkill', 'pidfd_send_signal', 'wait4', 'waitid']);
// Kernel wait/reap evidence remains in the original Python custody artifacts, not this sidecar filter.
const TRACE_SYSCALLS = Object.freeze(['kill', 'tkill', 'tgkill', 'pidfd_send_signal']);
const CPU_CASES = Object.freeze(['positive', 'browser-nonzero', 'custodian-delayed-stop-ack']);
const BOUNDS = Object.freeze({
    inputBytes: 8 * 1024 * 1024,
    outputBytes: 8 * 1024 * 1024,
    lineBytes: 8192,
    events: 100000,
    identities: 256,
    identityBytes: 1024 * 1024,
});
const SIGNALS = new Set([
    'SIGHUP',
    'SIGINT',
    'SIGQUIT',
    'SIGILL',
    'SIGTRAP',
    'SIGABRT',
    'SIGBUS',
    'SIGFPE',
    'SIGKILL',
    'SIGUSR1',
    'SIGSEGV',
    'SIGUSR2',
    'SIGPIPE',
    'SIGALRM',
    'SIGTERM',
    'SIGSTKFLT',
    'SIGCHLD',
    'SIGCONT',
    'SIGSTOP',
    'SIGTSTP',
    'SIGTTIN',
    'SIGTTOU',
    'SIGURG',
    'SIGXCPU',
    'SIGXFSZ',
    'SIGVTALRM',
    'SIGPROF',
    'SIGWINCH',
    'SIGIO',
    'SIGPWR',
    'SIGSYS',
    ...Array.from({ length: 32 }, (_, i) => `SIGRT_${i + 1}`),
]);
const ERRORS = Object.freeze({
    ECHILD: 'No child processes',
    ESRCH: 'No such process',
    EINTR: 'Interrupted system call',
    EINVAL: 'Invalid argument',
    EPERM: 'Operation not permitted',
    EAGAIN: 'Resource temporarily unavailable',
    ENOSYS: 'Function not implemented',
    EBADF: 'Bad file descriptor',
    EFAULT: 'Bad address',
    ERESTARTSYS: 'To be restarted if SA_RESTART is set',
    ERESTARTNOINTR: 'To be restarted',
    ERESTARTNOHAND: 'To be restarted if no handler',
    ERESTART_RESTARTBLOCK: 'Interrupted by signal',
});
const RESTART_ERRORS = new Set(['ERESTARTSYS', 'ERESTARTNOINTR', 'ERESTARTNOHAND', 'ERESTART_RESTARTBLOCK']);
const ENUMS = new Set([
    ...SYSCALLS,
    ...SIGNALS,
    ...Object.keys(ERRORS),
    'NULL',
    'P_ALL',
    'P_PID',
    'P_PGID',
    'P_PIDFD',
    'WNOHANG',
    'WUNTRACED',
    'WSTOPPED',
    'WEXITED',
    'WCONTINUED',
    'WNOWAIT',
    '__WALL',
    '__WCLONE',
    '__WNOTHREAD',
    'WIFEXITED',
    'WEXITSTATUS',
    'WIFSIGNALED',
    'WTERMSIG',
    'WCOREDUMP',
    'WIFSTOPPED',
    'WSTOPSIG',
    'WIFCONTINUED',
    'SI_USER',
    'SI_KERNEL',
    'SI_QUEUE',
    'SI_TIMER',
    'SI_MESGQ',
    'SI_ASYNCIO',
    'SI_SIGIO',
    'SI_TKILL',
    'CLD_EXITED',
    'CLD_KILLED',
    'CLD_DUMPED',
    'CLD_TRAPPED',
    'CLD_STOPPED',
    'CLD_CONTINUED',
    'si_signo',
    'si_code',
    'si_pid',
    'si_uid',
    'si_status',
    'si_utime',
    'si_stime',
    'si_errno',
    'si_value',
    'int',
    'ptr',
    's',
    'ru_utime',
    'ru_stime',
    'tv_sec',
    'tv_usec',
    'ru_maxrss',
    'ru_ixrss',
    'ru_idrss',
    'ru_isrss',
    'ru_minflt',
    'ru_majflt',
    'ru_nswap',
    'ru_inblock',
    'ru_oublock',
    'ru_msgsnd',
    'ru_msgrcv',
    'ru_nsignals',
    'ru_nvcsw',
    'ru_nivcsw',
]);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const invariant = (ok, reason) => {
    if (!ok) throw Error(reason);
};
const outside = (root, file) => {
    const rel = path.relative(root, file);
    return rel === '..' || rel.startsWith('../');
};
const same = (a, b) => !!a && !!b && a.pid === b.pid && a.startTicks === b.startTicks && a.namespace === b.namespace;

function identity(pid) {
    try {
        const fields = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(/\) /).slice(1).join(') ').trim().split(' ');
        const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
        const tgid = Number(status.match(/^Tgid:\s+(\d+)$/m)?.[1]);
        const row = {
            pid,
            startTicks: fields[19],
            namespace: fs.readlinkSync(`/proc/${pid}/ns/pid`),
            tgid,
            ppid: Number(fields[1]),
        };
        return /^\d+$/.test(row.startTicks) && Number.isSafeInteger(tgid) && tgid > 0 ? row : null;
    } catch {
        return null;
    }
}

function exactPresence(expected, io = fs) {
    if (
        !expected ||
        !Number.isSafeInteger(expected.pid) ||
        expected.pid <= 0 ||
        !/^\d+$/.test(expected.startTicks || '') ||
        !/^pid:\[\d+\]$/.test(expected.namespace || '')
    )
        return 'UNKNOWN';
    const read = () => {
        const raw = io.readFileSync(`/proc/${expected.pid}/stat`, 'utf8');
        const end = raw.lastIndexOf(')');
        invariant(raw.startsWith(`${expected.pid} (`) && end >= 0, 'presence-metadata-invalid');
        const fields = raw
            .slice(end + 2)
            .trim()
            .split(' ');
        const namespace = io.readlinkSync(`/proc/${expected.pid}/ns/pid`);
        invariant(
            fields.length >= 20 && /^\d+$/.test(fields[19]) && /^pid:\[\d+\]$/.test(namespace),
            'presence-metadata-invalid',
        );
        return { pid: expected.pid, startTicks: fields[19], namespace };
    };
    try {
        const before = read(),
            after = read();
        if (!same(before, after)) return 'UNKNOWN';
        return same(expected, after) ? 'PRESENT' : 'ABSENT';
    } catch (error) {
        return ['ENOENT', 'ESRCH'].includes(error.code) ? 'ABSENT' : 'UNKNOWN';
    }
}

function imageIdentity(pid) {
    try {
        const value = fs.statSync(`/proc/${pid}/exe`);
        return { dev: value.dev, ino: value.ino, size: value.size, mtimeMs: value.mtimeMs };
    } catch {
        return null;
    }
}
const validImage = (row) =>
    !!row &&
    ['dev', 'ino', 'size'].every((key) => Number.isSafeInteger(row[key]) && row[key] >= 0) &&
    Number.isFinite(row.mtimeMs) &&
    row.mtimeMs >= 0;
const imageSame = (a, b) =>
    validImage(a) && validImage(b) && ['dev', 'ino', 'size', 'mtimeMs'].every((key) => a[key] === b[key]);

// Only TIDs reported by our own tracer, or a direct target proven by an owned ancestry,
// are sampled. No global /proc scan, argv, environment, command name, or file path is retained.
function observeOwned(tid, root, frozenImage) {
    if (!root || !Number.isSafeInteger(tid) || tid <= 0) return null;
    const before = identity(tid);
    if (!before || before.namespace !== root.namespace) return null;
    const leaderBefore = identity(before.tgid);
    if (!leaderBefore) return null;
    const lineage = [];
    let ancestor = leaderBefore;
    while (ancestor && lineage.length < 32) {
        lineage.push(ancestor);
        if (same(ancestor, root)) break;
        if (ancestor.ppid <= 1 || ancestor.ppid === root.ppid) return null;
        ancestor = identity(ancestor.ppid);
    }
    if (!same(lineage.at(-1), root)) return null;
    const imageBefore = imageIdentity(leaderBefore.pid);
    const imageAfter = imageIdentity(leaderBefore.pid);
    const leaderAfter = identity(leaderBefore.pid),
        after = identity(tid);
    const lineageAfter = lineage.map((row) => identity(row.pid));
    if (
        !same(before, after) ||
        before.tgid !== after.tgid ||
        before.ppid !== after.ppid ||
        !same(leaderBefore, leaderAfter) ||
        leaderBefore.ppid !== leaderAfter.ppid ||
        !lineage.every((row, index) => same(row, lineageAfter[index]) && row.ppid === lineageAfter[index].ppid)
    )
        return null;
    return {
        thread: before,
        process: leaderBefore,
        threadBefore: before,
        threadAfter: after,
        processBefore: leaderBefore,
        processAfter: leaderAfter,
        root,
        lineageAfter,
        imageBefore,
        imageAfter,
        frozenImage,
        observedAt: Date.now(),
        doubleChecked: true,
        ownedLineage: lineage.map((row) => ({
            pid: row.pid,
            startTicks: row.startTicks,
            namespace: row.namespace,
            ppid: row.ppid,
        })),
        frozenBrowserImageMatch: imageSame(imageBefore, imageAfter) && imageSame(imageBefore, frozenImage),
        imageStable: imageSame(imageBefore, imageAfter),
    };
}

function validTuple(row, thread = false) {
    return (
        !!row &&
        Number.isSafeInteger(row.pid) &&
        row.pid > 0 &&
        row.pid <= 2147483647 &&
        typeof row.startTicks === 'string' &&
        /^\d+$/.test(row.startTicks) &&
        /^pid:\[\d+\]$/.test(row.namespace || '') &&
        Number.isSafeInteger(row.ppid) &&
        row.ppid >= 0 &&
        row.ppid <= 2147483647 &&
        (!thread || (Number.isSafeInteger(row.tgid) && row.tgid > 0 && row.tgid <= 2147483647))
    );
}
const fullSame = (a, b) =>
    validTuple(a, true) && validTuple(b, true) && same(a, b) && a.tgid === b.tgid && a.ppid === b.ppid;
function validObservation(row, knownRoot = row?.root) {
    if (
        !row ||
        row.doubleChecked !== true ||
        !validTuple(knownRoot, true) ||
        !fullSame(row.root, knownRoot) ||
        !fullSame(row.threadBefore, row.threadAfter) ||
        !fullSame(row.thread, row.threadBefore) ||
        !fullSame(row.processBefore, row.processAfter) ||
        !fullSame(row.process, row.processBefore) ||
        row.thread.tgid !== row.process.pid ||
        row.process.tgid !== row.process.pid ||
        row.thread.namespace !== row.process.namespace ||
        !Array.isArray(row.ownedLineage) ||
        !row.ownedLineage.length ||
        row.ownedLineage.length !== row.lineageAfter?.length ||
        !same(row.ownedLineage[0], row.process) ||
        row.ownedLineage[0].ppid !== row.process.ppid ||
        !same(row.ownedLineage.at(-1), knownRoot) ||
        row.ownedLineage.at(-1).ppid !== knownRoot.ppid
    )
        return false;
    const seen = new Set();
    return row.ownedLineage.every((item, index) => {
        if (
            !validTuple(item) ||
            !validTuple(row.lineageAfter[index]) ||
            !same(item, row.lineageAfter[index]) ||
            item.ppid !== row.lineageAfter[index].ppid ||
            item.namespace !== knownRoot.namespace ||
            seen.has(item.pid) ||
            (index + 1 < row.ownedLineage.length && item.ppid !== row.ownedLineage[index + 1].pid)
        )
            return false;
        seen.add(item.pid);
        return true;
    });
}

const frozenImageMatch = (row) =>
    validObservation(row) && imageSame(row.imageBefore, row.imageAfter) && imageSame(row.imageBefore, row.frozenImage);

function cachedObservation(pid, timestamp, cache, receipt) {
    const candidates = cache.filter((row) => row.observation.process.pid === pid);
    if (candidates.length !== 1) return null;
    const candidate = candidates[0],
        observed = candidate.observation;
    if (
        candidate.metadataUnknown ||
        candidate.imageChanged ||
        !imageSame(observed.imageBefore, observed.imageAfter) ||
        !validObservation(observed) ||
        observed.thread.pid !== pid
    )
        return null;
    const exactRows = (receipt.ownedProcesses || []).filter((row) => same(row, observed.process));
    if (exactRows.length !== 1) return null;
    const adopted = receipt.custody.observation.adopted.find((row) => same(row, observed.process));
    const browser = receipt.browsers.find((row) => same(row, observed.process));
    const worker = same(receipt.worker, observed.process) ? receipt.worker : null;
    const end = adopted?.reap?.utc || browser?.exit?.utc || worker?.exit?.receivedUtc;
    const at = Number(timestamp) * 1000,
        ended = Date.parse(end);
    if (
        !Number.isFinite(at) ||
        !Number.isFinite(ended) ||
        at < candidate.firstObservedAt ||
        at > ended + 1 ||
        (candidate.firstAbsentAt !== null && at > candidate.firstAbsentAt)
    )
        return null;
    return {
        ...observed,
        resolution: 'live-double-checked-cache-plus-original-exact-lifetime',
        firstObservedAt: candidate.firstObservedAt,
        lastObservedAt: candidate.lastObservedAt,
        originalReapOrExitAt: ended,
    };
}

function resolveCachedIdentities(records, cache, receipt) {
    return records.map((record) => {
        const row = { ...record };
        if (row.kind === 'delivery' && !row.identityObservation) {
            const observed = cachedObservation(row.tid, row.timestamp, cache, receipt);
            if (observed) {
                row.identityObservation = observed;
                row.threadIdentity = observed.thread;
                row.processIdentity = observed.process;
            }
        }
        if (
            row.kind === 'syscall' &&
            ['kill', 'tkill', 'tgkill'].includes(row.syscall) &&
            !row.targetObservation &&
            row.target > 0
        )
            row.targetObservation = cachedObservation(row.targetTid || row.target, row.beganAt, cache, receipt);
        return row;
    });
}

// No arbitrary strings, comments, filenames, process names, or errno prose are accepted.
function validateGrammar(body) {
    let text = body;
    for (const [code, description] of Object.entries(ERRORS)) text = text.replace(`${code} (${description})`, code);
    const tokens = text.match(/0x[\da-fA-F]+|-?\d+|[A-Za-z_][A-Za-z_0-9]*|[\s,=\[\]{}()|&*.+?<>-]/g) || [];
    invariant(tokens.join('') === text, 'trace-grammar-rejected');
    for (const token of tokens) {
        if (/^[A-Za-z_]/.test(token)) invariant(ENUMS.has(token), 'trace-enum-rejected');
    }
}

// strace v6.8 src/util.c print_ticks/print_clock_t and src/printsiginfo.c:
// waitid's SIGCHLD si_utime/si_stime may carry a numeric seconds annotation.
// Validate its exact field location before discarding it; never strip general comments.
function omitWaitClockAnnotations(body) {
    if (!body.includes('/')) return body;
    const call = body.match(/^waitid\((.*)\)(\s+=\s+.*)$/);
    invariant(call, 'trace-comment-location-rejected');
    const args = fieldsOf(call[1]);
    invariant(args.length === 5 && /^\{.*\}$/.test(args[2]), 'trace-comment-location-rejected');
    const seen = new Set();
    const info = fieldsOf(args[2].slice(1, -1)).map((field) => {
        const pair = field.match(/^(si_signo|si_code|si_errno|si_pid|si_uid|si_status|si_utime|si_stime)=(.+)$/);
        invariant(pair && !seen.has(pair[1]), 'trace-clock-field-rejected');
        seen.add(pair[1]);
        if (!['si_utime', 'si_stime'].includes(pair[1])) {
            invariant(!pair[2].includes('/'), 'trace-comment-location-rejected');
            return field;
        }
        const value = pair[2].match(/^(\d{1,20})(?: \/\* (\d{1,20})\.(\d{1,9}) s \*\/)?$/);
        invariant(value && BigInt(value[1]) <= 18446744073709551615n, 'trace-clock-annotation-rejected');
        if (value[2] !== undefined)
            invariant(BigInt(value[1]) > 0n && BigInt(value[2]) <= BigInt(value[1]), 'trace-clock-annotation-rejected');
        return `${pair[1]}=${value[1]}`;
    });
    invariant(
        ['si_signo', 'si_code', 'si_pid', 'si_uid', 'si_status', 'si_utime', 'si_stime'].every((name) =>
            seen.has(name),
        ) &&
            info.includes('si_signo=SIGCHLD') &&
            info.some((field) => /^si_code=CLD_(EXITED|KILLED|DUMPED|TRAPPED|STOPPED|CONTINUED)$/.test(field)),
        'trace-clock-siginfo-rejected',
    );
    args[2] = `{${info.join(', ')}}`;
    const result = `waitid(${args.join(', ')})${call[2]}`;
    invariant(!result.includes('/'), 'trace-comment-location-rejected');
    return result;
}

function fieldsOf(text) {
    const fields = [],
        stack = [];
    let begin = 0;
    for (let i = 0; i < text.length; i++) {
        const character = text[i];
        if ('({['.includes(character)) stack.push(character);
        else if (')}]'.includes(character))
            invariant(stack.pop() === { ')': '(', '}': '{', ']': '[' }[character], 'trace-unbalanced-fields');
        else if (character === ',' && !stack.length) {
            fields.push(text.slice(begin, i).trim());
            begin = i + 1;
        }
    }
    invariant(!stack.length, 'trace-unbalanced-fields');
    fields.push(text.slice(begin).trim());
    return fields;
}
function integer(text) {
    invariant(/^-?\d+$/.test(text), 'trace-integer-rejected');
    const value = Number(text);
    invariant(Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647, 'trace-integer-range');
    return value;
}
function parseCompleted(tid, timestamp, body, beganAt = timestamp) {
    // v6.8 print_signalled uses signal_set, independently of -qqq/QUIET_EXIT.
    const terminal = body.match(/^\+\+\+ killed by (SIGTERM|SIGKILL) \+\+\+$/);
    if (terminal) return { kind: 'terminal', tid, timestamp, signal: terminal[1] };
    body = omitWaitClockAnnotations(body);
    validateGrammar(body);
    const delivery = body.match(/^--- (SIGTERM|SIGKILL) \{(.+)\} ---$/);
    if (delivery) {
        const info = new Map();
        for (const field of fieldsOf(delivery[2])) {
            const pair = field.match(/^(si_signo|si_code|si_pid|si_uid|si_errno|si_value)=(.+)$/);
            invariant(pair && !info.has(pair[1]), 'trace-delivery-duplicate-or-unknown-field');
            info.set(pair[1], pair[2]);
        }
        const code = info.get('si_code');
        invariant(info.get('si_signo') === delivery[1], 'trace-delivery-signo-mismatch');
        invariant(
            ['SI_USER', 'SI_TKILL', 'SI_KERNEL', 'SI_QUEUE', 'SI_TIMER', 'SI_MESGQ', 'SI_ASYNCIO', 'SI_SIGIO'].includes(
                code,
            ),
            'trace-delivery-code-missing',
        );
        invariant(!['SI_USER', 'SI_TKILL'].includes(code) || info.has('si_pid'), 'trace-delivery-pid-missing');
        for (const field of ['si_pid', 'si_uid', 'si_errno']) if (info.has(field)) integer(info.get(field));
        return {
            kind: 'delivery',
            tid,
            timestamp,
            signal: delivery[1],
            siPid: info.has('si_pid') ? integer(info.get('si_pid')) : null,
            siCode: code,
        };
    }
    const call = body.match(
        /^(kill|tkill|tgkill|pidfd_send_signal|wait4|waitid)\((.*)\)\s+=\s+(-?\d+|\?)(?: ([A-Z_]+)(?: \(([^)]*)\))?)?$/,
    );
    invariant(call, 'trace-call-rejected');
    const [, syscall, args, result, errno, description] = call;
    invariant(!errno || Object.hasOwn(ERRORS, errno), 'trace-errno-rejected');
    invariant(!errno || description === ERRORS[errno], 'trace-errno-description-rejected');
    const fields = fieldsOf(args);
    invariant(
        fields.length === { kill: 2, tkill: 2, tgkill: 3, pidfd_send_signal: 4, wait4: 4, waitid: 5 }[syscall],
        'trace-call-arity',
    );
    const row = {
        kind: 'syscall',
        tid,
        timestamp,
        beganAt,
        syscall,
        result: result === '?' ? null : integer(result),
        errno: errno || null,
    };
    const isWait = syscall === 'wait4' || syscall === 'waitid';
    const exitStop = !isWait && result === '?' && !errno;
    invariant(
        exitStop ||
            (errno
                ? RESTART_ERRORS.has(errno)
                    ? isWait && result === '?'
                    : row.result === -1
                : row.result !== null && (syscall === 'wait4' ? row.result >= 0 : row.result === 0)),
        'trace-return-combination-rejected',
    );
    if (['kill', 'tkill', 'tgkill', 'pidfd_send_signal'].includes(syscall)) {
        const signal = fields[syscall === 'tgkill' ? 2 : 1];
        invariant(SIGNALS.has(signal) || signal === '0', 'trace-signal-rejected');
        invariant(/^-?\d+$/.test(fields[0]), 'trace-target-rejected');
        row.signal = signal === '0' ? 0 : signal;
        row.target = integer(fields[0]);
        row.targetKind =
            syscall === 'kill'
                ? 'pid-or-group'
                : syscall === 'tkill'
                  ? 'tid'
                  : syscall === 'tgkill'
                    ? 'tgid'
                    : 'pidfd-unknown';
        if (syscall === 'tgkill') {
            invariant(/^\d+$/.test(fields[1]), 'trace-target-tid-rejected');
            row.targetTid = integer(fields[1]);
        }
    } else {
        if (syscall === 'waitid')
            invariant(['P_ALL', 'P_PID', 'P_PGID', 'P_PIDFD'].includes(fields[0]), 'trace-wait-selector');
        row.target = integer(fields[syscall === 'wait4' ? 0 : 1]);
        row.targetKind = syscall === 'wait4' ? 'pid-or-group' : fields[0];
        row.waitSignal = args.match(/WTERMSIG\(s\) == (SIG[A-Z0-9_]+)/)?.[1] || null;
        const exitCodes = [...args.matchAll(/\bWEXITSTATUS\(s\) == (-?\d+)(?=[\]}&|\s])/g)];
        invariant(!args.includes('WEXITSTATUS') || exitCodes.length === 1, 'trace-wait-exit-code-rejected');
        row.waitExitCode = exitCodes[0]?.[1] ?? null;
        if (row.waitExitCode !== null) {
            row.waitExitCode = integer(row.waitExitCode);
            invariant(row.waitExitCode >= 0 && row.waitExitCode <= 255, 'trace-wait-exit-code-range');
        }
    }
    // v6.8 print_event_exit can end a fully decoded signal call without a syscall return.
    // Keep no arguments, result or errno, and never expose this as a successful syscall.
    return exitStop ? { kind: 'syscall-incomplete', tid, timestamp, beganAt, syscall } : row;
}
function createParser({ bounds = BOUNDS, onRecord = () => {}, onFailure = () => {} } = {}) {
    let buffer = '',
        inputBytes = 0,
        eventCount = 0,
        acceptedLines = 0,
        failed = null,
        rejectedLine = null,
        inputLimit = bounds.inputBytes,
        inputBoundArmedAtBytes = null,
        inputBoundTriggeredAtBytes = null;
    const pending = new Map();
    const terminalTids = new Set();
    const exitStopTids = new Set();
    const fail = (reason) => {
        if (!failed) {
            failed = reason;
            onFailure(reason);
        }
    };
    return {
        push(bytes) {
            inputBytes += bytes.length;
            if (failed) return;
            if (inputBytes > inputLimit) {
                inputBoundTriggeredAtBytes = inputBytes;
                return fail('trace-input-bound');
            }
            if ([...bytes].some((value) => value > 127 || (value < 32 && value !== 10 && value !== 9)))
                return fail('trace-non-ascii');
            buffer += bytes.toString('ascii');
            while (buffer.includes('\n') && !failed) {
                const end = buffer.indexOf('\n'),
                    line = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                if (line.length > bounds.lineBytes) return fail('trace-line-bound');
                if (++eventCount > bounds.events) return fail('trace-event-bound');
                try {
                    const prefix = line.match(/^(\d+)\s+(\d+\.\d{6})\s+(.*)$/);
                    invariant(prefix, 'trace-prefix-rejected');
                    const tid = integer(prefix[1]),
                        timestamp = prefix[2],
                        body = prefix[3];
                    invariant(
                        tid > 0 && Number(timestamp) > 0 && Number(timestamp) < 10000000000,
                        'trace-prefix-range',
                    );
                    invariant(!terminalTids.has(tid), 'trace-record-after-terminal');
                    invariant(
                        !exitStopTids.has(tid) || /^\+\+\+ killed by (SIGTERM|SIGKILL) \+\+\+$/.test(body),
                        'trace-record-after-exit-stop',
                    );
                    const start = body.match(
                        /^(kill|tkill|tgkill|pidfd_send_signal|wait4|waitid)\((.*)<unfinished \.\.\.>$/,
                    );
                    if (start) {
                        invariant(!pending.has(tid), 'trace-overlapping-unfinished');
                        validateGrammar(`${start[1]}(${start[2]}`);
                        pending.set(tid, {
                            syscall: start[1],
                            body: `${start[1]}(${start[2]}`,
                            timestamp,
                            lineSequence: eventCount,
                        });
                        acceptedLines++;
                        continue;
                    }
                    const resumed = body.match(
                        /^<\.\.\. (kill|tkill|tgkill|pidfd_send_signal|wait4|waitid) resumed>(.*)$/,
                    );
                    let row,
                        beganLineSequence = eventCount;
                    if (resumed) {
                        const previous = pending.get(tid);
                        invariant(previous?.syscall === resumed[1], 'trace-unmatched-resume');
                        pending.delete(tid);
                        invariant(Number(previous.timestamp) <= Number(timestamp), 'trace-resume-time-reversed');
                        beganLineSequence = previous.lineSequence;
                        row = parseCompleted(tid, timestamp, previous.body + resumed[2], previous.timestamp);
                    } else {
                        row = parseCompleted(tid, timestamp, body);
                        invariant(
                            !pending.has(tid) || ['delivery', 'terminal'].includes(row.kind),
                            'trace-call-before-resume',
                        );
                    }
                    const rows = [];
                    if (row.kind === 'terminal') {
                        const previous = pending.get(tid);
                        if (previous) {
                            invariant(Number(previous.timestamp) <= Number(timestamp), 'trace-terminal-time-reversed');
                            invariant(
                                TRACE_SYSCALLS.includes(previous.syscall),
                                'trace-terminal-pending-call-rejected',
                            );
                            invariant(
                                parseCompleted(tid, timestamp, previous.body.trimEnd() + ') = ?', previous.timestamp)
                                    .kind === 'syscall-incomplete',
                                'trace-terminal-pending-call-rejected',
                            );
                            rows.push({
                                kind: 'terminated-inflight',
                                tid,
                                timestamp,
                                beganAt: previous.timestamp,
                                syscall: previous.syscall,
                                beganLineSequence: previous.lineSequence,
                                endedLineSequence: eventCount,
                            });
                            pending.delete(tid);
                        }
                        terminalTids.add(tid);
                    }
                    if (row.kind === 'syscall-incomplete') {
                        row = { ...row, beganLineSequence, endedLineSequence: eventCount };
                        exitStopTids.add(tid);
                    }
                    rows.push(row);
                    acceptedLines++;
                    try {
                        for (const item of rows) onRecord({ ...item, lineSequence: eventCount });
                    } catch {
                        fail('trace-record-processing-failed');
                    }
                } catch (error) {
                    // A rejection keeps only a fixed shape enum and line number, never the offending token/text.
                    const body = line.match(/^\d+\s+\d+\.\d{6}\s+(.*)$/)?.[1] || '';
                    const syscall =
                        body.match(
                            /^(?:<\.\.\. )?(kill|tkill|tgkill|pidfd_send_signal|wait4|waitid)(?:\(| resumed>)/,
                        )?.[1] || null;
                    rejectedLine = {
                        lineSequence: eventCount,
                        shape: syscall
                            ? body.startsWith('<... ')
                                ? 'resumed-syscall'
                                : 'syscall'
                            : /^--- SIG(?:TERM|KILL) /.test(body)
                              ? 'delivery'
                              : /^\+\+\+ killed by /.test(body)
                                ? 'terminal'
                                : 'unknown',
                        syscall,
                        hasCommentDelimiter: body.includes('/*') || body.includes('*/'),
                    };
                    fail(error.message);
                }
            }
            if (buffer.length > bounds.lineBytes) fail('trace-line-bound');
        },
        restrictToCurrentInput() {
            invariant(!failed && inputBoundArmedAtBytes === null, 'trace-input-bound-arm-rejected');
            inputLimit = Math.min(inputLimit, inputBytes);
            inputBoundArmedAtBytes = inputBytes;
            return { inputBytes, inputLimit };
        },
        finish() {
            if (buffer.length) fail('trace-truncated-line');
            if (pending.size) fail('trace-unfinished-call');
            return {
                ok: !failed,
                reason: failed,
                inputBytes,
                inputLimit,
                inputBoundArmedAtBytes,
                inputBoundTriggeredAtBytes,
                eventCount,
                acceptedLines,
                rejectedLines: failed ? 1 : 0,
                rejectedLine,
                rawStraceRetained: false,
            };
        },
    };
}

function buildCommand(options) {
    invariant(['availability', 'cpu', 'target'].includes(options.mode), 'unsupported-diagnostic-mode');
    invariant(['on', 'off'].includes(options.trace), 'trace-must-be-on-or-off');
    const limits = limitsOf(options.limits);
    invariant(
        !options.control ||
            (options.mode === 'cpu' &&
                ((options.cpuCase === 'hang' && options.control === 'wrapper-term') ||
                    (options.cpuCase === 'custodian-delayed-stop-ack' && options.control === 'trace-input-bound')) &&
                options.trace === 'on' &&
                !options.limits),
        'control-requires-fixed-cpu-case',
    );
    if (options.mode === 'availability') {
        invariant(options.trace === 'on', 'availability-requires-trace');
        return {
            role: 'availability-node',
            executable: process.execPath,
            args: [
                '-e',
                // Signal watchers alone do not keep Node alive after the one-shot sender timer.
                // Retain a handle until the real handler installs the original exit timer.
                'const keepAlive = setInterval(() => {}, 1000); process.on("SIGTERM", () => { clearInterval(keepAlive); setTimeout(() => process.exit(143), 100); }); setTimeout(() => process.kill(process.pid, "SIGTERM"), 100)',
            ],
            limits,
        };
    }
    if (options.mode === 'cpu') {
        invariant(
            CPU_CASES.includes(options.cpuCase) || (options.cpuCase === 'hang' && options.control === 'wrapper-term'),
            'unsupported-original-cpu-case',
        );
        return {
            role: 'original-supervisor-cpu',
            executable: process.execPath,
            args: [
                path.join(REPO, 'tools/verify/example-evidence-supervisor.cjs'),
                `--cpu=${options.cpuCase}`,
                '--id=cpu-example',
                `--repo=${REPO}`,
                `--out=${path.join(options.out, 'attempt', 'collector.json')}`,
                `--artifact-dir=${path.join(options.out, 'attempt', 'artifacts')}`,
                `--limits=${JSON.stringify(limits)}`,
            ],
            limits,
        };
    }
    invariant(!options.limits, 'target-deadlines-cannot-be-overridden');
    invariant(options.freeze, 'target-requires-independent-freeze');
    const freezeFile = fs.realpathSync(options.freeze),
        root = path.dirname(freezeFile);
    invariant(outside(REPO, root) && outside(REPO, options.out), 'diagnostics-must-be-external');
    const freeze = JSON.parse(fs.readFileSync(freezeFile, 'utf8'));
    invariant(
        Object.keys(DEFAULT_LIMITS).every((key) => freeze.limits?.[key] === DEFAULT_LIMITS[key]),
        'original-target-limits-required',
    );
    invariant(
        freeze.scope?.some((row) => row.id === 'collector-dodge'),
        'target-missing-from-real-freeze',
    );
    invariant(freeze.runtimeIdentity?.playwrightVersion === '1.62.1', 'playwright-pin-mismatch');
    invariant(
        /(?:^|\s)151\.0\.7922\.34(?:\s|$)/.test(freeze.runtimeIdentity?.executableVersion || ''),
        'browser-pin-mismatch',
    );
    const browser = freeze.runtimeIdentity.host?.executablePath || freeze.runtimeIdentity.executablePath;
    invariant(sha256(browser) === freeze.runtimeIdentity.executableSha256, 'browser-hash-mismatch');
    return {
        role: 'original-single-id-campaign',
        executable: process.execPath,
        args: [
            path.join(REPO, 'tools/verify/run-example-evidence-campaign.cjs'),
            `--freeze=${freezeFile}`,
            '--id=collector-dodge',
            `--out=${path.join(root, 'attempts', 'collector-dodge', '1')}`,
            '--execute-authorized',
        ],
        limits,
        browser: {
            executable: browser,
            sha256: freeze.runtimeIdentity.executableSha256,
            version: '151.0.7922.34',
            playwrightVersion: '1.62.1',
        },
        receipt: path.join(root, 'attempts', 'collector-dodge', '1', 'attempt-receipt.json'),
    };
}

function traceArgs(fifo, command) {
    return [
        '-f',
        '-qqq',
        '-ttt',
        '-e',
        `trace=${TRACE_SYSCALLS.join(',')}`,
        '-e',
        'signal=SIGTERM,SIGKILL',
        '-o',
        fifo,
        '--',
        command.executable,
        ...command.args,
    ];
}

function receiptIdentities(receipt) {
    const result = [],
        seen = new Set();
    const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        if (
            Number.isSafeInteger(value.pid) &&
            typeof value.startTicks === 'string' &&
            /^pid:\[\d+\]$/.test(value.namespace || '')
        ) {
            const key = `${value.pid}:${value.startTicks}:${value.namespace}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push({ pid: value.pid, startTicks: value.startTicks, namespace: value.namespace });
            }
        }
        for (const child of Object.values(value)) if (typeof child === 'object') visit(child);
    };
    visit(receipt);
    return result;
}

function correlate(records, identities, knownRoot) {
    const exact = (observed) => observed && identities.find((row) => same(row, observed));
    return records
        .filter((row) => row.kind === 'delivery')
        .map((delivery) => {
            const target = exact(delivery.processIdentity);
            const candidates = records.filter(
                (row) =>
                    row.kind === 'syscall' &&
                    row.result === 0 &&
                    row.errno === null &&
                    row.signal === delivery.signal &&
                    row.callerProcessIdentity?.pid === delivery.siPid &&
                    exact(row.callerProcessIdentity) &&
                    target &&
                    validObservation(row.identityObservation, knownRoot) &&
                    validObservation(row.targetObservation, knownRoot) &&
                    validObservation(delivery.identityObservation, knownRoot) &&
                    row.tid === row.threadIdentity?.pid &&
                    fullSame(row.threadIdentity, row.identityObservation.thread) &&
                    fullSame(row.callerProcessIdentity, row.identityObservation.process) &&
                    delivery.tid === delivery.threadIdentity?.pid &&
                    fullSame(delivery.threadIdentity, delivery.identityObservation.thread) &&
                    fullSame(delivery.processIdentity, delivery.identityObservation.process) &&
                    (row.syscall === 'kill'
                        ? row.target === row.targetObservation.process.pid
                        : row.syscall === 'tkill'
                          ? row.target === row.targetObservation.thread.pid
                          : row.target === row.targetObservation.process.pid &&
                            row.targetTid === row.targetObservation.thread.pid) &&
                    same(row.identityObservation.root, delivery.identityObservation.root) &&
                    same(row.targetObservation.root, delivery.identityObservation.root) &&
                    row.threadIdentity?.tgid === row.callerProcessIdentity.pid &&
                    row.threadIdentity.namespace === row.callerProcessIdentity.namespace &&
                    same(row.targetObservation?.process, target) &&
                    ((row.syscall === 'kill' && delivery.siCode === 'SI_USER') ||
                        (['tkill', 'tgkill'].includes(row.syscall) && delivery.siCode === 'SI_TKILL')) &&
                    row.target > 0 &&
                    row.targetKind !== 'pidfd-unknown' &&
                    (row.targetKind === 'tid' ? row.target === delivery.tid : row.target === target.pid) &&
                    (row.targetTid === undefined || row.targetTid === delivery.tid) &&
                    Number(row.beganAt) <= Number(delivery.timestamp) &&
                    Number(delivery.timestamp) - Number(row.beganAt) <= 1,
            );
            return {
                deliveryEvent: delivery.eventId,
                signal: delivery.signal,
                siPid: delivery.siPid,
                siCode: delivery.siCode,
                target: target || 'UNKNOWN',
                sender: candidates.length === 1 ? exact(candidates[0].callerProcessIdentity) : 'UNKNOWN',
                syscallEvent: candidates.length === 1 ? candidates[0].eventId : null,
                status: candidates.length === 1 ? 'CORRELATED_DIAGNOSTIC_ONLY' : 'UNKNOWN',
            };
        });
}

const SECONDARY_FAILURES = new Set([
    'lifecycle errors retained',
    'failure event retained: abort-request',
    'failure event retained: observer-failure',
    'observer-complete event cardinality invalid',
    'stop-complete event cardinality invalid',
    'runtime lifecycle time order invalid',
    'runtime stop receipt missing or late',
    'browser exit/stdio close receipt missing or unclean',
    'in-worker HTTP listen/close receipt missing',
    'observer completion receipt missing',
    'attempt errors retained',
    'worker exit and stdio close receipts are not clean',
    'Per-runtime custody barriers missing',
]);
function expectedOutcome(receipt, options) {
    const raw = receipt.custody?.observation;
    const pair = (row, code, signal = null) =>
        row?.exit?.code === code &&
        row?.close?.code === code &&
        row.exit.signal === signal &&
        row.close.signal === signal;
    if (
        !raw ||
        receipt.forced !== false ||
        receipt.timedOut !== false ||
        raw.forced !== false ||
        raw.final?.result !== 'ECHILD' ||
        !raw.innerSupervisor?.exit ||
        !raw.innerSupervisor?.stdoutEOF ||
        !raw.innerSupervisor?.stderrEOF ||
        !receipt.worker?.exit ||
        !receipt.worker?.close ||
        !receipt.custody?.wrapper?.exit ||
        !receipt.custody?.wrapper?.close ||
        receipt.noOwnedProcesses !== true ||
        raw.adopted.some((row) => !row.reap || !row.absent)
    )
        return false;
    if (options.mode === 'cpu' && options.cpuCase === 'positive')
        return receipt.ok === true && validateAttemptReceipt(receipt, { allowCpuDummy: true }).ok;
    if (receipt.ok === true) return options.mode === 'target' && validateAttemptReceipt(receipt).ok;
    const allowed = new Set(SECONDARY_FAILURES);
    if (options.mode === 'cpu' && options.cpuCase === 'browser-nonzero') {
        if (
            receipt.cpuCase !== options.cpuCase ||
            raw.errors.length ||
            !pair(receipt.worker, 124) ||
            receipt.browsers.length !== 1 ||
            !pair(receipt.browsers[0], 7)
        )
            return false;
        for (const value of [
            'unclean browser exit: 7/null',
            'unclean browser close: 7/null',
            'observer-failure: browser exit is not clean: 7/null',
            'Custody IPC: collector disconnected before response',
            'worker exited 124',
        ])
            allowed.add(value);
    } else if (options.mode === 'cpu' && options.cpuCase === 'custodian-delayed-stop-ack') {
        if (
            receipt.cpuCase !== options.cpuCase ||
            raw.errors.length ||
            !pair(receipt.worker, null, 'SIGTERM') ||
            !raw.events.some(
                (row) => row.type === 'cpu-worker-signal' && row.pid === receipt.worker.pid && row.signal === 'SIGTERM',
            ) ||
            !receipt.events.some(
                (row) => row.type === 'custody-request-settled' && row.phase === 'stop' && row.outcome === 'response',
            )
        )
            return false;
        for (const value of [
            'Custody barrier remained pending at worker closure',
            'Custody IPC: collector disconnected before response',
            'worker ended by signal',
            'worker exited null',
        ])
            allowed.add(value);
    } else if (options.mode === 'target') {
        const signaled = raw.adopted.filter((row) => row.reap.signal);
        if (
            receipt.id !== 'collector-dodge' ||
            signaled.length !== 1 ||
            signaled[0].reap.signal !== 'SIGTERM' ||
            signaled[0].reap.rawStatus !== 15 ||
            !pair(receipt.worker, 124) ||
            !receipt.browsers.length ||
            !receipt.browsers.every((row) => pair(row, 0)) ||
            !receipt.servers.length ||
            !receipt.servers.every((row) => row.close) ||
            !receipt.events.some(
                (row) => row.type === 'abort-request' && row.reason === 'Custody IPC: kernel barrier rejected',
            ) ||
            receipt.events.some(
                (row) =>
                    ['abort-request', 'observer-failure'].includes(row.type) &&
                    row.reason !== 'Custody IPC: kernel barrier rejected',
            )
        )
            return false;
        const adoptedFailure = `Adopted child exited uncleanly: ${signaled[0].pid} code=None signal=SIGTERM`;
        if (
            raw.errors.length !== 2 ||
            !raw.errors.includes(adoptedFailure) ||
            !raw.errors.includes('Runtime barrier found adopted or unclosed children')
        )
            return false;
        for (const value of [
            adoptedFailure,
            'Custody IPC: kernel barrier rejected',
            'observer-failure: Custody IPC: kernel barrier rejected',
            'worker exited 124',
            `collector report unreadable: Error: ENOENT: no such file or directory, open '${receipt.output.report}'`,
            'single-example partial collector result missing or failed',
            'Runtime barrier found adopted or unclosed children',
            'Custodian did not exit/close cleanly',
            'Custodian exact identity/exit/stdio close is not clean',
            'Kernel custody retained failures',
            'Custody failure event: custody-error',
            'Adopted child lacks exact waitpid/absence closure',
        ])
            allowed.add(value);
        // This precise regression fails before the collector report is sealed. A different assertion
        // failure or an unexpected successful collector artifact is not silently accepted here.
        if (fs.existsSync(receipt.output.report)) return false;
    } else return false;
    const structural = validateAttemptReceipt(receipt, {
        allowCpuDummy: options.mode === 'cpu',
        requireSuccess: false,
    });
    return (
        [...receipt.errors, ...receipt.lifecycleErrors, ...structural.errors].every((message) =>
            allowed.has(message),
        ) && physicalReceipt(receipt)
    );
}

function physicalReceipt(receipt) {
    const raw = receipt.custody?.observation;
    if (!raw) return false;
    const present = (value, events) =>
        value && events.some((row) => row.eventId === value.eventId && JSON.stringify(row) === JSON.stringify(value));
    const beforeFinal = (value) =>
        present(value, raw.events) && value.eventId < raw.final.eventId && value.elapsedMs <= raw.final.elapsedMs;
    if (
        !present(receipt.worker.exit, receipt.events) ||
        !present(receipt.worker.close, receipt.events) ||
        receipt.worker.exit.eventId >= receipt.worker.close.eventId ||
        receipt.worker.exit.code !== receipt.worker.close.code ||
        receipt.worker.exit.signal !== receipt.worker.close.signal ||
        !present(raw.final, raw.events) ||
        raw.final.result !== 'ECHILD' ||
        !beforeFinal(raw.innerSupervisor.exit) ||
        !beforeFinal(raw.innerSupervisor.stdoutEOF) ||
        !beforeFinal(raw.innerSupervisor.stderrEOF) ||
        receipt.custody.wrapper.exit.elapsedMs < raw.final.elapsedMs ||
        receipt.custody.wrapper.close.elapsedMs < receipt.custody.wrapper.exit.elapsedMs
    )
        return false;
    return raw.adopted.every(
        (row) =>
            beforeFinal(row.reap) &&
            beforeFinal(row.absent) &&
            row.reap.eventId < row.absent.eventId &&
            same(row, row.reap) &&
            same(row, row.absent),
    );
}

function knownCpuSender(receipt, records, knownRoot) {
    const raw = receipt.custody.observation;
    const proof = raw.events.find(
        (row) => row.type === 'cpu-worker-signal' && row.signal === 'SIGTERM' && same(row, receipt.worker),
    );
    if (!proof) return false;
    const sends = records.filter(
        (row) =>
            row.kind === 'syscall' &&
            row.syscall === 'kill' &&
            row.result === 0 &&
            row.errno === null &&
            row.target === proof.pid &&
            row.signal === 'SIGTERM' &&
            validObservation(row.identityObservation, knownRoot) &&
            row.tid === row.threadIdentity?.pid &&
            fullSame(row.threadIdentity, row.identityObservation.thread) &&
            fullSame(row.callerProcessIdentity, row.identityObservation.process) &&
            same(row.callerProcessIdentity, raw.custodian),
    );
    return (
        sends.length === 1 &&
        records.some(
            (row) =>
                row.kind === 'delivery' &&
                row.signal === 'SIGTERM' &&
                row.siCode === 'SI_USER' &&
                row.siPid === raw.custodian.pid &&
                row.tid === receipt.worker.pid &&
                Number(row.timestamp) >= Number(sends[0].beganAt) &&
                Number(row.timestamp) <= Date.parse(proof.utc) / 1000 + 0.001,
        )
    );
}

function targetAttribution(receipt, records, correlations) {
    for (const correlation of correlations) {
        if (correlation.status !== 'CORRELATED_DIAGNOSTIC_ONLY' || correlation.signal !== 'SIGTERM') continue;
        const sent = records.find((row) => row.eventId === correlation.syscallEvent);
        const delivery = records.find((row) => row.eventId === correlation.deliveryEvent);
        const browser = receipt.browsers.find((row) => same(row, correlation.sender));
        const adopted = receipt.custody.observation.adopted.find((row) => same(row, correlation.target));
        const owned = receipt.ownedProcesses.find((row) => same(row, correlation.target));
        const stop = receipt.events.find((row) => row.type === 'stop-begin' && row.runtimeId === browser?.runtimeId);
        const stopTime = Date.parse(stop?.utc || stop?.receivedUtc) / 1000;
        const closeTime = Date.parse(browser?.close?.utc || browser?.close?.receivedUtc) / 1000;
        const reapTime = Date.parse(adopted?.reap?.utc) / 1000;
        if (
            !browser ||
            !adopted ||
            sent.syscall !== 'kill' ||
            !frozenImageMatch(sent.identityObservation) ||
            !frozenImageMatch(sent.targetObservation) ||
            !frozenImageMatch(delivery.identityObservation) ||
            owned?.firstObserved?.processDiagnostic?.details?.processType !== 'gpu-process' ||
            adopted.reap?.signal !== 'SIGTERM' ||
            adopted.reap.rawStatus !== 15 ||
            !adopted.absent ||
            browser.exit?.code !== 0 ||
            browser.close?.code !== 0 ||
            browser.exit.signal ||
            browser.close.signal ||
            !Number.isFinite(stopTime) ||
            !(
                stopTime <= Number(sent.beganAt) &&
                Number(delivery.timestamp) <= closeTime &&
                Number(delivery.timestamp) <= reapTime
            )
        )
            continue;
        return {
            diagnosticOnly: true,
            ...correlation,
            status: 'MATCHED',
            frozenBrowserImage: true,
            targetRoleHint: 'gpu-process',
        };
    }
    return { status: 'UNKNOWN', diagnosticOnly: true };
}

function checkChildrenInterface(read = fs.readFileSync) {
    try {
        const value = read(`/proc/self/task/${process.pid}/children`, 'utf8');
        invariant(
            typeof value === 'string' && Buffer.byteLength(value) <= 8192 && /^\s*(?:\d+\s*)*$/.test(value),
            'owned-children-interface-unavailable',
        );
        for (const word of value.trim().split(/\s+/).filter(Boolean))
            invariant(
                Number.isSafeInteger(Number(word)) && Number(word) > 0 && Number(word) <= 2147483647,
                'owned-children-interface-unavailable',
            );
        return true;
    } catch {
        throw Error('owned-children-interface-unavailable');
    }
}

function createDiagnosticBudget(mode, now = () => performance.now()) {
    invariant(['availability', 'cpu', 'target'].includes(mode), 'invalid-diagnostic-budget-mode');
    const origin = now();
    invariant(Number.isFinite(origin) && origin >= 0, 'invalid-diagnostic-monotonic-clock');
    let last = origin;
    const limits = Object.freeze(
        mode === 'availability' ? { termMs: 4000, killMs: 8000 } : { termMs: 174000, killMs: 178000 },
    );
    const elapsedMs = () => {
        const current = now();
        invariant(Number.isFinite(current) && current >= last, 'invalid-diagnostic-monotonic-clock');
        last = current;
        return current - origin;
    };
    const remainingMs = (phase) => {
        invariant(phase === 'term' || phase === 'kill', 'invalid-diagnostic-deadline-phase');
        return Math.max(0, Math.floor(limits[`${phase}Ms`] - elapsedMs()));
    };
    const requireSpawnBudget = () => {
        invariant(remainingMs('term') > 0, 'diagnostic-preflight-budget-exhausted');
    };
    return Object.freeze({
        limits,
        elapsedMs,
        remainingMs,
        requireSpawnBudget,
        startupTimeoutMs: () => {
            const remaining = remainingMs('term');
            invariant(remaining > 0, 'diagnostic-preflight-budget-exhausted');
            return Math.min(2000, remaining);
        },
    });
}

// Zero selected events are valid only for an otherwise fully validated ordinary run.
// Availability and the known sender control still require real send/delivery proof.
function emptyTraceAllowed(options, report, rootIdentity) {
    return (
        !options.control &&
        options.mode !== 'availability' &&
        !(options.mode === 'cpu' && options.cpuCase === 'custodian-delayed-stop-ack') &&
        validTuple(rootIdentity, true) &&
        report.trace?.ok === true &&
        report.trace.empty === true &&
        report.physicalClosure === true &&
        report.original !== null &&
        report.errors.length === 0 &&
        report.attribution.status === 'UNKNOWN'
    );
}

async function runDiagnostic(options) {
    // All preflight work consumes the original external budget; it never starts a fresh timer.
    const budget = createDiagnosticBudget(options.mode);
    const startedAt = new Date().toISOString();
    invariant(process.platform === 'linux', 'linux-required');
    checkChildrenInterface();
    options = { ...options, out: path.resolve(options.out || '') };
    invariant(options.out && outside(REPO, options.out), 'new-external-output-required');
    invariant(!fs.existsSync(options.out), 'immutable-diagnostic-directory-exists');
    const command = buildCommand(options);
    let tracerIdentity = null;
    if (options.trace === 'on') {
        invariant(path.isAbsolute(options.strace || ''), 'absolute-strace-path-required');
        const file = fs.realpathSync(options.strace);
        invariant(
            /^[a-f0-9]{64}$/.test(options.straceSha256 || '') && sha256(file) === options.straceSha256,
            'strace-hash-mismatch',
        );
        const version = spawnSync(file, ['--version'], {
            encoding: 'utf8',
            timeout: budget.startupTimeoutMs(),
            maxBuffer: 8192,
        });
        invariant(
            version.status === 0 && !version.signal && version.stdout.split('\n')[0] === options.straceVersion,
            'strace-version-mismatch',
        );
        tracerIdentity = { sha256: options.straceSha256, version: options.straceVersion };
    }
    budget.requireSpawnBudget();
    fs.mkdirSync(options.out, { recursive: true, mode: 0o700 });
    invariant(outside(REPO, fs.realpathSync(options.out)), 'diagnostic-output-resolves-inside-repo');
    const report = {
        schemaVersion: SCHEMA,
        purpose: 'diagnostic-only',
        canonicalEligible: false,
        rawStraceRetained: false,
        traceRepresentation: 'fixed-numeric-enum-fields/1',
        mode: options.mode,
        cpuCase: options.cpuCase || null,
        traced: options.trace === 'on',
        traceFilter: options.trace === 'on' ? { syscalls: TRACE_SYSCALLS, signals: ['SIGTERM', 'SIGKILL'] } : null,
        startedAt,
        limits: command.limits,
        externalLimits: budget.limits,
        externalBudgetOrigin: 'runDiagnostic-entry-monotonic',
        bounds: BOUNDS,
        tracerIdentity,
        commandIdentity: { role: command.role, nodeSha256: sha256(process.execPath), toolSha256: sha256(__filename) },
        browserIdentity: command.browser
            ? {
                  sha256: command.browser.sha256,
                  version: command.browser.version,
                  playwrightVersion: command.browser.playwrightVersion,
              }
            : null,
        events: [],
        errors: [],
        trace: null,
        original: null,
        correlations: [],
        originalReceiptOK: null,
        diagnosticComplete: false,
        control: options.control || null,
        physicalClosure: false,
        attribution: { status: 'UNKNOWN', diagnosticOnly: true },
    };
    const event = (type, values = {}) => {
        const row = { type, elapsedMs: budget.elapsedMs(), ...values };
        report.events.push(row);
        return row;
    };
    const failure = (reason) => {
        if (!report.errors.includes(reason)) report.errors.push(reason);
    };
    const traceFile = fs.openSync(path.join(options.out, 'filtered-trace.jsonl'), 'wx', 0o600);
    const records = [],
        identityCache = new Map();
    let outputBytes = 0,
        child,
        rootIdentity,
        cancelRequested = false,
        cancellationSent = false,
        fd = null,
        fifoIdentity = null;
    const frozenImage = command.browser
        ? (() => {
              const row = fs.statSync(command.browser.executable);
              return { dev: row.dev, ino: row.ino, size: row.size, mtimeMs: row.mtimeMs };
          })()
        : null;
    const cancel = (reason) => {
        failure(reason);
        cancelRequested = true;
        if (!cancellationSent && same(rootIdentity, identity(rootIdentity?.pid))) {
            try {
                process.kill(rootIdentity.pid, 'SIGTERM');
                cancellationSent = true;
                event('original-outer-signal', { identity: rootIdentity, signal: 'SIGTERM' });
            } catch {
                failure('original-outer-signal-failed');
            }
        }
    };
    const parser = createParser({
        onFailure: cancel,
        onRecord: (record) => {
            const observation =
                record.kind === 'delivery' || (record.kind === 'syscall' && TRACE_SYSCALLS.includes(record.syscall))
                    ? observeOwned(record.tid, rootIdentity, frozenImage)
                    : null;
            const thread = observation?.thread || null,
                leader = observation?.process || null;
            const row = {
                ...record,
                eventId: records.length + 1,
                threadIdentity: thread,
                processIdentity: leader,
                identityObservation: observation,
            };
            if (record.kind === 'syscall') {
                row.callerProcessIdentity = leader;
                if (['kill', 'tkill', 'tgkill'].includes(record.syscall) && record.target > 0)
                    row.targetObservation = observeOwned(record.targetTid || record.target, rootIdentity, frozenImage);
            }
            const encoded = JSON.stringify(row) + '\n';
            if (outputBytes + Buffer.byteLength(encoded) > BOUNDS.outputBytes) return cancel('trace-output-bound');
            outputBytes += Buffer.byteLength(encoded);
            fs.writeSync(traceFile, encoded);
            records.push(row);
        },
    });
    const fifo = path.join(options.out, 'trace.fifo');
    if (report.traced) {
        const mkfifo = spawnSync('/usr/bin/mkfifo', ['--mode=600', fifo], {
            timeout: budget.startupTimeoutMs(),
            maxBuffer: 1024,
        });
        event('mkfifo-complete', { pid: mkfifo.pid, code: mkfifo.status, signal: mkfifo.signal });
        invariant(mkfifo.status === 0 && !mkfifo.signal, 'mkfifo-failed');
        const entry = fs.lstatSync(fifo);
        invariant(entry.isFIFO() && !entry.isSymbolicLink(), 'unsafe-trace-fifo');
        fd = fs.openSync(fifo, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
        fifoIdentity = fs.fstatSync(fd);
        invariant(fifoIdentity.dev === entry.dev && fifoIdentity.ino === entry.ino, 'trace-fifo-replaced');
    }
    budget.requireSpawnBudget();
    const onInterrupt = () => cancel('diagnostic-wrapper-interrupted');
    process.on('SIGTERM', onInterrupt);
    process.on('SIGINT', onInterrupt);
    child = spawn(
        report.traced ? options.strace : command.executable,
        report.traced ? traceArgs(fifo, command) : command.args,
        { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const childIdentity = identity(child.pid);
    event(report.traced ? 'tracer-spawn' : 'original-outer-spawn', { identity: childIdentity });
    if (!report.traced) rootIdentity = childIdentity;
    let stdioBytes = 0,
        childClosed = false,
        fifoEOF = false;
    for (const [index, name] of [
        [1, 'stdout'],
        [2, 'stderr'],
    ]) {
        // Original nested collectors already retain their own raw stdout/stderr. This outer stream
        // is only counted, never copied into a privacy-bounded trace artifact.
        child.stdio[index].on('data', (bytes) => {
            stdioBytes += bytes.length;
            if (stdioBytes > BOUNDS.inputBytes) cancel('outer-stdio-bound');
        });
        child.stdio[index].once('end', () => event(`${report.traced ? 'tracer' : 'outer'}-${name}-eof`));
    }
    child.once('error', () => failure('outer-spawn-error'));
    child.once('exit', (code, signal) => event(report.traced ? 'tracer-exit' : 'outer-exit', { code, signal }));
    const read = () => {
        if (fd === null) return;
        const bytes = Buffer.alloc(65536);
        // Bound each polling slice as well as the overall stream; keep draining after failure.
        for (let i = 0; i < 32; i++) {
            let size;
            try {
                size = fs.readSync(fd, bytes, 0, bytes.length, null);
            } catch (error) {
                if (error.code !== 'EAGAIN') failure('trace-read-failed');
                return;
            }
            if (!size) {
                if (childClosed && !fifoEOF) {
                    fifoEOF = true;
                    event('trace-fifo-eof');
                }
                return;
            }
            parser.push(bytes.subarray(0, size));
        }
    };
    const observeRoot = () => {
        if (!rootIdentity && report.traced && child.pid) {
            try {
                const candidates = fs
                    .readFileSync(`/proc/${child.pid}/task/${child.pid}/children`, 'utf8')
                    .trim()
                    .split(/\s+/)
                    .map(Number)
                    .filter(Boolean);
                for (const pid of candidates) {
                    if (fs.realpathSync(`/proc/${pid}/exe`) !== fs.realpathSync(process.execPath)) continue;
                    const current = identity(pid),
                        after = identity(pid);
                    if (current && same(current, after) && current.ppid === child.pid && current.tgid === pid) {
                        rootIdentity = current;
                        event('original-outer-observed', { identity: current });
                        if (cancelRequested) cancel('cancel-before-root-observed');
                        break;
                    }
                }
            } catch {
                /* A short-lived child may vanish. Missing identity remains UNKNOWN. */
            }
        }
    };
    let lastSample = 0,
        controlReady = false;
    const sampleOwned = () => {
        if (!report.traced || !rootIdentity || Date.now() - lastSample < 25) return;
        lastSample = Date.now();
        const queue = [rootIdentity.pid],
            visited = new Set();
        while (queue.length && visited.size < BOUNDS.identities) {
            const pid = queue.shift();
            if (visited.has(pid)) continue;
            visited.add(pid);
            const observation = observeOwned(pid, rootIdentity, frozenImage);
            if (!observation) continue;
            const key = `${pid}:${observation.process.startTicks}:${observation.process.namespace}`;
            const previous = identityCache.get(key);
            if (!previous && identityCache.size >= BOUNDS.identities) {
                cancel('identity-count-bound');
                break;
            }
            identityCache.set(
                key,
                previous
                    ? {
                          ...previous,
                          lastObservedAt: observation.observedAt,
                          imageChanged:
                              previous.imageChanged ||
                              !imageSame(previous.observation.imageAfter, observation.imageAfter) ||
                              !observation.imageStable,
                      }
                    : {
                          observation,
                          firstObservedAt: observation.observedAt,
                          lastObservedAt: observation.observedAt,
                          firstAbsentAt: null,
                          imageChanged: !observation.imageStable,
                      },
            );
            try {
                const children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
                for (const value of children.split(/\s+/)) if (/^\d+$/.test(value)) queue.push(Number(value));
            } catch {
                /* No unproven child is sampled. */
            }
        }
        for (const value of identityCache.values()) {
            const presence = exactPresence(value.observation.process);
            if (value.firstAbsentAt === null && presence === 'ABSENT') value.firstAbsentAt = Date.now();
            if (presence === 'UNKNOWN') value.metadataUnknown = true;
        }
    };
    const poll = setInterval(() => {
        observeRoot();
        read();
        sampleOwned();
        if (options.control && !controlReady) {
            try {
                const journal = fs.readFileSync(path.join(options.out, 'attempt', 'custodian.events.jsonl'), 'utf8');
                if (
                    journal
                        .split('\n')
                        .filter(Boolean)
                        .map(JSON.parse)
                        .some((row) => row.type === 'runtime-custody-barrier' && row.phase === 'start' && row.ok)
                ) {
                    const journalRows = journal.split('\n').filter(Boolean).map(JSON.parse);
                    const inner = journalRows.find((row) => row.type === 'inner-supervisor-spawn')?.identity;
                    const innerObservation = inner && observeOwned(inner.pid, rootIdentity, frozenImage);
                    const custodianObservation = inner && observeOwned(inner.ppid, rootIdentity, frozenImage);
                    if (!innerObservation || !custodianObservation) return;
                    const inputBoundArm =
                        options.control === 'trace-input-bound' ? parser.restrictToCurrentInput() : null;
                    controlReady = true;
                    if (inputBoundArm) event('control-input-bound-armed', inputBoundArm);
                    fs.writeFileSync(
                        path.join(options.out, 'control-ready.json'),
                        JSON.stringify({
                            wrapperPID: process.pid,
                            originalOuter: rootIdentity,
                            innerObservation,
                            custodianObservation,
                            control: options.control,
                            inputBoundArm,
                        }) + '\n',
                        { flag: 'wx', mode: 0o600 },
                    );
                    event('control-real-start-barrier');
                }
            } catch {
                /* Not ready. The original and external deadlines still apply. */
            }
        }
    }, 10);
    const term = setTimeout(() => cancel('external-term-deadline'), budget.remainingMs('term'));
    const kill = setTimeout(() => {
        failure('external-kill-deadline');
        try {
            if (same(rootIdentity, identity(rootIdentity?.pid))) {
                process.kill(rootIdentity.pid, 'SIGKILL');
                event('original-outer-signal', { identity: rootIdentity, signal: 'SIGKILL' });
            }
        } catch {
            failure('final-outer-signal-failed');
        }
        // A final failed diagnostic must never turn tracer detachment into a successful closure claim.
        try {
            if (same(childIdentity, identity(childIdentity?.pid))) {
                process.kill(child.pid, 'SIGKILL');
                event('tracer-forced-kill');
            }
        } catch {
            failure('final-tracer-signal-failed');
        }
    }, budget.remainingMs('kill'));
    await new Promise((resolve) =>
        child.once('close', (code, signal) => {
            childClosed = true;
            event(report.traced ? 'tracer-stdio-close' : 'outer-stdio-close', { code, signal });
            resolve();
        }),
    );
    clearInterval(poll);
    clearTimeout(term);
    clearTimeout(kill);
    process.removeListener('SIGTERM', onInterrupt);
    process.removeListener('SIGINT', onInterrupt);
    if (fd !== null) {
        read();
        fs.closeSync(fd);
        const entry = fs.lstatSync(fifo);
        invariant(
            entry.isFIFO() && entry.dev === fifoIdentity.dev && entry.ino === fifoIdentity.ino,
            'trace-fifo-replaced',
        );
        fs.unlinkSync(fifo);
    }
    report.trace = { ...parser.finish(), outputBytes, retainedEvents: records.length };
    fs.closeSync(traceFile);
    report.trace.filteredSha256 = sha256(path.join(options.out, 'filtered-trace.jsonl'));
    const cache = [...identityCache.values()];
    const encodedCache = JSON.stringify(cache, null, 2) + '\n';
    if (Buffer.byteLength(encodedCache) > BOUNDS.identityBytes) failure('identity-output-bound');
    else {
        fs.writeFileSync(path.join(options.out, 'process-identities.json'), encodedCache, { flag: 'wx', mode: 0o600 });
        report.trace.identityCacheSha256 = sha256(path.join(options.out, 'process-identities.json'));
    }
    if (!report.trace.ok) failure(report.trace.reason);
    const prefix = report.traced ? 'tracer' : 'outer';
    for (const suffix of ['exit', 'stdio-close', 'stdout-eof', 'stderr-eof'])
        if (!report.events.some((row) => row.type === `${prefix}-${suffix}`))
            failure('outer-physical-close-incomplete');
    if (report.traced && !fifoEOF) failure('trace-fifo-eof-missing');
    if (exactPresence(rootIdentity) !== 'ABSENT') failure('original-outer-absence-unproven');
    if (exactPresence(childIdentity) !== 'ABSENT') failure('tracer-absence-unproven');
    report.trace.empty = records.length === 0;
    if (!rootIdentity) failure('original-outer-identity-unavailable');
    if (report.traced && sha256(options.strace) !== options.straceSha256) failure('strace-hash-changed');
    if (command.browser && sha256(command.browser.executable) !== command.browser.sha256)
        failure('browser-hash-changed');
    const receiptFile = command.receipt || path.join(options.out, 'attempt', 'attempt-receipt.json');
    if (options.control) {
        failure('intentional-wrapper-negative-control');
        try {
            const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
            report.originalReceiptOK = receipt.ok;
            const raw = receipt.custody.observation;
            report.missingOriginalRoles = ['raw', 'nodeReceipt', 'journal', 'stdout', 'stderr'].filter(
                (role) => !receipt.custody.artifacts[role],
            );
            for (const reference of Object.values(receipt.custody.artifacts))
                invariant(
                    fs.statSync(reference.path).size === reference.bytes && sha256(reference.path) === reference.sha256,
                    'control-original-artifact-mismatch',
                );
            const rawReference = receipt.custody.artifacts.raw,
                journalReference = receipt.custody.artifacts.journal;
            const originalRaw = JSON.parse(fs.readFileSync(rawReference.path, 'utf8'));
            const journal = fs
                .readFileSync(journalReference.path, 'utf8')
                .trim()
                .split('\n')
                .filter(Boolean)
                .map(JSON.parse);
            const exact = (row) =>
                row &&
                raw.events.some((item) => item.eventId === row.eventId && JSON.stringify(item) === JSON.stringify(row));
            const finalBefore = (row) => exact(row) && row.eventId < raw.final.eventId;
            report.physicalClosure =
                JSON.stringify(raw) === JSON.stringify(originalRaw) &&
                sha256(rawReference.path) === rawReference.sha256 &&
                sha256(journalReference.path) === journalReference.sha256 &&
                JSON.stringify(journal) === JSON.stringify(raw.events) &&
                exact(raw.final) &&
                raw.final.result === 'ECHILD' &&
                finalBefore(raw.innerSupervisor.exit) &&
                finalBefore(raw.innerSupervisor.stdoutEOF) &&
                finalBefore(raw.innerSupervisor.stderrEOF) &&
                raw.adopted.every(
                    (row) =>
                        finalBefore(row.reap) &&
                        finalBefore(row.absent) &&
                        same(row, row.reap) &&
                        same(row, row.absent) &&
                        row.reap.eventId < row.absent.eventId,
                ) &&
                receipt.custody.wrapper.exit?.elapsedMs >= raw.final.elapsedMs &&
                receipt.custody.wrapper.close?.elapsedMs >= receipt.custody.wrapper.exit.elapsedMs &&
                !!receipt.custody.wrapper.exit &&
                !!receipt.custody.wrapper.close &&
                receiptIdentities(receipt).every((row) => exactPresence(row) === 'ABSENT') &&
                exactPresence(rootIdentity) === 'ABSENT' &&
                exactPresence(childIdentity) === 'ABSENT' &&
                fifoEOF &&
                ['exit', 'stdio-close', 'stdout-eof', 'stderr-eof'].every((suffix) =>
                    report.events.some((row) => row.type === `tracer-${suffix}`),
                ) &&
                !report.errors.some((reason) =>
                    [
                        'external-kill-deadline',
                        'original-owned-process-still-present',
                        'outer-physical-close-incomplete',
                    ].includes(reason),
                );
            report.original = {
                receiptSha256: sha256(receiptFile),
                ok: receipt.ok,
                kernelFinal: raw.final?.result || null,
            };
        } catch {
            failure('control-original-closure-unavailable');
        }
        if (!report.physicalClosure) failure('control-physical-closure-incomplete');
    } else if (options.mode !== 'availability') {
        try {
            const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
            report.originalReceiptOK = receipt.ok;
            const artifacts = {};
            for (const role of ['raw', 'nodeReceipt', 'journal', 'stdout', 'stderr']) {
                const reference = receipt.custody.artifacts[role];
                const bytes = fs.readFileSync(reference.path);
                invariant(
                    bytes.length === reference.bytes && sha256(reference.path) === reference.sha256,
                    'original-custody-artifact-mismatch',
                );
                artifacts[role] = ['raw', 'nodeReceipt'].includes(role) ? JSON.parse(bytes) : bytes;
            }
            if (!validateCustodyArtifacts(receipt, artifacts).ok) failure('original-custody-artifacts-invalid');
            report.original = {
                receiptSha256: sha256(receiptFile),
                ok: receipt.ok,
                forced: receipt.forced,
                timedOut: receipt.timedOut,
                workerExit: receipt.worker?.exit || null,
                workerClose: receipt.worker?.close || null,
                custodyExit: receipt.custody?.wrapper?.exit || null,
                custodyClose: receipt.custody?.wrapper?.close || null,
                kernelFinal: receipt.custody?.observation?.final?.result || null,
                noOwnedProcesses: receipt.noOwnedProcesses,
            };
            if (
                !report.original.workerExit ||
                !report.original.workerClose ||
                !report.original.custodyExit ||
                !report.original.custodyClose ||
                report.original.kernelFinal !== 'ECHILD' ||
                !receipt.noOwnedProcesses
            )
                failure('original-closure-incomplete');
            if (!expectedOutcome(receipt, options)) failure('unexpected-original-outcome');
            if (options.mode === 'target') {
                const admission = JSON.parse(
                    fs.readFileSync(path.join(path.dirname(receiptFile), 'admission.json'), 'utf8'),
                );
                const attempt = JSON.parse(
                    fs.readFileSync(path.join(path.dirname(receiptFile), 'attempt.json'), 'utf8'),
                );
                report.original.admitted = admission.ok;
                report.original.collectorResult = attempt.result?.result || null;
                if (
                    admission.ok !== receipt.ok ||
                    admission.partial !== true ||
                    admission.completed !== false ||
                    attempt.id !== 'collector-dodge' ||
                    attempt.result?.result !== (receipt.ok ? 'PASS' : 'FAIL')
                )
                    failure('original-campaign-verdict-mismatch');
            }
            const outerClosed = report.events.find((row) => row.type === `${prefix}-stdio-close`);
            if (outerClosed?.code !== (receipt.ok ? 0 : 1) || outerClosed?.signal)
                failure('outer-original-exit-mismatch');
            if (!receiptIdentities(receipt).every((row) => exactPresence(row) === 'ABSENT'))
                failure('original-owned-absence-unproven');
            const resolved = resolveCachedIdentities(records, cache, receipt);
            report.correlations = correlate(resolved, receiptIdentities(receipt), rootIdentity);
            if (options.mode === 'target')
                report.attribution = targetAttribution(receipt, resolved, report.correlations);
            if (options.mode === 'cpu' && options.cpuCase === 'custodian-delayed-stop-ack' && report.traced) {
                report.cpuKnownSender = {
                    source: 'original-python-cpu-worker-signal-identity-proof',
                    established: knownCpuSender(receipt, records, rootIdentity),
                };
                if (!report.cpuKnownSender.established) failure('cpu-known-sender-not-established');
            }
        } catch {
            failure('original-receipt-unavailable');
        }
    } else {
        report.correlations = correlate(
            records,
            records.flatMap((row) => [row.processIdentity, row.threadIdentity]).filter(Boolean),
            rootIdentity,
        );
        if (!report.correlations.some((row) => row.status === 'CORRELATED_DIAGNOSTIC_ONLY' && row.signal === 'SIGTERM'))
            failure('availability-sender-not-established');
        const closed = report.events.find((row) => row.type === 'tracer-stdio-close');
        if (!closed || !(closed.code === 143 || closed.signal === 'SIGTERM')) failure('availability-exit-mismatch');
    }
    if (!options.control)
        report.physicalClosure =
            !!rootIdentity &&
            !report.errors.some((reason) =>
                /closure|close|absence|still-present|fifo|spawn|receipt-unavailable|external-kill/.test(reason),
            );
    if (report.traced && report.trace.empty && !options.control && !emptyTraceAllowed(options, report, rootIdentity))
        failure('trace-empty-or-unavailable');
    report.diagnosticComplete = report.errors.length === 0;
    report.status = report.diagnosticComplete ? 'DIAGNOSTIC_COMPLETE' : 'FAIL';
    report.endedAt = new Date().toISOString();
    fs.writeFileSync(path.join(options.out, 'diagnostic.json'), JSON.stringify(report, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
    });
    return report;
}

async function main(args) {
    const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const report = await runDiagnostic({
        mode: value('mode'),
        trace: value('trace'),
        out: value('out'),
        cpuCase: value('case'),
        control: value('control'),
        freeze: value('freeze'),
        strace: value('strace'),
        straceSha256: value('strace-sha256'),
        straceVersion: value('strace-version'),
        limits: value('limits') ? JSON.parse(value('limits')) : undefined,
    });
    console.log(JSON.stringify({ status: report.status, canonicalEligible: false, rawStraceRetained: false }));
    process.exitCode = report.status === 'DIAGNOSTIC_COMPLETE' ? 0 : 1;
}
if (require.main === module)
    main(process.argv.slice(2)).catch(() => {
        console.error('Shutdown diagnostic failed; no canonical evidence was admitted.');
        process.exitCode = 1;
    });
module.exports = {
    SCHEMA,
    SYSCALLS,
    TRACE_SYSCALLS,
    CPU_CASES,
    BOUNDS,
    createParser,
    buildCommand,
    traceArgs,
    correlate,
    receiptIdentities,
    expectedOutcome,
    targetAttribution,
    physicalReceipt,
    cachedObservation,
    validObservation,
    validImage,
    exactPresence,
    checkChildrenInterface,
    resolveCachedIdentities,
    createDiagnosticBudget,
    emptyTraceAllowed,
    runDiagnostic,
};
