/**
 * V0.6 §22/§24/§32 — Trial Workspace 与隔离。
 *
 * 每 Trial 独立 run-<uuid>/，从 Immutable Starting Fixture 重建
 * Fresh Files / Fresh Build State（Fresh Browser Context / Fresh Scene / Fresh
 * Agent Session / Fresh RequestId 由 Trial Runner 负责）；受保护文件以 SHA-256
 * 台账做结束审计（隔离审计是补充机制，不是唯一防线）。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IsolationLedger, Policy, PolicyConfig } from './policy';
void crypto;

export interface TrialPaths {
    runRoot: string;       // work/run-<uuid>/
    workspace: string;     // runRoot/workspace（Agent 可写树的根）
    protectedDir: string;  // runRoot/protected/（Agent 完全不可见，由 Runner 挂载 validators/reference）
    manifestFile: string;  // runRoot/manifest.json
}

export class TrialWorkspace {
    readonly paths: TrialPaths;
    readonly policy: Policy;
    private ledger: IsolationLedger;

    private constructor (paths: TrialPaths, policy: Policy, ledger: IsolationLedger) {
        this.paths = paths;
        this.policy = policy;
        this.ledger = ledger;
    }

    /** 从 Immutable Fixture 创建隔离 Trial（fixture 只读复制）。 */
    static create (options: {
        workRoot: string;
        fixtureDir: string;
        policyConfig: PolicyConfig;
        /** 额外纳入隔离台账的 workspace 相对文件（例如 fixture 自带文件的清单）。 */
        ledgerFiles?: string[];
        /** 基础设施故障路径：不复制 fixture（fixture 本身缺失/损坏）。 */
        skipFixtureCopy?: boolean;
    }): TrialWorkspace {
        const runId = `run-${crypto.randomUUID()}`;
        const runRoot = path.join(options.workRoot, runId);
        const workspace = path.join(runRoot, 'workspace');
        const protectedDir = path.join(runRoot, 'protected');
        fs.mkdirSync(workspace, { recursive: true });
        fs.mkdirSync(protectedDir, { recursive: true });
        if (!options.skipFixtureCopy) { copyTree(options.fixtureDir, workspace); }

        const policy = new Policy(options.policyConfig, workspace);
        const ledgerFiles = options.ledgerFiles ?? [];
        // 台账：workspace 内受保护文件逐个跟踪 + protected/ 整目录 manifest（含新增文件检测）
        // 台账根：fixture 拷贝进 workspace 的受保护树（若有）+ Runner 挂载的 protected/ 目录
        const ledgerRoots = fs.existsSync(path.join(workspace, 'protected')) ? ['protected'] : [];
        const ledger = new IsolationLedger(workspace, ledgerFiles, [...ledgerRoots, '../protected']);
        return new TrialWorkspace({ runRoot, workspace, protectedDir, manifestFile: path.join(runRoot, 'manifest.json') }, policy, ledger);
    }

    /** §32：结束审计——受保护文件被篡改 = ISOLATION 突破。 */
    isolationViolations (): string[] {
        return this.ledger.violations();
    }
}

function copyTree (from: string, to: string): void {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, entry.name);
        const dst = path.join(to, entry.name);
        if (entry.isDirectory()) { copyTree(src, dst); } else { fs.copyFileSync(src, dst); }
    }
}

function listFilesRelative (dir: string, prefix = ''): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { out.push(...listFilesRelative(path.join(dir, entry.name), rel)); } else { out.push(rel); }
    }
    return out;
}

export { sha256 } from './policy';
