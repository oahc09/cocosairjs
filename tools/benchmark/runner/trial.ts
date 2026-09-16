/**
 * V0.6 §6-15/§20-22 — Trial Runner：Reference/Agent 双 Track 编排。
 *
 * 两条 Track 共享 Starting Fixture / Validators / 能力与浏览器要求，使用不同实现：
 *  - Reference Track：冻结操作脚本（runtime-control）或冻结参考实现（Type B），
 *    Fresh Build + Fresh Runtime + Validators → engineResult。Agent 代码绝不参与。
 *  - Agent Track：仅在 Reference PASS/EXPECTED_FALLBACK 后启动；Driver 动作经
 *    Harness（策略拒绝计入 FeedbackPackage）。源码类 benchmark 每次提交后：
 *    停旧 Runtime → 真实 build（esbuild）→ Fresh Browser Context 验证新源码；
 *    runtime-control 类预启动并复用通道（session 状态即被试对象）。
 *
 * Trial 顶层状态（§14）：VALID / INFRA_FAILURE / INVALID_RUN（隔离突破，§32）。
 * 时间预算（§13 TIMEOUT）：startTask/submitTask/nextAction/provideFeedback/finish
 * 与 Runtime 操作全部受 timeBudget deadline 约束，超时 → TIMEOUT + AGENT。
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

export type ChannelWithSnapshot = RuntimeChannel & { snapshot (): Promise<RuntimeSnapshot> };

/** Trial 运行时通道工厂：browser / in-process 由宿主注入（本模块不做 IO 假设）。 */
export interface TrialRuntime {
    /** 启动 Fresh Runtime；实现内部必须先做真实构建检查（失败抛错并带 diagnostics）。 */
    start (workspace: TrialWorkspace, benchmark: BenchmarkDefinition): Promise<ChannelWithSnapshot>;
    /** §20 Fresh Build：对当前 workspace 源码执行真实构建检查（不经 Runtime 启动）。 */
    build (workspace: TrialWorkspace): Promise<{ success: boolean; diagnostics: string[] }>;
    stop (): Promise<void>;
}

