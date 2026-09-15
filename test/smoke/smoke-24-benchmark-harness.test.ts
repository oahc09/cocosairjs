/**
 * Smoke 24 — V0.6 Benchmark 基础设施：策略拒绝、命令沙箱、Trial 隔离、
 * Manual Driver 合同、patch 应用、eligible_trials 唯一语义（§16-43）。
 */
// jest 环境无 @types/node：最小环境声明（真实实现位于 tools/benchmark，经 ts-jest 运行）。
declare const process: { execPath: string; platform: string };
declare function require (id: string): any; // eslint-disable-line
const fs = require('fs');
const path = require('path');
const os = require('os');
import { Policy, PolicyDeniedError, PolicyConfig, IsolationLedger } from '../../tools/benchmark/runner/policy';
import { CommandSandbox } from '../../tools/benchmark/runner/sandbox';
import { TrialWorkspace } from '../../tools/benchmark/runner/workspace';
import { Harness } from '../../tools/benchmark/runner/harness';
import { applyPatch } from '../../tools/benchmark/runner/patch';
import { ManualAgentDriver } from '../../tools/benchmark/driver/manual-driver';
import { TrialRecord, aggregate, isEligible } from '../../tools/benchmark/runner/metrics';

const POLICY: PolicyConfig = {
    writablePaths: ['src'],
    readablePaths: ['docs-public'],
    protectedPaths: ['protected/reference'],
    allowedCommands: [
        { command: 'node', allowAnyArgs: false },
        { command: 'npm', allowAnyArgs: false },
    ],
    allowedPathRoots: [],
    allowedNetworkHosts: [],
};

function makeDir (files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-policy-'));
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
    }
    return dir;
}

describe('V0.6 §23/§30 — 策略拒绝与稳定错误码', () => {
    const root = makeDir({
        'src/main.ts': 'export {};',
        'docs-public/readme.md': 'public',
        'protected/reference/answer.ts': 'ANSWER',
    });
    const policy = new Policy(POLICY, root);

    test('受保护资源读 → PROTECTED_RESOURCE；不可见', () => {
        expect(() => policy.assertReadable('protected/reference/answer.ts')).toThrow(/PROTECTED|protected/);
        const err = (() => { try { policy.assertReadable('protected/reference/answer.ts'); } catch (e) { return e as PolicyDeniedError; } throw new Error('no throw'); })();
        expect(err.code).toBe('PROTECTED_RESOURCE');
    });

    test('可读范围外 → READ_NOT_ALLOWED；可读文件正常返回路径', () => {
        expect(() => policy.assertReadable('outside.txt')).toThrow(/READ_NOT_ALLOWED|readable/);
        expect(policy.assertReadable('docs-public/readme.md')).toContain('docs-public');
    });

    test('可写范围外 → WRITE_NOT_ALLOWED；受保护根写 → PROTECTED_RESOURCE', () => {
        const err1 = (() => { try { policy.assertWritable('docs-public/readme.md'); } catch (e) { return e as PolicyDeniedError; } throw new Error('no'); })();
        expect(err1.code).toBe('WRITE_NOT_ALLOWED');
        const err2 = (() => { try { policy.assertWritable('protected/reference/answer.ts'); } catch (e) { return e as PolicyDeniedError; } throw new Error('no'); })();
        expect(err2.code).toBe('PROTECTED_RESOURCE');
    });

    test('路径逃逸（../ 与盘符绝对路径）→ PATH_OUT_OF_SCOPE', () => {
        expect(() => policy.assertWritable('../outside.ts')).toThrow(/PATH_OUT_OF_SCOPE|escapes/);
        expect(() => policy.assertWritable('C:\\Windows\\system32\\x.ts')).toThrow(/PATH_OUT_OF_SCOPE|outside/);
        expect(() => policy.assertWritable('src/../../etc/passwd')).toThrow(/escapes|PATH_OUT_OF_SCOPE/);
    });

    test('§25-26：白名单外命令 / 默认禁止片段 / 参数逃逸 → COMMAND_NOT_ALLOWED', () => {
        expect(() => policy.assertCommand('bash', ['-c', 'rm -rf /'])).toThrow(/COMMAND_NOT_ALLOWED|allowlist/);
        // eval 风格 flag 等价任意代码执行：独立拒绝（先于片段检查）
        const evalErr = (() => { try { policy.assertCommand('node', ['-e', 'require("child_process")']); } catch (e) { return e as PolicyDeniedError; } throw new Error('no throw'); })();
        expect(evalErr.code).toBe('COMMAND_NOT_ALLOWED');
        expect(evalErr.message).toMatch(/eval-style/);
        expect(() => policy.assertCommand('npm', ['install', 'lodash'])).toThrow(/PATH_OUT_OF_SCOPE|allowed roots/);
        expect(policy.assertCommand('node', ['src/main.ts']).args).toEqual(['src/main.ts']);
    });

    test('§29：默认 offline；localhost 恒允许；未知主机 → NETWORK_NOT_ALLOWED', () => {
        const netErr = (() => { try { policy.assertNetworkHost('example.com'); } catch (e) { return e as PolicyDeniedError; } throw new Error('no throw'); })();
        expect(netErr.code).toBe('NETWORK_NOT_ALLOWED');
        expect(() => policy.assertNetworkHost('localhost')).not.toThrow();
        expect(() => policy.assertNetworkHost('127.0.0.1')).not.toThrow();
    });
});

