# -*- coding: utf-8 -*-
"""R6: sandbox process-tree termination done right."""
import io

p = 'tools/benchmark/runner/sandbox.ts'
s = io.open(p, encoding='utf-8').read()

old = """        let child: ChildProcess;
        try {
            // windowsHide + shell:false：无 shell 解析，参数数组直传
            child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });"""
new = """        let child: ChildProcess;
        try {
            // detached：POSIX 下使子进程成为进程组 leader，进程组可整组终止（§28）
            // windowsHide + shell:false：无 shell 解析，参数数组直传
            child = spawn(command, args, {
                cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
                detached: process.platform !== 'win32',
            });"""
assert old in s, 'spawn opts'
s = s.replace(old, new, 1)

old = """/** 进程树终止（Windows taskkill /T；POSIX 负进程组）。 */
function killTree (child: ChildProcess): void {
    if (child.pid === undefined || child.exitCode !== null) { return; }
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
        } else {
            try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        }
    } catch { /* 已退出 */ }
}"""
new = """/** 进程树终止：POSIX 终止独立进程组；Windows taskkill /T /F 并等待其退出。 */
function killTree (child: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
        if (child.pid === undefined || child.exitCode !== null) { resolve(); return; }
        let settled = false;
        const done = (): void => { if (!settled) { settled = true; resolve(); } };
        child.once('exit', done);
        try {
            if (process.platform === 'win32') {
                const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
                killer.once('exit', () => { /* taskkill 完成后再等 child exit */ });
                // 兜底：taskkill 后仍等 child 'exit'；超时强制 resolve
                setTimeout(done, 5000);
            } else {
                try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
                setTimeout(done, 2000);
            }
        } catch { done(); }
    });
}"""
assert old in s, 'killTree'
s = s.replace(old, new, 1)

old = """    /** §28：Trial 结束清理——停止全部存活子进程树。 */
    async dispose (): Promise<void> {
        for (const child of Array.from(this.live)) {
            killTree(child);
            this.live.delete(child);
        }
    }"""
new = """    /** §28：Trial 结束清理——等待全部存活子进程树确认退出后才 resolve。 */
    async dispose (): Promise<void> {
        const pending: Promise<void>[] = [];
        for (const child of Array.from(this.live)) {
            pending.push(killTree(child));
            this.live.delete(child);
        }
        await Promise.all(pending);
    }"""
assert old in s, 'dispose'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('sandbox ok')
