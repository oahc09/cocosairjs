'use strict';
/**
 * Bounded one-example collector worker. Writes only new external attempt files, never merges/promotes evidence.
 * Linux /proc identity is intentional: unsupported process namespaces fail closed instead of inventing receipts.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { Socket } = require('net');
const { performance } = require('perf_hooks');
const { snapshotOwnedProcess } = require('./example-evidence-process-diagnostics.cjs');

const SCHEMA_VERSION = 'example-evidence-attempt/1';
let activeWorker = null;
const DEFAULT_LIMITS = Object.freeze({
    startupMs: 15000,
    closeMs: 4000,
    innerMs: 120000,
    abortMs: 125000,
    forceMs: 133000,
    finalMs: 139000,
});
const CPU_CASES = [
    'positive',
    'synchronous-compiler',
    'compiler-mode-missing',
    'compiler-mode-invalid',
    'ui-shell',
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
    'worker-nonzero',
    'stop-error',
    'orphan-descendant',
    'detached-orphan',
    'double-fork-orphan',
    'custodian-no-ack',
    'custodian-disabled',
    'custodian-early-exit',
    'custodian-killed',
    'custodian-postspawn-error',
    'detached-zombie',
    'custodian-pipe-eof',
    'custodian-duplicate-ack',
    'custodian-delayed-stop-ack',
    'custodian-stop-drain-cancel',
    'custodian-stop-drain-deadline',
];
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function stat(pid) {
    try {
        const value = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const fields = value.slice(value.lastIndexOf(')') + 2).split(' ');
        return { pid, state: fields[0], ppid: +fields[1], pgrp: +fields[2], startTicks: fields[19] };
    } catch {
        return null;
    }
}
function namespaceOf(pid = 'self') {
    try {
        return fs.readlinkSync(`/proc/${pid}/ns/pid`);
    } catch {
        return null;
    }
}
function sameProcess(row) {
    const current = stat(row.pid);
    return !!current && current.startTicks === row.startTicks && namespaceOf(row.pid) === row.namespace;
}
function limitsOf(overrides = {}) {
    const limits = { ...DEFAULT_LIMITS, ...overrides };
    for (const [key, maximum] of Object.entries(DEFAULT_LIMITS)) {
        if (!Number.isInteger(limits[key]) || limits[key] <= 0 || limits[key] > maximum) {
            throw Error(`${key} must be an integer in 1..${maximum}`);
        }
    }
    if (!(
        limits.startupMs < limits.innerMs &&
        limits.closeMs < limits.innerMs &&
        limits.innerMs < limits.abortMs &&
        limits.abortMs < limits.forceMs &&
        limits.forceMs < limits.finalMs
    )) {
        throw Error('Deadline order must be startup/close < inner < abort < force < final');
    }
    return limits;
}
function outsideRepo(file, repo) {
    const rel = path.relative(repo, file);
    return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}
function validateAttemptReceiptUnchecked(receipt, options = {}) {
    const errors = [];
    const fail = (message) => errors.push(message);
    if (!receipt || typeof receipt !== 'object') return { ok: false, errors: ['receipt missing'] };
    const success = options.requireSuccess !== false;
    const command = receipt.command;
    const expectedCollector = receipt.cpuDummy
        ? 'example-evidence-supervisor.cpu-fixture.cjs'
        : 'example-spec-browser.cjs';
    if (
        !command ||
        typeof command.cwd !== 'string' ||
        typeof command.executable !== 'string' ||
        !Array.isArray(command.args) ||
        command.args[0] !== '--require' ||
        path.basename(command.args[1] || '') !== 'example-evidence-observer.cjs' ||
        path.basename(command.args[2] || '') !== expectedCollector ||
        command.args.filter((arg) => arg.startsWith('--ids=')).length !== 1 ||
        !command.args.includes(`--ids=${receipt.id}`) ||
        !command.args.includes(`--out=${receipt.output?.report}`) ||
        !command.args.includes(`--artifact-dir=${receipt.output?.artifactDir}`) ||
        command.args.includes('--no-trace')
    )
        fail('original one-example collector command missing');

    if (receipt.schemaVersion !== SCHEMA_VERSION) fail('attempt receipt schema mismatch');
    if (options.id && receipt.id !== options.id) fail('attempt example ID mismatch');
    if (receipt.cpuDummy !== false && !(options.allowCpuDummy === true && receipt.cpuDummy === true)) {
        fail('CPU dummy receipt is not production evidence');
    }
    if (receipt.forced !== false || receipt.timedOut !== false) fail('forced or timed-out attempt');
    if (receipt.noOwnedProcesses !== true) fail('owned process absence not confirmed');
    if (!Array.isArray(receipt.lifecycleErrors) || receipt.lifecycleErrors.length) fail('lifecycle errors retained');
    if (!Array.isArray(receipt.errors) || (success && receipt.errors.length)) fail('attempt errors retained');
    let limits;
    try {
        limits = limitsOf(receipt.limits);
    } catch (error) {
        fail(error.message);
        limits = DEFAULT_LIMITS;
    }
    const events = Array.isArray(receipt.events) ? receipt.events : [];
    if (!events.length) fail('event log missing');
    const eventIds = new Set();
    let lastTime = -1;
    let observerSequence = 0;
    const startedEpoch = Date.parse(receipt.startedAt);
    const endedEpoch = Date.parse(receipt.endedAt);
    if (
        !Number.isFinite(startedEpoch) ||
        !Number.isFinite(endedEpoch) ||
        endedEpoch < startedEpoch ||
        endedEpoch > Date.now() + 1000
    )
        fail('attempt wall-clock boundaries invalid');
    for (const [index, event] of events.entries()) {
        if (
            event.eventId !== index + 1 ||
            eventIds.has(event.eventId) ||
            !Number.isFinite(event.supervisorElapsedMs) ||
            !(event.supervisorElapsedMs >= lastTime)
        ) {
            fail('event identity/order invalid');
        }
        const receivedEpoch = Date.parse(event.receivedUtc);
        if (
            !Number.isFinite(receivedEpoch) ||
            receivedEpoch < startedEpoch ||
            receivedEpoch > endedEpoch ||
            Math.abs(receivedEpoch - startedEpoch - event.supervisorElapsedMs) > 250
        )
            fail('event lies outside attempt time boundary');
        if (!['observer', 'supervisor'].includes(event.source)) fail('event source missing');
        if (event.source === 'observer' && event.sequence !== ++observerSequence)
            fail('observer sequence is not contiguous');
        eventIds.add(event.eventId);
        lastTime = event.supervisorElapsedMs;
        if (
            event.source === 'observer' &&
            (event.workerPID !== receipt.worker?.pid ||
                event.namespace !== receipt.worker?.namespace ||
                event.cpuDummy !== receipt.cpuDummy)
        )
            fail('observer identity mismatch');
        if (
            [
                'observer-failure',
                'observer-incomplete',
                'abort-close-error',
                'late-browser-close-error',
                'runtime-start-error',
                'runtime-stop-error',
                'browser-process-error',
                'server-error',
                'abort-request',
                'owned-signal',
                'owned-signal-error',
            ].includes(event.type)
        )
            fail(`failure event retained: ${event.type}`);
    }
    function eventIs(value, type) {
        const logged = value && events.find((event) => event.eventId === value.eventId);
        return !!logged && value.type === type && JSON.stringify(value) === JSON.stringify(logged);
    }
    function cleanExit(value, type, allowFailure = false) {
        return (
            eventIs(value, type) &&
            value.signal === null &&
            Number.isInteger(value.code) &&
            (allowFailure || value.code === 0)
        );
    }
    const ownedProcesses = Array.isArray(receipt.ownedProcesses) ? receipt.ownedProcesses : [];
    const ownedGroups = Array.isArray(receipt.ownedGroups) ? receipt.ownedGroups : [];
    if (!ownedProcesses.length || !ownedGroups.length) fail('owned identity/disappearance records missing');
    const exactRows = (rows, firstType, lastType, firstKey, lastKey) => {
        const first = events.filter((event) => event.type === firstType);
        const last = events.filter((event) => event.type === lastType);
        if (
            first.length !== rows.length ||
            last.length !== rows.length ||
            new Set(rows.map((row) => row[firstKey]?.eventId)).size !== rows.length ||
            new Set(rows.map((row) => row[lastKey]?.eventId)).size !== rows.length
        )
            fail(`${firstType} records are not one-to-one`);
    };
    exactRows(ownedProcesses, 'owned-process-observed', 'owned-process-absent', 'firstObserved', 'disappearance');
    exactRows(ownedGroups, 'owned-group-observed', 'owned-group-empty', 'firstObserved', 'empty');
    if (
        new Set(ownedProcesses.map((row) => `${row.namespace}:${row.pid}:${row.startTicks}`)).size !==
            ownedProcesses.length ||
        new Set(ownedGroups.map((row) => `${row.namespace}:${row.leaderPID}:${row.leaderStartTicks}`)).size !==
            ownedGroups.length
    )
        fail('duplicate owned process/group identity');

    for (const row of ownedProcesses) {
        if (
            !eventIs(row.firstObserved, 'owned-process-observed') ||
            !eventIs(row.disappearance, 'owned-process-absent') ||
            row.pid !== row.firstObserved?.pid ||
            row.pid !== row.disappearance?.pid ||
            row.startTicks !== row.firstObserved?.startTicks ||
            row.startTicks !== row.disappearance?.startTicks ||
            row.namespace !== receipt.worker?.namespace ||
            row.namespace !== row.disappearance?.namespace ||
            !(row.disappearance?.supervisorElapsedMs >= row.firstObserved?.supervisorElapsedMs)
        )
            fail('owned process disappearance receipt missing');
    }
    for (const row of ownedGroups) {
        if (
            !eventIs(row.firstObserved, 'owned-group-observed') ||
            !eventIs(row.empty, 'owned-group-empty') ||
            row.leaderPID !== row.firstObserved?.leaderPID ||
            row.leaderPID !== row.empty?.leaderPID ||
            row.leaderStartTicks !== row.firstObserved?.leaderStartTicks ||
            row.leaderStartTicks !== row.empty?.leaderStartTicks ||
            row.namespace !== receipt.worker?.namespace
        )
            fail('owned process group empty receipt missing');
        const members = ownedProcesses.filter((member) => member.firstObserved?.pgrp === row.leaderPID);
        if (
            !members.length ||
            members.some((member) => !(member.disappearance?.supervisorElapsedMs <= row.empty?.supervisorElapsedMs))
        )
            fail('group became empty before all owned members disappeared');
    }
    const worker = receipt.worker || {};
    if (
        !Number.isInteger(worker.pid) ||
        worker.pid <= 0 ||
        !/^\d+$/.test(worker.startTicks || '') ||
        !worker.namespace
    ) {
        fail('worker exact PID/startTicks/namespace missing');
    }
    if (!ownedGroups.some((row) => row.leaderPID === worker.pid && row.leaderStartTicks === worker.startTicks))
        fail('detached worker group record missing');
    if (!ownedProcesses.some((row) => row.pid === worker.pid && row.startTicks === worker.startTicks))
        fail('worker absent from owned identity records');
    if (
        !eventIs(worker.spawn, 'worker-spawn') ||
        worker.spawn?.pid !== worker.pid ||
        worker.spawn?.startTicks !== worker.startTicks ||
        worker.spawn?.namespace !== worker.namespace
    )
        fail('worker spawn receipt missing');
    if (!cleanExit(worker.exit, 'worker-exit', !success) || !cleanExit(worker.close, 'worker-stdio-close', !success)) {
        fail('worker exit and stdio close receipts are not clean');
    }
    if (
        worker.exit?.code !== worker.close?.code ||
        worker.exit?.signal !== worker.close?.signal ||
        !(worker.exit?.supervisorElapsedMs <= worker.close?.supervisorElapsedMs)
    )
        fail('worker exit/close disagree');
    const runtimes = Array.isArray(receipt.runtimes) ? receipt.runtimes : [];
    const browsers = Array.isArray(receipt.browsers) ? receipt.browsers : [];
    const servers = Array.isArray(receipt.servers) ? receipt.servers : [];
    for (const [type, count] of [
        ['worker-spawn', 1],
        ['worker-exit', 1],
        ['worker-stdio-close', 1],
        ['observer-start', 1],
        ['observer-complete', 1],
        ...['runtime-start', 'launch-begin', 'runtime-ready', 'stop-begin', 'stop-complete'].map((type) => [
            type,
            runtimes.length,
        ]),
        ...['browser-spawn', 'browser-exit', 'browser-close'].map((type) => [type, browsers.length]),
        ...['server-listen-request', 'server-listening', 'server-close'].map((type) => [type, servers.length]),
    ])
        if (events.filter((event) => event.type === type).length !== count) fail(`${type} event cardinality invalid`);
    if (events.find((event) => event.type === 'observer-start')?.esbuildWorkerThreads !== '0')
        fail('collector compiler must use synchronous subprocess mode');
    const modes = options.expectedModes || receipt.expectedModes;
    if (
        !Array.isArray(modes) ||
        !modes.length ||
        new Set(modes).size !== modes.length ||
        JSON.stringify(runtimes.map((row) => row.mode)) !== JSON.stringify(modes)
    ) {
        fail('runtime modes differ from exact expected modes');
    }
    if (!runtimes.length || browsers.length !== runtimes.length || servers.length !== runtimes.length) {
        fail('each runtime requires exactly one browser process and one in-worker HTTP server');
    }
    if (
        new Set(runtimes.map((row) => row.runtimeId)).size !== runtimes.length ||
        new Set(browsers.map((row) => row.launchId)).size !== browsers.length ||
        new Set(servers.map((row) => row.serverId)).size !== servers.length
    )
        fail('duplicate runtime/browser/server identity');
    for (const [index, runtime] of runtimes.entries()) {
        if (
            runtime.exampleId !== receipt.id ||
            !eventIs(runtime.start, 'runtime-start') ||
            runtime.start?.runtimeId !== runtime.runtimeId ||
            runtime.start?.mode !== runtime.mode ||
            runtime.start?.kind !== runtime.kind ||
            JSON.stringify(runtime.start?.viewport) !== JSON.stringify(runtime.viewport) ||
            !Number.isInteger(runtime.viewport?.width) ||
            runtime.viewport.width <= 0 ||
            !Number.isInteger(runtime.viewport?.height) ||
            runtime.viewport.height <= 0
        )
            fail('runtime start identity mismatch');
        if (
            options.expectedViewports &&
            JSON.stringify(runtime.viewport) !== JSON.stringify(options.expectedViewports[runtime.mode])
        )
            fail('runtime mode viewport differs from frozen specification');
        if (index && !(runtimes[index - 1].stopComplete?.supervisorElapsedMs < runtime.start?.supervisorElapsedMs)) {
            fail('runtime overlaps previous physical closure');
        }
        if (!eventIs(runtime.launch, 'launch-begin') || runtime.launch?.runtimeId !== runtime.runtimeId)
            fail('runtime launch receipt missing');
        const ready = runtime.ready;
        if (!(
            worker.spawn?.supervisorElapsedMs <= runtime.start?.supervisorElapsedMs &&
            runtime.start?.supervisorElapsedMs <= runtime.launch?.supervisorElapsedMs &&
            ready?.supervisorElapsedMs <= runtime.stopBegin?.supervisorElapsedMs &&
            runtime.stopBegin?.supervisorElapsedMs <= runtime.stopComplete?.supervisorElapsedMs &&
            runtime.stopComplete?.supervisorElapsedMs <= worker.exit?.supervisorElapsedMs
        ))
            fail('runtime lifecycle time order invalid');
        if (
            !eventIs(ready, 'runtime-ready') ||
            ready?.runtimeId !== runtime.runtimeId ||
            ready?.launchId !== runtime.launch?.launchId ||
            ready?.kind !== runtime.kind ||
            !Number.isInteger(ready?.frames) ||
            ready.frames < 2 ||
            !Number.isFinite(ready?.launchElapsedMs) ||
            !(ready.launchElapsedMs >= 0 && ready.launchElapsedMs <= limits.startupMs) ||
            !(ready?.supervisorElapsedMs >= runtime.launch?.supervisorElapsedMs) ||
            !(ready?.supervisorElapsedMs - runtime.launch?.supervisorElapsedMs <= limits.startupMs)
        )
            fail('runtime readiness missing or late');
        if (!index && !(ready?.supervisorElapsedMs <= limits.startupMs))
            fail('first worker startup budget was exceeded/reset');
        if (receipt.cpuDummy) {
            if (ready?.clock !== 'CPU_DUMMY_NOT_RENDERING') fail('CPU readiness is mislabeled');
        } else if (runtime.kind === 'ui-shell') {
            if (
                ready?.clock !== 'DOM_REQUEST_ANIMATION_FRAME' ||
                ready?.domReady !== true ||
                !(ready?.selectorCount > 0) ||
                ready?.nativeEngineFrames !== null
            )
                fail('UI shell DOM readiness is invalid');
        } else if (runtime.kind !== 'engine' || ready?.clock !== 'NATIVE_PACER_EVENT_AFTER_DRAW')
            fail('native engine frames missing');
        if (
            !eventIs(runtime.stopBegin, 'stop-begin') ||
            !eventIs(runtime.stopComplete, 'stop-complete') ||
            runtime.stopBegin?.runtimeId !== runtime.runtimeId ||
            runtime.stopComplete?.runtimeId !== runtime.runtimeId ||
            !Number.isFinite(runtime.stopComplete?.durationMs) ||
            !(runtime.stopComplete.durationMs >= 0 && runtime.stopComplete.durationMs <= limits.closeMs) ||
            !(runtime.stopComplete?.supervisorElapsedMs - runtime.stopBegin?.supervisorElapsedMs <= limits.closeMs) ||
            runtime.stopComplete?.browserCount !== 1 ||
            runtime.stopComplete?.serverCount !== 1
        )
            fail('runtime stop receipt missing or late');
        const ownedBrowsers = browsers.filter((row) => row.runtimeId === runtime.runtimeId);
        const ownedServers = servers.filter((row) => row.runtimeId === runtime.runtimeId);
        if (ownedBrowsers.length !== 1 || ownedServers.length !== 1)
            fail('runtime expected browser/server receipts missing');
        for (const browser of ownedBrowsers) {
            if (
                browser.spawn?.row?.detached &&
                !ownedGroups.some((row) => row.leaderPID === browser.pid && row.leaderStartTicks === browser.startTicks)
            )
                fail('detached browser group record missing');
            if (!(
                runtime.launch?.supervisorElapsedMs <= browser.spawn?.supervisorElapsedMs &&
                browser.spawn?.supervisorElapsedMs <= ready?.supervisorElapsedMs &&
                runtime.stopBegin?.supervisorElapsedMs <= browser.exit?.supervisorElapsedMs
            ))
                fail('browser lifecycle time order invalid');
            if (!ownedProcesses.some((row) => row.pid === browser.pid && row.startTicks === browser.startTicks))
                fail('browser absent from owned identity records');
            if (
                !Number.isInteger(browser.pid) ||
                !/^\d+$/.test(browser.startTicks || '') ||
                browser.namespace !== worker.namespace ||
                !eventIs(browser.spawn, 'browser-spawn') ||
                browser.spawn?.row?.pid !== browser.pid ||
                browser.spawn?.row?.startTicks !== browser.startTicks ||
                browser.spawn?.row?.namespace !== browser.namespace ||
                browser.launchId !== runtime.launch?.launchId ||
                browser.command !== runtime.launch?.executablePath
            )
                fail('browser executable PID identity mismatch');
            if (
                !cleanExit(browser.exit, 'browser-exit') ||
                !cleanExit(browser.close, 'browser-close') ||
                browser.exit?.pid !== browser.pid ||
                browser.close?.pid !== browser.pid ||
                browser.exit?.launchId !== browser.launchId ||
                browser.close?.launchId !== browser.launchId ||
                !(browser.exit?.supervisorElapsedMs <= browser.close?.supervisorElapsedMs) ||
                !(browser.close?.supervisorElapsedMs <= runtime.stopComplete?.supervisorElapsedMs)
            )
                fail('browser exit/stdio close receipt missing or unclean');
        }
        for (const server of ownedServers) {
            if (!(
                runtime.start?.supervisorElapsedMs <= server.listenRequest?.supervisorElapsedMs &&
                server.listenRequest?.supervisorElapsedMs <= server.listening?.supervisorElapsedMs &&
                server.listening?.supervisorElapsedMs <= ready?.supervisorElapsedMs &&
                runtime.stopBegin?.supervisorElapsedMs <= server.close?.supervisorElapsedMs
            ))
                fail('server lifecycle time order invalid');
            if (
                server.ownerPID !== worker.pid ||
                server.physicalProcess !== 'collector-worker' ||
                !eventIs(server.listenRequest, 'server-listen-request') ||
                !eventIs(server.listening, 'server-listening') ||
                !eventIs(server.close, 'server-close') ||
                server.listening?.serverId !== server.serverId ||
                server.close?.serverId !== server.serverId ||
                server.listening?.ownerPID !== worker.pid ||
                server.close?.ownerPID !== worker.pid ||
                !server.listening?.address?.port ||
                !(server.listening?.supervisorElapsedMs <= server.close?.supervisorElapsedMs) ||
                !(server.close?.supervisorElapsedMs <= runtime.stopComplete?.supervisorElapsedMs)
            )
                fail('in-worker HTTP listen/close receipt missing');
        }
    }
    if (!events.some((event) => event.type === 'observer-complete' && event.runtimeCount === runtimes.length)) {
        fail('observer completion receipt missing');
    }
    if (!(worker.close?.supervisorElapsedMs < limits.finalMs)) fail('worker final deadline exceeded');
    if (!receipt.cpuDummy) {
        const identity = receipt.runtimeIdentity;
        if (
            !identity ||
            identity.traceOn !== true ||
            !identity.playwrightVersion ||
            !identity.executableVersion ||
            !/^[a-f0-9]{64}$/.test(identity.executableSha256 || '') ||
            !['chromium', 'firefox', 'webkit'].includes(identity.browserType) ||
            !Array.isArray(identity.launchArgs)
        )
            fail('frozen runtime identity missing');
        for (const runtime of runtimes) {
            if (
                runtime.launch?.executablePath !== (identity?.host?.executablePath || identity?.executablePath) ||
                JSON.stringify(runtime.launch?.launchArgs) !== JSON.stringify(identity?.launchArgs)
            )
                fail('runtime launch differs from frozen executable/arguments');
        }
        if (receipt.executableSha256 !== identity?.executableSha256)
            fail('observed executable hash differs from frozen identity');
        if (
            success &&
            (receipt.collector?.scopePassed !== true ||
                receipt.collector?.partial !== true ||
                receipt.collector?.completed !== false ||
                receipt.collector?.ids?.length !== 1 ||
                receipt.collector.ids[0] !== receipt.id)
        ) {
            fail('single-example partial collector result missing or failed');
        }
    }
    return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function validateCoreReceipt(receipt, options = {}) {
    try {
        return validateAttemptReceiptUnchecked(receipt, options);
    } catch (error) {
        return { ok: false, errors: [`malformed attempt receipt: ${error.message}`] };
    }
}

async function superviseAttemptInner(options) {
    if (activeWorker) throw Error('Previous attempt worker has not physically closed');
    const requestFD = Number(process.env.EXAMPLE_EVIDENCE_CUSTODIAN_REQUEST_FD);
    const responseFD = Number(process.env.EXAMPLE_EVIDENCE_CUSTODIAN_RESPONSE_FD);
    if (
        ![requestFD, responseFD].every((fd) => Number.isInteger(fd) && fd > 3) ||
        requestFD === responseFD ||
        Number(process.env.EXAMPLE_EVIDENCE_CUSTODIAN_PID) !== process.ppid
    )
        throw Error('Inner supervisor requires its real kernel custodian and private pipes');
    const supervisorStartedAt = new Date().toISOString();
    const startedEpoch =
        options.startedAt === undefined
            ? Date.now()
            : typeof options.startedAt === 'number'
              ? options.startedAt
              : Date.parse(options.startedAt);
    if (!Number.isFinite(startedEpoch) || startedEpoch > Date.now())
        throw Error('Invalid original execution startedAt');
    const repo = fs.realpathSync(path.resolve(options.repo || path.join(__dirname, '../..')));
    const id = options.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id))
        throw Error('Exactly one example ID required');
    const cpuCase = options.cpuCase || '';
    if (cpuCase && !CPU_CASES.includes(cpuCase)) throw Error(`Unknown CPU fixture: ${cpuCase}`);
    if (!cpuCase && options.executeAuthorized !== true)
        throw Error('Real browser execution requires explicit owner authorization');
    if (!options.out || !options.artifactDir) throw Error('Explicit external out and artifactDir required');
    if (!cpuCase && !options.responseDir) throw Error('Shared external responseDir required');
    const out = path.resolve(options.out);
    const artifactDir = path.resolve(options.artifactDir);
    const receiptPath = path.resolve(options.receiptPath || path.join(path.dirname(out), 'attempt-receipt.json'));
    const stdoutPath = path.resolve(options.stdoutPath || path.join(path.dirname(out), 'worker.stdout.log'));
    const stderrPath = path.resolve(options.stderrPath || path.join(path.dirname(out), 'worker.stderr.log'));
    const allPaths = [out, artifactDir, receiptPath, stdoutPath, stderrPath];
    if (new Set(allPaths).size !== allPaths.length || allPaths.some((file) => !outsideRepo(file, repo))) {
        throw Error('Attempt outputs must be distinct external paths, outside the repository');
    }
    for (const file of allPaths)
        if (fs.existsSync(file)) throw Error(`Immutable attempt target already exists: ${file}`);
    for (const file of allPaths) {
        let ancestor = path.dirname(file);
        while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
        if (!outsideRepo(fs.realpathSync(ancestor), repo)) throw Error('Attempt ancestor resolves inside repository');
    }
    for (const file of [out, receiptPath, stdoutPath, stderrPath])
        fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.mkdirSync(artifactDir, { recursive: true });
    // Resolve ancestor symlinks after mkdir, so an apparently external path cannot write back into the repository.
    for (const file of allPaths) {
        const real = fs.existsSync(file)
            ? fs.realpathSync(file)
            : path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
        if (!outsideRepo(real, repo)) throw Error('Attempt output resolves inside repository');
    }
    const limits = limitsOf(options.limits);
    const namespace = namespaceOf();
    if (!namespace) throw Error('Linux /proc process-namespace observation required');
    const expectedModes = options.expectedModes || ['primary'];
    const responseDir = options.responseDir ? path.resolve(options.responseDir) : null;
    if (responseDir) {
        if (!outsideRepo(responseDir, repo)) throw Error('Response directory must be outside repository');
        let ancestor = responseDir;
        while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
        if (!outsideRepo(fs.realpathSync(ancestor), repo)) throw Error('Response directory resolves inside repository');
        fs.mkdirSync(responseDir, { recursive: true });
        if (!outsideRepo(fs.realpathSync(responseDir), repo))
            throw Error('Response directory resolves inside repository');
    }
    const runtimeIdentity = options.runtimeIdentity || null;
    const executablePath = runtimeIdentity?.host?.executablePath || runtimeIdentity?.executablePath;
    let executableSha256 = null;
    if (!cpuCase) {
        if (!executablePath) throw Error('Frozen executable identity required');
        executableSha256 = sha256(executablePath);
        if (executableSha256 !== runtimeIdentity.executableSha256)
            throw Error('Frozen executable hash changed before spawn');
    }
    const args = [
        '--require',
        path.join(__dirname, 'example-evidence-observer.cjs'),
        cpuCase
            ? path.join(__dirname, 'example-evidence-supervisor.cpu-fixture.cjs')
            : path.join(repo, 'tools/verify/example-spec-browser.cjs'),
        `--ids=${id}`,
        `--out=${out}`,
        `--artifact-dir=${artifactDir}`,
    ];
    if (!cpuCase) args.push(`--browser=${runtimeIdentity.browserType}`);
    const elapsedBeforeSpawnMs = Date.now() - startedEpoch;
    if (elapsedBeforeSpawnMs >= limits.startupMs)
        throw Error('Original first-exec startup budget exhausted before worker spawn');
    const origin = performance.now() - elapsedBeforeSpawnMs;
    const receipt = {
        schemaVersion: SCHEMA_VERSION,
        attemptId: options.attemptId || crypto.randomUUID(),
        id,
        cpuDummy: !!cpuCase,
        cpuCase: cpuCase || null,
        expectedModes,
        runtimeIdentity,
        executableSha256,
        startedAt: new Date(startedEpoch).toISOString(),
        supervisorStartedAt,
        elapsedBeforeSpawnMs,
        endedAt: null,
        limits,
        command: { executable: process.execPath, args, cwd: repo },
        output: { report: out, artifactDir, responseDir, receipt: receiptPath, stdout: stdoutPath, stderr: stderrPath },
        worker: null,
        events: [],
        browsers: [],
        servers: [],
        runtimes: [],
        ownedProcesses: [],
        ownedGroups: [],
        errors: [],
        lifecycleErrors: [],
        forced: false,
        timedOut: false,
        noOwnedProcesses: false,
        collector: null,
        ok: false,
    };
    const browserRows = new Map(),
        serverRows = new Map(),
        runtimeRows = new Map();
    const owned = new Map();
    const groups = new Map();
    const timers = new Set();
    let child,
        finished = false,
        finishing = false,
        abortRequested = false,
        firstReady = false;
    let lastObserverSequence = 0;
    let resolveFinished;
    const finishedPromise = new Promise((resolve) => {
        resolveFinished = resolve;
    });
    const stdout = fs.createWriteStream(stdoutPath, { flags: 'wx' });
    const stderr = fs.createWriteStream(stderrPath, { flags: 'wx' });
    const event = (type, data = {}, source = 'supervisor') => {
        const entry = {
            ...data,
            type,
            source,
            eventId: receipt.events.length + 1,
            supervisorElapsedMs: performance.now() - origin,
            receivedUtc: new Date().toISOString(),
        };
        receipt.events.push(entry);
        return entry;
    };
    function fail(reason, lifecycle = true) {
        if (!receipt.errors.includes(reason)) receipt.errors.push(reason);
        if (lifecycle && !receipt.lifecycleErrors.includes(reason)) receipt.lifecycleErrors.push(reason);
    }
    function timer(callback, delay) {
        const value = setTimeout(callback, Math.max(1, delay));
        timers.add(value);
        return value;
    }
    function remember(row, role) {
        if (!row?.pid || !row.startTicks || row.namespace !== namespace) return;
        const key = `${row.pid}:${row.startTicks}`;
        if (!owned.has(key)) {
            const firstObserved = event('owned-process-observed', {
                pid: row.pid,
                startTicks: row.startTicks,
                namespace,
                role,
                pgrp: row.initial?.pgrp ?? row.pgrp,
                ppid: row.initial?.ppid ?? row.ppid,
                // Descriptive, privacy-limited observations only. Never used for ownership or PASS decisions.
                processDiagnostic: snapshotOwnedProcess(row),
            });
            owned.set(key, { ...row, role, firstObserved, disappearance: null });
        }
        if (row.detached && row.initial?.pgrp === row.pid && !groups.has(key)) {
            groups.set(key, {
                leaderPID: row.pid,
                leaderStartTicks: row.startTicks,
                namespace,
                firstObserved: event('owned-group-observed', {
                    leaderPID: row.pid,
                    leaderStartTicks: row.startTicks,
                    namespace,
                }),
                empty: null,
            });
        }
    }
    function scanOwned() {
        const processes = fs
            .readdirSync('/proc')
            .filter((name) => /^\d+$/.test(name))
            .map((name) => stat(+name))
            .filter(Boolean);
        const alive = [...owned.values()].filter(sameProcess);
        const emptyGroups = [];
        // A process group outlives its leader. Keep its proven identity until the entire group is observed empty.
        // PID allocation cannot reuse an extant PGID; additionally reject any changed leader startTicks.
        for (const group of groups.values()) {
            if (group.empty) continue;
            const leader = processes.find((row) => row.pid === group.leaderPID);
            if (leader && leader.startTicks !== group.leaderStartTicks) {
                fail('owned group leader PID identity changed');
                group.empty = event('owned-group-identity-changed', {
                    leaderPID: group.leaderPID,
                    leaderStartTicks: group.leaderStartTicks,
                    namespace,
                });
                continue;
            }
            const members = processes.filter(
                (row) =>
                    row.pgrp === group.leaderPID &&
                    BigInt(row.startTicks) >= BigInt(group.leaderStartTicks) &&
                    namespaceOf(row.pid) === namespace,
            );
            if (!members.length) {
                emptyGroups.push(group);
            } else
                for (const member of members) {
                    const key = `${member.pid}:${member.startTicks}`;
                    if (!owned.has(key)) {
                        const row = { ...member, namespace, detached: false };
                        remember(row, 'owned-group-descendant');
                        alive.push(row);
                    }
                }
        }
        let changed = true;
        while (changed) {
            changed = false;
            for (const processRow of processes) {
                const key = `${processRow.pid}:${processRow.startTicks}`;
                if (owned.has(key) || namespaceOf(processRow.pid) !== namespace) continue;
                if (alive.some((parent) => processRow.ppid === parent.pid)) {
                    const row = { ...processRow, namespace, detached: false };
                    remember(row, 'owned-descendant');
                    alive.push(row);
                    changed = true;
                }
            }
        }
        const remaining = [];
        for (const row of owned.values()) {
            if (sameProcess(row)) remaining.push(row);
            else if (!row.disappearance)
                row.disappearance = event('owned-process-absent', {
                    pid: row.pid,
                    startTicks: row.startTicks,
                    namespace,
                    role: row.role,
                });
        }
        for (const group of emptyGroups)
            group.empty = event('owned-group-empty', {
                leaderPID: group.leaderPID,
                leaderStartTicks: group.leaderStartTicks,
                namespace,
            });
        return remaining;
    }
    function signalOwned(row, signal) {
        if (!sameProcess(row)) return;
        try {
            // Signal an exact PID after checking startTicks and namespace. Never use an unverified negative PGID.
            process.kill(row.pid, signal);
            receipt.forced = true;
            event('owned-signal', { pid: row.pid, startTicks: row.startTicks, namespace, signal, role: row.role });
        } catch (error) {
            if (error.code !== 'ESRCH') {
                fail(`owned signal failed: ${error}`);
                event('owned-signal-error', { pid: row.pid, error: String(error) });
            }
        }
    }
    function reclaim(reason, immediate = false) {
        fail(reason);
        const live = scanOwned();
        // Children first; the worker gets a chance to reap its direct browser and emit real exit/close events.
        for (const row of live.filter((row) => row.pid !== child?.pid)) signalOwned(row, 'SIGKILL');
        if (child && !receipt.worker.close) {
            const killWorker = () => {
                const worker = [...owned.values()].find((row) => row.pid === child.pid);
                if (worker) signalOwned(worker, 'SIGKILL');
            };
            if (immediate) killWorker();
            else timer(killWorker, Math.min(100, limits.closeMs / 2));
        }
    }
    function requestAbort(reason, timedOut = false) {
        fail(reason);
        receipt.timedOut ||= timedOut;
        if (abortRequested) return;
        abortRequested = true;
        event('abort-request', { reason });
        if (child?.connected)
            child.send({ exampleEvidenceAbort: reason }, (error) => {
                if (error && error.code !== 'ERR_IPC_CHANNEL_CLOSED') fail(`abort IPC send failed: ${error}`);
            });
        timer(
            () => reclaim('abort cleanup deadline exceeded'),
            Math.min(limits.closeMs * 2, limits.forceMs - (performance.now() - origin)),
        );
    }
    let custodyPending = null;
    let custodySequence = 0;
    let custodyBuffer = '';
    function settleCustody(pending, outcome) {
        if (!pending || custodyPending !== pending) return;
        clearTimeout(pending.timer);
        custodyPending = null;
        event('custody-request-settled', { requestId: pending.requestId, phase: pending.phase, outcome });
        pending.resolveDrained();
    }
    const custodyToken = process.env.EXAMPLE_EVIDENCE_CUSTODIAN_TOKEN;
    // Wrap only already inherited anonymous pipe descriptors. No socket/network creation occurs.
    const custodyRead = new Socket({ fd: responseFD, readable: true, writable: false });
    const custodyWrite = new Socket({ fd: requestFD, readable: false, writable: true });
    custodyRead.unref();
    custodyWrite.unref();
    const custodyFailure = (reason) => {
        if (!finished) requestAbort(`Custody IPC: ${reason}`);
    };
    custodyRead.on('error', (error) => custodyFailure(error.message));
    custodyWrite.on('error', (error) => custodyFailure(error.message));
    custodyRead.on('end', () => custodyFailure(custodyBuffer ? 'truncated response EOF' : 'unexpected response EOF'));
    custodyRead.setEncoding('utf8');
    custodyRead.on('data', (data) => {
        custodyBuffer += data;
        if (Buffer.byteLength(custodyBuffer) > 65536) {
            custodyFailure('oversized response');
            return;
        }
        while (custodyBuffer.includes('\n')) {
            const newline = custodyBuffer.indexOf('\n');
            const line = custodyBuffer.slice(0, newline);
            custodyBuffer = custodyBuffer.slice(newline + 1);
            let response;
            try {
                response = JSON.parse(line);
            } catch {
                custodyFailure('malformed response');
                continue;
            }
            const pending = custodyPending;
            if (
                !pending ||
                response.token !== custodyToken ||
                response.requestId !== pending.requestId ||
                response.runtimeId !== pending.runtimeId ||
                response.phase !== pending.phase ||
                response.custodianPID !== process.ppid ||
                !Number.isInteger(response.eventId)
            ) {
                custodyFailure('unknown, duplicate, late or mismatched response');
                continue;
            }
            settleCustody(pending, 'response');
            if (response.ok !== true) custodyFailure('kernel barrier rejected');
            if (child?.connected)
                child.send({ exampleCustodyResponse: response }, (error) => {
                    if (error) custodyFailure(`worker response delivery: ${error.message}`);
                });
            else custodyFailure('collector disconnected before response');
        }
    });
    function relayCustody(request) {
        const current = stat(child.pid);
        const runtime = runtimeRows.get(request.runtimeId);
        const expectedRuntimeId = `runtime-${runtimeRows.size + 1}`;
        const validPhase =
            request.phase === 'start'
                ? request.runtimeId === expectedRuntimeId && [...runtimeRows.values()].every((row) => row.stopComplete)
                : request.phase === 'stop' &&
                  runtime &&
                  runtime.stopBegin &&
                  !runtime.stopComplete &&
                  [...browserRows.values()]
                      .filter((row) => row.runtimeId === request.runtimeId)
                      .every((row) => row.exit && row.close) &&
                  [...serverRows.values()]
                      .filter((row) => row.runtimeId === request.runtimeId)
                      .every((row) => row.close);
        if (
            custodyPending ||
            !current ||
            !sameProcess(receipt.worker) ||
            current.ppid !== process.pid ||
            request.workerPID !== child.pid ||
            request.token !== custodyToken ||
            request.requestId !== custodySequence + 1 ||
            !validPhase
        ) {
            custodyFailure('invalid collector identity, phase or request sequence');
            return;
        }
        custodySequence = request.requestId;
        const remaining =
            request.phase === 'stop'
                ? limits.closeMs - (performance.now() - origin - runtime.stopBegin.supervisorElapsedMs)
                : limits.closeMs;
        let resolveDrained;
        const drained = new Promise((resolve) => {
            resolveDrained = resolve;
        });
        const pending = {
            ...request,
            drained,
            resolveDrained,
            timer: timer(() => {
                custodyFailure('barrier deadline');
                settleCustody(pending, 'deadline');
            }, remaining),
        };
        custodyPending = pending;
        const forwarded = {
            ...request,
            workerStartTicks: current.startTicks,
            namespace,
            nodeSupervisorPID: process.pid,
        };
        custodyWrite.write(JSON.stringify(forwarded) + '\n', (error) => {
            if (error) custodyFailure(error.message);
        });
    }
    function consume(message) {
        if (message?.exampleCustodyRequest) {
            relayCustody(message.exampleCustodyRequest);
            return;
        }
        const raw = message?.exampleEvidenceEvent;
        if (!raw) return;
        const entry = event(raw.type, raw, 'observer');
        if (
            raw.workerPID !== child.pid ||
            raw.namespace !== namespace ||
            raw.sequence !== ++lastObserverSequence ||
            raw.cpuDummy !== !!cpuCase
        ) {
            requestAbort('observer identity/sequence mismatch');
            return;
        }
        if (
            [
                'observer-failure',
                'observer-incomplete',
                'abort-close-error',
                'late-browser-close-error',
                'runtime-start-error',
                'runtime-stop-error',
                'browser-process-error',
                'server-error',
            ].includes(raw.type)
        ) {
            requestAbort(
                `${raw.type}: ${raw.reason || raw.error || raw.fatal || 'incomplete lifecycle'}`,
                /deadline/.test(raw.reason || raw.error || ''),
            );
        }
        if (raw.type === 'runtime-start') {
            scanOwned();
            if (
                [...browserRows.values()].some((browser) =>
                    [...owned.values()].some((row) => row.firstObserved?.pgrp === browser.pid && sameProcess(row)),
                )
            )
                requestAbort('new runtime before prior browser group physically disappeared');
            if (runtimeRows.has(raw.runtimeId) || [...runtimeRows.values()].some((row) => !row.stopComplete))
                requestAbort('overlapping runtime start');
            runtimeRows.set(raw.runtimeId, {
                runtimeId: raw.runtimeId,
                exampleId: raw.exampleId,
                mode: raw.mode,
                kind: raw.kind,
                viewport: raw.viewport,
                start: entry,
                launch: null,
                ready: null,
                stopBegin: null,
                stopComplete: null,
            });
        }
        const runtime = runtimeRows.get(raw.runtimeId);
        if (raw.type === 'launch-begin') {
            if (!runtime || runtime.launch) {
                requestAbort('unknown/duplicate launch');
                return;
            }
            runtime.launch = entry;
            runtime.startupTimer = timer(
                () => requestAbort(`${raw.runtimeId} launch startup deadline`, true),
                limits.startupMs,
            );
        }
        if (raw.type === 'runtime-ready') {
            if (!runtime || runtime.ready || !(raw.launchElapsedMs <= limits.startupMs)) {
                requestAbort('unknown/duplicate/late ready receipt');
                return;
            }
            runtime.ready = entry;
            clearTimeout(runtime.startupTimer);
            if (!firstReady) {
                firstReady = true;
                clearTimeout(firstStartupTimer);
                if (entry.supervisorElapsedMs > limits.startupMs)
                    requestAbort('first worker startup deadline exceeded', true);
            }
        }
        if (raw.type === 'browser-spawn') {
            const row = { ...raw.row, spawn: entry, exit: null, close: null };
            if (
                browserRows.has(row.launchId) ||
                !row.startTicks ||
                row.namespace !== namespace ||
                row.command !== runtimeRows.get(row.runtimeId)?.launch?.executablePath
            ) {
                requestAbort('invalid exact executable spawn identity');
            }
            browserRows.set(row.launchId, row);
            remember(row, 'browser');
            scanOwned();
        }
        if (raw.type === 'browser-exit' || raw.type === 'browser-close') {
            const row = browserRows.get(raw.launchId);
            if (!row || row.pid !== raw.pid) {
                requestAbort('browser receipt without exact spawn');
                return;
            }
            const key = raw.type === 'browser-exit' ? 'exit' : 'close';
            if (row[key]) requestAbort('duplicate browser closure receipt');
            row[key] = entry;
            if (raw.code !== 0 || raw.signal !== null)
                requestAbort(`unclean browser ${key}: ${raw.code}/${raw.signal}`);
        }
        if (raw.type === 'server-listen-request') {
            if (serverRows.has(raw.serverId)) requestAbort('duplicate server listen request');
            serverRows.set(raw.serverId, {
                serverId: raw.serverId,
                runtimeId: raw.runtimeId,
                ownerPID: raw.ownerPID,
                physicalProcess: raw.physicalProcess,
                listenRequest: entry,
                listening: null,
                close: null,
            });
        }
        if (raw.type === 'server-listening' || raw.type === 'server-close') {
            const row = serverRows.get(raw.serverId);
            if (!row || raw.ownerPID !== child.pid || raw.physicalProcess !== 'collector-worker') {
                requestAbort('server receipt owner mismatch');
                return;
            }
            const key = raw.type === 'server-listening' ? 'listening' : 'close';
            if (row[key]) requestAbort('duplicate HTTP server receipt');
            row[key] = entry;
        }
        if (raw.type === 'stop-begin') {
            if (!runtime || runtime.stopBegin) {
                requestAbort('unknown/duplicate runtime stop');
                return;
            }
            runtime.stopBegin = entry;
            runtime.stopTimer = timer(() => requestAbort(`${raw.runtimeId} stop deadline`, true), limits.closeMs);
            // A forked browser child can change role before shutdown. Retain a second identity-bound
            // observation when stop-begin is received, possibly after shutdown has already begun.
            // It never accepts a signal or replaces the kernel custody result.
            for (const row of scanOwned()) {
                event('owned-process-diagnostic', {
                    pid: row.pid,
                    startTicks: row.startTicks,
                    namespace: row.namespace,
                    runtimeId: raw.runtimeId,
                    phase: 'stop-begin-received',
                    sourceEventId: entry.eventId,
                    processDiagnostic: snapshotOwnedProcess(row),
                });
            }
        }
        if (raw.type === 'stop-complete') {
            if (!runtime || runtime.stopComplete) {
                requestAbort('unknown/duplicate runtime stop completion');
                return;
            }
            runtime.stopComplete = entry;
            clearTimeout(runtime.stopTimer);
        }
    }
    async function finish(atDeadline = false) {
        if (finished) return;
        // Final cancellation must interrupt a pending drain even when another finish call owns finalization.
        if (atDeadline) {
            fail('final worker deadline reached');
            settleCustody(custodyPending, 'final-deadline');
        }
        if (finishing) return;
        finishing = true;
        if (custodyPending) {
            fail('Custody barrier remained pending at worker closure');
            if (
                ['custodian-delayed-stop-ack', 'custodian-stop-drain-cancel', 'custodian-stop-drain-deadline'].includes(
                    cpuCase,
                )
            ) {
                const marker = event('cpu-custody-drain-ready', {
                    cpuOnly: true,
                    nodePID: process.pid,
                    nodeStartTicks: stat(process.pid)?.startTicks,
                    namespace,
                    workerPID: child.pid,
                    workerStartTicks: receipt.worker.startTicks,
                    workerCloseEventId: receipt.worker.close?.eventId,
                    requestId: custodyPending.requestId,
                });
                const markerPath = path.join(path.dirname(out), 'cpu-drain-ready.json');
                if (fs.existsSync(markerPath)) throw Error('CPU drain marker already exists');
                fs.writeFileSync(markerPath + '.tmp', JSON.stringify(marker) + '\n', { flag: 'wx' });
                fs.renameSync(markerPath + '.tmp', markerPath);
            }
            // Keep the original barrier/absolute deadlines armed. Closing this pipe early can make
            // the custodian kill this Node process before its original failure receipt is durable.
            await custodyPending.drained;
        }
        receipt.noOwnedProcesses = scanOwned().length === 0;
        receipt.ownedProcesses = [...owned.values()].map(
            ({ pid, startTicks, namespace, role, firstObserved, disappearance }) => ({
                pid,
                startTicks,
                namespace,
                role,
                firstObserved,
                disappearance,
            }),
        );
        receipt.ownedGroups = [...groups.values()];
        if (!receipt.noOwnedProcesses) fail('owned processes remain at receipt finalization');
        if (atDeadline) fail('final worker deadline reached');
        receipt.browsers = [...browserRows.values()];
        receipt.servers = [...serverRows.values()];
        receipt.runtimes = [...runtimeRows.values()].map(({ startupTimer, stopTimer, ...row }) => row);
        if (!receipt.worker.exit || !receipt.worker.close) fail('worker exit/stdio close receipt missing');
        if (receipt.worker.exit?.signal || receipt.worker.close?.signal) fail('worker ended by signal');
        if (receipt.worker.exit && receipt.worker.exit.code !== 0)
            fail(`worker exited ${receipt.worker.exit.code}`, false);
        if (!cpuCase) {
            try {
                const value = JSON.parse(fs.readFileSync(out, 'utf8'));
                receipt.collector = {
                    path: out,
                    sha256: sha256(out),
                    partial: value.partial,
                    completed: value.completed,
                    scopePassed: value.scopePassed,
                    subset: value.subset,
                    runTotal: value.runTotal,
                    runPass: value.runPass,
                    ids: (value.results || []).map((row) => row.id),
                    statuses: (value.results || []).map((row) => ({ id: row.id, result: row.result })),
                };
                if (
                    value.partial !== true ||
                    value.completed !== false ||
                    value.scopePassed !== true ||
                    JSON.stringify(receipt.collector.ids) !== JSON.stringify([id])
                )
                    fail('collector exact partial result absent or failed', false);
            } catch (error) {
                fail(`collector report unreadable: ${error}`, false);
            }
        }
        await Promise.all(
            [stdout, stderr].map(
                (stream) =>
                    new Promise((resolve) => {
                        if (stream.closed || stream.destroyed) {
                            resolve();
                            return;
                        }
                        stream.once('close', resolve);
                        stream.once('error', resolve);
                        stream.end(resolve);
                    }),
            ),
        );
        receipt.endedAt = new Date().toISOString();
        const structural = validateCoreReceipt(receipt, {
            id,
            expectedModes,
            expectedViewports: options.expectedViewports,
            allowCpuDummy: !!cpuCase,
            requireSuccess: false,
        });
        for (const error of structural.errors) fail(error);
        const checked = validateCoreReceipt(receipt, {
            id,
            expectedModes,
            expectedViewports: options.expectedViewports,
            allowCpuDummy: !!cpuCase,
        });
        for (const error of checked.errors) fail(error, false);
        receipt.coreOk = checked.ok;
        receipt.pending = true;
        receipt.ok = false;
        receipt.endedAt = new Date().toISOString();
        if (receipt.noOwnedProcesses && receipt.worker.exit && receipt.worker.close) activeWorker = null;
        fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
        finished = true;
        custodyRead.destroy();
        custodyWrite.destroy();
        for (const value of timers) clearTimeout(value);
        clearInterval(ownershipPoll);
        process.removeListener('SIGINT', onInterrupt);
        process.removeListener('SIGTERM', onTerminate);
        resolveFinished(receipt);
    }
    const interrupted = (signal) => {
        requestAbort(`supervisor received ${signal}`);
        if (finishing) settleCustody(custodyPending, signal);
    };
    const onInterrupt = () => interrupted('SIGINT');
    const onTerminate = () => interrupted('SIGTERM');
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);
    const workerEnvironment = { ...process.env };
    delete workerEnvironment.EXAMPLE_EVIDENCE_CUSTODIAN_REQUEST_FD;
    delete workerEnvironment.EXAMPLE_EVIDENCE_CUSTODIAN_RESPONSE_FD;
    child = spawn(process.execPath, args, {
        cwd: repo,
        detached: true,
        env: {
            ...workerEnvironment,
            // esbuild's sync API otherwise owns an unref worker-thread service that can outlive this worker.
            // Its supported synchronous subprocess mode returns only after wait/stdio collection.
            ESBUILD_WORKER_THREADS:
                cpuCase === 'compiler-mode-missing' ? undefined : cpuCase === 'compiler-mode-invalid' ? '1' : '0',
            EXAMPLE_EVIDENCE_SUPERVISED: '1',
            EXAMPLE_EVIDENCE_STARTED_AT: new Date(startedEpoch).toISOString(),
            EXAMPLE_EVIDENCE_LIMITS: JSON.stringify(limits),
            EXAMPLE_EVIDENCE_CPU_CASE: cpuCase,
            EXAMPLE_EVIDENCE_ID: id,
            EXAMPLE_EVIDENCE_MODES: JSON.stringify(expectedModes),
            EXAMPLE_EVIDENCE_RESPONSE_DIR: responseDir || '',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    activeWorker = child;
    const initial = stat(child.pid);
    receipt.worker = {
        pid: child.pid,
        startTicks: initial?.startTicks || null,
        namespace,
        initial,
        detached: true,
        spawn: null,
        exit: null,
        close: null,
    };
    receipt.worker.spawn = event('worker-spawn', { pid: child.pid, startTicks: receipt.worker.startTicks, namespace });
    remember(receipt.worker, 'collector-worker');
    if (!initial) requestAbort('worker /proc identity unavailable');
    child.stdout.pipe(stdout, { end: false });
    child.stderr.pipe(stderr, { end: false });
    stdout.on('error', (error) => requestAbort(`stdout log error: ${error}`));
    stderr.on('error', (error) => requestAbort(`stderr log error: ${error}`));
    child.on('message', consume);
    child.once('error', (error) => requestAbort(`worker process error: ${error}`));
    child.once('exit', (code, signal) => {
        receipt.worker.exit = event('worker-exit', { code, signal });
    });
    child.once('close', (code, signal) => {
        receipt.worker.close = event('worker-stdio-close', { code, signal });
        const remaining = scanOwned();
        if (remaining.length) {
            reclaim('worker closed with owned processes remaining');
            timer(
                () => void finish(),
                Math.min(limits.closeMs, Math.max(1, limits.finalMs - (performance.now() - origin) - 1)),
            );
        } else void finish();
    });
    const firstStartupTimer = timer(
        () => requestAbort('first worker exec-to-ready deadline', true),
        limits.startupMs - (performance.now() - origin),
    );
    timer(() => requestAbort('external worker abort deadline', true), limits.abortMs - (performance.now() - origin));
    timer(() => reclaim('external worker force deadline'), limits.forceMs - (performance.now() - origin));
    timer(
        () => {
            receipt.timedOut = true;
            reclaim('external worker final deadline', true);
            void finish(true);
        },
        limits.finalMs - (performance.now() - origin),
    );
    const ownershipPoll = setInterval(scanOwned, 25);
    return finishedPromise;
}

function getCustodyRuntimeIdentity() {
    if (process.platform !== 'linux') throw Error('Evidence custody requires Linux subreaper support');
    const helper = path.join(__dirname, 'example-evidence-custodian.py');
    const result = spawnSync('python3', [helper, '--identity'], { encoding: 'utf8', timeout: 3000 });
    if (result.error || result.status !== 0)
        throw Error(`Python custody preflight failed: ${result.error || result.stderr}`);
    const value = JSON.parse(result.stdout);
    if (
        value.schemaVersion !== 'example-evidence-custody-runtime/1' ||
        value.platform !== 'linux' ||
        value.ipc !== 'inherited-anonymous-pipes/v1' ||
        value.helper.path !== fs.realpathSync(helper) ||
        value.helper.sha256 !== sha256(helper) ||
        value.python.sha256 !== sha256(value.python.executablePath)
    )
        throw Error('Custody interpreter/helper identity mismatch');
    return value;
}
const stableJson = (value) =>
    JSON.stringify(value, function (key, entry) {
        return entry && typeof entry === 'object' && !Array.isArray(entry)
            ? Object.fromEntries(
                  Object.keys(entry)
                      .sort()
                      .map((name) => [name, entry[name]]),
              )
            : entry;
    });
function validateCustodyReceipt(receipt) {
    const errors = [];
    const fail = (message) => errors.push(message);
    const custody = receipt.custody;
    if (receipt.pending !== false || !custody || custody.schemaVersion !== 'example-evidence-custody/1') {
        return { ok: false, errors: ['Final kernel custody receipt missing; pending Node receipts cannot pass'] };
    }
    const raw = custody.observation,
        wrapper = custody.wrapper;
    if (!raw || raw.schemaVersion !== 'example-evidence-custody-observation/1' || !wrapper) {
        return { ok: false, errors: ['Kernel custody observation missing'] };
    }
    const eventIs = (event, type) =>
        !!event &&
        event.type === type &&
        raw.events.some((entry) => entry.eventId === event.eventId && stableJson(entry) === stableJson(event));
    const clean = (event) => !!event && event.code === 0 && event.signal === null;
    if (
        !Number.isInteger(wrapper.pid) ||
        !/^\d+$/.test(wrapper.startTicks || '') ||
        wrapper.namespace !== receipt.worker?.namespace ||
        wrapper.pid !== raw.custodian?.pid ||
        wrapper.startTicks !== raw.custodian?.startTicks ||
        wrapper.namespace !== raw.custodian?.namespace ||
        !clean(wrapper.exit) ||
        !clean(wrapper.close) ||
        wrapper.exit.elapsedMs > wrapper.close.elapsedMs ||
        wrapper.close.elapsedMs >= receipt.limits.finalMs
    )
        fail('Custodian exact identity/exit/stdio close is not clean');
    if (
        wrapper.spawn?.pid !== wrapper.pid ||
        wrapper.spawn?.startTicks !== wrapper.startTicks ||
        wrapper.spawn?.namespace !== wrapper.namespace ||
        wrapper.spawn?.type !== 'custodian-spawn' ||
        wrapper.exit?.type !== 'custodian-exit' ||
        wrapper.close?.type !== 'custodian-stdio-close'
    )
        fail('Custodian physical process receipts missing');
    if (!Array.isArray(raw.events) || !Array.isArray(raw.errors) || raw.errors.length || raw.forced !== false)
        fail('Kernel custody retained failures');
    if (
        custody.runtimeIdentity?.ipc !== 'inherited-anonymous-pipes/v1' ||
        stableJson(raw.runtimeIdentity) !== stableJson(custody.runtimeIdentity) ||
        (!receipt.cpuDummy && stableJson(custody.runtimeIdentity) !== stableJson(receipt.runtimeIdentity?.custody))
    )
        fail('Frozen custody runtime identity differs');
    const startEpoch = Date.parse(receipt.startedAt),
        endEpoch = Date.parse(receipt.endedAt);
    const validUtc = (utc) =>
        Number.isFinite(Date.parse(utc)) && Date.parse(utc) >= startEpoch && Date.parse(utc) <= endEpoch;
    if (
        ![raw.startedAt, raw.endedAt, wrapper.spawn?.utc, wrapper.exit?.utc, wrapper.close?.utc].every(validUtc) ||
        !(
            Date.parse(raw.startedAt) <= Date.parse(raw.endedAt) &&
            Date.parse(raw.endedAt) <= Date.parse(wrapper.exit?.utc) &&
            Date.parse(wrapper.spawn?.utc) <= Date.parse(raw.startedAt) &&
            Date.parse(wrapper.exit?.utc) <= Date.parse(wrapper.close?.utc)
        )
    )
        fail('Custody wall-clock boundaries invalid');
    for (const value of [wrapper.spawn, wrapper.exit, wrapper.close])
        if (
            !Number.isFinite(value?.elapsedMs) ||
            value.elapsedMs < 0 ||
            Math.abs(Date.parse(value.utc) - startEpoch - value.elapsedMs) > 250
        )
            fail('Custodian process timing invalid');
    if (!(wrapper.spawn?.elapsedMs <= wrapper.exit?.elapsedMs && wrapper.exit?.elapsedMs <= wrapper.close?.elapsedMs))
        fail('Custodian process event order invalid');
    let previous = -1;
    for (const [index, event] of raw.events.entries()) {
        if (
            event.eventId !== index + 1 ||
            !Number.isFinite(event.elapsedMs) ||
            event.elapsedMs < previous ||
            event.elapsedMs > wrapper.close.elapsedMs ||
            !validUtc(event.utc) ||
            Math.abs(Date.parse(event.utc) - Date.parse(receipt.startedAt) - event.elapsedMs) > 250
        )
            fail('Custody event time/order invalid');
        previous = event.elapsedMs;
        if (['custody-error', 'owned-signal'].includes(event.type)) fail(`Custody failure event: ${event.type}`);
    }
    if (
        !eventIs(raw.parentDeath, 'parent-death-signal') ||
        raw.parentDeath.observed !== 15 ||
        raw.parentDeath.parentPID !== wrapper.initial?.ppid
    )
        fail('Custodian parent-death protocol missing');
    if (
        !eventIs(raw.initial, 'kernel-initial-echild') ||
        raw.initial.result !== 'ECHILD' ||
        !eventIs(raw.enabled, 'kernel-subreaper-enabled') ||
        raw.enabled.observed !== 1 ||
        !eventIs(raw.final, 'kernel-final-echild') ||
        raw.final.result !== 'ECHILD' ||
        !eventIs(raw.restored, 'kernel-subreaper-restored') ||
        raw.restored.observed !== raw.initial.priorSubreaper ||
        raw.restored.expected !== raw.initial.priorSubreaper ||
        raw.final.elapsedMs > raw.restored.elapsedMs
    )
        fail('Kernel ECHILD/subreaper enable/restore receipts missing');
    const node = raw.innerSupervisor;
    if (
        !node ||
        !eventIs(node.spawn, 'inner-supervisor-spawn') ||
        !eventIs(node.exit, 'inner-supervisor-waitpid') ||
        !clean(node.exit) ||
        !eventIs(node.stdoutEOF, 'inner-supervisor-stdout-eof') ||
        !eventIs(node.stderrEOF, 'inner-supervisor-stderr-eof') ||
        node.namespace !== wrapper.namespace ||
        node.ppid !== wrapper.pid ||
        receipt.worker?.initial?.ppid !== node.pid ||
        node.startTicks !== node.spawn?.identity?.startTicks ||
        node.pid !== node.spawn?.identity?.pid ||
        raw.enabled.elapsedMs > node.spawn.elapsedMs ||
        node.exit.elapsedMs > raw.final?.elapsedMs ||
        node.stdoutEOF.elapsedMs > raw.final?.elapsedMs ||
        node.stderrEOF.elapsedMs > raw.final?.elapsedMs
    )
        fail('Inner Node supervisor physical closure missing');
    const ordered = [raw.parentDeath, raw.initial, raw.enabled, node?.spawn, node?.exit, raw.final, raw.restored];
    if (
        ordered.some((entry, index) => !entry || (index && entry.eventId <= ordered[index - 1].eventId)) ||
        raw.restored.elapsedMs > wrapper.exit.elapsedMs ||
        Date.parse(raw.restored.utc) > Date.parse(raw.endedAt)
    )
        fail('Kernel custody lifecycle order invalid');
    for (const type of [
        'parent-death-signal',
        'kernel-initial-echild',
        'kernel-subreaper-enabled',
        'inner-supervisor-spawn',
        'inner-supervisor-waitpid',
        'inner-supervisor-stdout-eof',
        'inner-supervisor-stderr-eof',
        'kernel-final-echild',
        'kernel-subreaper-restored',
    ]) {
        if (raw.events.filter((event) => event.type === type).length !== 1)
            fail(`Kernel custody ${type} cardinality invalid`);
    }
    const adopted = Array.isArray(raw.adopted) ? raw.adopted : [];
    if (
        raw.events.filter((event) => event.type === 'adopted-child').length !== adopted.length ||
        new Set(adopted.map((row) => `${row.pid}:${row.startTicks}`)).size !== adopted.length
    )
        fail('Adopted identities are not one-to-one');
    for (const type of ['adopted-child', 'adopted-waitpid', 'adopted-absent']) {
        if (raw.events.filter((event) => event.type === type).length !== adopted.length)
            fail('Adopted event cardinality invalid');
    }
    for (const row of adopted) {
        if (
            !eventIs(row.observed, 'adopted-child') ||
            !eventIs(row.reap, 'adopted-waitpid') ||
            !eventIs(row.absent, 'adopted-absent') ||
            row.ppid !== wrapper.pid ||
            row.namespace !== wrapper.namespace ||
            row.pid === node?.pid ||
            row.observed.identity.pid !== row.pid ||
            row.observed.identity.startTicks !== row.startTicks ||
            row.reap.pid !== row.pid ||
            row.reap.startTicks !== row.startTicks ||
            row.reap.namespace !== row.namespace ||
            !clean(row.reap) ||
            row.reap.rawStatus !== 0 ||
            row.absent.pid !== row.pid ||
            row.absent.startTicks !== row.startTicks ||
            row.absent.namespace !== row.namespace ||
            row.observed.identity.namespace !== row.namespace ||
            row.observed.identity.ppid !== wrapper.pid ||
            !(
                row.observed.elapsedMs <= row.reap.elapsedMs &&
                row.reap.elapsedMs <= row.absent.elapsedMs &&
                row.absent.elapsedMs <= raw.final?.elapsedMs
            )
        )
            fail('Adopted child lacks exact waitpid/absence closure');
    }
    const acknowledgements = receipt.events.filter((event) => event.type === 'custody-barrier-ack');
    if (
        !Array.isArray(raw.barriers) ||
        raw.barriers.length !== acknowledgements.length ||
        acknowledgements.length !== receipt.runtimes.length * 2
    )
        fail('Per-runtime custody barriers missing');
    if (stableJson(raw.events.filter((event) => event.type === 'runtime-custody-barrier')) !== stableJson(raw.barriers))
        fail('Custody barriers differ from event log');
    for (const [index, ack] of acknowledgements.entries()) {
        const proof = raw.barriers.find((entry) => entry.eventId === ack.custodyEventId);
        const runtime = receipt.runtimes.find((row) => row.runtimeId === ack.runtimeId);
        const expectedPhase = index % 2 ? 'stop' : 'start';
        const expectedRuntime = receipt.runtimes[Math.floor(index / 2)];
        const closures = [
            ...receipt.browsers
                .filter((row) => row.runtimeId === ack.runtimeId)
                .flatMap((row) => [row.exit, row.close]),
            ...receipt.servers.filter((row) => row.runtimeId === ack.runtimeId).map((row) => row.close),
        ];
        if (
            ack.phase !== expectedPhase ||
            ack.runtimeId !== expectedRuntime?.runtimeId ||
            (ack.phase === 'stop' &&
                closures.some((event) => !event || event.supervisorElapsedMs > ack.supervisorElapsedMs))
        )
            fail('Custody barrier phase/physical closure order invalid');
        if (
            !proof ||
            !eventIs(proof, 'runtime-custody-barrier') ||
            proof.ok !== true ||
            proof.observedSubreaper !== 1 ||
            proof.transport !== 'inherited-anonymous-pipes/v1' ||
            proof.requestId !== index + 1 ||
            proof.requestId !== ack.requestId ||
            proof.runtimeId !== ack.runtimeId ||
            proof.phase !== ack.phase ||
            ack.custodianPID !== wrapper.pid ||
            proof.workerPID !== receipt.worker.pid ||
            proof.workerStartTicks !== receipt.worker.startTicks ||
            stableJson(proof.directChildren) !== stableJson([node?.pid]) ||
            proof.elapsedMs > ack.supervisorElapsedMs + 50 ||
            (ack.phase === 'start'
                ? !(ack.supervisorElapsedMs <= runtime?.start.supervisorElapsedMs)
                : !(
                      runtime?.stopBegin.supervisorElapsedMs <= ack.supervisorElapsedMs &&
                      ack.supervisorElapsedMs <= runtime?.stopComplete.supervisorElapsedMs
                  ))
        )
            fail('Custody barrier request/ACK correlation invalid');
    }
    for (const name of ['raw', 'nodeReceipt', 'journal', 'stdout', 'stderr']) {
        const ref = custody.artifacts?.[name];
        if (
            !ref ||
            typeof ref.path !== 'string' ||
            !Number.isInteger(ref.bytes) ||
            ref.bytes < 0 ||
            !/^[a-f0-9]{64}$/.test(ref.sha256 || '')
        )
            fail(`Custody ${name} artifact reference missing`);
    }
    return { ok: !errors.length, errors: [...new Set(errors)] };
}
function validateAttemptReceipt(receipt, options = {}) {
    const core = validateCoreReceipt(receipt, options);
    let custody;
    try {
        custody = validateCustodyReceipt(receipt);
    } catch (error) {
        custody = { ok: false, errors: [`Malformed custody receipt: ${error.message}`] };
    }
    return { ok: core.ok && custody.ok, errors: [...core.errors, ...custody.errors] };
}
function validateCustodyArtifacts(receipt, artifacts) {
    try {
        const errors = [];
        if (stableJson(artifacts.raw) !== stableJson(receipt.custody.observation))
            errors.push('Original Python observation differs');
        const inner = artifacts.nodeReceipt;
        if (inner.pending !== true || inner.ok !== false || typeof inner.coreOk !== 'boolean')
            errors.push('Original Node receipt was not pending');
        const keys = [
            'schemaVersion',
            'attemptId',
            'id',
            'cpuDummy',
            'cpuCase',
            'expectedModes',
            'runtimeIdentity',
            'executableSha256',
            'startedAt',
            'supervisorStartedAt',
            'elapsedBeforeSpawnMs',
            'limits',
            'command',
            'worker',
            'events',
            'browsers',
            'servers',
            'runtimes',
            'ownedProcesses',
            'ownedGroups',
            'collector',
        ];
        for (const key of keys)
            if (stableJson(inner[key]) !== stableJson(receipt[key])) errors.push(`Original Node ${key} differs`);
        for (const key of Object.keys(inner.output))
            if (key !== 'receipt' && inner.output[key] !== receipt.output[key])
                errors.push(`Original Node output ${key} differs`);
        for (const error of inner.errors)
            if (!receipt.errors.includes(error)) errors.push('Original Node error discarded');
        for (const error of inner.lifecycleErrors)
            if (!receipt.lifecycleErrors.includes(error)) errors.push('Original Node lifecycle error discarded');
        if (
            (inner.forced && !receipt.forced) ||
            (inner.timedOut && !receipt.timedOut) ||
            (!inner.noOwnedProcesses && receipt.noOwnedProcesses)
        )
            errors.push('Original Node failure was cleared');
        for (const name of ['journal', 'stdout', 'stderr']) {
            const bytes = Buffer.isBuffer(artifacts[name]) ? artifacts[name] : Buffer.from(artifacts[name]);
            const reference = receipt.custody.artifacts[name];
            if (
                bytes.length !== reference.bytes ||
                crypto.createHash('sha256').update(bytes).digest('hex') !== reference.sha256
            )
                errors.push(`Original custody ${name} differs`);
        }
        const journal = Buffer.from(artifacts.journal)
            .toString()
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        if (stableJson(journal) !== stableJson(artifacts.raw.events))
            errors.push('Original custody journal differs from raw events');
        return { ok: !errors.length, errors };
    } catch (error) {
        return { ok: false, errors: [`Malformed custody artifact: ${error.message}`] };
    }
}
async function superviseAttempt(options) {
    if (activeWorker) throw Error('Previous attempt worker has not physically closed');
    const startedEpoch =
        options.startedAt === undefined
            ? Date.now()
            : typeof options.startedAt === 'number'
              ? options.startedAt
              : Date.parse(options.startedAt);
    const limits = limitsOf(options.limits);
    if (!Number.isFinite(startedEpoch) || startedEpoch > Date.now() || Date.now() - startedEpoch >= limits.startupMs)
        throw Error('Original first-exec startup budget exhausted before worker spawn');
    if (!options.cpuCase && options.executeAuthorized !== true)
        throw Error('Real browser execution requires explicit owner authorization');
    if (!options.out || !options.artifactDir) throw Error('Explicit external out and artifactDir required');
    const repo = fs.realpathSync(options.repo || path.join(__dirname, '../..'));
    const out = path.resolve(options.out),
        finalPath = path.resolve(options.receiptPath || path.join(path.dirname(out), 'attempt-receipt.json'));
    const directory = path.dirname(out);
    if (![out, finalPath, path.resolve(options.artifactDir)].every((file) => outsideRepo(file, repo)))
        throw Error('Attempt outputs must be external');
    let ancestor = directory;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    if (!outsideRepo(fs.realpathSync(ancestor), repo))
        throw Error('Attempt output ancestor resolves inside repository');
    const paths = {
        raw: path.join(directory, 'custodian-observations.json'),
        nodeReceipt: path.join(directory, 'pending-node-receipt.json'),
        journal: path.join(directory, 'custodian.events.jsonl'),
        stdout: path.join(directory, 'custodian.stdout.log'),
        stderr: path.join(directory, 'custodian.stderr.log'),
    };
    const configPath = path.join(directory, 'custodian-request.json');
    for (const file of [...Object.values(paths), configPath, finalPath, out, path.resolve(options.artifactDir)])
        if (fs.existsSync(file)) throw Error(`Immutable attempt target already exists: ${file}`);
    const runtimeIdentity = getCustodyRuntimeIdentity();
    if (!options.cpuCase && stableJson(runtimeIdentity) !== stableJson(options.runtimeIdentity?.custody))
        throw Error('Frozen custody identity changed before spawn');
    if (Date.now() - startedEpoch >= limits.startupMs)
        throw Error('Original first-exec startup budget exhausted before worker spawn');
    fs.mkdirSync(directory, { recursive: true });
    const config = {
        ...options,
        repo,
        limits,
        startedAt: new Date(startedEpoch).toISOString(),
        receiptPath: paths.nodeReceipt,
        custodian: { ...paths, observations: paths.raw, token: crypto.randomUUID(), outerPID: process.pid },
    };
    fs.writeFileSync(configPath, JSON.stringify(config) + '\n', { flag: 'wx' });
    const origin = performance.now() - (Date.now() - startedEpoch);
    const elapsed = () => performance.now() - origin;
    const wrapper = {
        pid: null,
        startTicks: null,
        namespace: namespaceOf(),
        initial: null,
        spawn: null,
        exit: null,
        close: null,
    };
    const failures = [];
    let forced = false,
        timedOut = false;
    const logs = [
        fs.createWriteStream(paths.stdout, { flags: 'wx' }),
        fs.createWriteStream(paths.stderr, { flags: 'wx' }),
    ];
    const child = spawn(
        runtimeIdentity.python.executablePath,
        [runtimeIdentity.helper.path, configPath, process.execPath, __filename],
        { cwd: repo, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    activeWorker = child;
    wrapper.pid = child.pid;
    wrapper.initial = stat(child.pid);
    wrapper.startTicks = wrapper.initial?.startTicks || null;
    const event = (type, values = {}) => ({ type, elapsedMs: elapsed(), utc: new Date().toISOString(), ...values });
    wrapper.spawn = event('custodian-spawn', {
        pid: child.pid,
        startTicks: wrapper.startTicks,
        namespace: wrapper.namespace,
    });
    child.stdout.pipe(logs[0], { end: false });
    child.stderr.pipe(logs[1], { end: false });
    const signalCustodian = (signal, reason) => {
        failures.push(reason);
        forced = true;
        if (sameProcess(wrapper)) process.kill(child.pid, signal);
    };
    const onInterrupt = () => signalCustodian('SIGTERM', 'Outer supervisor interrupted');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onInterrupt);
    const forceTimer = setTimeout(
        () => {
            timedOut = true;
            signalCustodian('SIGTERM', 'Outer custodian force deadline');
        },
        Math.max(1, limits.forceMs - elapsed()),
    );
    const finalTimer = setTimeout(
        () => {
            timedOut = true;
            signalCustodian('SIGKILL', 'Outer custodian final deadline');
        },
        Math.max(1, limits.finalMs - elapsed()),
    );
    await new Promise((resolve) => {
        child.once('error', (error) => failures.push(`Custodian spawn failed: ${error}`));
        child.once('exit', (code, signal) => {
            wrapper.exit = event('custodian-exit', { code, signal });
        });
        child.once('close', (code, signal) => {
            wrapper.close = event('custodian-stdio-close', { code, signal });
            resolve();
        });
    });
    clearTimeout(forceTimer);
    clearTimeout(finalTimer);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    await Promise.all(
        logs.map(
            (stream) =>
                new Promise((resolve) => {
                    stream.once('error', resolve);
                    stream.end(resolve);
                }),
        ),
    );
    let inner, raw;
    try {
        inner = JSON.parse(fs.readFileSync(paths.nodeReceipt, 'utf8'));
    } catch (error) {
        failures.push(`Pending Node receipt missing: ${error.message}`);
    }
    try {
        raw = JSON.parse(fs.readFileSync(paths.raw, 'utf8'));
    } catch (error) {
        failures.push(`Python custody observation missing: ${error.message}`);
    }
    const artifacts = {};
    for (const [name, file] of Object.entries(paths))
        if (fs.existsSync(file)) artifacts[name] = { path: file, bytes: fs.statSync(file).size, sha256: sha256(file) };
    const receipt = inner || {
        schemaVersion: SCHEMA_VERSION,
        attemptId: options.attemptId || crypto.randomUUID(),
        id: options.id,
        cpuDummy: !!options.cpuCase,
        cpuCase: options.cpuCase || null,
        startedAt: config.startedAt,
        limits,
        expectedModes: options.expectedModes || ['primary'],
        command: null,
        output: { report: out, artifactDir: path.resolve(options.artifactDir) },
        worker: null,
        events: [],
        browsers: [],
        servers: [],
        runtimes: [],
        ownedProcesses: [],
        ownedGroups: [],
        errors: [],
        lifecycleErrors: [],
        forced: false,
        timedOut: false,
        noOwnedProcesses: false,
    };
    receipt.pending = false;
    receipt.output.receipt = finalPath;
    receipt.custody = {
        schemaVersion: 'example-evidence-custody/1',
        runtimeIdentity,
        wrapper,
        artifacts,
        observation: raw || null,
    };
    receipt.forced ||= forced || raw?.forced === true;
    receipt.timedOut ||= timedOut;
    receipt.noOwnedProcesses =
        receipt.noOwnedProcesses &&
        !!raw?.final &&
        raw.final.result === 'ECHILD' &&
        !!wrapper.close &&
        !sameProcess(wrapper);
    receipt.errors.push(...failures, ...(raw?.errors || []));
    receipt.lifecycleErrors.push(...failures, ...(raw?.errors || []));
    if (wrapper.exit?.code !== 0 || wrapper.exit?.signal || wrapper.close?.code !== 0 || wrapper.close?.signal) {
        receipt.errors.push('Custodian did not exit/close cleanly');
        receipt.lifecycleErrors.push('Custodian did not exit/close cleanly');
    }
    receipt.endedAt = new Date().toISOString();
    const structural = validateAttemptReceipt(receipt, {
        id: options.id,
        expectedModes: options.expectedModes,
        expectedViewports: options.expectedViewports,
        allowCpuDummy: !!options.cpuCase,
        requireSuccess: false,
    });
    receipt.lifecycleErrors.push(...structural.errors.filter((error) => !receipt.lifecycleErrors.includes(error)));
    receipt.errors.push(...structural.errors.filter((error) => !receipt.errors.includes(error)));
    const checked = validateAttemptReceipt(receipt, {
        id: options.id,
        expectedModes: options.expectedModes,
        expectedViewports: options.expectedViewports,
        allowCpuDummy: !!options.cpuCase,
    });
    receipt.ok = checked.ok;
    receipt.errors.push(...checked.errors.filter((error) => !receipt.errors.includes(error)));
    fs.writeFileSync(finalPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    if (raw?.final?.result === 'ECHILD' && wrapper.exit && wrapper.close && !sameProcess(wrapper)) activeWorker = null;
    return receipt;
}

async function main() {
    const startedAt = Date.now();
    const innerConfig = process.argv.find((value) => value.startsWith('--custodian-inner='));
    if (innerConfig) {
        const receipt = await superviseAttemptInner(JSON.parse(fs.readFileSync(innerConfig.slice(18), 'utf8')));
        console.log(JSON.stringify({ pendingNodeReceipt: receipt.output.receipt, coreOk: receipt.coreOk }));
        return;
    }
    const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
    const receipt = await superviseAttempt({
        startedAt,
        repo: arg('repo'),
        responseDir: arg('response-dir'),
        id: arg('id'),
        out: arg('out'),
        artifactDir: arg('artifact-dir'),
        receiptPath: arg('receipt'),
        attemptId: arg('attempt-id'),
        cpuCase: arg('cpu'),
        executeAuthorized: process.argv.includes('--execute-authorized'),
        expectedModes: arg('modes')?.split(','),
        limits: arg('limits') ? JSON.parse(arg('limits')) : undefined,
        runtimeIdentity: arg('runtime-identity')
            ? JSON.parse(fs.readFileSync(arg('runtime-identity'), 'utf8'))
            : undefined,
    });
    console.log(
        JSON.stringify({
            receipt: receipt.output.receipt,
            id: receipt.id,
            ok: receipt.ok,
            cpuDummy: receipt.cpuDummy,
            forced: receipt.forced,
            timedOut: receipt.timedOut,
            noOwnedProcesses: receipt.noOwnedProcesses,
        }),
    );
    process.exitCode = receipt.ok ? 0 : 1;
}
if (require.main === module)
    main().catch((error) => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
module.exports = {
    SCHEMA_VERSION,
    DEFAULT_LIMITS,
    CPU_CASES,
    limitsOf,
    validateAttemptReceipt,
    superviseAttempt,
    getCustodyRuntimeIdentity,
    validateCustodyArtifacts,
};