describe('V0.6 §25-28 — 命令沙箱', () => {
    test('受控 node 命令执行并记录 PID/命令/退出码；超时进程被终止', async () => {
        const sandbox = new CommandSandbox(os.tmpdir());
        const ok = await sandbox.run(process.execPath, ['-e', 'console.log("v06-sandbox-ok")']);
        expect(ok.ok).toBe(true);
        expect(ok.stdout).toContain('v06-sandbox-ok');
        expect(ok.record.pid).not.toBeNull();

        const slow = await sandbox.run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 800 });
        expect(slow.timedOut).toBe(true);
        expect(slow.record.killed).toBe(true);
        await sandbox.dispose();
    });
});

describe('V0.6 §22/§24/§32 — Trial 隔离', () => {
    test('从 fixture 创建隔离 workspace；受保护文件篡改 → violations', () => {
        const fixture = makeDir({
            'src/main.ts': 'export const A = 1;',
        });
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-work-'));
        const ws = TrialWorkspace.create({
            workRoot,
            fixtureDir: fixture,
            policyConfig: POLICY,
            ledgerFiles: ['src/main.ts'],
        });
        expect(fs.existsSync(path.join(ws.paths.workspace, 'src', 'main.ts'))).toBe(true);
        // 无篡改
        expect(ws.isolationViolations()).toEqual([]);
        // 篡改台账内文件（模拟 Agent 改了 fixture 自带受保护文件）
        fs.writeFileSync(path.join(ws.paths.workspace, 'src', 'main.ts'), 'export const A = 2;', 'utf8');
        expect(ws.isolationViolations()).toEqual(['src/main.ts']);
    });

    test('IsolationLedger 检测 protected/ 目录改动', () => {
        const fixture = makeDir({ 'a.txt': 'a' });
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-work2-'));
        const ws = TrialWorkspace.create({ workRoot, fixtureDir: fixture, policyConfig: POLICY });
        fs.writeFileSync(path.join(ws.paths.protectedDir, 'reference.ts'), 'tampered', 'utf8');
        // protected/ 以整目录 manifest 跟踪：新增/修改/删除都会命中
        expect(ws.isolationViolations().some((f) => f.startsWith('../protected'))).toBe(true);
    });
});

describe('V0.6 §17 — Harness 动作执行与策略拒绝', () => {
    test('write-file 落盘；越权写被拒并计入 denials；runtime 通道未挂接 → 拒绝', async () => {
        const fixture = makeDir({ 'src/main.ts': 'export {};' });
        const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'v06-work3-'));
        const ws = TrialWorkspace.create({ workRoot, fixtureDir: fixture, policyConfig: POLICY });
        const harness = new Harness(ws, ws.policy);

        const write = await harness.execute({ type: 'write-file', path: 'src/new-file.ts', content: 'export const X = 1;\n' });
        expect(write.ok).toBe(true);
        expect(fs.readFileSync(path.join(ws.paths.workspace, 'src', 'new-file.ts'), 'utf8')).toContain('X = 1');

        const denied = await harness.execute({ type: 'read-file', path: 'protected/reference/answer.ts' });
        expect(denied.ok).toBe(false);
        expect(denialCode(denied.denial?.code)).toBe('PROTECTED_RESOURCE');
        expect(harness.denials.length).toBe(1);

        const runtime = await harness.execute({ type: 'request-runtime-inspection', query: { kind: 'inspectScene' } });
        expect(runtime.ok).toBe(false);
        expect(denialCode(runtime.denial?.code)).toBe('POLICY_DENIED');
        await harness.dispose();
    });

    test('patch-file：上下文匹配应用成功；上下文漂移即失败', async () => {
        expect(applyPatch('const a = 1;\nconst b = 2;\n', [
            '@@ -1,2 +1,2 @@',
            ' const a = 1;',
            '-const b = 2;',
            '+const b = 3;',
        ].join('\n'))).toBe('const a = 1;\nconst b = 3;\n');
        expect(() => applyPatch('const a = 9;\n', [
            '@@ -1,1 +1,1 @@',
            '-const a = 1;',
            '+const a = 2;',
        ].join('\n'))).toThrow(/context mismatch/);
    });

    test('ManualAgentDriver：脚本动作按合同流转并产出 transcript', async () => {
        const driver = new ManualAgentDriver('manual-test');
        const run = await driver.startTask({ task: {
            benchmarkId: 'B-TEST', prompt: 'demo', writablePaths: ['src'], readablePaths: [], knowledgePaths: [],
            repairBudget: 5, timeBudgetMs: 60000,
        }, requestNext: async () => ({ remainingRepairs: 5 }) });
        driver.script({ type: 'write-file', path: 'src/main.ts', content: 'x' });
        const action = await run.nextAction({ remainingRepairs: 5 });
        expect(action.type).toBe('write-file');
        await run.provideFeedback({
            compile: { success: true, diagnostics: [] }, runtime: { errors: [] },
            inspection: { scene: {}, nodes: [], assets: {} }, validation: [], visual: {}, policy: { denied: [] },
        });
        const result = await run.finish();
        expect(result.summary).toContain('manual');
        expect(driver.transcript()).toContain('next:write-file');
    });
});

