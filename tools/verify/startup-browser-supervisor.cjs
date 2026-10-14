/* Own one browser probe and its real process receipts. Linux cloud checks use /proc identity.
 * --browser=chromium|webkit|firefox --out=<new.json> [--limit=300000]
 * --self-test=normal|timeout exercises child exit/close and forced recovery without GPU.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const option = (key) => process.argv.find((v) => v.startsWith(`--${key}=`))?.slice(key.length + 3);
const out = path.resolve(option('out') || '');
if (!option('out') || fs.existsSync(out)) throw Error('--out=<new.json> required');
fs.mkdirSync(path.dirname(out), { recursive: true });
const test = option('self-test');
const startupMs = test ? 300 : 15000;
const limitMs = test ? 1500 : Number(option('limit') || 300000);
const report = {
    started: new Date().toISOString(),
    supervisorPID: process.pid,
    startupMs,
    limitMs,
    selfTest: test || null,
    events: [],
    children: [],
};
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
const stat = (pid) => {
    try {
        const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const s = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
        return { pid, state: s[0], ppid: +s[1], pgrp: +s[2], startTicks: s[19] };
    } catch {
        return null;
    }
};
const members = (row) =>
    fs
        .readdirSync('/proc')
        .filter((f) => /^\d+$/.test(f))
        .map((f) => stat(+f))
        .filter((s) => s && (s.pid === row.pid || (row.detached && s.pgrp === row.pid)));
const event = (kind, data = {}) => {
    report.events.push({ kind, utc: new Date().toISOString(), ...data });
    save();
};
const known = new Map();
function kill(row) {
    const live = stat(row.pid);
    if (live && row.initial && live.startTicks !== row.initial.startTicks) throw Error('PID reused; refusing signal');
    if (!members(row).some((s) => s.state !== 'Z')) return;
    try {
        process.kill(row.detached ? -row.pid : row.pid, 'SIGKILL');
        event('killed-owned-group', { pid: row.pid });
    } catch (e) {
        if (e.code !== 'ESRCH') event('kill-error', { error: String(e) });
    }
}
const args = test
    ? [
          '-e',
          test === 'normal'
              ? 'process.send({browserReady:true}); setTimeout(()=>process.exit(0),30)'
              : 'setInterval(()=>{},1000)',
      ]
    : [path.join(__dirname, 'startup-browser.cjs'), ...process.argv.slice(2)];
const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, AIR_STARTUP_SUPERVISED: '1' },
});
const own = { pid: child.pid, detached: true, initial: stat(child.pid) };
report.child = own;
report.namespace = fs.readlinkSync('/proc/self/ns/pid');
const log = fs.createWriteStream(out.replace(/\.json$/, '') + '.log', { flags: 'wx' });
child.stdout.pipe(log);
child.stderr.pipe(log);
let startup, overall, finishTimer;
function abort(reason) {
    if (!report.aborted) {
        report.aborted = reason;
        event('abort', { reason });
    }
    for (const row of known.values()) kill(row);
    kill(own);
}
startup = setTimeout(() => abort('15-second-browser-startup-watchdog'), startupMs);
overall = setTimeout(() => abort('bounded-probe-watchdog'), limitMs);
child.on('message', (message) => {
    if (message.browserReady) {
        clearTimeout(startup);
        event('browser-ready');
    }
    if (message.processEvent) {
        const e = message.processEvent;
        if (e.type === 'spawn') known.set(e.row.pid, e.row);
        if ((e.type === 'exit' || e.type === 'close') && known.has(e.pid)) known.get(e.pid)[e.type] = e;
        event('browser-process', e);
    }
});
child.once('exit', (code, signal) => {
    report.exit = { code, signal };
    event('child-exit', report.exit);
});
child.once('close', (code, signal) => {
    report.close = { code, signal };
    event('child-close', report.close);
    finishTimer = setTimeout(finish, 100);
});
function finish() {
    clearTimeout(startup);
    clearTimeout(overall);
    clearTimeout(finishTimer);
    for (const row of known.values()) kill(row);
    report.children = [...known.values()].map((row) => ({ ...row, remaining: members(row) }));
    report.remaining = members(own);
    report.ended = new Date().toISOString();
    report.realExitAndClose = !!report.exit && !!report.close;
    report.noOwnedRunning =
        !report.remaining.some((s) => s.state !== 'Z') &&
        report.children.every((r) => !r.remaining.some((s) => s.state !== 'Z'));
    report.browserExitAndClose = test
        ? null
        : report.children.length > 0 && report.children.every((r) => !!r.exit && !!r.close);
    report.ok =
        report.realExitAndClose &&
        report.noOwnedRunning &&
        (test === 'timeout'
            ? !!report.aborted
            : !report.aborted && report.exit.code === 0 && (!!test || report.browserExitAndClose));
    save();
    console.log(
        JSON.stringify({
            ok: report.ok,
            out,
            exit: report.exit,
            realExitAndClose: report.realExitAndClose,
            noOwnedRunning: report.noOwnedRunning,
            browserExitAndClose: report.browserExitAndClose,
        }),
    );
    process.exitCode = report.ok ? 0 : 1;
}
save();
