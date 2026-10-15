'use strict';
/** Preload hook for example-evidence-supervisor.cjs. Observes real processes, never supplies validator results. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const cp = require('child_process');
const Module = require('module');
const { performance } = require('perf_hooks');

if (process.env.EXAMPLE_EVIDENCE_SUPERVISED !== '1') throw Error('Use example-evidence-supervisor.cjs');
const limits = JSON.parse(process.env.EXAMPLE_EVIDENCE_LIMITS);
const cpuCase = process.env.EXAMPLE_EVIDENCE_CPU_CASE || '';
const diagnosticProfile = process.env.EXAMPLE_EVIDENCE_DIAGNOSTIC_PROFILE
    ? JSON.parse(process.env.EXAMPLE_EVIDENCE_DIAGNOSTIC_PROFILE)
    : undefined;
const {
    limitsOf,
    validateTargetDiagnosticProfile,
    TARGET_DIAGNOSTIC_LIMITS,
} = require('./example-evidence-supervisor.cjs');
if (diagnosticProfile !== undefined) {
    if (
        !validateTargetDiagnosticProfile(diagnosticProfile) ||
        !(
            process.env.EXAMPLE_EVIDENCE_ID === 'collector-dodge' ||
            (cpuCase && process.env.EXAMPLE_EVIDENCE_ID === 'cpu-example')
        ) ||
        Object.keys(limits).length !== Object.keys(TARGET_DIAGNOSTIC_LIMITS).length ||
        !Object.entries(TARGET_DIAGNOSTIC_LIMITS).every(([key, value]) => limits[key] === value)
    )
        throw Error('Observer target diagnostic profile mismatch');
} else limitsOf(limits);
const origin = performance.now();
const namespace = fs.readlinkSync('/proc/self/ns/pid');
const runtimes = new Map();
let activeRuntime = null;
let sequence = 0;
let fatal = null;
let abortPromise;
let completionSent = false;
let custodyRequestId = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stat(pid) {
    try {
        const value = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const fields = value.slice(value.lastIndexOf(')') + 2).split(' ');
        return { pid, state: fields[0], ppid: +fields[1], pgrp: +fields[2], startTicks: fields[19] };
    } catch {
        return null;
    }
}
function emit(type, data = {}) {
    // Negative controls suppress receipts only; actual children and HTTP servers still close normally.
    if (cpuCase === 'missing-browser-close' && type === 'browser-close') return;
    if (cpuCase === 'missing-server-close' && type === 'server-close') return;
    const event = {
        ...data,
        type,
        sequence: ++sequence,
        workerPID: process.pid,
        namespace,
        elapsedMs: performance.now() - origin,
        utc: new Date().toISOString(),
        cpuDummy: !!cpuCase,
    };
    if (process.connected) process.send({ exampleEvidenceEvent: event });
}
async function bounded(promise, ms, reason) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(Error(reason)), Math.max(1, ms));
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
async function custodyBarrier(state, phase, timeoutMs) {
    const token = process.env.EXAMPLE_EVIDENCE_CUSTODIAN_TOKEN;
    const custodianPID = Number(process.env.EXAMPLE_EVIDENCE_CUSTODIAN_PID);
    if (!process.connected || !token || !Number.isInteger(custodianPID) || timeoutMs <= 0)
        throw Error('Kernel custody barrier unavailable');
    const requestId = ++custodyRequestId;
    const request = { token, requestId, runtimeId: state.id, phase, workerPID: process.pid };
    const response = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            process.removeListener('message', onMessage);
            if (error) reject(error);
            else resolve(value);
        };
        const timer = setTimeout(() => finish(Error('Kernel custody barrier deadline')), timeoutMs);
        const onMessage = (message) => {
            const value = message?.exampleCustodyResponse;
            if (!value) return;
            if (
                value.token !== token ||
                value.requestId !== requestId ||
                value.runtimeId !== state.id ||
                value.phase !== phase ||
                value.custodianPID !== custodianPID ||
                value.ok !== true ||
                !Number.isInteger(value.eventId)
            ) {
                finish(Error('Kernel custody barrier rejected or mismatched'));
            } else finish(null, value);
        };
        process.on('message', onMessage);
        process.send({ exampleCustodyRequest: request }, (error) => {
            if (error) finish(error);
        });
    });
    emit('custody-barrier-ack', {
        runtimeId: state.id,
        phase,
        requestId,
        custodianPID,
        custodyEventId: response.eventId,
    });
}
function assertActive() {
    if (fatal) throw Error(fatal);
}
function processClosed(row) {
    const current = stat(row.pid);
    if (!row.exit || !row.close || (current && current.startTicks === row.startTicks)) return false;
    if (row.detached && row.initial?.pgrp === row.pid) {
        // A closed browser leader may leave renderer/utility descendants in its still-live process group.
        // Do not admit another runtime until the entire proven browser group has disappeared.
        const remaining = fs
            .readdirSync('/proc')
            .filter((name) => /^\d+$/.test(name))
            .map((name) => stat(+name))
            .filter(
                (member) => member && member.pgrp === row.pid && BigInt(member.startTicks) >= BigInt(row.startTicks),
            );
        if (remaining.length) return false;
    }
    return true;
}
function physicalClosure(state) {
    return (
        state.processes.length === 1 &&
        state.servers.length === 1 &&
        state.processes.every(processClosed) &&
        state.servers.every((row) => row.listening && row.close)
    );
}
function callRawStop(state) {
    if (!state.rawStopPromise) state.rawStopPromise = Promise.resolve().then(() => state.rawStop.call(state.instance));
    return state.rawStopPromise;
}
function abort(reason) {
    if (abortPromise) return abortPromise;
    fatal = String(reason);
    emit('observer-failure', { reason: fatal });
    clearTimeout(innerTimer);
    for (const state of runtimes.values()) clearTimeout(state.startupTimer);
    abortPromise = (async () => {
        for (const state of runtimes.values()) {
            try {
                await bounded(callRawStop(state), limits.closeMs, 'abort runtime.stop deadline');
            } catch (error) {
                emit('abort-close-error', { runtimeId: state.id, error: String(error) });
            }
        }
        const until = performance.now() + limits.closeMs;
        while ([...runtimes.values()].some((state) => !physicalClosure(state)) && performance.now() < until) {
            await pause(10);
        }
        emit('observer-aborted', {
            reason: fatal,
            allPhysicalReceipts: [...runtimes.values()].every(physicalClosure),
        });
        // Exit is a genuine process exit, not a forged receipt. Parent still requires browser and server receipts.
        process.exitCode = 124;
        if (process.connected) process.disconnect();
        process.exit(124);
    })();
    return abortPromise;
}

const nativeSpawn = cp.spawn;
cp.spawn = function observedSpawn(command, args, options) {
    const state = activeRuntime;
    const launch = state?.launch;
    const owned = launch && path.resolve(String(command)) === launch.executablePath;
    if (owned && state.processes.length) {
        void abort('multiple executable spawns for one runtime');
        throw Error(fatal);
    }
    const child = nativeSpawn.apply(this, arguments);
    if (!owned) return child;
    const initial = stat(child.pid);
    const row = {
        pid: child.pid,
        startTicks: initial?.startTicks || null,
        namespace,
        initial,
        runtimeId: state.id,
        launchId: launch.id,
        command: String(command),
        detached: !!options?.detached,
        exit: null,
        close: null,
    };
    state.processes.push(row);
    emit('browser-spawn', { row });
    child.once('error', (error) => {
        emit('browser-process-error', { launchId: launch.id, pid: child.pid, error: String(error) });
        void abort(`browser process error: ${error}`);
    });
    child.once('exit', (code, signal) => {
        row.exit = { code, signal };
        emit('browser-exit', { runtimeId: state.id, launchId: launch.id, pid: child.pid, code, signal });
        if (code !== 0 || signal) void abort(`browser exit is not clean: ${code}/${signal}`);
    });
    child.once('close', (code, signal) => {
        row.close = { code, signal };
        emit('browser-close', { runtimeId: state.id, launchId: launch.id, pid: child.pid, code, signal });
    });
    return child;
};
const nativeCreateServer = http.createServer;
http.createServer = function observedServer() {
    const server = nativeCreateServer.apply(this, arguments);
    const state = activeRuntime;
    if (!state) return server;
    const row = {
        serverId: `server-${state.id}-${state.servers.length + 1}`,
        runtimeId: state.id,
        ownerPID: process.pid,
        physicalProcess: 'collector-worker',
        listening: null,
        close: null,
    };
    state.servers.push(row);
    const nativeListen = server.listen;
    server.listen = function observedListen() {
        emit('server-listen-request', row);
        return nativeListen.apply(this, arguments);
    };
    server.once('listening', () => {
        row.listening = server.address();
        emit('server-listening', { ...row, address: row.listening });
    });
    server.once('close', () => {
        row.close = true;
        emit('server-close', {
            serverId: row.serverId,
            runtimeId: state.id,
            ownerPID: process.pid,
            physicalProcess: row.physicalProcess,
        });
    });
    server.on('error', (error) => {
        emit('server-error', { serverId: row.serverId, runtimeId: state.id, error: String(error) });
        void abort(`HTTP server error: ${error}`);
    });
    return server;
};

function instrumentLauncher(launcher) {
    if (launcher.__exampleEvidenceWrapped) return;
    const original = launcher.launch;
    launcher.launch = async function observedLaunch(options = {}) {
        assertActive();
        const state = activeRuntime;
        if (!state || state.launch || [...runtimes.values()].some((row) => row !== state && !row.closed)) {
            void abort('launch before previous runtime closure');
            throw Error(fatal);
        }
        state.launch = {
            id: `launch-${state.id}`,
            executablePath: path.resolve(options.executablePath || launcher.executablePath()),
            started: performance.now(),
        };
        emit('launch-begin', {
            runtimeId: state.id,
            launchId: state.launch.id,
            executablePath: state.launch.executablePath,
            launchArgs: options.args || [],
            startupDeadlineMs: limits.startupMs,
        });
        state.startupTimer = setTimeout(() => void abort(`${state.id} launch-to-ready deadline`), limits.startupMs);
        const browser = await original.call(this, options);
        state.observedBrowser = browser;
        if (fatal) {
            try {
                await bounded(browser.close(), limits.closeMs, 'late browser close deadline');
            } catch (error) {
                emit('late-browser-close-error', { runtimeId: state.id, error: String(error) });
            }
            throw Error(fatal);
        }
        return browser;
    };
    Object.defineProperty(launcher, '__exampleEvidenceWrapped', { value: true });
}
function instrumentRuntime(Runtime) {
    if (Runtime.prototype.__exampleEvidenceWrapped) return;
    const originalStart = Runtime.prototype.start;
    const originalStop = Runtime.prototype.stop;
    Runtime.prototype.start = async function observedStart(workspace) {
        assertActive();
        if ([...runtimes.values()].some((row) => !row.closed)) {
            void abort('runtime start before prior physical closure');
            throw Error(fatal);
        }
        const spec = cpuCase
            ? { id: process.env.EXAMPLE_EVIDENCE_ID, bench: { mode: cpuCase === 'ui-shell' ? 'ui-shell' : 'app' } }
            : JSON.parse(fs.readFileSync(path.join(workspace.paths.workspace, 'example.json'), 'utf8'));
        const ordinal = runtimes.size;
        const state = {
            id: `runtime-${ordinal + 1}`,
            exampleId: spec.id,
            mode: workspace.evidenceMode || (ordinal ? `variant:${ordinal}` : 'primary'),
            kind: spec.bench?.mode === 'ui-shell' ? 'ui-shell' : 'engine',
            viewport: this.viewport,
            instance: this,
            rawStop: originalStop,
            processes: [],
            servers: [],
            launch: null,
            closed: false,
        };
        runtimes.set(this, state);
        activeRuntime = state;
        try {
            await custodyBarrier(state, 'start', limits.closeMs);
            emit('runtime-start', {
                runtimeId: state.id,
                exampleId: state.exampleId,
                mode: state.mode,
                kind: state.kind,
                viewport: state.viewport,
            });
            const result = await originalStart.apply(this, arguments);
            assertActive();
            if (!state.launch || state.processes.length !== 1)
                throw Error('ready without exactly one executable spawn');
            const remaining = limits.startupMs - (performance.now() - state.launch.started);
            const observation = await bounded(
                state.kind === 'ui-shell'
                    ? this.page.evaluate(async (selector) => {
                          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                          return {
                              frames: 2,
                              clock: 'DOM_REQUEST_ANIMATION_FRAME',
                              nativeEngineFrames: null,
                              domReady: document.readyState !== 'loading' && window.__benchReady === true,
                              selectorCount: document.querySelectorAll(selector).length,
                          };
                      }, spec.bench.uiSelector)
                    : this.page.evaluate(async () => {
                          const cc = await import('/build/cocosair.module.js');
                          return new Promise((resolve) => {
                              let frames = 0;
                              const onDraw = () => {
                                  if (++frames >= 2) {
                                      cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw);
                                      resolve({ frames, clock: 'NATIVE_PACER_EVENT_AFTER_DRAW' });
                                  }
                              };
                              cc.director.on(cc.Director.EVENT_AFTER_DRAW, onDraw);
                          });
                      }),
                remaining,
                'ready observation exceeds launch deadline',
            );
            if (!(observation?.frames >= 2)) throw Error('missing readiness frames');
            if (!cpuCase) {
                if (state.kind === 'ui-shell') {
                    if (!observation.domReady || !(observation.selectorCount > 0))
                        throw Error('UI shell DOM is not ready');
                } else if (observation.clock !== 'NATIVE_PACER_EVENT_AFTER_DRAW')
                    throw Error('missing native engine clock');
            }
            if (cpuCase !== 'missing-ready') {
                clearTimeout(state.startupTimer);
                emit('runtime-ready', {
                    ...observation,
                    runtimeId: state.id,
                    launchId: state.launch.id,
                    kind: state.kind,
                    clock: cpuCase ? 'CPU_DUMMY_NOT_RENDERING' : observation.clock,
                    launchElapsedMs: performance.now() - state.launch.started,
                });
            }
            return result;
        } catch (error) {
            emit('runtime-start-error', { runtimeId: state.id, error: String(error) });
            void abort(String(error));
            throw error;
        }
    };
    Runtime.prototype.stop = function observedStop() {
        const state = runtimes.get(this);
        if (!state) return originalStop.apply(this, arguments);
        if (state.stopPromise) return state.stopPromise;
        state.stopPromise = (async () => {
            const started = performance.now();
            emit('stop-begin', { runtimeId: state.id, launchId: state.launch?.id, deadlineMs: limits.closeMs });
            await bounded(callRawStop(state), limits.closeMs, 'runtime.stop exceeds close deadline');
            while (!physicalClosure(state) && performance.now() - started < limits.closeMs) await pause(10);
            if (!physicalClosure(state)) throw Error('stop lacks physical browser/server closure');
            await custodyBarrier(state, 'stop', limits.closeMs - (performance.now() - started));
            clearTimeout(state.startupTimer);
            state.closed = true;
            activeRuntime = null;
            emit('stop-complete', {
                runtimeId: state.id,
                launchId: state.launch?.id,
                durationMs: performance.now() - started,
                browserCount: state.processes.length,
                serverCount: state.servers.length,
            });
        })().catch((error) => {
            emit('runtime-stop-error', { runtimeId: state.id, error: String(error) });
            void abort(String(error));
            throw error;
        });
        return state.stopPromise;
    };
    Object.defineProperty(Runtime.prototype, '__exampleEvidenceWrapped', { value: true });
}
const nativeLoad = Module._load;
Module._load = function observedLoad(request) {
    const result = nativeLoad.apply(this, arguments);
    if (request === 'playwright' || request === 'playwright-core') {
        for (const name of ['chromium', 'firefox', 'webkit']) if (result[name]) instrumentLauncher(result[name]);
    }
    if (String(request).endsWith('browser-runtime.cjs') && result.BrowserRuntime)
        instrumentRuntime(result.BrowserRuntime);
    return result;
};
process.on('message', (message) => {
    if (message?.exampleEvidenceAbort) void abort(message.exampleEvidenceAbort);
});
const elapsedBeforeObserverMs = Date.now() - Date.parse(process.env.EXAMPLE_EVIDENCE_STARTED_AT);
const innerTimer = setTimeout(
    () => void abort('inner worker deadline'),
    Math.max(1, limits.innerMs - elapsedBeforeObserverMs),
);
innerTimer.unref();
process.on('beforeExit', () => {
    clearTimeout(innerTimer);
    if (completionSent) return;
    completionSent = true;
    const incomplete = [...runtimes.values()].filter((row) => !row.closed);
    if (fatal || incomplete.length || !runtimes.size) {
        emit('observer-incomplete', { fatal, incomplete: incomplete.map((row) => row.id) });
        process.exitCode = process.exitCode || 125;
    } else emit('observer-complete', { runtimeCount: runtimes.size });
    if (process.connected) process.disconnect();
});
process.channel?.unref();
emit('observer-start', {
    ...(diagnosticProfile === undefined ? {} : { diagnosticProfile }),
    limits,
    serverModel: 'HTTP server shares the physical collector worker PID',
    esbuildWorkerThreads: process.env.ESBUILD_WORKER_THREADS || null,
});
module.exports = { instrumentLauncher, instrumentRuntime, abort, limits };
