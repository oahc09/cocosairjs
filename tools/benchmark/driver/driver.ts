/**
 * V0.6 §16/§17 — Provider-neutral Agent Driver 合同。
 *
 * Driver 不绑定任何 LLM Provider（OpenAI/Claude/Gemini/Codex 禁止出现在核心合同）；
 * Provider Adapter（tools/benchmark/providers/）未来实现同一合同接入具体模型。
 * 所有 Agent Action 都必须经 Harness 执行（策略拒绝也是 Harness 的输出，不是 Driver 的）。
 */

/** §17：Agent 可请求的全部动作类型。 */
export type AgentActionType =
    | 'read-file'
    | 'write-file'
    | 'patch-file'
    | 'run-command'
    | 'request-runtime-inspection'
    | 'request-frame-capture'
    | 'request-error-report'
    | 'finish';

export interface AgentActionBase {
    type: AgentActionType;
}
export interface ReadFileAction extends AgentActionBase {
    type: 'read-file';
    path: string;
}
export interface WriteFileAction extends AgentActionBase {
    type: 'write-file';
    path: string;
    content: string;
}
export interface PatchFileAction extends AgentActionBase {
    type: 'patch-file';
    path: string;
    /** 统一 diff（unified diff），由 Harness 应用。 */
    diff: string;
}
export interface RunCommandAction extends AgentActionBase {
    type: 'run-command';
    command: string;
    args?: string[];
    timeoutMs?: number;
}
export interface RequestRuntimeInspectionAction extends AgentActionBase {
    type: 'request-runtime-inspection';
    /** inspection 请求负载（inspectScene/inspectNode/inspectAsset…），由 Harness 转发。 */
    query: Record<string, unknown>;
}
export interface RequestFrameCaptureAction extends AgentActionBase {
    type: 'request-frame-capture';
}
export interface RequestErrorReportAction extends AgentActionBase {
    type: 'request-error-report';
    since?: number;
    limit?: number;
}
export interface FinishAction extends AgentActionBase {
    type: 'finish';
    summary?: string;
}
export type AgentAction =
    | ReadFileAction
    | WriteFileAction
    | PatchFileAction
    | RunCommandAction
    | RequestRuntimeInspectionAction
    | RequestFrameCaptureAction
    | RequestErrorReportAction
    | FinishAction;

/** §21：Feedback Package——结构化，禁止只传 Console 文本。 */
export interface FeedbackPackage {
    compile: { success: boolean; diagnostics: string[] };
    runtime: { errors: unknown[] };
    inspection: { scene: unknown; nodes: unknown[]; assets: unknown };
    validation: { validatorId: string; state: string; detail?: string }[];
    visual: { screenshot?: string; diff?: unknown };
    policy: { denied: { action: string; code: string; message: string }[] };
}

/** §16：Driver 上下文与任务载荷（不含任何受保护资源）。 */
export interface DriverTask {
    benchmarkId: string;
    prompt: string;
    writablePaths: string[];
    readablePaths: string[];
    /** 知识包（K0–K3）按 knowledgeProfile 提供的文档路径列表。 */
    knowledgePaths: string[];
    repairBudget: number;
    timeBudgetMs: number;
}
export interface DriverContext {
    task: DriverTask;
    /** Harness 注入的下一动作入口（Driver 不得绕过）。 */
    requestNext: () => Promise<DriverInput>;
}
export interface DriverInput {
    feedback?: FeedbackPackage;
    /** 剩余修复次数（Budget 语义由 Runner 唯一裁定）。 */
    remainingRepairs: number;
}
export interface AgentRunResult {
    /** Driver 自评：finish 的原因（最终结果由 Runner 依据 Validator 裁定）。 */
    summary: string;
    /** Driver 声明放弃（计入分母，§34）。 */
    gaveUp?: boolean;
}
export interface AgentRun {
    submitTask (task: DriverTask): Promise<void>;
    nextAction (input: DriverInput): Promise<AgentAction>;
    provideFeedback (feedback: FeedbackPackage): Promise<void>;
    finish (): Promise<AgentRunResult>;
}
export interface AgentDriver {
    readonly id: string;
    startTask (context: DriverContext): Promise<AgentRun>;
}

/** 无效动作（Driver 合同违约）：Runner 侧也视作可反馈错误。 */
export class DriverContractError extends Error {}