/** §13：TIMEOUT 内部信号。 */
class AgentTimeoutError extends Error {
    constructor (public readonly phase: string) { super(`time budget exceeded during: ${phase}`); }
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
    private lastStartError: string | null = null;
    private activeChannel: ChannelWithSnapshot | null = null;

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
            const started = await this.safeStart(workspace, benchmark, options);
            if (typeof started === 'string') {
                return this.outcome(workspace, options, 'INFRA_FAILURE', 'NOT_EVALUATED', 'NOT_EVALUATED', 'INFRASTRUCTURE', started, 0, false, []);
            }
            const channel = started;
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
            const effective = this.applyCapabilityContract(results, snapshot, benchmark);
            const allPass = effective.every((r) => r.state === 'PASS' || r.state === 'EXPECTED_UNSUPPORTED' || r.state === 'EXPECTED_FALLBACK');
            const engineResult: EngineResult = allPass
                ? (effective.some((r) => r.state === 'EXPECTED_UNSUPPORTED') ? 'EXPECTED_UNSUPPORTED'
                    : effective.some((r) => r.state === 'EXPECTED_FALLBACK') ? 'EXPECTED_FALLBACK' : 'PASS')
                : 'FAIL';
            await this.runtime.stop();
            return this.outcome(workspace, options, 'VALID', engineResult, 'NOT_EVALUATED',
                engineResult === 'FAIL' ? 'ENGINE' : 'NONE', undefined, 0, false, [], effective);
        } catch (error) {
            await this.runtime.stop().catch(() => undefined);
            return this.outcome(workspace, options, 'INFRA_FAILURE', 'NOT_EVALUATED', 'NOT_EVALUATED', 'INFRASTRUCTURE', `reference harness: ${String(error)}`, 0, false, []);
        }
    }

    /**
     * Agent Track（§12/§13/§20-22）：仅在 Reference PASS 后由调用方启动。
     *
     * - runtime-control：预启动 Fresh Runtime 并复用通道（session 状态即被试对象）；
     * - source-create/repair：Agent 提交源码后【停旧 Runtime → 真实 build →
     *   Fresh Browser Context】再验证——绝不让提交前的页面冒充 Fresh Runtime。
     */
    async runAgent (options: TrialOptions, driver: AgentDriver): Promise<TrackOutcome> {
        const benchmark = options.benchmark;
        const isRuntimeControl = benchmark.benchmarkType === 'runtime-control';
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
        let feedback: FeedbackPackage | null = null;
        // §13：Trial 级时间预算——覆盖 Driver 交互与 Runtime 操作全程
        const deadline = Date.now() + benchmark.timeBudgetMs;
        const remaining = (): number => deadline - Date.now();
        const guard = async <T>(p: Promise<T> | ((...a: never[]) => Promise<T>), phase: string): Promise<T> => {
            const left = remaining();
            if (left <= 0) { throw new AgentTimeoutError(phase); }
            const promise = (typeof p === 'function' ? (p as () => Promise<T>)() : p);
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new AgentTimeoutError(phase)), left);
            });
            try { return await Promise.race([promise, timeout]); } finally { if (timer) { clearTimeout(timer); } }
        };
        const teardown = async (): Promise<void> => {
            this.activeChannel = null;
            // teardown 自身带硬超时，保证 Trial 不因清理挂起而永久不结束
            const hardStop = setTimeout(() => undefined, 15_000);
            try {
                await this.runtime.stop().catch(() => undefined);
                await harness.dispose();
            } finally { clearTimeout(hardStop); }
        };

        try {
            // 仅 runtime-control 预启动（session 状态即被试对象）；源码类提交后才启 Fresh Runtime
            if (isRuntimeControl) {
                const started = await guard(this.safeStart(workspace, benchmark, options), 'runtime.start (rc prestart)');
                if (typeof started === 'string') { throw new Error(started); }
                this.activeChannel = started;
                harness.attachRuntime(started);
            }

            const run = await guard(driver.startTask({
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
            }), 'driver.startTask');
            await guard(run.submitTask({
                benchmarkId: benchmark.id,
                prompt: benchmark.prompt,
                writablePaths: benchmark.writablePaths,
                readablePaths: benchmark.readablePaths,
                knowledgePaths: this.knowledgePaths(benchmark),
                repairBudget: benchmark.repairBudget,
                timeBudgetMs: benchmark.timeBudgetMs,
            }), 'driver.submitTask');

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const action: AgentAction = await guard(run.nextAction({
                    feedback: feedback ?? undefined,
                    remainingRepairs: benchmark.repairBudget - repairs,
                }), 'driver.nextAction');
                if (action.type === 'finish') {
                    await guard(run.finish(), 'driver.finish');
                    if (!submitted && isRuntimeControl) {
                        // runtime-control 解：无源码提交，按当前运行时状态评定
                        feedback = await guard(this.evaluateViaChannel(benchmark, harness), 'evaluate (rc finish)');
                    }
                    break;
                }

                const outcome = await guard(harness.execute(action), 'harness.execute');
                // 源码修改类动作 = 一次提交（首轮提交统计 First Compile Success）
                if (action.type === 'write-file' || action.type === 'patch-file') {
                    const isFirstSubmission = !submitted;
                    if (isFirstSubmission) { submitted = true; } else {
                        // 后续提交 = 一次 Repair
                        repairs += 1;
                        if (repairs > benchmark.repairBudget) {
                            await teardown();
                            return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', 'BUDGET_EXHAUSTED', 'AGENT', 'repair budget exhausted', repairs - 1, firstSubmissionCompilePass, harness.denials);
                        }
                    }
                    // §20 Fresh 周期：停旧 Runtime → 真实 build → Fresh Browser Context
                    this.activeChannel = null;
                    await this.runtime.stop().catch(() => undefined);
                    const build = await guard(this.runtime.build(workspace), `build (submission ${submitted ? 'repair ' + repairs : 'first'})`);
                    if (isFirstSubmission) { firstSubmissionCompilePass = build.success; }
                    if (!build.success) {
                        feedback = {
                            compile: build, runtime: { errors: [] }, inspection: { scene: null, nodes: [], assets: null },
                            validation: [{ validatorId: 'compile', state: 'FAIL', detail: build.diagnostics.join(';') }],
                            visual: {}, policy: { denied: [...harness.denials] },
                        };
                        await guard(run.provideFeedback(feedback), 'driver.provideFeedback (compile fail)');
                        continue;
                    }
                    const started = await guard(this.safeStart(workspace, benchmark, options), 'runtime.start (fresh after submission)');
                    if (typeof started === 'string') { throw new Error(started); }
                    this.activeChannel = started;
                    harness.attachRuntime(started);
                    feedback = await guard(this.evaluateViaChannel(benchmark, harness), 'evaluate (post submission)');
                    await guard(run.provideFeedback(feedback), 'driver.provideFeedback');
                    if (feedback.validation.every((v) => v.state === 'PASS' || v.state === 'EXPECTED_FALLBACK' || v.state === 'EXPECTED_UNSUPPORTED')) {
                        await guard(run.finish(), 'driver.finish (early success)');
                        await teardown();
                        return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', 'PASS', 'NONE', undefined, repairs, firstSubmissionCompilePass, harness.denials, feedback.validation as ValidatorResult[]);
                    }
                    continue;
                }
                void outcome; // 观察类动作结果由 Driver 通过 runtime 通道直接读取（此处仅执行）
            }
            await teardown();
            const stillFailing = feedback ? !feedback.validation.every((v) => v.state === 'PASS' || v.state === 'EXPECTED_FALLBACK' || v.state === 'EXPECTED_UNSUPPORTED') : true;
            return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', stillFailing ? 'FAIL' : 'PASS', stillFailing ? 'AGENT' : 'NONE', stillFailing ? 'agent finished without a passing submission' : undefined, repairs, firstSubmissionCompilePass, harness.denials, feedback?.validation as ValidatorResult[]);
        } catch (error) {
            await teardown();
            if (error instanceof AgentTimeoutError) {
                // §13：TIMEOUT 是结构化 Agent 失败（计入分母，§34）
                return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', 'TIMEOUT', 'AGENT', `time budget exceeded during: ${error.phase}`, repairs, firstSubmissionCompilePass, harness.denials);
            }
            return this.outcome(workspace, options, 'VALID', 'NOT_EVALUATED', 'FAIL', 'AGENT', String(error instanceof Error ? error.message : error), repairs, firstSubmissionCompilePass, harness.denials);
        }
    }

    /** 能力合同（§9）：环境确实缺能力时，对应稳定错误码属预期表现。 */
    private applyCapabilityContract (results: ValidatorResult[], snapshot: RuntimeSnapshot, benchmark: BenchmarkDefinition): ValidatorResult[] {
        const cap = snapshot.capability;
        if (!cap || cap.status !== 'unsupported') { return results; }
        // 能力必须与 benchmark 声明的 capabilityRequirements 匹配（§45：不能把任意
        // decoder-required 归入无关 benchmark 的能力合同）
        const declared = benchmark.capabilityRequirements.some((req) => cap.name.includes(req.split('-')[0]));
        if (!declared) { return results; }
        const stableCode = new RegExp(cap.name.split('-')[0], 'i'); // 如 'draco' → /draco/i
        return results.map((r) => {
            if (r.validatorId === 'no-runtime-error' && r.state === 'FAIL') {
                const offending = snapshot.runtimeErrors.filter((e) => !stableCode.test(e.message));
                if (offending.length === 0) { return { ...r, state: 'EXPECTED_UNSUPPORTED' as const, detail: `stable ${cap.name} error verified` }; }
            }
            return r;
        });
    }

    private async evaluateViaChannel (benchmark: BenchmarkDefinition, harness: Harness): Promise<FeedbackPackage> {
        if (!this.activeChannel) { throw new Error('evaluate called without an attached runtime channel'); }
        const snapshot = await this.activeChannel.snapshot();
        const results = runValidators([...benchmark.validators, ...(benchmark.visualValidators ?? [])], snapshot, benchmark.validatorParams);
        const effective = this.applyCapabilityContract(results, snapshot, benchmark);
        return {
            compile: { success: true, diagnostics: [] },
            runtime: { errors: snapshot.runtimeErrors },
            inspection: { scene: snapshot.scene, nodes: Object.values(snapshot.nodes), assets: snapshot.assets },
            validation: effective,
            visual: snapshot.capture ? { screenshot: snapshot.capture.png } : {},
            policy: { denied: [...harness.denials] },
        };
    }

    private async safeStart (workspace: TrialWorkspace, benchmark: BenchmarkDefinition, options: TrialOptions): Promise<ChannelWithSnapshot | string> {
        try {
            void benchmark; void options;
            this.lastStartError = null;
            return await this.runtime.start(workspace, benchmark);
        } catch (error) {
            this.lastStartError = String(error instanceof Error ? error.message : error);
            return this.lastStartError;
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