describe('V0.6 §33-35 — eligible_trials 唯一语义', () => {
    const base = (): TrialRecord => ({
        manifest: manifestStub(), trialResult: 'VALID', engineResult: 'PASS', agentResult: 'FAIL',
        failureDomain: 'AGENT', repairs: 2, firstSubmissionCompilePass: false, policyDenials: [],
    });

    test('INFRA_FAILURE / INVALID_RUN / approved non-blocking SKIP 不进分母；其余 VALID 全进', () => {
        const infra = { ...base(), trialResult: 'INFRA_FAILURE' as const, failureDomain: 'INFRASTRUCTURE' as const };
        const invalid = { ...base(), trialResult: 'INVALID_RUN' as const, failureDomain: 'ISOLATION' as const };
        const approvedSkip = { ...base(), agentResult: 'SKIP' as const, approvedNonBlockingSkip: true, skip: { reason: 'approved', blocking: false } };
        const compileFail = { ...base(), failureReason: 'compile' };
        const policyFail = { ...base(), failureReason: 'policy-denied-exhausted' };
        const gaveUp = { ...base(), failureReason: 'gave-up' };
        expect(isEligible(infra)).toBe(false);
        expect(isEligible(invalid)).toBe(false);
        expect(isEligible(approvedSkip)).toBe(false);
        expect(isEligible(compileFail)).toBe(true);
        expect(isEligible(policyFail)).toBe(true);
        expect(isEligible(gaveUp)).toBe(true);
        const metrics = aggregate([infra, invalid, approvedSkip, compileFail, policyFail, gaveUp]);
        expect(metrics.eligibleTrials).toBe(3);
        expect(metrics.agentPass).toBe(0);
    });

    test('PASS 修复次数中位/均值与 budget exhaustion 率', () => {
        const trials = [
            { ...base(), agentResult: 'PASS' as const, repairs: 1, firstSubmissionCompilePass: true },
            { ...base(), agentResult: 'PASS' as const, repairs: 3, firstSubmissionCompilePass: false },
            { ...base(), agentResult: 'BUDGET_EXHAUSTED' as const, repairs: 5 },
        ];
        const m = aggregate(trials);
        expect(m.eligibleTrials).toBe(3);
        expect(m.agentFinalSuccessRate).toBeCloseTo(2 / 3);
        expect(m.medianRepairSuccessful).toBe(2);
        expect(m.meanRepairAllEligible).toBeCloseTo(3);
        expect(m.budgetExhaustionRate).toBeCloseTo(1 / 3);
        expect(m.firstCompileSuccessRate).toBeCloseTo(1 / 3);
    });
});

function denialCode (code: string | undefined): string {
    expect(code).toBeTruthy();
    return code as string;
}

function manifestStub () {
    return {
        cocosairRevision: 'test', benchmarkCatalogRevision: 'test', benchmarkId: 'B000', benchmarkVersion: '1',
        startingFixtureHash: 'x', referenceImplementationHash: 'y', os: os.platform(), browser: 'jsdom', viewport: '0x0',
        webglBackend: 'headless', agentProfile: 'A-TEST', knowledgeProfile: 'K0', allowedTools: [], allowedCommands: [],
        networkPolicy: 'offline', repairBudget: 5, timeBudgetMs: 60000, cacheMode: 'cold' as const, randomSeed: 0,
    };
}
