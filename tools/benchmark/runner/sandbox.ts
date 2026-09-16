/**
 * V0.6 §25-28 — Restricted Command Runner（Command Sandbox）。
 *
 * run-command 不是任意 Shell：默认 DENY，只有 Policy.allowlist 命令可执行；
 * 进程直接 spawn（不经 shell，杜绝 pipeline/重定向），记录 PID/命令/工作目录/
 * 起始时间/超时；Trial 结束按进程树清理，禁止后台进程污染下一个 Trial。
 */
import { spawn, ChildProcess } from 'child_process';
import { PolicyDeniedError } from './policy';

export interface CommandRecord {
    pid: number | null;
    command: string;
    args: string[];
    cwd: string;
    startedAt: string;
    timeoutMs: number;
    exitCode: number | null;
    killed: boolean;
    stdoutTail: string;
    stderrTail: string;
}

export interface CommandResult {
    ok: boolean;
    timedOut: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    record: CommandRecord;
}

const TAIL = 8000;

export class CommandSandbox {
    private readonly ledger: CommandRecord[] = [];
    private readonly live = new Set<ChildProcess>();

    constructor (private readonly cwdRoot: string) {}

    records (): CommandRecord[] {
        return [...this.ledger];
    }

    /**
     * 受控执行：仅接受白名单内命令（policy.assertCommand 已校验参数）。
     * shell 永远关闭 —— 管道/重定向/命令链天然不可达（§26）。
     */
    async run (command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<CommandResult> {
        const cwd = options.cwd ?? this.cwdRoot;
        const timeoutMs = options.timeoutMs ?? 120_000;
        const startedAt = new Date().toISOString();
        let child: ChildProcess;
        try {
            // detached：POSIX 下使子进程成为进程组 leader，进程组可整组终止（§28）
            // windowsHide + shell:false：无 shell 解析，参数数组直传
            child = spawn(command, args, {
                cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
                detached: process.platform !== 'win32',
            });
        } catch (error) {
            const record: CommandRecord = {
                pid: null, command, args, cwd, startedAt, timeoutMs,
                exitCode: null, killed: false, stdoutTail: '', stderrTail: String(error).slice(0, TAIL),
            };
            this.ledger.push(record);
            return { ok: false, timedOut: false, exitCode: null, stdout: '', stderr: String(error), record };
        }
        this.live.add(child);
        const record: CommandRecord = {
            pid: child.pid ?? null, command, args, cwd, startedAt, timeoutMs,
            exitCode: null, killed: false, stdoutTail: '', stderrTail: '',
        };
        this.ledger.push(record);

        const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; killed: boolean }>((resolve) => {
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let killed = false;
            const timer = setTimeout(() => {
                timedOut = true;
                killed = true;
                killTree(child);
            }, timeoutMs);
            child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
            child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
            child.on('error', (error) => {
                stderr += String(error);
                clearTimeout(timer);
                this.live.delete(child);
                resolve({ code: null, stdout, stderr, timedOut, killed });
            });
            child.on('exit', (code) => {
                clearTimeout(timer);
                this.live.delete(child);
                resolve({ code, stdout, stderr, timedOut, killed });
            });
        });
        record.exitCode = result.code;
        record.killed = result.killed;
        record.stdoutTail = result.stdout.slice(-TAIL);
        record.stderrTail = result.stderr.slice(-TAIL);
        return {
            ok: !result.timedOut && result.code === 0,
            timedOut: result.timedOut,
            exitCode: result.code,
            stdout: result.stdout,
            stderr: result.stderr,
            record,
        };
    }

    /** §28：Trial 结束清理——等待全部存活子进程树确认退出后才 resolve。 */
    async dispose (): Promise<void> {
        const pending: Promise<void>[] = [];
        for (const child of Array.from(this.live)) {
            pending.push(killTree(child));
            this.live.delete(child);
        }
        await Promise.all(pending);
    }
}

/** 进程树终止：POSIX 终止独立进程组；Windows taskkill /T /F 并等待其退出。 */
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
}

export { PolicyDeniedError };
