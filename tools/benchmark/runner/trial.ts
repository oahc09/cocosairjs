/**
 * V0.6 §6-15/§20-22 — Trial Runner：Reference/Agent 双 Track 编排。
 *
 * 两条 Track 共享 Starting Fixture / Validators / 能力与浏览器要求，使用不同实现：
 *  - Reference Track：冻结操作脚本（runtime-control）或冻结参考实现（Type B），
 *    Fresh Build + Fresh Runtime + Validators → engineResult。Agent 代码绝不参与。
 *  - Agent Track：仅在 Reference PASS/EXPECTED_FALLBACK 后启动；Driver 动作经
 *    Harness（策略拒绝计入 FeedbackPackage），每轮修改后 Fresh Build + Fresh
 *    Runtime → agentResult。
 *
 * Runtime 抽象：browser=true 走 Playwright Fresh Context；测试内用 InProcessRuntime。
 *Trial 顶层状态（§14）：
 *  VALID / INFRA_FAILURE（基础设施坏）/ INVALID_RUN（隔离突破，§32）。
 */
import { existsSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import { AgentAction, AgentDriver, FeedbackPackage } from '../driver/driver';
import { Harness, RuntimeChannel } from './harness';
import { FailureDomain, TrialRecord, RunManifest, AgentResult, EngineResult } from './metrics';
import { PolicyConfig } from './policy';
import { TrialWorkspace } from './workspace';
import { RuntimeSnapshot, runValidators, ValidatorResult } from '../validators';
import { BenchmarkDefinition } from '../catalog/schema';

/** Trial 运行时通道工厂：browser / in-process 由宿主注入（本模块不做 IO 假设）。 */
export interface TrialRuntime {
    /** 启动 Fresh Runtime（Fresh Browser Context + Fresh Scene + Fresh Session）。 */
    start (workspace: TrialWorkspace, benchmark: BenchmarkDefinition): Promise<RuntimeChannel & { snapshot (): Promise<RuntimeSnapshot> }>;
    stop (): Promise<void>;
}

export interface TrialOptions {
    benchmark: BenchmarkDefinition;
    workRoot: string;
    cocosairRevision: string;
    catalogRevision: string;
    agentProfile: string;
    environment: { os: string; browser: string; viewport: string; webglBackend: string };
    cacheMode: 'cold' | 'warm';
    randomSeed: number;
    fixtureDir: string;
    referenceDir?: string; // protected 挂载（Agent 不可见）
    runtime: TrialRuntime;
}

export interface TrackOutcome {
    trialResult: 'VALID' | 'INFRA_FAILURE' | 'INVALID_RUN';
    engineResult: EngineResult;
    agentResult: AgentResult;
    failureDomain: FailureDomain;
    failureReason?: string;
    repairs: number;
    firstSubmissionCompilePass: boolean;
    policyDenials: { action: string; code: string; message: string }[];
    validators: ValidatorResult[];
    /** 本 Trial 的隔离工作区（审计/取证用）。 */
    workspaceDir?: string;
}

export class TrialRunner {
    constructor (private readonly runtime: TrialRuntime) {}

    /** Reference Track（§7/§9/§11）。 */
    async runReference (options: TrialOptions): Promise<TrackOutcome> {
        const benchmark = options.benchmark;
        const policyConfig = this.policyConfig(benchmark);
        // fixture 缺失属基础设施故障，先于 workspace 创建检查
        if (!existsSync(options.fixtureDir)) {
            const missing = TrialWorkspace.create({
                workRoot: options.workRoot,
                fixtureDir: options.fixtureDir,
                policyConfig,
                skipFixtureCopy: true,
            });
            // §10：INFRA_FAILURE → engineResult/agentResult 均 NOT_EVALUATED
            return this.outcome(missing, options, 'INFRA_FAILURE', 'NOT_EVALUATED', 'NOT_EVALUATED', 'INFRASTRUCTURE', 'fixture missing', 0, false, []);
        }
        const workspace = TrialWorkspace.create({
            workRoot: options.workRoot,
            fixtureDir: options.fixtureDir,
            policyConfig,
        });
        try {
            // Type B（source-create/repair）：冻结参考实现替换 Agent 源码位（Fresh Source）
            if (benchmark.benchmarkType !== 'runtime-control' && benchmark.referenceImplementation && options.referenceDir) {
                const refFile = path.join(options.referenceDir, benchmark.referenceImplementation);
                if (!existsSync(refFile)) {
                    return this.outcome(workspace, options, 'INFRA_FAILURE', 'NOT_EVALUATED', 'NOT_EVALUATED', 'INFRASTRUCTURE', 'reference implementation missing', 0, false, []);
                }
                fs.copyFileSync(refFile, path.join(workspace.paths.workspace, 'src', 'main.ts'));
            }
            // 冻结操作脚本：由 Runner 以 Reference 身份执行（不经 Agent/Harness 策略——Reference 本身受 hash 保护）
            const channel = await this.safeStart(workspace, benchmark, options);
            if (!channel) {
                return this.outcome(workspace, options, 'INFRA_FAILURE', 'NOT_EVALUATED', 'NOT_EVALUATED', 'INFRASTRUCTURE', this.lastStartError || 'runtime start failed', 0, false, []);
            }
            // 冻结操作脚本：由 Runner 以 Reference 身份执行（§7——Agent 代码绝不参与 Engine Gate）
            if (benchmark.referenceOperations?.length) {
                if (!channel.executeReference) {
                    return this.outcome(workspace, options, 'INFRA_FAILURE', 'NOT_EVALUATED', 'NOT_EVALUATED', 'INFRASTRUCTURE', 'runtime lacks executeReference', 0, false, []);
                }
                for (const op of benchmark.referenceOperations) {
                    await channel.executeReference(op as Record<string, unknown>);
                }
            }
            const snapshot = await channel.snapshot();
            const results = runValidators([...benchmark.validators, ...(benchmark.visualValidators ?? [])], snapshot, benchmark.validatorParams);
            // 能力合同（§9）：环境确实缺能力（capability unsupported）时，与该能力对应的
            // 稳定错误码（如 decoder-required）属预期表现，不再计为运行时错误失败。
            const capUnsupported = snapshot.capability?.status === 'unsupported';
            const stableCode = snapshot.capability?.name === 'draco-decoder' ? /decoder-required/ : null;
            const effective = results.map((r) => {
                if (capUnsupported && stableCode && r.validatorId === 'no-runtime-error' && r.state === 'FAIL') {
                    const offending = snapshot.runtimeErrors.filter((e) => !stableCode.test(e.message));
                    if (offending.length === 0) { return { ...r, state: 'EXPECTED_UNSUPPORTED' as const, detail: 'stable decoder-required error verified' }; }
                }
                return r;
            });
            const allPass = effective.every((r) => r.state === 'PASS' || r.state === 'EXPECTED_UNSUPPORTED' || r.state === 'EXPECTED_FALLBACK');
            const engineResult: EngineResult = allPass
                ? (results.some((r) => r.state === 'EXPECTED_UNSUPPORTED') ? 'EXPECTED_UNSUPPORTED'
                    : results.some((r) => r.state === 'EXPECTED_FALLBACK') ? 'EXPECTED_FALLBACK' : 'PASS')
                : 'FAIL';
            await this.runtime.stop();
            return this.outcome(workspace, options, 'VALID', engineResult, 'NOT_EVALUATED',
                engineResult === 'FAIL' ? 'ENGINE' : 'NONE', undefined, 0, false, [], results);
        } catch (error) {
            await this.runtime.stop().catch(() => undefined);
            return this.outcome(workspace, options, 'INFRA_FAILURE', 'NOT_EVALUATED', 'NOT_EVALUATED', 'INFRASTRUCTURE', `reference harness: ${String(error)}`, 0, false, []);
        }
    }

    /** Agent Track（§12/§13/§20-22）：仅在 Reference PASS 后由调用方启动。 */
    async runAgent (options: TrialOptions, driver: AgentDriver): Promise<TrackOutcome> {
        const benchmark = options.benchmark;
        const policyConfig = this.policyConfig(benchmark);
        const workspace = TrialWorkspace.create({
            workRoot: options.workRoot,
            fixtureDir: options.fixtureDir,
            policyConfig,
        });
        const harness = new Harness(workspace, workspace.policy);
        let repairs = 0;
        let firstSubmissionCompilePass = false;
        let submitted = false;
        try {
            const run = await driver.startTask({
                requestNext: async () => ({ remainingRepairs: benchmark.repairBudget - repairs }),
                task: {
                    benchmarkId: benchmark.id,
                    prompt: benchmark.prompt,
                    writablePaths: benchmark.writablePaths,
                    readablePaths: benchmark.readablePaths,
                    knowledgePaths: this.knowledgePaths(benchmark),
                    repairBudget: benchmark.repairBudget,
                    timeBudgetMs: benchmark.timeBudgetMs,
                },
            });
            await run.submitTask({
                benchmarkId: benchmark.id,
                prompt: benchmark.prompt,
                writablePaths: benchmark.writablePaths,
                readablePaths: benchmark.readablePaths,
                knowledgePaths: this.knowledgePaths(benchmark),
                repairBudget: benchmark.repairBudget,
                timeBudgetMs: benchmark.timeBudgetMs,
            });

            let feedback: FeedbackPackage | null = null;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const action: AgentAction = await run.nextAction({
                    feedback: feedback ?? undefined,
                    remainingRepairs: benchmark.repairBudget - repairs,
                });
                if (action.type === 'finish') { await run.finish(); break; }

                const outcome = await harness.execute(action);
                // 源码修改类动作 = 一次提交（首轮提交统计 First Compile Success）
                if (action.type === 'write-file' || action.type === 'patch-file') {
                    if (!submitted) {
                        submitted = true;
                        // Fresh Build：提交后重建（本抽象内由 Runtime.start 代表 Fresh Runtime 周期）
                        const compile = await this.freshBuild(workspace);
                        firstSubmissionCompilePass = compile.success;
                        feedback = await this.evaluate(workspace, benchmark, options, compile, harness);
                        feedback.policy.denied = [...harness.denials];
                        await run.provideFeedback(feedback);
                        if (feedback.compile.success && feedback.validation.every((v) => v.state === 'PASS' || v.state === 'EXPECTED_FALLBACK' || v.state === 'EXPECTED_UNSUPPORTED')) {
                            await this.runtime.stop().catch(() => undefined);
                            await harness.dispose();
                            return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', 'PASS', 'NONE', undefined, repairs, firstSubmissionCompilePass, harness.denials, feedback.validation as ValidatorResult[]);
                        }
                        continue; // 等待下一动作（repair 或 finish）
                    }
                    // 后续提交 = 一次 Repair
                    repairs += 1;
                    if (repairs > benchmark.repairBudget) {
                        await run.provideFeedback(await this.evaluate(workspace, benchmark, options, { success: false, diagnostics: ['repair budget exhausted'] }, harness));
                        await this.runtime.stop().catch(() => undefined);
                        await harness.dispose();
                        return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', 'BUDGET_EXHAUSTED', 'AGENT', 'repair budget exhausted', repairs - 1, firstSubmissionCompilePass, harness.denials);
                    }
                    const compile = await this.freshBuild(workspace);
                    feedback = await this.evaluate(workspace, benchmark, options, compile, harness);
                    feedback.policy.denied = [...harness.denials];
                    await run.provideFeedback(feedback);
                    if (feedback.compile.success && feedback.validation.every((v) => v.state === 'PASS' || v.state === 'EXPECTED_FALLBACK' || v.state === 'EXPECTED_UNSUPPORTED')) {
                        await this.runtime.stop().catch(() => undefined);
                        await harness.dispose();
                        return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', 'PASS', 'NONE', undefined, repairs, firstSubmissionCompilePass, harness.denials, feedback.validation as ValidatorResult[]);
                    }
                    continue;
                }
                void outcome; // 观察类动作结果由 Driver 通过 runtime 通道直接读取（此处仅执行）
            }
            await this.runtime.stop().catch(() => undefined);
            await harness.dispose();
            const gaveUpSummary = 'agent finished';
            const stillFailing = feedback ? !feedback.validation.every((v) => v.state === 'PASS') : true;
            return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', stillFailing ? 'FAIL' : 'PASS', stillFailing ? 'AGENT' : 'NONE', stillFailing ? gaveUpSummary : undefined, repairs, firstSubmissionCompilePass, harness.denials, feedback?.validation as ValidatorResult[]);
        } catch (error) {
            await this.runtime.stop().catch(() => undefined);
            await harness.dispose();
            return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', 'FAIL', 'AGENT', String(error instanceof Error ? error.message : error), repairs, firstSubmissionCompilePass, harness.denials);
        }
    }

    /** Fresh Build 占位：源码级 TypeScript 语法校验（真实管线由 Browser Runtime 注入）。 */
    private async freshBuild (workspace: TrialWorkspace): Promise<{ success: boolean; diagnostics: string[] }> {
        // 标准 fixture 布局：src/main.ts（索引入口）；兼容根 main.ts
        const candidates = ['src/main.ts', 'main.ts'].map((rel) => path.join(workspace.paths.workspace, rel));
        const entry = candidates.find((p) => existsSync(p));
        if (!entry) { return { success: false, diagnostics: ['main.ts missing after submission'] }; }
        const source = fs.readFileSync(entry, 'utf8');
        // 括号/引号平衡的轻量语法探针：完整 tsc 由 BrowserRuntime 编译期完成
        const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
        const stack: string[] = [];
        let inStr: string | null = null;
        for (let i = 0; i < source.length; i++) {
            const ch = source[i];
            if (inStr) { if (ch === inStr && source[i - 1] !== '\\') { inStr = null; } continue; }
            if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
            if (ch === '(' || ch === '[' || ch === '{') { stack.push(ch); } else if (pairs[ch]) {
                if (stack.pop() !== pairs[ch]) { return { success: false, diagnostics: [`unbalanced '${ch}' at offset ${i}`] }; }
            }
        }
        if (stack.length > 0) { return { success: false, diagnostics: [`unclosed '${stack[stack.length - 1]}'`] }; }
        return { success: true, diagnostics: [] };
    }

    private async evaluate (workspace: TrialWorkspace, benchmark: BenchmarkDefinition, options: TrialOptions,
        compile: { success: boolean; diagnostics: string[] }, harness: Harness): Promise<FeedbackPackage> {
        if (!compile.success) {
            return {
                compile, runtime: { errors: [] }, inspection: { scene: null, nodes: [], assets: null },
                validation: [{ validatorId: 'compile', state: 'FAIL', detail: compile.diagnostics.join(';') }],
                visual: {}, policy: { denied: [...harness.denials] },
            };
        }
        const channel = await this.safeStart(workspace, benchmark, options);
        if (!channel) {
            return {
                compile: { success: false, diagnostics: ['runtime failed to start'] }, runtime: { errors: [] },
                inspection: { scene: null, nodes: [], assets: null }, validation: [], visual: {}, policy: { denied: [...harness.denials] },
            };
        }
        const snapshot = await channel.snapshot();
        const validation = runValidators([...benchmark.validators, ...(benchmark.visualValidators ?? [])], snapshot, benchmark.validatorParams);
        return {
            compile: { success: true, diagnostics: [] },
            runtime: { errors: snapshot.runtimeErrors },
            inspection: { scene: snapshot.scene, nodes: Object.values(snapshot.nodes), assets: snapshot.assets },
            validation,
            visual: snapshot.capture ? { screenshot: snapshot.capture.png } : {},
            policy: { denied: [...harness.denials] },
        };
    }

    private lastStartError: string | null = null;

    private async safeStart (workspace: TrialWorkspace, benchmark: BenchmarkDefinition, options: TrialOptions): Promise<(RuntimeChannel & { snapshot (): Promise<RuntimeSnapshot> }) | null> {
        try {
            void benchmark; void options;
            this.lastStartError = null;
            return await this.runtime.start(workspace, benchmark);
        } catch (error) {
            this.lastStartError = String(error instanceof Error ? error.message : error);
            return null;
        }
    }

    private knowledgePaths (_benchmark: BenchmarkDefinition): string[] {
        return []; // knowledgeProfile 具体文档由 Knowledge Pack 部署注入
    }

    private policyConfig (benchmark: BenchmarkDefinition): PolicyConfig {
        return {
            writablePaths: benchmark.writablePaths,
            readablePaths: benchmark.readablePaths,
            protectedPaths: benchmark.protectedPaths,
            allowedCommands: benchmark.allowedCommands,
            allowedPathRoots: benchmark.writablePaths,
            allowedNetworkHosts: benchmark.allowedNetworkHosts,
        };
    }

    private outcome (workspace: TrialWorkspace, options: TrialOptions, trialResult: TrackOutcome['trialResult'],
        engineResult: EngineResult, agentResult: AgentResult, failureDomain: FailureDomain, failureReason: string | undefined,
        repairs: number, firstSubmissionCompilePass: boolean, denials: { action: string; code: string; message: string }[],
        validators: ValidatorResult[] = []): TrackOutcome {
        const violations = workspace.isolationViolations();
        if (violations.length > 0) {
            return {
                trialResult: 'INVALID_RUN', engineResult: 'NOT_EVALUATED', agentResult: 'NOT_EVALUATED',
                failureDomain: 'ISOLATION', failureReason: `protected files tampered: ${violations.join(', ')}`,
                repairs, firstSubmissionCompilePass, policyDenials: denials, validators,
            };
        }
        void options;
        return { trialResult, engineResult, agentResult, failureDomain, failureReason, repairs, firstSubmissionCompilePass, policyDenials: denials, validators, workspaceDir: workspace.paths.workspace };
    }
}

/** Run Manifest 组装（§43）。 */
export function buildManifest (options: TrialOptions, benchmark: BenchmarkDefinition, fixtureHash: string, referenceHash: string): RunManifest {
    return {
        cocosairRevision: options.cocosairRevision,
        benchmarkCatalogRevision: options.catalogRevision,
        benchmarkId: benchmark.id,
        benchmarkVersion: benchmark.version,
        startingFixtureHash: fixtureHash,
        referenceImplementationHash: referenceHash,
        os: options.environment.os,
        browser: options.environment.browser,
        viewport: options.environment.viewport,
        webglBackend: options.environment.webglBackend,
        agentProfile: options.agentProfile,
        knowledgeProfile: benchmark.knowledgeProfile,
        allowedTools: benchmark.allowedTools,
        allowedCommands: benchmark.allowedCommands.map((c) => c.command),
        networkPolicy: benchmark.allowedNetworkHosts.length ? benchmark.allowedNetworkHosts.join(',') : 'offline',
        repairBudget: benchmark.repairBudget,
        timeBudgetMs: benchmark.timeBudgetMs,
        cacheMode: options.cacheMode,
        randomSeed: options.randomSeed,
    };
}
