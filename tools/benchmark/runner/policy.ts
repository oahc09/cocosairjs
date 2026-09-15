/**
 * V0.6 §23/§24/§30 — Benchmark 策略与拒绝合同。
 *
 * 拒绝是稳定错误码（POLICY_DENIED + 细分码），Trial 仍然 VALID；
 * 只有 §32 的隔离真实被突破才 INVALID_RUN（由 Isolation Ledger 判定，见 workspace.ts）。
 */
import * as fs from 'fs';
import * as path from 'path';

export type PolicyCode =
    | 'POLICY_DENIED'
    | 'PATH_OUT_OF_SCOPE'
    | 'COMMAND_NOT_ALLOWED'
    | 'NETWORK_NOT_ALLOWED'
    | 'PROTECTED_RESOURCE'
    | 'READ_NOT_ALLOWED'
    | 'WRITE_NOT_ALLOWED';

export class PolicyDeniedError extends Error {
    constructor (public readonly code: PolicyCode, message: string) {
        super(message);
        this.name = 'PolicyDeniedError';
    }
}

export interface PolicyConfig {
    /** 可写根（相对 trial workspace）。 */
    writablePaths: string[];
    /** 可读根（相对 trial workspace；可写根自动可读）。 */
    readablePaths: string[];
    /** 受保护根：完全不可见或只读审计（相对 trial workspace）。 */
    protectedPaths: string[];
    /** 允许的命令（可执行名 + 是否允许任意参数）。 */
    allowedCommands: { command: string; allowAnyArgs: boolean }[];
    /** 命令参数允许进入的根（工作区 + 这些根之外一律拒绝）。 */
    allowedPathRoots: string[];
    /** 允许的网络主机；空 = offline/localhost-only。 */
    allowedNetworkHosts: string[];
}

/** eval 风格 flag = 任意代码执行等价物，与任意 Shell 同级禁止（§26）。 */
const EVAL_STYLE_FLAGS = new Set(['-e', '--eval', '-p', '--print', '-c', '--command', '--exec']);

const DEFAULT_DENY_COMMAND_FRAGMENTS = [
    'git reset', 'git clean', 'git checkout', 'git commit', 'git push',
    'rm ', 'rmdir', 'del ', 'kill ', 'curl', 'wget', 'Invoke-WebRequest',
    'powershell', 'cmd ', 'bash', 'sh ', '&', '|', '>', '<', ';', '`', '$(',
];

/** 路径归一化并校验落在 root 内（拒绝 ../、绝对路径逃逸、盘符切换）。 */
export function resolveWithin (root: string, target: string): string {
    if (path.isAbsolute(target) && !target.startsWith(root)) {
        // 绝对路径仅当其本来就在 root 内才接受
        const resolved = path.resolve(target);
        if (resolved.startsWith(root + path.sep) || resolved === root) { return resolved; }
        throw new PolicyDeniedError('PATH_OUT_OF_SCOPE', `absolute path outside workspace: ${target}`);
    }
    if (/^[a-zA-Z]:/.test(target)) {
        throw new PolicyDeniedError('PATH_OUT_OF_SCOPE', `drive-qualified path outside workspace: ${target}`);
    }
    const resolved = path.resolve(root, target);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new PolicyDeniedError('PATH_OUT_OF_SCOPE', `path escapes workspace: ${target}`);
    }
    return resolved;
}

function withinAny (resolved: string, roots: string[]): boolean {
    return roots.some((r) => resolved === r || resolved.startsWith(r + path.sep));
}

export class Policy {
    constructor (readonly config: PolicyConfig, private readonly workspaceRoot: string) {}

    private abs (rel: string): string {
        return resolveWithin(this.workspaceRoot, rel);
    }

    private roots (paths: string[]): string[] {
        return paths.map((p) => this.abs(p));
    }

    /** 读校验：受保护根完全不可见；可读根之外 READ_NOT_ALLOWED。 */
    assertReadable (relPath: string): string {
        const resolved = this.abs(relPath);
        if (withinAny(resolved, this.roots(this.config.protectedPaths))) {
            throw new PolicyDeniedError('PROTECTED_RESOURCE', `protected path is not readable: ${relPath}`);
        }
        if (!withinAny(resolved, this.roots(this.config.readablePaths)) && !withinAny(resolved, this.roots(this.config.writablePaths))) {
            throw new PolicyDeniedError('READ_NOT_ALLOWED', `path outside readable scope: ${relPath}`);
        }
        return resolved;
    }

