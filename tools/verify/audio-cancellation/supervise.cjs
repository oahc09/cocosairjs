'use strict';
const fs = require('fs'),
    path = require('path'),
    { spawn } = require('child_process');
const base = require('path').resolve(process.env.AUDIO_QA_OUT || 'output/audio-cancellation'),
    code = __dirname,
    tag = process.env.REVIEW_TAG;
if (!tag || !/^[a-z0-9-]+$/.test(tag)) throw Error('unique REVIEW_TAG required');
const test = process.env.SUPERVISOR_CPU_TEST === '1',
    full = process.env.FULL === '1',
    limit = test ? 1800 : 165000,
    forceAt = test ? 2600 : 173000,
    finalAt = test ? 4000 : 179000,
    events = [],
    known = new Map();
let child,
    exit,
    closed,
    force = false;
if (full) throw Error('Full campaigns forbidden in isolated diagnostic');
fs.mkdirSync(base, { recursive: true });
const stat = (pid) => {
    try {
        const s = fs.readFileSync('/proc/' + pid + '/stat', 'utf8'),
            a = s.slice(s.lastIndexOf(')') + 2).split(' ');
        return { pid, state: a[0], ppid: +a[1], pgrp: +a[2], startTicks: a[19] };
    } catch {
        return null;
    }
};
const ns = () => fs.readlinkSync('/proc/self/ns/pid');
const report = {
    started: new Date().toISOString(),
    supervisorPID: process.pid,
    namespace: ns(),
    kind: test
        ? 'CPU dummy processes, no browser'
        : full
          ? 'Stormpost Atlas full campaign'
          : 'isolated DOM audio cancellation candidate; real native and labelled rejection-injection contexts',
    limits: { abort: limit, force: forceAt, final: finalAt },
    events,
};
const file = path.join(base, tag + '-supervisor.json');
if (fs.existsSync(file)) throw Error('supervisor tag exists');
function save() {
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
}
function event(name, data = {}) {
    events.push({ name, utc: new Date().toISOString(), ...data });
    save();
    console.log(name, JSON.stringify(data));
}
function members(r) {
    return fs
        .readdirSync('/proc')
        .filter((n) => /^\d+$/.test(n))
        .map((n) => stat(+n))
        .filter((s) => s && (s.pid === r.pid || (r.detached && s.pgrp === r.pid)));
}
function killOwned(r, signal) {
    const live = stat(r.pid);
    if (live && r.initial && live.startTicks !== r.initial.startTicks) throw Error('PID changed; no kill');
    const list = members(r);
    if (!list.some((s) => s.state !== 'Z')) return;
    try {
        process.kill(r.detached ? -r.pid : r.pid, signal);
        event('owned-signal', { role: r.role, pid: r.pid, signal, members: list });
    } catch (e) {
        event('owned-signal-error', { pid: r.pid, error: String(e) });
    }
}
child = spawn(process.execPath, [path.join(code, test ? 'supervisor-cpu-child.cjs' : 'browser.cjs')], {
    detached: true,
    env: { ...process.env, REVIEW_SUPERVISED: '1' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
report.child = { pid: child.pid, initial: stat(child.pid) };
save();
const log = fs.createWriteStream(path.join(base, tag + '-console.log'), { flags: 'wx' });
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
child.on('message', (m) => {
    if (m.audioReady) {
        clearTimeout(startupWatchdog);
        event('startup-ready-with-frames');
    }
    const e = m.reviewProcessEvent;
    if (!e) return;
    if (e.type === 'spawn') known.set(e.row.pid, e.row);
    if (e.type === 'exit' && known.has(e.pid)) known.get(e.pid).observedExit = e;
    if (e.type === 'close' && known.has(e.pid)) known.get(e.pid).observedClose = e;
    event('child-process-event', e);
});
child.once('exit', (code, signal) => {
    exit = { code, signal, utc: new Date().toISOString() };
    report.child.exit = exit;
    event('reviewer-exit', exit);
});
child.once('close', (code, signal) => {
    closed = { code, signal, utc: new Date().toISOString() };
    report.child.close = closed;
    log.end();
    event('reviewer-stdio-closed', closed);
});
const startupWatchdog = test
    ? null
    : setTimeout(() => {
          event('external-startup-15s-expired');
          force = true;
          for (const r of known.values()) killOwned(r, 'SIGKILL');
          killOwned({ role: 'reviewer', pid: child.pid, detached: true, initial: report.child.initial }, 'SIGKILL');
      }, 15000);
const abort = setTimeout(() => {
    event('external-watchdog-abort', { limit });
    if (child.connected) child.send({ reviewAbort: 'external hard cap' });
}, limit);
const hard = setTimeout(() => {
    force = true;
    event('external-force-reclaim');
    for (const r of known.values()) killOwned(r, 'SIGKILL');
    killOwned({ role: 'reviewer', pid: child.pid, detached: true, initial: report.child.initial }, 'SIGKILL');
}, forceAt);
const timer = setInterval(() => {
    if (exit && closed) finish();
}, 80);
const final = setTimeout(() => {
    for (const r of known.values()) killOwned(r, 'SIGKILL');
    killOwned({ role: 'reviewer', pid: child.pid, detached: true, initial: report.child.initial }, 'SIGKILL');
    finish();
}, finalAt);
let done = false;
function finish() {
    if (done) return;
    done = true;
    clearTimeout(startupWatchdog);
    clearTimeout(abort);
    clearTimeout(hard);
    clearTimeout(final);
    clearInterval(timer);
    for (const r of known.values()) if (members(r).some((s) => s.state !== 'Z')) killOwned(r, 'SIGKILL');
    report.owned = [...known.values()].map((r) => ({ ...r, remaining: members(r) }));
    report.finalReviewer = stat(child.pid);
    report.ended = new Date().toISOString();
    report.forced = force;
    report.reviewerExitConfirmed = !!exit;
    report.browserExitConfirmed =
        report.owned.some((r) => r.role === 'browser') &&
        report.owned
            .filter((r) => r.role === 'browser')
            .every((r) => !!r.observedExit && !!r.observedClose && !r.remaining.some((s) => s.state !== 'Z'));
    report.serverExitConfirmed =
        report.owned.some((r) => r.role === 'server') &&
        report.owned
            .filter((r) => r.role === 'server')
            .every((r) => !!r.observedExit && !!r.observedClose && !r.remaining.some((s) => s.state !== 'Z'));
    report.browserStdioCloseConfirmed = report.owned
        .filter((r) => r.role === 'browser')
        .every((r) => !!r.observedClose);
    report.serverStdioCloseConfirmed = report.owned.filter((r) => r.role === 'server').every((r) => !!r.observedClose);
    report.noOwnedRunning =
        report.owned.every((r) => !r.remaining.some((s) => s.state !== 'Z')) && !report.finalReviewer;
    save();
    console.log(
        JSON.stringify({
            ended: report.ended,
            reviewerExitConfirmed: report.reviewerExitConfirmed,
            browserExitConfirmed: report.browserExitConfirmed,
            serverExitConfirmed: report.serverExitConfirmed,
            noOwnedRunning: report.noOwnedRunning,
        }),
    );
    process.exitCode =
        report.noOwnedRunning &&
        report.reviewerExitConfirmed &&
        report.browserExitConfirmed &&
        report.serverExitConfirmed
            ? test
                ? 0
                : exit?.signal || force
                  ? 1
                  : exit?.code || 0
            : 2;
}
