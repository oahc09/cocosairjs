'use strict';
const fs = require('fs'),
    cp = require('child_process'),
    path = require('path');
let browserExecutable = null;
function configureBrowserExecutable(executable) {
    if (!path.isAbsolute(executable)) throw Error('Browser executable must be an absolute path');
    if (rows.length) throw Error('Configure browser ownership before spawning owned processes');
    browserExecutable = path.normalize(executable);
}
const namespace = () => {
    try {
        return fs.readlinkSync('/proc/self/ns/pid');
    } catch {
        return null;
    }
};
function stat(pid) {
    try {
        const s = fs.readFileSync('/proc/' + pid + '/stat', 'utf8'),
            a = s.slice(s.lastIndexOf(')') + 2).split(' ');
        return { pid, state: a[0], ppid: +a[1], pgrp: +a[2], session: +a[3], startTicks: a[19] };
    } catch {
        return null;
    }
}
const rows = [],
    events = [],
    nativeSpawn = cp.spawn;
function emit(e) {
    const v = { ...e, utc: new Date().toISOString(), namespace: namespace() };
    events.push(v);
    if (process.connected) process.send({ reviewProcessEvent: v });
}
cp.spawn = function (command, args, options) {
    const child = nativeSpawn.apply(this, arguments);
    const role =
        browserExecutable && path.resolve(String(command)) === browserExecutable
            ? 'browser'
            : args?.some((x) => String(x).endsWith('/server.cjs') || String(x).endsWith('/tools/dev-server.py'))
              ? 'server'
              : 'other';
    if (role !== 'other') {
        const row = {
            role,
            pid: child.pid,
            command,
            args,
            detached: !!options?.detached,
            initial: stat(child.pid),
            exit: null,
            close: null,
        };
        rows.push(row);
        emit({ type: 'spawn', row: { ...row } });
        child.once('exit', (code, signal) => {
            row.exit = { code, signal, utc: new Date().toISOString() };
            emit({ type: 'exit', role, pid: child.pid, ...row.exit });
        });
        child.once('close', (code, signal) => {
            row.close = { code, signal, utc: new Date().toISOString() };
            emit({ type: 'close', role, pid: child.pid, ...row.close });
        });
    }
    return child;
};
function signal(row, sig) {
    const now = stat(row.pid);
    if (!now) {
        emit({ type: 'signal-skipped-already-absent', role: row.role, pid: row.pid });
        return;
    }
    if (row.initial && now.startTicks !== row.initial.startTicks) throw Error('PID identity changed; refusing signal');
    const target = row.detached && now.pgrp === row.pid ? -row.pid : row.pid;
    process.kill(target, sig);
    emit({ type: 'signal', role: row.role, pid: row.pid, target, signal: sig });
}
function groupMembers(row) {
    try {
        return fs
            .readdirSync('/proc')
            .filter((n) => /^\d+$/.test(n))
            .map((n) => stat(+n))
            .filter((s) => s && (s.pid === row.pid || (row.detached && s.pgrp === row.pid)));
    } catch {
        return [];
    }
}
module.exports = {
    configureBrowserExecutable,
    stat,
    namespace,
    rows,
    events,
    signal,
    groupMembers,
    snapshot: () => ({
        reviewerPID: process.pid,
        parentPID: process.ppid,
        namespace: namespace(),
        self: stat(process.pid),
        rows: rows.map((r) => ({ ...r, current: stat(r.pid), groupMembers: groupMembers(r) })),
        events: [...events],
    }),
};