    /** 写校验：可写根之外一律拒绝；受保护根 WRITE_NOT_ALLOWED。 */
    assertWritable (relPath: string): string {
        const resolved = this.abs(relPath);
        if (withinAny(resolved, this.roots(this.config.protectedPaths))) {
            throw new PolicyDeniedError('PROTECTED_RESOURCE', `protected path is not writable: ${relPath}`);
        }
        if (!withinAny(resolved, this.roots(this.config.writablePaths))) {
            throw new PolicyDeniedError('WRITE_NOT_ALLOWED', `path outside writable scope: ${relPath}`);
        }
        return resolved;
    }

    /** §25-27：命令白名单 + 参数归一化校验 + 默认禁止片段。 */
    assertCommand (command: string, args: string[] = []): { command: string; args: string[] } {
        const entry = this.config.allowedCommands.find((c) => c.command === command);
        if (!entry) {
            throw new PolicyDeniedError('COMMAND_NOT_ALLOWED', `command not in allowlist: ${command}`);
        }
        const raw = [command, ...args].join(' ');
        for (const flag of args) {
            if (EVAL_STYLE_FLAGS.has(flag)) {
                throw new PolicyDeniedError('COMMAND_NOT_ALLOWED', `eval-style flag is not allowed: ${flag} (equivalent to arbitrary code execution)`);
            }
        }
        for (const fragment of DEFAULT_DENY_COMMAND_FRAGMENTS) {
            if (raw.includes(fragment)) {
                throw new PolicyDeniedError('COMMAND_NOT_ALLOWED', `forbidden fragment '${fragment.trim()}' in: ${raw}`);
            }
        }
        if (!entry.allowAnyArgs) {
            for (const arg of args) {
                // 参数要么是 flag（- 开头），要么必须落在允许根内
                if (arg.startsWith('-')) { continue; }
                const resolved = this.abs(arg);
                if (!withinAny(resolved, this.roots(this.config.allowedPathRoots.length ? this.config.allowedPathRoots : this.config.writablePaths))) {
                    throw new PolicyDeniedError('PATH_OUT_OF_SCOPE', `command argument outside allowed roots: ${arg}`);
                }
            }
        }
        return { command, args };
    }

    /** §29：网络默认 offline/localhost-only。 */
    assertNetworkHost (host: string): void {
        if (host === 'localhost' || host === '127.0.0.1') { return; }
        if (!this.config.allowedNetworkHosts.includes(host)) {
            throw new PolicyDeniedError('NETWORK_NOT_ALLOWED', `network host not allowed: ${host}`);
        }
    }
}

/** Isolation Ledger：受保护文件 hash 台账（§24/§32 结束时补充审计）。 */
export class IsolationLedger {
    private readonly baseline = new Map<string, string>();
    private readonly dirBaselines = new Map<string, string>();

    constructor (workspaceRoot: string, private readonly files: string[], private readonly protectedRoots: string[]) {
        this.workspaceRoot = workspaceRoot;
        for (const rel of files) {
            const abs = path.resolve(this.workspaceRoot, rel);
            this.baseline.set(rel, fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : '<missing>');
        }
        for (const dir of protectedRoots) {
            this.dirBaselines.set(dir, this.dirManifest(dir));
        }
    }

    private workspaceRoot: string;

    private dirManifest (dir: string): string {
        const abs = path.resolve(this.workspaceRoot, dir);
        if (!fs.existsSync(abs)) { return '<missing-dir>'; }
        const entries: string[] = [];
        const walk = (current: string, prefix: string): void => {
            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) { walk(path.join(current, entry.name), rel); } else {
                    entries.push(`${rel}:${sha256(fs.readFileSync(path.join(current, entry.name)))}`);
                }
            }
        };
        walk(abs, '');
        entries.sort();
        return entries.join('|') || '<empty-dir>';
    }

    /** 返回被篡改/新增/删除的受保护条目；空 = 通过。 */
    violations (): string[] {
        const changed: string[] = [];
        for (const [rel, expected] of this.baseline) {
            const abs = path.resolve(this.workspaceRoot, rel);
            const actual = fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : '<missing>';
            if (actual !== expected) { changed.push(rel); }
        }
        for (const [dir, expected] of this.dirBaselines) {
            if (this.dirManifest(dir) !== expected) { changed.push(`${dir}/*`); }
        }
        return changed;
    }
}

import { createHash } from 'crypto';
export function sha256 (data: fs.PathOrFileDescriptor | Buffer | string): string {
    const buf = typeof data === 'string' || !Buffer.isBuffer(data) ? fs.readFileSync(data as fs.PathOrFileDescriptor) : data;
    return createHash('sha256').update(buf).digest('hex');
}
